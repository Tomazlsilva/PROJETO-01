// TEMPORÁRIO — teste ponta a ponta das SPECs 2-001/2-002 na prévia. Roda uma vez,
// grava o resultado no log ("TESTE_CHK") e apaga todos os dados de teste. Será removido.
cronAdd('zz_teste_chk', '* * * * *', () => {
  if ($app.store().get('zz_teste_chk_feito')) return
  $app.store().set('zz_teste_chk_feito', true)
  const BASE = 'https://login-do-crm-921ce.shrd03.internal.goskip.dev'
  const R = []
  const ok = (nome, cond, extra) =>
    R.push((cond ? 'OK   ' : 'FALHA ') + nome + (extra ? ' | ' + extra : ''))
  const ids = { users: [], disc: [], modelos: [], projetos: [], cards: [] }
  const req = (tok, method, path, body) => {
    try {
      const r = $http.send({
        url: BASE + path,
        method: method,
        body: body ? JSON.stringify(body) : '',
        headers: { 'content-type': 'application/json', Authorization: tok },
        timeout: 30,
      })
      return { s: r.statusCode, j: r.json || {} }
    } catch (err) {
      return { s: 0, j: { erro: String(err) } }
    }
  }
  // restos de execuções anteriores entram na mesma limpeza do fim
  try {
    const restos = []
    for (const u of $app.findRecordsByFilter('users', "email ~ 'zz.teste.'", '', 0, 0)) {
      ids.users.push(u.id)
      restos.push('user ' + u.id)
    }
    for (const d of $app.findRecordsByFilter('disciplinas', "nome ~ 'ZZ Teste'", '', 0, 0)) {
      ids.disc.push(d.id)
      restos.push('disc ' + d.id)
      for (const m of $app.findRecordsByFilter('checklist_modelos', 'disciplina = {:d}', '', 0, 0, {
        d: d.id,
      }))
        ids.modelos.push(m.id)
    }
    for (const p of $app.findRecordsByFilter('projetos', "nome ~ 'ZZ Teste'", '', 0, 0)) {
      ids.projetos.push(p.id)
      restos.push('projeto ' + p.id)
      for (const c of $app.findRecordsByFilter('projeto_disciplinas', 'projeto = {:p}', '', 0, 0, {
        p: p.id,
      }))
        ids.cards.push(c.id)
    }
    if (restos.length) R.push('restos encontrados: ' + restos.join(', '))
  } catch (err) {
    R.push('ERRO restos ' + String(err))
  }
  try {
    const sfx = $security.randomStringWithAlphabet(6, 'abcdefghijkmnpqrstuvwxyz23456789')
    const users = $app.findCollectionByNameOrId('users')
    const mkUser = (nome, role) => {
      const u = new Record(users)
      u.set('email', 'zz.teste.' + nome + '.' + sfx + '@exemplo-teste.invalid')
      u.setPassword($security.randomString(30))
      u.set('name', 'ZZ Teste ' + nome)
      u.set('role', role)
      u.set('active', true)
      u.set('verified', true)
      u.set('session_expires_at', new Date(Date.now() + 3 * 3600000).toISOString())
      $app.save(u)
      ids.users.push(u.id)
      return u
    }
    const coord = mkUser('coord', 'coordenador')
    const proj = mkUser('proj', 'projetista')
    const tC = coord.newAuthToken()
    const tP = proj.newAuthToken()

    const dcol = $app.findCollectionByNameOrId('disciplinas')
    const mkDisc = (nome) => {
      const d = new Record(dcol)
      d.set('nome', 'ZZ Teste ' + nome + ' ' + sfx)
      d.set('ativa', true)
      d.set('personalizada', true)
      $app.save(d)
      ids.disc.push(d.id)
      return d
    }
    const D = mkDisc('real')
    const D2 = mkDisc('exemplo')

    // ---- SPEC-2-001 ----
    let r = req(tP, 'POST', '/backend/v1/checklists', { disciplina: D.id, tipo: 'entrada' })
    ok('2-001 projetista não cria modelo (403)', r.s === 403, 'status ' + r.s)
    r = req(tC, 'POST', '/backend/v1/checklists', {
      disciplina: D.id,
      tipo: 'entrada',
      tipologia: '',
    })
    ok('2-001 coordenador cria modelo (201)', r.s === 201, 'status ' + r.s)
    const M = r.j.id
    ids.modelos.push(M)
    r = req(tC, 'GET', '/backend/v1/checklists/' + M)
    let base = r.j.updated
    const itens = [
      {
        id: 'itcritA',
        texto: 'Planta de arquitetura atualizada',
        grupo: 'Base',
        severidade: 'critico',
        referencia: '',
      },
      {
        id: 'itnormB',
        texto: 'Layout de mobiliário',
        grupo: 'Base',
        severidade: 'normal',
        referencia: '',
      },
    ]
    r = req(tC, 'POST', '/backend/v1/checklists/' + M + '/publicar', {
      base: base,
      itens: [{ id: 'x', texto: '  ' }],
    })
    ok('2-001 publicar com item vazio é recusado (400)', r.s === 400, 'status ' + r.s)
    r = req(tC, 'POST', '/backend/v1/checklists/' + M + '/rascunho', { base: base, itens: itens })
    ok('2-001 salvar rascunho', r.s === 200, 'status ' + r.s)
    base = r.j.updated
    r = req(tC, 'POST', '/backend/v1/checklists/' + M + '/publicar', {
      base: 'velho',
      itens: itens,
    })
    ok('2-001 base desatualizada → 409', r.s === 409, 'status ' + r.s)
    r = req(tC, 'POST', '/backend/v1/checklists/' + M + '/publicar', { base: base, itens: itens })
    ok(
      '2-001 publicar v1',
      r.s === 200 && r.j.numero === 1,
      'status ' + r.s + ' numero ' + r.j.numero,
    )

    // vigência duplicada
    r = req(tC, 'POST', '/backend/v1/checklists', {
      disciplina: D.id,
      tipo: 'entrada',
      duplicar_de: { modelo: M },
    })
    const M2 = r.j.id
    ids.modelos.push(M2)
    ok('2-001 duplicar copia itens', r.s === 201, 'status ' + r.s)
    r = req(tC, 'GET', '/backend/v1/checklists/' + M2)
    ok('2-001 duplicado tem 2 itens no rascunho', (r.j.rascunho || []).length === 2)
    r = req(tC, 'POST', '/backend/v1/checklists/' + M2 + '/publicar', {
      base: r.j.updated,
      itens: r.j.rascunho,
    })
    ok(
      '2-001 segunda vigência para mesma disciplina/tipo → 409',
      r.s === 409 && r.j.code === 'vigencia_duplicada',
      'status ' + r.s,
    )

    // versão imutável
    const v1 = $app.findRecordsByFilter('checklist_versoes', 'modelo = {:m}', '', 1, 0, { m: M })[0]
    let imutavel = false
    try {
      v1.set('nota', 'alterada')
      $app.save(v1)
    } catch (_) {
      imutavel = true
    }
    ok('2-001 versão publicada não pode ser alterada', imutavel)

    // modelo exemplo em D2 (não deve ser aplicado)
    const mcol = $app.findCollectionByNameOrId('checklist_modelos')
    const ex = new Record(mcol)
    ex.set('disciplina', D2.id)
    ex.set('tipo', 'entrada')
    ex.set('tipologia', '')
    ex.set('estado', 'ativo')
    ex.set('exemplo', true)
    ex.set('vigente', true)
    ex.set('versao_atual', 1)
    $app.save(ex)
    ids.modelos.push(ex.id)
    const exv = new Record($app.findCollectionByNameOrId('checklist_versoes'))
    exv.set('modelo', ex.id)
    exv.set('numero', 1)
    exv.set('itens', [
      { id: 'e1', texto: 'Exemplo crítico', grupo: '', severidade: 'critico', referencia: '' },
    ])
    exv.set('total_itens', 1)
    exv.set('criticos', 1)
    $app.save(exv)

    // ---- SPEC-2-002 ----
    const pr = new Record($app.findCollectionByNameOrId('projetos'))
    pr.set('nome', 'ZZ Teste checklist ' + sfx)
    pr.set('coordenador', coord.id)
    pr.set('membros', [proj.id])
    pr.set('prioridade', 'Normal')
    $app.save(pr)
    ids.projetos.push(pr.id)
    const ccol = $app.findCollectionByNameOrId('projeto_disciplinas')
    const mkCard = (d) => {
      const c = new Record(ccol)
      c.set('projeto', pr.id)
      c.set('disciplina', d.id)
      c.set('responsavel', proj.id)
      $app.save(c)
      ids.cards.push(c.id)
      return c
    }
    const C = mkCard(D)
    const C2 = mkCard(D2)
    const etapaC = $app.findRecordById('projeto_disciplinas', C.id).getString('etapa')
    ok('2-002 card novo entra em entrada_pendente', etapaC === 'entrada_pendente', etapaC)
    r = req(tP, 'GET', '/backend/v1/cards/' + C.id + '/checklists')
    ok(
      '2-002 checklist de entrada v1 aplicado ao entrar na etapa',
      r.s === 200 && r.j.entrada && r.j.entrada.numero === 1,
      'status ' + r.s,
    )
    ok('2-002 1 item crítico pendente', r.j.entrada && r.j.entrada.criticos_pendentes.length === 1)
    let vck = r.j.entrada ? r.j.entrada.versao : ''
    r = req(tP, 'GET', '/backend/v1/cards/' + C2.id + '/checklists')
    ok(
      '2-002 modelo de exemplo NÃO é aplicado (sem checklist)',
      r.s === 200 && r.j.entrada === null,
    )

    // trava antes de Pronto
    const verCard = () => $app.findRecordById('projeto_disciplinas', C.id).getString('updated')
    r = req(tP, 'POST', '/backend/v1/cards/' + C.id + '/mover', {
      para: 'pronto',
      versao: verCard(),
    })
    ok(
      '2-002 mover p/ Pronto com crítico pendente → 409',
      r.s === 409 && r.j.code === 'checklist_entrada_pendente',
      'status ' + r.s + ' ' + (r.j.message || ''),
    )
    r = req(tP, 'POST', '/backend/v1/cards/' + C2.id + '/mover', {
      para: 'pronto',
      versao: $app.findRecordById('projeto_disciplinas', C2.id).getString('updated'),
    })
    ok(
      '2-002 disciplina sem checklist não trava',
      r.s === 200,
      'status ' + r.s + ' ' + (r.j.message || ''),
    )

    // N/A sem justificativa
    r = req(tP, 'POST', '/backend/v1/cards/' + C.id + '/checklists/entrada/marcar', {
      versao: vck,
      item: 'itnormB',
      resultado: 'nao_se_aplica',
    })
    ok('2-002 "não se aplica" sem justificativa → 400', r.s === 400, 'status ' + r.s)
    r = req(tP, 'POST', '/backend/v1/cards/' + C.id + '/checklists/entrada/marcar', {
      versao: vck,
      item: 'itnormB',
      resultado: 'nao_se_aplica',
      justificativa: 'Galpão sem layout',
    })
    ok('2-002 "não se aplica" com justificativa', r.s === 200, 'status ' + r.s)
    vck = r.j.versao
    // não conforme com pendência
    const amanha = new Date(Date.now() - 3 * 3600000 + 2 * 86400000).toISOString().slice(0, 10)
    r = req(tP, 'POST', '/backend/v1/cards/' + C.id + '/checklists/entrada/marcar', {
      versao: vck,
      item: 'itcritA',
      resultado: 'nao_conforme',
      pendencia: { motivo: 'Cliente não enviou a rev. 03', dono: coord.id, prazo: amanha },
    })
    ok(
      '2-002 não conforme abre pendência',
      r.s === 200,
      'status ' + r.s + ' ' + JSON.stringify(r.j).slice(0, 200),
    )
    vck = r.j.versao
    r = req(tP, 'POST', '/backend/v1/cards/' + C.id + '/checklists/entrada/marcar', {
      versao: 'velha',
      item: 'itcritA',
      resultado: 'conforme',
    })
    ok('2-002 marcação sobre versão velha → 409', r.s === 409, 'status ' + r.s)
    r = req(tC, 'GET', '/backend/v1/fila')
    const naFila = (r.j.itens || []).find((i) => i.id === C.id)
    ok(
      '2-002 pendência aparece na fila do dono',
      !!naFila &&
        (naFila.motivos || []).indexOf('pendencia_entrada') >= 0 &&
        (naFila.pendencias_entrada || []).length === 1,
      'status ' + r.s,
    )
    r = req(tP, 'POST', '/backend/v1/cards/' + C.id + '/mover', {
      para: 'pronto',
      versao: verCard(),
    })
    ok('2-002 ainda travado com pendência aberta', r.s === 409)
    r = req(tP, 'POST', '/backend/v1/cards/' + C.id + '/checklists/entrada/marcar', {
      versao: vck,
      item: 'itcritA',
      resultado: 'conforme',
    })
    ok('2-002 marcar conforme', r.s === 200, 'status ' + r.s)
    const abertas = $app.findRecordsByFilter(
      'checklist_pendencias',
      "card = {:c} && status = 'aberta'",
      '',
      0,
      0,
      { c: C.id },
    )
    ok('2-002 pendência fechou sozinha', abertas.length === 0)

    // nova versão do modelo não muda o card; troca só pelo coordenador
    r = req(tC, 'GET', '/backend/v1/checklists/' + M)
    const itens2 = itens.concat([
      { id: 'itnovoC', texto: 'Item novo da v2', grupo: '', severidade: 'normal', referencia: '' },
    ])
    r = req(tC, 'POST', '/backend/v1/checklists/' + M + '/rascunho', {
      base: r.j.updated,
      itens: itens2,
    })
    r = req(tC, 'POST', '/backend/v1/checklists/' + M + '/publicar', {
      base: r.j.updated,
      itens: itens2,
    })
    ok('2-001 publicar v2', r.s === 200 && r.j.numero === 2, 'status ' + r.s)
    r = req(tP, 'GET', '/backend/v1/cards/' + C.id + '/checklists')
    ok(
      '2-002 card continua na v1 após publicar v2',
      r.j.entrada && r.j.entrada.numero === 1 && r.j.vigente.entrada.numero === 2,
    )
    vck = r.j.entrada.versao
    r = req(tP, 'POST', '/backend/v1/cards/' + C.id + '/checklists/entrada/aplicar', {
      motivo: 'teste',
      versao: vck,
    })
    ok('2-002 projetista não troca versão (403)', r.s === 403, 'status ' + r.s)
    r = req(tC, 'POST', '/backend/v1/cards/' + C.id + '/checklists/entrada/aplicar', {
      motivo: 'Atualizar para v2',
      versao: vck,
    })
    ok('2-002 coordenador troca para v2', r.s === 200 && r.j.numero === 2, 'status ' + r.s)
    r = req(tP, 'GET', '/backend/v1/cards/' + C.id + '/checklists')
    const a = (r.j.entrada && r.j.entrada.itens) || []
    ok(
      '2-002 marcações mantidas na troca',
      a.length === 3 && a[0].resultado === 'conforme' && a[1].resultado === 'nao_se_aplica',
    )

    r = req(tP, 'POST', '/backend/v1/cards/' + C.id + '/mover', {
      para: 'pronto',
      versao: verCard(),
    })
    ok(
      '2-002 com críticos resolvidos vai para Pronto',
      r.s === 200,
      'status ' + r.s + ' ' + (r.j.message || ''),
    )
    // checklist de revisão aplicado ao chegar em "Aguardando revisão": sem modelo real → nenhum
    r = req(tP, 'GET', '/backend/v1/cards/' + C.id + '/checklists')
    ok(
      '2-002 eventos registrados no histórico',
      (r.j.eventos || []).length >= 5,
      String((r.j.eventos || []).length),
    )

    // ---- SPEC-2-003 ----
    r = req(tC, 'POST', '/backend/v1/checklists', { disciplina: D.id, tipo: 'revisao' })
    const MR = r.j.id
    ids.modelos.push(MR)
    const itensR = [
      {
        id: 'rv1',
        texto: 'Pressões mínimas conferidas',
        grupo: '',
        severidade: 'critico',
        referencia: '',
      },
      { id: 'rv2', texto: 'Legenda no padrão', grupo: '', severidade: 'normal', referencia: '' },
      {
        id: 'rv3',
        texto: 'Calhas com área de contribuição',
        grupo: '',
        severidade: 'normal',
        referencia: '',
      },
    ]
    r = req(tC, 'GET', '/backend/v1/checklists/' + MR)
    r = req(tC, 'POST', '/backend/v1/checklists/' + MR + '/publicar', {
      base: r.j.updated,
      itens: itensR,
    })
    ok('2-003 checklist de revisão publicado', r.s === 200, 'status ' + r.s)
    r = req(tP, 'POST', '/backend/v1/cards/' + C.id + '/mover', {
      para: 'em_elaboracao',
      versao: verCard(),
    })
    r = req(tP, 'POST', '/backend/v1/cards/' + C.id + '/mover', {
      para: 'aguardando_revisao',
      versao: verCard(),
    })
    ok(
      '2-003 projetista envia para revisão',
      r.s === 200,
      'status ' + r.s + ' ' + (r.j.message || ''),
    )
    r = req(tC, 'GET', '/backend/v1/cards/' + C.id + '/revisao')
    ok(
      '2-003 checklist de revisão aplicado ao entrar na etapa',
      r.s === 200 && !!r.j.checklist && r.j.checklist.itens.length === 3,
    )
    r = req(tC, 'POST', '/backend/v1/cards/' + C.id + '/mover', {
      para: 'aprovado',
      versao: verCard(),
    })
    ok(
      '2-003 aprovar sem rodada aberta → 409',
      r.s === 409 && r.j.code === 'revisao_nao_iniciada',
      'status ' + r.s,
    )
    r = req(tP, 'POST', '/backend/v1/cards/' + C.id + '/revisao/abrir')
    ok('2-003 projetista não abre rodada (403)', r.s === 403, 'status ' + r.s)
    r = req(tC, 'POST', '/backend/v1/cards/' + C.id + '/revisao/abrir')
    ok('2-003 coordenador abre rodada 1', r.s === 201 && r.j.numero === 1, 'status ' + r.s)
    const R1 = r.j.id
    let vr = r.j.versao
    const marcarR = (tok, rid, item, resultado, extra) =>
      req(
        tok,
        'POST',
        '/backend/v1/cards/' + C.id + '/revisao/' + rid + '/marcar',
        Object.assign({ versao: vr, item: item, resultado: resultado }, extra || {}),
      )
    r = marcarR(tP, R1, 'rv1', 'conforme')
    ok('2-003 projetista não marca revisão (403)', r.s === 403, 'status ' + r.s)
    r = marcarR(tC, R1, 'rv1', 'excecao')
    ok('2-003 exceção sem justificativa → 400', r.s === 400, 'status ' + r.s)
    r = marcarR(tC, R1, 'rv1', 'nao_conforme', { observacao: 'Pressão do 8º abaixo do mínimo' })
    ok('2-003 marcar não conforme', r.s === 200, 'status ' + r.s)
    vr = r.j.versao
    r = marcarR(tC, R1, 'rv2', 'conforme')
    vr = r.j.versao
    const revMover = (para, just) =>
      req(tC, 'POST', '/backend/v1/cards/' + C.id + '/mover', {
        para: para,
        versao: verCard(),
        justificativa: just || '',
        revisao: { rodada: R1, versao: vr },
      })
    r = revMover('aprovado')
    ok('2-003 encerrar com item sem marcar → 400', r.s === 400, 'status ' + r.s)
    r = marcarR(tC, R1, 'rv3', 'nao_se_aplica', { justificativa: 'Laje impermeabilizada' })
    vr = r.j.versao
    r = revMover('aprovado')
    ok('2-003 aprovar com não conforme → 400', r.s === 400, 'status ' + r.s)
    r = revMover('em_correcao', 'Ajustar pressões')
    ok('2-003 devolver para correção', r.s === 200, 'status ' + r.s + ' ' + (r.j.message || ''))
    ok(
      '2-003 card em "Em correção"',
      $app.findRecordById('projeto_disciplinas', C.id).getString('etapa') === 'em_correcao',
    )
    r = req(tP, 'GET', '/backend/v1/fila')
    const fc = (r.j.itens || []).find((i) => i.id === C.id)
    ok(
      '2-003 itens a corrigir na fila do responsável',
      !!fc && !!fc.correcao && fc.correcao.itens.length === 1,
    )
    r = req(tP, 'POST', '/backend/v1/cards/' + C.id + '/mover', {
      para: 'aguardando_revisao',
      versao: verCard(),
    })
    ok('2-003 reenviar sem marcar correção → 400', r.s === 400, 'status ' + r.s)
    r = req(tC, 'GET', '/backend/v1/cards/' + C.id + '/revisao')
    const r1v = r.j.rodadas[0].versao
    ok('2-003 rodada 1 reprovada', r.j.rodadas[0].resultado === 'reprovado')
    r = req(tP, 'POST', '/backend/v1/cards/' + C.id + '/revisao/' + R1 + '/corrigir', {
      versao: r1v,
      item: 'rv1',
      corrigido: true,
      nota: 'Bomba ajustada',
    })
    ok('2-003 projetista marca correção', r.s === 200, 'status ' + r.s)
    r = req(tP, 'POST', '/backend/v1/cards/' + C.id + '/mover', {
      para: 'aguardando_revisao',
      versao: verCard(),
    })
    ok('2-003 reenviar após corrigir', r.s === 200, 'status ' + r.s + ' ' + (r.j.message || ''))
    r = req(tC, 'POST', '/backend/v1/cards/' + C.id + '/revisao/abrir')
    ok('2-003 abre rodada 2', r.s === 201 && r.j.numero === 2, 'status ' + r.s)
    const R2 = r.j.id
    vr = r.j.versao
    r = req(tC, 'GET', '/backend/v1/cards/' + C.id + '/revisao')
    const ab = (r.j.rodadas || []).find((x) => x.id === R2)
    ok(
      '2-003 rodada 2 herda resolvidos e deixa o não conforme em aberto',
      !!ab && !!ab.itens.rv2 && !!ab.itens.rv3 && !ab.itens.rv1,
    )
    r = marcarR(tC, R2, 'rv1', 'excecao', { justificativa: 'Cliente aceitou; ajuste na obra' })
    vr = r.j.versao
    r = req(tC, 'POST', '/backend/v1/cards/' + C.id + '/mover', {
      para: 'aprovado',
      versao: verCard(),
      revisao: { rodada: R2, versao: vr },
    })
    ok('2-003 aprovar com exceção', r.s === 200, 'status ' + r.s + ' ' + (r.j.message || ''))
    r = req(tC, 'GET', '/backend/v1/cards/' + C.id + '/revisao')
    ok(
      '2-003 histórico com 2 rodadas e "aprovado com exceção"',
      r.j.rodadas.length === 2 &&
        r.j.rodadas[0].resultado === 'aprovado_com_excecao' &&
        r.j.rodadas[1].resultado === 'reprovado',
    )
    const r2v = r.j.rodadas[0].versao
    r = req(tP, 'POST', '/backend/v1/cards/' + C.id + '/revisao/' + R2 + '/reabrir', {
      versao: r2v,
      justificativa: 'teste',
    })
    ok('2-003 projetista não reabre (403)', r.s === 403, 'status ' + r.s)
    r = req(tC, 'POST', '/backend/v1/cards/' + C.id + '/revisao/' + R2 + '/reabrir', {
      versao: r2v,
      justificativa: 'Faltou conferir',
    })
    ok('2-003 coordenador reabre a rodada', r.s === 200, 'status ' + r.s)
    r = req(tC, 'GET', '/backend/v1/cards/' + C.id + '/revisao')
    ok(
      '2-003 reaberta: card em revisão e versão anterior no histórico',
      r.j.etapa === 'aguardando_revisao' &&
        r.j.rodadas[0].status === 'aberta' &&
        r.j.rodadas[0].reaberturas.length === 1,
    )
    // sem checklist de revisão (disciplina D2)
    const ver2 = () => $app.findRecordById('projeto_disciplinas', C2.id).getString('updated')
    req(tP, 'POST', '/backend/v1/cards/' + C2.id + '/mover', {
      para: 'em_elaboracao',
      versao: ver2(),
    })
    req(tP, 'POST', '/backend/v1/cards/' + C2.id + '/mover', {
      para: 'aguardando_revisao',
      versao: ver2(),
    })
    r = req(tC, 'POST', '/backend/v1/cards/' + C2.id + '/mover', {
      para: 'em_correcao',
      versao: ver2(),
    })
    ok('2-003 sem checklist: devolver sem motivo → 400', r.s === 400, 'status ' + r.s)
    r = req(tC, 'POST', '/backend/v1/cards/' + C2.id + '/mover', {
      para: 'em_correcao',
      versao: ver2(),
      justificativa: 'Faltou o quadro',
    })
    ok('2-003 sem checklist: devolver com motivo', r.s === 200, 'status ' + r.s)
    r = req(tC, 'GET', '/backend/v1/cards/' + C2.id + '/revisao')
    ok(
      '2-003 sem checklist: rodada marcada "sem checklist"',
      (r.j.rodadas || []).length === 1 && r.j.rodadas[0].sem_checklist === true,
    )

    // ---- SPEC-2-004 ----
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
    const emitir = (tok, dados) =>
      req(tok, 'POST', '/backend/v1/cards/' + C.id + '/emissoes', dados)
    const base4 = {
      rotulo: 'R00',
      data: hoje,
      destinatario: 'Construtora teste',
      responsavel: coord.id,
    }
    r = emitir(tC, Object.assign({ tipo: 'final' }, base4))
    ok(
      '2-004 emitir sem revisão aprovada → 409',
      r.s === 409 && r.j.code === 'sem_aprovacao',
      'status ' + r.s,
    )
    r = req(tC, 'GET', '/backend/v1/cards/' + C.id + '/revisao')
    const rab = r.j.rodadas[0]
    r = req(tC, 'POST', '/backend/v1/cards/' + C.id + '/mover', {
      para: 'aprovado',
      versao: verCard(),
      revisao: { rodada: rab.id, versao: rab.versao },
    })
    ok('2-004 aprova a revisão reaberta', r.s === 200, 'status ' + r.s + ' ' + (r.j.message || ''))
    const E1 = new Record($app.findCollectionByNameOrId('entregas'))
    E1.set('projeto', pr.id)
    E1.set('tipo', 'final')
    E1.set('data', hoje + ' 12:00:00.000Z')
    E1.set('disciplinas', [C.id])
    E1.set('origem', 'central')
    $app.save(E1)
    r = emitir(tP, Object.assign({ entrega: E1.id }, base4))
    ok('2-004 projetista não emite (403)', r.s === 403, 'status ' + r.s)
    r = emitir(tC, Object.assign({ entrega: E1.id }, base4))
    ok(
      '2-004 emissão R00 ligada à entrega',
      r.s === 201 && r.j.entregue === true,
      'status ' + r.s + ' ' + JSON.stringify(r.j).slice(0, 160),
    )
    const EM1 = r.j.id
    ok(
      '2-004 entrega marcada como entregue',
      $app.findRecordById('entregas', E1.id).getBool('entregue'),
    )
    r = emitir(tC, Object.assign({ entrega: E1.id }, base4))
    ok('2-004 segunda emissão na mesma entrega → 409', r.s === 409, 'status ' + r.s)
    r = emitir(tC, Object.assign({}, base4, { rotulo: 'R01', tipo: 'revisao' }))
    ok(
      '2-004 sem entrega no calendário: cria a entrega',
      r.s === 201 && r.j.entrega_criada === true,
      'status ' + r.s,
    )
    const EM2 = r.j.id
    r = req(tC, 'GET', '/backend/v1/cards/' + C.id + '/emissoes')
    const em2 = (r.j.emissoes || []).find((x) => x.id === EM2)
    r = req(tC, 'POST', '/backend/v1/cards/' + C.id + '/emissoes/' + EM2 + '/cancelar', {
      versao: em2.versao,
    })
    ok('2-004 cancelar sem justificativa → 400', r.s === 400, 'status ' + r.s)
    r = req(tC, 'POST', '/backend/v1/cards/' + C.id + '/emissoes/' + EM2 + '/cancelar', {
      versao: em2.versao,
      justificativa: 'Registrada por engano',
    })
    ok('2-004 cancelar com justificativa', r.s === 200, 'status ' + r.s)
    r = req(tC, 'GET', '/backend/v1/cards/' + C.id + '/emissoes')
    ok(
      '2-004 emissão cancelada continua no histórico',
      (r.j.emissoes || []).length === 2 &&
        (r.j.emissoes || []).find((x) => x.id === EM2).status === 'cancelada',
    )
    const corr = (tok, dados) =>
      req(tok, 'POST', '/backend/v1/cards/' + C.id + '/emissoes/' + EM1 + '/correcao', dados)
    r = corr(tP, {
      origem: 'obra',
      severidade: 'media',
      descricao: 'Registro fora da altura',
      decisao: 'valida',
    })
    ok('2-004 projetista não registra correção (403)', r.s === 403, 'status ' + r.s)
    r = corr(tC, {
      origem: 'cliente',
      severidade: 'baixa',
      descricao: 'Trocar fabricante',
      decisao: 'invalida',
    })
    ok('2-004 inválida sem justificativa → 400', r.s === 400, 'status ' + r.s)
    r = corr(tC, {
      origem: 'cliente',
      severidade: 'baixa',
      descricao: 'Trocar fabricante',
      decisao: 'invalida',
      justificativa: 'Mudança de escopo',
    })
    ok(
      '2-004 correção inválida: sem atividade, card segue aprovado',
      r.s === 201 && !r.j.atividade && !r.j.card_em_correcao,
      'status ' + r.s,
    )
    r = corr(tC, {
      origem: 'obra',
      severidade: 'media',
      descricao: 'Registro fora da altura',
      item: 'rv2',
      decisao: 'valida',
    })
    ok(
      '2-004 correção válida cria atividade e volta para correção',
      r.s === 201 && !!r.j.atividade && r.j.card_em_correcao === true,
      'status ' + r.s,
    )
    const CV = r.j.id
    ok(
      '2-004 card em "Em correção"',
      $app.findRecordById('projeto_disciplinas', C.id).getString('etapa') === 'em_correcao',
    )
    r = req(tP, 'GET', '/backend/v1/fila')
    const fq = (r.j.itens || []).find((i) => i.id === C.id)
    ok(
      '2-004 atividade de correção na fila do responsável',
      !!fq && !!fq.atividade && (fq.atividade.motivo_ajuste || '').indexOf('R00') >= 0,
    )
    r = emitir(tC, Object.assign({}, base4, { rotulo: 'R02', tipo: 'revisao' }))
    ok('2-004 emitir com card em correção → 409', r.s === 409, 'status ' + r.s)
    r = req(tC, 'GET', '/backend/v1/cards/' + C.id + '/emissoes')
    const cv = (r.j.correcoes || []).find((x) => x.id === CV)
    r = req(tC, 'POST', '/backend/v1/cards/' + C.id + '/correcoes/' + CV + '/decisao', {
      versao: cv.versao,
      decisao: 'invalida',
      justificativa: 'Era previsto no projeto',
    })
    ok('2-004 rever decisão para inválida', r.s === 200, 'status ' + r.s)
    r = req(tC, 'GET', '/backend/v1/cards/' + C.id + '/emissoes')
    const cv2 = (r.j.correcoes || []).find((x) => x.id === CV)
    ok(
      '2-004 atividade cancelada e histórico da decisão',
      !!cv2 &&
        cv2.decisao === 'invalida' &&
        cv2.historico.length === 1 &&
        cv2.atividade &&
        cv2.atividade.status === 'cancelada',
    )

    // ---- SPEC-2-005 (fixture da SPEC: 6 disciplinas, 40 aplicáveis, 34 conformes, 3 N/A, 1 exceção,
    //      3 emissões com 2 correções válidas e 1 inválida, 3 pessoas) ----
    const pA = mkUser('pa', 'projetista')
    const pB = mkUser('pb', 'projetista')
    const pC = mkUser('pc', 'projetista')
    const outroCoord = mkUser('coord2', 'coordenador')
    const tA = pA.newAuthToken()
    const tO = outroCoord.newAuthToken()
    const pq = new Record($app.findCollectionByNameOrId('projetos'))
    pq.set('nome', 'ZZ Teste qualidade ' + sfx)
    pq.set('coordenador', coord.id)
    pq.set('membros', [pA.id, pB.id, pC.id])
    $app.save(pq)
    ids.projetos.push(pq.id)
    const plano = [
      // [pessoa, nº itens, N/A, exceção, não conformes]
      [pA, 7, 2, 0, 1],
      [pA, 7, 1, 0, 1],
      [pB, 7, 0, 1, 0],
      [pB, 7, 0, 0, 2],
      [pC, 8, 0, 0, 1],
      [pC, 8, 0, 0, 1],
    ]
    const colAp = $app.findCollectionByNameOrId('checklists_aplicados')
    const colRd = $app.findCollectionByNameOrId('revisao_rodadas')
    const qCards = []
    for (let i = 0; i < plano.length; i++) {
      const [pess, n, na, exc, nc] = plano[i]
      const dq = mkDisc('q' + i)
      const cq = new Record(ccol)
      cq.set('projeto', pq.id)
      cq.set('disciplina', dq.id)
      cq.set('responsavel', pess.id)
      $app.save(cq)
      ids.cards.push(cq.id)
      qCards.push(cq)
      const its = []
      for (let k = 0; k < n; k++)
        its.push({
          id: 'q' + k,
          texto: 'Item ' + (k + 1),
          grupo: '',
          severidade: k === 0 ? 'critico' : 'normal',
          referencia: '',
        })
      const vq = $app.findRecordsByFilter('checklist_versoes', 'modelo = {:m}', '', 1, 0, {
        m: MR,
      })[0]
      const apq = new Record(colAp)
      apq.set('card', cq.id)
      apq.set('projeto', pq.id)
      apq.set('tipo', 'revisao')
      apq.set('modelo', MR)
      apq.set('versao', vq.id)
      apq.set('numero', 1)
      apq.set('itens', its)
      apq.set('resultados', {})
      $app.save(apq)
      const marc = {}
      for (let k = 0; k < n; k++) {
        let res = 'conforme'
        if (k < na) res = 'nao_se_aplica'
        else if (k < na + exc) res = 'excecao'
        else if (k < na + exc + nc) res = 'nao_conforme'
        marc['q' + k] = { resultado: res, autor: coord.id }
      }
      const r1 = new Record(colRd)
      r1.set('card', cq.id)
      r1.set('projeto', pq.id)
      r1.set('aplicado', apq.id)
      r1.set('numero', 1)
      r1.set('status', 'encerrada')
      r1.set('resultado', nc > 0 ? 'reprovado' : exc > 0 ? 'aprovado_com_excecao' : 'aprovado')
      r1.set('itens', marc)
      r1.set('encerrada_em', new Date().toISOString())
      $app.save(r1)
      if (nc > 0) {
        const r2 = new Record(colRd)
        r2.set('card', cq.id)
        r2.set('projeto', pq.id)
        r2.set('aplicado', apq.id)
        r2.set('numero', 2)
        r2.set('status', 'encerrada')
        r2.set('resultado', 'aprovado')
        r2.set('itens', {})
        r2.set('encerrada_em', new Date().toISOString())
        $app.save(r2)
      }
      if (i < 3) {
        const eq = new Record($app.findCollectionByNameOrId('entregas'))
        eq.set('projeto', pq.id)
        eq.set('tipo', 'final')
        eq.set('data', hoje + ' 12:00:00.000Z')
        eq.set('disciplinas', [cq.id])
        $app.save(eq)
        const mq = new Record($app.findCollectionByNameOrId('emissoes'))
        mq.set('card', cq.id)
        mq.set('projeto', pq.id)
        mq.set('rodada', r1.id)
        mq.set('entrega', eq.id)
        mq.set('tipo', 'final')
        mq.set('rotulo', 'R00')
        mq.set('data', hoje + ' 12:00:00.000Z')
        mq.set('destinatario', 'Teste')
        mq.set('responsavel', coord.id)
        mq.set('status', 'emitida')
        $app.save(mq)
        const cr = new Record($app.findCollectionByNameOrId('correcoes_pos_emissao'))
        cr.set('emissao', mq.id)
        cr.set('card', cq.id)
        cr.set('projeto', pq.id)
        cr.set('origem', i === 0 ? 'obra' : i === 1 ? 'cliente' : 'interna')
        cr.set('severidade', i === 0 ? 'media' : i === 1 ? 'alta' : 'baixa')
        cr.set('descricao', 'Correção ' + i)
        cr.set('decisao', i < 2 ? 'valida' : 'invalida')
        $app.save(cr)
      }
    }
    r = req(tC, 'GET', '/backend/v1/painel/qualidade?projeto=' + pq.id)
    const t5 = r.j.total || {}
    ok(
      '2-005 K2 = 85% (34 de 40)',
      r.s === 200 && t5.k2 === 85 && t5.conformes === 34 && t5.aplicaveis === 40,
      'status ' + r.s + ' ' + JSON.stringify(t5).slice(0, 300),
    )
    ok('2-005 N/A e exceção fora do denominador (3 e 1)', t5.na === 3 && t5.excecoes === 1)
    ok(
      '2-005 K2 conclusivo com 6 disciplinas',
      t5.disciplinas_revisadas === 6 && t5.k2_inconclusivo === false,
    )
    ok(
      '2-005 K3 inconclusivo (3 de 5)',
      t5.emitidas === 3 && t5.correcoes_validas === 2 && t5.k3_inconclusivo === true,
    )
    ok(
      '2-005 K3 por origem e severidade',
      r.j.k3_matriz &&
        r.j.k3_matriz.obra.media === 1 &&
        r.j.k3_matriz.cliente.alta === 1 &&
        r.j.correcoes_invalidas === 1,
    )
    ok(
      '2-005 retorno 45,5% (5 de 11) e 1,8 rodadas até aprovar',
      t5.retorno === 45.5 && t5.rodadas_ate_aprovar === 1.8,
      t5.retorno + ' / ' + t5.rodadas_ate_aprovar,
    )
    ok(
      '2-005 3 pessoas e 44 linhas de drill-down do K2',
      (r.j.por_pessoa || []).length === 3 && (r.j.linhas.k2 || []).length === 44,
    )
    r = req(tA, 'GET', '/backend/v1/painel/qualidade?projeto=' + pq.id + '&pessoa=' + pB.id)
    ok(
      '2-005 projetista vê só os próprios números',
      r.s === 200 &&
        r.j.escopo === 'proprio' &&
        r.j.total.disciplinas_revisadas === 2 &&
        (r.j.por_pessoa || []).length === 1,
      JSON.stringify(r.j.total || {}).slice(0, 120),
    )
    r = req(tO, 'GET', '/backend/v1/painel/qualidade?projeto=' + pq.id)
    ok(
      '2-005 outro coordenador não vê projeto que não coordena',
      r.s === 200 && r.j.total.disciplinas_revisadas === 0,
    )
    r = req(tA, 'POST', '/backend/v1/painel/qualidade/config', {
      limiar_k2: 3,
      limiar_k3: 3,
      motivo: 'teste',
    })
    ok('2-005 projetista não muda limiar (403)', r.s === 403, 'status ' + r.s)
  } catch (err) {
    R.push('ERRO ' + String(err))
  }

  // ---- limpeza (SQL direto: as versões são imutáveis pelos hooks) ----
  try {
    const db = $app.db()
    const lista = (a) => a.map((x) => "'" + x.replace(/[^a-z0-9]/g, '') + "'").join(',')
    const C = lista(ids.cards)
    const P = lista(ids.projetos)
    const M = lista(ids.modelos)
    const U = lista(ids.users)
    const run = (sql) => {
      try {
        db.newQuery(sql).execute()
      } catch (err) {
        R.push('limpeza: ' + sql.slice(0, 60) + ' → ' + String(err).slice(0, 120))
      }
    }
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
      run('DELETE FROM auth_audit WHERE actor_id IN (' + U + ')')
      run('DELETE FROM _authOrigins WHERE recordRef IN (' + U + ')')
      run('DELETE FROM users WHERE id IN (' + U + ')')
    }
    const sobraTeste =
      $app.findRecordsByFilter('users', "email ~ 'zz.teste.'", '', 0, 0).length +
      $app.findRecordsByFilter('disciplinas', "nome ~ 'ZZ Teste'", '', 0, 0).length +
      $app.findRecordsByFilter('projetos', "nome ~ 'ZZ Teste'", '', 0, 0).length
    R.push(
      'limpeza concluída · registros de teste restantes (inclui rodadas anteriores): ' + sobraTeste,
    )
  } catch (err) {
    R.push('ERRO limpeza ' + String(err))
  }
  for (const linha of R) console.log('TESTE_CHK ' + linha)
})
