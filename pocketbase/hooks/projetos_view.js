// SPEC-1-001 (CA-1-001-06) e SPEC-1-002 (detalhe 360º).
// Projeto inexistente e projeto sem permissão devolvem o mesmo 403, sem revelar
// existência nem conteúdo; a negação é auditada. Com permissão, devolve o projeto
// com cliente, coordenador, disciplinas/responsáveis e histórico.
routerAdd(
  'GET',
  '/backend/v1/projetos/{id}',
  (e) => {
    const id = e.request.pathValue('id')
    const negar = () => {
      try {
        const a = new Record($app.findCollectionByNameOrId('auth_audit'))
        a.set('actor_id', e.auth ? e.auth.id : '')
        a.set('target_id', '')
        a.set('action', 'access.denied')
        a.set('outcome', 'blocked')
        a.set('details', { recurso: 'projetos', id: String(id).slice(0, 32) })
        $app.save(a)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Acesso negado.')
    }

    let projeto = null
    try {
      projeto = $app.findRecordById('projetos', id)
    } catch (_) {
      projeto = null
    }
    if (!projeto) negar()

    const info = e.requestInfo()
    const colecao = $app.findCollectionByNameOrId('projetos')
    if (!$app.canAccessRecord(projeto, info, colecao.viewRule)) negar()

    const cacheNomes = {}
    const pessoa = (uid) => {
      if (!uid) return null
      if (!cacheNomes[uid]) {
        let nome = '—'
        try {
          const u = $app.findRecordById('users', uid)
          nome = u.getString('name') || u.getString('email').split('@')[0]
        } catch (_) {}
        cacheNomes[uid] = { id: uid, nome: nome }
      }
      return cacheNomes[uid]
    }

    let cliente = null
    if (projeto.getString('cliente')) {
      try {
        const c = $app.findRecordById('clientes', projeto.getString('cliente'))
        cliente = { id: c.id, nome: c.getString('nome') }
      } catch (_) {}
    }

    const disciplinas = $app
      .findRecordsByFilter('projeto_disciplinas', 'projeto = {:p}', 'created', 0, 0, {
        p: projeto.id,
      })
      .map((r) => {
        let d = { id: r.getString('disciplina'), nome: '—', sigla: '' }
        try {
          const dr = $app.findRecordById('disciplinas', r.getString('disciplina'))
          d = {
            id: dr.id,
            nome: dr.getString('nome'),
            sigla: dr.getString('sigla'),
            personalizada: dr.getBool('personalizada'),
          }
        } catch (_) {}
        return {
          id: r.id,
          disciplina: d,
          responsavel: pessoa(r.getString('responsavel')),
          herdado: r.getBool('responsavel_herdado'),
        }
      })

    const historico = $app
      .findRecordsByFilter('projeto_historico', 'projeto = {:p}', '-created', 500, 0, {
        p: projeto.id,
      })
      .map((h) => ({
        id: h.id,
        acao: h.getString('acao'),
        campo: h.getString('campo'),
        antes: h.getString('antes'),
        depois: h.getString('depois'),
        detalhes: h.get('detalhes'),
        autor: pessoa(h.getString('autor')),
        created: h.getString('created'),
      }))

    const auth = e.auth
    const papel = auth ? auth.getString('role') : ''
    const podeEditar =
      papel === 'admin' || (papel === 'coordenador' && projeto.getString('coordenador') === auth.id)

    return e.json(200, {
      id: projeto.id,
      nome: projeto.getString('nome'),
      cliente: projeto.getString('cliente'),
      local: projeto.getString('local'),
      tipologia: projeto.getString('tipologia'),
      prazo: projeto.getString('prazo'),
      prioridade: projeto.getString('prioridade'),
      link_entrada: projeto.getString('link_entrada'),
      arquivado: projeto.getBool('arquivado'),
      coordenador: projeto.getString('coordenador'),
      membros: projeto.getStringSlice('membros'),
      created: projeto.getString('created'),
      updated: projeto.getString('updated'),
      pode_editar: podeEditar,
      detalhe: {
        cliente: cliente,
        coordenador: pessoa(projeto.getString('coordenador')),
        disciplinas: disciplinas,
        historico: historico,
      },
    })
  },
  $apis.requireAuth('users'),
)
