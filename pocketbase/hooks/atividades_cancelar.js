// SPEC-1-005 (CA-1-005-07) — cancelar um handoff ainda não iniciado (pendente).
// Só coordenador do projeto ou administrador, com justificativa. Nada é apagado:
// a pendência fica "cancelada" e o cancelamento entra no histórico do card.
routerAdd(
  'POST',
  '/backend/v1/atividades/{id}/cancelar',
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
          operacao: 'cancelar',
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
    if (
      !projeto ||
      !(
        papel === 'admin' ||
        (papel === 'coordenador' && projeto.getString('coordenador') === auth.id)
      )
    )
      negar('sem_alcada')

    const body = e.requestInfo().body || {}
    const just = typeof body.justificativa === 'string' ? body.justificativa.trim() : ''
    if (just.length < 3 || just.length > 1000) {
      throw new BadRequestError('Revise os campos destacados.', {
        justificativa: new ValidationError(
          'obrigatorio',
          'Informe a justificativa do cancelamento.',
        ),
      })
    }

    let situacao = 'ok'
    $app.runInTransaction((tx) => {
      const x = tx.findRecordById('atividades', id)
      const st = x.getString('status')
      if (st === 'recebida') {
        situacao = 'ja_iniciada'
        return
      }
      if (st !== 'pendente') {
        situacao = 'encerrada'
        return
      }
      const agora = new Date().toISOString().replace('T', ' ')
      x.set('status', 'cancelada')
      x.set('encerrada_em', agora)
      if (!su) x.set('encerrada_por', auth.id)
      x.set('encerramento', just)
      tx.save(x)
      const evId = x.getString('evento')
      if (evId) {
        try {
          const ev = tx.findRecordById('handoff_eventos', evId)
          let hist = []
          try {
            hist = JSON.parse(ev.getString('historico') || '[]') || []
          } catch (_) {}
          hist.push({
            tentativa: ev.getInt('tentativas'),
            em: agora,
            autor: su ? '' : auth.id,
            resultado: 'cancelado',
            motivo: just.slice(0, 200),
          })
          ev.set('historico', hist)
          if (ev.getString('status') === 'falha') ev.set('status', 'obsoleto')
          tx.save(ev)
        } catch (_) {}
      }
      const c = tx.findRecordById('projeto_disciplinas', x.getString('card'))
      const t = new Record(tx.findCollectionByNameOrId('transicoes'))
      t.set('card', c.id)
      t.set('projeto', c.getString('projeto'))
      t.set('tipo', 'handoff')
      t.set('de', c.getString('etapa'))
      t.set('para', c.getString('etapa'))
      t.set('justificativa', just)
      if (!su) t.set('autor', auth.id)
      t.set('detalhes', {
        acao: 'cancelado',
        atividade: x.id,
        destinatario: x.getString('destinatario'),
      })
      tx.save(t)
    })
    if (situacao === 'ja_iniciada') {
      return e.json(409, {
        code: 'ja_iniciada',
        message: 'A pendência já foi recebida. Use "devolver" com justificativa.',
      })
    }
    if (situacao === 'encerrada')
      return e.json(409, {
        code: 'atividade_encerrada',
        message: 'Esta pendência já foi encerrada.',
      })
    return e.json(200, { id: id, status: 'cancelada' })
  },
  $apis.requireAuth(),
)
