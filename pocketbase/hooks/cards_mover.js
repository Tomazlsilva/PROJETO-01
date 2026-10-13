// SPEC-1-003 (T1.13, T1.15) — move um card de etapa, validando no servidor:
// papel/vínculo, transição permitida, etapa ativa, bloqueio, projeto arquivado,
// campos obrigatórios da transição e versão (conflito otimista).
// Grava a transição (de/para, autor, horário, justificativa) no histórico.
// SPEC-1-005: idempotência por chave e handoff para o próximo responsável na mesma transação.
routerAdd(
  'POST',
  '/backend/v1/cards/{id}/mover',
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
          operacao: 'mover',
          id: String(id).slice(0, 32),
          motivo: motivo,
        })
        $app.save(a)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Acesso negado.')
    }
    const conflito = (code, message) => e.json(409, { code: code, message: message })

    // Ordem fixa das etapas e transições permitidas (classe de quem pode mover)
    const ORDEM = [
      'entrada_pendente',
      'pronto',
      'em_elaboracao',
      'aguardando_revisao',
      'em_correcao',
      'aprovado',
    ]
    const T = [
      ['entrada_pendente', 'pronto', 'exec'],
      ['pronto', 'em_elaboracao', 'exec'],
      ['em_elaboracao', 'aguardando_revisao', 'exec'],
      ['aguardando_revisao', 'em_correcao', 'rev'],
      ['aguardando_revisao', 'aprovado', 'rev'],
      ['em_correcao', 'aguardando_revisao', 'exec'],
      ['aprovado', 'em_correcao', 'reabrir'],
      ['aprovado', 'em_elaboracao', 'reabrir'],
    ]

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
    ) {
      negar('sem_vinculo')
    }

    const body = info.body || {}

    // Idempotência (SPEC-1-005): repetir a mesma requisição devolve o resultado anterior
    const idem = typeof body.idempotencia === 'string' ? body.idempotencia.trim() : ''
    if (idem && !/^[A-Za-z0-9_.:-]{8,64}$/.test(idem)) {
      throw new BadRequestError('Revise os campos destacados.', {
        idempotencia: new ValidationError('invalida', 'Chave de idempotência inválida.'),
      })
    }
    if (idem) {
      const ja = $app.findRecordsByFilter('transicoes', 'idempotencia = {:k}', '', 1, 0, {
        k: idem,
      })
      if (ja.length > 0) {
        if (ja[0].getString('card') !== id)
          return e.json(409, {
            code: 'chave_reutilizada',
            message: 'Chave de idempotência já usada em outro card.',
          })
        const atual = $app.findRecordById('projeto_disciplinas', id)
        return e.json(200, {
          id: id,
          etapa: ja[0].getString('para'),
          versao: atual.getString('updated'),
          repetido: true,
          transicao: ja[0].id,
        })
      }
    }
    const para = String(body.para || '')
    const justificativa =
      typeof body.justificativa === 'string' ? body.justificativa.trim().slice(0, 1000) : ''
    const campos = body.campos && typeof body.campos === 'object' ? body.campos : {}
    if (ORDEM.indexOf(para) < 0) {
      throw new BadRequestError('Revise os campos destacados.', {
        para: new ValidationError('invalida', 'Etapa de destino inválida.'),
      })
    }
    if (typeof body.versao !== 'string' || !body.versao) {
      throw new BadRequestError('Revise os campos destacados.', {
        versao: new ValidationError('obrigatorio', 'Versão do card ausente.'),
      })
    }

    // Configuração vigente
    const versoes = $app.findRecordsByFilter('fluxo_versoes', 'ativa = true', '-numero', 1, 0)
    const cfg =
      versoes.length > 0
        ? JSON.parse(versoes[0].getString('config'))
        : { etapas: [], requisitos: {} }
    const ativa = (k) => {
      const et = (cfg.etapas || []).find((x) => x.chave === k)
      return !!(et && et.ativa)
    }
    const nomeEtapa = (k) => {
      const et = (cfg.etapas || []).find((x) => x.chave === k)
      return et ? et.nome : k
    }

    const de = card.getString('etapa')
    if (de === para) return conflito('mesma_etapa', 'O card já está nessa etapa.')
    if (!ativa(para)) {
      throw new BadRequestError('Etapa de destino inativa.', {
        para: new ValidationError('inativa', 'A etapa "' + nomeEtapa(para) + '" está inativa.'),
      })
    }

    // Transição permitida: direta, pulando etapa inativa, ou reversão pelo coordenador
    let classe = ''
    for (const t of T) if (t[0] === de && t[1] === para) classe = t[2]
    if (!classe) {
      for (const t1 of T) {
        if (t1[0] !== de || ativa(t1[1])) continue
        for (const t2 of T) if (t2[0] === t1[1] && t2[1] === para) classe = t1[2]
      }
    }
    if (!classe && ORDEM.indexOf(para) < ORDEM.indexOf(de)) classe = 'reverter'
    if (!classe) {
      throw new BadRequestError('Transição não permitida.', {
        para: new ValidationError(
          'transicao_invalida',
          'Não é possível ir de "' + nomeEtapa(de) + '" para "' + nomeEtapa(para) + '".',
        ),
      })
    }

    // Quem pode
    const papel = su ? 'admin' : auth.getString('role')
    const ehAdmin = papel === 'admin'
    const ehCoord = papel === 'coordenador' && projeto.getString('coordenador') === auth.id
    const ehResp = card.getString('responsavel') === auth.id && papel !== 'executivo'
    const ehRevisor = papel === 'revisor' && projeto.getStringSlice('membros').indexOf(auth.id) >= 0
    let pode = false
    if (classe === 'exec') pode = ehAdmin || ehCoord || ehResp
    else if (classe === 'rev') pode = ehAdmin || ehCoord || (ehRevisor && !ehResp)
    else pode = ehAdmin || ehCoord
    if (!pode) negar('sem_alcada_' + classe)

    if ((classe === 'reabrir' || classe === 'reverter') && justificativa.length < 3) {
      throw new BadRequestError('Revise os campos destacados.', {
        justificativa: new ValidationError(
          'obrigatorio',
          'Informe a justificativa para reabrir ou voltar a etapa.',
        ),
      })
    }

    // Campos obrigatórios da transição (configurados pelo administrador)
    const validarLink = (valor) => {
      const s = String(valor || '').trim()
      if (!s) return null
      if (s.length > 2000 || /[\s\\<>"]/.test(s)) return 'Link inválido.'
      const m = /^https:\/\/([^\/?#]+)(?:[\/?#].*)?$/.exec(s)
      if (!m) return 'Use um link que comece com https://.'
      const aut = m[1]
      if (aut.indexOf('@') >= 0 || aut.charAt(0) === '[') return 'Link não permitido.'
      const pm = /^([^:]*)(?::(\d+))?$/.exec(aut)
      if (!pm || (pm[2] && pm[2] !== '443')) return 'Link não permitido.'
      const host = pm[1].toLowerCase()
      if (
        !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(
          host,
        )
      )
        return 'Use um endereço com nome de domínio válido.'
      const internos = [
        'localhost',
        'local',
        'internal',
        'intranet',
        'lan',
        'home',
        'corp',
        'localdomain',
        'arpa',
        'test',
        'invalid',
        'example',
      ]
      if (internos.indexOf(host.split('.').pop()) >= 0) return 'Endereço interno não é permitido.'
      return null
    }
    const ROTULO = { observacao: 'Observação', link_entrega: 'Link da entrega' }
    const novos = {}
    const erros = {}
    for (const f of ['observacao', 'link_entrega']) {
      if (campos[f] === undefined) continue
      const v = String(campos[f] || '').trim()
      if (f === 'link_entrega') {
        const le = validarLink(v)
        if (le) {
          erros[f] = new ValidationError('link_inseguro', le)
          continue
        }
      }
      if (f === 'observacao' && v.length > 2000) {
        erros[f] = new ValidationError('muito_longo', 'Observação muito longa.')
        continue
      }
      novos[f] = v
    }
    const req = (cfg.requisitos || {})[de + '>' + para] || []
    for (const f of req) {
      const valor = novos[f] !== undefined ? novos[f] : card.getString(f)
      if (!valor && !erros[f])
        erros[f] = new ValidationError(
          'obrigatorio',
          'Preencha "' + (ROTULO[f] || f) + '" para esta transição.',
        )
    }
    if (Object.keys(erros).length > 0)
      throw new BadRequestError('Faltam informações para mover o card.', erros)

    let situacao = 'ok'
    let versao = ''
    let handoff = null
    $app.runInTransaction((tx) => {
      const c = tx.findRecordById('projeto_disciplinas', id)
      const p = tx.findRecordById('projetos', c.getString('projeto'))
      if (p.getBool('arquivado')) {
        situacao = 'arquivado'
        return
      }
      if (c.getString('updated') !== body.versao || c.getString('etapa') !== de) {
        situacao = 'conflito'
        return
      }
      if (c.getBool('bloqueado')) {
        situacao = 'bloqueado'
        return
      }
      c.set('etapa', para)
      for (const f of Object.keys(novos)) c.set(f, novos[f])
      tx.save(c)
      const t = new Record(tx.findCollectionByNameOrId('transicoes'))
      t.set('card', c.id)
      t.set('projeto', c.getString('projeto'))
      t.set('tipo', 'transicao')
      t.set('de', de)
      t.set('para', para)
      t.set('justificativa', justificativa)
      if (!su) t.set('autor', auth.id)
      t.set('detalhes', {
        classe: classe,
        configuracao: versoes.length > 0 ? versoes[0].getInt('numero') : 0,
        campos: Object.keys(novos),
      })
      if (idem) t.set('idempotencia', idem)
      tx.save(t)
      versao = c.getString('updated')

      // ---- Handoff (SPEC-1-005): encerra pendências da etapa anterior e cria a do próximo responsável ----
      const agoraTxt = new Date().toISOString().replace('T', ' ')
      const ator = su ? '' : auth.id
      for (const a of tx.findRecordsByFilter(
        'atividades',
        "card = {:c} && (status = 'pendente' || status = 'recebida')",
        '',
        0,
        0,
        { c: c.id },
      )) {
        a.set('status', 'concluida')
        a.set('encerrada_em', agoraTxt)
        if (ator) a.set('encerrada_por', ator)
        a.set('encerramento', 'Card seguiu para "' + nomeEtapa(para) + '"')
        tx.save(a)
      }
      let alvo = ''
      if (para === 'aguardando_revisao') alvo = c.getString('revisor')
      else if (para === 'aprovado' || para === 'entrada_pendente') alvo = p.getString('coordenador')
      else alvo = c.getString('responsavel')
      let falha = ''
      if (!alvo) falha = 'destino_ausente'
      else {
        let u = null
        try {
          u = tx.findRecordById('users', alvo)
        } catch (_) {}
        if (!u || !u.getBool('active')) falha = 'destino_inativo'
      }
      if (falha || alvo !== ator) {
        const coord = p.getString('coordenador')
        const destinatario = falha ? coord : alvo
        const motivoTexto =
          falha === 'destino_ausente'
            ? para === 'aguardando_revisao'
              ? 'Disciplina sem revisor definido.'
              : 'Disciplina sem responsável definido.'
            : falha === 'destino_inativo'
              ? 'O destinatário está inativo.'
              : ''
        const proxima = falha
          ? para === 'aguardando_revisao'
            ? 'Defina o revisor da disciplina e reprocesse.'
            : 'Defina um responsável ativo e reprocesse.'
          : ''
        const chaveH = 'transicao:' + t.id
        const ev = new Record(tx.findCollectionByNameOrId('handoff_eventos'))
        ev.set('chave', chaveH)
        ev.set('card', c.id)
        ev.set('projeto', p.id)
        ev.set('transicao', t.id)
        ev.set('etapa_origem', de)
        ev.set('etapa_destino', para)
        if (alvo) ev.set('destino_esperado', alvo)
        ev.set('status', falha ? 'falha' : 'entregue')
        ev.set('motivo', falha)
        ev.set('proxima_acao', proxima)
        ev.set('tentativas', 1)
        ev.set('historico', [
          {
            tentativa: 1,
            em: agoraTxt,
            autor: ator,
            resultado: falha ? 'falha' : 'entregue',
            motivo: falha,
          },
        ])
        if (!falha) ev.set('resolvido_em', agoraTxt)
        tx.save(ev)
        const at = new Record(tx.findCollectionByNameOrId('atividades'))
        at.set('chave', chaveH)
        at.set('card', c.id)
        at.set('projeto', p.id)
        at.set('evento', ev.id)
        at.set('etapa', para)
        at.set('etapa_origem', de)
        if (destinatario) at.set('destinatario', destinatario)
        if (ator) at.set('remetente', ator)
        at.set('status', 'pendente')
        at.set('precisa_ajuste', !!falha)
        at.set('motivo_ajuste', motivoTexto)
        tx.save(at)
        ev.set('atividade', at.id)
        tx.save(ev)
        let discNome = ''
        try {
          discNome = tx.findRecordById('disciplinas', c.getString('disciplina')).getString('nome')
        } catch (_) {}
        if (destinatario) {
          const n = new Record(tx.findCollectionByNameOrId('notificacoes'))
          n.set('destinatario', destinatario)
          n.set('atividade', at.id)
          n.set('card', c.id)
          n.set('projeto', p.id)
          n.set(
            'titulo',
            (falha ? 'Ajuste necessário: ' : 'Nova pendência: ') +
              discNome +
              ' — ' +
              p.getString('nome'),
          )
          n.set('texto', falha ? motivoTexto + ' ' + proxima : 'Etapa "' + nomeEtapa(para) + '".')
          n.set('lida', false)
          tx.save(n)
        }
        const th = new Record(tx.findCollectionByNameOrId('transicoes'))
        th.set('card', c.id)
        th.set('projeto', p.id)
        th.set('tipo', 'handoff')
        th.set('de', de)
        th.set('para', para)
        if (ator) th.set('autor', ator)
        th.set('detalhes', {
          acao: falha ? 'encaminhado_coordenador' : 'criado',
          atividade: at.id,
          destinatario: destinatario,
          motivo: falha,
        })
        tx.save(th)
        handoff = {
          atividade: at.id,
          destinatario: destinatario,
          precisa_ajuste: !!falha,
          motivo: falha,
        }
      }
    })
    if (situacao === 'arquivado')
      return conflito('projeto_arquivado', 'Projeto arquivado: restaure-o para mover os cards.')
    if (situacao === 'bloqueado')
      return conflito('card_bloqueado', 'Card bloqueado: resolva o bloqueio antes de mover.')
    if (situacao === 'conflito') {
      return conflito(
        'conflito_edicao',
        'Outra pessoa alterou este card depois que você abriu. Atualize o Kanban e tente de novo.',
      )
    }
    if (handoff && handoff.destinatario) {
      try {
        const u = $app.findRecordById('users', handoff.destinatario)
        handoff.destinatario = {
          id: u.id,
          nome: u.getString('name') || u.getString('email').split('@')[0],
        }
      } catch (_) {
        handoff.destinatario = { id: handoff.destinatario, nome: '—' }
      }
    }
    return e.json(200, { id: id, etapa: para, versao: versao, handoff: handoff })
  },
  $apis.requireAuth(),
)
