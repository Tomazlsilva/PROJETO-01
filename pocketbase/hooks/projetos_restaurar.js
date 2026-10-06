// SPEC-1-002 (CA-1-002-06) — restaura projeto arquivado às listas ativas,
// registrando no histórico.
routerAdd(
  'POST',
  '/backend/v1/projetos/{id}/restaurar',
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
          operacao: 'restaurar',
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

    let ativo = false
    $app.runInTransaction((tx) => {
      const p = tx.findRecordById('projetos', id)
      if (!p.getBool('arquivado')) {
        ativo = true
        return
      }
      p.set('arquivado', false)
      tx.save(p)
      const h = new Record(tx.findCollectionByNameOrId('projeto_historico'))
      h.set('projeto', p.id)
      h.set('autor', auth.id)
      h.set('acao', 'restaurado')
      h.set('campo', 'arquivado')
      h.set('antes', 'sim')
      h.set('depois', 'não')
      tx.save(h)
    })
    if (ativo)
      return e.json(409, { code: 'nao_arquivado', message: 'O projeto não está arquivado.' })
    return e.json(200, { id: id, arquivado: false })
  },
  $apis.requireAuth('users'),
)
