// SPEC-1-001 (CA-1-001-07) — registra a redefinição de senha por token.
// A troca de senha renova a tokenKey: o token de recuperação vira uso único e
// as sessões anteriores deixam de valer. Também remove bloqueio por tentativas.
onRecordConfirmPasswordResetRequest((e) => {
  e.next()
  try {
    const rec = $app.findRecordById('users', e.record.id)
    rec.set('failed_attempts', 0)
    rec.set('failed_window_start', '')
    rec.set('locked_until', '')
    rec.set('session_expires_at', '')
    $app.saveNoValidate(rec)
    const a = new Record($app.findCollectionByNameOrId('auth_audit'))
    a.set('actor_id', rec.id)
    a.set('target_id', rec.id)
    a.set('action', 'password.reset')
    a.set('outcome', 'success')
    a.set('details', {})
    $app.save(a)
  } catch (err) {
    $app.logger().error('pós-redefinição falhou', 'userId', e.record.id)
  }
}, 'users')
