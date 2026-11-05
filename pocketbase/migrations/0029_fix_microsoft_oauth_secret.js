// Corrige a causa raiz da regressão do login Microsoft: as migrações 0028 e
// anteriores gravavam o segredo do provedor vindo da variável de ambiente, mas
// o Skip Cloud reescreve a coleção users quando sobe o app e a chave criptografada
// do PocketBase é recriada — o segredo gravado deixa de ser decifrável e o
// provedor volta a rejeitar o token da Microsoft ("Failed to fetch OAuth2 token").
// A migração volta a gravar o segredo atual da variável de ambiente
// OAUTH_MICROSOFT_CLIENT_SECRET (com AZURE_CLIENT_SECRET como reserva),
// mantendo client ID e tenant do diretório Gavazzi já definidos nas migrações
// 0017/0019/0028. Nenhum valor é versionado: tudo vem de variável de ambiente.
migrate(
  (app) => {
    const tenant = '84225b91-5561-4c02-8d4d-073d2fa987ae'
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    const atual = (users.oauth2.providers || []).find((p) => p.name === 'microsoft') || {}
    const clientId = $os.getenv('AZURE_CLIENT_ID') || atual.clientId || ''
    let clientSecret =
      $os.getenv('OAUTH_MICROSOFT_CLIENT_SECRET') || $os.getenv('AZURE_CLIENT_SECRET') || ''

    if (!clientSecret) {
      // Segredo ausente nas env vars: mantém o já gravado na coleção, se houver,
      // em vez de desabilitar o provedor e derrubar o login de todos.
      if (atual.clientSecret) {
        console.log('0029: segredo ausente nas env vars — mantendo o segredo já gravado')
        clientSecret = atual.clientSecret
      } else {
        throw new Error('0029: segredo do provedor Microsoft ausente nas variáveis de ambiente')
      }
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
