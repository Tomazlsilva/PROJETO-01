// SPEC-1-003 (CA-1-003-04) — bloquear card: exige motivo, dono (usuário ativo) e
// data de revisão. O card mantém a etapa principal e não pode ser movido até o desbloqueio.
// Pode bloquear: administrador, coordenador do projeto ou responsável pelo card.
routerAdd(
  'POST',
  '/backend/v1/cards/{id}/bloquear',
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
          operacao: 'bloquear',
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
      (papel !== 'executivo' && card.getString('responsavel') === auth.id)
    if (!pode) negar('sem_alcada')

    const body = info.body || {}
    const erros = {}
    const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : ''
    if (motivo.length < 3)
      erros.motivo = new ValidationError('obrigatorio', 'Descreva o motivo do bloqueio.')
    else if (motivo.length > 500)
      erros.motivo = new ValidationError('muito_longo', 'Motivo muito longo (máx. 500).')
    const donoId = typeof body.dono === 'string' ? body.dono : ''
    let dono = null
    if (donoId) {
      try {
        dono = $app.findRecordById('users', donoId)
      } catch (_) {}
    }
    if (!dono || !dono.getBool('active'))
      erros.dono = new ValidationError(
        'obrigatorio',
        'Escolha quem é o dono do desbloqueio (usuário ativo).',
      )
    const revisao = typeof body.revisao === 'string' ? body.revisao.trim().slice(0, 10) : ''
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(revisao) || isNaN(new Date(revisao + 'T12:00:00Z').getTime())) {
      erros.revisao = new ValidationError('obrigatorio', 'Informe a data de revisão do bloqueio.')
    } else if (revisao < hoje) {
      erros.revisao = new ValidationError('passado', 'A data de revisão não pode estar no passado.')
    }
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
      if (c.getBool('bloqueado')) return (situacao = 'ja_bloqueado')
      if (c.getString('etapa') === 'aprovado') return (situacao = 'aprovado')
      c.set('bloqueado', true)
      c.set('bloqueio_motivo', motivo)
      c.set('bloqueio_dono', dono.id)
      c.set('bloqueio_revisao', revisao + ' 12:00:00.000Z')
      c.set('bloqueado_em', new Date().toISOString().replace('T', ' '))
      tx.save(c)
      const t = new Record(tx.findCollectionByNameOrId('transicoes'))
      t.set('card', c.id)
      t.set('projeto', c.getString('projeto'))
      t.set('tipo', 'bloqueio')
      t.set('de', c.getString('etapa'))
      t.set('para', c.getString('etapa'))
      t.set('justificativa', motivo)
      t.set('detalhes', { dono: dono.id, dono_nome: dono.getString('name'), revisao: revisao })
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
    if (situacao === 'ja_bloqueado')
      return e.json(409, { code: 'card_bloqueado', message: 'O card já está bloqueado.' })
    if (situacao === 'aprovado')
      return e.json(409, {
        code: 'card_aprovado',
        message: 'Card aprovado não pode ser bloqueado.',
      })
    return e.json(200, { id: id, bloqueado: true, versao: versao })
  },
  $apis.requireAuth(),
)
