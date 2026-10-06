// SPEC-1-002 (preparação da T1.07) — estrutura mínima para cliente, disciplinas e
// responsável por disciplina. Obrigatoriedade dos campos, duplicidade, edição
// auditada e validação de link ficam para T1.08–T1.10. Regras conservadoras:
// cliente só é visível para administrador e executivo até a T1.10.
migrate(
  (app) => {
    const A =
      "@request.auth.id != '' && @request.auth.active = true && @request.auth.session_expires_at > @now"

    // ---------- clientes ----------
    const clientes = new Collection({
      name: 'clientes',
      type: 'base',
      listRule: A + " && (@request.auth.role = 'admin' || @request.auth.role = 'executivo')",
      viewRule: A + " && (@request.auth.role = 'admin' || @request.auth.role = 'executivo')",
      createRule: A + " && @request.auth.role = 'admin'",
      updateRule: A + " && @request.auth.role = 'admin'",
      deleteRule: null,
      fields: [
        { name: 'nome', type: 'text', required: true, max: 200 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_clientes_nome ON clientes (nome)'],
    })
    app.save(clientes)

    // ---------- disciplinas (catálogo) ----------
    const disciplinas = new Collection({
      name: 'disciplinas',
      type: 'base',
      listRule: A,
      viewRule: A,
      createRule: A + " && @request.auth.role = 'admin'",
      updateRule: A + " && @request.auth.role = 'admin'",
      deleteRule: null,
      fields: [
        { name: 'nome', type: 'text', required: true, max: 80 },
        { name: 'sigla', type: 'text', max: 10 },
        { name: 'ativa', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_disciplinas_nome ON disciplinas (nome)'],
    })
    app.save(disciplinas)

    // ---------- projetos: campos do cadastro ----------
    const projetos = app.findCollectionByNameOrId('projetos')
    if (!projetos.fields.getByName('cliente')) {
      projetos.fields.add(
        new RelationField({
          name: 'cliente',
          collectionId: clientes.id,
          maxSelect: 1,
          cascadeDelete: false,
        }),
      )
    }
    if (!projetos.fields.getByName('local')) {
      projetos.fields.add(new TextField({ name: 'local', max: 300 }))
    }
    if (!projetos.fields.getByName('tipologia')) {
      projetos.fields.add(new TextField({ name: 'tipologia', max: 120 }))
    }
    if (!projetos.fields.getByName('prazo')) {
      projetos.fields.add(new DateField({ name: 'prazo' }))
    }
    if (!projetos.fields.getByName('prioridade')) {
      projetos.fields.add(
        new SelectField({
          name: 'prioridade',
          values: ['Baixa', 'Normal', 'Alta', 'Urgente'],
          maxSelect: 1,
        }),
      )
    }
    if (!projetos.fields.getByName('link_entrada')) {
      projetos.fields.add(new URLField({ name: 'link_entrada' }))
    }
    if (!projetos.fields.getByName('arquivado')) {
      projetos.fields.add(new BoolField({ name: 'arquivado' }))
    }
    projetos.addIndex('idx_projetos_cliente_tipologia', false, 'cliente, tipologia', '')
    app.save(projetos)

    // ---------- projeto_disciplinas (responsável por disciplina) ----------
    const vis =
      A +
      " && (@request.auth.role = 'admin' || @request.auth.role = 'executivo' || projeto.coordenador = @request.auth.id || projeto.membros.id ?= @request.auth.id)"
    const pd = new Collection({
      name: 'projeto_disciplinas',
      type: 'base',
      listRule: vis,
      viewRule: vis,
      createRule:
        A +
        " && (@request.auth.role = 'admin' || (@request.auth.role = 'coordenador' && @request.body.projeto.coordenador = @request.auth.id))",
      updateRule:
        A +
        " && (@request.auth.role = 'admin' || (@request.auth.role = 'coordenador' && projeto.coordenador = @request.auth.id && (@request.body.projeto:isset = false || @request.body.projeto = projeto)))",
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
          name: 'disciplina',
          type: 'relation',
          required: true,
          collectionId: disciplinas.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'responsavel',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_projeto_disciplinas_unica ON projeto_disciplinas (projeto, disciplina)',
        'CREATE INDEX idx_projeto_disciplinas_resp ON projeto_disciplinas (responsavel)',
      ],
    })
    app.save(pd)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('projeto_disciplinas'))
    } catch (_) {}
    const projetos = app.findCollectionByNameOrId('projetos')
    projetos.removeIndex('idx_projetos_cliente_tipologia')
    for (const f of [
      'cliente',
      'local',
      'tipologia',
      'prazo',
      'prioridade',
      'link_entrada',
      'arquivado',
    ]) {
      projetos.fields.removeByName(f)
    }
    app.save(projetos)
    try {
      app.delete(app.findCollectionByNameOrId('disciplinas'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('clientes'))
    } catch (_) {}
  },
)
