// SPEC-1-008 (T1.41/T1.42) — calendário de entregas.
//   GET /backend/v1/calendario?de=AAAA-MM-DD&ate=AAAA-MM-DD&projeto=&disciplina=&busca=
// Devolve as entregas com data no período ou com janela de execução que cruza o período,
// as janelas por pessoa, os feriados do período (gerados por regra na primeira consulta
// do ano) e o que cada um pode fazer.
// Escopo: administrador/diretor, administrativo e quem tem "vê o cronograma" → tudo;
// coordenador → projetos que coordena ou em que está; projetista → projetos em que está,
// no máximo 7 dias por consulta (a semana). Busca sem diferenciar acento e maiúscula.
routerAdd(
  'GET',
  '/backend/v1/calendario',
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
    const veTudo = papel === 'admin' || papel === 'administrativo' || auth.getBool('ve_cronograma')
    const q = e.request.url.query()
    const dataOk = (d) =>
      /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) === d
    const somaDias = (d, n) =>
      new Date(new Date(d + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10)
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
    const de = String(q.get('de') || '') || hoje
    const ate = String(q.get('ate') || '') || somaDias(de, 6)
    if (!dataOk(de) || !dataOk(ate) || de > ate) {
      throw new BadRequestError('Período inválido.', {
        periodo: new ValidationError('invalido', 'Use datas AAAA-MM-DD com início antes do fim.'),
      })
    }
    const dias = Math.round((new Date(ate) - new Date(de)) / 86400000) + 1
    const limite = veTudo || papel === 'coordenador' ? 62 : 7
    if (dias > limite) {
      throw new BadRequestError('Período grande demais.', {
        periodo: new ValidationError(
          'grande',
          limite === 7
            ? 'Projetista consulta uma semana por vez.'
            : 'Consulte até 2 meses por vez.',
        ),
      })
    }
    const fProjeto = String(q.get('projeto') || '').slice(0, 32)
    const fDisc = String(q.get('disciplina') || '').slice(0, 32)
    const norm = (v) => {
      let x = String(v || '').toLowerCase()
      try {
        x = x.normalize('NFD').replace(/[̀-ͯ]/g, '')
      } catch (_) {}
      return x.replace(/\s+/g, ' ').trim()
    }
    const busca = norm(String(q.get('busca') || '').slice(0, 100))

    // ---------- feriados: gerados por regra, uma vez por ano ----------
    const pascoa = (ano) => {
      const a = ano % 19
      const b = Math.floor(ano / 100)
      const c = ano % 100
      const d = Math.floor(b / 4)
      const ee = b % 4
      const f = Math.floor((b + 8) / 25)
      const g = Math.floor((b - f + 1) / 3)
      const h = (19 * a + b - d - g + 15) % 30
      const i = Math.floor(c / 4)
      const k = c % 4
      const l = (32 + 2 * ee + 2 * i - h - k) % 7
      const m = Math.floor((a + 11 * h + 22 * l) / 451)
      const mes = Math.floor((h + l - 7 * m + 114) / 31)
      const dia = ((h + l - 7 * m + 114) % 31) + 1
      return ano + '-' + String(mes).padStart(2, '0') + '-' + String(dia).padStart(2, '0')
    }
    const regras = (ano) => {
      const p = pascoa(ano)
      const fx = (md, nome, abr) => [ano + '-' + md, nome, abr]
      return [
        fx('01-01', 'Confraternização Universal', 'nacional'),
        fx('04-21', 'Tiradentes', 'nacional'),
        fx('05-01', 'Dia do Trabalho', 'nacional'),
        fx('09-07', 'Independência do Brasil', 'nacional'),
        fx('10-12', 'Nossa Senhora Aparecida', 'nacional'),
        fx('11-02', 'Finados', 'nacional'),
        fx('11-15', 'Proclamação da República', 'nacional'),
        fx('11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional'),
        fx('12-25', 'Natal', 'nacional'),
        [somaDias(p, -2), 'Sexta-feira Santa', 'nacional'],
        fx('07-09', 'Revolução Constitucionalista', 'estadual_sp'),
        fx('01-25', 'Aniversário de São Paulo', 'municipal_sp'),
        [somaDias(p, 60), 'Corpus Christi', 'municipal_sp'],
        [somaDias(p, -48), 'Carnaval (segunda-feira)', 'ponto_facultativo'],
        [somaDias(p, -47), 'Carnaval (terça-feira)', 'ponto_facultativo'],
        [somaDias(p, -46), 'Quarta-feira de Cinzas (meio expediente)', 'ponto_facultativo'],
        fx('12-24', 'Véspera de Natal', 'ponto_facultativo'),
        fx('12-31', 'Véspera de Ano-Novo', 'ponto_facultativo'),
      ]
    }
    const colFer = $app.findCollectionByNameOrId('feriados')
    for (let ano = Number(de.slice(0, 4)); ano <= Number(ate.slice(0, 4)); ano++) {
      const ja = $app.findRecordsByFilter(
        'feriados',
        "origem = 'gerado' && data >= {:i} && data < {:f}",
        '',
        1,
        0,
        { i: ano + '-01-01 00:00:00.000Z', f: ano + 1 + '-01-01 00:00:00.000Z' },
      )
      if (ja.length > 0) continue
      $app.runInTransaction((tx) => {
        for (const [d, nome, abr] of regras(ano)) {
          const r = new Record(colFer)
          r.set('data', d + ' 12:00:00.000Z')
          r.set('nome', nome)
          r.set('abrangencia', abr)
          r.set('origem', 'gerado')
          r.set('ativo', true)
          tx.save(r)
        }
      })
    }
    const iniUTC = de + ' 00:00:00.000Z'
    const fimUTC = somaDias(ate, 1) + ' 00:00:00.000Z'
    const feriados = $app
      .findRecordsByFilter('feriados', 'data >= {:i} && data < {:f}', 'data', 0, 0, {
        i: iniUTC,
        f: fimUTC,
      })
      .map((f) => ({
        id: f.id,
        data: f.getString('data').slice(0, 10),
        nome: f.getString('nome'),
        abrangencia: f.getString('abrangencia'),
        origem: f.getString('origem'),
        ativo: f.getBool('ativo'),
      }))

    // ---------- projetos no escopo ----------
    const filtroProj = ['arquivado = false']
    const pp = { v: auth.id }
    if (!veTudo) filtroProj.push('(coordenador = {:v} || membros.id ?= {:v})')
    if (fProjeto) {
      filtroProj.push('id = {:fp}')
      pp.fp = fProjeto
    }
    const projetos = {}
    for (const p of $app.findRecordsByFilter(
      'projetos',
      filtroProj.join(' && '),
      'nome',
      0,
      0,
      pp,
    )) {
      if (busca && norm(p.getString('nome')).indexOf(busca) < 0) continue
      projetos[p.id] = p
    }
    const podeEditar = (p) =>
      papel === 'admin' || (papel === 'coordenador' && p.getString('coordenador') === auth.id)

    // ---------- entregas no período (pela data ou pela janela) ----------
    const ids = {}
    for (const r of $app.findRecordsByFilter(
      'entregas',
      'data >= {:i} && data < {:f} && projeto.arquivado = false',
      'data',
      0,
      0,
      { i: iniUTC, f: fimUTC },
    ))
      ids[r.id] = r
    for (const a of $app.findRecordsByFilter(
      'entrega_alocacoes',
      'inicio < {:f} && fim >= {:i}',
      '',
      0,
      0,
      { i: iniUTC, f: fimUTC },
    )) {
      const eid = a.getString('entrega')
      if (!ids[eid]) {
        try {
          ids[eid] = $app.findRecordById('entregas', eid)
        } catch (_) {}
      }
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
      const u = uid ? pegar('users', uid) : null
      return u ? { id: uid, nome: u.getString('name') || u.getString('email').split('@')[0] } : null
    }
    const entregas = []
    for (const eid of Object.keys(ids)) {
      const r = ids[eid]
      const p = projetos[r.getString('projeto')]
      if (!p) continue
      const cards = r.getStringSlice('disciplinas').map((cid) => {
        const c = pegar('projeto_disciplinas', cid)
        const d = c ? pegar('disciplinas', c.getString('disciplina')) : null
        return {
          card_id: cid,
          disciplina_id: c ? c.getString('disciplina') : '',
          nome: d ? d.getString('nome') : '—',
          sigla: d ? d.getString('sigla') : '',
          etapa: c ? c.getString('etapa') : '',
        }
      })
      if (fDisc && !cards.some((c) => c.disciplina_id === fDisc)) continue
      const alocacoes = $app
        .findRecordsByFilter('entrega_alocacoes', 'entrega = {:e}', 'inicio', 0, 0, { e: r.id })
        .map((a) => ({
          id: a.id,
          pessoa: pessoa(a.getString('pessoa')),
          pessoa_texto: a.getString('pessoa_texto'),
          inicio: a.getString('inicio').slice(0, 10),
          fim: a.getString('fim').slice(0, 10),
        }))
      // horas apontadas na entrega (CA-1-008-12): só apontamentos encerrados e vigentes
      const porPessoa = {}
      let totalSeg = 0
      let foraJanela = 0
      for (const t of $app.findRecordsByFilter(
        'tempo_eventos',
        "entrega = {:e} && status = 'encerrado' && excluido = false && substituido = false",
        '',
        0,
        0,
        { e: r.id },
      )) {
        const s = t.getInt('duracao_seg')
        const u = t.getString('usuario')
        totalSeg += s
        porPessoa[u] = (porPessoa[u] || 0) + s
        if (t.getBool('fora_da_janela')) foraJanela++
      }
      entregas.push({
        id: r.id,
        horas: {
          total_seg: totalSeg,
          fora_da_janela: foraJanela,
          por_pessoa: Object.keys(porPessoa).map((u) => ({ pessoa: pessoa(u), seg: porPessoa[u] })),
        },
        projeto: {
          id: p.id,
          nome: p.getString('nome'),
          coordenador: pessoa(p.getString('coordenador')),
        },
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
        art_por: pessoa(r.getString('art_por')),
        origem: r.getString('origem'),
        disciplinas: cards,
        alocacoes: alocacoes,
        minha_janela: alocacoes.filter((a) => a.pessoa && a.pessoa.id === auth.id),
        pode_editar: podeEditar(p),
        versao: r.getString('updated'),
      })
    }
    entregas.sort((a, b) =>
      a.data !== b.data ? (a.data < b.data ? -1 : 1) : a.projeto.nome < b.projeto.nome ? -1 : 1,
    )
    return e.json(200, {
      de: de,
      ate: ate,
      hoje: hoje,
      escopo: veTudo ? 'todos' : papel === 'coordenador' ? 'equipe' : 'proprio',
      pode_mes: dias > 7 || veTudo || papel === 'coordenador',
      feriados: feriados,
      entregas: entregas,
      projetos_editaveis: Object.keys(projetos)
        .map((k) => projetos[k])
        .filter(podeEditar)
        .map((p) => ({ id: p.id, nome: p.getString('nome') })),
    })
  },
  $apis.requireAuth('users'),
)
