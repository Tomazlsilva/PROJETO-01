// SPEC-1-008 (T1.47) — revisão dos nomes da importação do Planner feita pelo Alessandro (05/11/2026).
// - cadastra Luiz Augusto (projetos15@, PPCI), que não estava na BASE_GAVAZZI;
// - "LUIZ AUGUSTO" e "LA" → Luiz Augusto; "CAROL" → Ana Galvani;
// - "LUIZ" em itens de PPCI (INC) → Luiz Augusto; os demais "LUIZ" ficam como texto até a
//   confirmação (Luiz Felipe faz elétrica);
// - JACKSON, LUCAS, MARIANA, RONNER (saíram da Gavazzi) e PARREIRA, BARROS (externos) ficam
//   como texto.
// Atualiza as pessoas das entregas importadas, inclui a pessoa como membro do projeto e audita.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const auditCol = app.findCollectionByNameOrId('auth_audit')
    const audit = (action, target, details) => {
      const a = new Record(auditCol)
      a.set('actor_id', '')
      a.set('target_id', target || '')
      a.set('action', action)
      a.set('outcome', 'success')
      a.set('details', Object.assign({ origem: 'migracao 0030' }, details))
      app.save(a)
    }
    const porEmail = (local) => {
      try {
        return app.findAuthRecordByEmail('_pb_users_auth_', local + '@gavazziengenharia.com.br')
      } catch (_) {
        return null
      }
    }
    let luizAugusto = porEmail('projetos15')
    if (!luizAugusto) {
      luizAugusto = new Record(users)
      luizAugusto.setEmail('projetos15@gavazziengenharia.com.br')
      luizAugusto.setPassword($security.randomString(40))
      luizAugusto.setVerified(false)
      luizAugusto.set('name', 'Luiz Augusto')
      luizAugusto.set('role', 'projetista')
      luizAugusto.set('active', true)
      luizAugusto.set('failed_attempts', 0)
      app.save(luizAugusto)
      audit('user.create', luizAugusto.id, { papel: 'projetista', ativo: true })
    }
    const ana = porEmail('projetos13')

    const lotes = app.findRecordsByFilter('planner_lotes', "status = 'gravado'", '-created', 1, 0)
    if (!lotes.length) return
    const lote = lotes[0]

    const aplicar = (nome, uid, filtroItem) => {
      if (!uid) return 0
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
        if (ps.indexOf(nome) < 0) continue
        if (filtroItem && !filtroItem(l.getString('item').toUpperCase())) continue
        const eid = l.getString('entrega')
        for (const a of app.findRecordsByFilter(
          'entrega_alocacoes',
          "entrega = {:e} && pessoa = '' && pessoa_texto = {:t}",
          '',
          1,
          0,
          { e: eid, t: nome.slice(0, 80) },
        )) {
          a.set('pessoa', uid)
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
            membros.indexOf(uid) < 0 &&
            p.getString('coordenador') !== uid &&
            membros.length < 50
          ) {
            membros.push(uid)
            p.set('membros', membros)
            app.save(p)
          }
        } catch (_) {}
      }
      return n
    }
    const mapear = (nome, uid) => {
      for (const r of app.findRecordsByFilter(
        'planner_nomes',
        'lote = {:l} && nome = {:n}',
        '',
        1,
        0,
        {
          l: lote.id,
          n: nome,
        },
      )) {
        r.set('usuario', uid)
        app.save(r)
      }
    }

    const feitos = {}
    for (const nome of ['LUIZ AUGUSTO', 'LA']) {
      mapear(nome, luizAugusto.id)
      feitos[nome] = aplicar(nome, luizAugusto.id, null)
    }
    if (ana) {
      mapear('CAROL', ana.id)
      feitos.CAROL = aplicar('CAROL', ana.id, null)
    }
    // "LUIZ" só nos itens de PPCI (INC); o mapeamento do nome continua em aberto
    feitos['LUIZ (itens INC)'] = aplicar('LUIZ', luizAugusto.id, (item) => /\bINC\b/.test(item))
    audit('importacao.planner.nome_corrigido', '', { lote: lote.id, alocacoes: feitos })
  },
  (app) => {},
)
