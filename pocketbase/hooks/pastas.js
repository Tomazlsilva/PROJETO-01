// SPEC-2-006 (T2.18) — modelo de pastas padrão: consulta, publicação de versão e simulação.
// Só administrador/diretor (403 auditado para os demais). Variáveis: {cliente}, {local},
// {projeto}, {disciplina}. Caracteres que o OneDrive não aceita viram "-"; variável vazia
// tira o trecho do caminho. Linhas de subpasta com {disciplina} se repetem por disciplina.
// A criação real no OneDrive fica para quando o Microsoft 365 liberar o acesso (T2.17).

// ---------- consulta ----------
routerAdd(
  'GET',
  '/backend/v1/pastas',
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
      if (auth.getString('role') !== 'admin') {
        try {
          const a = new Record($app.findCollectionByNameOrId('auth_audit'))
          a.set('actor_id', auth.id)
          a.set('action', 'access.denied')
          a.set('outcome', 'blocked')
          a.set('details', { recurso: 'pastas', operacao: 'ver' })
          $app.save(a)
        } catch (err) {
          $app.logger().error('auditoria falhou', 'action', 'access.denied')
        }
        throw new ForbiddenError('Só o administrador ou o diretor mantêm o modelo de pastas.')
      }
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
    const versoes = $app
      .findRecordsByFilter('pastas_modelos', "id != ''", '-numero', 100, 0)
      .map((v) => ({
        id: v.id,
        numero: v.getInt('numero'),
        caminho_projeto: v.getString('caminho_projeto'),
        subpastas: JSON.parse(v.getString('subpastas') || '[]'),
        motivo: v.getString('motivo'),
        autor: pessoa(v.getString('autor')),
        created: v.getString('created'),
      }))
    const cfg = $app.findRecordsByFilter('pastas_config', "id != ''", '-created', 1, 0)
    const projetos = $app
      .findRecordsByFilter('projetos', 'arquivado = false', 'nome', 0, 0)
      .map((p) => ({ id: p.id, nome: p.getString('nome') }))
    return e.json(200, {
      vigente: versoes.length ? versoes[0] : null,
      versoes: versoes,
      config: cfg.length
        ? {
            criacao_automatica: cfg[0].getBool('criacao_automatica'),
            pasta_raiz: cfg[0].getString('pasta_raiz'),
            acesso_liberado: cfg[0].getBool('acesso_liberado'),
          }
        : { criacao_automatica: false, pasta_raiz: '', acesso_liberado: false },
      projetos: projetos,
    })
  },
  $apis.requireAuth(),
)

// ---------- publicar versão / simular árvore ----------
routerAdd(
  'POST',
  '/backend/v1/pastas/{acao}',
  (e) => {
    const su = e.hasSuperuserAuth()
    const auth = e.auth
    const acao = e.request.pathValue('acao')
    if (!su) {
      const expira = auth ? auth.getString('session_expires_at') : ''
      if (
        !auth ||
        !auth.getBool('active') ||
        !expira ||
        new Date(expira.replace(' ', 'T')) <= new Date()
      )
        throw new UnauthorizedError('Sessão inválida ou expirada.')
      if (auth.getString('role') !== 'admin') {
        try {
          const a = new Record($app.findCollectionByNameOrId('auth_audit'))
          a.set('actor_id', auth.id)
          a.set('action', 'access.denied')
          a.set('outcome', 'blocked')
          a.set('details', { recurso: 'pastas', operacao: String(acao).slice(0, 20) })
          $app.save(a)
        } catch (err) {
          $app.logger().error('auditoria falhou', 'action', 'access.denied')
        }
        throw new ForbiddenError('Só o administrador ou o diretor mantêm o modelo de pastas.')
      }
    }
    if (acao !== 'publicar' && acao !== 'simular') throw new NotFoundError('Ação desconhecida.')
    const body = e.requestInfo().body || {}
    const ruim = (campo, msg) => {
      const d = {}
      d[campo] = new ValidationError('invalido', msg)
      throw new BadRequestError(msg, d)
    }
    const VARS = ['cliente', 'local', 'projeto', 'disciplina']
    const validar = (caminho, subpastas) => {
      const cp = typeof caminho === 'string' ? caminho.trim().replace(/^\/+|\/+$/g, '') : ''
      if (!cp)
        ruim(
          'caminho_projeto',
          'Informe o caminho da pasta do projeto (ex.: {cliente}/{local}/{projeto}).',
        )
      if (cp.length > 500) ruim('caminho_projeto', 'Caminho muito longo.')
      if (cp.indexOf('{projeto}') < 0)
        ruim(
          'caminho_projeto',
          'O caminho precisa ter {projeto}, para cada projeto ter a sua pasta.',
        )
      if (cp.indexOf('{disciplina}') >= 0)
        ruim('caminho_projeto', 'Use {disciplina} nas subpastas, não no caminho do projeto.')
      const lista = Array.isArray(subpastas) ? subpastas : []
      if (lista.length > 100) ruim('subpastas', 'No máximo 100 linhas de subpastas.')
      const linhas = []
      for (const l of lista) {
        const s = String(l || '')
          .trim()
          .replace(/^\/+|\/+$/g, '')
        if (!s) continue
        if (s.length > 300) ruim('subpastas', 'Linha de subpasta muito longa.')
        if (s.indexOf('..') >= 0) ruim('subpastas', 'Use só nomes de pastas, sem "..".')
        if (linhas.indexOf(s) < 0) linhas.push(s)
      }
      for (const t of (cp + '/' + linhas.join('/')).match(/\{[^}]*\}/g) || []) {
        if (VARS.indexOf(t.slice(1, -1)) < 0)
          ruim(
            'caminho_projeto',
            'Variável desconhecida: ' + t + '. Use {cliente}, {local}, {projeto} ou {disciplina}.',
          )
      }
      return { caminho: cp, subpastas: linhas }
    }

    if (acao === 'publicar') {
      const m = validar(body.caminho_projeto, body.subpastas)
      const motivo = typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 500) : ''
      let numero = 0
      try {
        $app.runInTransaction((tx) => {
          const ult = tx.findRecordsByFilter('pastas_modelos', "id != ''", '-numero', 1, 0)
          numero = ult.length ? ult[0].getInt('numero') + 1 : 1
          const r = new Record(tx.findCollectionByNameOrId('pastas_modelos'))
          r.set('numero', numero)
          r.set('caminho_projeto', m.caminho)
          r.set('subpastas', m.subpastas)
          r.set('motivo', motivo)
          if (!su) r.set('autor', auth.id)
          tx.save(r)
          const a = new Record(tx.findCollectionByNameOrId('auth_audit'))
          a.set('actor_id', su ? '' : auth.id)
          a.set('action', 'pastas.modelo_publicado')
          a.set('outcome', 'success')
          a.set('details', {
            versao: numero,
            caminho: m.caminho,
            subpastas: m.subpastas.length,
            motivo: motivo,
          })
          tx.save(a)
        })
      } catch (err) {
        return e.json(409, {
          code: 'conflito',
          message: 'Outra pessoa publicou ao mesmo tempo. Recarregue e tente de novo.',
        })
      }
      return e.json(201, { numero: numero })
    }

    // ---- simular: monta a árvore para um projeto ou para todos (nada é criado) ----
    let m
    if (body.caminho_projeto !== undefined) m = validar(body.caminho_projeto, body.subpastas)
    else {
      const ult = $app.findRecordsByFilter('pastas_modelos', "id != ''", '-numero', 1, 0)
      if (!ult.length) ruim('modelo', 'Ainda não há modelo de pastas publicado.')
      m = {
        caminho: ult[0].getString('caminho_projeto'),
        subpastas: JSON.parse(ult[0].getString('subpastas') || '[]'),
      }
    }
    const limpar = (s) =>
      String(s || '')
        .replace(/["*:<>?\\|#%\/]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/g, '')
        .slice(0, 120)
    const montar = (modelo, vals) => {
      const trocar = (seg) =>
        limpar(seg.replace(/\{(cliente|local|projeto|disciplina)\}/g, (_, k) => vals[k] || ''))
      const partes = (caminho) =>
        caminho
          .split('/')
          .map(trocar)
          .filter((x) => x.length > 0)
      return partes
    }
    const arvore = (p) => {
      let cliente = ''
      try {
        if (p.getString('cliente'))
          cliente = $app.findRecordById('clientes', p.getString('cliente')).getString('nome')
      } catch (_) {}
      const vals = { cliente: cliente, local: p.getString('local'), projeto: p.getString('nome') }
      const base = montar(m, vals)(m.caminho)
      const disciplinas = []
      for (const c of $app.findRecordsByFilter('projeto_disciplinas', 'projeto = {:p}', '', 0, 0, {
        p: p.id,
      })) {
        try {
          disciplinas.push(
            $app.findRecordById('disciplinas', c.getString('disciplina')).getString('nome'),
          )
        } catch (_) {}
      }
      disciplinas.sort()
      const caminhos = []
      const add = (lista) => {
        for (let i = 1; i <= lista.length; i++) {
          const c = lista.slice(0, i).join('/')
          if (caminhos.indexOf(c) < 0) caminhos.push(c)
        }
      }
      add(base)
      for (const l of m.subpastas) {
        if (l.indexOf('{disciplina}') >= 0) {
          for (const d of disciplinas)
            add(base.concat(montar(m, Object.assign({}, vals, { disciplina: d }))(l)))
        } else add(base.concat(montar(m, vals)(l)))
      }
      const faltando = []
      if (!cliente && m.caminho.indexOf('{cliente}') >= 0) faltando.push('cliente')
      if (!vals.local && m.caminho.indexOf('{local}') >= 0) faltando.push('local')
      return {
        projeto: { id: p.id, nome: p.getString('nome') },
        pasta_projeto: base.join('/'),
        caminhos: caminhos,
        disciplinas: disciplinas.length,
        campos_vazios: faltando,
      }
    }
    if (body.todos === true) {
      const lista = $app
        .findRecordsByFilter('projetos', 'arquivado = false', 'nome', 0, 0)
        .map(arvore)
      return e.json(200, {
        projetos: lista.length,
        pastas: lista.reduce((s, x) => s + x.caminhos.length, 0),
        lista: lista,
        aviso:
          'Simulação: nada foi criado. A criação no OneDrive fica disponível quando o Microsoft 365 liberar o acesso.',
      })
    }
    let p = null
    try {
      p = $app.findRecordById('projetos', typeof body.projeto === 'string' ? body.projeto : '')
    } catch (_) {}
    if (!p) ruim('projeto', 'Escolha um projeto para a prévia.')
    return e.json(200, arvore(p))
  },
  $apis.requireAuth(),
)
