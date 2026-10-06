// SPEC-1-001 — login por senha.
// - mensagem única para conta inexistente, senha errada, conta inativa ou bloqueada;
// - 5 tentativas inválidas em 15 min bloqueiam a conta por 15 min (auditado);
// - sucesso abre sessão com validade absoluta de 8h (session_expires_at).
onRecordAuthWithPasswordRequest((e) => {
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
  const fmt = (d) => d.toISOString().replace('T', ' ')
  const parse = (s) => (s ? new Date(String(s).replace(' ', 'T')) : null)
  const GENERIC = 'Failed to authenticate.'
  const JANELA_MS = 15 * 60 * 1000
  const LIMITE = 5
  const SESSAO_MS = 8 * 60 * 60 * 1000

  const rec = e.record
  if (!rec) {
    throw new BadRequestError(GENERIC)
  }
  const agora = new Date()

  const bloqueadoAte = parse(rec.getString('locked_until'))
  if (bloqueadoAte && bloqueadoAte > agora) {
    audit('login.rejected_locked', 'blocked', rec.id, {})
    throw new BadRequestError(GENERIC)
  }

  if (!rec.getBool('active')) {
    audit('login.inactive', 'blocked', rec.id, {})
    throw new BadRequestError(GENERIC)
  }

  if (!rec.validatePassword(e.password)) {
    const inicio = parse(rec.getString('failed_window_start'))
    let tentativas = rec.getInt('failed_attempts')
    if (!inicio || agora - inicio > JANELA_MS) {
      rec.set('failed_window_start', fmt(agora))
      tentativas = 1
    } else {
      tentativas = tentativas + 1
    }
    rec.set('failed_attempts', tentativas)
    if (tentativas >= LIMITE) {
      rec.set('locked_until', fmt(new Date(agora.getTime() + JANELA_MS)))
      rec.set('failed_window_start', '')
      rec.set('failed_attempts', 0)
    }
    $app.saveNoValidate(rec)
    audit('login.failure', 'failure', rec.id, { tentativa: Math.min(tentativas, LIMITE) })
    if (tentativas >= LIMITE) {
      audit('login.locked', 'blocked', rec.id, { minutos: 15 })
    }
    throw new BadRequestError(GENERIC)
  }

  rec.set('failed_attempts', 0)
  rec.set('failed_window_start', '')
  rec.set('locked_until', '')
  rec.set('session_issued_at', fmt(agora))
  rec.set('session_expires_at', fmt(new Date(agora.getTime() + SESSAO_MS)))
  $app.saveNoValidate(rec)
  audit('login.success', 'success', rec.id, {})
  return e.next()
}, 'users')
