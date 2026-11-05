// SPEC-1-008 (T1.47) — confirmação do Alessandro (05/11/2026): todos os "LUIZ" da importação do
// Planner são o Luiz Augusto (PPCI). Liga os que ainda estavam como texto, inclui como membro do
// projeto e audita.
migrate(
  (app) => {
    let luiz = null
    try {
      luiz = app.findAuthRecordByEmail('_pb_users_auth_', 'projetos15@gavazziengenharia.com.br')
    } catch (_) {}
    const lotes = app.findRecordsByFilter('planner_lotes', "status = 'gravado'", '-created', 1, 0)
    if (!luiz || !lotes.length) return
    const lote = lotes[0]
    for (const r of app.findRecordsByFilter(
      'planner_nomes',
      "lote = {:l} && nome = 'LUIZ'",
      '',
      1,
      0,
      {
        l: lote.id,
      },
    )) {
      r.set('usuario', luiz.id)
      app.save(r)
    }
    let n = 0
    for (const l of app.findRecordsByFilter(
      'planner_linhas',
      "lote = {:l} && entrega != ''",
      '',
      0,
      0,
      {
        l: lote.id,
      },
    )) {
      let ps = []
      try {
        ps = JSON.parse(l.getString('pessoas') || '[]')
      } catch (_) {}
      if (ps.indexOf('LUIZ') < 0) continue
      const eid = l.getString('entrega')
      for (const a of app.findRecordsByFilter(
        'entrega_alocacoes',
        "entrega = {:e} && pessoa = '' && pessoa_texto = 'LUIZ'",
        '',
        1,
        0,
        { e: eid },
      )) {
        a.set('pessoa', luiz.id)
        a.set('pessoa_texto', '')
        app.save(a)
        n++
      }
      try {
        const p = app.findRecordById(
          'projetos',
          app.findRecordById('entregas', eid).getString('projeto'),
        )
        const membros = p.getStringSlice('membros')
        if (
          membros.indexOf(luiz.id) < 0 &&
          p.getString('coordenador') !== luiz.id &&
          membros.length < 50
        ) {
          membros.push(luiz.id)
          p.set('membros', membros)
          app.save(p)
        }
      } catch (_) {}
    }
    const a = new Record(app.findCollectionByNameOrId('auth_audit'))
    a.set('actor_id', '')
    a.set('action', 'importacao.planner.nome_corrigido')
    a.set('outcome', 'success')
    a.set('details', { origem: 'migracao 0031', lote: lote.id, nome: 'LUIZ', alocacoes: n })
    app.save(a)
  },
  (app) => {},
)
