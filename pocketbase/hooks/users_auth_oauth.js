// Login pela conta Microsoft (ou outro provedor OAuth configurado no Skip).
// Mesmas regras do login por senha: só entra quem o administrador cadastrou
// (nunca cria conta sozinho), conta ativa e não bloqueada, sessão de 8h e auditoria.
onRecordAuthWithOAuth2Request((e) => {
  const audit = (action, outcome, targetId, details) => {
    try {
      const rec = new Record($app.findCollectionByNameOrId('auth_audit'))
      rec.set('actor_id', targetId || '')
      rec.set('target_id', targetId || '')
      rec.set('action', action)
      rec.set('outcome', outcome)
      rec.set('details', details || {})
      $app.save(rec)
    } catch (err) {
      $app.logger().error('auditoria falhou', 'action', action)
    }
  }
  const NEGADO = 'Acesso não liberado. Fale com o administrador.'
  const provedor = e.providerName || ''

  if (!e.record || e.isNewRecord) {
    audit('login.oauth_not_registered', 'blocked', '', { provedor: provedor })
    throw new BadRequestError(NEGADO)
  }
  const rec = e.record
  const s = rec.getString('locked_until')
  const bloqueadoAte = s ? new Date(s.replace(' ', 'T')) : null
  if (bloqueadoAte && bloqueadoAte > new Date()) {
    audit('login.rejected_locked', 'blocked', rec.id, { provedor: provedor })
    throw new BadRequestError(NEGADO)
  }
  if (!rec.getBool('active')) {
    audit('login.inactive', 'blocked', rec.id, { provedor: provedor })
    throw new BadRequestError(NEGADO)
  }

  const agora = new Date()
  const fmt = (d) => d.toISOString().replace('T', ' ')
  rec.set('failed_attempts', 0)
  rec.set('failed_window_start', '')
  rec.set('session_issued_at', fmt(agora))
  rec.set('session_expires_at', fmt(new Date(agora.getTime() + 8 * 60 * 60 * 1000)))
  $app.saveNoValidate(rec)
  audit('login.success', 'success', rec.id, { metodo: provedor })
  return e.next()
}, 'users')
