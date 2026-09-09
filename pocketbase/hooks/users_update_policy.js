onRecordUpdateRequest((e) => {
  const body = e.requestInfo().body || {}
  if (typeof body.password === 'string' && body.password.length < 12) {
    return e.badRequestError('A senha deve ter pelo menos 12 caracteres.')
  }
  if (
    body.role &&
    !['admin', 'coordenador', 'projetista', 'revisor', 'executivo'].includes(body.role)
  ) {
    return e.badRequestError('Papel inválido.')
  }
  return e.next()
}, 'users')
