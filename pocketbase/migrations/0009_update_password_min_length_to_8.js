migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const pwdField = users.fields.getByName('password')
    if (pwdField) {
      pwdField.min = 8
      app.save(users)
    }
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const pwdField = users.fields.getByName('password')
    if (pwdField) {
      pwdField.min = 12
      app.save(users)
    }
  },
)
