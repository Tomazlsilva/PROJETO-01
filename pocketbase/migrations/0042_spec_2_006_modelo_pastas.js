// SPEC-2-006 (T2.18) — modelo de pastas padrão configurável pela tela, com versões.
// A criação real no OneDrive (T2.19/T2.20) depende da liberação do Microsoft 365 (T2.17):
// até lá a configuração fica com "criação automática desligada" e sem pasta raiz.
// Leitura e gravação só pelas rotas /backend/v1/pastas* (administrador/diretor) — regras null.
migrate(
  (app) => {
    const usuario = {
      name: 'autor',
      type: 'relation',
      collectionId: '_pb_users_auth_',
      cascadeDelete: false,
      maxSelect: 1,
    }
    const datas = [
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ]
    const modelos = new Collection({
      name: 'pastas_modelos',
      type: 'base',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'numero', type: 'number', required: true, onlyInt: true, min: 1 },
        { name: 'caminho_projeto', type: 'text', required: true, max: 500 },
        { name: 'subpastas', type: 'json', required: true, maxSize: 20000 },
        { name: 'motivo', type: 'text', max: 500 },
        usuario,
      ].concat(datas),
      indexes: ['CREATE UNIQUE INDEX idx_pastas_modelos_num ON pastas_modelos (numero)'],
    })
    app.save(modelos)

    const config = new Collection({
      name: 'pastas_config',
      type: 'base',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'criacao_automatica', type: 'bool' },
        { name: 'pasta_raiz', type: 'text', max: 1000 },
        { name: 'acesso_liberado', type: 'bool' },
        usuario,
      ].concat(datas),
    })
    app.save(config)
    const c = new Record(config)
    c.set('criacao_automatica', false)
    c.set('pasta_raiz', '')
    c.set('acesso_liberado', false)
    app.save(c)
  },
  (app) => {
    for (const n of ['pastas_config', 'pastas_modelos']) {
      try {
        app.delete(app.findCollectionByNameOrId(n))
      } catch (_) {}
    }
  },
)
