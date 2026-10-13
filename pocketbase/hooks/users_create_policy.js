// SPEC-1-001 — criação de usuários: somente administrador ativo, senha opcional (>= 8 se informada),
// papel obrigatório e válido, campos de controle nunca vêm do cliente. Auditado.
onRecordCreateRequest((e) => {
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
  if (!e.hasSuperuserAuth()) {
    const isAdmin = !!e.auth && e.auth.getString('role') === 'admin' && e.auth.getBool('active')
    if (!isAdmin) {
      audit('access.denied', 'blocked', '', { recurso: 'users', operacao: 'create' })
      throw new ForbiddenError('Acesso negado.')
    }
  }

  // Senha é opcional: sem ela, a pessoa entra com a conta Microsoft ou define a
  // própria senha por "Esqueci a senha". Uma senha aleatória e desconhecida é gravada.
  const password = typeof body.password === 'string' ? body.password : ''
  if (password === '') {
    e.record.setPassword($security.randomString(40))
  } else if (password.length < 8) {
    throw new BadRequestError('A senha deve ter pelo menos 8 caracteres.')
  }
  const roles = ['admin', 'coordenador', 'projetista', 'revisor', 'executivo']
  if (!roles.includes(e.record.getString('role'))) {
    throw new BadRequestError('Informe um papel válido.')
  }

  if (body.active === undefined) e.record.set('active', true)
  e.record.set('failed_attempts', 0)
  e.record.set('locked_until', '')
  e.record.set('failed_window_start', '')
  e.record.set('session_issued_at', '')
  e.record.set('session_expires_at', '')

  e.next()

  audit('user.create', 'success', e.record.id, {
    papel: e.record.getString('role'),
    ativo: e.record.getBool('active'),
  })
}, 'users')
