// SPEC-1-007 (T1.35, CA-1-007-07) — trilha de mudanças consultável, com filtros.
//   tipo: estado | prioridade | responsavel | prazo | bloqueio | handoff | tempo (vazio = todos)
//   projeto, de, ate (AAAA-MM-DD, Brasília), pagina (50 por página)
// Administrador vê tudo; coordenador só os projetos que coordena; demais → 403.
routerAdd(
  'GET',
  '/backend/v1/auditoria/mudancas',
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
    const q = e.request.url.query()
    const projeto = String(q.get('projeto') || '').slice(0, 32)
    const negar = (motivo) => {
      try {
        const r = new Record($app.findCollectionByNameOrId('auth_audit'))
        r.set('actor_id', auth.id)
        r.set('action', 'access.denied')
        r.set('outcome', 'blocked')
        r.set('details', { recurso: 'auditoria_mudancas', projeto: projeto, motivo: motivo })
        $app.save(r)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Acesso negado.')
    }
    if (papel !== 'admin' && papel !== 'coordenador') negar('papel')
    if (projeto) {
      let p = null
      try {
        p = $app.findRecordById('projetos', projeto)
      } catch (_) {}
      if (!p || (papel === 'coordenador' && p.getString('coordenador') !== auth.id))
        negar('fora_do_escopo')
    }
    const tipo = String(q.get('tipo') || '')
    const TIPOS = ['estado', 'prioridade', 'responsavel', 'prazo', 'bloqueio', 'handoff', 'tempo']
    if (tipo && TIPOS.indexOf(tipo) < 0)
      throw new BadRequestError('Tipo inválido.', {
        tipo: new ValidationError('invalido', 'Tipo inválido.'),
      })
    const dataOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d)
    const de = String(q.get('de') || '')
    const ate = String(q.get('ate') || '')
    const pagina = Math.max(1, parseInt(String(q.get('pagina') || '1'), 10) || 1)
    const params = { v: auth.id, p: projeto }
    const escopo = (prefixo) => {
      const l = []
      if (papel === 'coordenador') l.push(prefixo + 'coordenador = {:v}')
      if (projeto) l.push(prefixo.replace(/\.$/, '') + (prefixo ? '' : 'id') + ' = {:p}')
      return l
    }
    const periodo = (campo) => {
      const l = []
      if (dataOk(de)) {
        params.ini = de + ' 03:00:00.000Z'
        l.push(campo + ' >= {:ini}')
      }
      if (dataOk(ate)) {
        params.fim =
          new Date(new Date(ate + 'T12:00:00Z').getTime() + 86400000).toISOString().slice(0, 10) +
          ' 03:00:00.000Z'
        l.push(campo + ' < {:fim}')
      }
      return l
    }

    const versoes = $app.findRecordsByFilter('fluxo_versoes', 'ativa = true', '-numero', 1, 0)
    const cfg = versoes.length > 0 ? JSON.parse(versoes[0].getString('config')) : { etapas: [] }
    const nomeEtapa = (k) => {
      const et = (cfg.etapas || []).find((x) => x.chave === k)
      return et ? et.nome : k
    }
    const cache = {}
    const pegar = (col, id) => {
      const k = col + ':' + id
      if (cache[k] === undefined) {
        try {
          cache[k] = $app.findRecordById(col, id)
        } catch (_) {
          cache[k] = null
        }
      }
      return cache[k]
    }
    const pessoa = (uid) => {
      if (!uid) return null
      const u = pegar('users', uid)
      return { id: uid, nome: u ? u.getString('name') || u.getString('email').split('@')[0] : '—' }
    }
    const ctx = (cardId, projetoId) => {
      const c = cardId ? pegar('projeto_disciplinas', cardId) : null
      const p = projetoId ? pegar('projetos', projetoId) : null
      const d = c ? pegar('disciplinas', c.getString('disciplina')) : null
      return {
        card_id: cardId || '',
        projeto_id: projetoId || '',
        projeto: p ? p.getString('nome') : '',
        disciplina: d ? d.getString('nome') : '',
      }
    }
    const itens = []

    // transições do card (estado, alterações, bloqueios, handoffs)
    if (tipo !== 'tempo') {
      const tiposT = {
        estado: ["tipo = 'transicao'", "tipo = 'remapeamento'"],
        prioridade: ["tipo = 'alteracao'"],
        responsavel: ["tipo = 'alteracao'"],
        prazo: ["tipo = 'alteracao'"],
        bloqueio: ["tipo = 'bloqueio'", "tipo = 'desbloqueio'", "tipo = 'bloqueio_revisado'"],
        handoff: ["tipo = 'handoff'"],
      }
      const f = escopo('projeto.').concat(periodo('created'))
      f.push(tipo ? '(' + tiposT[tipo].join(' || ') + ')' : "tipo != 'criacao'")
      const lista = $app.findRecordsByFilter(
        'transicoes',
        f.join(' && '),
        '-created',
        2000,
        0,
        params,
      )
      for (const t of lista) {
        const tt = t.getString('tipo')
        let det = {}
        try {
          det = JSON.parse(t.getString('detalhes') || '{}') || {}
        } catch (_) {}
        const base = Object.assign(ctx(t.getString('card'), t.getString('projeto')), {
          id: t.id,
          quando: t.getString('created'),
          autor: pessoa(t.getString('autor')),
          justificativa: t.getString('justificativa'),
          origem: 'transicoes',
        })
        if (tt === 'alteracao') {
          for (const m of det.mudancas || []) {
            const cat = m.campo === 'revisor' ? 'responsavel' : m.campo
            if (tipo && cat !== tipo) continue
            itens.push(
              Object.assign({}, base, {
                tipo: cat,
                descricao: 'Alteração de ' + m.campo,
                campo: m.campo,
                antes: m.antes,
                depois: m.depois,
              }),
            )
          }
          continue
        }
        const cat =
          tt === 'transicao' || tt === 'remapeamento'
            ? 'estado'
            : tt === 'handoff'
              ? 'handoff'
              : 'bloqueio'
        const desc =
          cat === 'estado'
            ? (tt === 'remapeamento' ? 'Remapeado: ' : 'Etapa: ') +
              nomeEtapa(t.getString('de')) +
              ' → ' +
              nomeEtapa(t.getString('para'))
            : cat === 'handoff'
              ? 'Pendência ' + (det.acao || '')
              : tt === 'bloqueio'
                ? 'Bloqueado'
                : tt === 'desbloqueio'
                  ? 'Desbloqueado'
                  : 'Bloqueio revisado'
        itens.push(
          Object.assign({}, base, {
            tipo: cat,
            descricao: desc,
            antes: t.getString('de'),
            depois: t.getString('para'),
          }),
        )
      }
    }
    // apontamentos de tempo: correções, exclusões e revisões
    if (!tipo || tipo === 'tempo') {
      const f = escopo('projeto.').concat(periodo('updated'))
      f.push("(origem = 'correcao' || excluido = true || revisado = true)")
      for (const ev of $app.findRecordsByFilter(
        'tempo_eventos',
        f.join(' && '),
        '-updated',
        2000,
        0,
        params,
      )) {
        const base = Object.assign(ctx(ev.getString('card'), ev.getString('projeto')), {
          id: ev.id,
          tipo: 'tempo',
          origem: 'tempo_eventos',
        })
        if (ev.getString('origem') === 'correcao') {
          itens.push(
            Object.assign({}, base, {
              quando: ev.getString('created'),
              autor: pessoa(ev.getString('corrigido_por')),
              descricao: 'Correção de apontamento (substitui ' + ev.getString('substitui') + ')',
              justificativa: ev.getString('correcao_motivo'),
              depois: String(ev.getInt('duracao_seg')) + ' s',
            }),
          )
        }
        if (ev.getBool('excluido')) {
          itens.push(
            Object.assign({}, base, {
              quando: ev.getString('updated'),
              autor: pessoa(ev.getString('excluido_por')),
              descricao: 'Apontamento excluído do baseline',
              justificativa: ev.getString('exclusao_motivo'),
            }),
          )
        }
        if (ev.getBool('revisado')) {
          itens.push(
            Object.assign({}, base, {
              quando: ev.getString('updated'),
              autor: pessoa(ev.getString('revisado_por')),
              descricao: 'Timer esquecido revisado',
              justificativa: ev.getString('revisao_motivo'),
              depois: String(ev.getInt('duracao_seg')) + ' s',
            }),
          )
        }
      }
    }
    itens.sort((a, b) => (a.quando < b.quando ? 1 : a.quando > b.quando ? -1 : 0))
    const total = itens.length
    return e.json(200, {
      total: total,
      pagina: pagina,
      por_pagina: 50,
      itens: itens.slice((pagina - 1) * 50, pagina * 50),
    })
  },
  $apis.requireAuth('users'),
)
