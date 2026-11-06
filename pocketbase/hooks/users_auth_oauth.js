// Login pela conta Microsoft (ou outro provedor OAuth configurado no Skip).
// Mesmas regras do login por senha: só entra quem o administrador cadastrou
// (nunca cria conta sozinho), conta ativa e não bloqueada, sessão de 20h, auditoria e
// foto do perfil puxada da Microsoft a cada login (limite absoluto, não renova).

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
  rec.set('session_expires_at', fmt(new Date(agora.getTime() + 20 * 60 * 60 * 1000)))

  // Foto do perfil Microsoft (Graph). Se não tiver foto ou falhar, segue o login sem ela.
  if (provedor === 'microsoft') {
    try {
      const token = e.oAuth2User && e.oAuth2User.accessToken
      if (token) {
        const res = $http.send({
          url: 'https://graph.microsoft.com/v1.0/me/photos/240x240/$value',
          method: 'GET',
          headers: { Authorization: 'Bearer ' + token },
          timeout: 6,
        })
        if (res.statusCode === 200 && res.body && res.body.length > 0) {
          const tipo = String((res.headers && res.headers['Content-Type']) || '')
          const ext = tipo.indexOf('png') >= 0 ? 'png' : 'jpg'
          rec.set('avatar', $filesystem.fileFromBytes(res.body, 'foto.' + ext))
        } else if (res.statusCode !== 404) {
          $app.logger().warn('foto microsoft', 'status', res.statusCode)
        }
      }
    } catch (err) {
      $app.logger().warn('foto microsoft falhou', 'erro', String(err))
    }
  }
  try {
    $app.saveNoValidate(rec)
  } catch (err) {
    // se a foto atrapalhar o salvamento, salva sem ela
    $app.logger().warn('salvar com foto falhou', 'erro', String(err))
    rec.set('avatar', rec.original().getString('avatar'))
    $app.saveNoValidate(rec)
  }
  audit('login.success', 'success', rec.id, { metodo: provedor })
  return e.next()
}, 'users')
