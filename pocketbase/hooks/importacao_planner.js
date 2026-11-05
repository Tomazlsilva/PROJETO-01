// SPEC-1-008 (T1.46/T1.47, CA-1-008-14) — importação do Planner, só administrador/diretor.
//   GET  /backend/v1/importacao/planner           → simulação: lote, cartões (projeto existente
//                                                  ou a criar), linhas aceitas/rejeitadas com motivo
//                                                  e a correspondência de nomes
//   POST /backend/v1/importacao/planner/nomes     { nome, usuario } (vazio = fica como texto)
//   POST /backend/v1/importacao/planner/gravar    { confirmar: true }
//   POST /backend/v1/importacao/planner/desfazer  { confirmar: true }
// Gravação numa transação: cartão sem projeto com o mesmo nome vira projeto novo (coordenador =
// quem criou o cartão, se for coordenador; senão quem importa). Cada item aceito vira entrega
// (origem planner, lote), com as pessoas do texto (sem janela). Revisões numeradas por data.
// Desfazer: remove as entregas do lote que não foram mexidas depois (sem histórico nem horas)
// e arquiva os projetos criados pelo lote que ficaram vazios.
routerAdd(
  'GET',
  '/backend/v1/importacao/planner',
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
    const lotes = $app.findRecordsByFilter('planner_lotes', "id != ''", '-created', 1, 0)
    if (!lotes.length) return e.json(200, { lote: null })
    const lote = lotes[0]
    const norm = (v) => {
      let x = String(v || '').toUpperCase()
      try {
        x = x.normalize('NFD').replace(/[̀-ͯ]/g, '')
      } catch (_) {}
      return x.replace(/[^A-Z0-9]+/g, ' ').trim()
    }
    const porNome = {}
    for (const p of $app.findRecordsByFilter('projetos', "id != ''", '', 0, 0))
      porNome[norm(p.getString('nome'))] = p
    const nomes = $app
      .findRecordsByFilter('planner_nomes', 'lote = {:l}', 'nome', 0, 0, { l: lote.id })
      .map((n) => {
        let u = null
        try {
          if (n.getString('usuario')) {
            const r = $app.findRecordById('users', n.getString('usuario'))
            u = { id: r.id, nome: r.getString('name') || r.getString('email') }
          }
        } catch (_) {}
        return { nome: n.getString('nome'), ocorrencias: n.getInt('ocorrencias'), usuario: u }
      })
    const cartoes = {}
    for (const l of $app.findRecordsByFilter(
      'planner_linhas',
      'lote = {:l}',
      'cartao_nome,data',
      0,
      0,
      {
        l: lote.id,
      },
    )) {
      const k = l.getString('cartao_id')
      if (!cartoes[k]) {
        const p = porNome[norm(l.getString('cartao_nome'))]
        cartoes[k] = {
          cartao_id: k,
          nome: l.getString('cartao_nome'),
          balde: l.getString('balde'),
          criado_por: l.getString('criado_por'),
          projeto: p ? { id: p.id, nome: p.getString('nome') } : null,
          linhas: [],
        }
      }
      let pessoas = []
      let disc = []
      try {
        pessoas = JSON.parse(l.getString('pessoas') || '[]')
        disc = JSON.parse(l.getString('disciplinas') || '[]')
      } catch (_) {}
      cartoes[k].disciplinas = disc
      cartoes[k].linhas.push({
        id: l.id,
        item: l.getString('item'),
        tipo: l.getString('tipo'),
        data: l.getString('data').slice(0, 10),
        pessoas: pessoas,
        entregue: l.getBool('entregue'),
        art_pendente: l.getBool('art_pendente'),
        situacao: l.getString('situacao'),
        erro: l.getString('erro'),
        gravada: !!l.getString('entrega'),
      })
    }
    const lista = Object.keys(cartoes).map((k) => cartoes[k])
    const todas = lista.reduce((s, c) => s.concat(c.linhas), [])
    let resumo = {}
    try {
      resumo = JSON.parse(lote.getString('resumo') || '{}')
    } catch (_) {}
    return e.json(200, {
      lote: {
        id: lote.id,
        status: lote.getString('status'),
        exportado_em: lote.getString('exportado_em').slice(0, 10),
        inicio_recorte: lote.getString('inicio_recorte').slice(0, 10),
        gravado_em: lote.getString('gravado_em'),
        desfeito_em: lote.getString('desfeito_em'),
        resumo: resumo,
      },
      totais: {
        linhas: todas.length,
        aceitas: todas.filter((x) => x.situacao === 'aceita').length,
        rejeitadas: todas.filter((x) => x.situacao !== 'aceita').length,
        cartoes: lista.length,
        projetos_existentes: lista.filter((c) => c.projeto).length,
        projetos_novos: lista.filter(
          (c) => !c.projeto && c.linhas.some((x) => x.situacao === 'aceita'),
        ).length,
        nomes_sem_usuario: nomes.filter((n) => !n.usuario).length,
      },
      nomes: nomes,
      cartoes: lista,
    })
  },
  $apis.requireAuth('users'),
)

routerAdd(
  'POST',
  '/backend/v1/importacao/planner/{acao}',
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
    const acao = e.request.pathValue('acao')
    const auditar = (action, outcome, details) => {
      const a = new Record($app.findCollectionByNameOrId('auth_audit'))
      a.set('actor_id', auth.id)
      a.set('action', action)
      a.set('outcome', outcome)
      a.set('details', details)
      $app.save(a)
    }
    if (auth.getString('role') !== 'admin') {
      auditar('access.denied', 'blocked', { recurso: 'importacao_planner', operacao: acao })
      throw new ForbiddenError('Acesso negado.')
    }
    if (['nomes', 'gravar', 'desfazer'].indexOf(acao) < 0)
      throw new NotFoundError('Ação desconhecida.')
    const lotes = $app.findRecordsByFilter('planner_lotes', "id != ''", '-created', 1, 0)
    if (!lotes.length) throw new NotFoundError('Nenhum lote de importação.')
    const lote = lotes[0]
    const body = e.requestInfo().body || {}
    const status = lote.getString('status')

    if (acao === 'nomes') {
      if (status === 'desfeito')
        return e.json(409, { code: 'lote_desfeito', message: 'Este lote foi desfeito.' })
      const lista = $app.findRecordsByFilter(
        'planner_nomes',
        'lote = {:l} && nome = {:n}',
        '',
        1,
        0,
        {
          l: lote.id,
          n: String(body.nome || ''),
        },
      )
      if (!lista.length) throw new NotFoundError('Nome não encontrado no lote.')
      const uid = body.usuario ? String(body.usuario) : ''
      if (uid) {
        let u = null
        try {
          u = $app.findRecordById('users', uid)
        } catch (_) {}
        if (!u || !u.getBool('active'))
          throw new BadRequestError('Revise os campos destacados.', {
            usuario: new ValidationError('invalido', 'Usuário inválido ou inativo.'),
          })
      }
      const nomeReg = lista[0].getString('nome')
      const antigo = lista[0].getString('usuario')
      let alteradas = 0
      $app.runInTransaction((tx) => {
        const reg = tx.findRecordById('planner_nomes', lista[0].id)
        reg.set('usuario', uid)
        tx.save(reg)
        if (status !== 'gravado' || antigo === uid) return
        // Lote já gravado: corrige as pessoas das entregas em que o nome aparece no Planner
        for (const l of tx.findRecordsByFilter(
          'planner_linhas',
          "lote = {:l} && entrega != ''",
          '',
          0,
          0,
          {
            l: lote.id,
          },
        )) {
          let ps = []
          try {
            ps = JSON.parse(l.getString('pessoas') || '[]')
          } catch (_) {}
          if (ps.indexOf(nomeReg) < 0) continue
          const eid = l.getString('entrega')
          const filtro = antigo
            ? 'entrega = {:e} && pessoa = {:u}'
            : "entrega = {:e} && pessoa = '' && pessoa_texto = {:t}"
          for (const a of tx.findRecordsByFilter('entrega_alocacoes', filtro, '', 1, 0, {
            e: eid,
            u: antigo,
            t: nomeReg.slice(0, 80),
          })) {
            a.set('pessoa', uid)
            a.set('pessoa_texto', uid ? '' : nomeReg.slice(0, 80))
            tx.save(a)
            alteradas++
          }
          // a pessoa passa a ver o projeto (membro), se ainda não for
          if (uid) {
            try {
              const ent = tx.findRecordById('entregas', eid)
              const p = tx.findRecordById('projetos', ent.getString('projeto'))
              const membros = p.getStringSlice('membros')
              if (
                membros.indexOf(uid) < 0 &&
                p.getString('coordenador') !== uid &&
                membros.length < 50
              ) {
                membros.push(uid)
                p.set('membros', membros)
                tx.save(p)
              }
            } catch (_) {}
          }
        }
      })
      if (status === 'gravado')
        auditar('importacao.planner.nome_corrigido', 'success', {
          lote: lote.id,
          nome: nomeReg,
          antes: antigo,
          depois: uid,
          alocacoes: alteradas,
        })
      return e.json(200, { nome: nomeReg, usuario: uid, alocacoes_alteradas: alteradas })
    }

    if (body.confirmar !== true)
      throw new BadRequestError('Revise os campos destacados.', {
        confirmar: new ValidationError('obrigatorio', 'Confirme a operação.'),
      })
    const agora = new Date().toISOString().replace('T', ' ')

    if (acao === 'gravar') {
      if (status !== 'simulado')
        return e.json(409, {
          code: 'lote_gravado',
          message: 'Este lote já foi gravado ou desfeito.',
        })
      const norm = (v) => {
        let x = String(v || '').toUpperCase()
        try {
          x = x.normalize('NFD').replace(/[̀-ͯ]/g, '')
        } catch (_) {}
        return x.replace(/[^A-Z0-9]+/g, ' ').trim()
      }
      const resumo = { projetos_criados: [], entregas: 0, alocacoes: 0, pessoas_texto: 0 }
      $app.runInTransaction((tx) => {
        const mapa = {}
        for (const n of tx.findRecordsByFilter('planner_nomes', 'lote = {:l}', '', 0, 0, {
          l: lote.id,
        }))
          mapa[n.getString('nome')] = n.getString('usuario')
        const usuarios = tx.findRecordsByFilter('users', 'active = true', '', 0, 0)
        const porPrimeiroNome = {}
        for (const u of usuarios) porPrimeiroNome[norm(u.getString('name'))] = u
        const porNome = {}
        for (const p of tx.findRecordsByFilter('projetos', "id != ''", '', 0, 0))
          porNome[norm(p.getString('nome'))] = p
        const colP = tx.findCollectionByNameOrId('projetos')
        const colE = tx.findCollectionByNameOrId('entregas')
        const colA = tx.findCollectionByNameOrId('entrega_alocacoes')
        const linhas = tx.findRecordsByFilter(
          'planner_linhas',
          "lote = {:l} && situacao = 'aceita'",
          'cartao_nome,data',
          0,
          0,
          { l: lote.id },
        )
        const porCartao = {}
        for (const l of linhas) {
          const k = l.getString('cartao_id')
          if (!porCartao[k]) porCartao[k] = []
          porCartao[k].push(l)
        }
        for (const k of Object.keys(porCartao)) {
          const ls = porCartao[k]
          const nomeCartao = ls[0].getString('cartao_nome')
          let p = porNome[norm(nomeCartao)]
          const pessoasCartao = []
          for (const l of ls) {
            let ps = []
            try {
              ps = JSON.parse(l.getString('pessoas') || '[]')
            } catch (_) {}
            for (const n of ps)
              if (mapa[n] && pessoasCartao.indexOf(mapa[n]) < 0) pessoasCartao.push(mapa[n])
          }
          if (!p) {
            // coordenador: quem criou o cartão, se for coordenador/administrador ativo
            const criador = porPrimeiroNome[norm(ls[0].getString('criado_por'))]
            const papel = criador ? criador.getString('role') : ''
            p = new Record(colP)
            p.set('nome', nomeCartao.slice(0, 200))
            p.set(
              'coordenador',
              criador && (papel === 'coordenador' || papel === 'admin') ? criador.id : auth.id,
            )
            p.set('membros', pessoasCartao.slice(0, 50))
            p.set('arquivado', false)
            p.set('tipologia', 'Importado do Planner')
            tx.save(p)
            porNome[norm(nomeCartao)] = p
            resumo.projetos_criados.push(p.id)
            const h = new Record(tx.findCollectionByNameOrId('projeto_historico'))
            h.set('projeto', p.id)
            h.set('autor', auth.id)
            h.set('acao', 'criado')
            h.set('detalhes', { origem: 'importação do Planner', lote: lote.id, cartao: k })
            tx.save(h)
          } else if (pessoasCartao.length) {
            const membros = p.getStringSlice('membros')
            let mudou = false
            for (const uid of pessoasCartao)
              if (membros.indexOf(uid) < 0 && uid !== p.getString('coordenador')) {
                membros.push(uid)
                mudou = true
              }
            if (mudou) {
              p.set('membros', membros.slice(0, 50))
              tx.save(p)
            }
          }
          const ult = tx.findRecordsByFilter(
            'entregas',
            "projeto = {:p} && tipo = 'revisao'",
            '-numero_revisao',
            1,
            0,
            { p: p.id },
          )
          let numero = ult.length ? ult[0].getInt('numero_revisao') : 0
          for (const l of ls) {
            let ps = []
            let disc = []
            try {
              ps = JSON.parse(l.getString('pessoas') || '[]')
              disc = JSON.parse(l.getString('disciplinas') || '[]')
            } catch (_) {}
            const data = l.getString('data').slice(0, 10)
            const r = new Record(colE)
            r.set('projeto', p.id)
            r.set('tipo', l.getString('tipo'))
            r.set('descricao', l.getString('item').slice(0, 300))
            r.set('data', data + ' 12:00:00.000Z')
            r.set('disciplinas_texto', disc.join(', ').slice(0, 300))
            r.set('principal', false)
            if (l.getString('tipo') === 'revisao') r.set('numero_revisao', ++numero)
            r.set('entregue', l.getBool('entregue'))
            if (l.getBool('entregue')) r.set('entregue_em', data + ' 12:00:00.000Z')
            r.set('art_pendente', l.getBool('art_pendente'))
            r.set('origem', 'planner')
            r.set('lote_importacao', lote.id)
            tx.save(r)
            resumo.entregas++
            for (const n of ps) {
              const a = new Record(colA)
              a.set('entrega', r.id)
              if (mapa[n]) a.set('pessoa', mapa[n])
              else {
                a.set('pessoa_texto', n.slice(0, 80))
                resumo.pessoas_texto++
              }
              a.set('inicio', data + ' 12:00:00.000Z')
              a.set('fim', data + ' 12:00:00.000Z')
              a.set('janela_definida', false)
              tx.save(a)
              resumo.alocacoes++
            }
            l.set('entrega', r.id)
            tx.save(l)
          }
        }
        const lt = tx.findRecordById('planner_lotes', lote.id)
        lt.set('status', 'gravado')
        lt.set('gravado_em', agora)
        lt.set('gravado_por', auth.id)
        lt.set('resumo', resumo)
        tx.save(lt)
      })
      auditar('importacao.planner.gravada', 'success', {
        lote: lote.id,
        entregas: resumo.entregas,
        projetos_criados: resumo.projetos_criados.length,
        alocacoes: resumo.alocacoes,
      })
      return e.json(
        200,
        Object.assign({ lote: lote.id, status: 'gravado' }, resumo, {
          projetos_criados: resumo.projetos_criados.length,
        }),
      )
    }

    // desfazer
    if (status !== 'gravado')
      return e.json(409, { code: 'nao_gravado', message: 'Só um lote gravado pode ser desfeito.' })
    const res = {
      entregas_removidas: 0,
      entregas_mantidas: 0,
      projetos_removidos: 0,
      projetos_mantidos: 0,
    }
    $app.runInTransaction((tx) => {
      let resumo = {}
      try {
        resumo = JSON.parse(lote.getString('resumo') || '{}')
      } catch (_) {}
      for (const r of tx.findRecordsByFilter('entregas', 'lote_importacao = {:l}', '', 0, 0, {
        l: lote.id,
      })) {
        const mexida =
          tx.findRecordsByFilter('entrega_historico', 'entrega = {:e}', '', 1, 0, { e: r.id })
            .length > 0 ||
          tx.findRecordsByFilter('tempo_eventos', 'entrega = {:e}', '', 1, 0, { e: r.id }).length >
            0
        if (mexida) {
          res.entregas_mantidas++
          continue
        }
        for (const l of tx.findRecordsByFilter('planner_linhas', 'entrega = {:e}', '', 0, 0, {
          e: r.id,
        })) {
          l.set('entrega', '')
          tx.save(l)
        }
        for (const a of tx.findRecordsByFilter('entrega_alocacoes', 'entrega = {:e}', '', 0, 0, {
          e: r.id,
        }))
          tx.delete(a)
        tx.delete(r)
        res.entregas_removidas++
      }
      for (const pid of resumo.projetos_criados || []) {
        let p = null
        try {
          p = tx.findRecordById('projetos', pid)
        } catch (_) {}
        if (!p) continue
        const usado =
          tx.findRecordsByFilter('entregas', 'projeto = {:p}', '', 1, 0, { p: pid }).length > 0 ||
          tx.findRecordsByFilter('projeto_disciplinas', 'projeto = {:p}', '', 1, 0, { p: pid })
            .length > 0
        if (usado) {
          res.projetos_mantidos++
          continue
        }
        // o histórico do projeto é só de inclusão: o projeto vazio é arquivado, não apagado
        p.set('arquivado', true)
        tx.save(p)
        res.projetos_removidos++
      }
      const lt = tx.findRecordById('planner_lotes', lote.id)
      lt.set('status', 'desfeito')
      lt.set('desfeito_em', agora)
      lt.set('desfeito_por', auth.id)
      lt.set('resumo', Object.assign(resumo, { desfazer: res }))
      tx.save(lt)
    })
    auditar('importacao.planner.desfeita', 'success', Object.assign({ lote: lote.id }, res))
    return e.json(200, Object.assign({ lote: lote.id, status: 'desfeito' }, res))
  },
  $apis.requireAuth('users'),
)
