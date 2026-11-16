// SPEC-2-003 (T2.07–T2.09) — revisão do coordenador item a item.
// Abrir rodada e marcar: coordenador do projeto ou admin/diretor (card em "Aguardando revisão").
// Encerrar (aprovar/devolver) acontece na mudança de etapa (cards_mover), na mesma transação.
// Corrigir: responsável, coordenador ou admin marcam o que corrigiram (card "Em correção").
// Reabrir rodada encerrada: coordenador/admin com justificativa; a versão anterior fica no histórico.

// ---------- consulta ----------
routerAdd(
  'GET',
  '/backend/v1/cards/{id}/revisao',
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
      )
        throw new UnauthorizedError('Sessão inválida ou expirada.')
    }
    let card = null
    let p = null
    try {
      card = $app.findRecordById('projeto_disciplinas', e.request.pathValue('id'))
      p = $app.findRecordById('projetos', card.getString('projeto'))
    } catch (_) {}
    if (
      !card ||
      !p ||
      !$app.canAccessRecord(p, e.requestInfo(), $app.findCollectionByNameOrId('projetos').viewRule)
    )
      throw new ForbiddenError('Acesso negado.')
    const nomes = {}
    const pessoa = (uid) => {
      if (!uid) return null
      if (!nomes[uid]) {
        let nome = '—'
        try {
          const u = $app.findRecordById('users', uid)
          nome = u.getString('name') || u.getString('email').split('@')[0]
        } catch (_) {}
        nomes[uid] = { id: uid, nome: nome }
      }
      return nomes[uid]
    }
    const papel = su ? 'admin' : auth.getString('role')
    const ehAdmin = papel === 'admin'
    const ehCoord = !su && papel === 'coordenador' && p.getString('coordenador') === auth.id
    const ehResp = !su && papel !== 'administrativo' && card.getString('responsavel') === auth.id
    const ap = $app.findRecordsByFilter(
      'checklists_aplicados',
      "card = {:c} && tipo = 'revisao'",
      '',
      1,
      0,
      {
        c: card.id,
      },
    )
    const checklist =
      ap.length > 0
        ? {
            id: ap[0].id,
            numero: ap[0].getInt('numero'),
            itens: JSON.parse(ap[0].getString('itens') || '[]'),
          }
        : null
    const rodadas = $app
      .findRecordsByFilter('revisao_rodadas', 'card = {:c}', '-numero', 0, 0, { c: card.id })
      .map((r) => {
        const itens = JSON.parse(r.getString('itens') || '{}') || {}
        for (const k of Object.keys(itens)) {
          const x = itens[k]
          x.autor = pessoa(x.autor)
          x.excecao_por = pessoa(x.excecao_por)
          x.corrigido_por = pessoa(x.corrigido_por)
        }
        const hist = JSON.parse(r.getString('historico') || '[]') || []
        return {
          id: r.id,
          numero: r.getInt('numero'),
          status: r.getString('status'),
          resultado: r.getString('resultado'),
          sem_checklist: r.getBool('sem_checklist'),
          itens: itens,
          motivo: r.getString('motivo'),
          responsavel_correcao: pessoa(r.getString('responsavel_correcao')),
          aberta_por: pessoa(r.getString('aberta_por')),
          encerrada_por: pessoa(r.getString('encerrada_por')),
          encerrada_em: r.getString('encerrada_em'),
          reaberturas: hist.map((h) => ({
            em: h.em,
            por: pessoa(h.por),
            justificativa: h.justificativa,
            resultado_anterior: h.resultado,
          })),
          created: r.getString('created'),
          versao: r.getString('updated'),
        }
      })
    const arq = p.getBool('arquivado')
    return e.json(200, {
      etapa: card.getString('etapa'),
      checklist: checklist,
      rodadas: rodadas,
      pode_revisar: !arq && (ehAdmin || ehCoord),
      pode_corrigir: !arq && (ehAdmin || ehCoord || ehResp),
    })
  },
  $apis.requireAuth(),
)

// ---------- abrir rodada ----------
routerAdd(
  'POST',
  '/backend/v1/cards/{id}/revisao/abrir',
  (e) => {
    const su = e.hasSuperuserAuth()
    const auth = e.auth
    const id = e.request.pathValue('id')
    if (!su) {
      const expira = auth ? auth.getString('session_expires_at') : ''
      if (
        !auth ||
        !auth.getBool('active') ||
        !expira ||
        new Date(expira.replace(' ', 'T')) <= new Date()
      )
        throw new UnauthorizedError('Sessão inválida ou expirada.')
    }
    let card = null
    let p = null
    try {
      card = $app.findRecordById('projeto_disciplinas', id)
      p = $app.findRecordById('projetos', card.getString('projeto'))
    } catch (_) {}
    const papel = su ? 'admin' : auth.getString('role')
    const pode =
      !!p &&
      (papel === 'admin' || (papel === 'coordenador' && p.getString('coordenador') === auth.id))
    if (!card || !pode) {
      try {
        const a = new Record($app.findCollectionByNameOrId('auth_audit'))
        a.set('actor_id', su ? '' : auth.id)
        a.set('action', 'access.denied')
        a.set('outcome', 'blocked')
        a.set('details', { recurso: 'revisao', operacao: 'abrir', id: String(id).slice(0, 32) })
        $app.save(a)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Só o coordenador do projeto ou o administrador revisam.')
    }
    const conflito = (code, message) => e.json(409, { code: code, message: message })
    if (p.getBool('arquivado'))
      return conflito('projeto_arquivado', 'Projeto arquivado: restaure-o para revisar.')
    if (card.getString('etapa') !== 'aguardando_revisao')
      return conflito('etapa_invalida', 'A revisão só começa com o card em "Aguardando revisão".')
    if (card.getBool('bloqueado'))
      return conflito('card_bloqueado', 'Card bloqueado: resolva o bloqueio antes de revisar.')
    const ap = $app.findRecordsByFilter(
      'checklists_aplicados',
      "card = {:c} && tipo = 'revisao'",
      '',
      1,
      0,
      { c: id },
    )
    if (ap.length === 0)
      return conflito(
        'sem_checklist',
        'Esta disciplina não tem checklist de revisão: aprove ou devolva direto pela mudança de etapa, com o motivo.',
      )
    let rodada = null
    try {
      $app.runInTransaction((tx) => {
        if (
          tx.findRecordsByFilter('revisao_rodadas', "card = {:c} && status = 'aberta'", '', 1, 0, {
            c: id,
          }).length > 0
        )
          return
        const ult = tx.findRecordsByFilter('revisao_rodadas', 'card = {:c}', '-numero', 1, 0, {
          c: id,
        })
        const numero = ult.length > 0 ? ult[0].getInt('numero') + 1 : 1
        // da rodada anterior, mantém o que já estava resolvido (conforme, N/A, exceção);
        // o que estava não conforme precisa ser revisto
        const itens = {}
        if (ult.length > 0) {
          const ant = JSON.parse(ult[0].getString('itens') || '{}') || {}
          for (const k of Object.keys(ant)) {
            const x = ant[k]
            if (
              x &&
              (x.resultado === 'conforme' ||
                x.resultado === 'nao_se_aplica' ||
                x.resultado === 'excecao')
            )
              itens[k] = Object.assign({}, x, { herdado: true, corrigido: false })
          }
        }
        const r = new Record(tx.findCollectionByNameOrId('revisao_rodadas'))
        r.set('card', id)
        r.set('projeto', p.id)
        r.set('aplicado', ap[0].id)
        r.set('numero', numero)
        r.set('status', 'aberta')
        r.set('sem_checklist', false)
        r.set('itens', itens)
        r.set('historico', [])
        if (!su) r.set('aberta_por', auth.id)
        tx.save(r)
        rodada = r
      })
    } catch (err) {
      // duas aberturas ao mesmo tempo: o índice de rodada aberta barra a segunda
    }
    const aberta = $app.findRecordsByFilter(
      'revisao_rodadas',
      "card = {:c} && status = 'aberta'",
      '',
      1,
      0,
      { c: id },
    )
    if (aberta.length === 0)
      throw new BadRequestError('Não foi possível abrir a rodada. Tente de novo.')
    return e.json(rodada ? 201 : 200, {
      id: aberta[0].id,
      numero: aberta[0].getInt('numero'),
      versao: aberta[0].getString('updated'),
    })
  },
  $apis.requireAuth(),
)

// ---------- marcar item na rodada aberta / marcar correção / reabrir ----------
routerAdd(
  'POST',
  '/backend/v1/cards/{id}/revisao/{rodada}/{acao}',
  (e) => {
    const su = e.hasSuperuserAuth()
    const auth = e.auth
    const id = e.request.pathValue('id')
    const acao = e.request.pathValue('acao')
    if (!su) {
      const expira = auth ? auth.getString('session_expires_at') : ''
      if (
        !auth ||
        !auth.getBool('active') ||
        !expira ||
        new Date(expira.replace(' ', 'T')) <= new Date()
      )
        throw new UnauthorizedError('Sessão inválida ou expirada.')
    }
    if (['marcar', 'corrigir', 'reabrir'].indexOf(acao) < 0)
      throw new NotFoundError('Ação desconhecida.')
    const negar = (motivo, msg) => {
      try {
        const a = new Record($app.findCollectionByNameOrId('auth_audit'))
        a.set('actor_id', su ? '' : auth.id)
        a.set('action', 'access.denied')
        a.set('outcome', 'blocked')
        a.set('details', {
          recurso: 'revisao',
          operacao: acao,
          id: String(id).slice(0, 32),
          motivo: motivo,
        })
        $app.save(a)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError(msg || 'Acesso negado.')
    }
    let card = null
    let p = null
    let rd = null
    try {
      card = $app.findRecordById('projeto_disciplinas', id)
      p = $app.findRecordById('projetos', card.getString('projeto'))
      rd = $app.findRecordById('revisao_rodadas', e.request.pathValue('rodada'))
    } catch (_) {}
    if (!card || !p || !rd || rd.getString('card') !== id) negar('inexistente')
    const papel = su ? 'admin' : auth.getString('role')
    const ehRev =
      papel === 'admin' || (papel === 'coordenador' && p.getString('coordenador') === auth.id)
    const ehResp =
      papel !== 'administrativo' && card.getString('responsavel') === (su ? '' : auth.id)
    if (acao === 'corrigir' ? !(ehRev || ehResp) : !ehRev)
      negar(
        'sem_alcada',
        acao === 'corrigir'
          ? 'Acesso negado.'
          : 'Só o coordenador do projeto ou o administrador revisam.',
      )
    const conflito = (code, message) => e.json(409, { code: code, message: message })
    if (p.getBool('arquivado'))
      return conflito('projeto_arquivado', 'Projeto arquivado: restaure-o para alterar.')
    const body = e.requestInfo().body || {}
    const ruim = (campo, msg) => {
      const d = {}
      d[campo] = new ValidationError('invalido', msg)
      throw new BadRequestError(msg, d)
    }
    const ator = su ? '' : auth.id
    const agora = new Date().toISOString()
    const ap = rd.getString('aplicado')
      ? $app.findRecordById('checklists_aplicados', rd.getString('aplicado'))
      : null
    const itensChk = ap ? JSON.parse(ap.getString('itens') || '[]') : []

    if (acao === 'reabrir') {
      const just =
        typeof body.justificativa === 'string' ? body.justificativa.trim().slice(0, 1000) : ''
      if (just.length < 3) ruim('justificativa', 'Informe por que a rodada está sendo reaberta.')
      let situacao = 'ok'
      $app.runInTransaction((tx) => {
        const r = tx.findRecordById('revisao_rodadas', rd.id)
        const c = tx.findRecordById('projeto_disciplinas', id)
        const ult = tx.findRecordsByFilter('revisao_rodadas', 'card = {:c}', '-numero', 1, 0, {
          c: id,
        })
        if (r.getString('status') !== 'encerrada' || ult[0].id !== r.id) {
          situacao = 'nao_ultima'
          return
        }
        if (typeof body.versao !== 'string' || body.versao !== r.getString('updated')) {
          situacao = 'conflito'
          return
        }
        if (c.getBool('bloqueado')) {
          situacao = 'bloqueado'
          return
        }
        const etapaAntes = c.getString('etapa')
        if (
          etapaAntes !== 'em_correcao' &&
          etapaAntes !== 'aprovado' &&
          etapaAntes !== 'aguardando_revisao'
        ) {
          situacao = 'etapa'
          return
        }
        const hist = JSON.parse(r.getString('historico') || '[]') || []
        hist.push({
          em: agora,
          por: ator,
          justificativa: just,
          resultado: r.getString('resultado'),
          motivo: r.getString('motivo'),
          itens: JSON.parse(r.getString('itens') || '{}'),
          encerrada_por: r.getString('encerrada_por'),
          encerrada_em: r.getString('encerrada_em'),
        })
        r.set('historico', hist)
        r.set('status', 'aberta')
        r.set('resultado', '')
        r.set('encerrada_por', '')
        r.set('encerrada_em', '')
        tx.save(r)
        if (etapaAntes !== 'aguardando_revisao') {
          c.set('etapa', 'aguardando_revisao')
          tx.save(c)
          const t = new Record(tx.findCollectionByNameOrId('transicoes'))
          t.set('card', c.id)
          t.set('projeto', p.id)
          t.set('tipo', 'transicao')
          t.set('de', etapaAntes)
          t.set('para', 'aguardando_revisao')
          t.set('justificativa', just)
          if (ator) t.set('autor', ator)
          t.set('detalhes', { classe: 'reabrir_revisao', rodada: r.getInt('numero') })
          tx.save(t)
          for (const a of tx.findRecordsByFilter(
            'atividades',
            "card = {:c} && (status = 'pendente' || status = 'recebida')",
            '',
            0,
            0,
            { c: c.id },
          )) {
            a.set('status', 'cancelada')
            a.set('encerrada_em', agora.replace('T', ' '))
            if (ator) a.set('encerrada_por', ator)
            a.set('encerramento', 'Rodada de revisão reaberta')
            tx.save(a)
          }
        }
      })
      if (situacao === 'nao_ultima')
        return conflito('nao_ultima', 'Só a última rodada encerrada pode ser reaberta.')
      if (situacao === 'conflito')
        return conflito(
          'conflito_edicao',
          'A rodada foi alterada por outra pessoa. Atualize e tente de novo.',
        )
      if (situacao === 'bloqueado')
        return conflito('card_bloqueado', 'Card bloqueado: resolva o bloqueio antes.')
      if (situacao === 'etapa')
        return conflito(
          'etapa_invalida',
          'O card já seguiu adiante; não dá para reabrir esta rodada.',
        )
      return e.json(200, { ok: true })
    }

    const itemId = typeof body.item === 'string' ? body.item : ''
    const item = itensChk.find((x) => x.id === itemId)
    if (!item) ruim('item', 'Item não encontrado no checklist de revisão.')

    if (acao === 'marcar') {
      const resultado = typeof body.resultado === 'string' ? body.resultado : ''
      if (['', 'conforme', 'nao_conforme', 'nao_se_aplica', 'excecao'].indexOf(resultado) < 0)
        ruim('resultado', 'Resultado inválido.')
      const observacao =
        typeof body.observacao === 'string' ? body.observacao.trim().slice(0, 1000) : ''
      const justificativa =
        typeof body.justificativa === 'string' ? body.justificativa.trim().slice(0, 1000) : ''
      if (resultado === 'nao_conforme' && observacao.length < 3)
        ruim('observacao', 'Diga o que precisa ser corrigido.')
      if (resultado === 'nao_se_aplica' && justificativa.length < 3)
        ruim('justificativa', 'Explique por que o item não se aplica.')
      if (resultado === 'excecao' && justificativa.length < 3)
        ruim('justificativa', 'A exceção técnica precisa de justificativa.')
      let situacao = 'ok'
      let versao = ''
      $app.runInTransaction((tx) => {
        const r = tx.findRecordById('revisao_rodadas', rd.id)
        if (r.getString('status') !== 'aberta') {
          situacao = 'encerrada'
          return
        }
        if (typeof body.versao !== 'string' || body.versao !== r.getString('updated')) {
          situacao = 'conflito'
          return
        }
        const itens = JSON.parse(r.getString('itens') || '{}') || {}
        if (resultado) {
          itens[itemId] = {
            resultado: resultado,
            observacao: resultado === 'nao_conforme' ? observacao : '',
            justificativa:
              resultado === 'nao_se_aplica' || resultado === 'excecao' ? justificativa : '',
            autor: ator,
            em: agora,
            excecao_por: resultado === 'excecao' ? ator : '',
          }
        } else delete itens[itemId]
        r.set('itens', itens)
        tx.save(r)
        versao = r.getString('updated')
      })
      if (situacao === 'encerrada')
        return conflito('rodada_encerrada', 'Esta rodada já foi encerrada.')
      if (situacao === 'conflito')
        return conflito(
          'conflito_edicao',
          'Outra pessoa marcou esta rodada depois que você abriu. Atualize e tente de novo.',
        )
      return e.json(200, { ok: true, versao: versao })
    }

    // ---- corrigir: projetista marca o que corrigiu na rodada reprovada ----
    const corrigido = body.corrigido !== false
    const nota = typeof body.nota === 'string' ? body.nota.trim().slice(0, 1000) : ''
    let situacao = 'ok'
    let versao = ''
    $app.runInTransaction((tx) => {
      const r = tx.findRecordById('revisao_rodadas', rd.id)
      const c = tx.findRecordById('projeto_disciplinas', id)
      if (
        r.getString('status') !== 'encerrada' ||
        r.getString('resultado') !== 'reprovado' ||
        c.getString('etapa') !== 'em_correcao'
      ) {
        situacao = 'estado'
        return
      }
      if (typeof body.versao !== 'string' || body.versao !== r.getString('updated')) {
        situacao = 'conflito'
        return
      }
      const itens = JSON.parse(r.getString('itens') || '{}') || {}
      if (!itens[itemId] || itens[itemId].resultado !== 'nao_conforme') {
        situacao = 'item'
        return
      }
      itens[itemId].corrigido = corrigido
      itens[itemId].correcao_nota = corrigido ? nota : ''
      itens[itemId].corrigido_por = corrigido ? ator : ''
      itens[itemId].corrigido_em = corrigido ? agora : ''
      r.set('itens', itens)
      tx.save(r)
      versao = r.getString('updated')
    })
    if (situacao === 'estado')
      return conflito('estado_invalido', 'Só dá para marcar correções com o card em "Em correção".')
    if (situacao === 'item')
      ruim('item', 'Este item não foi apontado como não conforme nesta rodada.')
    if (situacao === 'conflito')
      return conflito(
        'conflito_edicao',
        'A rodada foi alterada por outra pessoa. Atualize e tente de novo.',
      )
    return e.json(200, { ok: true, versao: versao })
  },
  $apis.requireAuth(),
)
