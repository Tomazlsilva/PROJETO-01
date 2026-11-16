// SPEC-2-004 (T2.11/T2.12) — emissão da disciplina e correções após a emissão.
// Ver: quem enxerga o projeto (administrativo consulta). Registrar/cancelar emissão e
// registrar/decidir correção: coordenador do projeto ou admin/diretor (403 auditado p/ demais).
// Emissão só com a última rodada de revisão aprovada; marca a entrega como entregue quando
// todas as disciplinas dela estão emitidas. Sem entrega no calendário, a emissão cria uma.
// Correção válida volta o card para "Em correção" (se estava aprovado) e cria a atividade
// de correção na fila do responsável da disciplina, ligada à emissão.

// ---------- consulta ----------
routerAdd(
  'GET',
  '/backend/v1/cards/{id}/emissoes',
  (e) => {
    const su = e.hasSuperuserAuth()
    const auth = e.auth
    if (!su) {
      const expira = auth ? auth.getString('session_expires_at') : ''
      if (
        !auth ||
        !auth.getBool('active') ||
        !expira ||
        new Date(expira.replace(' ', 'T')) <= new Date()
      )
        throw new UnauthorizedError('Sessão inválida ou expirada.')
    }
    let card = null
    let p = null
    try {
      card = $app.findRecordById('projeto_disciplinas', e.request.pathValue('id'))
      p = $app.findRecordById('projetos', card.getString('projeto'))
    } catch (_) {}
    if (
      !card ||
      !p ||
      !$app.canAccessRecord(p, e.requestInfo(), $app.findCollectionByNameOrId('projetos').viewRule)
    )
      throw new ForbiddenError('Acesso negado.')
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
    const papel = su ? 'admin' : auth.getString('role')
    const pode =
      !p.getBool('arquivado') &&
      (papel === 'admin' || (papel === 'coordenador' && p.getString('coordenador') === auth.id))
    const ult = $app.findRecordsByFilter('revisao_rodadas', 'card = {:c}', '-numero', 1, 0, {
      c: card.id,
    })
    const aprovada =
      ult.length > 0 &&
      ult[0].getString('status') === 'encerrada' &&
      (ult[0].getString('resultado') === 'aprovado' ||
        ult[0].getString('resultado') === 'aprovado_com_excecao')
    const emissoes = $app.findRecordsByFilter('emissoes', 'card = {:c}', '-created', 0, 0, {
      c: card.id,
    })
    const entregas = $app
      .findRecordsByFilter('entregas', 'projeto = {:p}', 'data', 0, 0, { p: p.id })
      .filter((x) => {
        const ds = x.getStringSlice('disciplinas')
        return ds.length === 0 || ds.indexOf(card.id) >= 0
      })
      .map((x) => ({
        id: x.id,
        tipo: x.getString('tipo'),
        data: x.getString('data').slice(0, 10),
        descricao: x.getString('descricao'),
        numero_revisao: x.getInt('numero_revisao'),
        principal: x.getBool('principal'),
        entregue: x.getBool('entregue'),
        emitida_aqui: emissoes.some(
          (m) => m.getString('entrega') === x.id && m.getString('status') === 'emitida',
        ),
      }))
    const entregaDe = {}
    for (const x of entregas) entregaDe[x.id] = x
    const ap = $app.findRecordsByFilter(
      'checklists_aplicados',
      "card = {:c} && tipo = 'revisao'",
      '',
      1,
      0,
      { c: card.id },
    )
    const itensRev =
      ap.length > 0
        ? JSON.parse(ap[0].getString('itens') || '[]').map((i) => ({ id: i.id, texto: i.texto }))
        : []
    const correcoes = $app.findRecordsByFilter(
      'correcoes_pos_emissao',
      'card = {:c}',
      '-created',
      0,
      0,
      { c: card.id },
    )
    let rodadaNum = {}
    for (const r of $app.findRecordsByFilter('revisao_rodadas', 'card = {:c}', '', 0, 0, {
      c: card.id,
    }))
      rodadaNum[r.id] = r.getInt('numero')
    return e.json(200, {
      etapa: card.getString('etapa'),
      aprovada: aprovada,
      rodada:
        ult.length > 0
          ? {
              id: ult[0].id,
              numero: ult[0].getInt('numero'),
              resultado: ult[0].getString('resultado'),
            }
          : null,
      entregas: entregas,
      itens_revisao: itensRev,
      emissoes: emissoes.map((m) => {
        let ent = entregaDe[m.getString('entrega')]
        if (!ent) {
          try {
            const x = $app.findRecordById('entregas', m.getString('entrega'))
            ent = {
              id: x.id,
              tipo: x.getString('tipo'),
              data: x.getString('data').slice(0, 10),
              descricao: x.getString('descricao'),
            }
          } catch (_) {
            ent = null
          }
        }
        return {
          id: m.id,
          rotulo: m.getString('rotulo'),
          tipo: m.getString('tipo'),
          data: m.getString('data').slice(0, 10),
          destinatario: m.getString('destinatario'),
          responsavel: pessoa(m.getString('responsavel')),
          status: m.getString('status'),
          entrega: ent,
          entrega_criada: m.getBool('entrega_criada'),
          rodada: rodadaNum[m.getString('rodada')] || null,
          cancelamento: m.getString('cancelamento'),
          cancelada_por: pessoa(m.getString('cancelada_por')),
          cancelada_em: m.getString('cancelada_em'),
          autor: pessoa(m.getString('autor')),
          created: m.getString('created'),
          versao: m.getString('updated'),
        }
      }),
      correcoes: correcoes.map((c) => {
        let atv = null
        if (c.getString('atividade')) {
          try {
            const a = $app.findRecordById('atividades', c.getString('atividade'))
            atv = {
              id: a.id,
              status: a.getString('status'),
              destinatario: pessoa(a.getString('destinatario')),
            }
          } catch (_) {}
        }
        return {
          id: c.id,
          emissao: c.getString('emissao'),
          origem: c.getString('origem'),
          severidade: c.getString('severidade'),
          descricao: c.getString('descricao'),
          item_texto: c.getString('item_texto'),
          decisao: c.getString('decisao'),
          justificativa: c.getString('justificativa'),
          decidido_por: pessoa(c.getString('decidido_por')),
          decidido_em: c.getString('decidido_em'),
          atividade: atv,
          historico: (JSON.parse(c.getString('historico') || '[]') || []).map((h) => ({
            em: h.em,
            por: pessoa(h.por),
            de: h.de,
            para: h.para,
            justificativa: h.justificativa,
          })),
          autor: pessoa(c.getString('autor')),
          created: c.getString('created'),
          versao: c.getString('updated'),
        }
      }),
      pode_emitir: pode,
    })
  },
  $apis.requireAuth(),
)

// ---------- registrar emissão ----------
routerAdd(
  'POST',
  '/backend/v1/cards/{id}/emissoes',
  (e) => {
    const su = e.hasSuperuserAuth()
    const auth = e.auth
    const id = e.request.pathValue('id')
    if (!su) {
      const expira = auth ? auth.getString('session_expires_at') : ''
      if (
        !auth ||
        !auth.getBool('active') ||
        !expira ||
        new Date(expira.replace(' ', 'T')) <= new Date()
      )
        throw new UnauthorizedError('Sessão inválida ou expirada.')
    }
    let card = null
    let p = null
    try {
      card = $app.findRecordById('projeto_disciplinas', id)
      p = $app.findRecordById('projetos', card.getString('projeto'))
    } catch (_) {}
    const papel = su ? 'admin' : auth.getString('role')
    if (
      !card ||
      !p ||
      !(papel === 'admin' || (papel === 'coordenador' && p.getString('coordenador') === auth.id))
    ) {
      try {
        const a = new Record($app.findCollectionByNameOrId('auth_audit'))
        a.set('actor_id', su ? '' : auth.id)
        a.set('action', 'access.denied')
        a.set('outcome', 'blocked')
        a.set('details', {
          recurso: 'emissoes',
          operacao: 'registrar',
          id: String(id).slice(0, 32),
        })
        $app.save(a)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Só o coordenador do projeto ou o administrador registram emissões.')
    }
    const conflito = (code, message) => e.json(409, { code: code, message: message })
    if (p.getBool('arquivado'))
      return conflito('projeto_arquivado', 'Projeto arquivado: restaure-o antes.')
    const body = e.requestInfo().body || {}
    const ruim = (campo, msg) => {
      const d = {}
      d[campo] = new ValidationError('invalido', msg)
      throw new BadRequestError(msg, d)
    }
    const dataOk = (d) =>
      typeof d === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(d) &&
      new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) === d
    const rotulo =
      typeof body.rotulo === 'string' ? body.rotulo.trim().toUpperCase().slice(0, 20) : ''
    if (!rotulo) ruim('rotulo', 'Informe a revisão (ex.: R00).')
    const data = typeof body.data === 'string' ? body.data.trim() : ''
    if (!dataOk(data)) ruim('data', 'Informe a data da emissão.')
    const destinatario =
      typeof body.destinatario === 'string' ? body.destinatario.trim().slice(0, 300) : ''
    if (destinatario.length < 2) ruim('destinatario', 'Informe para quem foi emitido.')
    let resp = null
    try {
      resp = $app.findRecordById(
        'users',
        typeof body.responsavel === 'string' ? body.responsavel : '',
      )
    } catch (_) {}
    if (!resp || !resp.getBool('active')) ruim('responsavel', 'Escolha o responsável pela emissão.')
    const entregaId = typeof body.entrega === 'string' ? body.entrega : ''
    const tipoNovo = typeof body.tipo === 'string' ? body.tipo : ''
    if (!entregaId && ['previa', 'final', 'revisao', 'outro'].indexOf(tipoNovo) < 0)
      ruim('entrega', 'Escolha a entrega do calendário ou o tipo da entrega a criar.')
    const numDig = /(\d+)/.exec(rotulo)
    const numero = numDig ? parseInt(numDig[1], 10) : 0
    const ator = su ? '' : auth.id
    const agora = new Date().toISOString()
    let falha = null
    let res = null
    const PARAR = '__falha_emissao__'
    try {
      $app.runInTransaction((tx) => {
        const parar = (st, code, msg) => {
          falha = { status: st, code: code, message: msg }
          throw new Error(PARAR)
        }
        const c = tx.findRecordById('projeto_disciplinas', id)
        const ult = tx.findRecordsByFilter('revisao_rodadas', 'card = {:c}', '-numero', 1, 0, {
          c: id,
        })
        const okRev =
          ult.length > 0 &&
          ult[0].getString('status') === 'encerrada' &&
          (ult[0].getString('resultado') === 'aprovado' ||
            ult[0].getString('resultado') === 'aprovado_com_excecao')
        if (!okRev || c.getString('etapa') !== 'aprovado')
          parar(
            409,
            'sem_aprovacao',
            'A emissão só pode ser registrada depois da revisão aprovada (card em "Aprovado").',
          )
        const colH = tx.findCollectionByNameOrId('entrega_historico')
        const hist = (ent, acaoH, antes, depois, det) => {
          const h = new Record(colH)
          h.set('entrega', ent.id)
          h.set('projeto', p.id)
          h.set('acao', acaoH)
          h.set('antes', antes || '')
          h.set('depois', depois || '')
          if (ator) h.set('autor', ator)
          h.set('detalhes', det || {})
          tx.save(h)
        }
        let ent = null
        let criada = false
        if (entregaId) {
          try {
            ent = tx.findRecordById('entregas', entregaId)
          } catch (_) {}
          if (!ent || ent.getString('projeto') !== p.id)
            parar(400, 'entrega', 'Entrega não encontrada neste projeto.')
          const ds = ent.getStringSlice('disciplinas')
          if (ds.length > 0 && ds.indexOf(id) < 0)
            parar(400, 'entrega', 'Esta entrega não inclui esta disciplina.')
          if (
            tx.findRecordsByFilter(
              'emissoes',
              "card = {:c} && entrega = {:e} && status = 'emitida'",
              '',
              1,
              0,
              {
                c: id,
                e: ent.id,
              },
            ).length > 0
          )
            parar(409, 'ja_emitida', 'Esta disciplina já tem emissão registrada para esta entrega.')
        } else {
          // sem entrega no calendário: a emissão cria a entrega e registra que foi criada aqui
          ent = new Record(tx.findCollectionByNameOrId('entregas'))
          ent.set('projeto', p.id)
          ent.set('tipo', tipoNovo)
          ent.set('data', data + ' 12:00:00.000Z')
          ent.set('descricao', 'Criada na emissão ' + rotulo)
          ent.set('disciplinas', [id])
          ent.set('origem', 'central')
          ent.set('principal', false)
          if (tipoNovo === 'revisao') {
            const u = tx.findRecordsByFilter(
              'entregas',
              "projeto = {:p} && tipo = 'revisao'",
              '-numero_revisao',
              1,
              0,
              {
                p: p.id,
              },
            )
            ent.set('numero_revisao', u.length ? u[0].getInt('numero_revisao') + 1 : 1)
          }
          tx.save(ent)
          criada = true
          hist(ent, 'criada', '', data, { origem: 'emissão', tipo: tipoNovo, rotulo: rotulo })
        }
        const m = new Record(tx.findCollectionByNameOrId('emissoes'))
        m.set('card', id)
        m.set('projeto', p.id)
        m.set('rodada', ult[0].id)
        m.set('entrega', ent.id)
        m.set('tipo', ent.getString('tipo'))
        m.set('rotulo', rotulo)
        m.set('numero_revisao', numero)
        m.set('data', data + ' 12:00:00.000Z')
        m.set('destinatario', destinatario)
        m.set('responsavel', resp.id)
        m.set('status', 'emitida')
        m.set('entrega_criada', criada)
        if (ator) m.set('autor', ator)
        tx.save(m)
        // entrega fica entregue quando todas as disciplinas dela estão emitidas
        const ds = ent.getStringSlice('disciplinas')
        const alvo = ds.length > 0 ? ds : [id]
        let todas = true
        for (const cid of alvo) {
          if (
            tx.findRecordsByFilter(
              'emissoes',
              "card = {:c} && entrega = {:e} && status = 'emitida'",
              '',
              1,
              0,
              {
                c: cid,
                e: ent.id,
              },
            ).length === 0
          )
            todas = false
        }
        if (todas && !ent.getBool('entregue')) {
          const ag = agora.replace('T', ' ')
          ent.set('entregue', true)
          ent.set('entregue_em', ag)
          if (ator) ent.set('entregue_por', ator)
          tx.save(ent)
          hist(ent, 'entregue', '', ag.slice(0, 16), { origem: 'emissão', rotulo: rotulo })
        }
        const t = new Record(tx.findCollectionByNameOrId('transicoes'))
        t.set('card', id)
        t.set('projeto', p.id)
        t.set('tipo', 'alteracao')
        t.set('de', c.getString('etapa'))
        t.set('para', c.getString('etapa'))
        t.set('justificativa', 'Emissão ' + rotulo + ' para ' + destinatario)
        if (ator) t.set('autor', ator)
        t.set('detalhes', {
          emissao: m.id,
          rotulo: rotulo,
          entrega: ent.id,
          entrega_criada: criada,
          mudancas: [],
        })
        tx.save(t)
        res = {
          id: m.id,
          entrega: ent.id,
          entrega_criada: criada,
          entregue: ent.getBool('entregue'),
        }
      })
    } catch (err) {
      if (!falha) throw err
    }
    if (falha) return e.json(falha.status, { code: falha.code, message: falha.message })
    return e.json(201, res)
  },
  $apis.requireAuth(),
)

// ---------- cancelar emissão / registrar correção após emissão ----------
routerAdd(
  'POST',
  '/backend/v1/cards/{id}/emissoes/{emissao}/{acao}',
  (e) => {
    const su = e.hasSuperuserAuth()
    const auth = e.auth
    const id = e.request.pathValue('id')
    const acao = e.request.pathValue('acao')
    if (!su) {
      const expira = auth ? auth.getString('session_expires_at') : ''
      if (
        !auth ||
        !auth.getBool('active') ||
        !expira ||
        new Date(expira.replace(' ', 'T')) <= new Date()
      )
        throw new UnauthorizedError('Sessão inválida ou expirada.')
    }
    if (acao !== 'cancelar' && acao !== 'correcao') throw new NotFoundError('Ação desconhecida.')
    let card = null
    let p = null
    let m = null
    try {
      card = $app.findRecordById('projeto_disciplinas', id)
      p = $app.findRecordById('projetos', card.getString('projeto'))
      m = $app.findRecordById('emissoes', e.request.pathValue('emissao'))
    } catch (_) {}
    const papel = su ? 'admin' : auth.getString('role')
    if (
      !card ||
      !p ||
      !m ||
      m.getString('card') !== id ||
      !(papel === 'admin' || (papel === 'coordenador' && p.getString('coordenador') === auth.id))
    ) {
      try {
        const a = new Record($app.findCollectionByNameOrId('auth_audit'))
        a.set('actor_id', su ? '' : auth.id)
        a.set('action', 'access.denied')
        a.set('outcome', 'blocked')
        a.set('details', { recurso: 'emissoes', operacao: acao, id: String(id).slice(0, 32) })
        $app.save(a)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Só o coordenador do projeto ou o administrador fazem isso.')
    }
    if (p.getBool('arquivado'))
      return e.json(409, {
        code: 'projeto_arquivado',
        message: 'Projeto arquivado: restaure-o antes.',
      })
    const body = e.requestInfo().body || {}
    const ruim = (campo, msg) => {
      const d = {}
      d[campo] = new ValidationError('invalido', msg)
      throw new BadRequestError(msg, d)
    }
    const ator = su ? '' : auth.id
    const agora = new Date().toISOString()

    if (acao === 'cancelar') {
      const just =
        typeof body.justificativa === 'string' ? body.justificativa.trim().slice(0, 1000) : ''
      if (just.length < 3) ruim('justificativa', 'Informe por que a emissão está sendo cancelada.')
      let situacao = 'ok'
      $app.runInTransaction((tx) => {
        const mm = tx.findRecordById('emissoes', m.id)
        if (mm.getString('status') !== 'emitida') {
          situacao = 'ja'
          return
        }
        if (typeof body.versao !== 'string' || body.versao !== mm.getString('updated')) {
          situacao = 'conflito'
          return
        }
        mm.set('status', 'cancelada')
        mm.set('cancelamento', just)
        if (ator) mm.set('cancelada_por', ator)
        mm.set('cancelada_em', agora)
        tx.save(mm)
        // a entrega deixa de estar entregue se esta emissão era necessária
        let ent = null
        try {
          ent = tx.findRecordById('entregas', mm.getString('entrega'))
        } catch (_) {}
        if (ent && ent.getBool('entregue')) {
          ent.set('entregue', false)
          ent.set('entregue_em', '')
          ent.set('entregue_por', '')
          tx.save(ent)
          const h = new Record(tx.findCollectionByNameOrId('entrega_historico'))
          h.set('entrega', ent.id)
          h.set('projeto', p.id)
          h.set('acao', 'entrega_desfeita')
          if (ator) h.set('autor', ator)
          h.set('detalhes', {
            origem: 'emissão cancelada',
            rotulo: mm.getString('rotulo'),
            justificativa: just,
          })
          tx.save(h)
        }
        const t = new Record(tx.findCollectionByNameOrId('transicoes'))
        t.set('card', id)
        t.set('projeto', p.id)
        t.set('tipo', 'alteracao')
        t.set('de', card.getString('etapa'))
        t.set('para', card.getString('etapa'))
        t.set('justificativa', 'Emissão ' + mm.getString('rotulo') + ' cancelada: ' + just)
        if (ator) t.set('autor', ator)
        t.set('detalhes', { emissao: mm.id, cancelada: true, mudancas: [] })
        tx.save(t)
      })
      if (situacao === 'ja')
        return e.json(409, { code: 'ja_cancelada', message: 'Esta emissão já está cancelada.' })
      if (situacao === 'conflito')
        return e.json(409, {
          code: 'conflito_edicao',
          message: 'A emissão foi alterada por outra pessoa. Atualize e tente de novo.',
        })
      return e.json(200, { ok: true })
    }

    // ---- correção após a emissão ----
    if (m.getString('status') !== 'emitida')
      return e.json(409, { code: 'cancelada', message: 'Emissão cancelada não recebe correções.' })
    const origem = body.origem
    const severidade = body.severidade
    if (['cliente', 'obra', 'interna'].indexOf(origem) < 0)
      ruim('origem', 'Escolha a origem: cliente, obra ou interna.')
    if (['alta', 'media', 'baixa'].indexOf(severidade) < 0)
      ruim('severidade', 'Escolha a severidade.')
    const descricao = typeof body.descricao === 'string' ? body.descricao.trim().slice(0, 2000) : ''
    if (descricao.length < 3) ruim('descricao', 'Descreva a correção.')
    const decisao = body.decisao
    if (decisao !== 'valida' && decisao !== 'invalida')
      ruim('decisao', 'Decida se a correção é válida ou inválida.')
    const justificativa =
      typeof body.justificativa === 'string' ? body.justificativa.trim().slice(0, 1000) : ''
    if (decisao === 'invalida' && justificativa.length < 3)
      ruim('justificativa', 'Explique por que a correção é inválida.')
    let itemId = ''
    let itemTexto = ''
    if (typeof body.item === 'string' && body.item) {
      const ap = $app.findRecordsByFilter(
        'checklists_aplicados',
        "card = {:c} && tipo = 'revisao'",
        '',
        1,
        0,
        { c: id },
      )
      const it =
        ap.length > 0
          ? JSON.parse(ap[0].getString('itens') || '[]').find((x) => x.id === body.item)
          : null
      if (!it) ruim('item', 'Item do checklist não encontrado.')
      itemId = it.id
      itemTexto = String(it.texto || '').slice(0, 500)
    }
    let res = null
    $app.runInTransaction((tx) => {
      const cr = new Record(tx.findCollectionByNameOrId('correcoes_pos_emissao'))
      cr.set('emissao', m.id)
      cr.set('card', id)
      cr.set('projeto', p.id)
      cr.set('origem', origem)
      cr.set('severidade', severidade)
      cr.set('descricao', descricao)
      cr.set('item_id', itemId)
      cr.set('item_texto', itemTexto)
      cr.set('decisao', decisao)
      cr.set('justificativa', justificativa)
      if (ator) {
        cr.set('decidido_por', ator)
        cr.set('autor', ator)
      }
      cr.set('decidido_em', agora)
      cr.set('historico', [])
      tx.save(cr)
      let atividade = ''
      let moveu = false
      if (decisao === 'valida') {
        const c = tx.findRecordById('projeto_disciplinas', id)
        const etapaAntes = c.getString('etapa')
        if (etapaAntes === 'aprovado' && !c.getBool('bloqueado')) {
          c.set('etapa', 'em_correcao')
          tx.save(c)
          moveu = true
          const t = new Record(tx.findCollectionByNameOrId('transicoes'))
          t.set('card', id)
          t.set('projeto', p.id)
          t.set('tipo', 'transicao')
          t.set('de', etapaAntes)
          t.set('para', 'em_correcao')
          t.set(
            'justificativa',
            'Correção após emissão ' + m.getString('rotulo') + ': ' + descricao.slice(0, 500),
          )
          if (ator) t.set('autor', ator)
          t.set('detalhes', { classe: 'correcao_pos_emissao', emissao: m.id, correcao: cr.id })
          tx.save(t)
        }
        const dest = c.getString('responsavel') || p.getString('coordenador')
        const at = new Record(tx.findCollectionByNameOrId('atividades'))
        at.set('chave', 'correcao:' + cr.id)
        at.set('card', id)
        at.set('projeto', p.id)
        at.set('etapa', 'em_correcao')
        at.set('etapa_origem', etapaAntes)
        if (dest) at.set('destinatario', dest)
        if (ator) at.set('remetente', ator)
        at.set('status', 'pendente')
        at.set('precisa_ajuste', false)
        at.set(
          'motivo_ajuste',
          ('Correção após emissão ' + m.getString('rotulo') + ': ' + descricao).slice(0, 300),
        )
        tx.save(at)
        atividade = at.id
        cr.set('atividade', at.id)
        tx.save(cr)
        if (dest) {
          let disc = ''
          try {
            disc = tx.findRecordById('disciplinas', c.getString('disciplina')).getString('nome')
          } catch (_) {}
          const n = new Record(tx.findCollectionByNameOrId('notificacoes'))
          n.set('destinatario', dest)
          n.set('atividade', at.id)
          n.set('card', id)
          n.set('projeto', p.id)
          n.set('titulo', 'Correção após emissão: ' + disc + ' — ' + p.getString('nome'))
          n.set('texto', (m.getString('rotulo') + ' · ' + descricao).slice(0, 300))
          n.set('lida', false)
          tx.save(n)
        }
      }
      res = { id: cr.id, atividade: atividade, card_em_correcao: moveu }
    })
    return e.json(201, res)
  },
  $apis.requireAuth(),
)

// ---------- rever a decisão de uma correção (válida ↔ inválida) ----------
routerAdd(
  'POST',
  '/backend/v1/cards/{id}/correcoes/{correcao}/decisao',
  (e) => {
    const su = e.hasSuperuserAuth()
    const auth = e.auth
    const id = e.request.pathValue('id')
    if (!su) {
      const expira = auth ? auth.getString('session_expires_at') : ''
      if (
        !auth ||
        !auth.getBool('active') ||
        !expira ||
        new Date(expira.replace(' ', 'T')) <= new Date()
      )
        throw new UnauthorizedError('Sessão inválida ou expirada.')
    }
    let card = null
    let p = null
    let cr = null
    try {
      card = $app.findRecordById('projeto_disciplinas', id)
      p = $app.findRecordById('projetos', card.getString('projeto'))
      cr = $app.findRecordById('correcoes_pos_emissao', e.request.pathValue('correcao'))
    } catch (_) {}
    const papel = su ? 'admin' : auth.getString('role')
    if (
      !card ||
      !p ||
      !cr ||
      cr.getString('card') !== id ||
      !(papel === 'admin' || (papel === 'coordenador' && p.getString('coordenador') === auth.id))
    ) {
      try {
        const a = new Record($app.findCollectionByNameOrId('auth_audit'))
        a.set('actor_id', su ? '' : auth.id)
        a.set('action', 'access.denied')
        a.set('outcome', 'blocked')
        a.set('details', { recurso: 'correcoes', operacao: 'decisao', id: String(id).slice(0, 32) })
        $app.save(a)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Só o coordenador do projeto ou o administrador decidem.')
    }
    const body = e.requestInfo().body || {}
    const decisao = body.decisao
    const just =
      typeof body.justificativa === 'string' ? body.justificativa.trim().slice(0, 1000) : ''
    if (decisao !== 'valida' && decisao !== 'invalida')
      throw new BadRequestError('Decisão inválida.', {
        decisao: new ValidationError('invalido', 'Decisão inválida.'),
      })
    if (just.length < 3)
      throw new BadRequestError('Informe o motivo da mudança.', {
        justificativa: new ValidationError('obrigatorio', 'Informe o motivo da mudança.'),
      })
    const ator = su ? '' : auth.id
    const agora = new Date().toISOString()
    let situacao = 'ok'
    $app.runInTransaction((tx) => {
      const c = tx.findRecordById('correcoes_pos_emissao', cr.id)
      if (typeof body.versao !== 'string' || body.versao !== c.getString('updated')) {
        situacao = 'conflito'
        return
      }
      if (c.getString('decisao') === decisao) {
        situacao = 'mesma'
        return
      }
      const hist = JSON.parse(c.getString('historico') || '[]') || []
      hist.push({
        em: agora,
        por: ator,
        de: c.getString('decisao'),
        para: decisao,
        justificativa: just,
      })
      c.set('historico', hist)
      c.set('decisao', decisao)
      c.set('justificativa', just)
      if (ator) c.set('decidido_por', ator)
      c.set('decidido_em', agora)
      const m = tx.findRecordById('emissoes', c.getString('emissao'))
      if (decisao === 'invalida') {
        // a atividade de correção ainda aberta é cancelada; o card não volta sozinho de etapa
        if (c.getString('atividade')) {
          try {
            const a = tx.findRecordById('atividades', c.getString('atividade'))
            if (a.getString('status') === 'pendente' || a.getString('status') === 'recebida') {
              a.set('status', 'cancelada')
              a.set('encerrada_em', agora.replace('T', ' '))
              if (ator) a.set('encerrada_por', ator)
              a.set('encerramento', 'Correção considerada inválida: ' + just.slice(0, 200))
              tx.save(a)
            }
          } catch (_) {}
        }
      } else {
        const cd = tx.findRecordById('projeto_disciplinas', id)
        const etapaAntes = cd.getString('etapa')
        if (etapaAntes === 'aprovado' && !cd.getBool('bloqueado')) {
          cd.set('etapa', 'em_correcao')
          tx.save(cd)
          const t = new Record(tx.findCollectionByNameOrId('transicoes'))
          t.set('card', id)
          t.set('projeto', p.id)
          t.set('tipo', 'transicao')
          t.set('de', etapaAntes)
          t.set('para', 'em_correcao')
          t.set(
            'justificativa',
            'Correção após emissão ' +
              m.getString('rotulo') +
              ' considerada válida: ' +
              just.slice(0, 300),
          )
          if (ator) t.set('autor', ator)
          t.set('detalhes', { classe: 'correcao_pos_emissao', emissao: m.id, correcao: c.id })
          tx.save(t)
        }
        const dest = cd.getString('responsavel') || p.getString('coordenador')
        const at = new Record(tx.findCollectionByNameOrId('atividades'))
        at.set('chave', 'correcao:' + c.id + ':' + hist.length)
        at.set('card', id)
        at.set('projeto', p.id)
        at.set('etapa', 'em_correcao')
        at.set('etapa_origem', etapaAntes)
        if (dest) at.set('destinatario', dest)
        if (ator) at.set('remetente', ator)
        at.set('status', 'pendente')
        at.set('precisa_ajuste', false)
        at.set(
          'motivo_ajuste',
          (
            'Correção após emissão ' +
            m.getString('rotulo') +
            ': ' +
            c.getString('descricao')
          ).slice(0, 300),
        )
        tx.save(at)
        c.set('atividade', at.id)
      }
      tx.save(c)
    })
    if (situacao === 'conflito')
      return e.json(409, {
        code: 'conflito_edicao',
        message: 'A correção foi alterada por outra pessoa. Atualize e tente de novo.',
      })
    if (situacao === 'mesma')
      return e.json(409, { code: 'mesma_decisao', message: 'A decisão já é essa.' })
    return e.json(200, { ok: true })
  },
  $apis.requireAuth(),
)
