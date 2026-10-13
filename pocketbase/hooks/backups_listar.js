// SPEC-1-007 (T1.36) — lista de backups (só administrador). Nunca devolve a chave:
// apenas se ela está configurada (chave_configurada: true/false).
routerAdd(
  'GET',
  '/backend/v1/backups',
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
    if (auth.getString('role') !== 'admin') {
      try {
        const r = new Record($app.findCollectionByNameOrId('auth_audit'))
        r.set('actor_id', auth.id)
        r.set('action', 'access.denied')
        r.set('outcome', 'blocked')
        r.set('details', { recurso: 'backups', motivo: 'papel' })
        $app.save(r)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Acesso negado.')
    }
    let chave = ''
    try {
      chave = $secrets.get('BACKUP_KEY') || ''
    } catch (_) {}
    if (!chave) chave = $os.getenv('BACKUP_KEY') || ''
    const itens = []
    for (const b of $app.findRecordsByFilter('backups', "id != ''", '-created', 200, 0)) {
      const u = b.getString('criado_por')
      let nome = ''
      if (u) {
        try {
          const x = $app.findRecordById('users', u)
          nome = x.getString('name') || x.getString('email').split('@')[0]
        } catch (_) {}
      }
      let cont = {}
      let ver = null
      try {
        cont = JSON.parse(b.getString('contagens') || '{}') || {}
      } catch (_) {}
      try {
        ver = JSON.parse(b.getString('verificacao') || 'null')
      } catch (_) {}
      itens.push({
        id: b.id,
        criado_em: b.getString('created'),
        status: b.getString('status'),
        origem: b.getString('origem') || 'manual',
        erro: b.getString('erro'),
        arquivo: b.getString('arquivo'),
        tamanho_bytes: b.getInt('tamanho_bytes'),
        sha256: b.getString('sha256'),
        contagens: cont,
        criado_por: nome,
        expira_em: b.getString('expira_em'),
        verificado_em: b.getString('verificado_em'),
        verificacao: ver,
      })
    }
    return e.json(200, { chave_configurada: chave.length === 32, retencao_dias: 90, itens: itens })
  },
  $apis.requireAuth('users'),
)
