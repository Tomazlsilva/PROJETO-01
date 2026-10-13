// SPEC-1-004 (T1.19, CA-1-004-06) — coordenador do projeto ou administrador reatribui
// o card, define o revisor (SPEC-1-005), muda a prioridade ou o prazo próprio. Valor vazio = volta a herdar
// (responsável → coordenador; prioridade e prazo → do projeto).
// Exige justificativa e a versão do card; registra antes/depois, autor e horário
// no histórico do card (e a reatribuição também no histórico do projeto).
routerAdd(
  'PATCH',
  '/backend/v1/cards/{id}',
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
          operacao: 'atualizar',
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
    if (
      papel !== 'admin' &&
      !(papel === 'coordenador' && projeto.getString('coordenador') === auth.id)
    )
      negar('sem_alcada')

    const body = info.body || {}
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
    const erros = {}
    const justificativa = typeof body.justificativa === 'string' ? body.justificativa.trim() : ''
    if (justificativa.length < 3)
      erros.justificativa = new ValidationError(
        'obrigatorio',
        'Informe a justificativa da alteração.',
      )
    else if (justificativa.length > 1000)
      erros.justificativa = new ValidationError(
        'muito_longo',
        'Justificativa muito longa (máx. 1000).',
      )
    if (typeof body.versao !== 'string' || !body.versao)
      erros.versao = new ValidationError('obrigatorio', 'Versão do card ausente.')

    const coordId = projeto.getString('coordenador')
    const novos = {}
    if (body.responsavel !== undefined) {
      const r = body.responsavel ? String(body.responsavel) : ''
      if (r) {
        let u = null
        try {
          u = $app.findRecordById('users', r)
        } catch (_) {}
        if (!u || !u.getBool('active') || u.getString('role') === 'executivo') {
          erros.responsavel = new ValidationError(
            'invalido',
            'Escolha um responsável ativo que possa executar o trabalho.',
          )
        }
      }
      novos.responsavel = r
    }
    if (body.revisor !== undefined) {
      const r = body.revisor ? String(body.revisor) : ''
      if (r) {
        let u = null
        try {
          u = $app.findRecordById('users', r)
        } catch (_) {}
        const respFinal =
          novos.responsavel !== undefined
            ? novos.responsavel || coordId
            : card.getString('responsavel')
        if (
          !u ||
          !u.getBool('active') ||
          u.getString('role') === 'executivo' ||
          u.getString('role') === 'projetista'
        ) {
          erros.revisor = new ValidationError(
            'invalido',
            'Escolha um revisor ativo (revisor, coordenador ou administrador).',
          )
        } else if (r === respFinal) {
          erros.revisor = new ValidationError(
            'mesma_pessoa',
            'O revisor não pode ser o responsável pela disciplina.',
          )
        }
      }
      novos.revisor = r
    }
    if (body.prioridade !== undefined) {
      const v = body.prioridade ? String(body.prioridade) : ''
      if (v && ['Baixa', 'Normal', 'Alta', 'Urgente'].indexOf(v) < 0)
        erros.prioridade = new ValidationError('invalido', 'Prioridade inválida.')
      novos.prioridade = v
    }
    if (body.prazo !== undefined) {
      const v = body.prazo ? String(body.prazo).trim().slice(0, 10) : ''
      if (v) {
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
          new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) !== v
        ) {
          erros.prazo = new ValidationError('invalido', 'Prazo inválido.')
        } else if (v < hoje)
          erros.prazo = new ValidationError('passado', 'O prazo não pode estar no passado.')
      }
      novos.prazo = v
    }
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
    let disciplinaNome = ''
    try {
      disciplinaNome = $app
        .findRecordById('disciplinas', card.getString('disciplina'))
        .getString('nome')
    } catch (_) {}
    const prioProjeto = projeto.getString('prioridade') || 'Normal'
    const prazoProjeto = projeto.getString('prazo').slice(0, 10)

    let situacao = 'ok'
    let versao = ''
    let mudancas = []
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
      if (novos.responsavel !== undefined) {
        const antesId = c.getString('responsavel')
        const antesHerdado = c.getBool('responsavel_herdado')
        const depoisId = novos.responsavel || coordId
        const depoisHerdado = !novos.responsavel
        if (antesId !== depoisId || antesHerdado !== depoisHerdado) {
          c.set('responsavel', depoisId)
          c.set('responsavel_herdado', depoisHerdado)
          mudancas.push({
            campo: 'responsavel',
            antes: nomeDe(antesId) + (antesHerdado ? ' (herdado)' : ''),
            depois: nomeDe(depoisId) + (depoisHerdado ? ' (herdado)' : ''),
            antes_id: antesId,
            depois_id: depoisId,
          })
          if (novos.responsavel && novos.responsavel !== coordId) {
            const membros = p.getStringSlice('membros')
            if (membros.indexOf(novos.responsavel) < 0) {
              membros.push(novos.responsavel)
              p.set('membros', membros)
              tx.save(p)
            }
          }
        }
      }
      if (novos.revisor !== undefined && novos.revisor !== c.getString('revisor')) {
        const antes = c.getString('revisor')
        c.set('revisor', novos.revisor)
        mudancas.push({
          campo: 'revisor',
          antes: antes ? nomeDe(antes) : 'sem revisor',
          depois: novos.revisor ? nomeDe(novos.revisor) : 'sem revisor',
          antes_id: antes,
          depois_id: novos.revisor,
        })
        if (novos.revisor && novos.revisor !== coordId) {
          const membros = p.getStringSlice('membros')
          if (membros.indexOf(novos.revisor) < 0) {
            membros.push(novos.revisor)
            p.set('membros', membros)
            tx.save(p)
          }
        }
      }
      if (novos.prioridade !== undefined && novos.prioridade !== c.getString('prioridade')) {
        const antes = c.getString('prioridade')
        c.set('prioridade', novos.prioridade)
        mudancas.push({
          campo: 'prioridade',
          antes: antes || prioProjeto + ' (do projeto)',
          depois: novos.prioridade || prioProjeto + ' (do projeto)',
        })
      }
      if (novos.prazo !== undefined && novos.prazo !== c.getString('prazo').slice(0, 10)) {
        const antes = c.getString('prazo').slice(0, 10)
        c.set('prazo', novos.prazo ? novos.prazo + ' 12:00:00.000Z' : '')
        mudancas.push({
          campo: 'prazo',
          antes: antes || prazoProjeto + ' (do projeto)',
          depois: novos.prazo || prazoProjeto + ' (do projeto)',
        })
      }
      if (mudancas.length === 0) {
        versao = c.getString('updated')
        return
      }
      tx.save(c)
      const t = new Record(tx.findCollectionByNameOrId('transicoes'))
      t.set('card', c.id)
      t.set('projeto', c.getString('projeto'))
      t.set('tipo', 'alteracao')
      t.set('de', c.getString('etapa'))
      t.set('para', c.getString('etapa'))
      t.set('justificativa', justificativa)
      t.set('detalhes', { mudancas: mudancas })
      if (!su) t.set('autor', auth.id)
      tx.save(t)
      for (const m of mudancas) {
        if (m.campo !== 'responsavel') continue
        const h = new Record(tx.findCollectionByNameOrId('projeto_historico'))
        h.set('projeto', c.getString('projeto'))
        if (!su) h.set('autor', auth.id)
        h.set('acao', 'editado')
        h.set('campo', 'responsavel')
        h.set('antes', m.antes)
        h.set('depois', m.depois)
        h.set('detalhes', { disciplina: disciplinaNome, justificativa: justificativa })
        tx.save(h)
      }
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
    return e.json(200, {
      id: id,
      versao: versao,
      alterado: mudancas.length > 0,
      mudancas: mudancas,
    })
  },
  $apis.requireAuth(),
)
