// Sessão com limite absoluto de 20h a partir do login (menos de um dia).
// As sessões abertas com 30 dias voltam para 20h contadas do login delas.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.authToken.duration = 72000 // 20 horas
    app.save(users)

    const fmt = (d) => d.toISOString().replace('T', ' ')
    const agora = fmt(new Date())
    const abertos = app.findRecordsByFilter(
      '_pb_users_auth_',
      'session_expires_at > {:agora}',
      '',
      0,
      0,
      { agora: agora },
    )
    for (const u of abertos) {
      const s = u.getString('session_issued_at')
      const inicio = s ? new Date(s.replace(' ', 'T')) : new Date()
      const limite = new Date(inicio.getTime() + 20 * 3600000)
      u.set('session_expires_at', fmt(limite))
      app.saveNoValidate(u)
    }
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.authToken.duration = 2592000
    app.save(users)
  },
)
