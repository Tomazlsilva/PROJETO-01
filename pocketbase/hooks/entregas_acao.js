// SPEC-1-008 (T1.40) — ações sobre entregas do calendário.
//   POST /backend/v1/entregas/{id}/{acao}
//     criar            ({id} = projeto) tipo, data, descricao?, disciplinas[], alocacoes[]?
//     alterar          versao, data?, tipo?, descricao?, disciplinas?, alocacoes?
//     revisao          versao, data, descricao?  → nova Revisão com o mesmo projeto,
//                      disciplinas e pessoas e o próximo número; a Final não muda
//     alocacoes        versao, alocacoes[{pessoa | pessoa_texto, inicio, fim}] (substitui)
//     entregar | desfazer_entrega | art | desfazer_art   versao
// Quem pode: administrador/diretor e o coordenador do projeto. Administrativo e
// projetista → 403 auditado. Conflito de versão → 409. Data ou janela em feriado → 409
// "feriado" com a lista, e grava se vier confirmar_feriado = true.
// Regras: início ≤ fim ≤ data da entrega; entrega entregue só muda de data depois de
// desfeita; Final principal = prazo do projeto (mesma transação). Histórico só de inclusão.
// Qualquer recusa no meio da transação desfaz tudo o que ela já tinha gravado.
routerAdd(
  'POST',
  '/backend/v1/entregas/{id}/{acao}',
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
    const acao = String(e.request.pathValue('acao') || '')
    const ACOES = [
      'criar',
      'alterar',
      'revisao',
      'alocacoes',
      'entregar',
      'desfazer_entrega',
      'art',
      'desfazer_art',
    ]
    if (ACOES.indexOf(acao) < 0) throw new NotFoundError('Ação desconhecida.')
    const papel = auth.getString('role')
    const negar = (motivo) => {
      try {
        const a = new Record($app.findCollectionByNameOrId('auth_audit'))
        a.set('actor_id', auth.id)
        a.set('action', 'access.denied')
        a.set('outcome', 'blocked')
        a.set('details', {
          recurso: 'entregas',
          operacao: acao,
          id: id.slice(0, 32),
          motivo: motivo,
        })
        $app.save(a)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Acesso negado.')
    }
    const invalido = (campo, msg) => {
      const erros = {}
      erros[campo] = new ValidationError('invalido', msg)
      throw new BadRequestError('Revise os campos destacados.', erros)
    }
    const dataOk = (d) =>
      typeof d === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(d) &&
      new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) === d
    const D = (d) => d + ' 12:00:00.000Z'

    // ---- entrega e projeto ----
    let entrega = null
    let projeto = null
    if (acao === 'criar') {
      try {
        projeto = $app.findRecordById('projetos', id)
      } catch (_) {}
    } else {
      try {
        entrega = $app.findRecordById('entregas', id)
        projeto = $app.findRecordById('projetos', entrega.getString('projeto'))
      } catch (_) {}
    }
    if (!projeto) negar('inexistente')
    if (
      !(
        papel === 'admin' ||
        (papel === 'coordenador' && projeto.getString('coordenador') === auth.id)
      )
    )
      negar('sem_alcada')
    if (projeto.getBool('arquivado'))
      return e.json(409, {
        code: 'projeto_arquivado',
        message: 'Projeto arquivado: restaure-o antes de mexer nas entregas.',
      })

    const body = e.requestInfo().body || {}
    if (acao !== 'criar' && (typeof body.versao !== 'string' || !body.versao))
      invalido('versao', 'Versão da entrega ausente.')

    // ---- validações de campos ----
    const TIPOS = ['previa', 'final', 'revisao', 'outro']
    const novos = {}
    if (body.tipo !== undefined && (acao === 'criar' || acao === 'alterar')) {
      if (TIPOS.indexOf(body.tipo) < 0) invalido('tipo', 'Tipo inválido.')
      novos.tipo = body.tipo
    }
    if (body.data !== undefined && acao !== 'alocacoes') {
      if (!dataOk(body.data)) invalido('data', 'Data inválida.')
      novos.data = body.data
    }
    if (body.descricao !== undefined) {
      const s = String(body.descricao || '').trim()
      if (s.length > 300) invalido('descricao', 'Descrição muito longa (máx. 300).')
      novos.descricao = s
    }
    if (body.disciplinas !== undefined && (acao === 'criar' || acao === 'alterar')) {
      if (!Array.isArray(body.disciplinas))
        invalido('disciplinas', 'Lista de disciplinas inválida.')
      const lista = []
      for (const cid of body.disciplinas) {
        let c = null
        try {
          c = $app.findRecordById('projeto_disciplinas', String(cid))
        } catch (_) {}
        if (!c || c.getString('projeto') !== projeto.id)
          invalido('disciplinas', 'Disciplina que não é deste projeto.')
        if (lista.indexOf(c.id) < 0) lista.push(c.id)
      }
      novos.disciplinas = lista
    }
    let alocNovas = null
    if (body.alocacoes !== undefined && acao !== 'entregar' && acao !== 'art') {
      if (!Array.isArray(body.alocacoes) || body.alocacoes.length > 30)
        invalido('alocacoes', 'Lista de pessoas inválida.')
      alocNovas = []
      for (const a of body.alocacoes) {
        const pid = a && a.pessoa ? String(a.pessoa) : ''
        const txt = a && a.pessoa_texto ? String(a.pessoa_texto).trim().slice(0, 80) : ''
        if (!pid && !txt) invalido('alocacoes', 'Informe a pessoa.')
        if (pid) {
          let u = null
          try {
            u = $app.findRecordById('users', pid)
          } catch (_) {}
          if (!u || !u.getBool('active')) invalido('alocacoes', 'Pessoa inativa ou inexistente.')
        }
        const ini = a && a.inicio ? String(a.inicio) : ''
        const fim = a && a.fim ? String(a.fim) : ''
        if ((ini || fim) && (!dataOk(ini) || !dataOk(fim)))
          invalido('alocacoes', 'Início e fim da janela precisam ser datas válidas.')
        if (ini && ini > fim) invalido('alocacoes', 'O início da janela é depois do fim.')
        alocNovas.push({ pessoa: pid, pessoa_texto: pid ? '' : txt, inicio: ini, fim: fim })
      }
    }

    // ---- feriados: aviso que precisa de confirmação ----
    const conferirFeriados = (datas) => {
      if (body.confirmar_feriado === true || datas.length === 0) return null
      const achados = []
      for (const d of datas) {
        for (const f of $app.findRecordsByFilter(
          'feriados',
          "ativo = true && data >= {:i} && data < {:f} && abrangencia != 'ponto_facultativo'",
          '',
          5,
          0,
          { i: d + ' 00:00:00.000Z', f: d + ' 23:59:59.999Z' },
        )) {
          achados.push({ data: d, nome: f.getString('nome') })
        }
      }
      return achados.length ? achados : null
    }
    const diasEntre = (ini, fim) => {
      const l = []
      let d = ini
      for (let i = 0; i < 400 && d <= fim; i++) {
        l.push(d)
        d = new Date(new Date(d + 'T12:00:00Z').getTime() + 86400000).toISOString().slice(0, 10)
      }
      return l
    }

    // ---- execução em transação ----
    let res = null
    let falha = null
    const PARAR = '__falha_entrega__'
    try {
      $app.runInTransaction((tx) => {
        const parar = () => {
          throw new Error(PARAR)
        }
        const colE = tx.findCollectionByNameOrId('entregas')
        const colA = tx.findCollectionByNameOrId('entrega_alocacoes')
        const colH = tx.findCollectionByNameOrId('entrega_historico')
        const hist = (ent, acaoH, antes, depois, detalhes) => {
          const h = new Record(colH)
          h.set('entrega', ent.id)
          h.set('projeto', projeto.id)
          h.set('acao', acaoH)
          h.set('antes', antes === undefined || antes === null ? '' : String(antes).slice(0, 2000))
          h.set(
            'depois',
            depois === undefined || depois === null ? '' : String(depois).slice(0, 2000),
          )
          h.set('autor', auth.id)
          h.set('detalhes', detalhes || {})
          tx.save(h)
        }
        const alocDe = (ent) =>
          tx.findRecordsByFilter('entrega_alocacoes', 'entrega = {:e}', 'inicio', 0, 0, {
            e: ent.id,
          })
        const resumoAloc = (lista) =>
          lista
            .map(
              (a) => (a.pessoa || a.pessoa_texto) + (a.inicio ? ' ' + a.inicio + '→' + a.fim : ''),
            )
            .join(', ')
        const gravarAlocacoes = (ent, dataEnt, lista) => {
          for (const a of lista) {
            if (a.fim && a.fim > dataEnt) {
              falha = {
                status: 409,
                code: 'janela_depois_da_entrega',
                message:
                  'A janela de execução termina depois da data da entrega (' +
                  dataEnt +
                  '). Ajuste a janela na mesma tela.',
              }
              return false
            }
          }
          const antigas = alocDe(ent)
          const antes = resumoAloc(
            antigas.map((a) => ({
              pessoa: a.getString('pessoa'),
              pessoa_texto: a.getString('pessoa_texto'),
              inicio: a.getString('inicio').slice(0, 10),
              fim: a.getString('fim').slice(0, 10),
            })),
          )
          for (const a of antigas) tx.delete(a)
          for (const a of lista) {
            const r = new Record(colA)
            r.set('entrega', ent.id)
            if (a.pessoa) r.set('pessoa', a.pessoa)
            r.set('pessoa_texto', a.pessoa_texto)
            // sem janela: a pessoa aparece só no dia da entrega
            r.set('inicio', D(a.inicio || dataEnt))
            r.set('fim', D(a.fim || dataEnt))
            r.set('janela_definida', !!a.inicio)
            tx.save(r)
          }
          const depois = resumoAloc(lista)
          if (antes !== depois) hist(ent, 'alocacao_alterada', antes, depois, {})
          return true
        }
        const sincronizarPrazo = (ent, nova) => {
          if (ent.getString('tipo') !== 'final' || !ent.getBool('principal')) return
          const p = tx.findRecordById('projetos', projeto.id)
          if (p.getString('prazo').slice(0, 10) === nova) return
          const antes = p.getString('prazo').slice(0, 10)
          p.set('prazo', D(nova))
          tx.save(p)
          const h = new Record(tx.findCollectionByNameOrId('projeto_historico'))
          h.set('projeto', p.id)
          h.set('autor', auth.id)
          h.set('acao', 'editado')
          h.set('campo', 'prazo')
          h.set('antes', antes)
          h.set('depois', nova)
          h.set('detalhes', { origem: 'calendário (Final principal)' })
          tx.save(h)
        }
        const conferirVersao = (ent) => {
          if (ent.getString('updated') !== body.versao) {
            falha = {
              status: 409,
              code: 'conflito_edicao',
              message:
                'Outra pessoa alterou esta entrega depois que você abriu. Atualize e tente de novo.',
            }
            return false
          }
          return true
        }
        const aviso = (datas) => {
          const f = conferirFeriados(datas)
          if (f) {
            falha = {
              status: 409,
              code: 'feriado',
              feriados: f,
              message:
                'Feriado: ' +
                f.map((x) => x.nome + ' (' + x.data + ')').join(', ') +
                '. Confirme para gravar mesmo assim.',
            }
            return false
          }
          return true
        }
        const proximoNumero = () => {
          const ult = tx.findRecordsByFilter(
            'entregas',
            "projeto = {:p} && tipo = 'revisao'",
            '-numero_revisao',
            1,
            0,
            { p: projeto.id },
          )
          return ult.length ? ult[0].getInt('numero_revisao') + 1 : 1
        }
        const diasDasJanelas = (lista) => {
          const datas = []
          for (const a of lista || [])
            if (a.inicio) for (const d of diasEntre(a.inicio, a.fim)) datas.push(d)
          return datas
        }

        if (acao === 'criar') {
          if (!novos.tipo) {
            falha = { status: 400, code: 'tipo', message: 'Informe o tipo.' }
            parar()
          }
          if (!novos.data) {
            falha = { status: 400, code: 'data', message: 'Informe a data.' }
            parar()
          }
          if (!aviso([novos.data].concat(diasDasJanelas(alocNovas)))) parar()
          const r = new Record(colE)
          r.set('projeto', projeto.id)
          r.set('tipo', novos.tipo)
          r.set('data', D(novos.data))
          r.set('descricao', novos.descricao || '')
          r.set('disciplinas', novos.disciplinas || [])
          r.set('origem', 'central')
          r.set('principal', false)
          if (novos.tipo === 'revisao') r.set('numero_revisao', proximoNumero())
          tx.save(r)
          hist(r, 'criada', '', novos.data, {
            tipo: novos.tipo,
            numero_revisao: r.getInt('numero_revisao'),
          })
          if (alocNovas && !gravarAlocacoes(r, novos.data, alocNovas)) parar()
          res = {
            status: 201,
            id: r.id,
            versao: tx.findRecordById('entregas', r.id).getString('updated'),
          }
          return
        }

        const ent = tx.findRecordById('entregas', id)
        if (!conferirVersao(ent)) parar()
        const dataAtual = ent.getString('data').slice(0, 10)

        if (acao === 'revisao') {
          if (!novos.data) {
            falha = { status: 400, code: 'data', message: 'Informe a data da revisão.' }
            parar()
          }
          if (!aviso([novos.data])) parar()
          const r = new Record(colE)
          r.set('projeto', projeto.id)
          r.set('tipo', 'revisao')
          r.set('data', D(novos.data))
          r.set('descricao', novos.descricao || '')
          r.set('disciplinas', ent.getStringSlice('disciplinas'))
          r.set('origem', 'central')
          r.set('principal', false)
          r.set('numero_revisao', proximoNumero())
          r.set('revisao_de', ent.id)
          tx.save(r)
          hist(r, 'criada', '', novos.data, {
            tipo: 'revisao',
            numero_revisao: r.getInt('numero_revisao'),
            a_partir_de: ent.id,
          })
          // mesmas pessoas, sem janela (aparecem no dia da revisão até alguém definir)
          const pessoas = alocDe(ent).map((a) => ({
            pessoa: a.getString('pessoa'),
            pessoa_texto: a.getString('pessoa_texto'),
            inicio: '',
            fim: '',
          }))
          if (pessoas.length && !gravarAlocacoes(r, novos.data, pessoas)) parar()
          res = { status: 201, id: r.id, numero_revisao: r.getInt('numero_revisao') }
          return
        }

        if (acao === 'alocacoes') {
          if (!alocNovas) {
            falha = { status: 400, code: 'alocacoes', message: 'Informe as pessoas.' }
            parar()
          }
          if (!aviso(diasDasJanelas(alocNovas))) parar()
          if (!gravarAlocacoes(ent, dataAtual, alocNovas)) parar()
          tx.save(ent) // nova versão da entrega
        }

        if (acao === 'alterar') {
          const novaData = novos.data && novos.data !== dataAtual ? novos.data : ''
          if (novaData && ent.getBool('entregue')) {
            falha = {
              status: 409,
              code: 'ja_entregue',
              message: 'Entrega já marcada como entregue: desfaça a entrega antes de mudar a data.',
            }
            parar()
          }
          if (novaData) {
            if (!aviso([novaData])) parar()
            // janelas que terminariam depois da nova data precisam vir ajustadas
            const conflitos = alocDe(ent).filter(
              (a) => a.getBool('janela_definida') && a.getString('fim').slice(0, 10) > novaData,
            )
            if (conflitos.length && !alocNovas) {
              falha = {
                status: 409,
                code: 'janela_conflito',
                message:
                  'Há janelas de execução que terminam depois da nova data. Ajuste-as na mesma tela.',
                janelas: conflitos.map((a) => ({
                  id: a.id,
                  pessoa: a.getString('pessoa'),
                  pessoa_texto: a.getString('pessoa_texto'),
                  inicio: a.getString('inicio').slice(0, 10),
                  fim: a.getString('fim').slice(0, 10),
                })),
              }
              parar()
            }
            ent.set('data', D(novaData))
            hist(ent, 'data_alterada', dataAtual, novaData, {})
          }
          if (novos.tipo && novos.tipo !== ent.getString('tipo')) {
            if (ent.getBool('principal')) {
              falha = {
                status: 409,
                code: 'final_principal',
                message: 'A Final principal define o prazo do projeto e não muda de tipo.',
              }
              parar()
            }
            hist(ent, 'tipo_alterado', ent.getString('tipo'), novos.tipo, {})
            ent.set('tipo', novos.tipo)
            if (novos.tipo === 'revisao' && !ent.getInt('numero_revisao'))
              ent.set('numero_revisao', proximoNumero())
          }
          if (novos.descricao !== undefined && novos.descricao !== ent.getString('descricao')) {
            hist(ent, 'descricao_alterada', ent.getString('descricao'), novos.descricao, {})
            ent.set('descricao', novos.descricao)
          }
          if (novos.disciplinas) {
            const antes = ent.getStringSlice('disciplinas').slice().sort().join(',')
            const depois = novos.disciplinas.slice().sort().join(',')
            if (antes !== depois) {
              hist(ent, 'disciplinas_alteradas', antes, depois, {})
              ent.set('disciplinas', novos.disciplinas)
            }
          }
          tx.save(ent)
          if (alocNovas && !gravarAlocacoes(ent, novaData || dataAtual, alocNovas)) parar()
          if (novaData) sincronizarPrazo(ent, novaData)
        }

        const agora = new Date().toISOString().replace('T', ' ')
        if (acao === 'entregar' || acao === 'desfazer_entrega') {
          const marcar = acao === 'entregar'
          if (ent.getBool('entregue') === marcar) {
            falha = {
              status: 409,
              code: 'sem_mudanca',
              message: marcar ? 'A entrega já está marcada.' : 'A entrega não está marcada.',
            }
            parar()
          }
          ent.set('entregue', marcar)
          ent.set('entregue_em', marcar ? agora : '')
          ent.set('entregue_por', marcar ? auth.id : '')
          tx.save(ent)
          hist(
            ent,
            marcar ? 'entregue' : 'entrega_desfeita',
            '',
            marcar ? agora.slice(0, 16) : '',
            {},
          )
        }
        if (acao === 'art' || acao === 'desfazer_art') {
          const marcar = acao === 'art'
          if (ent.getBool('art_entregue') === marcar) {
            falha = {
              status: 409,
              code: 'sem_mudanca',
              message: marcar ? 'A ART já está marcada.' : 'A ART não está marcada.',
            }
            parar()
          }
          ent.set('art_entregue', marcar)
          ent.set('art_em', marcar ? agora : '')
          ent.set('art_por', marcar ? auth.id : '')
          tx.save(ent)
          hist(
            ent,
            marcar ? 'art_entregue' : 'art_desfeita',
            '',
            marcar ? agora.slice(0, 16) : '',
            {},
          )
        }
        res = {
          status: 200,
          id: ent.id,
          versao: tx.findRecordById('entregas', ent.id).getString('updated'),
        }
      })
    } catch (err) {
      if (!falha) throw err
    }
    if (falha) {
      const st = falha.status
      delete falha.status
      return e.json(st, falha)
    }
    const st = res.status
    delete res.status
    return e.json(st, res)
  },
  $apis.requireAuth('users'),
)
