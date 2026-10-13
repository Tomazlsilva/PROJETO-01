// SPEC-1-005 (CA-1-005-08) — marca a notificação como lida (registra o horário).
// Só o destinatário; repetir não altera o horário da primeira leitura.
routerAdd(
  'POST',
  '/backend/v1/notificacoes/{id}/ler',
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
    const id = e.request.pathValue('id')
    let n = null
    try {
      n = $app.findRecordById('notificacoes', id)
    } catch (_) {}
    if (!n || n.getString('destinatario') !== auth.id) throw new ForbiddenError('Acesso negado.')
    if (!n.getBool('lida')) {
      n.set('lida', true)
      n.set('lida_em', new Date().toISOString().replace('T', ' '))
      $app.save(n)
    }
    return e.json(200, { id: id, lida: true, lida_em: n.getString('lida_em') })
  },
  $apis.requireAuth('users'),
)
