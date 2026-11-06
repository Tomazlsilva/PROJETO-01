// Tela Início: projetos com coordenador, disciplinas e próxima entrega, mais as entregas
// da semana e as atrasadas.
//   GET /backend/v1/inicio?arquivados=1
// Projetos: os mesmos que a pessoa já pode abrir (admin, administrativo e coordenador:
// todos; projetista: os projetos em que está). "Esta semana": admin e administrativo
// veem tudo; coordenador e projetista, as entregas dos próprios projetos.
routerAdd(
  'GET',
  '/backend/v1/inicio',
  (e) => {
    const auth = e.auth
    const expira = auth ? auth.getString('session_expires_at') : ''
    if (
      !auth ||
      !auth.getBool('active') ||
      !expira ||
      new Date(expira.replace(' ', 'T')) <= new Date()
    ) {
      throw new UnauthorizedError('Sessão inválida ou expirada.')
    }
    const papel = auth.getString('role')
    const veTodos = papel === 'admin' || papel === 'administrativo' || papel === 'coordenador'
    const arquivados = String(e.request.url.query().get('arquivados') || '') === '1'
    const somaDias = (d, n) =>
      new Date(new Date(d + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10)
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
    const fimSemana = somaDias(hoje, 6)

    const nomes = {}
    const pessoa = (uid) => {
      if (!uid) return null
      if (nomes[uid] === undefined) {
        try {
          const u = $app.findRecordById('users', uid)
          nomes[uid] = { id: uid, nome: u.getString('name') || u.getString('email').split('@')[0] }
        } catch (_) {
          nomes[uid] = null
        }
      }
      return nomes[uid]
    }

    // projetos
    const todos = $app.findRecordsByFilter('projetos', 'arquivado = {:a}', 'nome', 0, 0, {
      a: arquivados,
    })
    const projetos = {}
    for (const p of todos) {
      const coordeno = p.getString('coordenador') === auth.id
      const membro = p.getStringSlice('membros').indexOf(auth.id) >= 0
      if (!veTodos && !coordeno && !membro) continue
      projetos[p.id] = { p: p, meu: coordeno || membro, coordeno: coordeno }
    }

    // disciplinas dos projetos (siglas)
    const siglaDisc = {}
    for (const d of $app.findRecordsByFilter('disciplinas', "id != ''", '', 0, 0)) {
      siglaDisc[d.id] = d.getString('sigla') || d.getString('nome')
    }
    const discDe = {}
    for (const c of $app.findRecordsByFilter('projeto_disciplinas', "id != ''", '', 0, 0)) {
      const pid = c.getString('projeto')
      if (!projetos[pid]) continue
      const s = siglaDisc[c.getString('disciplina')]
      if (!s) continue
      if (!discDe[pid]) discDe[pid] = []
      if (discDe[pid].indexOf(s) < 0) discDe[pid].push(s)
    }

    // entregas em aberto: próxima por projeto, atrasadas e semana
    const proxima = {}
    const atrasadasDe = {}
    const textoDisc = {}
    const semana = []
    const atrasadas = []
    for (const r of $app.findRecordsByFilter(
      'entregas',
      'entregue = false && projeto.arquivado = false',
      'data',
      0,
      0,
    )) {
      const pid = r.getString('projeto')
      const data = r.getString('data').slice(0, 10)
      const txt = r.getString('disciplinas_texto')
      if (txt && !textoDisc[pid]) textoDisc[pid] = txt
      const item = {
        id: r.id,
        data: data,
        tipo: r.getString('tipo'),
        numero_revisao: r.getInt('numero_revisao'),
        principal: r.getBool('principal'),
      }
      const vis = projetos[pid]
      if (vis) {
        if (data < hoje) atrasadasDe[pid] = (atrasadasDe[pid] || 0) + 1
        else if (!proxima[pid]) proxima[pid] = item
      }
      const entraNoQuadro = papel === 'admin' || papel === 'administrativo' || (vis && vis.meu)
      if (!entraNoQuadro) continue
      let nomeProj = vis ? vis.p.getString('nome') : ''
      if (!nomeProj) {
        try {
          nomeProj = $app.findRecordById('projetos', pid).getString('nome')
        } catch (_) {
          continue
        }
      }
      const linha = Object.assign({ projeto: { id: pid, nome: nomeProj } }, item)
      if (data < hoje) atrasadas.push(linha)
      else if (data <= fimSemana) semana.push(linha)
    }

    const itens = Object.keys(projetos).map((pid) => {
      const x = projetos[pid]
      const p = x.p
      return {
        id: pid,
        nome: p.getString('nome'),
        arquivado: p.getBool('arquivado'),
        prioridade: p.getString('prioridade'),
        prazo: p.getString('prazo').slice(0, 10),
        coordenador: pessoa(p.getString('coordenador')),
        meu: x.meu,
        coordeno: x.coordeno,
        disciplinas: discDe[pid] || [],
        disciplinas_texto: discDe[pid] ? '' : textoDisc[pid] || '',
        proxima: proxima[pid] || null,
        atrasadas: atrasadasDe[pid] || 0,
      }
    })
    itens.sort((a, b) => (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0))

    return e.json(200, {
      hoje: hoje,
      ve_todos: veTodos,
      itens: itens,
      semana: semana,
      atrasadas: atrasadas.slice(-30).reverse(),
      total_atrasadas: atrasadas.length,
    })
  },
  $apis.requireAuth('users'),
)
