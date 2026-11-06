// Reaplica o teto de 20h: entre o ajuste dos dados (0034) e a publicação, a regra antiga
// de renovação ainda podia empurrar alguma sessão para 30 dias.
migrate(
  (app) => {
    const fmt = (d) => d.toISOString().replace('T', ' ')
    const abertos = app.findRecordsByFilter(
      '_pb_users_auth_',
      'session_expires_at > {:agora}',
      '',
      0,
      0,
      { agora: fmt(new Date()) },
    )
    for (const u of abertos) {
      const s = u.getString('session_issued_at')
      const inicio = s ? new Date(s.replace(' ', 'T')) : new Date()
      const limite = new Date(inicio.getTime() + 20 * 3600000)
      const atual = new Date(u.getString('session_expires_at').replace(' ', 'T'))
      if (atual > limite) {
        u.set('session_expires_at', fmt(limite))
        app.saveNoValidate(u)
      }
    }
  },
  () => {},
)
