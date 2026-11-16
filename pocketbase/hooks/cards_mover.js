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
    const ehResp = card.getString('responsavel') === auth.id && papel !== 'administrativo'
    // SPEC-1-008: só coordenador do projeto, diretor ou administrador aprovam/devolvem
    let pode = false
    if (classe === 'exec') pode = ehAdmin || ehCoord || ehResp
    else if (classe === 'rev') pode = ehAdmin || ehCoord
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

    // SPEC-2-002 (CA-2-002-06): item crítico de entrada pendente segura o card antes de "Pronto"
    // (vale para ir a "Pronto" e para sair adiante da etapa onde o checklist de entrada é aplicado)
    const ckEtapas = cfg.checklists || {
      entrada: 'entrada_pendente',
      revisao: 'aguardando_revisao',
    }
    const adiante = ORDEM.indexOf(para) > ORDEM.indexOf(de)
    if (adiante && (para === 'pronto' || de === ckEtapas.entrada)) {
      const ap = $app.findRecordsByFilter(
        'checklists_aplicados',
        "card = {:c} && tipo = 'entrada'",
        '',
        1,
        0,
        { c: id },
      )
      if (ap.length > 0) {
        const res = JSON.parse(ap[0].getString('resultados') || '{}') || {}
        const faltam = JSON.parse(ap[0].getString('itens') || '[]').filter((it) => {
          const r = res[it.id] ? res[it.id].resultado : ''
          return it.severidade === 'critico' && r !== 'conforme' && r !== 'nao_se_aplica'
        })
        if (faltam.length > 0) {
          return e.json(409, {
            code: 'checklist_entrada_pendente',
            message:
              'Não pode ir para "' +
              nomeEtapa(para) +
              '": ' +
              (faltam.length === 1
                ? 'falta 1 item crítico'
                : 'faltam ' + faltam.length + ' itens críticos') +
              ' do checklist de entrada — ' +
              faltam
                .slice(0, 3)
                .map((x) => '"' + x.texto + '"')
                .join(', ') +
              (faltam.length > 3 ? '…' : '') +
              '.',
            itens: faltam.map((x) => x.texto),
          })
        }
      }
    }

    // SPEC-2-003: aprovar ou devolver encerra a rodada de revisão (na mesma transação)
    let revInfo = null
    const erroRev = (campo, msg) => {
      const d = {}
      d[campo] = new ValidationError('revisao', msg)
      throw new BadRequestError(msg, d)
    }
    if (de === 'aguardando_revisao' && (para === 'em_correcao' || para === 'aprovado')) {
      const apr = $app.findRecordsByFilter(
        'checklists_aplicados',
        "card = {:c} && tipo = 'revisao'",
        '',
        1,
        0,
        {
          c: id,
        },
      )
      if (apr.length > 0) {
        const abertas = $app.findRecordsByFilter(
          'revisao_rodadas',
          "card = {:c} && status = 'aberta'",
          '',
          1,
          0,
          {
            c: id,
          },
        )
        if (abertas.length === 0)
          return conflito(
            'revisao_nao_iniciada',
            'Abra a revisão no card e marque os itens do checklist antes de aprovar ou devolver.',
          )
        const rd = abertas[0]
        const rv = body.revisao && typeof body.revisao === 'object' ? body.revisao : {}
        if (rv.rodada !== rd.id || rv.versao !== rd.getString('updated'))
          return conflito(
            'conflito_edicao',
            'A rodada de revisão mudou depois que você abriu. Atualize o card e confira os itens.',
          )
        const marc = JSON.parse(rd.getString('itens') || '{}') || {}
        const itensRev = JSON.parse(apr[0].getString('itens') || '[]')
        const faltam = itensRev.filter((it) => !marc[it.id] || !marc[it.id].resultado)
        if (faltam.length > 0)
          erroRev(
            'revisao',
            (faltam.length === 1
              ? 'Falta marcar 1 item'
              : 'Faltam marcar ' + faltam.length + ' itens') +
              ' da revisão: ' +
              faltam
                .slice(0, 3)
                .map((x) => '"' + x.texto + '"')
                .join(', ') +
              (faltam.length > 3 ? '…' : '') +
              '.',
          )
        const nc = itensRev.filter((it) => marc[it.id].resultado === 'nao_conforme')
        const exc = itensRev.filter((it) => marc[it.id].resultado === 'excecao')
        if (para === 'aprovado' && nc.length > 0)
          erroRev(
            'revisao',
            'Há ' +
              nc.length +
              ' item(ns) não conforme(s): devolva para correção ou registre exceção técnica.',
          )
        if (para === 'em_correcao' && nc.length === 0)
          erroRev('revisao', 'Nenhum item está não conforme: não há o que devolver para correção.')
        revInfo = {
          id: rd.id,
          versao: rd.getString('updated'),
          numero: rd.getInt('numero'),
          resultado:
            para === 'aprovado'
              ? exc.length > 0
                ? 'aprovado_com_excecao'
                : 'aprovado'
              : 'reprovado',
          nao_conformes: nc.length,
          excecoes: exc.length,
        }
      } else {
        // sem checklist de revisão: a rodada registra só o resultado geral e o motivo (fora do K2)
        if (para === 'em_correcao' && justificativa.length < 3)
          erroRev('justificativa', 'Diga o que precisa ser corrigido.')
        revInfo = {
          id: '',
          resultado: para === 'aprovado' ? 'aprovado' : 'reprovado',
          nao_conformes: 0,
          excecoes: 0,
        }
      }
    }
    // SPEC-2-003 (CA-2-003-04): reenviar exige marcar os itens corrigidos da rodada reprovada
    if (de === 'em_correcao' && para === 'aguardando_revisao') {
      const ult = $app.findRecordsByFilter('revisao_rodadas', 'card = {:c}', '-numero', 1, 0, {
        c: id,
      })
      if (
        ult.length > 0 &&
        ult[0].getString('resultado') === 'reprovado' &&
        !ult[0].getBool('sem_checklist')
      ) {
        const marc = JSON.parse(ult[0].getString('itens') || '{}') || {}
        const ap2 = ult[0].getString('aplicado')
          ? JSON.parse(
              $app
                .findRecordById('checklists_aplicados', ult[0].getString('aplicado'))
                .getString('itens') || '[]',
            )
          : []
        const pend = ap2.filter(
          (it) => marc[it.id] && marc[it.id].resultado === 'nao_conforme' && !marc[it.id].corrigido,
        )
        if (pend.length > 0)
          erroRev(
            'revisao',
            'Marque o que foi corrigido antes de reenviar: ' +
              pend
                .slice(0, 3)
                .map((x) => '"' + x.texto + '"')
                .join(', ') +
              (pend.length > 3 ? '…' : '') +
              '.',
          )
      }
    }

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
      let rodadaRec = null
      if (revInfo && revInfo.id) {
        rodadaRec = tx.findRecordById('revisao_rodadas', revInfo.id)
        if (
          rodadaRec.getString('status') !== 'aberta' ||
          rodadaRec.getString('updated') !== revInfo.versao
        ) {
          situacao = 'conflito'
          return
        }
      } else if (revInfo) {
        const ultR = tx.findRecordsByFilter('revisao_rodadas', 'card = {:c}', '-numero', 1, 0, {
          c: id,
        })
        rodadaRec = new Record(tx.findCollectionByNameOrId('revisao_rodadas'))
        rodadaRec.set('card', id)
        rodadaRec.set('projeto', c.getString('projeto'))
        rodadaRec.set('numero', ultR.length > 0 ? ultR[0].getInt('numero') + 1 : 1)
        rodadaRec.set('sem_checklist', true)
        rodadaRec.set('itens', {})
        rodadaRec.set('historico', [])
        if (!su) rodadaRec.set('aberta_por', auth.id)
        revInfo.numero = rodadaRec.getInt('numero')
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
      const det = {
        classe: classe,
        configuracao: versoes.length > 0 ? versoes[0].getInt('numero') : 0,
        campos: Object.keys(novos),
      }
      if (revInfo)
        det.revisao = {
          rodada: revInfo.numero,
          resultado: revInfo.resultado,
          sem_checklist: !revInfo.id,
          nao_conformes: revInfo.nao_conformes,
          excecoes: revInfo.excecoes,
        }
      t.set('detalhes', det)
      if (idem) t.set('idempotencia', idem)
      tx.save(t)
      versao = c.getString('updated')
      if (rodadaRec) {
        rodadaRec.set('status', 'encerrada')
        rodadaRec.set('resultado', revInfo.resultado)
        rodadaRec.set('motivo', justificativa)
        if (!su) rodadaRec.set('encerrada_por', auth.id)
        rodadaRec.set('encerrada_em', new Date().toISOString())
        if (revInfo.resultado === 'reprovado')
          rodadaRec.set('responsavel_correcao', c.getString('responsavel'))
        tx.save(rodadaRec)
      }

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
      if (para === 'aguardando_revisao' || para === 'aprovado' || para === 'entrada_pendente')
        alvo = p.getString('coordenador')
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
              ? 'Projeto sem coordenador definido.'
              : 'Disciplina sem responsável definido.'
            : falha === 'destino_inativo'
              ? 'O destinatário está inativo.'
              : ''
        const proxima = falha
          ? para === 'aguardando_revisao'
            ? 'Defina o coordenador do projeto e reprocesse.'
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
