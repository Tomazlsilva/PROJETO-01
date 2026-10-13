// SPEC-1-005 (CA-1-005-05/09) — reprocessar um handoff que falhou.
// Só coordenador do projeto ou administrador. Recalcula o destino com os dados atuais
// do card; se válido, entrega a MESMA pendência (sem duplicar) e notifica. Cada tentativa
// fica no histórico do evento (autor, horário, tentativa, resultado) e na auditoria.
routerAdd(
  'POST',
  '/backend/v1/handoffs/{id}/reprocessar',
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
          recurso: 'handoffs',
          operacao: 'reprocessar',
          id: String(id).slice(0, 32),
          motivo: motivo,
        })
        $app.save(r)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Acesso negado.')
    }
    let ev = null
    try {
      ev = $app.findRecordById('handoff_eventos', id)
    } catch (_) {}
    if (!ev) negar('inexistente')
    let projeto = null
    try {
      projeto = $app.findRecordById('projetos', ev.getString('projeto'))
    } catch (_) {}
    const papel = su ? 'admin' : auth.getString('role')
    if (
      !projeto ||
      !(
        papel === 'admin' ||
        (papel === 'coordenador' && projeto.getString('coordenador') === auth.id)
      )
    )
      negar('sem_alcada')

    if (ev.getString('status') === 'entregue')
      return e.json(200, { id: id, resultado: 'ja_entregue', tentativas: ev.getInt('tentativas') })
    if (ev.getString('status') === 'obsoleto')
      return e.json(200, { id: id, resultado: 'obsoleto', tentativas: ev.getInt('tentativas') })

    const versoes = $app.findRecordsByFilter('fluxo_versoes', 'ativa = true', '-numero', 1, 0)
    const cfg = versoes.length > 0 ? JSON.parse(versoes[0].getString('config')) : { etapas: [] }
    const nomeEtapa = (k) => {
      const et = (cfg.etapas || []).find((x) => x.chave === k)
      return et ? et.nome : k
    }

    const ator = su ? '' : auth.id
    let resultado = ''
    let motivoFinal = ''
    let tentativas = 0
    let destinatarioFinal = ''
    $app.runInTransaction((tx) => {
      const h = tx.findRecordById('handoff_eventos', id)
      if (h.getString('status') !== 'falha') {
        resultado = h.getString('status') === 'entregue' ? 'ja_entregue' : 'obsoleto'
        tentativas = h.getInt('tentativas')
        return
      }
      const agoraTxt = new Date().toISOString().replace('T', ' ')
      let hist = []
      try {
        hist = JSON.parse(h.getString('historico') || '[]') || []
      } catch (_) {}
      tentativas = h.getInt('tentativas') + 1
      h.set('tentativas', tentativas)

      let a = null
      try {
        a = tx.findRecordById('atividades', h.getString('atividade'))
      } catch (_) {}
      const c = tx.findRecordById('projeto_disciplinas', h.getString('card'))
      const p = tx.findRecordById('projetos', c.getString('projeto'))
      const para = h.getString('etapa_destino')
      const aberta =
        a && (a.getString('status') === 'pendente' || a.getString('status') === 'recebida')
      if (!aberta || c.getString('etapa') !== para || p.getBool('arquivado')) {
        resultado = 'obsoleto'
        h.set('status', 'obsoleto')
        h.set('proxima_acao', '')
        hist.push({
          tentativa: tentativas,
          em: agoraTxt,
          autor: ator,
          resultado: 'obsoleto',
          motivo: 'card_mudou',
        })
        h.set('historico', hist)
        tx.save(h)
        return
      }

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
      if (falha) {
        resultado = 'falha'
        motivoFinal = falha
        h.set('motivo', falha)
        h.set(
          'proxima_acao',
          para === 'aguardando_revisao'
            ? 'Defina o revisor da disciplina e reprocesse.'
            : 'Defina um responsável ativo e reprocesse.',
        )
        hist.push({
          tentativa: tentativas,
          em: agoraTxt,
          autor: ator,
          resultado: 'falha',
          motivo: falha,
        })
        h.set('historico', hist)
        tx.save(h)
        return
      }

      resultado = 'entregue'
      destinatarioFinal = alvo
      a.set('destinatario', alvo)
      a.set('precisa_ajuste', false)
      a.set('motivo_ajuste', '')
      if (a.getString('status') === 'recebida') {
        a.set('status', 'pendente')
        a.set('recebida_em', '')
      }
      tx.save(a)
      h.set('status', 'entregue')
      h.set('motivo', '')
      h.set('proxima_acao', '')
      h.set('destino_esperado', alvo)
      h.set('resolvido_em', agoraTxt)
      hist.push({
        tentativa: tentativas,
        em: agoraTxt,
        autor: ator,
        resultado: 'entregue',
        motivo: '',
      })
      h.set('historico', hist)
      tx.save(h)
      let discNome = ''
      try {
        discNome = tx.findRecordById('disciplinas', c.getString('disciplina')).getString('nome')
      } catch (_) {}
      const n = new Record(tx.findCollectionByNameOrId('notificacoes'))
      n.set('destinatario', alvo)
      n.set('atividade', a.id)
      n.set('card', c.id)
      n.set('projeto', p.id)
      n.set('titulo', 'Nova pendência: ' + discNome + ' — ' + p.getString('nome'))
      n.set('texto', 'Etapa "' + nomeEtapa(para) + '" (encaminhada após ajuste do coordenador).')
      n.set('lida', false)
      tx.save(n)
      const th = new Record(tx.findCollectionByNameOrId('transicoes'))
      th.set('card', c.id)
      th.set('projeto', p.id)
      th.set('tipo', 'handoff')
      th.set('de', c.getString('etapa'))
      th.set('para', c.getString('etapa'))
      if (ator) th.set('autor', ator)
      th.set('detalhes', {
        acao: 'reprocessado',
        atividade: a.id,
        destinatario: alvo,
        tentativa: tentativas,
      })
      tx.save(th)
    })
    try {
      const r = new Record($app.findCollectionByNameOrId('auth_audit'))
      r.set('actor_id', ator)
      r.set('action', 'handoff.reprocess')
      r.set('outcome', resultado === 'entregue' ? 'success' : 'failure')
      r.set('details', {
        evento: id,
        tentativa: tentativas,
        resultado: resultado,
        motivo: motivoFinal,
      })
      $app.save(r)
    } catch (err) {
      $app.logger().error('auditoria falhou', 'action', 'handoff.reprocess')
    }
    return e.json(200, {
      id: id,
      resultado: resultado,
      motivo: motivoFinal,
      tentativas: tentativas,
      destinatario: destinatarioFinal,
    })
  },
  $apis.requireAuth(),
)
