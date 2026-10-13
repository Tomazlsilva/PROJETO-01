// SPEC-1-006 — apontamentos de um card. Quem participa vê os próprios; coordenador do
// projeto, administrador e executivo veem todos (registro operacional, não indicador).
routerAdd(
  'GET',
  '/backend/v1/tempo/eventos',
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
    const cardId = String(e.request.url.query().get('card') || '').slice(0, 32)
    let card = null
    try {
      card = $app.findRecordById('projeto_disciplinas', cardId)
    } catch (_) {}
    let projeto = null
    try {
      if (card) projeto = $app.findRecordById('projetos', card.getString('projeto'))
    } catch (_) {}
    if (
      !projeto ||
      !$app.canAccessRecord(
        projeto,
        e.requestInfo(),
        $app.findCollectionByNameOrId('projetos').viewRule,
      )
    ) {
      throw new ForbiddenError('Acesso negado.')
    }
    const papel = auth.getString('role')
    const gestor =
      papel === 'admin' ||
      papel === 'executivo' ||
      (papel === 'coordenador' && projeto.getString('coordenador') === auth.id)
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
    const filtro = gestor ? 'card = {:c}' : 'card = {:c} && usuario = {:u}'
    const itens = $app
      .findRecordsByFilter('tempo_eventos', filtro, '-inicio', 200, 0, { c: card.id, u: auth.id })
      .map((t) => ({
        id: t.id,
        usuario: pessoa(t.getString('usuario')),
        etapa: t.getString('etapa'),
        categoria: t.getString('categoria'),
        origem: t.getString('origem'),
        status: t.getString('status'),
        inicio: t.getString('inicio'),
        fim: t.getString('fim'),
        duracao_seg: t.getInt('duracao_seg'),
        revisado: t.getBool('revisado'),
        revisao_motivo: t.getString('revisao_motivo'),
        substituido: t.getBool('substituido'),
        substitui: t.getString('substitui'),
        correcao_motivo: t.getString('correcao_motivo'),
        excluido: t.getBool('excluido'),
        exclusao_motivo: t.getString('exclusao_motivo'),
      }))
    return e.json(200, {
      pode_corrigir:
        papel === 'admin' ||
        (papel === 'coordenador' && projeto.getString('coordenador') === auth.id),
      itens: itens,
    })
  },
  $apis.requireAuth('users'),
)
