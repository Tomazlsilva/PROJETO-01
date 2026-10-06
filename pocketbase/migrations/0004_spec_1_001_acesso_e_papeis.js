// SPEC-1-001 — Acesso e papéis
// Sessão máxima de 8h, token de recuperação de 15 min, senha mínima de 12,
// autorização no servidor por papel, auditoria administrativa e coleções mínimas
// (projetos e revisões) para aplicar a matriz papel × ação.
migrate(
  (app) => {
    // Condição comum: autenticado, conta ativa e sessão dentro das 8h
    const A =
      "@request.auth.id != '' && @request.auth.active = true && @request.auth.session_expires_at > @now"

    // ---------- users ----------
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    if (!users.fields.getByName('failed_window_start')) {
      users.fields.add(new DateField({ name: 'failed_window_start', hidden: true }))
    }
    if (!users.fields.getByName('session_expires_at')) {
      users.fields.add(new DateField({ name: 'session_expires_at' }))
    }
    users.fields.getByName('password').min = 12
    users.authToken.duration = 28800 // 8 horas
    users.passwordResetToken.duration = 900 // 15 minutos
    users.authRule = 'active = true'
    users.manageRule = "@request.auth.role = 'admin' && @request.auth.active = true"
    users.listRule = A + " && (id = @request.auth.id || @request.auth.role = 'admin')"
    users.viewRule = A + " && (id = @request.auth.id || @request.auth.role = 'admin')"
    // o hook users_create_policy exige papel admin e devolve 403 auditado
    users.createRule = A
    users.updateRule = A + " && (id = @request.auth.id || @request.auth.role = 'admin')"
    users.deleteRule = null // contas nunca são apagadas: revogação preserva a autoria
    app.save(users)

    // ---------- auth_audit (append-only) ----------
    const audit = app.findCollectionByNameOrId('auth_audit')
    if (!audit.fields.getByName('details')) {
      audit.fields.add(new JSONField({ name: 'details', maxSize: 4000 }))
    }
    audit.listRule = A + " && @request.auth.role = 'admin'"
    audit.viewRule = A + " && @request.auth.role = 'admin'"
    audit.createRule = null
    audit.updateRule = null
    audit.deleteRule = null
    audit.addIndex('idx_auth_audit_target', false, 'target_id, created', '')
    audit.addIndex('idx_auth_audit_actor', false, 'actor_id, created', '')
    app.save(audit)

    // ---------- projetos (mínimo para a matriz; SPEC-1-002 amplia) ----------
    const vis =
      A +
      " && (@request.auth.role = 'admin' || @request.auth.role = 'executivo' || coordenador = @request.auth.id || membros.id ?= @request.auth.id)"
    const projetos = new Collection({
      name: 'projetos',
      type: 'base',
      listRule: vis,
      viewRule: vis,
      createRule:
        A +
        " && (@request.auth.role = 'admin' || (@request.auth.role = 'coordenador' && @request.body.coordenador = @request.auth.id))",
      updateRule:
        A +
        " && (@request.auth.role = 'admin' || (@request.auth.role = 'coordenador' && coordenador = @request.auth.id && (@request.body.coordenador:isset = false || @request.body.coordenador = @request.auth.id)))",
      deleteRule: null,
      fields: [
        { name: 'nome', type: 'text', required: true, max: 200 },
        {
          name: 'coordenador',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'membros',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 50,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_projetos_coordenador ON projetos (coordenador)'],
    })
    app.save(projetos)

    // ---------- revisoes ----------
    const revVis =
      A +
      " && (@request.auth.role = 'admin' || @request.auth.role = 'executivo' || projeto.coordenador = @request.auth.id || projeto.membros.id ?= @request.auth.id)"
    const revisoes = new Collection({
      name: 'revisoes',
      type: 'base',
      listRule: revVis,
      viewRule: revVis,
      createRule:
        A +
        " && @request.body.autor = @request.auth.id && (@request.auth.role = 'admin' || ((@request.auth.role = 'revisor' || @request.auth.role = 'coordenador') && (@request.body.projeto.coordenador = @request.auth.id || @request.body.projeto.membros.id ?= @request.auth.id)))",
      updateRule:
        A +
        ' && autor = @request.auth.id && (@request.body.autor:isset = false || @request.body.autor = @request.auth.id) && (@request.body.projeto:isset = false || @request.body.projeto = projeto)',
      deleteRule: null,
      fields: [
        {
          name: 'projeto',
          type: 'relation',
          required: true,
          collectionId: projetos.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'autor',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'parecer', type: 'text', required: true, max: 5000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_revisoes_projeto ON revisoes (projeto, created)'],
    })
    app.save(revisoes)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('revisoes'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('projetos'))
    } catch (_) {}
    const audit = app.findCollectionByNameOrId('auth_audit')
    audit.fields.removeByName('details')
    audit.removeIndex('idx_auth_audit_target')
    audit.removeIndex('idx_auth_audit_actor')
    audit.listRule = "@request.auth.role = 'admin'"
    audit.viewRule = "@request.auth.role = 'admin'"
    app.save(audit)
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.fields.removeByName('failed_window_start')
    users.fields.removeByName('session_expires_at')
    users.fields.getByName('password').min = 8
    users.authToken.duration = 604800
    users.passwordResetToken.duration = 1800
    users.authRule = ''
    users.manageRule = null
    users.listRule =
      "@request.auth.id != '' && (id = @request.auth.id || @request.auth.role = 'admin')"
    users.viewRule =
      "@request.auth.id != '' && (id = @request.auth.id || @request.auth.role = 'admin')"
    users.createRule = "@request.auth.role = 'admin'"
    users.updateRule =
      "@request.auth.id != '' && (id = @request.auth.id || @request.auth.role = 'admin')"
    users.deleteRule = "@request.auth.role = 'admin'"
    app.save(users)
  },
)
