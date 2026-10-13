// SPEC-1-005 (CA-1-005-07) — devolver um handoff: o card volta à etapa de origem,
// com justificativa obrigatória, e uma nova pendência vai para quem responde por ela.
// Pode devolver: o destinatário da pendência, o coordenador do projeto ou o administrador.
// Nada é apagado: a pendência fica "devolvida" e a volta entra no histórico do card.
routerAdd(
  'POST',
  '/backend/v1/atividades/{id}/devolver',
  (e) => {
    const su = e.hasSuperuserAuth()
    const auth = e.auth
    if (!su) {
      const expira = auth ? auth.getString('session_expires_at') : ''
      if (
        !auth ||
        !auth.getBool('active') ||
        !expira ||
        new Date(expira.replace(' ', 'T')) <= new Date()
      ) {
        throw new UnauthorizedError('Sessão inválida ou expirada.')
      }
    }
    const id = e.request.pathValue('id')
    const negar = (motivo) => {
      try {
        const r = new Record($app.findCollectionByNameOrId('auth_audit'))
        r.set('actor_id', su ? '' : auth.id)
        r.set('action', 'access.denied')
        r.set('outcome', 'blocked')
        r.set('details', {
          recurso: 'atividades',
          operacao: 'devolver',
          id: String(id).slice(0, 32),
          motivo: motivo,
        })
        $app.save(r)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Acesso negado.')
    }
    let a = null
    try {
      a = $app.findRecordById('atividades', id)
    } catch (_) {}
    if (!a) negar('inexistente')
    let projeto = null
    try {
      projeto = $app.findRecordById('projetos', a.getString('projeto'))
    } catch (_) {}
    const papel = su ? 'admin' : auth.getString('role')
    const pode =
      !!projeto &&
      (papel === 'admin' ||
        (papel === 'coordenador' && projeto.getString('coordenador') === auth.id) ||
        (!su && a.getString('destinatario') === auth.id && papel !== 'executivo'))
    if (!pode) negar('sem_alcada')

    const body = e.requestInfo().body || {}
    const just = typeof body.justificativa === 'string' ? body.justificativa.trim() : ''
    if (just.length < 3 || just.length > 1000) {
      throw new BadRequestError('Revise os campos destacados.', {
        justificativa: new ValidationError('obrigatorio', 'Explique o motivo da devolução.'),
      })
    }

    const versoes = $app.findRecordsByFilter('fluxo_versoes', 'ativa = true', '-numero', 1, 0)
    const cfg = versoes.length > 0 ? JSON.parse(versoes[0].getString('config')) : { etapas: [] }
    const nomeEtapa = (k) => {
      const et = (cfg.etapas || []).find((x) => x.chave === k)
      return et ? et.nome : k
    }
    const etapaAtiva = (k) => {
      const et = (cfg.etapas || []).find((x) => x.chave === k)
      return !!(et && et.ativa)
    }

    let situacao = 'ok'
    let novaEtapa = ''
    let handoff = null
    $app.runInTransaction((tx) => {
      const x = tx.findRecordById('atividades', id)
      const st = x.getString('status')
      if (st !== 'pendente' && st !== 'recebida') {
        situacao = 'encerrada'
        return
      }
      const c = tx.findRecordById('projeto_disciplinas', x.getString('card'))
      const p = tx.findRecordById('projetos', c.getString('projeto'))
      if (p.getBool('arquivado')) {
        situacao = 'arquivado'
        return
      }
      if (c.getBool('bloqueado')) {
        situacao = 'bloqueado'
        return
      }
      const de = c.getString('etapa')
      const para = x.getString('etapa_origem')
      if (de !== x.getString('etapa') || !para || para === de || !etapaAtiva(para)) {
        situacao = 'sem_origem'
        return
      }
      const agoraTxt = new Date().toISOString().replace('T', ' ')
      const ator = su ? '' : auth.id
      x.set('status', 'devolvida')
      x.set('encerrada_em', agoraTxt)
      if (ator) x.set('encerrada_por', ator)
      x.set('encerramento', just)
      tx.save(x)
      for (const o of tx.findRecordsByFilter(
        'atividades',
        "card = {:c} && (status = 'pendente' || status = 'recebida')",
        '',
        0,
        0,
        { c: c.id },
      )) {
        o.set('status', 'concluida')
        o.set('encerrada_em', agoraTxt)
        if (ator) o.set('encerrada_por', ator)
        o.set('encerramento', 'Card devolvido para "' + nomeEtapa(para) + '"')
        tx.save(o)
      }
      c.set('etapa', para)
      tx.save(c)
      novaEtapa = para
      const t = new Record(tx.findCollectionByNameOrId('transicoes'))
      t.set('card', c.id)
      t.set('projeto', p.id)
      t.set('tipo', 'transicao')
      t.set('de', de)
      t.set('para', para)
      t.set('justificativa', just)
      if (ator) t.set('autor', ator)
      t.set('detalhes', { classe: 'devolucao', atividade: x.id })
      tx.save(t)

      // ---- Handoff para a etapa de origem (mesma regra do mover) ----
      let alvo = ''
      if (para === 'aguardando_revisao') alvo = c.getString('revisor')
      else if (para === 'aprovado' || para === 'entrada_pendente') alvo = p.getString('coordenador')
      else alvo = c.getString('responsavel')
      let falha = ''
      if (!alvo) falha = 'destino_ausente'
      else {
        let u = null
        try {
          u = tx.findRecordById('users', alvo)
        } catch (_) {}
        if (!u || !u.getBool('active')) falha = 'destino_inativo'
      }
      if (falha || alvo !== ator) {
        const coord = p.getString('coordenador')
        const destinatario = falha ? coord : alvo
        const motivoTexto =
          falha === 'destino_ausente'
            ? para === 'aguardando_revisao'
              ? 'Disciplina sem revisor definido.'
              : 'Disciplina sem responsável definido.'
            : falha === 'destino_inativo'
              ? 'O destinatário está inativo.'
              : ''
        const proxima = falha
          ? para === 'aguardando_revisao'
            ? 'Defina o revisor da disciplina e reprocesse.'
            : 'Defina um responsável ativo e reprocesse.'
          : ''
        const chaveH = 'transicao:' + t.id
        const ev = new Record(tx.findCollectionByNameOrId('handoff_eventos'))
        ev.set('chave', chaveH)
        ev.set('card', c.id)
        ev.set('projeto', p.id)
        ev.set('transicao', t.id)
        ev.set('etapa_origem', de)
        ev.set('etapa_destino', para)
        if (alvo) ev.set('destino_esperado', alvo)
        ev.set('status', falha ? 'falha' : 'entregue')
        ev.set('motivo', falha)
        ev.set('proxima_acao', proxima)
        ev.set('tentativas', 1)
        ev.set('historico', [
          {
            tentativa: 1,
            em: agoraTxt,
            autor: ator,
            resultado: falha ? 'falha' : 'entregue',
            motivo: falha,
          },
        ])
        if (!falha) ev.set('resolvido_em', agoraTxt)
        tx.save(ev)
        const at = new Record(tx.findCollectionByNameOrId('atividades'))
        at.set('chave', chaveH)
        at.set('card', c.id)
        at.set('projeto', p.id)
        at.set('evento', ev.id)
        at.set('etapa', para)
        at.set('etapa_origem', de)
        if (destinatario) at.set('destinatario', destinatario)
        if (ator) at.set('remetente', ator)
        at.set('status', 'pendente')
        at.set('precisa_ajuste', !!falha)
        at.set('motivo_ajuste', motivoTexto)
        tx.save(at)
        ev.set('atividade', at.id)
        tx.save(ev)
        let discNome = ''
        try {
          discNome = tx.findRecordById('disciplinas', c.getString('disciplina')).getString('nome')
        } catch (_) {}
        if (destinatario) {
          const n = new Record(tx.findCollectionByNameOrId('notificacoes'))
          n.set('destinatario', destinatario)
          n.set('atividade', at.id)
          n.set('card', c.id)
          n.set('projeto', p.id)
          n.set(
            'titulo',
            (falha ? 'Ajuste necessário: ' : 'Devolvido para você: ') +
              discNome +
              ' — ' +
              p.getString('nome'),
          )
          n.set('texto', falha ? motivoTexto + ' ' + proxima : 'Motivo: ' + just.slice(0, 300))
          n.set('lida', false)
          tx.save(n)
        }
        const th = new Record(tx.findCollectionByNameOrId('transicoes'))
        th.set('card', c.id)
        th.set('projeto', p.id)
        th.set('tipo', 'handoff')
        th.set('de', de)
        th.set('para', para)
        th.set('justificativa', just)
        if (ator) th.set('autor', ator)
        th.set('detalhes', {
          acao: 'devolvido',
          atividade_devolvida: x.id,
          atividade: at.id,
          destinatario: destinatario,
          motivo: falha,
        })
        tx.save(th)
        handoff = { atividade: at.id, destinatario: destinatario, precisa_ajuste: !!falha }
      }
    })
    if (situacao === 'encerrada')
      return e.json(409, {
        code: 'atividade_encerrada',
        message: 'Esta pendência já foi encerrada.',
      })
    if (situacao === 'arquivado')
      return e.json(409, {
        code: 'projeto_arquivado',
        message: 'Projeto arquivado: restaure-o antes.',
      })
    if (situacao === 'bloqueado')
      return e.json(409, {
        code: 'card_bloqueado',
        message: 'Card bloqueado: resolva o bloqueio antes de devolver.',
      })
    if (situacao === 'sem_origem') {
      return e.json(409, {
        code: 'sem_origem',
        message:
          'O card já mudou de etapa ou a etapa de origem está inativa. Atualize e tente de novo.',
      })
    }
    return e.json(200, { id: id, status: 'devolvida', etapa: novaEtapa, handoff: handoff })
  },
  $apis.requireAuth(),
)
