// SPEC-1-006 (T1.29, CA-1-006-09) — importação CSV do histórico (grupo "antes").
// Só administrador. Valida linha a linha: linhas inválidas são rejeitadas com o número da
// linha, o campo e o motivo; as válidas são gravadas com arquivo, fonte, qualidade, linha
// e data da importação. Separador ";" ou "," (detectado no cabeçalho). "simular": true só valida.
// Colunas: projeto; disciplina; tipologia; categoria (elaboracao|revisao|espera);
//          duracao_horas; fonte (opcional); data (AAAA-MM-DD ou DD/MM/AAAA, opcional);
//          qualidade (opcional); etapa (opcional).
routerAdd(
  'POST',
  '/backend/v1/tempo/importar',
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
    if (auth.getString('role') !== 'admin') {
      try {
        const r = new Record($app.findCollectionByNameOrId('auth_audit'))
        r.set('actor_id', auth.id)
        r.set('action', 'access.denied')
        r.set('outcome', 'blocked')
        r.set('details', { recurso: 'tempo', operacao: 'importar' })
        $app.save(r)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Acesso negado.')
    }
    const body = e.requestInfo().body || {}
    const arquivo = typeof body.arquivo === 'string' ? body.arquivo.trim().slice(0, 200) : ''
    const texto = typeof body.csv === 'string' ? body.csv : ''
    if (!arquivo)
      throw new BadRequestError('Informe o nome do arquivo.', {
        arquivo: new ValidationError('obrigatorio', 'Informe o nome do arquivo.'),
      })
    if (!texto.trim() || texto.length > 2000000) {
      throw new BadRequestError('Arquivo vazio ou grande demais (máx. 2 MB).', {
        csv: new ValidationError('invalido', 'Arquivo vazio ou grande demais.'),
      })
    }
    const linhas = texto.replace(/^﻿/, '').split(/\r?\n/)
    const sep =
      (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ','
    const quebrar = (l) => {
      const out = []
      let cur = ''
      let q = false
      for (let i = 0; i < l.length; i++) {
        const ch = l.charAt(i)
        if (q) {
          if (ch === '"' && l.charAt(i + 1) === '"') {
            cur += '"'
            i++
          } else if (ch === '"') q = false
          else cur += ch
        } else if (ch === '"') q = true
        else if (ch === sep) {
          out.push(cur)
          cur = ''
        } else cur += ch
      }
      out.push(cur)
      return out.map((x) => x.trim())
    }
    const semAcento = (s) =>
      String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '_')
    const cab = quebrar(linhas[0]).map(semAcento)
    const idx = (n) => cab.indexOf(n)
    const obrig = ['projeto', 'disciplina', 'tipologia', 'categoria', 'duracao_horas']
    const faltando = obrig.filter((c) => idx(c) < 0)
    if (faltando.length > 0) {
      throw new BadRequestError('Cabeçalho incompleto: faltam ' + faltando.join(', ') + '.', {
        csv: new ValidationError('cabecalho', 'Colunas obrigatórias: ' + obrig.join(', ') + '.'),
      })
    }
    const CATS = { elaboracao: 'elaboracao', revisao: 'revisao', espera: 'espera' }
    const erros = []
    const validas = []
    let total = 0
    for (let n = 1; n < linhas.length; n++) {
      const bruta = linhas[n]
      if (!bruta.trim()) continue
      total++
      const v = quebrar(bruta)
      const val = (c) => (idx(c) >= 0 ? v[idx(c)] || '' : '')
      const linhaNum = n + 1
      const errosLinha = []
      const projeto = val('projeto').slice(0, 300)
      const disciplina = val('disciplina').slice(0, 120)
      const tipologia = val('tipologia').slice(0, 120)
      if (!projeto) errosLinha.push({ campo: 'projeto', mensagem: 'Projeto em branco.' })
      if (!disciplina) errosLinha.push({ campo: 'disciplina', mensagem: 'Disciplina em branco.' })
      if (!tipologia) errosLinha.push({ campo: 'tipologia', mensagem: 'Tipologia em branco.' })
      const categoria = CATS[semAcento(val('categoria'))]
      if (!categoria)
        errosLinha.push({
          campo: 'categoria',
          mensagem: 'Categoria deve ser elaboracao, revisao ou espera.',
        })
      let durTxt = val('duracao_horas')
      if (durTxt.indexOf(',') >= 0) durTxt = durTxt.replace(/\./g, '').replace(',', '.')
      const horas = /^\d+(\.\d+)?$/.test(durTxt) ? parseFloat(durTxt) : NaN
      if (isNaN(horas) || horas <= 0 || horas > 2000)
        errosLinha.push({
          campo: 'duracao_horas',
          mensagem: 'Duração deve ser um número de horas maior que zero (até 2000).',
        })
      let dataRef = ''
      const dataTxt = val('data')
      if (dataTxt) {
        let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataTxt)
        if (!m) {
          const b = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dataTxt)
          if (b) m = [dataTxt, b[3], b[2], b[1]]
        }
        const iso = m ? m[1] + '-' + m[2] + '-' + m[3] : ''
        if (
          !m ||
          isNaN(new Date(iso + 'T12:00:00Z').getTime()) ||
          new Date(iso + 'T12:00:00Z').toISOString().slice(0, 10) !== iso
        ) {
          errosLinha.push({
            campo: 'data',
            mensagem: 'Data inválida (use AAAA-MM-DD ou DD/MM/AAAA).',
          })
        } else dataRef = iso
      }
      if (errosLinha.length > 0) {
        for (const er of errosLinha)
          erros.push({
            linha: linhaNum,
            campo: er.campo,
            mensagem: er.mensagem,
            conteudo: bruta.slice(0, 200),
          })
        continue
      }
      validas.push({
        linha: linhaNum,
        projeto: projeto,
        disciplina: disciplina,
        tipologia: tipologia,
        categoria: categoria,
        segundos: Math.round(horas * 3600),
        fonte: (val('fonte') || arquivo).slice(0, 200),
        qualidade: (val('qualidade') || 'informada').slice(0, 40),
        etapa: val('etapa').slice(0, 40),
        data: dataRef,
      })
    }
    const rejeitadas = new Set(erros.map((x) => x.linha)).size
    if (body.simular === true) {
      return e.json(200, {
        id: '',
        simulacao: true,
        arquivo: arquivo,
        total: total,
        aceitas: validas.length,
        rejeitadas: rejeitadas,
        erros: erros,
      })
    }
    let impId = ''
    $app.runInTransaction((tx) => {
      const imp = new Record(tx.findCollectionByNameOrId('tempo_importacoes'))
      imp.set('arquivo', arquivo)
      imp.set('autor', auth.id)
      imp.set('total', total)
      imp.set('aceitas', validas.length)
      imp.set('rejeitadas', rejeitadas)
      imp.set('erros', erros)
      tx.save(imp)
      impId = imp.id
      for (const l of validas) {
        const t = new Record(tx.findCollectionByNameOrId('tempo_eventos'))
        t.set('projeto_nome', l.projeto)
        t.set('disciplina_nome', l.disciplina)
        t.set('tipologia', l.tipologia)
        t.set('etapa', l.etapa)
        t.set('categoria', l.categoria)
        t.set('grupo', 'antes')
        t.set('origem', 'importacao')
        t.set('status', 'encerrado')
        t.set('duracao_seg', l.segundos)
        t.set('importacao', imp.id)
        t.set('arquivo', arquivo)
        t.set('linha', l.linha)
        t.set('fonte', l.fonte)
        t.set('qualidade', l.qualidade)
        if (l.data) t.set('data_referencia', l.data + ' 12:00:00.000Z')
        tx.save(t)
      }
    })
    try {
      const r = new Record($app.findCollectionByNameOrId('auth_audit'))
      r.set('actor_id', auth.id)
      r.set('action', 'tempo.importacao')
      r.set('outcome', 'success')
      r.set('details', {
        importacao: impId,
        arquivo: arquivo,
        aceitas: validas.length,
        rejeitadas: rejeitadas,
      })
      $app.save(r)
    } catch (err) {
      $app.logger().error('auditoria falhou', 'action', 'tempo.importacao')
    }
    return e.json(200, {
      id: impId,
      arquivo: arquivo,
      total: total,
      aceitas: validas.length,
      rejeitadas: rejeitadas,
      erros: erros,
    })
  },
  $apis.requireAuth('users'),
)
