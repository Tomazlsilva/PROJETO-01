// SPEC-1-007 (T1.36, CA-1-007-12) — retenção de 90 dias: remove backups vencidos (só administrador).
// A mesma limpeza roda todo dia na rotina automática de backup.
routerAdd(
  'POST',
  '/backend/v1/backups/limpar',
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
    if (auth.getString('role') !== 'admin') throw new ForbiddenError('Acesso negado.')
    const agora = new Date().toISOString().replace('T', ' ')
    let removidos = 0
    for (const b of $app.findRecordsByFilter(
      'backups',
      "expira_em != '' && expira_em < {:a}",
      'expira_em',
      1000,
      0,
      { a: agora },
    )) {
      try {
        $app.delete(b)
        removidos++
      } catch (err) {
        $app.logger().error('remoção de backup vencido falhou', 'backup', b.id)
      }
    }
    try {
      const r = new Record($app.findCollectionByNameOrId('auth_audit'))
      r.set('actor_id', auth.id)
      r.set('action', 'backup.limpeza')
      r.set('outcome', 'success')
      r.set('details', { removidos: removidos })
      $app.save(r)
    } catch (err) {
      $app.logger().error('auditoria falhou', 'action', 'backup.limpeza')
    }
    return e.json(200, { removidos: removidos })
  },
  $apis.requireAuth('users'),
)
