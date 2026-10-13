// SPEC-1-003 (T1.12) — quadro Kanban: etapas ativas do fluxo vigente (em ordem)
// e os cards visíveis ao usuário em projetos não arquivados.
// Filtros: projeto, responsavel (eu | id), disciplina, prioridade.
// Ordem determinística: prioridade (Urgente→Baixa), prazo do projeto, criação, id.
routerAdd(
  'GET',
  '/backend/v1/kanban',
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
    const q = e.request.url.query()
    const fProjeto = String(q.get('projeto') || '').slice(0, 32)
    let fResp = String(q.get('responsavel') || '').slice(0, 32)
    if (fResp === 'eu') fResp = su ? '__nenhum__' : auth.id
    const fDisc = String(q.get('disciplina') || '').slice(0, 32)
    const fPrio = String(q.get('prioridade') || '').slice(0, 20)

    const versoes = $app.findRecordsByFilter('fluxo_versoes', 'ativa = true', '-numero', 1, 0)
    const cfg =
      versoes.length > 0
        ? JSON.parse(versoes[0].getString('config'))
        : { etapas: [], requisitos: {} }
    const etapas = (cfg.etapas || [])
      .filter((x) => x.ativa)
      .sort((a, b) => a.ordem - b.ordem)
      .map((x) => ({ chave: x.chave, nome: x.nome, ordem: x.ordem }))

    const filtros = ['projeto.arquivado = false']
    const params = {}
    if (fProjeto) {
      filtros.push('projeto = {:p}')
      params.p = fProjeto
    }
    if (fResp) {
      filtros.push('responsavel = {:r}')
      params.r = fResp
    }
    if (fDisc) {
      filtros.push('disciplina = {:d}')
      params.d = fDisc
    }
    if (fPrio) {
      filtros.push('projeto.prioridade = {:pr}')
      params.pr = fPrio
    }
    const registros = $app.findRecordsByFilter(
      'projeto_disciplinas',
      filtros.join(' && '),
      'created',
      0,
      0,
      params,
    )

    const info = e.requestInfo()
    const regra = $app.findCollectionByNameOrId('projetos').viewRule
    const projetos = {}
    const projetoDe = (pid) => {
      if (projetos[pid] === undefined) {
        let p = null
        try {
          const r = $app.findRecordById('projetos', pid)
          if ($app.canAccessRecord(r, info, regra)) {
            p = {
              id: r.id,
              nome: r.getString('nome'),
              prioridade: r.getString('prioridade') || 'Normal',
              prazo: r.getString('prazo').slice(0, 10),
              coordenador: r.getString('coordenador'),
              membros: r.getStringSlice('membros'),
            }
          }
        } catch (_) {}
        projetos[pid] = p
      }
      return projetos[pid]
    }
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

    const PESO = { Urgente: 0, Alta: 1, Normal: 2, Baixa: 3 }
    const cards = []
    for (const c of registros) {
      const p = projetoDe(c.getString('projeto'))
      if (!p) continue
      const bloqueado = c.getBool('bloqueado')
      cards.push({
        id: c.id,
        etapa: c.getString('etapa'),
        bloqueado: bloqueado,
        bloqueio: bloqueado
          ? {
              motivo: c.getString('bloqueio_motivo'),
              dono: pessoa(c.getString('bloqueio_dono')),
              revisao: c.getString('bloqueio_revisao').slice(0, 10),
              desde: c.getString('bloqueado_em'),
            }
          : null,
        projeto: {
          id: p.id,
          nome: p.nome,
          prioridade: p.prioridade,
          prazo: p.prazo,
          coordenador: p.coordenador,
          membros: p.membros,
        },
        disciplina: disciplinaDe(c.getString('disciplina')),
        responsavel: pessoa(c.getString('responsavel')),
        tem_link: !!c.getString('link_entrega'),
        versao: c.getString('updated'),
        created: c.getString('created'),
      })
    }
    cards.sort((a, b) => {
      const pa = PESO[a.projeto.prioridade] === undefined ? 2 : PESO[a.projeto.prioridade]
      const pb = PESO[b.projeto.prioridade] === undefined ? 2 : PESO[b.projeto.prioridade]
      if (pa !== pb) return pa - pb
      const za = a.projeto.prazo || '9999-99-99'
      const zb = b.projeto.prazo || '9999-99-99'
      if (za !== zb) return za < zb ? -1 : 1
      if (a.created !== b.created) return a.created < b.created ? -1 : 1
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })

    return e.json(200, {
      configuracao: versoes.length > 0 ? versoes[0].getInt('numero') : 0,
      etapas: etapas,
      requisitos: cfg.requisitos || {},
      cards: cards,
    })
  },
  $apis.requireAuth(),
)
