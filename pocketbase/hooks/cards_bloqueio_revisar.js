// SPEC-1-004 (T1.18, CA-1-004-05) — revisar um bloqueio sem resolvê-lo: nova data de
// revisão (e, se preciso, novo dono), com nota obrigatória. Fica no histórico do card
// com antes/depois, autor e horário. Pode revisar: administrador, coordenador do
// projeto ou o dono atual do bloqueio.
routerAdd(
  'POST',
  '/backend/v1/cards/{id}/bloqueio/revisar',
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
          operacao: 'revisar_bloqueio',
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
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
    const erros = {}
    const nota = typeof body.nota === 'string' ? body.nota.trim() : ''
    if (nota.length < 3)
      erros.nota = new ValidationError(
        'obrigatorio',
        'Registre o que foi verificado nesta revisão.',
      )
    else if (nota.length > 1000)
      erros.nota = new ValidationError('muito_longo', 'Nota muito longa (máx. 1000).')
    const revisao = typeof body.revisao === 'string' ? body.revisao.trim().slice(0, 10) : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(revisao) || isNaN(new Date(revisao + 'T12:00:00Z').getTime())) {
      erros.revisao = new ValidationError('obrigatorio', 'Informe a nova data de revisão.')
    } else if (revisao < hoje) {
      erros.revisao = new ValidationError('passado', 'A data de revisão não pode estar no passado.')
    }
    let dono = null
    if (body.dono) {
      try {
        dono = $app.findRecordById('users', String(body.dono))
      } catch (_) {}
      if (!dono || !dono.getBool('active'))
        erros.dono = new ValidationError('invalido', 'Escolha um dono ativo.')
    }
    if (typeof body.versao !== 'string' || !body.versao)
      erros.versao = new ValidationError('obrigatorio', 'Versão do card ausente.')
    if (Object.keys(erros).length > 0)
      throw new BadRequestError('Revise os campos destacados.', erros)

    const nomeDe = (uid) => {
      if (!uid) return '—'
      try {
        const u = $app.findRecordById('users', uid)
        return u.getString('name') || u.getString('email').split('@')[0]
      } catch (_) {
        return uid
      }
    }

    let situacao = 'ok'
    let versao = ''
    $app.runInTransaction((tx) => {
      const c = tx.findRecordById('projeto_disciplinas', id)
      const p = tx.findRecordById('projetos', c.getString('projeto'))
      if (p.getBool('arquivado')) {
        situacao = 'arquivado'
        return
      }
      if (c.getString('updated') !== body.versao) {
        situacao = 'conflito'
        return
      }
      if (!c.getBool('bloqueado')) {
        situacao = 'nao_bloqueado'
        return
      }
      const revisaoAntes = c.getString('bloqueio_revisao').slice(0, 10)
      const donoAntes = c.getString('bloqueio_dono')
      const donoDepois = dono ? dono.id : donoAntes
      c.set('bloqueio_revisao', revisao + ' 12:00:00.000Z')
      c.set('bloqueio_dono', donoDepois)
      tx.save(c)
      const t = new Record(tx.findCollectionByNameOrId('transicoes'))
      t.set('card', c.id)
      t.set('projeto', c.getString('projeto'))
      t.set('tipo', 'bloqueio_revisado')
      t.set('de', c.getString('etapa'))
      t.set('para', c.getString('etapa'))
      t.set('justificativa', nota)
      t.set('detalhes', {
        revisao_antes: revisaoAntes,
        revisao_depois: revisao,
        dono_antes: nomeDe(donoAntes),
        dono_depois: nomeDe(donoDepois),
      })
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
    return e.json(200, { id: id, versao: versao })
  },
  $apis.requireAuth(),
)
