// Renovação de sessão: enquanto a pessoa usa a Central, a sessão é empurrada para
// 30 dias à frente (só cai depois de 30 dias sem abrir). Rotaciona a tokenKey: o token
// anterior deixa de ser aceito assim que o novo é emitido. Revogar continua cortando na hora.
onRecordAuthRefreshRequest((e) => {
  const rec = e.record
  if (!rec || !rec.getBool('active')) {
    throw new UnauthorizedError('Sessão inválida.')
  }
  const s = rec.getString('session_expires_at')
  const expira = s ? new Date(s.replace(' ', 'T')) : null
  if (!expira || expira <= new Date()) {
    try {
      const a = new Record($app.findCollectionByNameOrId('auth_audit'))
      a.set('actor_id', rec.id)
      a.set('target_id', rec.id)
      a.set('action', 'session.expired')
      a.set('outcome', 'blocked')
      a.set('details', {})
      $app.save(a)
    } catch (err) {
      $app.logger().error('auditoria falhou', 'action', 'session.expired')
    }
    throw new UnauthorizedError('Sessão expirada. Entre novamente.')
  }
  rec.set(
    'session_expires_at',
    new Date(Date.now() + 30 * 24 * 3600000).toISOString().replace('T', ' '),
  )
  rec.refreshTokenKey()
  $app.saveNoValidate(rec)
  return e.next()
}, 'users')
