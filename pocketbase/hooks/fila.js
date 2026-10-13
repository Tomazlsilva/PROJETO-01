// SPEC-1-004 (T1.17) — fila acionável de uma pessoa.
// Itens ativos (projeto não arquivado, card não aprovado) em que a pessoa:
//   - é responsável;  - é dona de um bloqueio;  - pode revisar (revisor do projeto
//   ou coordenador, card aguardando revisão e não é dela);
//   - recebeu uma pendência (handoff, SPEC-1-005) ainda aberta.
// Ordem padrão: bloqueio vencido → prioridade (Urgente→Baixa) → prazo → criação → id.
// Prioridade e prazo do card prevalecem sobre os do projeto. Datas no fuso de Brasília.
// Ver a fila de outra pessoa: administrador/executivo (tudo) ou coordenador (só os
// itens dos projetos que ele coordena). Demais casos → 403 uniforme e auditado.
routerAdd(
  'GET',
  '/backend/v1/fila',
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
    const papel = su ? 'admin' : auth.getString('role')
    const q = e.request.url.query()
    const pessoaId = String(q.get('pessoa') || '').slice(0, 32) || (su ? '' : auth.id)
    const negar = (motivo) => {
      try {
        const a = new Record($app.findCollectionByNameOrId('auth_audit'))
        a.set('actor_id', su ? '' : auth.id)
        a.set('action', 'access.denied')
        a.set('outcome', 'blocked')
        a.set('details', { recurso: 'fila', pessoa: pessoaId, motivo: motivo })
        $app.save(a)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Acesso negado.')
    }
    const propria = !su && pessoaId === auth.id
    if (!propria && papel !== 'admin' && papel !== 'executivo' && papel !== 'coordenador')
      negar('sem_alcada')
    let pessoa = null
    try {
      pessoa = $app.findRecordById('users', pessoaId)
    } catch (_) {}
    if (!pessoa) negar('inexistente')

    const fProjeto = String(q.get('projeto') || '').slice(0, 32)
    const fPrio = String(q.get('prioridade') || '').slice(0, 20)
    const fEtapa = String(q.get('etapa') || '').slice(0, 40)
    const fSit = String(q.get('situacao') || '').slice(0, 20)

    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
    const PESO = { Urgente: 0, Alta: 1, Normal: 2, Baixa: 3 }
    const versoes = $app.findRecordsByFilter('fluxo_versoes', 'ativa = true', '-numero', 1, 0)
    const cfg = versoes.length > 0 ? JSON.parse(versoes[0].getString('config')) : { etapas: [] }
    const nomeEtapa = (k) => {
      const et = (cfg.etapas || []).find((x) => x.chave === k)
      return et ? et.nome : k
    }
    const nomes = {}
    const pessoaDe = (uid) => {
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
    const discs = {}
    const disciplinaDe = (did) => {
      if (!discs[did]) {
        let d = { id: did, nome: '—', sigla: '' }
        try {
          const r = $app.findRecordById('disciplinas', did)
          d = { id: r.id, nome: r.getString('nome'), sigla: r.getString('sigla') }
        } catch (_) {}
        discs[did] = d
      }
      return discs[did]
    }

    // projetos no escopo de quem está vendo
    const info = e.requestInfo()
    const regra = $app.findCollectionByNameOrId('projetos').viewRule
    const projetos = {}
    const projetoDe = (pid) => {
      if (projetos[pid] === undefined) {
        let p = null
        try {
          const r = $app.findRecordById('projetos', pid)
          let ok = false
          if (propria) ok = $app.canAccessRecord(r, info, regra)
          else if (papel === 'admin' || papel === 'executivo') ok = true
          else ok = r.getString('coordenador') === auth.id
          if (ok && !r.getBool('arquivado')) {
            p = {
              id: r.id,
              nome: r.getString('nome'),
              coordenador: r.getString('coordenador'),
              membros: r.getStringSlice('membros'),
              prioridade: r.getString('prioridade') || 'Normal',
              prazo: r.getString('prazo').slice(0, 10),
            }
          }
        } catch (_) {}
        projetos[pid] = p
      }
      return projetos[pid]
    }

    const pid = pessoa.id
    const papelPessoa = pessoa.getString('role')
    const candidatos = $app.findRecordsByFilter(
      'projeto_disciplinas',
      "projeto.arquivado = false && etapa != 'aprovado' && (responsavel = {:p} || (bloqueado = true && bloqueio_dono = {:p}) || (etapa = 'aguardando_revisao' && (projeto.membros.id ?= {:p} || projeto.coordenador = {:p})))",
      'created',
      0,
      0,
      { p: pid },
    )
    // SPEC-1-005: pendências (handoffs) abertas para a pessoa
    const atvPorCard = {}
    for (const a of $app.findRecordsByFilter(
      'atividades',
      "destinatario = {:p} && (status = 'pendente' || status = 'recebida') && projeto.arquivado = false",
      'created',
      0,
      0,
      { p: pid },
    )) {
      atvPorCard[a.getString('card')] = a
    }
    const jaTem = {}
    const todos = []
    for (const c of candidatos) {
      jaTem[c.id] = true
      todos.push(c)
    }
    for (const cid of Object.keys(atvPorCard)) {
      if (jaTem[cid]) continue
      try {
        todos.push($app.findRecordById('projeto_disciplinas', cid))
      } catch (_) {}
    }
    let itens = []
    for (const c of todos) {
      const p = projetoDe(c.getString('projeto'))
      if (!p) continue
      const bloqueado = c.getBool('bloqueado')
      const motivos = []
      const atv = atvPorCard[c.id] || null
      if (atv) motivos.push('handoff')
      const ativo = c.getString('etapa') !== 'aprovado'
      if (ativo && c.getString('responsavel') === pid) motivos.push('responsavel')
      if (bloqueado && c.getString('bloqueio_dono') === pid) motivos.push('bloqueio')
      if (
        c.getString('etapa') === 'aguardando_revisao' &&
        !bloqueado &&
        c.getString('responsavel') !== pid &&
        ((papelPessoa === 'revisor' && p.membros.indexOf(pid) >= 0) || p.coordenador === pid)
      ) {
        motivos.push('revisao')
      }
      if (motivos.length === 0) continue
      const prioPropria = c.getString('prioridade')
      const prazoProprio = c.getString('prazo').slice(0, 10)
      const prazo = prazoProprio || p.prazo
      const revisao = c.getString('bloqueio_revisao').slice(0, 10)
      itens.push({
        id: c.id,
        etapa: c.getString('etapa'),
        etapa_nome: nomeEtapa(c.getString('etapa')),
        motivos: motivos,
        projeto: { id: p.id, nome: p.nome, coordenador: p.coordenador, membros: p.membros },
        disciplina: disciplinaDe(c.getString('disciplina')),
        responsavel: pessoaDe(c.getString('responsavel')),
        prioridade: prioPropria || p.prioridade,
        prioridade_propria: !!prioPropria,
        prazo: prazo,
        prazo_proprio: !!prazoProprio,
        atrasado: !!prazo && prazo < hoje,
        bloqueado: bloqueado,
        bloqueio: bloqueado
          ? {
              motivo: c.getString('bloqueio_motivo'),
              dono: pessoaDe(c.getString('bloqueio_dono')),
              revisao: revisao,
              desde: c.getString('bloqueado_em'),
              vencido: !!revisao && revisao < hoje,
            }
          : null,
        atividade: atv
          ? {
              id: atv.id,
              status: atv.getString('status'),
              etapa: atv.getString('etapa'),
              precisa_ajuste: atv.getBool('precisa_ajuste'),
              motivo_ajuste: atv.getString('motivo_ajuste'),
              remetente: pessoaDe(atv.getString('remetente')),
              created: atv.getString('created'),
            }
          : null,
        versao: c.getString('updated'),
        created: c.getString('created'),
      })
    }
    if (fProjeto) itens = itens.filter((i) => i.projeto.id === fProjeto)
    if (fPrio) itens = itens.filter((i) => i.prioridade === fPrio)
    if (fEtapa) itens = itens.filter((i) => i.etapa === fEtapa)
    if (fSit === 'atrasado') itens = itens.filter((i) => i.atrasado)
    else if (fSit === 'bloqueado') itens = itens.filter((i) => i.bloqueado)
    else if (fSit === 'vencido') itens = itens.filter((i) => i.bloqueio && i.bloqueio.vencido)

    itens.sort((a, b) => {
      const va = a.bloqueio && a.bloqueio.vencido ? 0 : 1
      const vb = b.bloqueio && b.bloqueio.vencido ? 0 : 1
      if (va !== vb) return va - vb
      const pa = PESO[a.prioridade] === undefined ? 2 : PESO[a.prioridade]
      const pb = PESO[b.prioridade] === undefined ? 2 : PESO[b.prioridade]
      if (pa !== pb) return pa - pb
      const za = a.prazo || '9999-99-99'
      const zb = b.prazo || '9999-99-99'
      if (za !== zb) return za < zb ? -1 : 1
      if (a.created !== b.created) return a.created < b.created ? -1 : 1
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })

    return e.json(200, {
      pessoa: { id: pid, nome: pessoaDe(pid).nome, papel: papelPessoa },
      hoje: hoje,
      resumo: {
        total: itens.length,
        atrasados: itens.filter((i) => i.atrasado).length,
        bloqueados: itens.filter((i) => i.bloqueado).length,
        vencidos: itens.filter((i) => i.bloqueio && i.bloqueio.vencido).length,
      },
      itens: itens,
    })
  },
  $apis.requireAuth(),
)
