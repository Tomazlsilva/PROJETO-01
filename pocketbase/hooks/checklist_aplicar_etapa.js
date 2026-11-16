// SPEC-2-002 (T2.04, CA-2-002-02) — quando o card entra na etapa configurada no Fluxo
// (padrão: entrada em "Entrada pendente", revisão em "Aguardando revisão"), recebe uma única
// vez a versão vigente do modelo real da disciplina (e da tipologia do projeto, se houver).
// A versão fica congelada no card. Sem modelo real vigente: nada é aplicado ("sem checklist").
// Modelos de exemplo nunca são aplicados. Falha aqui não impede a mudança de etapa.

onRecordCreate((e) => {
  e.next()
  const aplicar = (app, card, tipo) => {
    if (
      app.findRecordsByFilter('checklists_aplicados', 'card = {:c} && tipo = {:t}', '', 1, 0, {
        c: card.id,
        t: tipo,
      }).length > 0
    )
      return
    const p = app.findRecordById('projetos', card.getString('projeto'))
    const tip = p.getString('tipologia').trim()
    const cand = app.findRecordsByFilter(
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
    if (!m) return
    const vs = app.findRecordsByFilter(
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
    if (vs.length === 0) return
    const a = new Record(app.findCollectionByNameOrId('checklists_aplicados'))
    a.set('card', card.id)
    a.set('projeto', p.id)
    a.set('tipo', tipo)
    a.set('modelo', m.id)
    a.set('versao', vs[0].id)
    a.set('numero', vs[0].getInt('numero'))
    a.set('itens', JSON.parse(vs[0].getString('itens') || '[]'))
    a.set('resultados', {})
    a.set('etapa', card.getString('etapa'))
    a.set('origem', 'etapa')
    app.save(a)
    const ev = new Record(app.findCollectionByNameOrId('checklist_eventos'))
    ev.set('aplicado', a.id)
    ev.set('card', card.id)
    ev.set('projeto', p.id)
    ev.set('tipo', tipo)
    ev.set('acao', 'aplicado')
    ev.set('depois', 'v' + vs[0].getInt('numero'))
    ev.set('detalhes', {
      modelo: m.id,
      tipologia: m.getString('tipologia'),
      etapa: card.getString('etapa'),
    })
    app.save(ev)
  }
  try {
    const vf = e.app.findRecordsByFilter('fluxo_versoes', 'ativa = true', '-numero', 1, 0)
    const cfg = vf.length > 0 ? JSON.parse(vf[0].getString('config') || '{}') : {}
    const ck = cfg.checklists || { entrada: 'entrada_pendente', revisao: 'aguardando_revisao' }
    const etapa = e.record.getString('etapa')
    for (const tipo of ['entrada', 'revisao'])
      if (ck[tipo] === etapa) aplicar(e.app, e.record, tipo)
  } catch (err) {
    e.app.logger().error('aplicar checklist falhou', 'card', e.record.id, 'erro', String(err))
  }
}, 'projeto_disciplinas')

onRecordUpdate((e) => {
  let antes = ''
  try {
    antes = e.record.original().getString('etapa')
  } catch (_) {}
  e.next()
  const etapa = e.record.getString('etapa')
  if (!etapa || etapa === antes) return
  const aplicar = (app, card, tipo) => {
    if (
      app.findRecordsByFilter('checklists_aplicados', 'card = {:c} && tipo = {:t}', '', 1, 0, {
        c: card.id,
        t: tipo,
      }).length > 0
    )
      return
    const p = app.findRecordById('projetos', card.getString('projeto'))
    const tip = p.getString('tipologia').trim()
    const cand = app.findRecordsByFilter(
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
    if (!m) return
    const vs = app.findRecordsByFilter(
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
    if (vs.length === 0) return
    const a = new Record(app.findCollectionByNameOrId('checklists_aplicados'))
    a.set('card', card.id)
    a.set('projeto', p.id)
    a.set('tipo', tipo)
    a.set('modelo', m.id)
    a.set('versao', vs[0].id)
    a.set('numero', vs[0].getInt('numero'))
    a.set('itens', JSON.parse(vs[0].getString('itens') || '[]'))
    a.set('resultados', {})
    a.set('etapa', card.getString('etapa'))
    a.set('origem', 'etapa')
    app.save(a)
    const ev = new Record(app.findCollectionByNameOrId('checklist_eventos'))
    ev.set('aplicado', a.id)
    ev.set('card', card.id)
    ev.set('projeto', p.id)
    ev.set('tipo', tipo)
    ev.set('acao', 'aplicado')
    ev.set('depois', 'v' + vs[0].getInt('numero'))
    ev.set('detalhes', {
      modelo: m.id,
      tipologia: m.getString('tipologia'),
      etapa: card.getString('etapa'),
    })
    app.save(ev)
  }
  try {
    const vf = e.app.findRecordsByFilter('fluxo_versoes', 'ativa = true', '-numero', 1, 0)
    const cfg = vf.length > 0 ? JSON.parse(vf[0].getString('config') || '{}') : {}
    const ck = cfg.checklists || { entrada: 'entrada_pendente', revisao: 'aguardando_revisao' }
    for (const tipo of ['entrada', 'revisao'])
      if (ck[tipo] === etapa) aplicar(e.app, e.record, tipo)
  } catch (err) {
    e.app.logger().error('aplicar checklist falhou', 'card', e.record.id, 'erro', String(err))
  }
}, 'projeto_disciplinas')
