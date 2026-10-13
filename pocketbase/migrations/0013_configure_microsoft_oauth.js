migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const tenantId = $os.getenv('AZURE_TENANT_ID')
    const clientId = $os.getenv('AZURE_CLIENT_ID')
    const clientSecret = $os.getenv('AZURE_CLIENT_SECRET')

    // Se as credenciais estiverem disponíveis nas variáveis de ambiente, aplica a configuração.
    // As credenciais também podem ser gravadas diretamente nas opções da coleção pelo painel do PocketBase.
    if (!clientId || !clientSecret) {
      return
    }

    users.oauth2.enabled = true
    users.oauth2.providers = [
      {
        name: 'microsoft',
        displayName: 'Microsoft',
        clientId: clientId,
        clientSecret: clientSecret,
        authURL:
          'https://login.microsoftonline.com/' + (tenantId || 'common') + '/oauth2/v2.0/authorize',
        tokenURL:
          'https://login.microsoftonline.com/' + (tenantId || 'common') + '/oauth2/v2.0/token',
      },
    ]

    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.oauth2.providers = []
    users.oauth2.enabled = false
    app.save(users)
  },
)
