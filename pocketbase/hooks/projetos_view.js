// SPEC-1-001 (CA-1-001-06) — leitura de projeto com resposta uniforme.
// Projeto inexistente e projeto sem permissão devolvem o mesmo 403, sem revelar
// existência nem conteúdo; a negação é auditada.
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

    const colecao = $app.findCollectionByNameOrId('projetos')
    if (!$app.canAccessRecord(projeto, e.requestInfo(), colecao.viewRule)) negar()

    return e.json(200, projeto)
  },
  $apis.requireAuth('users'),
)
