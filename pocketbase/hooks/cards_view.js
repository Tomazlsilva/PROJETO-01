// SPEC-1-003 — detalhe do card (disciplina do projeto) com etapa, bloqueio,
// campos da etapa, versão para concorrência e histórico completo de transições.
// Card inexistente e card sem permissão devolvem o mesmo 403 (auditado).
routerAdd(
  'GET',
  '/backend/v1/cards/{id}',
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
    const id = e.request.pathValue('id')
    const negar = () => {
      try {
        const a = new Record($app.findCollectionByNameOrId('auth_audit'))
        a.set('actor_id', su ? '' : auth.id)
        a.set('action', 'access.denied')
        a.set('outcome', 'blocked')
        a.set('details', { recurso: 'cards', operacao: 'ver', id: String(id).slice(0, 32) })
        $app.save(a)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Acesso negado.')
    }

    let card = null
    try {
      card = $app.findRecordById('projeto_disciplinas', id)
    } catch (_) {}
    if (!card) negar()
    let projeto = null
    try {
      projeto = $app.findRecordById('projetos', card.getString('projeto'))
    } catch (_) {}
    if (
      !projeto ||
      !$app.canAccessRecord(
        projeto,
        e.requestInfo(),
        $app.findCollectionByNameOrId('projetos').viewRule,
      )
    )
      negar()

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
    let disciplina = { id: card.getString('disciplina'), nome: '—', sigla: '' }
    try {
      const d = $app.findRecordById('disciplinas', card.getString('disciplina'))
      disciplina = { id: d.id, nome: d.getString('nome'), sigla: d.getString('sigla') }
    } catch (_) {}

    const bloqueado = card.getBool('bloqueado')
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
    const prioPropria = card.getString('prioridade')
    const prazoProprio = card.getString('prazo').slice(0, 10)
    const prazo = prazoProprio || projeto.getString('prazo').slice(0, 10)
    const revisao = card.getString('bloqueio_revisao').slice(0, 10)
    const papel = su ? 'admin' : auth.getString('role')
    const historico = $app
      .findRecordsByFilter('transicoes', 'card = {:c}', '-created', 1000, 0, { c: card.id })
      .map((t) => {
        let detalhes = null
        try {
          detalhes = JSON.parse(t.getString('detalhes') || 'null')
        } catch (_) {}
        return {
          id: t.id,
          tipo: t.getString('tipo'),
          de: t.getString('de'),
          para: t.getString('para'),
          justificativa: t.getString('justificativa'),
          detalhes: detalhes,
          autor: pessoa(t.getString('autor')),
          created: t.getString('created'),
        }
      })

    // SPEC-1-005: pendências (handoffs) do card e, para quem coordena, os eventos de entrega
    const atividades = $app
      .findRecordsByFilter('atividades', 'card = {:c}', '-created', 200, 0, { c: card.id })
      .map((a) => ({
        id: a.id,
        etapa: a.getString('etapa'),
        etapa_origem: a.getString('etapa_origem'),
        status: a.getString('status'),
        destinatario: pessoa(a.getString('destinatario')),
        remetente: pessoa(a.getString('remetente')),
        precisa_ajuste: a.getBool('precisa_ajuste'),
        motivo_ajuste: a.getString('motivo_ajuste'),
        recebida_em: a.getString('recebida_em'),
        encerrada_em: a.getString('encerrada_em'),
        encerrada_por: pessoa(a.getString('encerrada_por')),
        encerramento: a.getString('encerramento'),
        created: a.getString('created'),
      }))
    const veEventos =
      su ||
      papel === 'admin' ||
      (papel === 'coordenador' && projeto.getString('coordenador') === auth.id)
    const handoffs = !veEventos
      ? []
      : $app
          .findRecordsByFilter('handoff_eventos', 'card = {:c}', '-created', 200, 0, { c: card.id })
          .map((h) => {
            let hist = []
            try {
              hist = JSON.parse(h.getString('historico') || '[]') || []
            } catch (_) {}
            return {
              id: h.id,
              atividade: h.getString('atividade'),
              etapa_origem: h.getString('etapa_origem'),
              etapa_destino: h.getString('etapa_destino'),
              status: h.getString('status'),
              motivo: h.getString('motivo'),
              proxima_acao: h.getString('proxima_acao'),
              tentativas: h.getInt('tentativas'),
              historico: hist.map((x) => ({
                tentativa: x.tentativa,
                em: x.em,
                autor: pessoa(x.autor),
                resultado: x.resultado,
                motivo: x.motivo || '',
              })),
              created: h.getString('created'),
            }
          })

    return e.json(200, {
      id: card.id,
      revisor: pessoa(card.getString('revisor')),
      atividades: atividades,
      handoffs: handoffs,
      etapa: card.getString('etapa'),
      bloqueado: bloqueado,
      bloqueio: bloqueado
        ? {
            motivo: card.getString('bloqueio_motivo'),
            dono: pessoa(card.getString('bloqueio_dono')),
            revisao: revisao,
            desde: card.getString('bloqueado_em'),
            vencido: !!revisao && revisao < hoje,
          }
        : null,
      prioridade: prioPropria || projeto.getString('prioridade') || 'Normal',
      prioridade_propria: !!prioPropria,
      prazo: prazo,
      prazo_proprio: !!prazoProprio,
      atrasado: !!prazo && prazo < hoje && card.getString('etapa') !== 'aprovado',
      pode_editar:
        papel === 'admin' ||
        (papel === 'coordenador' && projeto.getString('coordenador') === auth.id),
      observacao: card.getString('observacao'),
      link_entrega: card.getString('link_entrega'),
      updated: card.getString('updated'),
      versao: card.getString('updated'),
      projeto: {
        id: projeto.id,
        nome: projeto.getString('nome'),
        arquivado: projeto.getBool('arquivado'),
        coordenador: pessoa(projeto.getString('coordenador')),
        membros: projeto.getStringSlice('membros'),
        prioridade: projeto.getString('prioridade') || 'Normal',
        prazo: projeto.getString('prazo').slice(0, 10),
      },
      // pessoas do projeto (coordenador + membros ativos), para escolher o dono de um bloqueio
      equipe: [projeto.getString('coordenador')]
        .concat(projeto.getStringSlice('membros'))
        .filter((uid, i, arr) => uid && arr.indexOf(uid) === i)
        .filter((uid) => {
          try {
            return $app.findRecordById('users', uid).getBool('active')
          } catch (_) {
            return false
          }
        })
        .map((uid) => pessoa(uid)),
      disciplina: disciplina,
      responsavel: pessoa(card.getString('responsavel')),
      historico: historico,
    })
  },
  $apis.requireAuth(),
)
