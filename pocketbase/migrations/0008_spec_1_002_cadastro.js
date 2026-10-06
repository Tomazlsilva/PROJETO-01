// SPEC-1-002 (T1.08–T1.10) — cadastro controlado.
// - criação e edição de projetos e disciplinas só pelas rotas /backend/v1/projetos*,
//   que validam campos, duplicidade, conflito, arquivamento e autorização;
// - histórico do projeto somente de inclusão (antes/depois, autor, horário);
// - clientes visíveis só no escopo de quem participa de algum projeto do cliente.
migrate(
  (app) => {
    const A =
      "@request.auth.id != '' && @request.auth.active = true && @request.auth.session_expires_at > @now"

    const projetos = app.findCollectionByNameOrId('projetos')
    projetos.createRule = null
    projetos.updateRule = null
    app.save(projetos)

    const pd = app.findCollectionByNameOrId('projeto_disciplinas')
    if (!pd.fields.getByName('responsavel_herdado')) {
      pd.fields.add(new BoolField({ name: 'responsavel_herdado' }))
    }
    pd.createRule = null
    pd.updateRule = null
    app.save(pd)

    const clientes = app.findCollectionByNameOrId('clientes')
    const escopo =
      '(@collection.projetos:p.cliente ?= id && (@collection.projetos:p.coordenador ?= @request.auth.id || @collection.projetos:p.membros.id ?= @request.auth.id))'
    clientes.listRule =
      A + " && (@request.auth.role = 'admin' || @request.auth.role = 'executivo' || " + escopo + ')'
    clientes.viewRule = clientes.listRule
    clientes.createRule = A + " && @request.auth.role = 'admin'"
    clientes.updateRule =
      A +
      " && (@request.auth.role = 'admin' || (@request.auth.role = 'coordenador' && @collection.projetos:pc.cliente ?= id && @collection.projetos:pc.coordenador ?= @request.auth.id))"
    app.save(clientes)

    const vis =
      A +
      " && (@request.auth.role = 'admin' || @request.auth.role = 'executivo' || projeto.coordenador = @request.auth.id || projeto.membros.id ?= @request.auth.id)"
    const historico = new Collection({
      name: 'projeto_historico',
      type: 'base',
      listRule: vis,
      viewRule: vis,
      createRule: null,
      updateRule: null,
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
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'acao', type: 'text', required: true, max: 40 },
        { name: 'campo', type: 'text', max: 60 },
        { name: 'antes', type: 'text', max: 2000 },
        { name: 'depois', type: 'text', max: 2000 },
        { name: 'detalhes', type: 'json', maxSize: 4000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_projeto_historico_projeto ON projeto_historico (projeto, created)',
      ],
    })
    app.save(historico)

    // Projetos já existentes recebem o registro de criação para o histórico ficar completo
    for (const p of app.findRecordsByFilter('projetos', "id != ''", 'created', 0, 0)) {
      const h = new Record(historico)
      h.set('projeto', p.id)
      h.set('acao', 'criado')
      h.set('detalhes', { origem: 'carga inicial' })
      app.save(h)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('projeto_historico'))
    } catch (_) {}
    const A =
      "@request.auth.id != '' && @request.auth.active = true && @request.auth.session_expires_at > @now"
    const clientes = app.findCollectionByNameOrId('clientes')
    clientes.listRule = A + " && (@request.auth.role = 'admin' || @request.auth.role = 'executivo')"
    clientes.viewRule = clientes.listRule
    clientes.createRule = A + " && @request.auth.role = 'admin'"
    clientes.updateRule = A + " && @request.auth.role = 'admin'"
    app.save(clientes)
    const pd = app.findCollectionByNameOrId('projeto_disciplinas')
    pd.fields.removeByName('responsavel_herdado')
    pd.createRule =
      A +
      " && (@request.auth.role = 'admin' || (@request.auth.role = 'coordenador' && @request.body.projeto.coordenador = @request.auth.id))"
    pd.updateRule =
      A +
      " && (@request.auth.role = 'admin' || (@request.auth.role = 'coordenador' && projeto.coordenador = @request.auth.id && (@request.body.projeto:isset = false || @request.body.projeto = projeto)))"
    app.save(pd)
    const projetos = app.findCollectionByNameOrId('projetos')
    projetos.createRule =
      A +
      " && (@request.auth.role = 'admin' || (@request.auth.role = 'coordenador' && @request.body.coordenador = @request.auth.id))"
    projetos.updateRule =
      A +
      " && (@request.auth.role = 'admin' || (@request.auth.role = 'coordenador' && coordenador = @request.auth.id && (@request.body.coordenador:isset = false || @request.body.coordenador = @request.auth.id)))"
    app.save(projetos)
  },
)
