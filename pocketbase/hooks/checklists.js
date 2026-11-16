// SPEC-2-001 (T2.01/T2.02) — modelos de checklist configuráveis pela interface.
// Leitura: qualquer usuário logado. Criar/editar/publicar/arquivar: admin/diretor e coordenador;
// projetista e administrativo recebem 403 auditado.
// O rascunho fica no modelo; publicar grava uma versão imutável (checklist_versoes) com número,
// autor e horário. Só um modelo real vigente por disciplina + tipo + tipologia.
// Publicar um modelo real tira a vigência dos modelos de exemplo da mesma disciplina e tipo.

// ---------- leitura: lista de modelos ----------
routerAdd(
  'GET',
  '/backend/v1/checklists',
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
      )
        throw new UnauthorizedError('Sessão inválida ou expirada.')
    }
    const disc = {}
    const disciplinas = []
    for (const d of $app.findRecordsByFilter('disciplinas', "id != ''", 'nome', 0, 0)) {
      disc[d.id] = { id: d.id, nome: d.getString('nome'), sigla: d.getString('sigla') }
      if (d.getBool('ativa') !== false) disciplinas.push(disc[d.id])
    }
    const versoes = {}
    for (const v of $app.findRecordsByFilter('checklist_versoes', "id != ''", '', 0, 0)) {
      versoes[v.getString('modelo') + '#' + v.getInt('numero')] = v
    }
    const modelos = $app
      .findRecordsByFilter('checklist_modelos', "id != ''", '-updated', 0, 0)
      .map((m) => {
        const n = m.getInt('versao_atual')
        const v = versoes[m.id + '#' + n]
        let rasc = null
        try {
          rasc = JSON.parse(m.getString('rascunho') || 'null')
        } catch (_) {}
        const itensR = rasc && Array.isArray(rasc.itens) ? rasc.itens : []
        return {
          id: m.id,
          disciplina: disc[m.getString('disciplina')] || {
            id: m.getString('disciplina'),
            nome: '—',
            sigla: '',
          },
          tipo: m.getString('tipo'),
          tipologia: m.getString('tipologia'),
          estado: m.getString('estado'),
          exemplo: m.getBool('exemplo'),
          vigente: m.getBool('vigente'),
          versao_atual: n,
          tem_rascunho: m.getBool('tem_rascunho'),
          total_itens: v ? v.getInt('total_itens') : itensR.length,
          criticos: v
            ? v.getInt('criticos')
            : itensR.filter((i) => i && i.severidade === 'critico').length,
          updated: m.getString('updated'),
        }
      })
    const tipologias = []
    for (const p of $app.findRecordsByFilter('projetos', "tipologia != ''", '', 0, 0)) {
      const t = p.getString('tipologia').trim()
      if (t && tipologias.indexOf(t) < 0) tipologias.push(t)
    }
    tipologias.sort()
    return e.json(200, { modelos: modelos, disciplinas: disciplinas, tipologias: tipologias })
  },
  $apis.requireAuth(),
)

// ---------- leitura: um modelo com rascunho e versões ----------
routerAdd(
  'GET',
  '/backend/v1/checklists/{id}',
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
      )
        throw new UnauthorizedError('Sessão inválida ou expirada.')
    }
    let m
    try {
      m = $app.findRecordById('checklist_modelos', e.request.pathValue('id'))
    } catch (_) {
      throw new NotFoundError('Modelo não encontrado.')
    }
    const nomes = {}
    const pessoa = (uid) => {
      if (!uid) return null
      if (!nomes[uid]) {
        let nome = '—'
        try {
          const u = $app.findRecordById('users', uid)
          nome = u.getString('name') || u.getString('email').split('@')[0]
        } catch (_) {}
        nomes[uid] = { id: uid, nome: nome }
      }
      return nomes[uid]
    }
    let d = { id: m.getString('disciplina'), nome: '—', sigla: '' }
    try {
      const r = $app.findRecordById('disciplinas', m.getString('disciplina'))
      d = { id: r.id, nome: r.getString('nome'), sigla: r.getString('sigla') }
    } catch (_) {}
    let rasc = null
    try {
      rasc = JSON.parse(m.getString('rascunho') || 'null')
    } catch (_) {}
    const versoes = $app
      .findRecordsByFilter('checklist_versoes', 'modelo = {:m}', '-numero', 0, 0, { m: m.id })
      .map((v) => ({
        id: v.id,
        numero: v.getInt('numero'),
        itens: JSON.parse(v.getString('itens') || '[]'),
        total_itens: v.getInt('total_itens'),
        criticos: v.getInt('criticos'),
        nota: v.getString('nota'),
        republicada_de: v.getInt('republicada_de') || null,
        autor: pessoa(v.getString('autor')),
        created: v.getString('created'),
      }))
    const role = su ? 'admin' : auth.getString('role')
    return e.json(200, {
      id: m.id,
      disciplina: d,
      tipo: m.getString('tipo'),
      tipologia: m.getString('tipologia'),
      estado: m.getString('estado'),
      exemplo: m.getBool('exemplo'),
      vigente: m.getBool('vigente'),
      versao_atual: m.getInt('versao_atual'),
      tem_rascunho: m.getBool('tem_rascunho'),
      rascunho: rasc && Array.isArray(rasc.itens) ? rasc.itens : null,
      rascunho_origem: rasc && rasc.origem ? rasc.origem : null,
      rascunho_por: pessoa(m.getString('rascunho_por')),
      rascunho_em: m.getString('rascunho_em'),
      criado_por: pessoa(m.getString('criado_por')),
      versoes: versoes,
      updated: m.getString('updated'),
      pode_editar: role === 'admin' || role === 'coordenador',
    })
  },
  $apis.requireAuth(),
)

// ---------- criar modelo (novo ou duplicado) ----------
routerAdd(
  'POST',
  '/backend/v1/checklists',
  (e) => {
    const su = e.hasSuperuserAuth()
    const auth = e.auth
    const audit = (action, outcome, details) => {
      try {
        const a = new Record($app.findCollectionByNameOrId('auth_audit'))
        a.set('actor_id', su ? '' : auth.id)
        a.set('action', action)
        a.set('outcome', outcome)
        a.set('details', details)
        $app.save(a)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', action)
      }
    }
    if (!su) {
      const expira = auth ? auth.getString('session_expires_at') : ''
      if (
        !auth ||
        !auth.getBool('active') ||
        !expira ||
        new Date(expira.replace(' ', 'T')) <= new Date()
      )
        throw new UnauthorizedError('Sessão inválida ou expirada.')
      const role = auth.getString('role')
      if (role !== 'admin' && role !== 'coordenador') {
        audit('access.denied', 'blocked', { recurso: 'checklists', operacao: 'criar' })
        throw new ForbiddenError('Só administrador, diretor ou coordenador mantêm checklists.')
      }
    }
    const ruim = (campo, code, msg) => {
      const d = {}
      d[campo] = new ValidationError(code, msg)
      throw new BadRequestError(msg, d)
    }
    const body = e.requestInfo().body || {}
    const disciplina = typeof body.disciplina === 'string' ? body.disciplina : ''
    try {
      $app.findRecordById('disciplinas', disciplina)
    } catch (_) {
      ruim('disciplina', 'invalida', 'Escolha a disciplina.')
    }
    const tipo = body.tipo === 'entrada' || body.tipo === 'revisao' ? body.tipo : ''
    if (!tipo) ruim('tipo', 'invalido', 'Escolha o tipo: entrada ou revisão.')
    const tipologia = typeof body.tipologia === 'string' ? body.tipologia.trim().slice(0, 120) : ''

    // itens iniciais: duplicação de outro modelo (rascunho ou versão) ou nenhum
    let itens = []
    let duplicadoDe = ''
    const dup = body.duplicar_de && typeof body.duplicar_de === 'object' ? body.duplicar_de : null
    if (dup && typeof dup.modelo === 'string' && dup.modelo) {
      let origem
      try {
        origem = $app.findRecordById('checklist_modelos', dup.modelo)
      } catch (_) {
        ruim('duplicar_de', 'invalido', 'Modelo de origem não encontrado.')
      }
      duplicadoDe = origem.id
      const n = Number(dup.versao) || 0
      if (n > 0) {
        const vs = $app.findRecordsByFilter(
          'checklist_versoes',
          'modelo = {:m} && numero = {:n}',
          '',
          1,
          0,
          { m: origem.id, n: n },
        )
        if (vs.length === 0) ruim('duplicar_de', 'invalido', 'Versão de origem não encontrada.')
        itens = JSON.parse(vs[0].getString('itens') || '[]')
      } else {
        let r = null
        try {
          r = JSON.parse(origem.getString('rascunho') || 'null')
        } catch (_) {}
        if (r && Array.isArray(r.itens) && r.itens.length > 0) {
          itens = r.itens
        } else {
          const vs = $app.findRecordsByFilter(
            'checklist_versoes',
            'modelo = {:m} && numero = {:n}',
            '',
            1,
            0,
            { m: origem.id, n: origem.getInt('versao_atual') },
          )
          if (vs.length > 0) itens = JSON.parse(vs[0].getString('itens') || '[]')
        }
      }
    }
    // cópia limpa, com ids novos
    itens = itens.slice(0, 300).map((i) => ({
      id: $security.randomString(10),
      texto: String((i && i.texto) || '').slice(0, 500),
      grupo: String((i && i.grupo) || '').slice(0, 80),
      severidade: i && i.severidade === 'critico' ? 'critico' : 'normal',
      referencia: String((i && i.referencia) || '').slice(0, 200),
    }))

    const m = new Record($app.findCollectionByNameOrId('checklist_modelos'))
    m.set('disciplina', disciplina)
    m.set('tipo', tipo)
    m.set('tipologia', tipologia)
    m.set('estado', 'ativo')
    m.set('exemplo', false)
    m.set('vigente', false)
    m.set('versao_atual', 0)
    m.set('tem_rascunho', true)
    m.set('rascunho', { itens: itens, origem: null })
    m.set('rascunho_em', new Date().toISOString())
    if (!su) {
      m.set('rascunho_por', auth.id)
      m.set('criado_por', auth.id)
    }
    m.set('duplicado_de', duplicadoDe)
    $app.save(m)
    audit('checklist.criar', 'success', {
      modelo: m.id,
      disciplina: disciplina,
      tipo: tipo,
      tipologia: tipologia,
      duplicado_de: duplicadoDe,
      itens: itens.length,
    })
    return e.json(201, { id: m.id })
  },
  $apis.requireAuth(),
)

// ---------- ações sobre um modelo ----------
// rascunho | publicar | descartar | arquivar | reativar | usar_versao | tipologia
routerAdd(
  'POST',
  '/backend/v1/checklists/{id}/{acao}',
  (e) => {
    const su = e.hasSuperuserAuth()
    const auth = e.auth
    const acao = e.request.pathValue('acao')
    const audit = (action, outcome, details) => {
      try {
        const a = new Record($app.findCollectionByNameOrId('auth_audit'))
        a.set('actor_id', su ? '' : auth.id)
        a.set('action', action)
        a.set('outcome', outcome)
        a.set('details', details)
        $app.save(a)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', action)
      }
    }
    if (!su) {
      const expira = auth ? auth.getString('session_expires_at') : ''
      if (
        !auth ||
        !auth.getBool('active') ||
        !expira ||
        new Date(expira.replace(' ', 'T')) <= new Date()
      )
        throw new UnauthorizedError('Sessão inválida ou expirada.')
      const role = auth.getString('role')
      if (role !== 'admin' && role !== 'coordenador') {
        audit('access.denied', 'blocked', {
          recurso: 'checklists',
          operacao: String(acao).slice(0, 20),
          modelo: e.request.pathValue('id'),
        })
        throw new ForbiddenError('Só administrador, diretor ou coordenador mantêm checklists.')
      }
    }
    const ACOES = [
      'rascunho',
      'publicar',
      'descartar',
      'arquivar',
      'reativar',
      'usar_versao',
      'tipologia',
    ]
    if (ACOES.indexOf(acao) < 0) throw new NotFoundError('Ação desconhecida.')
    const ruim = (campo, code, msg) => {
      const d = {}
      d[campo] = new ValidationError(code, msg)
      throw new BadRequestError(msg, d)
    }
    const conflito = (code, message) => e.json(409, { code: code, message: message })
    const body = e.requestInfo().body || {}
    let m
    try {
      m = $app.findRecordById('checklist_modelos', e.request.pathValue('id'))
    } catch (_) {
      throw new NotFoundError('Modelo não encontrado.')
    }
    // edição concorrente: quem salva sobre uma versão desatualizada do modelo recebe 409
    if (['rascunho', 'publicar', 'descartar', 'tipologia', 'usar_versao'].indexOf(acao) >= 0) {
      if (typeof body.base !== 'string' || body.base !== m.getString('updated')) {
        return conflito(
          'conflito_edicao',
          'Este modelo foi alterado por outra pessoa depois que você abriu. Recarregue e refaça a alteração.',
        )
      }
    }
    const nomeDisc = () => {
      try {
        return $app.findRecordById('disciplinas', m.getString('disciplina')).getString('nome')
      } catch (_) {
        return 'a disciplina'
      }
    }
    const rotuloTipo = m.getString('tipo') === 'entrada' ? 'entrada' : 'revisão'
    // outro modelo real vigente com a mesma disciplina, tipo e tipologia (exceto este)
    const outroVigente = (tx, tipologia) =>
      tx.findRecordsByFilter(
        'checklist_modelos',
        'id != {:id} && disciplina = {:d} && tipo = {:t} && tipologia = {:tp} && vigente = true && exemplo = false',
        '',
        1,
        0,
        { id: m.id, d: m.getString('disciplina'), t: m.getString('tipo'), tp: tipologia },
      )
    const msgDup = (tipologia) =>
      'Já existe um checklist de ' +
      rotuloTipo +
      ' vigente para ' +
      nomeDisc() +
      (tipologia ? ' na tipologia "' + tipologia + '"' : ' sem tipologia') +
      '. Arquive o outro modelo ou ajuste a tipologia deste.'
    const limpar = (lista, estrito) => {
      if (!Array.isArray(lista)) ruim('itens', 'invalido', 'Lista de itens inválida.')
      if (lista.length > 300)
        ruim('itens', 'muitos_itens', 'Um checklist pode ter no máximo 300 itens.')
      const vistos = {}
      return lista.map((x, i) => {
        const texto = x && typeof x.texto === 'string' ? x.texto.trim() : ''
        if (estrito && !texto)
          ruim(
            'itens',
            'item_vazio',
            'O item ' + (i + 1) + ' está sem texto. Preencha ou remova antes de publicar.',
          )
        if (texto.length > 500)
          ruim('itens', 'item_longo', 'O item ' + (i + 1) + ' passa de 500 caracteres.')
        let id = x && typeof x.id === 'string' && /^[A-Za-z0-9_-]{1,20}$/.test(x.id) ? x.id : ''
        if (!id || vistos[id]) id = $security.randomString(10)
        vistos[id] = true
        return {
          id: id,
          texto: texto,
          grupo: x && typeof x.grupo === 'string' ? x.grupo.trim().slice(0, 80) : '',
          severidade: x && x.severidade === 'critico' ? 'critico' : 'normal',
          referencia:
            x && typeof x.referencia === 'string' ? x.referencia.trim().slice(0, 200) : '',
        }
      })
    }
    const rascAtual = () => {
      try {
        const r = JSON.parse(m.getString('rascunho') || 'null')
        return r && Array.isArray(r.itens) ? r : null
      } catch (_) {
        return null
      }
    }
    const marcarRascunho = (rec, itens, origem) => {
      rec.set('rascunho', { itens: itens, origem: origem || null })
      rec.set('tem_rascunho', true)
      rec.set('rascunho_em', new Date().toISOString())
      if (!su) rec.set('rascunho_por', auth.id)
    }

    if (acao === 'rascunho') {
      if (m.getString('estado') !== 'ativo')
        ruim('estado', 'arquivado', 'Reative o modelo para editar.')
      const r = rascAtual()
      marcarRascunho(m, limpar(body.itens, false), r ? r.origem : null)
      $app.save(m)
      return e.json(200, { ok: true, updated: m.getString('updated') })
    }

    if (acao === 'descartar') {
      m.set('rascunho', null)
      m.set('tem_rascunho', false)
      $app.save(m)
      audit('checklist.descartar_rascunho', 'success', { modelo: m.id })
      return e.json(200, { ok: true, updated: m.getString('updated') })
    }

    if (acao === 'usar_versao') {
      if (m.getString('estado') !== 'ativo')
        ruim('estado', 'arquivado', 'Reative o modelo para editar.')
      const n = Number(body.numero) || 0
      const vs = $app.findRecordsByFilter(
        'checklist_versoes',
        'modelo = {:m} && numero = {:n}',
        '',
        1,
        0,
        {
          m: m.id,
          n: n,
        },
      )
      if (vs.length === 0) ruim('numero', 'invalido', 'Versão não encontrada.')
      marcarRascunho(m, JSON.parse(vs[0].getString('itens') || '[]'), n)
      $app.save(m)
      return e.json(200, { ok: true, updated: m.getString('updated') })
    }

    if (acao === 'tipologia') {
      const tp = typeof body.tipologia === 'string' ? body.tipologia.trim().slice(0, 120) : ''
      if (m.getBool('vigente') && !m.getBool('exemplo') && outroVigente($app, tp).length > 0) {
        return conflito('vigencia_duplicada', msgDup(tp))
      }
      const antes = m.getString('tipologia')
      m.set('tipologia', tp)
      try {
        $app.save(m)
      } catch (err) {
        return conflito('vigencia_duplicada', msgDup(tp))
      }
      audit('checklist.tipologia', 'success', { modelo: m.id, de: antes, para: tp })
      return e.json(200, { ok: true, updated: m.getString('updated') })
    }

    if (acao === 'arquivar') {
      if (m.getString('estado') === 'arquivado')
        return e.json(200, { ok: true, updated: m.getString('updated') })
      m.set('estado', 'arquivado')
      m.set('vigente', false)
      $app.save(m)
      audit('checklist.arquivar', 'success', { modelo: m.id, versao: m.getInt('versao_atual') })
      return e.json(200, { ok: true, updated: m.getString('updated') })
    }

    if (acao === 'reativar') {
      if (m.getString('estado') === 'ativo')
        return e.json(200, { ok: true, updated: m.getString('updated') })
      let vigente = m.getInt('versao_atual') > 0
      if (
        vigente &&
        !m.getBool('exemplo') &&
        outroVigente($app, m.getString('tipologia')).length > 0
      ) {
        return conflito('vigencia_duplicada', msgDup(m.getString('tipologia')))
      }
      if (vigente && m.getBool('exemplo')) {
        // exemplo só volta a valer se não houver modelo real vigente para a disciplina e tipo
        const reais = $app.findRecordsByFilter(
          'checklist_modelos',
          'disciplina = {:d} && tipo = {:t} && vigente = true && exemplo = false',
          '',
          1,
          0,
          { d: m.getString('disciplina'), t: m.getString('tipo') },
        )
        if (reais.length > 0) vigente = false
      }
      m.set('estado', 'ativo')
      m.set('vigente', vigente)
      try {
        $app.save(m)
      } catch (err) {
        return conflito('vigencia_duplicada', msgDup(m.getString('tipologia')))
      }
      audit('checklist.reativar', 'success', { modelo: m.id, vigente: vigente })
      return e.json(200, { ok: true, updated: m.getString('updated') })
    }

    // ---------- publicar ----------
    if (m.getString('estado') !== 'ativo')
      ruim('estado', 'arquivado', 'Reative o modelo para publicar.')
    const r = rascAtual()
    if (!m.getBool('tem_rascunho') || !r)
      ruim('itens', 'sem_rascunho', 'Não há rascunho para publicar.')
    const itens = limpar(Array.isArray(body.itens) ? body.itens : r.itens, true)
    if (itens.length === 0)
      ruim('itens', 'sem_itens', 'Inclua pelo menos um item antes de publicar.')
    const nota = typeof body.nota === 'string' ? body.nota.trim().slice(0, 500) : ''
    let situacao = 'ok'
    let numero = 0
    let exemplosDesligados = []
    try {
      $app.runInTransaction((tx) => {
        const mm = tx.findRecordById('checklist_modelos', m.id)
        if (mm.getString('updated') !== m.getString('updated')) {
          situacao = 'conflito'
          return
        }
        if (outroVigente(tx, mm.getString('tipologia')).length > 0) {
          situacao = 'vigencia'
          return
        }
        numero = mm.getInt('versao_atual') + 1
        const v = new Record(tx.findCollectionByNameOrId('checklist_versoes'))
        v.set('modelo', mm.id)
        v.set('numero', numero)
        v.set('itens', itens)
        v.set('total_itens', itens.length)
        v.set('criticos', itens.filter((i) => i.severidade === 'critico').length)
        v.set('nota', nota)
        if (r.origem) v.set('republicada_de', Number(r.origem) || 0)
        if (!su) v.set('autor', auth.id)
        tx.save(v)
        // publicado por uma pessoa: passa a ser o checklist real (deixa de ser exemplo)
        mm.set('exemplo', false)
        mm.set('vigente', true)
        mm.set('versao_atual', numero)
        mm.set('rascunho', null)
        mm.set('tem_rascunho', false)
        tx.save(mm)
        for (const x of tx.findRecordsByFilter(
          'checklist_modelos',
          'id != {:id} && disciplina = {:d} && tipo = {:t} && exemplo = true && vigente = true',
          '',
          0,
          0,
          { id: mm.id, d: mm.getString('disciplina'), t: mm.getString('tipo') },
        )) {
          x.set('vigente', false)
          tx.save(x)
          exemplosDesligados.push(x.id)
        }
      })
    } catch (err) {
      // corrida entre duas publicações: o índice único de vigência ou de número barra a segunda
      situacao = 'vigencia'
    }
    if (situacao === 'conflito') {
      return conflito(
        'conflito_edicao',
        'Este modelo foi alterado por outra pessoa depois que você abriu. Recarregue e refaça a alteração.',
      )
    }
    if (situacao === 'vigencia')
      return conflito('vigencia_duplicada', msgDup(m.getString('tipologia')))
    audit('checklist.publicar', 'success', {
      modelo: m.id,
      versao: numero,
      itens: itens.length,
      republicada_de: r.origem || null,
      exemplos_desligados: exemplosDesligados,
    })
    return e.json(200, { ok: true, numero: numero })
  },
  $apis.requireAuth(),
)
