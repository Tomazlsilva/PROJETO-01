// SPEC-1-003 (T1.14, CA-1-003-06) — restaura uma versão anterior do fluxo.
// A restauração não apaga nada: cria uma versão nova com a configuração antiga
// (restaurada_de = número da versão de origem). Mesmas regras de conflito e remapeamento.
routerAdd(
  'POST',
  '/backend/v1/fluxo/restaurar/{id}',
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
      if (auth.getString('role') !== 'admin') {
        try {
          const a = new Record($app.findCollectionByNameOrId('auth_audit'))
          a.set('actor_id', auth.id)
          a.set('action', 'access.denied')
          a.set('outcome', 'blocked')
          a.set('details', { recurso: 'fluxo', operacao: 'restaurar' })
          $app.save(a)
        } catch (err) {
          $app.logger().error('auditoria falhou', 'action', 'access.denied')
        }
        throw new ForbiddenError('Acesso negado.')
      }
    }
    const body = e.requestInfo().body || {}
    let origem = null
    try {
      origem = $app.findRecordById('fluxo_versoes', e.request.pathValue('id'))
    } catch (_) {}
    if (!origem) throw new NotFoundError('Versão não encontrada.')
    const cfgOrigem = JSON.parse(origem.getString('config') || '{}')
    const KEYS = [
      'entrada_pendente',
      'pronto',
      'em_elaboracao',
      'aguardando_revisao',
      'em_correcao',
      'aprovado',
    ]
    const CAMPOS = ['observacao', 'link_entrega']
    const ruim = (campo, code, msg) => {
      const d = {}
      d[campo] = new ValidationError(code, msg)
      throw new BadRequestError(msg, d)
    }

    // ---- validação da configuração ----
    const etapasIn = Array.isArray(cfgOrigem.etapas) ? cfgOrigem.etapas : []
    if (etapasIn.length !== KEYS.length) ruim('etapas', 'invalido', 'Informe as 6 etapas do fluxo.')
    const vistas = {}
    const ordens = {}
    const etapas = []
    for (const x of etapasIn) {
      const chave = x && typeof x.chave === 'string' ? x.chave : ''
      if (KEYS.indexOf(chave) < 0 || vistas[chave])
        ruim('etapas', 'invalido', 'Etapa desconhecida ou repetida.')
      vistas[chave] = true
      const nome = typeof x.nome === 'string' ? x.nome.trim() : ''
      if (nome.length < 1 || nome.length > 40)
        ruim('etapas', 'nome_invalido', 'Cada etapa precisa de um nome com 1 a 40 caracteres.')
      const ordem = Number(x.ordem)
      if (!Number.isInteger(ordem) || ordem < 1 || ordem > 99 || ordens[ordem])
        ruim('etapas', 'ordem_invalida', 'As posições das etapas devem ser números distintos.')
      ordens[ordem] = true
      etapas.push({ chave: chave, nome: nome, ordem: ordem, ativa: x.ativa !== false })
    }
    etapas.sort((a, b) => a.ordem - b.ordem)
    etapas.forEach((x, i) => (x.ordem = i + 1))
    const ativaNova = (k) => etapas.some((x) => x.chave === k && x.ativa)
    if (!ativaNova('aprovado'))
      ruim('etapas', 'aprovado_obrigatorio', 'A etapa "Aprovado" não pode ser inativada.')
    if (etapas.filter((x) => x.ativa).length < 2)
      ruim('etapas', 'poucas_etapas', 'Mantenha pelo menos duas etapas ativas.')
    const requisitos = {}
    const reqIn =
      cfgOrigem.requisitos &&
      typeof cfgOrigem.requisitos === 'object' &&
      !Array.isArray(cfgOrigem.requisitos)
        ? cfgOrigem.requisitos
        : {}
    for (const k of Object.keys(reqIn)) {
      const par = k.split('>')
      if (
        par.length !== 2 ||
        KEYS.indexOf(par[0]) < 0 ||
        KEYS.indexOf(par[1]) < 0 ||
        par[0] === par[1]
      ) {
        ruim('requisitos', 'invalido', 'Transição inválida nos campos obrigatórios.')
      }
      const lista = Array.isArray(reqIn[k]) ? reqIn[k] : []
      const ok = []
      for (const f of lista) {
        if (CAMPOS.indexOf(f) < 0)
          ruim(
            'requisitos',
            'invalido',
            'Campo obrigatório desconhecido: ' + String(f).slice(0, 40),
          )
        if (ok.indexOf(f) < 0) ok.push(f)
      }
      if (ok.length > 0) requisitos[k] = ok
    }
    const motivo = (
      typeof body.motivo === 'string' && body.motivo.trim()
        ? body.motivo.trim()
        : 'Restauração da versão ' + origem.getInt('numero')
    ).slice(0, 500)
    const base = typeof body.base === 'string' ? body.base : ''
    const remap =
      body.remapeamentos && typeof body.remapeamentos === 'object' ? body.remapeamentos : {}

    // ---- remapeamento de cards em etapas inativadas ----
    const nomeDe = (k) => {
      const x = etapas.find((y) => y.chave === k)
      return x ? x.nome : k
    }
    const remapear = {}
    const erros = {}
    for (const x of etapas) {
      if (x.ativa) continue
      const qtd = $app.countRecords('projeto_disciplinas', $dbx.hashExp({ etapa: x.chave }))
      if (qtd === 0) continue
      const destino = typeof remap[x.chave] === 'string' ? remap[x.chave] : ''
      if (!destino || !ativaNova(destino)) {
        erros[x.chave] = new ValidationError(
          'remapeamento_obrigatorio',
          'A etapa "' +
            x.nome +
            '" tem ' +
            qtd +
            ' card(s): escolha uma etapa ativa para o remapeamento.',
        )
        continue
      }
      remapear[x.chave] = destino
    }
    if (Object.keys(erros).length > 0) {
      throw new BadRequestError(
        'Remapeamento obrigatório: há cards em etapas que serão inativadas.',
        erros,
      )
    }

    let situacao = 'ok'
    let nova = null
    try {
      $app.runInTransaction((tx) => {
        const atuais = tx.findRecordsByFilter('fluxo_versoes', 'ativa = true', '-numero', 1, 0)
        if (atuais.length === 0 || atuais[0].id !== base) {
          situacao = 'conflito'
          return
        }
        const ultimo = tx.findRecordsByFilter('fluxo_versoes', "id != ''", '-numero', 1, 0)
        const numero = (ultimo.length > 0 ? ultimo[0].getInt('numero') : 0) + 1
        atuais[0].set('ativa', false)
        tx.save(atuais[0])
        nova = new Record(tx.findCollectionByNameOrId('fluxo_versoes'))
        nova.set('numero', numero)
        nova.set('ativa', true)
        nova.set('config', { etapas: etapas, requisitos: requisitos })
        nova.set('motivo', motivo)
        nova.set('restaurada_de', origem.getInt('numero'))
        if (!su) nova.set('autor', auth.id)
        tx.save(nova)
        for (const de of Object.keys(remapear)) {
          for (const c of tx.findRecordsByFilter(
            'projeto_disciplinas',
            'etapa = {:e}',
            'created',
            0,
            0,
            { e: de },
          )) {
            c.set('etapa', remapear[de])
            tx.save(c)
            const t = new Record(tx.findCollectionByNameOrId('transicoes'))
            t.set('card', c.id)
            t.set('projeto', c.getString('projeto'))
            t.set('tipo', 'remapeamento')
            t.set('de', de)
            t.set('para', remapear[de])
            t.set('justificativa', motivo || 'Etapa "' + nomeDe(de) + '" inativada')
            t.set('detalhes', { configuracao: numero })
            if (!su) t.set('autor', auth.id)
            tx.save(t)
          }
        }
        const a = new Record(tx.findCollectionByNameOrId('auth_audit'))
        a.set('actor_id', su ? '' : auth.id)
        a.set('action', 'fluxo.config_change')
        a.set('outcome', 'success')
        a.set('details', {
          de: atuais[0].getInt('numero'),
          para: numero,
          restaurada_de: origem.getInt('numero'),
          motivo: motivo,
          remapeamentos: remapear,
        })
        tx.save(a)
      })
    } catch (err) {
      // corrida entre dois administradores: o índice único de "numero" barra o segundo
      situacao = 'conflito'
    }
    if (situacao === 'conflito') {
      return e.json(409, {
        code: 'conflito_edicao',
        message:
          'A configuração foi alterada por outra pessoa depois que você abriu. Recarregue e refaça a alteração.',
      })
    }
    return e.json(201, { id: nova.id, numero: nova.getInt('numero') })
  },
  $apis.requireAuth(),
)
