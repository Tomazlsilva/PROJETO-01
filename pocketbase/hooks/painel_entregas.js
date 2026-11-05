// SPEC-1-008 (T1.44, CA-1-008-15) — métricas de entregas no painel.
//   GET /backend/v1/painel/entregas?de=&ate=                  → resumo
//   GET /backend/v1/painel/entregas?metrica=X                  → registros da métrica X
//   GET /backend/v1/painel/entregas?metrica=X&formato=csv      → CSV dos mesmos registros (auditado)
// Métricas: entregas (por dia/semana/tipo), carga, revisoes, ciclos, horas, fora_janela.
// Período padrão: últimos 30 dias (fuso de Brasília). Acesso completo, com nomes e
// exportação: administrador/diretor e administrativo; coordenador só nos projetos que
// coordena; projetista → 403 auditado. Horas abaixo de 80% de completude → inconclusivo
// (completude = entregas entregues no período com pelo menos um apontamento ÷ entregues).
routerAdd(
  'GET',
  '/backend/v1/painel/entregas',
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
    const papel = auth.getString('role')
    const q = e.request.url.query()
    const metrica = String(q.get('metrica') || '').slice(0, 30)
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
    if (papel !== 'admin' && papel !== 'administrativo' && papel !== 'coordenador') {
      auditar(csv ? 'export.negado' : 'access.denied', 'blocked', {
        recurso: 'painel_entregas',
        metrica: metrica,
      })
      throw new ForbiddenError('Acesso negado.')
    }
    const somaDias = (d, n) =>
      new Date(new Date(d + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10)
    const dataOk = (d) =>
      /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) === d
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
    const de = String(q.get('de') || '') || somaDias(hoje, -29)
    const ate = String(q.get('ate') || '') || hoje
    if (!dataOk(de) || !dataOk(ate) || de > ate || (new Date(ate) - new Date(de)) / 86400000 > 366)
      throw new BadRequestError('Período inválido.', {
        periodo: new ValidationError(
          'invalido',
          'Use datas AAAA-MM-DD, início antes do fim, até 1 ano.',
        ),
      })
    const iniUTC = de + ' 00:00:00.000Z'
    const fimUTC = somaDias(ate, 1) + ' 00:00:00.000Z'

    // ---------- escopo ----------
    const filtroP = ['arquivado = false']
    if (papel === 'coordenador') filtroP.push('coordenador = {:v}')
    const projetos = {}
    for (const p of $app.findRecordsByFilter('projetos', filtroP.join(' && '), 'nome', 0, 0, {
      v: auth.id,
    }))
      projetos[p.id] = p
    const cache = {}
    const pegar = (col, id) => {
      const k = col + ':' + id
      if (cache[k] === undefined) {
        try {
          cache[k] = id ? $app.findRecordById(col, id) : null
        } catch (_) {
          cache[k] = null
        }
      }
      return cache[k]
    }
    const nome = (uid) => {
      const u = pegar('users', uid)
      return u ? u.getString('name') || u.getString('email').split('@')[0] : ''
    }
    const clienteDe = (p) => {
      const c = pegar('clientes', p.getString('cliente'))
      return c ? c.getString('nome') : ''
    }
    const discNomes = (ent) =>
      ent
        .getStringSlice('disciplinas')
        .map((cid) => {
          const c = pegar('projeto_disciplinas', cid)
          const d = c ? pegar('disciplinas', c.getString('disciplina')) : null
          return d ? d.getString('nome') : ''
        })
        .filter((x) => x)
    const TIPO = { previa: 'Prévia', final: 'Final', revisao: 'Revisão', outro: 'Outro' }

    // feriados para dias úteis
    const feriados = {}
    for (const f of $app.findRecordsByFilter(
      'feriados',
      "ativo = true && abrangencia != 'ponto_facultativo'",
      '',
      0,
      0,
    ))
      feriados[f.getString('data').slice(0, 10)] = true
    const diasUteis = (a, b) => {
      if (!a || !b || a > b) return null
      let n = 0
      for (let d = somaDias(a, 1), i = 0; d <= b && i < 2000; d = somaDias(d, 1), i++) {
        const w = new Date(d + 'T12:00:00Z').getUTCDay()
        if (w !== 0 && w !== 6 && !feriados[d]) n++
      }
      return n
    }
    const diasCorridos = (a, b) =>
      a && b && a <= b ? Math.round((new Date(b) - new Date(a)) / 86400000) : null
    const segundaDe = (d) => {
      const w = new Date(d + 'T12:00:00Z').getUTCDay()
      return somaDias(d, w === 0 ? -6 : 1 - w)
    }

    // ---------- entregas do período ----------
    const todas = $app
      .findRecordsByFilter('entregas', 'data >= {:i} && data < {:f}', 'data', 0, 0, {
        i: iniUTC,
        f: fimUTC,
      })
      .filter((r) => !!projetos[r.getString('projeto')])
    const linhaEntrega = (r) => {
      const p = projetos[r.getString('projeto')]
      return {
        entrega_id: r.id,
        projeto_id: p.id,
        projeto: p.getString('nome'),
        cliente: clienteDe(p),
        tipo: TIPO[r.getString('tipo')] || r.getString('tipo'),
        numero_revisao: r.getInt('numero_revisao') || '',
        data: r.getString('data').slice(0, 10),
        semana: segundaDe(r.getString('data').slice(0, 10)),
        disciplinas: discNomes(r).join(', '),
        entregue: r.getBool('entregue'),
        art_entregue: r.getBool('art_entregue'),
      }
    }
    const itensEntregas = todas.map(linhaEntrega)

    // ---------- horas (apontamentos reais ligados às entregas do período) ----------
    const valido = "status = 'encerrado' && excluido = false && substituido = false"
    const apontPorEntrega = {}
    const itensHoras = []
    for (const r of todas) {
      for (const t of $app.findRecordsByFilter(
        'tempo_eventos',
        'entrega = {:e} && ' + valido,
        'inicio',
        0,
        0,
        {
          e: r.id,
        },
      )) {
        apontPorEntrega[r.id] = (apontPorEntrega[r.id] || 0) + 1
        itensHoras.push({
          apontamento_id: t.id,
          entrega_id: r.id,
          projeto: projetos[r.getString('projeto')].getString('nome'),
          tipo: TIPO[r.getString('tipo')] || r.getString('tipo'),
          data_entrega: r.getString('data').slice(0, 10),
          pessoa: nome(t.getString('usuario')),
          inicio: t.getString('inicio'),
          duracao_seg: t.getInt('duracao_seg'),
          fora_da_janela: t.getBool('fora_da_janela'),
        })
      }
    }
    const entregues = todas.filter((r) => r.getBool('entregue'))
    const comApont = entregues.filter((r) => apontPorEntrega[r.id] > 0).length
    const situacaoHoras =
      entregues.length === 0
        ? 'sem_dados'
        : comApont * 100 >= entregues.length * 80
          ? 'conclusivo'
          : 'inconclusivo'

    // ---------- apontamentos fora da janela (no período, pelo início) ----------
    const itensFora = []
    for (const t of $app.findRecordsByFilter(
      'tempo_eventos',
      'fora_da_janela = true && inicio >= {:i} && inicio < {:f} && ' + valido,
      'inicio',
      0,
      0,
      { i: iniUTC, f: fimUTC },
    )) {
      const r = pegar('entregas', t.getString('entrega'))
      if (!r || !projetos[r.getString('projeto')]) continue
      itensFora.push({
        apontamento_id: t.id,
        entrega_id: r.id,
        projeto: projetos[r.getString('projeto')].getString('nome'),
        tipo: TIPO[r.getString('tipo')] || r.getString('tipo'),
        pessoa: nome(t.getString('usuario')),
        inicio: t.getString('inicio'),
        duracao_seg: t.getInt('duracao_seg'),
      })
    }

    // ---------- carga por pessoa (sem ranking: ordem alfabética) ----------
    const carga = {}
    const idsEntregas = {}
    for (const a of $app.findRecordsByFilter(
      'entrega_alocacoes',
      "pessoa != '' && inicio < {:f} && fim >= {:i}",
      '',
      0,
      0,
      { i: iniUTC, f: fimUTC },
    )) {
      const r = pegar('entregas', a.getString('entrega'))
      if (!r || !projetos[r.getString('projeto')]) continue
      const uid = a.getString('pessoa')
      if (!carga[uid]) carga[uid] = { pessoa: nome(uid), dias: {}, abertas: 0 }
      const ini = a.getString('inicio').slice(0, 10) < de ? de : a.getString('inicio').slice(0, 10)
      const fim = a.getString('fim').slice(0, 10) > ate ? ate : a.getString('fim').slice(0, 10)
      for (let d = ini, i = 0; d <= fim && i < 400; d = somaDias(d, 1), i++)
        carga[uid].dias[d] = true
      const k = uid + '|' + r.id
      if (!idsEntregas[k] && !r.getBool('entregue')) {
        idsEntregas[k] = true
        carga[uid].abertas++
      }
    }
    const itensCarga = Object.keys(carga)
      .map((uid) => ({
        pessoa: carga[uid].pessoa,
        dias_em_janela: Object.keys(carga[uid].dias).length,
        entregas_em_aberto: carga[uid].abertas,
      }))
      .sort((a, b) => (a.pessoa < b.pessoa ? -1 : 1))

    // ---------- ciclos e revisões por projeto ----------
    const itensCiclos = []
    const itensRevisoes = []
    const idsProj = {}
    for (const r of todas) idsProj[r.getString('projeto')] = true
    for (const pid of Object.keys(idsProj)) {
      const p = projetos[pid]
      const ents = $app.findRecordsByFilter('entregas', 'projeto = {:p}', 'data', 0, 0, { p: pid })
      const dataDe = (r) => r.getString('data').slice(0, 10)
      const previa = ents.find((r) => r.getString('tipo') === 'previa')
      const final =
        ents.find((r) => r.getString('tipo') === 'final' && r.getBool('principal')) ||
        ents.find((r) => r.getString('tipo') === 'final')
      const revisoes = ents.filter(
        (r) => r.getString('tipo') === 'revisao' && (!final || dataDe(r) > dataDe(final)),
      )
      const ultimaRev = revisoes.length ? revisoes[revisoes.length - 1] : null
      itensCiclos.push({
        projeto_id: pid,
        projeto: p.getString('nome'),
        cliente: clienteDe(p),
        primeira_previa: previa ? dataDe(previa) : '',
        final: final ? dataDe(final) : '',
        ultima_revisao: ultimaRev ? dataDe(ultimaRev) : '',
        previa_final_dias: previa && final ? diasCorridos(dataDe(previa), dataDe(final)) : null,
        previa_final_uteis: previa && final ? diasUteis(dataDe(previa), dataDe(final)) : null,
        final_revisoes_dias:
          final && ultimaRev ? diasCorridos(dataDe(final), dataDe(ultimaRev)) : null,
        final_revisoes_uteis:
          final && ultimaRev ? diasUteis(dataDe(final), dataDe(ultimaRev)) : null,
        revisoes_depois_da_final: revisoes.length,
      })
      for (const rv of revisoes)
        for (const dn of discNomes(rv).length ? discNomes(rv) : ['(sem disciplina)'])
          itensRevisoes.push({
            entrega_id: rv.id,
            projeto: p.getString('nome'),
            cliente: clienteDe(p),
            disciplina: dn,
            numero_revisao: rv.getInt('numero_revisao'),
            data: dataDe(rv),
          })
    }

    // ---------- drill-down / CSV ----------
    if (metrica) {
      const MAPA = {
        entregas: itensEntregas,
        horas: itensHoras,
        fora_janela: itensFora,
        carga: itensCarga,
        ciclos: itensCiclos,
        revisoes: itensRevisoes,
      }
      const itens = MAPA[metrica]
      if (!itens)
        throw new BadRequestError('Métrica desconhecida.', {
          metrica: new ValidationError('invalida', 'Métrica desconhecida.'),
        })
      if (!csv)
        return e.json(200, {
          metrica: metrica,
          periodo: { de: de, ate: ate },
          total: itens.length,
          itens: itens,
        })
      const plano = (v) =>
        v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'sim' : '') : String(v)
      const esc = (s) => (/[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s)
      const colunas = itens.length > 0 ? Object.keys(itens[0]) : ['sem_registros']
      const linhas = [colunas.join(';')]
      for (const it of itens) linhas.push(colunas.map((c) => esc(plano(it[c]))).join(';'))
      auditar('export.csv', 'success', {
        recurso: 'painel_entregas',
        metrica: metrica,
        de: de,
        ate: ate,
        linhas: itens.length,
      })
      e.response.header().set('Content-Type', 'text/csv; charset=utf-8')
      e.response
        .header()
        .set('Content-Disposition', 'attachment; filename="entregas-' + metrica + '.csv"')
      return e.string(200, '﻿' + linhas.join('\r\n') + '\r\n')
    }

    // ---------- resumo ----------
    const contar = (lista, chave) => {
      const m = {}
      for (const x of lista) m[x[chave]] = (m[x[chave]] || 0) + 1
      return Object.keys(m)
        .sort()
        .map((k) => ({ chave: k, valor: m[k] }))
    }
    const media = (lista, campo) => {
      const v = lista.map((x) => x[campo]).filter((x) => x !== null && x !== undefined)
      return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null
    }
    const somaSeg = (lista) => lista.reduce((s, x) => s + x.duracao_seg, 0)
    const agrupaHoras = (chave) => {
      const m = {}
      for (const x of itensHoras) m[x[chave]] = (m[x[chave]] || 0) + x.duracao_seg
      return Object.keys(m)
        .sort()
        .map((k) => ({ chave: k, seg: m[k] }))
    }
    return e.json(200, {
      periodo: { de: de, ate: ate },
      escopo: papel === 'coordenador' ? 'equipe' : 'todos',
      pode_exportar: true,
      entregas: {
        total: itensEntregas.length,
        entregues: entregues.length,
        por_tipo: contar(itensEntregas, 'tipo'),
        por_semana: contar(itensEntregas, 'semana'),
        por_dia: contar(itensEntregas, 'data'),
      },
      carga: itensCarga,
      revisoes: {
        total: itensRevisoes.length,
        por_cliente: contar(itensRevisoes, 'cliente'),
        por_disciplina: contar(itensRevisoes, 'disciplina'),
        por_projeto: contar(itensRevisoes, 'projeto'),
      },
      ciclos: {
        projetos: itensCiclos.length,
        previa_final_dias: media(itensCiclos, 'previa_final_dias'),
        previa_final_uteis: media(itensCiclos, 'previa_final_uteis'),
        final_revisoes_dias: media(itensCiclos, 'final_revisoes_dias'),
        final_revisoes_uteis: media(itensCiclos, 'final_revisoes_uteis'),
      },
      horas: {
        total_seg: somaSeg(itensHoras),
        por_tipo: agrupaHoras('tipo'),
        por_pessoa: agrupaHoras('pessoa'),
        entregues: entregues.length,
        entregues_com_apontamento: comApont,
        situacao: situacaoHoras,
        motivo:
          situacaoHoras === 'sem_dados'
            ? 'Nenhuma entrega concluída no período.'
            : situacaoHoras === 'inconclusivo'
              ? 'Menos de 80% das entregas concluídas têm apontamento de horas.'
              : '',
      },
      fora_janela: { total: itensFora.length, seg: somaSeg(itensFora) },
    })
  },
  $apis.requireAuth('users'),
)
