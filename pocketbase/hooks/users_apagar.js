// Apagar usuário (emenda à SPEC-1-001, 05/11/2026).
// Só para contas SEM histórico: cadastro errado, duplicado ou que nunca foi usado.
// Conta com qualquer vínculo (projeto, card, apontamento, revisão, handoff etc.) ou que já
// fez alguma ação no sistema não pode ser apagada: o caminho é Revogar, que preserva a autoria.
// Só administrador ativo; ninguém apaga a própria conta. Tudo fica na auditoria.
routerAdd(
  'POST',
  '/backend/v1/usuarios/{id}/apagar',
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
    const id = String(e.request.pathValue('id') || '')
    const audit = (action, outcome, details) => {
      try {
        const a = new Record($app.findCollectionByNameOrId('auth_audit'))
        a.set('actor_id', auth.id)
        a.set('target_id', id.slice(0, 32))
        a.set('action', action)
        a.set('outcome', outcome)
        a.set('details', details || {})
        $app.save(a)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', action)
      }
    }
    if (auth.getString('role') !== 'admin') {
      audit('access.denied', 'blocked', { recurso: 'users', operacao: 'apagar' })
      throw new ForbiddenError('Acesso negado.')
    }
    if (id === auth.id) {
      throw new BadRequestError('Você não pode apagar a sua própria conta.')
    }
    let alvo = null
    try {
      alvo = $app.findRecordById('_pb_users_auth_', id)
    } catch (_) {}
    if (!alvo) return e.json(404, { code: 'inexistente', message: 'Usuário não encontrado.' })

    // Procura qualquer registro que aponte para a conta (todas as relações com users)
    const usersId = $app.findCollectionByNameOrId('_pb_users_auth_').id
    const vinculos = []
    let relacoesVistas = 0
    const cols = $app.findAllCollections()
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i]
      if (col.system || col.name === 'auth_audit') continue
      for (let j = 0; j < col.fields.length; j++) {
        const f = col.fields[j]
        const tipo = typeof f.type === 'function' ? f.type() : f.type
        if (tipo !== 'relation' || f.collectionId !== usersId) continue
        relacoesVistas++
        const achados = $app.findRecordsByFilter(col.name, f.name + ' ~ {:id}', '', 1, 0, {
          id: id,
        })
        if (achados.length > 0 && !(col.id === usersId && achados[0].id === id)) {
          if (!vinculos.includes(col.name)) vinculos.push(col.name)
        }
      }
    }
    // Trava de segurança: se a varredura não enxergou as relações conhecidas
    // (ex.: projetos.coordenador), não arrisca apagar nada.
    if (relacoesVistas < 3) {
      $app
        .logger()
        .error('apagar usuário: varredura de vínculos incompleta', 'relacoes', relacoesVistas)
      return e.json(500, {
        code: 'verificacao_falhou',
        message: 'Não foi possível verificar o histórico da conta. Nada foi apagado.',
      })
    }
    // Ações feitas pela pessoa no sistema (o próprio login não conta)
    const acoes = $app.findRecordsByFilter(
      'auth_audit',
      'actor_id = {:id} && target_id != {:id}',
      '',
      1,
      0,
      { id: id },
    )
    if (acoes.length > 0) vinculos.push('auditoria')

    if (vinculos.length > 0) {
      audit('user.delete', 'blocked', { motivo: 'tem_historico', vinculos: vinculos })
      return e.json(409, {
        code: 'tem_historico',
        vinculos: vinculos,
        message:
          'Esta conta já tem histórico na Central (' +
          vinculos.join(', ') +
          '). Use Revogar: o acesso é cortado e a autoria dos registros é mantida.',
      })
    }

    const snapshot = {
      nome: alvo.getString('name'),
      email: alvo.getString('email'),
      papel: alvo.getString('role'),
    }
    $app.delete(alvo)
    audit('user.delete', 'success', snapshot)
    return e.json(200, { id: id, apagado: true })
  },
  $apis.requireAuth('users'),
)
