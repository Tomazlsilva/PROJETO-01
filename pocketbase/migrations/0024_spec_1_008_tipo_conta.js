// SPEC-1-008 (T1.49, parte 1) — Diretor e visão completa do cronograma.
// Diretor tem exatamente o poder do Administrador; a diferença é só o tipo de conta.
// Por isso o papel continua 'admin' (todas as regras e rotas já aceitam) e o novo campo
// tipo_conta = 'diretor' faz a conta aparecer como "Diretor" na lista, na auditoria e nos
// relatórios. Assim nenhuma rota das SPECs 1-001 a 1-007 precisa mudar para o diretor.
// ve_cronograma: projetista que enxerga o cronograma inteiro (só leitura), ex.: secretaria.
const DIRETORES = ['ademar@gavazziengenharia.com.br', 'alessandro@gavazziengenharia.com.br']
const VE_CRONOGRAMA = ['projetos@gavazziengenharia.com.br']
const LOTE = 'spec_1_008_tipo_conta'

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    if (!users.fields.getByName('tipo_conta')) {
      users.fields.add(new SelectField({ name: 'tipo_conta', values: ['diretor'], maxSelect: 1 }))
    }
    if (!users.fields.getByName('ve_cronograma')) {
      users.fields.add(new BoolField({ name: 've_cronograma' }))
    }
    app.save(users)

    const auditCol = app.findCollectionByNameOrId('auth_audit')
    const audit = (targetId, details) => {
      const a = new Record(auditCol)
      a.set('actor_id', '')
      a.set('target_id', targetId)
      a.set('action', 'user.role_change')
      a.set('outcome', 'success')
      a.set('details', Object.assign({ lote: LOTE, origem: 'migracao 0024' }, details))
      app.save(a)
    }
    for (const email of DIRETORES) {
      try {
        const u = app.findAuthRecordByEmail('_pb_users_auth_', email)
        if (u.getString('tipo_conta') === 'diretor') continue
        u.set('role', 'admin')
        u.set('tipo_conta', 'diretor')
        app.save(u)
        audit(u.id, { antes: 'Administrador', depois: 'Diretor' })
      } catch (_) {}
    }
    for (const email of VE_CRONOGRAMA) {
      try {
        const u = app.findAuthRecordByEmail('_pb_users_auth_', email)
        if (u.getBool('ve_cronograma')) continue
        u.set('ve_cronograma', true)
        app.save(u)
        audit(u.id, { campo: 've_cronograma', antes: false, depois: true })
      } catch (_) {}
    }
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.fields.removeByName('tipo_conta')
    users.fields.removeByName('ve_cronograma')
    app.save(users)
  },
)
