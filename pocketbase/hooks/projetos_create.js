// SPEC-1-002 — criação de projeto (T1.08, T1.09, T1.10).
// Valida campos mínimos, cria cliente/projeto/disciplinas numa única transação,
// alerta possível duplicidade antes de salvar (409) e registra o histórico.
// Só administrador ou coordenador (como coordenador do próprio projeto) cria.
// Emenda 13/10: aceita disciplina personalizada por nome livre.
routerAdd(
  'POST',
  '/backend/v1/projetos',
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
    const papel = auth.getString('role')
    const negar = (motivo) => {
      try {
        const a = new Record($app.findCollectionByNameOrId('auth_audit'))
        a.set('actor_id', auth.id)
        a.set('action', 'access.denied')
        a.set('outcome', 'blocked')
        a.set('details', { recurso: 'projetos', operacao: 'create', motivo: motivo })
        $app.save(a)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Acesso negado.')
    }
    if (papel !== 'admin' && papel !== 'coordenador') negar('papel')

    const body = e.requestInfo().body || {}
    const erros = {}
    const erro = (campo, codigo, msg) => {
      if (!erros[campo]) erros[campo] = new ValidationError(codigo, msg)
    }
    const texto = (campo, max, rotulo) => {
      const v = typeof body[campo] === 'string' ? body[campo].trim() : ''
      if (!v) erro(campo, 'obrigatorio', 'Informe ' + rotulo + '.')
      else if (v.length > max) erro(campo, 'muito_longo', rotulo + ' muito longo.')
      return v
    }
    const norm = (v) => {
      let s = String(v || '').toLowerCase()
      try {
        s = s.normalize('NFD').replace(/[̀-ͯ]/g, '')
      } catch (_) {}
      return s.replace(/[^a-z0-9]+/g, ' ').trim()
    }
    const validarLink = (valor) => {
      if (valor === undefined || valor === null) return null
      const s = String(valor).trim()
      if (s === '') return null
      if (s.length > 2000) return 'Link muito longo.'
      if (/[\s\\<>"]/.test(s)) return 'O link tem caracteres inválidos.'
      const m = /^https:\/\/([^\/?#]+)(?:[\/?#].*)?$/.exec(s)
      if (!m) return 'Use um link que comece com https://.'
      const autoridade = m[1]
      if (autoridade.indexOf('@') >= 0) return 'O link não pode conter usuário ou senha.'
      if (autoridade.charAt(0) === '[') return 'Use um endereço com nome de domínio, não um IP.'
      const pm = /^([^:]*)(?::(\d+))?$/.exec(autoridade)
      if (!pm) return 'Endereço inválido.'
      if (pm[2] && pm[2] !== '443') return 'Use a porta padrão do HTTPS.'
      const host = pm[1].toLowerCase()
      if (
        !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(
          host,
        )
      ) {
        return 'Use um endereço com nome de domínio válido (não IP nem nome interno).'
      }
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

    const nome = texto('nome', 200, 'o nome do projeto')
    const local = texto('local', 300, 'o local')
    const tipologia = texto('tipologia', 120, 'a tipologia')

    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
    const prazoTxt = typeof body.prazo === 'string' ? body.prazo.trim().slice(0, 10) : ''
    if (!prazoTxt) erro('prazo', 'obrigatorio', 'Informe o prazo.')
    else if (
      !/^\d{4}-\d{2}-\d{2}$/.test(prazoTxt) ||
      new Date(prazoTxt + 'T12:00:00Z').toISOString().slice(0, 10) !== prazoTxt
    ) {
      erro('prazo', 'invalido', 'Prazo inválido.')
    } else if (prazoTxt < hoje) erro('prazo', 'passado', 'O prazo não pode estar no passado.')

    const prioridade =
      body.prioridade === undefined || body.prioridade === '' ? 'Normal' : body.prioridade
    if (['Baixa', 'Normal', 'Alta', 'Urgente'].indexOf(prioridade) < 0)
      erro('prioridade', 'invalida', 'Prioridade inválida.')

    const linkErro = validarLink(body.link_entrada)
    if (linkErro) erro('link_entrada', 'link_inseguro', linkErro)
    const link = body.link_entrada ? String(body.link_entrada).trim() : ''

    // Coordenador do projeto
    let coordId = auth.id
    if (papel === 'coordenador') {
      if (body.coordenador && body.coordenador !== auth.id) negar('coordenador_de_outro')
    } else if (body.coordenador) {
      coordId = String(body.coordenador)
    }
    let coordRec = null
    try {
      coordRec = $app.findRecordById('users', coordId)
    } catch (_) {}
    if (
      !coordRec ||
      !coordRec.getBool('active') ||
      ['admin', 'coordenador'].indexOf(coordRec.getString('role')) < 0
    ) {
      erro('coordenador', 'invalido', 'Escolha um coordenador ativo.')
    }

    // Cliente: existente (no escopo do usuário) ou novo pelo nome
    const info = e.requestInfo()
    const colClientes = $app.findCollectionByNameOrId('clientes')
    let clienteId = ''
    let clienteNome = ''
    if (body.cliente) {
      let c = null
      try {
        c = $app.findRecordById('clientes', String(body.cliente))
      } catch (_) {}
      if (!c || (papel !== 'admin' && !$app.canAccessRecord(c, info, colClientes.viewRule))) {
        erro('cliente', 'invalido', 'Cliente não encontrado.')
      } else clienteId = c.id
    } else {
      clienteNome = typeof body.cliente_nome === 'string' ? body.cliente_nome.trim() : ''
      if (!clienteNome) erro('cliente', 'obrigatorio', 'Informe o cliente.')
      else if (clienteNome.length > 200)
        erro('cliente', 'muito_longo', 'Nome do cliente muito longo.')
    }

    // Disciplinas: ao menos uma, sem repetição, com responsável próprio ou herdado
    const lista = Array.isArray(body.disciplinas) ? body.disciplinas : []
    const disciplinas = []
    if (lista.length === 0) erro('disciplinas', 'obrigatorio', 'Inclua ao menos uma disciplina.')
    else if (lista.length > 20) erro('disciplinas', 'demais', 'Máximo de 20 disciplinas.')
    const vistas = {}
    const catalogo = $app.findRecordsByFilter('disciplinas', "id != ''", 'nome', 0, 0)
    for (let i = 0; i < lista.length && i < 20; i++) {
      const item = lista[i] || {}
      // Disciplina do catálogo (id) ou personalizada (nome livre)
      let d = null
      let novoNome = ''
      if (item.disciplina) {
        try {
          d = $app.findRecordById('disciplinas', String(item.disciplina))
        } catch (_) {}
        if (!d || !d.getBool('ativa')) {
          erro('disciplinas', 'invalida', 'Disciplina inválida.')
          continue
        }
      } else {
        const livre =
          typeof item.disciplina_nome === 'string'
            ? item.disciplina_nome.trim().replace(/\s+/g, ' ')
            : ''
        if (livre.length < 2) {
          erro(
            'disciplinas',
            'invalida',
            'Escolha uma disciplina ou digite o nome da disciplina personalizada.',
          )
          continue
        }
        if (livre.length > 80) {
          erro('disciplinas', 'muito_longo', 'Nome de disciplina muito longo (máximo 80).')
          continue
        }
        for (const c of catalogo) {
          if (norm(c.getString('nome')) === norm(livre)) {
            d = c
            break
          }
        }
        if (!d) novoNome = livre
      }
      const chave = d ? d.id : 'novo:' + norm(novoNome)
      const rotulo = d ? d.getString('nome') : novoNome
      if (vistas[chave]) {
        erro('disciplinas', 'repetida', 'A disciplina ' + rotulo + ' aparece mais de uma vez.')
        continue
      }
      vistas[chave] = true
      let resp = item.responsavel ? String(item.responsavel) : ''
      if (resp) {
        let u = null
        try {
          u = $app.findRecordById('users', resp)
        } catch (_) {}
        if (!u || !u.getBool('active')) {
          erro('disciplinas', 'responsavel_invalido', 'Responsável inválido em ' + rotulo + '.')
          continue
        }
      }
      disciplinas.push({ id: d ? d.id : '', novoNome: novoNome, responsavel: resp })
    }

    if (Object.keys(erros).length > 0) {
      throw new BadRequestError('Revise os campos destacados.', erros)
    }

    // Gravação atômica com checagem de duplicidade dentro da transação
    const confirmar = body.confirmar_duplicidade === true
    let similares = []
    let novoId = ''
    $app.runInTransaction((tx) => {
      let cid = clienteId
      if (!cid) {
        const achados = tx.findRecordsByFilter('clientes', 'nome ~ {:n}', '', 50, 0, {
          n: clienteNome,
        })
        for (const c of achados) {
          if (norm(c.getString('nome')) === norm(clienteNome)) {
            cid = c.id
            break
          }
        }
      }
      if (cid && !confirmar) {
        const candidatos = tx.findRecordsByFilter(
          'projetos',
          'cliente = {:c} && arquivado != true',
          'created',
          0,
          0,
          { c: cid },
        )
        similares = candidatos.filter(
          (p) =>
            norm(p.getString('tipologia')) === norm(tipologia) &&
            (norm(p.getString('local')) === norm(local) ||
              norm(p.getString('nome')) === norm(nome)),
        )
        if (similares.length > 0) return
      }
      if (!cid) {
        const c = new Record(tx.findCollectionByNameOrId('clientes'))
        c.set('nome', clienteNome)
        tx.save(c)
        cid = c.id
      }
      const membros = []
      for (const d of disciplinas) {
        if (d.responsavel && d.responsavel !== coordId && membros.indexOf(d.responsavel) < 0)
          membros.push(d.responsavel)
      }
      const p = new Record(tx.findCollectionByNameOrId('projetos'))
      p.set('nome', nome)
      p.set('cliente', cid)
      p.set('local', local)
      p.set('tipologia', tipologia)
      p.set('prazo', prazoTxt + ' 12:00:00.000Z')
      p.set('prioridade', prioridade)
      p.set('link_entrada', link)
      p.set('coordenador', coordId)
      p.set('membros', membros)
      p.set('arquivado', false)
      tx.save(p)
      // Disciplinas personalizadas entram no catálogo (reaproveitadas depois pelo nome)
      const colDisc = tx.findCollectionByNameOrId('disciplinas')
      for (const d of disciplinas) {
        if (d.id) continue
        const existentes = tx.findRecordsByFilter('disciplinas', "id != ''", '', 0, 0)
        for (const c of existentes) {
          if (norm(c.getString('nome')) === norm(d.novoNome)) {
            d.id = c.id
            break
          }
        }
        if (!d.id) {
          const nd = new Record(colDisc)
          nd.set('nome', d.novoNome)
          nd.set('ativa', true)
          nd.set('personalizada', true)
          nd.set('criada_por', auth.id)
          tx.save(nd)
          d.id = nd.id
        }
      }
      const colPD = tx.findCollectionByNameOrId('projeto_disciplinas')
      for (const d of disciplinas) {
        const r = new Record(colPD)
        r.set('projeto', p.id)
        r.set('disciplina', d.id)
        r.set('responsavel', d.responsavel || coordId)
        r.set('responsavel_herdado', !d.responsavel)
        tx.save(r)
      }
      const h = new Record(tx.findCollectionByNameOrId('projeto_historico'))
      h.set('projeto', p.id)
      h.set('autor', auth.id)
      h.set('acao', 'criado')
      h.set('detalhes', {
        disciplinas: disciplinas.length,
        duplicidade_confirmada: confirmar,
      })
      tx.save(h)
      novoId = p.id
    })

    if (!novoId) {
      const colProj = $app.findCollectionByNameOrId('projetos')
      return e.json(409, {
        code: 'possivel_duplicidade',
        message:
          'Já existe projeto semelhante (mesmo cliente e tipologia, com mesmo local ou nome).',
        similares: similares.map((p) =>
          $app.canAccessRecord(p, info, colProj.viewRule)
            ? { id: p.id, nome: p.getString('nome'), local: p.getString('local'), visivel: true }
            : { visivel: false },
        ),
      })
    }
    return e.json(201, { id: novoId })
  },
  $apis.requireAuth('users'),
)
