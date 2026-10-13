// SPEC-1-006 (T1.30, CA-1-006-03/05/06/08) — baseline agregado "antes" × "depois".
// Protocolo: touch time = elaboração + revisão; espera fica separada. Entram só
// apontamentos encerrados e vigentes (fora: abertos, pendentes >12h sem revisão,
// excluídos e versões substituídas por correção). Grupo "antes" = importação histórica;
// "depois" = apontamentos da Central. Amostra < 5 projetos → inconclusivo.
// Sem nenhum dado por pessoa: não é avaliação de desempenho individual.
// Acesso: administrador, executivo e coordenador. Filtros: tipologia, disciplina.
routerAdd(
  'GET',
  '/backend/v1/tempo/baseline',
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
    if (papel !== 'admin' && papel !== 'executivo' && papel !== 'coordenador') {
      try {
        const r = new Record($app.findCollectionByNameOrId('auth_audit'))
        r.set('actor_id', auth.id)
        r.set('action', 'access.denied')
        r.set('outcome', 'blocked')
        r.set('details', { recurso: 'tempo_baseline' })
        $app.save(r)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Acesso negado.')
    }
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
      'created',
      0,
      0,
      params,
    )
    const MIN = 5
    const vazio = () => ({
      projetos: {},
      n_eventos: 0,
      elaboracao_seg: 0,
      revisao_seg: 0,
      espera_seg: 0,
    })
    const g = { antes: vazio(), depois: vazio() }
    for (const ev of validos) {
      const x = g[ev.getString('grupo')]
      if (!x) continue
      const chave = ev.getString('projeto') || 'h:' + ev.getString('projeto_nome').toLowerCase()
      const seg = ev.getInt('duracao_seg')
      const cat = ev.getString('categoria')
      x.n_eventos++
      if (cat === 'elaboracao') x.elaboracao_seg += seg
      else if (cat === 'revisao') x.revisao_seg += seg
      else x.espera_seg += seg
      if (!x.projetos[chave]) x.projetos[chave] = 0
      if (cat !== 'espera') x.projetos[chave] += seg
      else x.projetos[chave] += 0
    }
    const r2 = (n) => Math.round(n * 100) / 100
    const resumo = (x) => {
      const porProjeto = Object.keys(x.projetos)
        .map((k) => x.projetos[k] / 3600)
        .sort((a, b) => a - b)
      const n = porProjeto.length
      const touch = x.elaboracao_seg + x.revisao_seg
      let mediana = 0
      if (n > 0)
        mediana = n % 2 ? porProjeto[(n - 1) / 2] : (porProjeto[n / 2 - 1] + porProjeto[n / 2]) / 2
      return {
        n_projetos: n,
        n_eventos: x.n_eventos,
        elaboracao_seg: x.elaboracao_seg,
        revisao_seg: x.revisao_seg,
        espera_seg: x.espera_seg,
        touch_seg: touch,
        touch_horas: r2(touch / 3600),
        espera_horas: r2(x.espera_seg / 3600),
        media_touch_horas_por_projeto: n ? r2(touch / 3600 / n) : 0,
        mediana_touch_horas_por_projeto: r2(mediana),
        situacao: n >= MIN ? 'conclusivo' : 'inconclusivo',
        motivo:
          n >= MIN
            ? ''
            : 'Amostra insuficiente: ' +
              n +
              ' projeto(s); o protocolo pede pelo menos ' +
              MIN +
              ' comparáveis.',
      }
    }
    const antes = resumo(g.antes)
    const depois = resumo(g.depois)
    const conta = (extra) =>
      $app.findRecordsByFilter('tempo_eventos', base + extra, '', 0, 0, params).length
    return e.json(200, {
      filtros: { tipologia: tipologia, disciplina: disciplina },
      grupos: { antes: antes, depois: depois },
      comparacao: {
        situacao:
          antes.situacao === 'conclusivo' && depois.situacao === 'conclusivo'
            ? 'conclusivo'
            : 'inconclusivo',
        diferenca_media_horas:
          antes.n_projetos && depois.n_projetos
            ? r2(depois.media_touch_horas_por_projeto - antes.media_touch_horas_por_projeto)
            : null,
      },
      excluidos: {
        pendentes: conta("status = 'pendente_revisao'"),
        em_andamento: conta("(status = 'ativo' || status = 'pausado')"),
        excluidos: conta('excluido = true'),
        substituidos: conta('substituido = true'),
      },
      protocolo:
        'Touch time = elaboração + revisão (horas efetivamente apontadas). Espera é medida à parte e não entra no touch time. ' +
        '"Antes" = histórico importado; "depois" = apontamentos na Central. Mínimo de ' +
        MIN +
        ' projetos comparáveis por grupo. ' +
        'Estimativas (ex.: "10h por projeto") nunca são usadas como medição.',
      aviso:
        'Indicadores agregados por grupo e projeto. Nesta fase não há indicador individual nem avaliação de desempenho.',
    })
  },
  $apis.requireAuth('users'),
)
