// SPEC-1-006 — ações sobre um apontamento:
//   pausar / retomar / encerrar — só o dono do timer;
//   revisar  (T1.27) — timer esquecido (>12h): define o fim real com motivo; dono, coordenador ou admin;
//   corrigir (T1.28) — coordenador do projeto ou admin, com motivo: cria NOVA versão e marca a
//                       original como substituída (o evento bruto permanece);
//   excluir  — coordenador do projeto ou admin, com motivo: fica fora do baseline, sem apagar.
// Relógio invertido, duração negativa ou acima de 24h → 400 e auditoria.
routerAdd(
  'POST',
  '/backend/v1/tempo/{id}/{acao}',
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
    const id = e.request.pathValue('id')
    const acao = e.request.pathValue('acao')
    const ACOES = ['pausar', 'retomar', 'encerrar', 'revisar', 'corrigir', 'excluir']
    if (ACOES.indexOf(acao) < 0) throw new NotFoundError('Ação desconhecida.')
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
    const negar = (motivo) => {
      auditar('access.denied', 'blocked', {
        recurso: 'tempo',
        operacao: acao,
        id: String(id).slice(0, 32),
        motivo: motivo,
      })
      throw new ForbiddenError('Acesso negado.')
    }
    let ev = null
    try {
      ev = $app.findRecordById('tempo_eventos', id)
    } catch (_) {}
    if (!ev) negar('inexistente')
    const papel = auth.getString('role')
    const dono = ev.getString('usuario') === auth.id
    let coordDoProjeto = false
    if (ev.getString('projeto')) {
      try {
        coordDoProjeto =
          $app.findRecordById('projetos', ev.getString('projeto')).getString('coordenador') ===
          auth.id
      } catch (_) {}
    }
    const gestor = papel === 'admin' || (papel === 'coordenador' && coordDoProjeto)
    if (acao === 'pausar' || acao === 'retomar' || acao === 'encerrar') {
      if (!dono) negar('nao_e_dono')
    } else if (acao === 'revisar') {
      if (!dono && !gestor) negar('sem_alcada')
    } else if (!gestor) negar('sem_alcada')

    const body = e.requestInfo().body || {}
    const agoraMs = Date.now()
    const fmt = (ms) => new Date(ms).toISOString().replace('T', ' ')
    const lerData = (v) => {
      if (typeof v !== 'string' || !v.trim()) return null
      const ms = new Date(v.trim().replace(' ', 'T')).getTime()
      return isNaN(ms) ? null : ms
    }
    const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : ''
    const exigeMotivo = () => {
      if (motivo.length < 3 || motivo.length > 1000) {
        throw new BadRequestError('Revise os campos destacados.', {
          motivo: new ValidationError('obrigatorio', 'Informe o motivo.'),
        })
      }
    }
    const conflito = (msg) => e.json(409, { code: 'estado_invalido', message: msg })
    const status = ev.getString('status')
    let segs = []
    try {
      segs = JSON.parse(ev.getString('segmentos') || '[]') || []
    } catch (_) {}
    const somar = (lista) => {
      let total = 0
      for (const s of lista) {
        if (!s.inicio || !s.fim) continue
        total += Math.max(
          0,
          Math.round(
            (new Date(s.fim.replace(' ', 'T')) - new Date(s.inicio.replace(' ', 'T'))) / 1000,
          ),
        )
      }
      return total
    }

    if (acao === 'pausar') {
      if (status !== 'ativo') return conflito('O apontamento não está em andamento.')
      const ag = fmt(agoraMs)
      for (const s of segs) if (!s.fim) s.fim = ag
      ev.set('segmentos', segs)
      ev.set('segmento_aberto_em', '')
      ev.set('status', 'pausado')
      ev.set('duracao_seg', somar(segs))
      $app.save(ev)
      return e.json(200, { id: id, status: 'pausado', acumulado_seg: ev.getInt('duracao_seg') })
    }
    if (acao === 'retomar') {
      if (status !== 'pausado') return conflito('O apontamento não está pausado.')
      const ini = new Date(ev.getString('inicio').replace(' ', 'T')).getTime()
      if (agoraMs - ini > 12 * 3600000) {
        ev.set('status', 'pendente_revisao')
        $app.save(ev)
        return e.json(409, {
          code: 'pendente_revisao',
          message: 'Apontamento aberto há mais de 12h: virou pendência de revisão.',
        })
      }
      const ag = fmt(agoraMs)
      segs.push({ inicio: ag, fim: '' })
      ev.set('segmentos', segs)
      ev.set('segmento_aberto_em', ag)
      ev.set('status', 'ativo')
      $app.save(ev)
      return e.json(200, { id: id, status: 'ativo' })
    }
    if (acao === 'encerrar') {
      if (status !== 'ativo' && status !== 'pausado')
        return conflito('O apontamento já foi encerrado.')
      const ag = fmt(agoraMs)
      for (const s of segs) if (!s.fim) s.fim = ag
      ev.set('segmentos', segs)
      ev.set('segmento_aberto_em', '')
      ev.set('status', 'encerrado')
      ev.set('fim', ag)
      ev.set('duracao_seg', somar(segs))
      $app.save(ev)
      return e.json(200, { id: id, status: 'encerrado', duracao_seg: ev.getInt('duracao_seg') })
    }
    if (acao === 'revisar') {
      if (status !== 'pendente_revisao')
        return conflito('Só apontamentos pendentes de revisão podem ser revisados.')
      exigeMotivo()
      const fimMs = lerData(body.fim)
      const ultimo =
        segs.length > 0
          ? new Date(segs[segs.length - 1].inicio.replace(' ', 'T')).getTime()
          : new Date(ev.getString('inicio').replace(' ', 'T')).getTime()
      if (fimMs === null || fimMs <= ultimo || fimMs > agoraMs + 60000) {
        auditar('tempo.invalido', 'blocked', { evento: id, operacao: 'revisar' })
        throw new BadRequestError('Revise os campos destacados.', {
          fim: new ValidationError('invalido', 'Informe um fim depois do início e não no futuro.'),
        })
      }
      for (const s of segs) if (!s.fim) s.fim = fmt(fimMs)
      const total = somar(segs)
      if (total > 24 * 3600) {
        auditar('tempo.invalido', 'blocked', { evento: id, operacao: 'revisar', duracao: total })
        throw new BadRequestError('Revise os campos destacados.', {
          fim: new ValidationError('longo', 'Duração acima de 24h: confira o horário.'),
        })
      }
      ev.set('segmentos', segs)
      ev.set('status', 'encerrado')
      ev.set('fim', fmt(fimMs))
      ev.set('duracao_seg', total)
      ev.set('revisado', true)
      ev.set('revisao_motivo', motivo)
      ev.set('revisado_por', auth.id)
      $app.save(ev)
      auditar('tempo.revisao', 'success', { evento: id, duracao: total })
      return e.json(200, { id: id, status: 'encerrado', duracao_seg: total })
    }
    if (acao === 'excluir') {
      exigeMotivo()
      if (status !== 'encerrado' || ev.getBool('excluido') || ev.getBool('substituido'))
        return conflito('Só apontamentos encerrados e vigentes podem ser excluídos.')
      if (!ev.getString('projeto') && papel !== 'admin') negar('importado_so_admin')
      ev.set('excluido', true)
      ev.set('exclusao_motivo', motivo)
      ev.set('excluido_por', auth.id)
      $app.save(ev)
      auditar('tempo.exclusao', 'success', { evento: id, motivo: motivo.slice(0, 200) })
      return e.json(200, { id: id, excluido: true })
    }
    // corrigir: nova versão, original preservado
    exigeMotivo()
    if (status !== 'encerrado' || ev.getBool('excluido') || ev.getBool('substituido'))
      return conflito('Só apontamentos encerrados e vigentes podem ser corrigidos.')
    if (!ev.getString('projeto') && papel !== 'admin') negar('importado_so_admin')
    const iniMs = lerData(body.inicio)
    const fimMs = lerData(body.fim)
    if (
      iniMs === null ||
      fimMs === null ||
      fimMs <= iniMs ||
      fimMs > agoraMs + 60000 ||
      fimMs - iniMs > 24 * 3600000
    ) {
      auditar('tempo.invalido', 'blocked', { evento: id, operacao: 'corrigir' })
      throw new BadRequestError('Revise os campos destacados.', {
        fim: new ValidationError(
          'invalido',
          'O fim precisa ser depois do início, não no futuro e em até 24h.',
        ),
      })
    }
    const categorias = ['elaboracao', 'revisao', 'espera']
    const categoria =
      typeof body.categoria === 'string' && categorias.indexOf(body.categoria) >= 0
        ? body.categoria
        : ev.getString('categoria')
    let novoId = ''
    $app.runInTransaction((tx) => {
      const o = tx.findRecordById('tempo_eventos', id)
      const n = new Record(tx.findCollectionByNameOrId('tempo_eventos'))
      for (const f of [
        'usuario',
        'card',
        'projeto',
        'projeto_nome',
        'disciplina_nome',
        'tipologia',
        'etapa',
        'grupo',
        'importacao',
        'arquivo',
        'fonte',
        'qualidade',
        'data_referencia',
      ]) {
        n.set(f, o.get(f))
      }
      n.set('categoria', categoria)
      n.set('origem', 'correcao')
      n.set('status', 'encerrado')
      n.set('segmentos', [{ inicio: fmt(iniMs), fim: fmt(fimMs) }])
      n.set('inicio', fmt(iniMs))
      n.set('fim', fmt(fimMs))
      n.set('duracao_seg', Math.round((fimMs - iniMs) / 1000))
      n.set('substitui', o.id)
      n.set('correcao_motivo', motivo)
      n.set('corrigido_por', auth.id)
      tx.save(n)
      o.set('substituido', true)
      o.set('substituido_por', n.id)
      tx.save(o)
      novoId = n.id
    })
    auditar('tempo.correcao', 'success', {
      evento: id,
      nova_versao: novoId,
      motivo: motivo.slice(0, 200),
    })
    return e.json(200, { id: novoId, substitui: id })
  },
  $apis.requireAuth('users'),
)
