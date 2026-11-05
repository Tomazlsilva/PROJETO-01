// SPEC-1-008 (T1.42) — linha do tempo do projeto: todas as entregas, em ordem de data,
// com pessoas, situação e o histórico completo (antes/depois, autor, horário).
//   GET /backend/v1/entregas/projeto/{id}
// Quem vê o projeto (regra de visibilidade de projetos) ou tem "vê o cronograma".
routerAdd(
  'GET',
  '/backend/v1/entregas/projeto/{id}',
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
    const id = String(e.request.pathValue('id') || '')
    let projeto = null
    try {
      projeto = $app.findRecordById('projetos', id)
    } catch (_) {}
    const pode =
      !!projeto &&
      (auth.getBool('ve_cronograma') ||
        $app.canAccessRecord(
          projeto,
          e.requestInfo(),
          $app.findCollectionByNameOrId('projetos').viewRule,
        ))
    if (!pode) {
      try {
        const a = new Record($app.findCollectionByNameOrId('auth_audit'))
        a.set('actor_id', auth.id)
        a.set('action', 'access.denied')
        a.set('outcome', 'blocked')
        a.set('details', { recurso: 'entregas', operacao: 'linha_do_tempo', id: id.slice(0, 32) })
        $app.save(a)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Acesso negado.')
    }
    const papel = auth.getString('role')
    const nomes = {}
    const pessoa = (uid) => {
      if (!uid) return null
      if (!nomes[uid]) {
        let nome = '—'
        try {
          const u = $app.findRecordById('users', uid)
          nome = u.getString('name') || u.getString('email').split('@')[0]
        } catch (_) {}
        nomes[uid] = { id: uid, nome: nome }
      }
      return nomes[uid]
    }
    const disc = {}
    const cardNome = (cid) => {
      if (disc[cid] === undefined) {
        let n = '—'
        try {
          const c = $app.findRecordById('projeto_disciplinas', cid)
          n = $app.findRecordById('disciplinas', c.getString('disciplina')).getString('nome')
        } catch (_) {}
        disc[cid] = n
      }
      return disc[cid]
    }
    const entregas = $app
      .findRecordsByFilter('entregas', 'projeto = {:p}', 'data,created', 0, 0, { p: id })
      .map((r) => ({
        id: r.id,
        tipo: r.getString('tipo'),
        descricao: r.getString('descricao'),
        data: r.getString('data').slice(0, 10),
        principal: r.getBool('principal'),
        numero_revisao: r.getInt('numero_revisao'),
        entregue: r.getBool('entregue'),
        entregue_em: r.getString('entregue_em'),
        entregue_por: pessoa(r.getString('entregue_por')),
        art_pendente: r.getBool('art_pendente'),
        art_entregue: r.getBool('art_entregue'),
        art_em: r.getString('art_em'),
        origem: r.getString('origem'),
        disciplinas: r
          .getStringSlice('disciplinas')
          .map((cid) => ({ card_id: cid, nome: cardNome(cid) })),
        alocacoes: $app
          .findRecordsByFilter('entrega_alocacoes', 'entrega = {:e}', 'inicio', 0, 0, { e: r.id })
          .map((a) => ({
            id: a.id,
            pessoa: pessoa(a.getString('pessoa')),
            pessoa_texto: a.getString('pessoa_texto'),
            inicio: a.getString('inicio').slice(0, 10),
            fim: a.getString('fim').slice(0, 10),
            janela_definida: a.getBool('janela_definida'),
          })),
        versao: r.getString('updated'),
      }))
    const historico = $app
      .findRecordsByFilter('entrega_historico', 'projeto = {:p}', '-created', 500, 0, { p: id })
      .map((h) => {
        let det = {}
        try {
          det = JSON.parse(h.getString('detalhes') || '{}') || {}
        } catch (_) {}
        return {
          id: h.id,
          entrega: h.getString('entrega'),
          acao: h.getString('acao'),
          antes: h.getString('antes'),
          depois: h.getString('depois'),
          detalhes: det,
          autor: pessoa(h.getString('autor')),
          created: h.getString('created'),
        }
      })
    return e.json(200, {
      projeto: {
        id: projeto.id,
        nome: projeto.getString('nome'),
        prazo: projeto.getString('prazo').slice(0, 10),
        coordenador: pessoa(projeto.getString('coordenador')),
      },
      pode_editar:
        papel === 'admin' ||
        (papel === 'coordenador' && projeto.getString('coordenador') === auth.id),
      entregas: entregas,
      historico: historico,
    })
  },
  $apis.requireAuth('users'),
)
