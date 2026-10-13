// SPEC-1-003 — configuração vigente do fluxo e histórico de versões.
// Leitura para qualquer usuário autenticado; alteração só pelo administrador (fluxo_salvar).
routerAdd(
  'GET',
  '/backend/v1/fluxo',
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
    const ver = (v) => ({
      id: v.id,
      numero: v.getInt('numero'),
      ativa: v.getBool('ativa'),
      config: JSON.parse(v.getString('config') || '{}'),
      motivo: v.getString('motivo'),
      restaurada_de: v.getInt('restaurada_de') || null,
      autor: pessoa(v.getString('autor')),
      created: v.getString('created'),
    })
    const todas = $app.findRecordsByFilter('fluxo_versoes', "id != ''", '-numero', 100, 0).map(ver)
    const ativa = todas.find((v) => v.ativa) || null
    const contagem = {}
    for (const c of $app.findRecordsByFilter('projeto_disciplinas', "id != ''", '', 0, 0)) {
      const k = c.getString('etapa')
      contagem[k] = (contagem[k] || 0) + 1
    }
    return e.json(200, { ativa: ativa, versoes: todas, cards_por_etapa: contagem })
  },
  $apis.requireAuth(),
)
