// SPEC-2-002 (T2.04/T2.05) — checklist no card: consulta, marcação por item, pendência de
// entrada e troca/aplicação manual de versão pelo coordenador.
// Ver: quem enxerga o projeto. Marcar (entrada): responsável, coordenador do projeto ou admin.
// Trocar ou aplicar versão: coordenador do projeto ou admin, com motivo, registrado.

// ---------- consulta ----------
routerAdd(
  'GET',
  '/backend/v1/cards/{id}/checklists',
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
    const info = e.requestInfo()
    if (
      !card ||
      !p ||
      !$app.canAccessRecord(p, info, $app.findCollectionByNameOrId('projetos').viewRule)
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
    const vf = $app.findRecordsByFilter('fluxo_versoes', 'ativa = true', '-numero', 1, 0)
    const cfg = vf.length > 0 ? JSON.parse(vf[0].getString('config') || '{}') : {}
    const ck = cfg.checklists || { entrada: 'entrada_pendente', revisao: 'aguardando_revisao' }
    const tip = p.getString('tipologia').trim()
    const vigenteDe = (tipo) => {
      const cand = $app.findRecordsByFilter(
        'checklist_modelos',
        "disciplina = {:d} && tipo = {:t} && vigente = true && exemplo = false && estado = 'ativo' && versao_atual > 0",
        '',
        0,
        0,
        { d: card.getString('disciplina'), t: tipo },
      )
      const m =
        cand.find((x) => tip && x.getString('tipologia') === tip) ||
        cand.find((x) => !x.getString('tipologia'))
      return m
        ? { modelo: m.id, numero: m.getInt('versao_atual'), tipologia: m.getString('tipologia') }
        : null
    }
    const pend = $app
      .findRecordsByFilter('checklist_pendencias', 'card = {:c}', '-created', 0, 0, { c: card.id })
      .map((x) => ({
        id: x.id,
        item_id: x.getString('item_id'),
        item_texto: x.getString('item_texto'),
        critico: x.getBool('critico'),
        motivo: x.getString('motivo'),
        dono: pessoa(x.getString('dono')),
        prazo: x.getString('prazo').slice(0, 10),
        status: x.getString('status'),
        resolucao: x.getString('resolucao'),
        resolvida_por: pessoa(x.getString('resolvida_por')),
        resolvida_em: x.getString('resolvida_em'),
        created: x.getString('created'),
      }))
    const checklist = (tipo) => {
      const l = $app.findRecordsByFilter(
        'checklists_aplicados',
        'card = {:c} && tipo = {:t}',
        '',
        1,
        0,
        {
          c: card.id,
          t: tipo,
        },
      )
      if (l.length === 0) return null
      const a = l[0]
      const res = JSON.parse(a.getString('resultados') || '{}') || {}
      const itens = JSON.parse(a.getString('itens') || '[]').map((it) => {
        const r = res[it.id] || null
        return Object.assign({}, it, {
          resultado: r ? r.resultado : '',
          justificativa: r ? r.justificativa || '' : '',
          autor: r ? pessoa(r.autor) : null,
          em: r ? r.em : '',
        })
      })
      return {
        id: a.id,
        tipo: tipo,
        numero: a.getInt('numero'),
        modelo: a.getString('modelo'),
        etapa: a.getString('etapa'),
        origem: a.getString('origem'),
        aplicado_em: a.getString('created'),
        aplicado_por: pessoa(a.getString('aplicado_por')),
        itens: itens,
        criticos_pendentes: itens
          .filter(
            (i) =>
              i.severidade === 'critico' &&
              i.resultado !== 'conforme' &&
              i.resultado !== 'nao_se_aplica',
          )
          .map((i) => i.texto),
        versao: a.getString('updated'),
      }
    }
    const eventos = $app
      .findRecordsByFilter('checklist_eventos', 'card = {:c}', '-created', 50, 0, { c: card.id })
      .map((x) => ({
        id: x.id,
        tipo: x.getString('tipo'),
        acao: x.getString('acao'),
        item_texto: x.getString('item_texto'),
        antes: x.getString('antes'),
        depois: x.getString('depois'),
        justificativa: x.getString('justificativa'),
        autor: pessoa(x.getString('autor')),
        created: x.getString('created'),
      }))
    return e.json(200, {
      etapas: ck,
      entrada: checklist('entrada'),
      revisao: checklist('revisao'),
      vigente: { entrada: vigenteDe('entrada'), revisao: vigenteDe('revisao') },
      pendencias: pend,
      eventos: eventos,
      pode_marcar: !p.getBool('arquivado') && (ehAdmin || ehCoord || ehResp),
      pode_trocar: !p.getBool('arquivado') && (ehAdmin || ehCoord),
    })
  },
  $apis.requireAuth(),
)

// ---------- marcar item (checklist de entrada) ----------
routerAdd(
  'POST',
  '/backend/v1/cards/{id}/checklists/entrada/marcar',
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
    const negar = (motivo) => {
      try {
        const a = new Record($app.findCollectionByNameOrId('auth_audit'))
        a.set('actor_id', su ? '' : auth.id)
        a.set('action', 'access.denied')
        a.set('outcome', 'blocked')
        a.set('details', {
          recurso: 'checklist',
          operacao: 'marcar',
          id: String(id).slice(0, 32),
          motivo: motivo,
        })
        $app.save(a)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Acesso negado.')
    }
    let card = null
    let p = null
    try {
      card = $app.findRecordById('projeto_disciplinas', id)
      p = $app.findRecordById('projetos', card.getString('projeto'))
    } catch (_) {}
    if (!card || !p) negar('inexistente')
    const papel = su ? 'admin' : auth.getString('role')
    const pode =
      papel === 'admin' ||
      (papel === 'coordenador' && p.getString('coordenador') === auth.id) ||
      (papel !== 'administrativo' && card.getString('responsavel') === auth.id)
    if (!pode) negar('sem_alcada')
    if (p.getBool('arquivado'))
      return e.json(409, {
        code: 'projeto_arquivado',
        message: 'Projeto arquivado: restaure-o para alterar.',
      })

    const body = e.requestInfo().body || {}
    const ruim = (campo, msg) => {
      const d = {}
      d[campo] = new ValidationError('invalido', msg)
      throw new BadRequestError(msg, d)
    }
    const itemId = typeof body.item === 'string' ? body.item : ''
    const resultado = typeof body.resultado === 'string' ? body.resultado : ''
    if (['', 'conforme', 'nao_conforme', 'nao_se_aplica'].indexOf(resultado) < 0)
      ruim('resultado', 'Resultado inválido.')
    const justificativa =
      typeof body.justificativa === 'string' ? body.justificativa.trim().slice(0, 1000) : ''
    if (resultado === 'nao_se_aplica' && justificativa.length < 3)
      ruim('justificativa', 'Explique por que o item não se aplica.')
    const pin = body.pendencia && typeof body.pendencia === 'object' ? body.pendencia : {}
    let pMotivo = ''
    let pDono = null
    let pPrazo = ''
    if (resultado === 'nao_conforme') {
      pMotivo = typeof pin.motivo === 'string' ? pin.motivo.trim().slice(0, 500) : ''
      if (pMotivo.length < 3) ruim('motivo', 'Descreva o que está faltando.')
      try {
        pDono = $app.findRecordById('users', typeof pin.dono === 'string' ? pin.dono : '')
      } catch (_) {}
      if (!pDono || !pDono.getBool('active'))
        ruim('dono', 'Escolha o dono da pendência (usuário ativo).')
      pPrazo = typeof pin.prazo === 'string' ? pin.prazo.trim().slice(0, 10) : ''
      const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(pPrazo)) ruim('prazo', 'Informe o prazo da pendência.')
      if (pPrazo < hoje) ruim('prazo', 'O prazo não pode estar no passado.')
    }

    let situacao = 'ok'
    let versao = ''
    $app.runInTransaction((tx) => {
      const l = tx.findRecordsByFilter(
        'checklists_aplicados',
        "card = {:c} && tipo = 'entrada'",
        '',
        1,
        0,
        { c: id },
      )
      if (l.length === 0) {
        situacao = 'sem_checklist'
        return
      }
      const a = l[0]
      if (typeof body.versao !== 'string' || body.versao !== a.getString('updated')) {
        situacao = 'conflito'
        return
      }
      const item = JSON.parse(a.getString('itens') || '[]').find((x) => x.id === itemId)
      if (!item) {
        situacao = 'sem_item'
        return
      }
      const res = JSON.parse(a.getString('resultados') || '{}') || {}
      const antes = res[itemId] ? res[itemId].resultado : ''
      const ator = su ? '' : auth.id
      const agora = new Date().toISOString()
      if (resultado)
        res[itemId] = { resultado: resultado, justificativa: justificativa, autor: ator, em: agora }
      else delete res[itemId]
      a.set('resultados', res)
      tx.save(a)
      versao = a.getString('updated')
      const ev = new Record(tx.findCollectionByNameOrId('checklist_eventos'))
      ev.set('aplicado', a.id)
      ev.set('card', id)
      ev.set('projeto', p.id)
      ev.set('tipo', 'entrada')
      ev.set('acao', resultado ? 'marcado' : 'desmarcado')
      ev.set('item_id', itemId)
      ev.set('item_texto', String(item.texto || '').slice(0, 500))
      ev.set('antes', antes)
      ev.set('depois', resultado)
      ev.set('justificativa', resultado === 'nao_conforme' ? pMotivo : justificativa)
      if (ator) ev.set('autor', ator)
      tx.save(ev)
      // pendências do item: abre com "não conforme"; fecha quando o item é resolvido
      const abertas = tx.findRecordsByFilter(
        'checklist_pendencias',
        "aplicado = {:a} && item_id = {:i} && status = 'aberta'",
        '',
        0,
        0,
        { a: a.id, i: itemId },
      )
      if (resultado === 'nao_conforme') {
        let pr = abertas.length > 0 ? abertas[0] : null
        const nova = !pr
        if (!pr) {
          pr = new Record(tx.findCollectionByNameOrId('checklist_pendencias'))
          pr.set('aplicado', a.id)
          pr.set('card', id)
          pr.set('projeto', p.id)
          pr.set('item_id', itemId)
          pr.set('item_texto', String(item.texto || '').slice(0, 500))
          pr.set('critico', item.severidade === 'critico')
          pr.set('status', 'aberta')
          if (ator) pr.set('aberta_por', ator)
        }
        pr.set('motivo', pMotivo)
        pr.set('dono', pDono.id)
        pr.set('prazo', pPrazo + ' 12:00:00.000Z')
        tx.save(pr)
        const ev2 = new Record(tx.findCollectionByNameOrId('checklist_eventos'))
        ev2.set('aplicado', a.id)
        ev2.set('card', id)
        ev2.set('projeto', p.id)
        ev2.set('tipo', 'entrada')
        ev2.set('acao', nova ? 'pendencia_aberta' : 'pendencia_alterada')
        ev2.set('item_id', itemId)
        ev2.set('item_texto', String(item.texto || '').slice(0, 500))
        ev2.set('justificativa', pMotivo)
        ev2.set('detalhes', { dono: pDono.id, dono_nome: pDono.getString('name'), prazo: pPrazo })
        if (ator) ev2.set('autor', ator)
        tx.save(ev2)
        if (pDono.id !== ator) {
          let disc = ''
          try {
            disc = tx.findRecordById('disciplinas', card.getString('disciplina')).getString('nome')
          } catch (_) {}
          const n = new Record(tx.findCollectionByNameOrId('notificacoes'))
          n.set('destinatario', pDono.id)
          n.set('card', id)
          n.set('projeto', p.id)
          n.set('titulo', 'Pendência de entrada: ' + disc + ' — ' + p.getString('nome'))
          n.set(
            'texto',
            String(item.texto || '').slice(0, 200) +
              ' · ' +
              pMotivo +
              ' · prazo ' +
              pPrazo.split('-').reverse().join('/'),
          )
          n.set('lida', false)
          tx.save(n)
        }
      } else {
        for (const pr of abertas) {
          pr.set('status', 'resolvida')
          pr.set(
            'resolucao',
            resultado
              ? resultado === 'conforme'
                ? 'Item marcado como conforme'
                : 'Item marcado como não se aplica'
              : 'Marcação retirada',
          )
          if (ator) pr.set('resolvida_por', ator)
          pr.set('resolvida_em', agora)
          tx.save(pr)
          const ev3 = new Record(tx.findCollectionByNameOrId('checklist_eventos'))
          ev3.set('aplicado', a.id)
          ev3.set('card', id)
          ev3.set('projeto', p.id)
          ev3.set('tipo', 'entrada')
          ev3.set('acao', 'pendencia_resolvida')
          ev3.set('item_id', itemId)
          ev3.set('item_texto', String(item.texto || '').slice(0, 500))
          if (ator) ev3.set('autor', ator)
          tx.save(ev3)
        }
      }
    })
    if (situacao === 'sem_checklist')
      return e.json(409, {
        code: 'sem_checklist',
        message: 'Esta disciplina não tem checklist de entrada aplicado.',
      })
    if (situacao === 'sem_item') ruim('item', 'Item não encontrado neste checklist.')
    if (situacao === 'conflito')
      return e.json(409, {
        code: 'conflito_edicao',
        message:
          'Outra pessoa marcou este checklist depois que você abriu. Atualize e tente de novo.',
      })
    return e.json(200, { ok: true, versao: versao })
  },
  $apis.requireAuth(),
)

// ---------- aplicar ou trocar a versão (coordenador do projeto ou admin) ----------
routerAdd(
  'POST',
  '/backend/v1/cards/{id}/checklists/{tipo}/aplicar',
  (e) => {
    const su = e.hasSuperuserAuth()
    const auth = e.auth
    const id = e.request.pathValue('id')
    const tipo = e.request.pathValue('tipo')
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
    if (tipo !== 'entrada' && tipo !== 'revisao')
      throw new NotFoundError('Tipo de checklist inválido.')
    const negar = (motivo) => {
      try {
        const a = new Record($app.findCollectionByNameOrId('auth_audit'))
        a.set('actor_id', su ? '' : auth.id)
        a.set('action', 'access.denied')
        a.set('outcome', 'blocked')
        a.set('details', {
          recurso: 'checklist',
          operacao: 'trocar_versao',
          id: String(id).slice(0, 32),
          motivo: motivo,
        })
        $app.save(a)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError(
        'Só o coordenador do projeto ou o administrador trocam a versão do checklist.',
      )
    }
    let card = null
    let p = null
    try {
      card = $app.findRecordById('projeto_disciplinas', id)
      p = $app.findRecordById('projetos', card.getString('projeto'))
    } catch (_) {}
    if (!card || !p) negar('inexistente')
    const papel = su ? 'admin' : auth.getString('role')
    if (!(papel === 'admin' || (papel === 'coordenador' && p.getString('coordenador') === auth.id)))
      negar('sem_alcada')
    if (p.getBool('arquivado'))
      return e.json(409, {
        code: 'projeto_arquivado',
        message: 'Projeto arquivado: restaure-o para alterar.',
      })
    const body = e.requestInfo().body || {}
    const motivo = typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 1000) : ''
    if (motivo.length < 3)
      throw new BadRequestError('Informe o motivo.', {
        motivo: new ValidationError('obrigatorio', 'Informe o motivo.'),
      })

    // versão vigente do modelo real da disciplina (tipologia do projeto, senão geral)
    const tip = p.getString('tipologia').trim()
    const cand = $app.findRecordsByFilter(
      'checklist_modelos',
      "disciplina = {:d} && tipo = {:t} && vigente = true && exemplo = false && estado = 'ativo' && versao_atual > 0",
      '',
      0,
      0,
      { d: card.getString('disciplina'), t: tipo },
    )
    const m =
      cand.find((x) => tip && x.getString('tipologia') === tip) ||
      cand.find((x) => !x.getString('tipologia'))
    if (!m)
      return e.json(409, {
        code: 'sem_modelo',
        message:
          'Não há checklist real publicado para esta disciplina. Publique um em Administração › Checklists.',
      })
    const vs = $app.findRecordsByFilter(
      'checklist_versoes',
      'modelo = {:m} && numero = {:n}',
      '',
      1,
      0,
      {
        m: m.id,
        n: m.getInt('versao_atual'),
      },
    )
    if (vs.length === 0)
      return e.json(409, { code: 'sem_modelo', message: 'Versão vigente não encontrada.' })
    const v = vs[0]
    const ator = su ? '' : auth.id
    let situacao = 'ok'
    let de = ''
    $app.runInTransaction((tx) => {
      const l = tx.findRecordsByFilter(
        'checklists_aplicados',
        'card = {:c} && tipo = {:t}',
        '',
        1,
        0,
        { c: id, t: tipo },
      )
      let a = l.length > 0 ? l[0] : null
      const itens = JSON.parse(v.getString('itens') || '[]')
      if (a) {
        if (typeof body.versao !== 'string' || body.versao !== a.getString('updated')) {
          situacao = 'conflito'
          return
        }
        if (a.getString('versao') === v.id) {
          situacao = 'mesma'
          return
        }
        de = 'v' + a.getInt('numero')
        // mantém as marcações dos itens que continuam na versão nova
        const ids = {}
        for (const it of itens) ids[it.id] = true
        const res = JSON.parse(a.getString('resultados') || '{}') || {}
        const novo = {}
        for (const k of Object.keys(res)) if (ids[k]) novo[k] = res[k]
        a.set('resultados', novo)
        // pendências de itens que saíram da versão são encerradas
        for (const pr of tx.findRecordsByFilter(
          'checklist_pendencias',
          "aplicado = {:a} && status = 'aberta'",
          '',
          0,
          0,
          {
            a: a.id,
          },
        )) {
          if (ids[pr.getString('item_id')]) continue
          pr.set('status', 'resolvida')
          pr.set('resolucao', 'Item saiu do checklist na troca de versão')
          if (ator) pr.set('resolvida_por', ator)
          pr.set('resolvida_em', new Date().toISOString())
          tx.save(pr)
        }
      } else {
        a = new Record(tx.findCollectionByNameOrId('checklists_aplicados'))
        a.set('card', id)
        a.set('projeto', p.id)
        a.set('tipo', tipo)
        a.set('resultados', {})
        a.set('etapa', card.getString('etapa'))
        a.set('origem', 'manual')
        if (ator) a.set('aplicado_por', ator)
      }
      a.set('modelo', m.id)
      a.set('versao', v.id)
      a.set('numero', v.getInt('numero'))
      a.set('itens', itens)
      tx.save(a)
      const ev = new Record(tx.findCollectionByNameOrId('checklist_eventos'))
      ev.set('aplicado', a.id)
      ev.set('card', id)
      ev.set('projeto', p.id)
      ev.set('tipo', tipo)
      ev.set('acao', de ? 'versao_trocada' : 'aplicado_manual')
      ev.set('antes', de)
      ev.set('depois', 'v' + v.getInt('numero'))
      ev.set('justificativa', motivo)
      ev.set('detalhes', { modelo: m.id })
      if (ator) ev.set('autor', ator)
      tx.save(ev)
    })
    if (situacao === 'conflito')
      return e.json(409, {
        code: 'conflito_edicao',
        message:
          'Outra pessoa alterou este checklist depois que você abriu. Atualize e tente de novo.',
      })
    if (situacao === 'mesma')
      return e.json(409, { code: 'mesma_versao', message: 'O card já está na versão vigente.' })
    return e.json(200, { ok: true, numero: v.getInt('numero') })
  },
  $apis.requireAuth(),
)
