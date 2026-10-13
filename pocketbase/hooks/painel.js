// SPEC-1-007 (T1.32–T1.34, T1.37) — painel executivo, drill-down e exportação.
//   GET /backend/v1/painel                       → resumo (cards do painel)
//   GET /backend/v1/painel?metrica=X             → registros que compõem a métrica X
//   GET /backend/v1/painel?metrica=X&formato=csv → os mesmos registros em CSV (auditado)
// Métricas: projetos, etapa:<chave>, atrasados, bloqueados, carga, movimentacoes,
//           touch_time, completude, adocao.
// Filtros: de, ate (AAAA-MM-DD, fuso de Brasília; padrão = últimos 30 dias), projeto,
//          disciplina, etapa, responsavel.
// Escopo: administrador e executivo veem tudo; coordenador só os projetos que coordena;
//         demais → 403. Executivo só lê agregados: sem nomes e sem exportação.
// Fórmulas (CA-1-007-13): completude = conclusões de etapa (elaboração/correção/revisão) com
//   apontamento válido na etapa ÷ conclusões no período; adoção = usuários vinculados com ao
//   menos uma transição, bloqueio, handoff, alteração, registro de projeto ou apontamento
//   válido no período ÷ usuários ativos vinculados aos projetos do recorte, por papel.
// Limiar (CA-1-007-14): abaixo de 80% → inconclusivo; o touch time depende dos dois.
routerAdd(
  'GET',
  '/backend/v1/painel',
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
    const metrica = String(q.get('metrica') || '').slice(0, 40)
    const csv = String(q.get('formato') || '') === 'csv'
    const auditar = (action, outcome, details) => {
      try {
        const r = new Record($app.findCollectionByNameOrId('auth_audit'))
        r.set('actor_id', auth.id)
        r.set('action', action)
        r.set('outcome', outcome)
        r.set('details', details)
        $app.save(r)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', action)
      }
    }
    const filtrosTxt = {}
    for (const k of ['de', 'ate', 'projeto', 'disciplina', 'etapa', 'responsavel']) {
      const v = String(q.get(k) || '').trim()
      if (v) filtrosTxt[k] = v.slice(0, 40)
    }
    if (papel !== 'admin' && papel !== 'executivo' && papel !== 'coordenador') {
      auditar(csv ? 'export.negado' : 'access.denied', 'blocked', {
        recurso: 'painel',
        metrica: metrica,
        filtros: filtrosTxt,
      })
      throw new ForbiddenError('Acesso negado.')
    }
    if (csv && papel !== 'admin' && papel !== 'coordenador') {
      auditar('export.negado', 'blocked', {
        recurso: 'painel',
        metrica: metrica,
        filtros: filtrosTxt,
        motivo: 'papel_sem_exportacao',
      })
      throw new ForbiddenError('Acesso negado.')
    }
    const ocultarNomes = papel === 'executivo'

    // ---- período (fuso de Brasília) ----
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
    const somaDias = (d, n) =>
      new Date(new Date(d + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10)
    const dataOk = (d) =>
      /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) === d
    const de = filtrosTxt.de || somaDias(hoje, -29)
    const ate = filtrosTxt.ate || hoje
    if (!dataOk(de) || !dataOk(ate) || de > ate) {
      throw new BadRequestError('Período inválido.', {
        periodo: new ValidationError('invalido', 'Use datas AAAA-MM-DD com início antes do fim.'),
      })
    }
    if ((new Date(ate) - new Date(de)) / 86400000 > 366) {
      throw new BadRequestError('Período grande demais.', {
        periodo: new ValidationError('grande', 'Escolha um período de até 1 ano.'),
      })
    }
    const iniUTC = de + ' 03:00:00.000Z'
    const fimUTC = somaDias(ate, 1) + ' 03:00:00.000Z'

    // ---- escopo e filtros ----
    const params = { v: auth.id, ini: iniUTC, fim: fimUTC }
    const partes = (p) => {
      const l = [p + 'projeto.arquivado = false']
      if (papel === 'coordenador') l.push(p + 'projeto.coordenador = {:v}')
      if (filtrosTxt.projeto) l.push(p + 'projeto = {:fp}')
      if (filtrosTxt.disciplina) l.push(p + 'disciplina = {:fd}')
      if (filtrosTxt.etapa) l.push(p + 'etapa = {:fe}')
      if (filtrosTxt.responsavel) l.push(p + 'responsavel = {:fr}')
      return l.join(' && ')
    }
    params.fp = filtrosTxt.projeto || ''
    params.fd = filtrosTxt.disciplina || ''
    params.fe = filtrosTxt.etapa || ''
    params.fr = filtrosTxt.responsavel || ''
    if (filtrosTxt.projeto) {
      let p = null
      try {
        p = $app.findRecordById('projetos', filtrosTxt.projeto)
      } catch (_) {}
      if (!p || (papel === 'coordenador' && p.getString('coordenador') !== auth.id)) {
        auditar(csv ? 'export.negado' : 'access.denied', 'blocked', {
          recurso: 'painel',
          metrica: metrica,
          filtros: filtrosTxt,
          motivo: 'fora_do_escopo',
        })
        throw new ForbiddenError('Acesso negado.')
      }
    }

    const versoes = $app.findRecordsByFilter('fluxo_versoes', 'ativa = true', '-numero', 1, 0)
    const cfg = versoes.length > 0 ? JSON.parse(versoes[0].getString('config')) : { etapas: [] }
    const etapasCfg = (cfg.etapas || []).slice().sort((a, b) => a.ordem - b.ordem)
    const nomeEtapa = (k) => {
      const et = etapasCfg.find((x) => x.chave === k)
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
    const nomeUsuario = (uid) => {
      const u = uid ? pegar('users', uid) : null
      return u ? u.getString('name') || u.getString('email').split('@')[0] : '—'
    }
    const pessoa = (uid) => (ocultarNomes || !uid ? null : { id: uid, nome: nomeUsuario(uid) })

    // ---- cards do recorte (estado atual) ----
    const cards = $app.findRecordsByFilter(
      'projeto_disciplinas',
      partes(''),
      'created',
      0,
      0,
      params,
    )
    const filtroDeCard = !!(filtrosTxt.disciplina || filtrosTxt.etapa || filtrosTxt.responsavel)
    let projetosRec
    if (filtroDeCard) {
      const vistos = {}
      projetosRec = []
      for (const c of cards) {
        const pid = c.getString('projeto')
        if (!vistos[pid]) {
          vistos[pid] = true
          const p = pegar('projetos', pid)
          if (p) projetosRec.push(p)
        }
      }
    } else {
      const lp = ['arquivado = false']
      if (papel === 'coordenador') lp.push('coordenador = {:v}')
      if (filtrosTxt.projeto) lp.push('id = {:fp}')
      projetosRec = $app.findRecordsByFilter('projetos', lp.join(' && '), 'nome', 0, 0, params)
    }
    const infoCard = (c) => {
      const p = pegar('projetos', c.getString('projeto'))
      const d = pegar('disciplinas', c.getString('disciplina'))
      const prazo =
        c.getString('prazo').slice(0, 10) || (p ? p.getString('prazo').slice(0, 10) : '')
      const revisao = c.getString('bloqueio_revisao').slice(0, 10)
      return {
        card_id: c.id,
        projeto_id: c.getString('projeto'),
        projeto: p ? p.getString('nome') : '—',
        disciplina: d ? d.getString('nome') : '—',
        etapa: nomeEtapa(c.getString('etapa')),
        responsavel: pessoa(c.getString('responsavel')),
        prioridade: c.getString('prioridade') || (p ? p.getString('prioridade') : '') || 'Normal',
        prazo: prazo,
        atrasado: !!prazo && prazo < hoje && c.getString('etapa') !== 'aprovado',
        bloqueado: c.getBool('bloqueado'),
        bloqueio_motivo: c.getBool('bloqueado') ? c.getString('bloqueio_motivo') : '',
        bloqueio_revisao: c.getBool('bloqueado') ? revisao : '',
        bloqueio_vencido: c.getBool('bloqueado') && !!revisao && revisao < hoje,
      }
    }
    const cardsInfo = cards.map(infoCard)
    const abertos = cardsInfo.filter((c, i) => cards[i].getString('etapa') !== 'aprovado')

    // ---- período: movimentações, apontamentos, completude e adoção ----
    const periodo = ' && created >= {:ini} && created < {:fim}'
    const movs = $app.findRecordsByFilter(
      'transicoes',
      partes('card.') + " && tipo = 'transicao'" + periodo,
      'created',
      0,
      0,
      params,
    )
    const validoTempo =
      "status = 'encerrado' && excluido = false && substituido = false && grupo = 'depois'"
    const apont = $app.findRecordsByFilter(
      'tempo_eventos',
      partes('card.') + ' && ' + validoTempo + ' && inicio >= {:ini} && inicio < {:fim}',
      'inicio',
      0,
      0,
      params,
    )
    // completude: conclusões de etapa de execução/revisão no período
    const conclusoes = movs.filter(
      (t) => ['em_elaboracao', 'em_correcao', 'aguardando_revisao'].indexOf(t.getString('de')) >= 0,
    )
    const comApontamento = {}
    for (const ev of $app.findRecordsByFilter(
      'tempo_eventos',
      partes('card.') + ' && ' + validoTempo,
      '',
      0,
      0,
      params,
    )) {
      comApontamento[ev.getString('card') + '|' + ev.getString('etapa')] = true
    }
    const itensCompletude = conclusoes.map((t) => {
      const c = pegar('projeto_disciplinas', t.getString('card'))
      const ic = c
        ? infoCard(c)
        : { projeto_id: t.getString('projeto'), projeto: '—', disciplina: '—' }
      return {
        transicao_id: t.id,
        card_id: t.getString('card'),
        projeto_id: ic.projeto_id,
        projeto: ic.projeto,
        disciplina: ic.disciplina,
        de: nomeEtapa(t.getString('de')),
        para: nomeEtapa(t.getString('para')),
        quando: t.getString('created'),
        preenchido: !!comApontamento[t.getString('card') + '|' + t.getString('de')],
      }
    })
    // adoção
    const vinculados = {}
    for (const p of projetosRec) {
      const ids = [p.getString('coordenador')].concat(p.getStringSlice('membros'))
      for (const uid of ids) {
        if (!uid || vinculados[uid]) continue
        const u = pegar('users', uid)
        if (u && u.getBool('active'))
          vinculados[uid] = { papel: u.getString('role') || 'sem_papel', registros: 0 }
      }
    }
    let registrosPeriodo = 0
    const contar = (uid) => {
      registrosPeriodo++
      if (uid && vinculados[uid]) vinculados[uid].registros++
    }
    for (const t of $app.findRecordsByFilter(
      'transicoes',
      partes('card.') + " && tipo != 'criacao' && autor != ''" + periodo,
      '',
      0,
      0,
      params,
    )) {
      contar(t.getString('autor'))
    }
    for (const ev of apont) contar(ev.getString('usuario'))
    if (projetosRec.length > 0) {
      const ids = projetosRec.map((p) => p.id)
      for (const h of $app.findRecordsByFilter(
        'projeto_historico',
        "autor != ''" + periodo,
        '',
        0,
        0,
        params,
      )) {
        if (ids.indexOf(h.getString('projeto')) >= 0) contar(h.getString('autor'))
      }
    }
    const itensAdocao = Object.keys(vinculados).map((uid) => ({
      usuario: pessoa(uid),
      papel: vinculados[uid].papel,
      ativo: vinculados[uid].registros > 0,
      registros: vinculados[uid].registros,
    }))

    // ---- registros de uma métrica (drill-down / CSV) ----
    const LIMITE = 5000
    if (metrica) {
      let itens = null
      if (metrica === 'projetos') {
        itens = projetosRec.map((p) => ({
          projeto_id: p.id,
          projeto: p.getString('nome'),
          coordenador: pessoa(p.getString('coordenador')),
          prazo: p.getString('prazo').slice(0, 10),
          prioridade: p.getString('prioridade'),
          cards: cardsInfo.filter((c) => c.projeto_id === p.id).length,
        }))
      } else if (metrica.indexOf('etapa:') === 0) {
        const k = metrica.slice(6)
        itens = cardsInfo.filter((c, i) => cards[i].getString('etapa') === k)
      } else if (metrica === 'atrasados') itens = cardsInfo.filter((c) => c.atrasado)
      else if (metrica === 'bloqueados') itens = cardsInfo.filter((c) => c.bloqueado)
      else if (metrica === 'carga') itens = abertos
      else if (metrica === 'movimentacoes') {
        itens = movs.map((t) => {
          const c = pegar('projeto_disciplinas', t.getString('card'))
          const ic = c
            ? infoCard(c)
            : { projeto_id: t.getString('projeto'), projeto: '—', disciplina: '—' }
          return {
            transicao_id: t.id,
            card_id: t.getString('card'),
            projeto_id: ic.projeto_id,
            projeto: ic.projeto,
            disciplina: ic.disciplina,
            de: nomeEtapa(t.getString('de')),
            para: nomeEtapa(t.getString('para')),
            quando: t.getString('created'),
            autor: pessoa(t.getString('autor')),
          }
        })
      } else if (metrica === 'touch_time') {
        itens = apont.map((ev) => ({
          apontamento_id: ev.id,
          card_id: ev.getString('card'),
          projeto_id: ev.getString('projeto'),
          projeto: ev.getString('projeto_nome'),
          disciplina: ev.getString('disciplina_nome'),
          etapa: nomeEtapa(ev.getString('etapa')),
          categoria: ev.getString('categoria'),
          inicio: ev.getString('inicio'),
          fim: ev.getString('fim'),
          duracao_seg: ev.getInt('duracao_seg'),
          usuario: pessoa(ev.getString('usuario')),
        }))
      } else if (metrica === 'completude') itens = itensCompletude
      else if (metrica === 'adocao') itens = itensAdocao
      if (itens === null)
        throw new BadRequestError('Métrica desconhecida.', {
          metrica: new ValidationError('invalida', 'Métrica desconhecida.'),
        })
      if (itens.length > LIMITE) {
        auditar(csv ? 'export.recusado' : 'painel.recusado', 'failure', {
          metrica: metrica,
          filtros: filtrosTxt,
          linhas: itens.length,
        })
        return e.json(400, {
          code: 'muito_grande',
          message:
            'Recorte grande demais (' +
            itens.length +
            ' registros). Reduza o período ou use filtros.',
        })
      }
      if (!csv)
        return e.json(200, {
          metrica: metrica,
          periodo: { de: de, ate: ate },
          total: itens.length,
          itens: itens,
        })
      // CSV
      const plano = (v) =>
        v === null || v === undefined
          ? ''
          : typeof v === 'boolean'
            ? v
              ? 'sim'
              : ''
            : typeof v === 'object'
              ? v.nome || ''
              : String(v)
      const esc = (s) => (/[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s)
      const colunas = itens.length > 0 ? Object.keys(itens[0]) : ['sem_registros']
      const linhas = [colunas.join(';')]
      for (const it of itens) linhas.push(colunas.map((c) => esc(plano(it[c]))).join(';'))
      auditar('export.csv', 'success', {
        metrica: metrica,
        filtros: Object.assign({ de: de, ate: ate }, filtrosTxt),
        linhas: itens.length,
      })
      e.response.header().set('Content-Type', 'text/csv; charset=utf-8')
      e.response
        .header()
        .set(
          'Content-Disposition',
          'attachment; filename="painel-' + metrica.replace(/[^a-z_]/gi, '_') + '.csv"',
        )
      return e.string(200, '﻿' + linhas.join('\r\n') + '\r\n')
    }

    // ---- resumo ----
    const taxa = (num, den) => (den > 0 ? Math.round((num / den) * 10000) / 10000 : null)
    const situacao = (num, den) =>
      den === 0 ? 'sem_dados' : num * 100 >= den * 80 ? 'conclusivo' : 'inconclusivo'
    const esperados = itensCompletude.length
    const preenchidos = itensCompletude.filter((x) => x.preenchido).length
    const completude = {
      esperados: esperados,
      preenchidos: preenchidos,
      taxa: taxa(preenchidos, esperados),
      situacao: situacao(preenchidos, esperados),
      motivo:
        esperados === 0
          ? 'Nenhuma etapa de elaboração, correção ou revisão foi concluída no período.'
          : preenchidos * 100 >= esperados * 80
            ? ''
            : 'Menos de 80% das etapas concluídas têm apontamento de tempo.',
    }
    const nVinc = itensAdocao.length
    const nAtivos = itensAdocao.filter((x) => x.ativo).length
    const porPapel = {}
    for (const it of itensAdocao) {
      if (!porPapel[it.papel]) porPapel[it.papel] = { vinculados: 0, ativos: 0, taxa: null }
      porPapel[it.papel].vinculados++
      if (it.ativo) porPapel[it.papel].ativos++
    }
    for (const k of Object.keys(porPapel))
      porPapel[k].taxa = taxa(porPapel[k].ativos, porPapel[k].vinculados)
    const semAtividade = registrosPeriodo === 0
    const adocao = {
      vinculados: nVinc,
      ativos: semAtividade ? null : nAtivos,
      taxa: semAtividade ? null : taxa(nAtivos, nVinc),
      por_papel: porPapel,
      situacao: semAtividade ? 'sem_dados' : situacao(nAtivos, nVinc),
      motivo: semAtividade
        ? 'Nenhum registro de uso no período.'
        : nAtivos * 100 >= nVinc * 80
          ? ''
          : 'Menos de 80% das pessoas vinculadas registraram uso no período.',
    }
    let elab = 0
    let rev = 0
    let esp = 0
    for (const ev of apont) {
      const s = ev.getInt('duracao_seg')
      const c = ev.getString('categoria')
      if (c === 'elaboracao') elab += s
      else if (c === 'revisao') rev += s
      else esp += s
    }
    const motivosTouch = []
    if (completude.situacao !== 'conclusivo')
      motivosTouch.push(
        'completude ' + (completude.situacao === 'sem_dados' ? 'sem dados' : 'abaixo de 80%'),
      )
    if (adocao.situacao !== 'conclusivo')
      motivosTouch.push(
        'adoção ' + (adocao.situacao === 'sem_dados' ? 'sem dados' : 'abaixo de 80%'),
      )
    const touch = {
      n_eventos: apont.length,
      touch_seg: apont.length ? elab + rev : null,
      elaboracao_seg: apont.length ? elab : null,
      revisao_seg: apont.length ? rev : null,
      espera_seg: apont.length ? esp : null,
      situacao:
        apont.length === 0 ? 'sem_dados' : motivosTouch.length ? 'inconclusivo' : 'conclusivo',
      motivo:
        apont.length === 0
          ? 'Nenhum apontamento no período.'
          : motivosTouch.length
            ? 'Depende de: ' + motivosTouch.join(' e ') + '.'
            : '',
    }
    let carga = null
    if (!ocultarNomes) {
      const porResp = {}
      for (const c of abertos) {
        const uid = c.responsavel ? c.responsavel.id : ''
        if (!porResp[uid])
          porResp[uid] = { responsavel: c.responsavel, valor: 0, atrasados: 0, bloqueados: 0 }
        porResp[uid].valor++
        if (c.atrasado) porResp[uid].atrasados++
        if (c.bloqueado) porResp[uid].bloqueados++
      }
      carga = Object.keys(porResp)
        .map((k) => porResp[k])
        .sort((a, b) =>
          (a.responsavel ? a.responsavel.nome : '') < (b.responsavel ? b.responsavel.nome : '')
            ? -1
            : 1,
        )
    }
    return e.json(200, {
      periodo: { de: de, ate: ate },
      filtros: filtrosTxt,
      escopo: papel === 'coordenador' ? 'equipe' : 'todos',
      somente_leitura: true,
      pode_exportar: papel === 'admin' || papel === 'coordenador',
      limiar: 0.8,
      projetos: { valor: projetosRec.length },
      etapas: etapasCfg.map((x) => ({
        chave: x.chave,
        nome: x.nome,
        ativa: x.ativa,
        valor: cards.filter((c) => c.getString('etapa') === x.chave).length,
      })),
      atrasados: { valor: cardsInfo.filter((c) => c.atrasado).length },
      bloqueados: {
        valor: cardsInfo.filter((c) => c.bloqueado).length,
        vencidos: cardsInfo.filter((c) => c.bloqueio_vencido).length,
      },
      carga: carga,
      movimentacoes: {
        valor: movs.length ? movs.length : null,
        situacao: movs.length ? 'ok' : 'sem_dados',
      },
      touch_time: touch,
      completude: completude,
      adocao: adocao,
    })
  },
  $apis.requireAuth('users'),
)
