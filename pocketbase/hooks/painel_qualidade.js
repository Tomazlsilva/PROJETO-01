// SPEC-2-005 (T2.14/T2.15) — indicadores de qualidade.
//   K2 = itens conformes na 1ª rodada ÷ itens aplicáveis verificados na 1ª rodada
//        (N/A e exceção técnica ficam fora do denominador e aparecem à parte;
//         rodadas "sem checklist" ficam fora do K2).
//   K3 = correções válidas após a emissão ÷ disciplinas emitidas (por origem e severidade).
//   Retorno = rodadas reprovadas ÷ rodadas encerradas. Rodadas até aprovar = média por disciplina aprovada.
// Pessoa = responsável atual da disciplina. Período: data de encerramento da rodada / data da emissão.
// Escopo: projetista vê só os próprios números; coordenador, os projetos que coordena;
// administrador/diretor e administrativo, tudo. Amostra abaixo do limiar → "inconclusivo".
routerAdd(
  'GET',
  '/backend/v1/painel/qualidade',
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
    const papel = su ? 'admin' : auth.getString('role')
    const eu = su ? '' : auth.id
    const q = e.request.url.query()
    const f = {
      inicio: String(q.get('inicio') || '').slice(0, 10),
      fim: String(q.get('fim') || '').slice(0, 10),
      projeto: String(q.get('projeto') || '').slice(0, 15),
      disciplina: String(q.get('disciplina') || '').slice(0, 15),
      pessoa: String(q.get('pessoa') || '').slice(0, 15),
      tipologia: String(q.get('tipologia') || '').slice(0, 120),
    }
    const escopo =
      papel === 'admin' || papel === 'administrativo'
        ? 'tudo'
        : papel === 'coordenador'
          ? 'equipe'
          : 'proprio'
    if (escopo === 'proprio') f.pessoa = eu // projetista: só os próprios números, qualquer que seja o filtro
    const noPeriodo = (d) => {
      const x = String(d || '').slice(0, 10)
      if (!x) return false
      if (f.inicio && x < f.inicio) return false
      if (f.fim && x > f.fim) return false
      return true
    }

    const cfgs = $app.findRecordsByFilter('config_qualidade', "id != ''", '-created', 1, 0)
    const limK2 = cfgs.length ? cfgs[0].getInt('limiar_k2') : 5
    const limK3 = cfgs.length ? cfgs[0].getInt('limiar_k3') : 5

    const nomes = {}
    const pessoa = (uid) => {
      if (!uid) return { id: '', nome: 'Sem responsável' }
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
    const discNome = {}
    for (const d of $app.findRecordsByFilter('disciplinas', "id != ''", 'nome', 0, 0))
      discNome[d.id] = d.getString('nome')
    const projs = {}
    for (const p of $app.findRecordsByFilter('projetos', "id != ''", 'nome', 0, 0)) {
      projs[p.id] = {
        id: p.id,
        nome: p.getString('nome'),
        coordenador: p.getString('coordenador'),
        tipologia: p.getString('tipologia').trim(),
      }
    }

    // ---- disciplinas (cards) no escopo e nos filtros ----
    const cards = {}
    const opcoes = { projetos: {}, disciplinas: {}, pessoas: {}, tipologias: {} }
    for (const c of $app.findRecordsByFilter('projeto_disciplinas', "id != ''", '', 0, 0)) {
      const p = projs[c.getString('projeto')]
      if (!p) continue
      const resp = c.getString('responsavel')
      if (escopo === 'equipe' && p.coordenador !== eu) continue
      if (escopo === 'proprio' && resp !== eu) continue
      opcoes.projetos[p.id] = p.nome
      opcoes.disciplinas[c.getString('disciplina')] = discNome[c.getString('disciplina')] || '—'
      if (resp) opcoes.pessoas[resp] = pessoa(resp).nome
      if (p.tipologia) opcoes.tipologias[p.tipologia] = true
      if (f.projeto && p.id !== f.projeto) continue
      if (f.disciplina && c.getString('disciplina') !== f.disciplina) continue
      if (f.pessoa && resp !== f.pessoa) continue
      if (f.tipologia && p.tipologia !== f.tipologia) continue
      cards[c.id] = {
        id: c.id,
        projeto: p,
        disciplina: discNome[c.getString('disciplina')] || '—',
        disciplina_id: c.getString('disciplina'),
        pessoa: pessoa(resp),
      }
    }

    // ---- rodadas ----
    const porCard = {}
    for (const r of $app.findRecordsByFilter(
      'revisao_rodadas',
      "status = 'encerrada'",
      'numero',
      0,
      0,
    )) {
      const cid = r.getString('card')
      if (!cards[cid]) continue
      if (!porCard[cid]) porCard[cid] = []
      porCard[cid].push(r)
    }
    const itensAplicado = {}
    const itensDe = (aid) => {
      if (!aid) return []
      if (!itensAplicado[aid]) {
        try {
          itensAplicado[aid] = JSON.parse(
            $app.findRecordById('checklists_aplicados', aid).getString('itens') || '[]',
          )
        } catch (_) {
          itensAplicado[aid] = []
        }
      }
      return itensAplicado[aid]
    }
    const grupos = { pessoa: {}, disciplina: {}, total: {} }
    const acum = (tipo, chave, nome) => {
      if (!grupos[tipo][chave])
        grupos[tipo][chave] = {
          id: chave,
          nome: nome,
          disciplinas_revisadas: 0,
          aplicaveis: 0,
          conformes: 0,
          na: 0,
          excecoes: 0,
          rodadas: 0,
          reprovadas: 0,
          aprovadas_n: 0,
          aprovadas_rodadas: 0,
          emitidas: 0,
          correcoes_validas: 0,
        }
      return grupos[tipo][chave]
    }
    const tot = acum('total', 'total', 'Total')
    const k2Linhas = []
    const rodadaLinhas = []
    for (const cid of Object.keys(porCard)) {
      const cd = cards[cid]
      const lista = porCard[cid]
      const gp = acum('pessoa', cd.pessoa.id || '-', cd.pessoa.nome)
      const gd = acum('disciplina', cd.disciplina_id, cd.disciplina)
      const alvos = [tot, gp, gd]
      // retorno: todas as rodadas encerradas no período
      for (const r of lista) {
        if (!noPeriodo(r.getString('encerrada_em'))) continue
        const rep = r.getString('resultado') === 'reprovado'
        for (const g of alvos) {
          g.rodadas += 1
          if (rep) g.reprovadas += 1
        }
        rodadaLinhas.push({
          card: cid,
          projeto: cd.projeto.nome,
          disciplina: cd.disciplina,
          pessoa: cd.pessoa.nome,
          rodada: r.getInt('numero'),
          resultado: r.getString('resultado'),
          sem_checklist: r.getBool('sem_checklist'),
          data: r.getString('encerrada_em').slice(0, 10),
        })
      }
      // rodadas até aprovar: disciplina cuja última rodada é aprovada (encerrada no período)
      const ult = lista[lista.length - 1]
      if (
        (ult.getString('resultado') === 'aprovado' ||
          ult.getString('resultado') === 'aprovado_com_excecao') &&
        noPeriodo(ult.getString('encerrada_em'))
      ) {
        for (const g of alvos) {
          g.aprovadas_n += 1
          g.aprovadas_rodadas += lista.length
        }
      }
      // K2: só a 1ª rodada, com checklist
      const pri = lista[0]
      if (
        pri.getInt('numero') !== 1 ||
        pri.getBool('sem_checklist') ||
        !noPeriodo(pri.getString('encerrada_em'))
      )
        continue
      const marc = JSON.parse(pri.getString('itens') || '{}') || {}
      const its = itensDe(pri.getString('aplicado'))
      if (its.length === 0) continue
      for (const g of alvos) g.disciplinas_revisadas += 1
      for (const it of its) {
        const res = marc[it.id] ? marc[it.id].resultado : ''
        for (const g of alvos) {
          if (res === 'conforme') {
            g.aplicaveis += 1
            g.conformes += 1
          } else if (res === 'nao_conforme') g.aplicaveis += 1
          else if (res === 'nao_se_aplica') g.na += 1
          else if (res === 'excecao') g.excecoes += 1
        }
        k2Linhas.push({
          card: cid,
          projeto: cd.projeto.nome,
          disciplina: cd.disciplina,
          pessoa: cd.pessoa.nome,
          item: it.texto,
          severidade: it.severidade,
          resultado: res || 'sem_marcacao',
          data: pri.getString('encerrada_em').slice(0, 10),
        })
      }
    }

    // ---- K3: emissões no período e correções válidas ligadas a elas ----
    const emitidas = {}
    const emissaoLinhas = []
    const emissoesOk = {}
    for (const m of $app.findRecordsByFilter('emissoes', "status = 'emitida'", 'data', 0, 0)) {
      const cid = m.getString('card')
      if (!cards[cid] || !noPeriodo(m.getString('data'))) continue
      emissoesOk[m.id] = m
      emissaoLinhas.push({
        card: cid,
        projeto: cards[cid].projeto.nome,
        disciplina: cards[cid].disciplina,
        pessoa: cards[cid].pessoa.nome,
        rotulo: m.getString('rotulo'),
        data: m.getString('data').slice(0, 10),
      })
      if (emitidas[cid]) continue
      emitidas[cid] = true
      const cd = cards[cid]
      for (const g of [
        tot,
        acum('pessoa', cd.pessoa.id || '-', cd.pessoa.nome),
        acum('disciplina', cd.disciplina_id, cd.disciplina),
      ])
        g.emitidas += 1
    }
    const matriz = {}
    for (const o of ['cliente', 'obra', 'interna']) matriz[o] = { alta: 0, media: 0, baixa: 0 }
    const correcaoLinhas = []
    let invalidas = 0
    for (const c of $app.findRecordsByFilter(
      'correcoes_pos_emissao',
      "id != ''",
      'created',
      0,
      0,
    )) {
      const m = emissoesOk[c.getString('emissao')]
      if (!m) continue
      const cd = cards[c.getString('card')]
      if (!cd) continue
      if (c.getString('decisao') !== 'valida') {
        invalidas += 1
        continue
      }
      matriz[c.getString('origem')][c.getString('severidade')] += 1
      for (const g of [
        tot,
        acum('pessoa', cd.pessoa.id || '-', cd.pessoa.nome),
        acum('disciplina', cd.disciplina_id, cd.disciplina),
      ])
        g.correcoes_validas += 1
      correcaoLinhas.push({
        card: cd.id,
        projeto: cd.projeto.nome,
        disciplina: cd.disciplina,
        pessoa: cd.pessoa.nome,
        emissao: m.getString('rotulo'),
        origem: c.getString('origem'),
        severidade: c.getString('severidade'),
        descricao: c.getString('descricao'),
        data: c.getString('created').slice(0, 10),
      })
    }

    const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null)
    const fechar = (g) => ({
      id: g.id,
      nome: g.nome,
      disciplinas_revisadas: g.disciplinas_revisadas,
      aplicaveis: g.aplicaveis,
      conformes: g.conformes,
      na: g.na,
      excecoes: g.excecoes,
      k2: pct(g.conformes, g.aplicaveis),
      k2_inconclusivo: g.disciplinas_revisadas < limK2,
      rodadas: g.rodadas,
      reprovadas: g.reprovadas,
      retorno: pct(g.reprovadas, g.rodadas),
      rodadas_ate_aprovar:
        g.aprovadas_n > 0 ? Math.round((g.aprovadas_rodadas / g.aprovadas_n) * 10) / 10 : null,
      aprovadas: g.aprovadas_n,
      emitidas: g.emitidas,
      correcoes_validas: g.correcoes_validas,
      k3: g.emitidas > 0 ? Math.round((g.correcoes_validas / g.emitidas) * 100) / 100 : null,
      k3_inconclusivo: g.emitidas < limK3,
    })
    const ordenar = (o) =>
      Object.keys(o)
        .map((k) => fechar(o[k]))
        .sort((a, b) => a.nome.localeCompare(b.nome))
    const mapa = (o) =>
      Object.keys(o)
        .map((k) => ({ id: k, nome: o[k] }))
        .sort((a, b) => a.nome.localeCompare(b.nome))
    return e.json(200, {
      filtros: f,
      escopo: escopo,
      limiares: { k2: limK2, k3: limK3 },
      total: fechar(tot),
      k3_matriz: matriz,
      correcoes_invalidas: invalidas,
      por_pessoa: ordenar(grupos.pessoa),
      por_disciplina: ordenar(grupos.disciplina),
      linhas: {
        k2: k2Linhas,
        rodadas: rodadaLinhas,
        emissoes: emissaoLinhas,
        correcoes: correcaoLinhas,
      },
      opcoes: {
        projetos: mapa(opcoes.projetos),
        disciplinas: mapa(opcoes.disciplinas),
        pessoas: mapa(opcoes.pessoas),
        tipologias: Object.keys(opcoes.tipologias).sort(),
      },
      pode_configurar: papel === 'admin',
    })
  },
  $apis.requireAuth(),
)

// ---------- limiares (só administrador; cada mudança é um registro novo + auditoria) ----------
routerAdd(
  'POST',
  '/backend/v1/painel/qualidade/config',
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
      if (auth.getString('role') !== 'admin') {
        try {
          const a = new Record($app.findCollectionByNameOrId('auth_audit'))
          a.set('actor_id', auth.id)
          a.set('action', 'access.denied')
          a.set('outcome', 'blocked')
          a.set('details', { recurso: 'qualidade', operacao: 'config' })
          $app.save(a)
        } catch (err) {
          $app.logger().error('auditoria falhou', 'action', 'access.denied')
        }
        throw new ForbiddenError('Só o administrador altera os limiares.')
      }
    }
    const body = e.requestInfo().body || {}
    const k2 = Number(body.limiar_k2)
    const k3 = Number(body.limiar_k3)
    if (
      !Number.isInteger(k2) ||
      k2 < 1 ||
      k2 > 1000 ||
      !Number.isInteger(k3) ||
      k3 < 1 ||
      k3 > 1000
    )
      throw new BadRequestError('Limiares devem ser números inteiros entre 1 e 1000.')
    const motivo = typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 500) : ''
    if (motivo.length < 3)
      throw new BadRequestError('Informe o motivo.', {
        motivo: new ValidationError('obrigatorio', 'Informe o motivo.'),
      })
    const ant = $app.findRecordsByFilter('config_qualidade', "id != ''", '-created', 1, 0)
    const r = new Record($app.findCollectionByNameOrId('config_qualidade'))
    r.set('limiar_k2', k2)
    r.set('limiar_k3', k3)
    r.set('motivo', motivo)
    if (!su) r.set('autor', auth.id)
    $app.save(r)
    try {
      const a = new Record($app.findCollectionByNameOrId('auth_audit'))
      a.set('actor_id', su ? '' : auth.id)
      a.set('action', 'qualidade.config_change')
      a.set('outcome', 'success')
      a.set('details', {
        de: ant.length ? { k2: ant[0].getInt('limiar_k2'), k3: ant[0].getInt('limiar_k3') } : null,
        para: { k2: k2, k3: k3 },
        motivo: motivo,
      })
      $app.save(a)
    } catch (err) {
      $app.logger().error('auditoria falhou', 'action', 'qualidade.config_change')
    }
    return e.json(200, { ok: true })
  },
  $apis.requireAuth(),
)
