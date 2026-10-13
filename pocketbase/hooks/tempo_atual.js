// SPEC-1-006 — situação do apontamento do usuário: timer aberto (se houver),
// pendências (timers esquecidos >12h aguardando revisão) e últimos apontamentos.
routerAdd(
  'GET',
  '/backend/v1/tempo/atual',
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
    // timer aberto há mais de 12h vira pendência de revisão (fora do baseline)
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
    const agora = Date.now()
    const ver = (t) => {
      let segs = []
      try {
        segs = JSON.parse(t.getString('segmentos') || '[]') || []
      } catch (_) {}
      let acumulado = 0
      for (const s of segs) {
        if (!s.inicio) continue
        const fim = s.fim
          ? new Date(s.fim.replace(' ', 'T')).getTime()
          : t.getString('status') === 'ativo'
            ? agora
            : null
        if (fim)
          acumulado += Math.max(
            0,
            Math.round((fim - new Date(s.inicio.replace(' ', 'T')).getTime()) / 1000),
          )
      }
      return {
        id: t.id,
        card: t.getString('card'),
        projeto: t.getString('projeto'),
        projeto_nome: t.getString('projeto_nome'),
        disciplina_nome: t.getString('disciplina_nome'),
        etapa: t.getString('etapa'),
        categoria: t.getString('categoria'),
        status: t.getString('status'),
        inicio: t.getString('inicio'),
        fim: t.getString('fim'),
        segmento_aberto_em: t.getString('segmento_aberto_em'),
        acumulado_seg: t.getString('status') === 'encerrado' ? t.getInt('duracao_seg') : acumulado,
        revisado: t.getBool('revisado'),
        substituido: t.getBool('substituido'),
        excluido: t.getBool('excluido'),
      }
    }
    const abertos = $app.findRecordsByFilter(
      'tempo_eventos',
      "usuario = {:u} && (status = 'ativo' || status = 'pausado')",
      '',
      1,
      0,
      { u: auth.id },
    )
    const pendentes = $app.findRecordsByFilter(
      'tempo_eventos',
      "usuario = {:u} && status = 'pendente_revisao'",
      '-inicio',
      50,
      0,
      { u: auth.id },
    )
    const recentes = $app.findRecordsByFilter(
      'tempo_eventos',
      "usuario = {:u} && status = 'encerrado'",
      '-inicio',
      20,
      0,
      { u: auth.id },
    )
    return e.json(200, {
      atual: abertos.length > 0 ? ver(abertos[0]) : null,
      pendentes: pendentes.map(ver),
      recentes: recentes.map(ver),
    })
  },
  $apis.requireAuth('users'),
)
