// T1.01 — Fixture da SPEC-1-001: 5 papéis, 1 conta revogada e 2 projetos com
// vínculos distintos. Contas marcadas como [TESTE], domínio reservado .test e
// senhas aleatórias que ninguém conhece: o administrador define a senha pela
// tela de usuários quando for usar a conta. Nenhuma credencial fica no código.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const contas = [
      ['teste.admin@validacao.gavazzi.test', '[TESTE] Administrador', 'admin', true],
      ['teste.coordenador@validacao.gavazzi.test', '[TESTE] Coordenador', 'coordenador', true],
      ['teste.projetista@validacao.gavazzi.test', '[TESTE] Projetista', 'projetista', true],
      ['teste.revisor@validacao.gavazzi.test', '[TESTE] Revisor', 'revisor', true],
      ['teste.executivo@validacao.gavazzi.test', '[TESTE] Executivo', 'executivo', true],
      ['teste.revogado@validacao.gavazzi.test', '[TESTE] Conta revogada', 'projetista', false],
    ]
    const ids = {}
    for (const [email, name, role, active] of contas) {
      let rec
      try {
        rec = app.findAuthRecordByEmail('_pb_users_auth_', email)
      } catch (_) {
        rec = new Record(users)
        rec.setEmail(email)
        rec.setPassword($security.randomString(40))
        rec.setVerified(true)
        rec.set('name', name)
        rec.set('role', role)
        rec.set('active', active)
        rec.set('failed_attempts', 0)
        app.save(rec)
      }
      ids[role + (active ? '' : '_revogado')] = rec.id
    }

    const projetos = app.findCollectionByNameOrId('projetos')
    const fixtures = [
      ['[TESTE] Projeto A — vinculado à equipe', ids.coordenador, [ids.projetista, ids.revisor]],
      ['[TESTE] Projeto B — sem vínculo da equipe', ids.admin, [ids.projetista_revogado]],
    ]
    for (const [nome, coord, membros] of fixtures) {
      try {
        app.findFirstRecordByData('projetos', 'nome', nome)
      } catch (_) {
        const p = new Record(projetos)
        p.set('nome', nome)
        p.set('coordenador', coord)
        p.set('membros', membros)
        app.save(p)
      }
    }
  },
  (app) => {
    for (const nome of [
      '[TESTE] Projeto A — vinculado à equipe',
      '[TESTE] Projeto B — sem vínculo da equipe',
    ]) {
      try {
        app.delete(app.findFirstRecordByData('projetos', 'nome', nome))
      } catch (_) {}
    }
    for (const email of [
      'teste.admin@validacao.gavazzi.test',
      'teste.coordenador@validacao.gavazzi.test',
      'teste.projetista@validacao.gavazzi.test',
      'teste.revisor@validacao.gavazzi.test',
      'teste.executivo@validacao.gavazzi.test',
      'teste.revogado@validacao.gavazzi.test',
    ]) {
      try {
        app.delete(app.findAuthRecordByEmail('_pb_users_auth_', email))
      } catch (_) {}
    }
  },
)
