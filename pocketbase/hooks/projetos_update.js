// SPEC-1-002 — edição de projeto (T1.09, T1.10).
// Exige a versão lida (campo "versao" = updated) e recusa com 409 se outro
// usuário salvou antes; recusa projeto arquivado; registra antes/depois, autor
// e horário de cada campo alterado. Só administrador ou o coordenador do projeto.
routerAdd(
  'PATCH',
  '/backend/v1/projetos/{id}',
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
    const id = e.request.pathValue('id')
    const negar = (motivo) => {
      try {
        const a = new Record($app.findCollectionByNameOrId('auth_audit'))
        a.set('actor_id', auth.id)
        a.set('action', 'access.denied')
        a.set('outcome', 'blocked')
        a.set('details', {
          recurso: 'projetos',
          operacao: 'update',
          id: String(id).slice(0, 32),
          motivo: motivo,
        })
        $app.save(a)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Acesso negado.')
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

    let projeto = null
    try {
      projeto = $app.findRecordById('projetos', id)
    } catch (_) {}
    if (!projeto) negar('inexistente')
    const info = e.requestInfo()
    const colProj = $app.findCollectionByNameOrId('projetos')
    if (!$app.canAccessRecord(projeto, info, colProj.viewRule)) negar('sem_vinculo')
    const ehCoordenador = papel === 'coordenador' && projeto.getString('coordenador') === auth.id
    if (papel !== 'admin' && !ehCoordenador) negar('sem_permissao_edicao')

    const body = info.body || {}
    if (
      body.coordenador !== undefined &&
      papel !== 'admin' &&
      body.coordenador !== projeto.getString('coordenador')
    ) {
      negar('troca_de_coordenador')
    }
    if (
      body.cliente !== undefined &&
      papel !== 'admin' &&
      body.cliente !== projeto.getString('cliente')
    ) {
      negar('troca_de_cliente')
    }

    const erros = {}
    const erro = (campo, codigo, msg) => {
      if (!erros[campo]) erros[campo] = new ValidationError(codigo, msg)
    }
    const novos = {}
    const textos = [
      ['nome', 200, 'o nome do projeto'],
      ['local', 300, 'o local'],
      ['tipologia', 120, 'a tipologia'],
    ]
    for (const t of textos) {
      if (body[t[0]] === undefined) continue
      const v = typeof body[t[0]] === 'string' ? body[t[0]].trim() : ''
      if (!v) erro(t[0], 'obrigatorio', 'Informe ' + t[2] + '.')
      else if (v.length > t[1]) erro(t[0], 'muito_longo', 'Texto muito longo.')
      else novos[t[0]] = v
    }
    if (body.prazo !== undefined) {
      const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
      const s = typeof body.prazo === 'string' ? body.prazo.trim().slice(0, 10) : ''
      if (!s) erro('prazo', 'obrigatorio', 'Informe o prazo.')
      else if (
        !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
        new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) !== s
      ) {
        erro('prazo', 'invalido', 'Prazo inválido.')
      } else if (s !== projeto.getString('prazo').slice(0, 10) && s < hoje) {
        erro('prazo', 'passado', 'O prazo não pode estar no passado.')
      } else novos.prazo = s + ' 12:00:00.000Z'
    }
    if (body.prioridade !== undefined) {
      if (['Baixa', 'Normal', 'Alta', 'Urgente'].indexOf(body.prioridade) < 0)
        erro('prioridade', 'invalida', 'Prioridade inválida.')
      else novos.prioridade = body.prioridade
    }
    if (body.link_entrada !== undefined) {
      const le = validarLink(body.link_entrada)
      if (le) erro('link_entrada', 'link_inseguro', le)
      else novos.link_entrada = body.link_entrada ? String(body.link_entrada).trim() : ''
    }
    if (body.coordenador !== undefined && papel === 'admin') {
      let u = null
      try {
        u = $app.findRecordById('users', String(body.coordenador))
      } catch (_) {}
      if (!u || !u.getBool('active') || ['admin', 'coordenador'].indexOf(u.getString('role')) < 0) {
        erro('coordenador', 'invalido', 'Escolha um coordenador ativo.')
      } else novos.coordenador = u.id
    }
    if (body.cliente !== undefined && papel === 'admin') {
      let c = null
      try {
        c = $app.findRecordById('clientes', String(body.cliente))
      } catch (_) {}
      if (!c) erro('cliente', 'invalido', 'Cliente não encontrado.')
      else novos.cliente = c.id
    }
    if (typeof body.versao !== 'string' || !body.versao)
      erro('versao', 'obrigatorio', 'Versão do registro ausente.')
    if (Object.keys(erros).length > 0)
      throw new BadRequestError('Revise os campos destacados.', erros)

    const nomeDe = (tx, col, rid, campo) => {
      if (!rid) return ''
      try {
        const r = tx.findRecordById(col, rid)
        return r.getString(campo) || rid
      } catch (_) {
        return rid
      }
    }

    let situacao = 'ok'
    let versao = ''
    $app.runInTransaction((tx) => {
      const p = tx.findRecordById('projetos', id)
      if (p.getBool('arquivado')) {
        situacao = 'arquivado'
        return
      }
      if (p.getString('updated') !== body.versao) {
        situacao = 'conflito'
        return
      }
      const colH = tx.findCollectionByNameOrId('projeto_historico')
      let mudou = false
      for (const campo of Object.keys(novos)) {
        const antesBruto = p.getString(campo)
        const depoisBruto = novos[campo]
        if (antesBruto === depoisBruto) continue
        let antes = antesBruto
        let depois = depoisBruto
        if (campo === 'prazo') {
          antes = antesBruto.slice(0, 10)
          depois = depoisBruto.slice(0, 10)
        } else if (campo === 'coordenador') {
          antes = nomeDe(tx, 'users', antesBruto, 'name')
          depois = nomeDe(tx, 'users', depoisBruto, 'name')
        } else if (campo === 'cliente') {
          antes = nomeDe(tx, 'clientes', antesBruto, 'nome')
          depois = nomeDe(tx, 'clientes', depoisBruto, 'nome')
        }
        p.set(campo, depoisBruto)
        const h = new Record(colH)
        h.set('projeto', p.id)
        h.set('autor', auth.id)
        h.set('acao', 'editado')
        h.set('campo', campo)
        h.set('antes', antes)
        h.set('depois', depois)
        tx.save(h)
        mudou = true
      }
      if (mudou) tx.save(p)
      versao = p.getString('updated')
    })

    if (situacao === 'arquivado') {
      return e.json(409, {
        code: 'projeto_arquivado',
        message: 'Projeto arquivado não pode ser editado. Restaure-o antes.',
      })
    }
    if (situacao === 'conflito') {
      return e.json(409, {
        code: 'conflito_edicao',
        message:
          'Outra pessoa alterou este projeto depois que você abriu. Recarregue e refaça a alteração.',
      })
    }
    return e.json(200, { id: id, versao: versao })
  },
  $apis.requireAuth('users'),
)
