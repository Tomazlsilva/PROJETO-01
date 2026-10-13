// SPEC-1-005 (CA-1-005-04) — caixa de falhas de handoff: motivo, tentativas, próxima
// ação e onde está a pendência. Coordenador vê as dos projetos que coordena;
// administrador vê todas. Demais papéis → 403. ?todos=1 inclui as já resolvidas (últimas 200).
routerAdd(
  'GET',
  '/backend/v1/handoffs/falhas',
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
    if (papel !== 'admin' && papel !== 'coordenador') {
      try {
        const r = new Record($app.findCollectionByNameOrId('auth_audit'))
        r.set('actor_id', auth.id)
        r.set('action', 'access.denied')
        r.set('outcome', 'blocked')
        r.set('details', { recurso: 'handoffs_falhas' })
        $app.save(r)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Acesso negado.')
    }
    const todos = String(e.request.url.query().get('todos') || '') === '1'
    const filtros = []
    const params = {}
    if (!todos) filtros.push("status = 'falha'")
    if (papel === 'coordenador') {
      filtros.push('projeto.coordenador = {:v}')
      params.v = auth.id
    }
    const MOTIVO = {
      destino_ausente: 'Destino não definido (sem revisor/responsável).',
      destino_inativo: 'Destinatário inativo.',
    }
    const versoes = $app.findRecordsByFilter('fluxo_versoes', 'ativa = true', '-numero', 1, 0)
    const cfg = versoes.length > 0 ? JSON.parse(versoes[0].getString('config')) : { etapas: [] }
    const nomeEtapa = (k) => {
      const et = (cfg.etapas || []).find((x) => x.chave === k)
      return et ? et.nome : k
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
    const itens = $app
      .findRecordsByFilter(
        'handoff_eventos',
        filtros.length ? filtros.join(' && ') : "id != ''",
        '-updated',
        200,
        0,
        params,
      )
      .map((h) => {
        let card = null
        let disciplina = null
        let projeto = null
        let atividade = null
        try {
          const c = $app.findRecordById('projeto_disciplinas', h.getString('card'))
          card = {
            id: c.id,
            etapa: c.getString('etapa'),
            revisor: pessoa(c.getString('revisor')),
            responsavel: pessoa(c.getString('responsavel')),
          }
          const d = $app.findRecordById('disciplinas', c.getString('disciplina'))
          disciplina = { id: d.id, nome: d.getString('nome'), sigla: d.getString('sigla') }
        } catch (_) {}
        try {
          const p = $app.findRecordById('projetos', h.getString('projeto'))
          projeto = { id: p.id, nome: p.getString('nome') }
        } catch (_) {}
        try {
          const a = $app.findRecordById('atividades', h.getString('atividade'))
          atividade = {
            id: a.id,
            status: a.getString('status'),
            destinatario: pessoa(a.getString('destinatario')),
          }
        } catch (_) {}
        let hist = []
        try {
          hist = JSON.parse(h.getString('historico') || '[]') || []
        } catch (_) {}
        return {
          id: h.id,
          status: h.getString('status'),
          motivo: h.getString('motivo'),
          motivo_texto: MOTIVO[h.getString('motivo')] || h.getString('motivo'),
          proxima_acao: h.getString('proxima_acao'),
          tentativas: h.getInt('tentativas'),
          etapa_destino: h.getString('etapa_destino'),
          etapa_destino_nome: nomeEtapa(h.getString('etapa_destino')),
          card: card,
          disciplina: disciplina,
          projeto: projeto,
          atividade: atividade,
          historico: hist.map((x) => ({
            tentativa: x.tentativa,
            em: x.em,
            autor: pessoa(x.autor),
            resultado: x.resultado,
            motivo: x.motivo || '',
          })),
          created: h.getString('created'),
          updated: h.getString('updated'),
        }
      })
    return e.json(200, { itens: itens })
  },
  $apis.requireAuth(),
)
