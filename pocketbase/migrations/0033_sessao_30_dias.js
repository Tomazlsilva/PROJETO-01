// Tira o limite de 8h da sessão: token de 30 dias, renovado pelo uso (hook de refresh).
// Quem está com sessão válida agora ganha os 30 dias sem precisar entrar de novo.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.authToken.duration = 2592000 // 30 dias
    app.save(users)

    const agora = new Date().toISOString().replace('T', ' ')
    const novo = new Date(Date.now() + 30 * 24 * 3600000).toISOString().replace('T', ' ')
    const ativos = app.findRecordsByFilter(
      '_pb_users_auth_',
      'active = true && session_expires_at > {:agora}',
      '',
      0,
      0,
      { agora: agora },
    )
    for (const u of ativos) {
      u.set('session_expires_at', novo)
      app.saveNoValidate(u)
    }
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.authToken.duration = 28800
    app.save(users)
  },
)
