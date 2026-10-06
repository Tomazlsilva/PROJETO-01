// SPEC-1-001 — alteração de usuários.
// Papel, ativação, bloqueio, e-mail e campos de sessão só mudam por administrador.
// Toda mudança administrativa é auditada (antes/depois), sem gravar segredos.
onRecordUpdateRequest((e) => {
  const audit = (action, outcome, targetId, details) => {
    try {
      const rec = new Record($app.findCollectionByNameOrId('auth_audit'))
      rec.set('actor_id', e.auth ? e.auth.id : '')
      rec.set('target_id', targetId || '')
      rec.set('action', action)
      rec.set('outcome', outcome)
      rec.set('details', details || {})
      $app.save(rec)
    } catch (err) {
      $app.logger().error('auditoria falhou', 'action', action)
    }
  }

  const body = e.requestInfo().body || {}
  if (typeof body.password === 'string' && body.password.length < 12) {
    throw new BadRequestError('A senha deve ter pelo menos 12 caracteres.')
  }

  const rec = e.record
  const orig = rec.original()
  const roles = ['admin', 'coordenador', 'projetista', 'revisor', 'executivo']
  if (!roles.includes(rec.getString('role'))) {
    throw new BadRequestError('Informe um papel válido.')
  }

  const protegidos = [
    'role',
    'active',
    'failed_attempts',
    'locked_until',
    'failed_window_start',
    'session_issued_at',
    'session_expires_at',
    'verified',
    'email',
  ]
  const mudou = protegidos.filter(
    (f) => body[f] !== undefined && rec.getString(f) !== orig.getString(f),
  )
  const isSuper = e.hasSuperuserAuth()
  const isAdmin =
    !isSuper && !!e.auth && e.auth.getString('role') === 'admin' && e.auth.getBool('active')

  if (!isSuper && !isAdmin && mudou.length > 0) {
    audit('access.denied', 'blocked', rec.id, { recurso: 'users', campos: mudou })
    throw new ForbiddenError('Acesso negado.')
  }

  // Administrador não remove o próprio acesso administrativo (evita ficar sem admin)
  if (isAdmin && e.auth.id === rec.id) {
    if (rec.getString('role') !== 'admin' || !rec.getBool('active')) {
      throw new BadRequestError('Você não pode remover o seu próprio acesso de administrador.')
    }
  }

  const trocouSenha = typeof body.password === 'string' && body.password !== ''

  e.next()

  if (isSuper) return
  const alvo = rec.id
  if (orig.getString('role') !== rec.getString('role')) {
    audit('user.role_change', 'success', alvo, {
      antes: orig.getString('role'),
      depois: rec.getString('role'),
    })
  }
  if (orig.getBool('active') && !rec.getBool('active')) {
    audit('user.revoke', 'success', alvo, {})
  }
  if (!orig.getBool('active') && rec.getBool('active')) {
    audit('user.activate', 'success', alvo, {})
  }
  if (orig.getString('locked_until') !== '' && rec.getString('locked_until') === '') {
    audit('user.unlock', 'success', alvo, {})
  } else if (orig.getInt('failed_attempts') > 0 && rec.getInt('failed_attempts') === 0) {
    audit('user.unlock', 'success', alvo, {})
  }
  if (orig.getString('email') !== rec.getString('email')) {
    audit('user.email_change', 'success', alvo, {})
  }
  if (trocouSenha) {
    audit(
      e.auth && e.auth.id === alvo ? 'password.change' : 'password.set_by_admin',
      'success',
      alvo,
      {},
    )
  }
}, 'users')
