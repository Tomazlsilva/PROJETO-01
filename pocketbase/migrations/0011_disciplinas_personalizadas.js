// Disciplinas personalizadas: além do catálogo padrão, admin ou coordenador pode
// digitar uma disciplina diferente ao cadastrar o projeto. Ela entra no catálogo
// marcada como personalizada, com quem criou, e é reaproveitada pelo nome.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('disciplinas')
    if (!col.fields.getByName('personalizada')) {
      col.fields.add(new BoolField({ name: 'personalizada' }))
    }
    if (!col.fields.getByName('criada_por')) {
      col.fields.add(
        new RelationField({
          name: 'criada_por',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          cascadeDelete: false,
        }),
      )
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('disciplinas')
    col.fields.removeByName('personalizada')
    col.fields.removeByName('criada_por')
    app.save(col)
  },
)
