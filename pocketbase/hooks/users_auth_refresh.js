// SPEC-1-001 (CA-1-001-14) — renovação de sessão.
// Não estende além das 8h do login e rotaciona a tokenKey: o token anterior
// deixa de ser aceito assim que o novo é emitido.
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
  rec.refreshTokenKey()
  $app.saveNoValidate(rec)
  return e.next()
}, 'users')
