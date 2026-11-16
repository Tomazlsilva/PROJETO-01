// SPEC-2-005 (T2.14/T2.15) — limiares de amostra dos indicadores de qualidade.
// Abaixo do limiar o indicador aparece como "inconclusivo". Mudança só pelo administrador,
// pela rota /backend/v1/painel/qualidade/config, com registro na auditoria.
migrate(
  (app) => {
    const col = new Collection({
      name: 'config_qualidade',
      type: 'base',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'limiar_k2', type: 'number', required: true, onlyInt: true, min: 1, max: 1000 },
        { name: 'limiar_k3', type: 'number', required: true, onlyInt: true, min: 1, max: 1000 },
        { name: 'motivo', type: 'text', max: 500 },
        {
          name: 'autor',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(col)
    const r = new Record(col)
    r.set('limiar_k2', 5)
    r.set('limiar_k3', 5)
    r.set('motivo', 'Padrão da SPEC-2-005')
    app.save(r)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('config_qualidade'))
    } catch (_) {}
  },
)
