// SPEC-1-008 (CA-1-008-09) — ajustes manuais de feriados: administrador e diretor
// acrescentam (outro município ou recesso da empresa) e ativam/desativam qualquer feriado.
//   POST /backend/v1/feriados            { data, nome, abrangencia }
//   POST /backend/v1/feriados/{id}/ativo { ativo }
routerAdd(
  'POST',
  '/backend/v1/feriados',
  (e) => {
    const auth = e.auth
    const expira = auth ? auth.getString('session_expires_at') : ''
    if (
      !auth ||
      !auth.getBool('active') ||
      !expira ||
      new Date(expira.replace(' ', 'T')) <= new Date()
    )
      throw new UnauthorizedError('Sessão inválida ou expirada.')
    if (auth.getString('role') !== 'admin') {
      try {
        const a = new Record($app.findCollectionByNameOrId('auth_audit'))
        a.set('actor_id', auth.id)
        a.set('action', 'access.denied')
        a.set('outcome', 'blocked')
        a.set('details', { recurso: 'feriados', operacao: 'criar' })
        $app.save(a)
      } catch (err) {}
      throw new ForbiddenError('Acesso negado.')
    }
    const b = e.requestInfo().body || {}
    const d = String(b.data || '')
    const nome = String(b.nome || '')
      .trim()
      .slice(0, 120)
    const abr =
      ['municipal_outro', 'empresa', 'ponto_facultativo'].indexOf(b.abrangencia) >= 0
        ? b.abrangencia
        : 'empresa'
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
      new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) !== d
    )
      throw new BadRequestError('Revise os campos destacados.', {
        data: new ValidationError('invalido', 'Data inválida.'),
      })
    if (nome.length < 3)
      throw new BadRequestError('Revise os campos destacados.', {
        nome: new ValidationError('obrigatorio', 'Informe o nome.'),
      })
    const r = new Record($app.findCollectionByNameOrId('feriados'))
    r.set('data', d + ' 12:00:00.000Z')
    r.set('nome', nome)
    r.set('abrangencia', abr)
    r.set('origem', 'manual')
    r.set('ativo', true)
    r.set('criado_por', auth.id)
    $app.save(r)
    const a = new Record($app.findCollectionByNameOrId('auth_audit'))
    a.set('actor_id', auth.id)
    a.set('target_id', r.id)
    a.set('action', 'feriado.criado')
    a.set('outcome', 'success')
    a.set('details', { data: d, nome: nome, abrangencia: abr })
    $app.save(a)
    return e.json(201, { id: r.id })
  },
  $apis.requireAuth('users'),
)

routerAdd(
  'POST',
  '/backend/v1/feriados/{id}/ativo',
  (e) => {
    const auth = e.auth
    const expira = auth ? auth.getString('session_expires_at') : ''
    if (
      !auth ||
      !auth.getBool('active') ||
      !expira ||
      new Date(expira.replace(' ', 'T')) <= new Date()
    )
      throw new UnauthorizedError('Sessão inválida ou expirada.')
    if (auth.getString('role') !== 'admin') throw new ForbiddenError('Acesso negado.')
    let r = null
    try {
      r = $app.findRecordById('feriados', e.request.pathValue('id'))
    } catch (_) {}
    if (!r) throw new NotFoundError('Feriado não encontrado.')
    const b = e.requestInfo().body || {}
    const ativo = b.ativo === true
    if (r.getBool('ativo') !== ativo) {
      r.set('ativo', ativo)
      $app.save(r)
      const a = new Record($app.findCollectionByNameOrId('auth_audit'))
      a.set('actor_id', auth.id)
      a.set('target_id', r.id)
      a.set('action', ativo ? 'feriado.ativado' : 'feriado.desativado')
      a.set('outcome', 'success')
      a.set('details', { data: r.getString('data').slice(0, 10), nome: r.getString('nome') })
      $app.save(a)
    }
    return e.json(200, { id: r.id, ativo: ativo })
  },
  $apis.requireAuth('users'),
)
