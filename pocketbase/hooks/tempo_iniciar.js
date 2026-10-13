// SPEC-1-006 (T1.26, CA-1-006-01/02) — inicia o apontamento de touch time num card.
// Um único timer aberto (ativo ou pausado) por usuário: um segundo início é recusado
// (409 + timer atual), a menos que a pessoa confirme encerrar o anterior.
// Só quem participa do projeto (ou administrador) aponta tempo; fora disso → 403 auditado.
// Tudo que nasce na Central é do grupo "depois" (modo sombra).
routerAdd(
  'POST',
  '/backend/v1/tempo/iniciar',
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
    const body = e.requestInfo().body || {}
    const cardId = typeof body.card === 'string' ? body.card : ''
    const negar = (motivo) => {
      try {
        const r = new Record($app.findCollectionByNameOrId('auth_audit'))
        r.set('actor_id', auth.id)
        r.set('action', 'access.denied')
        r.set('outcome', 'blocked')
        r.set('details', {
          recurso: 'tempo',
          operacao: 'iniciar',
          card: cardId.slice(0, 32),
          motivo: motivo,
        })
        $app.save(r)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Acesso negado.')
    }
    let card = null
    try {
      card = $app.findRecordById('projeto_disciplinas', cardId)
    } catch (_) {}
    if (!card) negar('inexistente')
    let projeto = null
    try {
      projeto = $app.findRecordById('projetos', card.getString('projeto'))
    } catch (_) {}
    const papel = auth.getString('role')
    const participa =
      !!projeto &&
      (papel === 'admin' ||
        (papel !== 'executivo' &&
          (projeto.getString('coordenador') === auth.id ||
            projeto.getStringSlice('membros').indexOf(auth.id) >= 0 ||
            card.getString('responsavel') === auth.id ||
            card.getString('revisor') === auth.id)))
    if (!participa) negar('fora_do_projeto')
    if (projeto.getBool('arquivado'))
      return e.json(409, {
        code: 'projeto_arquivado',
        message: 'Projeto arquivado: não aceita apontamento.',
      })

    // timers abertos há mais de 12h viram pendência de revisão (não bloqueiam o novo)
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

    const categorias = ['elaboracao', 'revisao', 'espera']
    const etapa = card.getString('etapa')
    let categoria = typeof body.categoria === 'string' ? body.categoria : ''
    if (categoria && categorias.indexOf(categoria) < 0) {
      throw new BadRequestError('Revise os campos destacados.', {
        categoria: new ValidationError('invalida', 'Categoria inválida.'),
      })
    }
    if (!categoria) categoria = etapa === 'aguardando_revisao' ? 'revisao' : 'elaboracao'
    let disciplinaNome = ''
    try {
      disciplinaNome = $app
        .findRecordById('disciplinas', card.getString('disciplina'))
        .getString('nome')
    } catch (_) {}

    const resumo = (t) => ({
      id: t.id,
      card: t.getString('card'),
      projeto: t.getString('projeto'),
      projeto_nome: t.getString('projeto_nome'),
      disciplina_nome: t.getString('disciplina_nome'),
      categoria: t.getString('categoria'),
      status: t.getString('status'),
      inicio: t.getString('inicio'),
    })
    let situacao = 'ok'
    let atualAberto = null
    let novo = null
    try {
      $app.runInTransaction((tx) => {
        const abertos = tx.findRecordsByFilter(
          'tempo_eventos',
          "usuario = {:u} && (status = 'ativo' || status = 'pausado')",
          '',
          1,
          0,
          { u: auth.id },
        )
        const agora = new Date().toISOString().replace('T', ' ')
        if (abertos.length > 0) {
          if (body.encerrar_anterior !== true) {
            situacao = 'timer_ativo'
            atualAberto = resumo(abertos[0])
            return
          }
          const a = abertos[0]
          let segs = []
          try {
            segs = JSON.parse(a.getString('segmentos') || '[]') || []
          } catch (_) {}
          let total = 0
          for (const s of segs) {
            if (!s.fim) s.fim = agora
            total += Math.max(
              0,
              Math.round(
                (new Date(s.fim.replace(' ', 'T')) - new Date(s.inicio.replace(' ', 'T'))) / 1000,
              ),
            )
          }
          a.set('segmentos', segs)
          a.set('segmento_aberto_em', '')
          a.set('status', 'encerrado')
          a.set('fim', agora)
          a.set('duracao_seg', total)
          tx.save(a)
        }
        const t = new Record(tx.findCollectionByNameOrId('tempo_eventos'))
        t.set('usuario', auth.id)
        t.set('card', card.id)
        t.set('projeto', projeto.id)
        t.set('projeto_nome', projeto.getString('nome'))
        t.set('disciplina_nome', disciplinaNome)
        t.set('tipologia', projeto.getString('tipologia'))
        t.set('etapa', etapa)
        t.set('categoria', categoria)
        t.set('grupo', 'depois')
        t.set('origem', 'timer')
        t.set('status', 'ativo')
        t.set('segmentos', [{ inicio: agora, fim: '' }])
        t.set('segmento_aberto_em', agora)
        t.set('inicio', agora)
        t.set('duracao_seg', 0)
        tx.save(t)
        novo = t
      })
    } catch (err) {
      // início simultâneo: o índice único barra o segundo timer
      situacao = 'timer_ativo'
      const ab = $app.findRecordsByFilter(
        'tempo_eventos',
        "usuario = {:u} && (status = 'ativo' || status = 'pausado')",
        '',
        1,
        0,
        { u: auth.id },
      )
      atualAberto = ab.length > 0 ? resumo(ab[0]) : null
    }
    if (situacao === 'timer_ativo') {
      return e.json(409, {
        code: 'timer_ativo',
        message:
          'Você já tem um apontamento aberto. Encerre-o ou confirme para encerrar e começar outro.',
        atual: atualAberto,
      })
    }
    return e.json(200, resumo(novo))
  },
  $apis.requireAuth('users'),
)
