// SPEC-1-002 — pessoas que podem ser escolhidas como coordenador ou responsável
// de disciplina. Só administrador e coordenador; devolve nome e papel (sem e-mail).
routerAdd(
  'GET',
  '/backend/v1/usuarios/atribuiveis',
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
    const papel = auth.getString('role')
    if (papel !== 'admin' && papel !== 'coordenador') {
      throw new ForbiddenError('Acesso negado.')
    }
    const lista = $app.findRecordsByFilter('users', 'active = true', 'name', 1000, 0).map((u) => ({
      id: u.id,
      nome: u.getString('name') || u.getString('email').split('@')[0],
      papel: u.getString('role'),
    }))
    return e.json(200, { items: lista })
  },
  $apis.requireAuth('users'),
)
