// SPEC-1-006 (CA-1-006-07/08) — CSV do baseline com exatamente os eventos que entram
// no painel (mesmos filtros e mesmas regras), um por linha, sem dados de pessoa.
// Somando "duracao_seg" por grupo e categoria chega-se aos totais do painel.
routerAdd(
  'GET',
  '/backend/v1/tempo/baseline.csv',
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
    if (papel !== 'admin' && papel !== 'executivo' && papel !== 'coordenador')
      throw new ForbiddenError('Acesso negado.')
    const limite = new Date(Date.now() - 12 * 3600000).toISOString().replace('T', ' ')
    for (const t of $app.findRecordsByFilter(
      'tempo_eventos',
      "(status = 'ativo' || status = 'pausado') && inicio < {:l}",
      '',
      0,
      0,
      { l: limite },
    )) {
      t.set('status', 'pendente_revisao')
      t.set('segmento_aberto_em', '')
      $app.save(t)
    }
    const q = e.request.url.query()
    const tipologia = String(q.get('tipologia') || '')
      .trim()
      .slice(0, 120)
    const disciplina = String(q.get('disciplina') || '')
      .trim()
      .slice(0, 120)
    const filtros = []
    const params = {}
    if (tipologia) {
      filtros.push('tipologia = {:t}')
      params.t = tipologia
    }
    if (disciplina) {
      filtros.push('disciplina_nome = {:d}')
      params.d = disciplina
    }
    const base = filtros.length ? filtros.join(' && ') + ' && ' : ''
    const validos = $app.findRecordsByFilter(
      'tempo_eventos',
      base + "status = 'encerrado' && excluido = false && substituido = false",
      'grupo,projeto_nome,created',
      0,
      0,
      params,
    )
    const br = (s) => {
      if (!s) return ''
      const d = new Date(new Date(s.replace(' ', 'T')).getTime() - 3 * 3600000).toISOString()
      return d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) + ' ' + d.slice(11, 16)
    }
    const esc = (v) => {
      const s = String(v === null || v === undefined ? '' : v)
      return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const cab = [
      'evento_id',
      'grupo',
      'origem',
      'projeto',
      'disciplina',
      'tipologia',
      'etapa',
      'categoria',
      'inicio',
      'fim',
      'data_referencia',
      'duracao_seg',
      'duracao_horas',
      'arquivo',
      'fonte',
      'qualidade',
      'revisado',
      'corrige_evento',
    ]
    const linhas = [cab.join(';')]
    for (const ev of validos) {
      const seg = ev.getInt('duracao_seg')
      linhas.push(
        [
          ev.id,
          ev.getString('grupo'),
          ev.getString('origem'),
          ev.getString('projeto_nome'),
          ev.getString('disciplina_nome'),
          ev.getString('tipologia'),
          ev.getString('etapa'),
          ev.getString('categoria'),
          br(ev.getString('inicio')),
          br(ev.getString('fim')),
          ev.getString('data_referencia').slice(0, 10),
          seg,
          String(Math.round((seg / 3600) * 10000) / 10000).replace('.', ','),
          ev.getString('arquivo'),
          ev.getString('fonte'),
          ev.getString('qualidade'),
          ev.getBool('revisado') ? 'sim' : '',
          ev.getString('substitui'),
        ]
          .map(esc)
          .join(';'),
      )
    }
    e.response.header().set('Content-Type', 'text/csv; charset=utf-8')
    e.response.header().set('Content-Disposition', 'attachment; filename="baseline-touch-time.csv"')
    return e.string(200, '﻿' + linhas.join('\r\n') + '\r\n')
  },
  $apis.requireAuth('users'),
)
