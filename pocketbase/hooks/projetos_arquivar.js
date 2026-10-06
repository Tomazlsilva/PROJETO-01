// SPEC-1-002 (CA-1-002-06) — arquiva o projeto: sai das listas ativas, nada é apagado
// e o histórico registra quem arquivou, quando e o motivo.
routerAdd(
  'POST',
  '/backend/v1/projetos/{id}/arquivar',
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
    const id = e.request.pathValue('id')
    const negar = (motivo) => {
      try {
        const a = new Record($app.findCollectionByNameOrId('auth_audit'))
        a.set('actor_id', auth.id)
        a.set('action', 'access.denied')
        a.set('outcome', 'blocked')
        a.set('details', {
          recurso: 'projetos',
          operacao: 'arquivar',
          id: String(id).slice(0, 32),
          motivo: motivo,
        })
        $app.save(a)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Acesso negado.')
    }
    let projeto = null
    try {
      projeto = $app.findRecordById('projetos', id)
    } catch (_) {}
    if (!projeto) negar('inexistente')
    const info = e.requestInfo()
    if (!$app.canAccessRecord(projeto, info, $app.findCollectionByNameOrId('projetos').viewRule))
      negar('sem_vinculo')
    if (
      papel !== 'admin' &&
      !(papel === 'coordenador' && projeto.getString('coordenador') === auth.id)
    ) {
      negar('sem_permissao_edicao')
    }
    const body = info.body || {}
    const motivo = typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 500) : ''

    let ja = false
    $app.runInTransaction((tx) => {
      const p = tx.findRecordById('projetos', id)
      if (p.getBool('arquivado')) {
        ja = true
        return
      }
      p.set('arquivado', true)
      tx.save(p)
      const h = new Record(tx.findCollectionByNameOrId('projeto_historico'))
      h.set('projeto', p.id)
      h.set('autor', auth.id)
      h.set('acao', 'arquivado')
      h.set('campo', 'arquivado')
      h.set('antes', 'não')
      h.set('depois', 'sim')
      h.set('detalhes', { motivo: motivo })
      tx.save(h)
    })
    if (ja) return e.json(409, { code: 'ja_arquivado', message: 'O projeto já está arquivado.' })
    return e.json(200, { id: id, arquivado: true })
  },
  $apis.requireAuth('users'),
)
