// Corrige o login Microsoft (OAuth2): o segredo era lido de AZURE_CLIENT_SECRET,
// variável que não existe no backend — as migrações 0013/0017 saíam sem configurar
// nada e o provedor ficou com o segredo antigo. O segredo gerenciado pela Skip
// Cloud chama-se OAUTH_MICROSOFT_CLIENT_SECRET (lido aqui, com AZURE_CLIENT_SECRET
// como reserva). Nenhum valor é versionado: tudo vem de variável de ambiente.
// O client ID e o tenant do diretório Gavazzi são reaproveitados da configuração
// atual do provedor (definidos nas migrações 0017/0019).
migrate(
  (app) => {
    const tenant = '84225b91-5561-4c02-8d4d-073d2fa987ae'
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    const atual = (users.oauth2.providers || []).find((p) => p.name === 'microsoft') || {}
    const clientId = $os.getenv('AZURE_CLIENT_ID') || atual.clientId || ''
    const clientSecret =
      $os.getenv('OAUTH_MICROSOFT_CLIENT_SECRET') || $os.getenv('AZURE_CLIENT_SECRET') || ''

    if (!clientId || !clientSecret) {
      console.log('0028: segredo Microsoft ausente — provedor desabilitado')
      users.oauth2.enabled = false
      users.oauth2.providers = []
      app.save(users)
      return
    }

    users.oauth2.enabled = true
    users.oauth2.providers = [
      {
        name: 'microsoft',
        displayName: 'Microsoft',
        clientId: clientId,
        clientSecret: clientSecret,
        authURL: 'https://login.microsoftonline.com/' + tenant + '/oauth2/v2.0/authorize',
        tokenURL: 'https://login.microsoftonline.com/' + tenant + '/oauth2/v2.0/token',
        pkce: true,
      },
    ]
    app.save(users)
  },
  (app) => {},
)
