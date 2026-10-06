// SPEC-1-002 (CA-1-002-03/05) — troca o responsável de uma disciplina do projeto.
// Sem responsável informado, herda o coordenador de forma explícita.
// Registra antes/depois, autor e horário.
routerAdd(
  'PATCH',
  '/backend/v1/projetos/{id}/disciplinas/{pdId}',
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
    const id = e.request.pathValue('id')
    const pdId = e.request.pathValue('pdId')
    const negar = (motivo) => {
      try {
        const a = new Record($app.findCollectionByNameOrId('auth_audit'))
        a.set('actor_id', auth.id)
        a.set('action', 'access.denied')
        a.set('outcome', 'blocked')
        a.set('details', {
          recurso: 'projeto_disciplinas',
          operacao: 'update',
          id: String(id).slice(0, 32),
          motivo: motivo,
        })
        $app.save(a)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Acesso negado.')
    }
    let projeto = null
    try {
      projeto = $app.findRecordById('projetos', id)
    } catch (_) {}
    if (!projeto) negar('inexistente')
    const info = e.requestInfo()
    if (!$app.canAccessRecord(projeto, info, $app.findCollectionByNameOrId('projetos').viewRule))
      negar('sem_vinculo')
    if (
      papel !== 'admin' &&
      !(papel === 'coordenador' && projeto.getString('coordenador') === auth.id)
    ) {
      negar('sem_permissao_edicao')
    }
    let pd = null
    try {
      pd = $app.findRecordById('projeto_disciplinas', pdId)
    } catch (_) {}
    if (!pd || pd.getString('projeto') !== id) negar('disciplina_de_outro_projeto')
    if (projeto.getBool('arquivado')) {
      return e.json(409, {
        code: 'projeto_arquivado',
        message: 'Projeto arquivado não pode ser editado. Restaure-o antes.',
      })
    }

    const body = info.body || {}
    const coordId = projeto.getString('coordenador')
    const novo = body.responsavel ? String(body.responsavel) : ''
    let u = null
    if (novo) {
      try {
        u = $app.findRecordById('users', novo)
      } catch (_) {}
      if (!u || !u.getBool('active')) {
        throw new BadRequestError('Revise os campos destacados.', {
          responsavel: new ValidationError('invalido', 'Responsável inválido.'),
        })
      }
    }
    const nomeDe = (uid) => {
      try {
        return $app.findRecordById('users', uid).getString('name') || uid
      } catch (_) {
        return uid
      }
    }
    let disciplinaNome = ''
    try {
      disciplinaNome = $app
        .findRecordById('disciplinas', pd.getString('disciplina'))
        .getString('nome')
    } catch (_) {}

    const antesId = pd.getString('responsavel')
    const antesHerdado = pd.getBool('responsavel_herdado')
    const depoisId = novo || coordId
    if (antesId === depoisId && antesHerdado === !novo) return e.json(200, { id: pdId })

    $app.runInTransaction((tx) => {
      const r = tx.findRecordById('projeto_disciplinas', pdId)
      r.set('responsavel', depoisId)
      r.set('responsavel_herdado', !novo)
      tx.save(r)
      if (novo && novo !== coordId) {
        const p = tx.findRecordById('projetos', id)
        const membros = p.getStringSlice('membros')
        if (membros.indexOf(novo) < 0) {
          membros.push(novo)
          p.set('membros', membros)
          tx.save(p)
        }
      }
      const h = new Record(tx.findCollectionByNameOrId('projeto_historico'))
      h.set('projeto', id)
      h.set('autor', auth.id)
      h.set('acao', 'editado')
      h.set('campo', 'responsavel')
      h.set('antes', nomeDe(antesId) + (antesHerdado ? ' (herdado)' : ''))
      h.set('depois', nomeDe(depoisId) + (novo ? '' : ' (herdado)'))
      h.set('detalhes', { disciplina: disciplinaNome })
      tx.save(h)
    })
    return e.json(200, { id: pdId })
  },
  $apis.requireAuth('users'),
)
