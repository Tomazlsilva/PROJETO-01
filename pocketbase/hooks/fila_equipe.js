// SPEC-1-004 (T1.19, CA-1-004-07) — visão do coordenador: filas de todas as pessoas
// da equipe, com resumo (total, atrasados, bloqueados, bloqueios vencidos).
// Equipe do coordenador = pessoas com itens nos projetos que ele coordena; só esses
// itens aparecem. Administrador e executivo veem todos os projetos ativos.
// Projetista e revisor → 403 (auditado).
routerAdd(
  'GET',
  '/backend/v1/fila/equipe',
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
    const papel = su ? 'admin' : auth.getString('role')
    if (papel !== 'admin' && papel !== 'executivo' && papel !== 'coordenador') {
      try {
        const a = new Record($app.findCollectionByNameOrId('auth_audit'))
        a.set('actor_id', auth.id)
        a.set('action', 'access.denied')
        a.set('outcome', 'blocked')
        a.set('details', { recurso: 'fila_equipe' })
        $app.save(a)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', 'access.denied')
      }
      throw new ForbiddenError('Acesso negado.')
    }
    const q = e.request.url.query()
    const fProjeto = String(q.get('projeto') || '').slice(0, 32)
    const fPrio = String(q.get('prioridade') || '').slice(0, 20)
    const fEtapa = String(q.get('etapa') || '').slice(0, 40)
    const fSit = String(q.get('situacao') || '').slice(0, 20)

    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
    const PESO = { Urgente: 0, Alta: 1, Normal: 2, Baixa: 3 }
    const versoes = $app.findRecordsByFilter('fluxo_versoes', 'ativa = true', '-numero', 1, 0)
    const cfg = versoes.length > 0 ? JSON.parse(versoes[0].getString('config')) : { etapas: [] }
    const nomeEtapa = (k) => {
      const et = (cfg.etapas || []).find((x) => x.chave === k)
      return et ? et.nome : k
    }
    const usuarios = {}
    const usuario = (uid) => {
      if (!uid) return null
      if (usuarios[uid] === undefined) {
        let u = null
        try {
          const r = $app.findRecordById('users', uid)
          u = {
            id: uid,
            nome: r.getString('name') || r.getString('email').split('@')[0],
            papel: r.getString('role'),
            ativo: r.getBool('active'),
          }
        } catch (_) {}
        usuarios[uid] = u
      }
      return usuarios[uid]
    }
    const pessoaDe = (uid) => {
      const u = usuario(uid)
      return u ? { id: u.id, nome: u.nome } : null
    }
    const discs = {}
    const disciplinaDe = (did) => {
      if (!discs[did]) {
        let d = { id: did, nome: '—', sigla: '' }
        try {
          const r = $app.findRecordById('disciplinas', did)
          d = { id: r.id, nome: r.getString('nome'), sigla: r.getString('sigla') }
        } catch (_) {}
        discs[did] = d
      }
      return discs[did]
    }
    const projetos = {}
    const projetoDe = (pid) => {
      if (projetos[pid] === undefined) {
        let p = null
        try {
          const r = $app.findRecordById('projetos', pid)
          p = {
            id: r.id,
            nome: r.getString('nome'),
            coordenador: r.getString('coordenador'),
            membros: r.getStringSlice('membros'),
            prioridade: r.getString('prioridade') || 'Normal',
            prazo: r.getString('prazo').slice(0, 10),
          }
        } catch (_) {}
        projetos[pid] = p
      }
      return projetos[pid]
    }

    let filtro = "projeto.arquivado = false && etapa != 'aprovado'"
    const params = {}
    if (papel === 'coordenador') {
      filtro += ' && projeto.coordenador = {:v}'
      params.v = auth.id
    }
    const cards = $app.findRecordsByFilter('projeto_disciplinas', filtro, 'created', 0, 0, params)

    const porPessoa = {}
    const incluir = (uid, c, item, motivo) => {
      if (!uid || !usuario(uid)) return
      if (!porPessoa[uid]) porPessoa[uid] = {}
      if (!porPessoa[uid][c.id]) porPessoa[uid][c.id] = Object.assign({}, item, { motivos: [] })
      if (porPessoa[uid][c.id].motivos.indexOf(motivo) < 0)
        porPessoa[uid][c.id].motivos.push(motivo)
    }
    for (const c of cards) {
      const p = projetoDe(c.getString('projeto'))
      if (!p) continue
      const bloqueado = c.getBool('bloqueado')
      const prioPropria = c.getString('prioridade')
      const prazoProprio = c.getString('prazo').slice(0, 10)
      const prazo = prazoProprio || p.prazo
      const revisao = c.getString('bloqueio_revisao').slice(0, 10)
      const resp = c.getString('responsavel')
      const item = {
        id: c.id,
        etapa: c.getString('etapa'),
        etapa_nome: nomeEtapa(c.getString('etapa')),
        projeto: { id: p.id, nome: p.nome, coordenador: p.coordenador, membros: p.membros },
        disciplina: disciplinaDe(c.getString('disciplina')),
        responsavel: pessoaDe(resp),
        prioridade: prioPropria || p.prioridade,
        prioridade_propria: !!prioPropria,
        prazo: prazo,
        prazo_proprio: !!prazoProprio,
        atrasado: !!prazo && prazo < hoje,
        bloqueado: bloqueado,
        bloqueio: bloqueado
          ? {
              motivo: c.getString('bloqueio_motivo'),
              dono: pessoaDe(c.getString('bloqueio_dono')),
              revisao: revisao,
              desde: c.getString('bloqueado_em'),
              vencido: !!revisao && revisao < hoje,
            }
          : null,
        versao: c.getString('updated'),
        created: c.getString('created'),
      }
      if (fProjeto && item.projeto.id !== fProjeto) continue
      if (fPrio && item.prioridade !== fPrio) continue
      if (fEtapa && item.etapa !== fEtapa) continue
      if (fSit === 'atrasado' && !item.atrasado) continue
      if (fSit === 'bloqueado' && !item.bloqueado) continue
      if (fSit === 'vencido' && !(item.bloqueio && item.bloqueio.vencido)) continue

      incluir(resp, c, item, 'responsavel')
      if (bloqueado) incluir(c.getString('bloqueio_dono'), c, item, 'bloqueio')
      if (item.etapa === 'aguardando_revisao' && !bloqueado) {
        for (const m of p.membros) {
          const u = usuario(m)
          if (u && u.papel === 'revisor' && m !== resp) incluir(m, c, item, 'revisao')
        }
        if (p.coordenador && p.coordenador !== resp) incluir(p.coordenador, c, item, 'revisao')
      }
    }

    const ordenar = (a, b) => {
      const va = a.bloqueio && a.bloqueio.vencido ? 0 : 1
      const vb = b.bloqueio && b.bloqueio.vencido ? 0 : 1
      if (va !== vb) return va - vb
      const pa = PESO[a.prioridade] === undefined ? 2 : PESO[a.prioridade]
      const pb = PESO[b.prioridade] === undefined ? 2 : PESO[b.prioridade]
      if (pa !== pb) return pa - pb
      const za = a.prazo || '9999-99-99'
      const zb = b.prazo || '9999-99-99'
      if (za !== zb) return za < zb ? -1 : 1
      if (a.created !== b.created) return a.created < b.created ? -1 : 1
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    }
    const pessoas = Object.keys(porPessoa).map((uid) => {
      const u = usuario(uid)
      const itens = Object.keys(porPessoa[uid])
        .map((k) => porPessoa[uid][k])
        .sort(ordenar)
      return {
        pessoa: { id: u.id, nome: u.nome, papel: u.papel, ativo: u.ativo },
        resumo: {
          total: itens.length,
          atrasados: itens.filter((i) => i.atrasado).length,
          bloqueados: itens.filter((i) => i.bloqueado).length,
          vencidos: itens.filter((i) => i.bloqueio && i.bloqueio.vencido).length,
        },
        itens: itens,
      }
    })
    pessoas.sort((a, b) =>
      a.pessoa.nome.toLowerCase() < b.pessoa.nome.toLowerCase()
        ? -1
        : a.pessoa.nome.toLowerCase() > b.pessoa.nome.toLowerCase()
          ? 1
          : a.pessoa.id < b.pessoa.id
            ? -1
            : 1,
    )
    return e.json(200, { hoje: hoje, pessoas: pessoas })
  },
  $apis.requireAuth(),
)
