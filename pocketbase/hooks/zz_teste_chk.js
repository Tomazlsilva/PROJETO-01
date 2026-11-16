// TEMPORÁRIO — desativa o teste automático das SPECs 2-001..2-006. Não cria nada:
// só apaga qualquer resto de dados de teste ("ZZ Teste" / zz.teste.*) e informa no log.
// Este arquivo será removido em seguida.
cronAdd('zz_teste_chk', '* * * * *', () => {
  if ($app.store().get('zz_teste_limpo')) return
  $app.store().set('zz_teste_limpo', true)
  const R = []
  try {
    const ids = { users: [], disc: [], modelos: [], projetos: [], cards: [] }
    for (const u of $app.findRecordsByFilter(
      'users',
      "email ~ 'zz.teste.' && email ~ '@exemplo-teste.invalid'",
      '',
      0,
      0,
    ))
      ids.users.push(u.id)
    for (const d of $app.findRecordsByFilter('disciplinas', "nome ~ 'ZZ Teste'", '', 0, 0)) {
      ids.disc.push(d.id)
      for (const m of $app.findRecordsByFilter('checklist_modelos', 'disciplina = {:d}', '', 0, 0, {
        d: d.id,
      }))
        ids.modelos.push(m.id)
    }
    for (const p of $app.findRecordsByFilter('projetos', "nome ~ 'ZZ Teste'", '', 0, 0)) {
      ids.projetos.push(p.id)
      for (const c of $app.findRecordsByFilter('projeto_disciplinas', 'projeto = {:p}', '', 0, 0, {
        p: p.id,
      }))
        ids.cards.push(c.id)
    }
    R.push(
      'restos: ' +
        ids.users.length +
        ' usuários, ' +
        ids.disc.length +
        ' disciplinas, ' +
        ids.projetos.length +
        ' projetos',
    )
    const db = $app.db()
    const lista = (a) => a.map((x) => "'" + x.replace(/[^a-z0-9]/g, '') + "'").join(',')
    const run = (sql) => {
      try {
        db.newQuery(sql).execute()
      } catch (err) {
        R.push('limpeza: ' + sql.slice(0, 60) + ' → ' + String(err).slice(0, 120))
      }
    }
    const C = lista(ids.cards)
    const P = lista(ids.projetos)
    const M = lista(ids.modelos)
    const U = lista(ids.users)
    if (C) {
      for (const t of [
        'correcoes_pos_emissao',
        'emissoes',
        'revisao_rodadas',
        'checklist_eventos',
        'checklist_pendencias',
        'checklists_aplicados',
        'transicoes',
        'notificacoes',
        'atividades',
        'handoff_eventos',
        'tempo_eventos',
      ])
        run('DELETE FROM ' + t + ' WHERE card IN (' + C + ')')
      run('DELETE FROM projeto_disciplinas WHERE id IN (' + C + ')')
    }
    if (P) {
      for (const t of ['notificacoes', 'projeto_historico', 'entrega_historico', 'entregas'])
        run('DELETE FROM ' + t + ' WHERE projeto IN (' + P + ')')
      run('DELETE FROM projetos WHERE id IN (' + P + ')')
    }
    if (M) {
      run('DELETE FROM checklist_versoes WHERE modelo IN (' + M + ')')
      run('DELETE FROM checklist_modelos WHERE id IN (' + M + ')')
    }
    if (ids.disc.length) run('DELETE FROM disciplinas WHERE id IN (' + lista(ids.disc) + ')')
    if (U) {
      run('DELETE FROM pastas_modelos WHERE autor IN (' + U + ')')
      run('DELETE FROM config_qualidade WHERE autor IN (' + U + ')')
      run('DELETE FROM auth_audit WHERE actor_id IN (' + U + ')')
      run('DELETE FROM _authOrigins WHERE recordRef IN (' + U + ')')
      run('DELETE FROM users WHERE id IN (' + U + ')')
    }
    const sobra =
      $app.findRecordsByFilter('users', "email ~ 'zz.teste.'", '', 0, 0).length +
      $app.findRecordsByFilter('disciplinas', "nome ~ 'ZZ Teste'", '', 0, 0).length +
      $app.findRecordsByFilter('projetos', "nome ~ 'ZZ Teste'", '', 0, 0).length
    R.push('restantes depois da limpeza: ' + sobra)
  } catch (err) {
    R.push('ERRO ' + String(err))
  }
  for (const l of R) console.log('LIMPEZA_TESTE ' + l)
})
