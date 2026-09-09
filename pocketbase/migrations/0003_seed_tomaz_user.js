migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'tomaz.silva@gavazziengenharia.com.br')
      return
    } catch (_) {}

    const record = new Record(users)
    record.setEmail('tomaz.silva@gavazzienharia.com.br')
    record.setPassword($security.randomString(32))
    record.setVerified(false)
    record.set('name', 'Tomaz Silva')
    record.set('role', 'projetista')
    record.set('active', true)
    record.set('failed_attempts', 0)
    app.save(record)
  },
  (app) => {
    try {
      app.delete(app.findAuthRecordByEmail('_pb_users_auth_', 'tomaz.silva@gavazzienharia.com.br'))
    } catch (_) {}
  },
)
