// SPEC-1-005 (CA-1-005-08) — notificações internas do usuário (mais recentes primeiro)
// e quantidade de não lidas. Cada uma aponta para a atividade, o card e o projeto.
routerAdd(
  'GET',
  '/backend/v1/notificacoes',
  (e) => {
    const auth = e.auth
    const expira = auth ? auth.getString('session_expires_at') : ''
    if (
      !auth ||
      !auth.getBool('active') ||
      !expira ||
      new Date(expira.replace(' ', 'T')) <= new Date()
    ) {
      throw new UnauthorizedError('Sessão inválida ou expirada.')
    }
    const itens = $app
      .findRecordsByFilter('notificacoes', 'destinatario = {:u}', '-created', 50, 0, { u: auth.id })
      .map((n) => ({
        id: n.id,
        titulo: n.getString('titulo'),
        texto: n.getString('texto'),
        lida: n.getBool('lida'),
        lida_em: n.getString('lida_em'),
        atividade: n.getString('atividade'),
        card: n.getString('card'),
        projeto: n.getString('projeto'),
        created: n.getString('created'),
      }))
    const naoLidas = $app.countRecords(
      'notificacoes',
      $dbx.hashExp({ destinatario: auth.id, lida: false }),
    )
    return e.json(200, { nao_lidas: naoLidas, itens: itens })
  },
  $apis.requireAuth('users'),
)
