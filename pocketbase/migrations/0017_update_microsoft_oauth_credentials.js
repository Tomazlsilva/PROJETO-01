migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const tenantId = $os.getenv('AZURE_TENANT_ID') || '84225b91-5561-4c02-8d4d-073d2fa987ae'
    const clientId = $os.getenv('AZURE_CLIENT_ID')
    const clientSecret = $os.getenv('AZURE_CLIENT_SECRET')

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
        authURL: 'https://login.microsoftonline.com/' + tenantId + '/oauth2/v2.0/authorize',
        tokenURL: 'https://login.microsoftonline.com/' + tenantId + '/oauth2/v2.0/token',
      },
    ]

    app.save(users)
  },
  (app) => {
    // Revert mantendo a coleção consistente
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.oauth2.providers = []
    users.oauth2.enabled = false
    app.save(users)
  },
)
