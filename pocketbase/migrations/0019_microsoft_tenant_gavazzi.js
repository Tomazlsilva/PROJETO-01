// Login Microsoft só para o diretório da Gavazzi (aplicativo de locatário único):
// usa os endereços do tenant em vez do genérico "common". Mantém ID e segredo atuais.
migrate(
  (app) => {
    const tenant = '84225b91-5561-4c02-8d4d-073d2fa987ae'
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const lista = []
    for (const p of users.oauth2.providers) {
      const item = {
        name: p.name,
        displayName: p.displayName,
        clientId: p.clientId,
        clientSecret: p.clientSecret,
        authURL: p.authURL,
        tokenURL: p.tokenURL,
        userInfoURL: p.userInfoURL,
        pkce: p.pkce,
        extra: p.extra,
      }
      if (p.name === 'microsoft') {
        item.authURL = 'https://login.microsoftonline.com/' + tenant + '/oauth2/v2.0/authorize'
        item.tokenURL = 'https://login.microsoftonline.com/' + tenant + '/oauth2/v2.0/token'
      }
      lista.push(item)
    }
    users.oauth2.providers = lista
    app.save(users)
  },
  (app) => {},
)
