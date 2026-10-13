// SPEC-1-002 — inclui disciplina em projeto existente, com responsável próprio
// ou herdado do coordenador (explícito), registrando no histórico.
// Aceita disciplina do catálogo (id) ou personalizada (nome livre, emenda 13/10).
routerAdd(
  'POST',
  '/backend/v1/projetos/{id}/disciplinas',
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
    const negar = (motivo) => {
      try {
        const a = new Record($app.findCollectionByNameOrId('auth_audit'))
        a.set('actor_id', auth.id)
        a.set('action', 'access.denied')
        a.set('outcome', 'blocked')
        a.set('details', {
          recurso: 'projeto_disciplinas',
          operacao: 'create',
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
    if (projeto.getBool('arquivado')) {
      return e.json(409, {
        code: 'projeto_arquivado',
        message: 'Projeto arquivado não pode ser editado. Restaure-o antes.',
      })
    }

    const body = info.body || {}
    const norm = (v) => {
      let x = String(v || '').toLowerCase()
      try {
        x = x.normalize('NFD').replace(/[̀-ͯ]/g, '')
      } catch (_) {}
      return x.replace(/[^a-z0-9]+/g, ' ').trim()
    }
    const invalida = (msg) => {
      throw new BadRequestError('Revise os campos destacados.', {
        disciplina: new ValidationError('invalida', msg),
      })
    }
    // Disciplina do catálogo (id) ou personalizada (nome livre)
    let d = null
    let novoNome = ''
    if (body.disciplina) {
      try {
        d = $app.findRecordById('disciplinas', String(body.disciplina))
      } catch (_) {}
      if (!d || !d.getBool('ativa')) invalida('Disciplina inválida.')
    } else {
      const livre =
        typeof body.disciplina_nome === 'string'
          ? body.disciplina_nome.trim().replace(/\s+/g, ' ')
          : ''
      if (livre.length < 2)
        invalida('Escolha uma disciplina ou digite o nome da disciplina personalizada.')
      if (livre.length > 80) invalida('Nome de disciplina muito longo (máximo 80).')
      for (const c of $app.findRecordsByFilter('disciplinas', "id != ''", '', 0, 0)) {
        if (norm(c.getString('nome')) === norm(livre)) {
          d = c
          break
        }
      }
      if (!d) novoNome = livre
    }
    if (d) {
      const ja = $app.findRecordsByFilter(
        'projeto_disciplinas',
        'projeto = {:p} && disciplina = {:d}',
        '',
        1,
        0,
        {
          p: id,
          d: d.id,
        },
      )
      if (ja.length > 0) {
        throw new BadRequestError('Revise os campos destacados.', {
          disciplina: new ValidationError('repetida', 'A disciplina já está no projeto.'),
        })
      }
    }
    const coordId = projeto.getString('coordenador')
    let resp = body.responsavel ? String(body.responsavel) : ''
    let respNome = ''
    if (resp) {
      let u = null
      try {
        u = $app.findRecordById('users', resp)
      } catch (_) {}
      if (!u || !u.getBool('active')) {
        throw new BadRequestError('Revise os campos destacados.', {
          responsavel: new ValidationError('invalido', 'Responsável inválido.'),
        })
      }
      respNome = u.getString('name')
    }

    let novoId = ''
    let discId = d ? d.id : ''
    let discNome = d ? d.getString('nome') : novoNome
    $app.runInTransaction((tx) => {
      if (!discId) {
        const nd = new Record(tx.findCollectionByNameOrId('disciplinas'))
        nd.set('nome', novoNome)
        nd.set('ativa', true)
        nd.set('personalizada', true)
        nd.set('criada_por', auth.id)
        tx.save(nd)
        discId = nd.id
      }
      const r = new Record(tx.findCollectionByNameOrId('projeto_disciplinas'))
      r.set('projeto', id)
      r.set('disciplina', discId)
      r.set('responsavel', resp || coordId)
      r.set('responsavel_herdado', !resp)
      tx.save(r)
      novoId = r.id
      if (resp && resp !== coordId) {
        const p = tx.findRecordById('projetos', id)
        const membros = p.getStringSlice('membros')
        if (membros.indexOf(resp) < 0) {
          membros.push(resp)
          p.set('membros', membros)
          tx.save(p)
        }
      }
      const h = new Record(tx.findCollectionByNameOrId('projeto_historico'))
      h.set('projeto', id)
      h.set('autor', auth.id)
      h.set('acao', 'disciplina_incluida')
      h.set('campo', 'disciplina')
      h.set(
        'depois',
        discNome +
          (d ? '' : ' (personalizada)') +
          ' — ' +
          (resp ? respNome : 'responsável herdado do coordenador'),
      )
      tx.save(h)
    })
    return e.json(201, { id: novoId })
  },
  $apis.requireAuth('users'),
)
