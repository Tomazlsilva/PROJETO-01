migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'alessandro@gavazziengenharia.com.br')
      return // Já existe, idempotente
    } catch (_) {}

    const record = new Record(users)
    record.setEmail('alessandro@gavazziengenharia.com.br')
    record.setPassword('Skip@Pass')
    record.setVerified(true)
    record.set('name', 'Alessandro Gavazzi')
    app.save(record)
  },
  (app) => {
    try {
      const record = app.findAuthRecordByEmail(
        '_pb_users_auth_',
        'alessandro@gavazziengenharia.com.br',
      )
      app.delete(record)
    } catch (_) {}
  },
)
