// SPEC-1-008 (T1.49/T1.50, parte 2) — Administrativo e saída de Revisor e Executivo.
// 1. Acrescenta o papel 'administrativo'.
// 2. Converte, com auditoria (antes → depois) e sessões renovadas:
//      executivo → administrativo;  revisor → coordenador.
// 3. Regras de todas as coleções: 'executivo' passa a ser 'administrativo' e 'revisor'
//    passa a ser 'coordenador' (a revisão técnica é do coordenador do projeto).
// 4. Remove 'revisor' e 'executivo' da lista de papéis.
// O campo "revisor" dos cards e disciplinas fica no banco só para leitura do histórico.
const LOTE = 'spec_1_008_papeis'
const CONVERSAO = { executivo: 'administrativo', revisor: 'coordenador' }
const REGRAS = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule', 'manageRule']

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const campo = users.fields.getByName('role')
    campo.values = ['admin', 'coordenador', 'projetista', 'administrativo', 'revisor', 'executivo']
    app.save(users)

    const auditCol = app.findCollectionByNameOrId('auth_audit')
    const audit = (targetId, details) => {
      const a = new Record(auditCol)
      a.set('actor_id', '')
      a.set('target_id', targetId)
      a.set('action', 'user.role_change')
      a.set('outcome', 'success')
      a.set('details', Object.assign({ lote: LOTE, origem: 'migracao 0025' }, details))
      app.save(a)
    }
    for (const antigo of Object.keys(CONVERSAO)) {
      for (const u of app.findRecordsByFilter('users', 'role = {:r}', '', 0, 0, { r: antigo })) {
        u.set('role', CONVERSAO[antigo])
        u.refreshTokenKey()
        u.set('session_expires_at', '')
        app.save(u)
        audit(u.id, { antes: antigo, depois: CONVERSAO[antigo] })
      }
    }

    const alteradas = []
    for (const col of app.findAllCollections()) {
      if (col.system) continue
      let mudou = false
      for (const r of REGRAS) {
        if (r === 'manageRule' && col.type !== 'auth') continue
        if (col[r] === null || col[r] === undefined) continue
        const v = String(col[r]) // regra vem como ponteiro de string
        if (!v) continue
        const novo = v
          .split("'executivo'")
          .join("'administrativo'")
          .split("'revisor'")
          .join("'coordenador'")
        if (novo !== v) {
          col[r] = novo
          mudou = true
        }
      }
      if (mudou) {
        app.save(col)
        alteradas.push(col.name)
      }
    }

    const u2 = app.findCollectionByNameOrId('_pb_users_auth_')
    u2.fields.getByName('role').values = ['admin', 'coordenador', 'projetista', 'administrativo']
    app.save(u2)

    const a = new Record(auditCol)
    a.set('actor_id', '')
    a.set('action', 'config.roles')
    a.set('outcome', 'success')
    a.set('details', { lote: LOTE, colecoes_alteradas: alteradas })
    app.save(a)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.fields.getByName('role').values = [
      'admin',
      'coordenador',
      'projetista',
      'revisor',
      'executivo',
      'administrativo',
    ]
    app.save(users)
    // volta cada conversão pelo registro de auditoria
    for (const r of app.findRecordsByFilter(
      'auth_audit',
      "details.lote = '" + LOTE + "' && action = 'user.role_change'",
      '',
      0,
      0,
    )) {
      try {
        const det = JSON.parse(r.getString('details') || '{}')
        const u = app.findRecordById('_pb_users_auth_', r.getString('target_id'))
        if (u.getString('role') === det.depois) {
          u.set('role', det.antes)
          app.save(u)
        }
      } catch (_) {}
    }
    for (const col of app.findAllCollections()) {
      if (col.system) continue
      let mudou = false
      for (const k of REGRAS) {
        if (k === 'manageRule' && col.type !== 'auth') continue
        if (col[k] === null || col[k] === undefined) continue
        const v = String(col[k])
        if (!v) continue
        const novo = v.split("'administrativo'").join("'executivo'")
        if (novo !== v) {
          col[k] = novo
          mudou = true
        }
      }
      if (mudou) app.save(col)
    }
    const u2 = app.findCollectionByNameOrId('_pb_users_auth_')
    u2.fields.getByName('role').values = [
      'admin',
      'coordenador',
      'projetista',
      'revisor',
      'executivo',
    ]
    app.save(u2)
  },
)
