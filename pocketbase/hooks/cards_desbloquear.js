// SPEC-1-003 (CA-1-003-04) — desbloquear card com a resolução registrada no histórico.
// Pode desbloquear: administrador, coordenador do projeto ou o dono do bloqueio.
routerAdd(
  'POST',
  '/backend/v1/cards/{id}/desbloquear',
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
    const negar = (motivo) => {
      try {
        const a = new Record($app.findCollectionByNameOrId('auth_audit'))
        a.set('actor_id', su ? '' : auth.id)
        a.set('action', 'access.denied')
        a.set('outcome', 'blocked')
        a.set('details', {
          recurso: 'cards',
          operacao: 'desbloquear',
          id: String(id).slice(0, 32),
          motivo: motivo,
        })
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
    if (!card) negar('inexistente')
    let projeto = null
    try {
      projeto = $app.findRecordById('projetos', card.getString('projeto'))
    } catch (_) {}
    const info = e.requestInfo()
    if (
      !projeto ||
      !$app.canAccessRecord(projeto, info, $app.findCollectionByNameOrId('projetos').viewRule)
    )
      negar('sem_vinculo')
    const papel = su ? 'admin' : auth.getString('role')
    const pode =
      papel === 'admin' ||
      (papel === 'coordenador' && projeto.getString('coordenador') === auth.id) ||
      (card.getString('bloqueio_dono') === auth.id && papel !== 'executivo')
    if (!pode) negar('sem_alcada')

    const body = info.body || {}
    const resolucao = typeof body.resolucao === 'string' ? body.resolucao.trim() : ''
    const erros = {}
    if (resolucao.length < 3)
      erros.resolucao = new ValidationError(
        'obrigatorio',
        'Descreva como o bloqueio foi resolvido.',
      )
    else if (resolucao.length > 1000)
      erros.resolucao = new ValidationError('muito_longo', 'Texto muito longo (máx. 1000).')
    if (typeof body.versao !== 'string' || !body.versao)
      erros.versao = new ValidationError('obrigatorio', 'Versão do card ausente.')
    if (Object.keys(erros).length > 0)
      throw new BadRequestError('Revise os campos destacados.', erros)

    let situacao = 'ok'
    let versao = ''
    $app.runInTransaction((tx) => {
      const c = tx.findRecordById('projeto_disciplinas', id)
      const p = tx.findRecordById('projetos', c.getString('projeto'))
      if (p.getBool('arquivado')) return (situacao = 'arquivado')
      if (c.getString('updated') !== body.versao) return (situacao = 'conflito')
      if (!c.getBool('bloqueado')) return (situacao = 'nao_bloqueado')
      const anterior = {
        motivo: c.getString('bloqueio_motivo'),
        dono: c.getString('bloqueio_dono'),
        revisao: c.getString('bloqueio_revisao').slice(0, 10),
        desde: c.getString('bloqueado_em'),
      }
      c.set('bloqueado', false)
      c.set('bloqueio_motivo', '')
      c.set('bloqueio_dono', '')
      c.set('bloqueio_revisao', '')
      c.set('bloqueado_em', '')
      tx.save(c)
      const t = new Record(tx.findCollectionByNameOrId('transicoes'))
      t.set('card', c.id)
      t.set('projeto', c.getString('projeto'))
      t.set('tipo', 'desbloqueio')
      t.set('de', c.getString('etapa'))
      t.set('para', c.getString('etapa'))
      t.set('justificativa', resolucao)
      t.set('detalhes', { bloqueio: anterior })
      if (!su) t.set('autor', auth.id)
      tx.save(t)
      versao = c.getString('updated')
    })
    if (situacao === 'arquivado')
      return e.json(409, {
        code: 'projeto_arquivado',
        message: 'Projeto arquivado: restaure-o para alterar os cards.',
      })
    if (situacao === 'conflito') {
      return e.json(409, {
        code: 'conflito_edicao',
        message: 'Outra pessoa alterou este card depois que você abriu. Atualize e tente de novo.',
      })
    }
    if (situacao === 'nao_bloqueado')
      return e.json(409, { code: 'nao_bloqueado', message: 'O card não está bloqueado.' })
    return e.json(200, { id: id, bloqueado: false, versao: versao })
  },
  $apis.requireAuth(),
)
