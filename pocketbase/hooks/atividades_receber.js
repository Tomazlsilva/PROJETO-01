// SPEC-1-005 — o destinatário confirma o recebimento da pendência (handoff).
// Pendente → recebida (com horário). Repetir não altera nada. Só o destinatário.
routerAdd(
  'POST',
  '/backend/v1/atividades/{id}/receber',
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
    let a = null
    try {
      a = $app.findRecordById('atividades', id)
    } catch (_) {}
    if (!a || a.getString('destinatario') !== auth.id) {
      try {
        const r = new Record($app.findCollectionByNameOrId('auth_audit'))
        r.set('actor_id', auth.id)
        r.set('action', 'access.denied')
        r.set('outcome', 'blocked')
        r.set('details', {
          recurso: 'atividades',
          operacao: 'receber',
          id: String(id).slice(0, 32),
        })
        $app.save(r)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Acesso negado.')
    }
    const st = a.getString('status')
    if (st === 'recebida')
      return e.json(200, { id: id, status: st, recebida_em: a.getString('recebida_em') })
    if (st !== 'pendente')
      return e.json(409, {
        code: 'atividade_encerrada',
        message: 'Esta pendência já foi encerrada.',
      })
    a.set('status', 'recebida')
    a.set('recebida_em', new Date().toISOString().replace('T', ' '))
    $app.save(a)
    return e.json(200, { id: id, status: 'recebida', recebida_em: a.getString('recebida_em') })
  },
  $apis.requireAuth('users'),
)
