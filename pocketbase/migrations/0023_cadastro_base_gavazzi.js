// Cadastro em lote da equipe Gavazzi a partir da planilha BASE_GAVAZZI.xlsx (05/11/2026).
// Papéis PROVISÓRIOS até a SPEC-1-008 criar Diretor e Administrativo:
//   - donos (Ademar, Alessandro) e Felipe Miotto (implantação) -> admin
//   - administrativo@ (Karina) e financeiro@ (Renato)          -> executivo (só leitura)
//   - Sueli (projetos@)                                          -> projetista
// A migração de papéis da SPEC-1-008 converte depois: donos -> diretor; Karina e
// Renato -> administrativo; Sueli ganha a visão do cronograma inteiro.
// Sem senha: cada pessoa entra com "Entrar com Microsoft" (senha aleatória e desconhecida).
// Idempotente. Contas existentes mantêm senha e situação (ativa/revogada); só nome e papel
// são alinhados à planilha, com antes/depois na auditoria. Também corrige o e-mail do Tomaz,
// gravado com erro de digitação ("gavazzienharia") pela migração 0003.
const BASE_GAVAZZI = [
  ['ademar@gavazziengenharia.com.br', 'Ademar', 'admin'],
  ['administrativo@gavazziengenharia.com.br', 'Karina (Administrativo)', 'executivo'],
  ['alessandro@gavazziengenharia.com.br', 'Alessandro Gavazzi', 'admin'],
  ['projetos20@gavazziengenharia.com.br', 'Alice Nogueira', 'projetista'],
  ['projetos13@gavazziengenharia.com.br', 'Ana Galvani', 'projetista'],
  ['projetos12@gavazziengenharia.com.br', 'Carlos Eduardo Moura de Carvalho', 'projetista'],
  ['felipe.miotto@gavazziengenharia.com.br', 'Felipe Miotto', 'admin'],
  ['financeiro@gavazziengenharia.com.br', 'Renato (Financeiro)', 'executivo'],
  ['projetos10@gavazziengenharia.com.br', 'Henrique Fonseca', 'projetista'],
  ['projetos4@gavazziengenharia.com.br', 'Igor Holanda', 'projetista'],
  ['projetos7@gavazziengenharia.com.br', 'Ivan Petryszin', 'projetista'],
  ['projetos21@gavazziengenharia.com.br', 'Jonathan Lopes', 'projetista'],
  ['projetos3@gavazziengenharia.com.br', 'Júlia Lima', 'projetista'],
  ['projetos5@gavazziengenharia.com.br', 'Julio Domingues Valentim', 'projetista'],
  ['karen@gavazziengenharia.com.br', 'Karen', 'coordenador'],
  ['leonardo@gavazziengenharia.com.br', 'Leonardo', 'coordenador'],
  ['projetos16@gavazziengenharia.com.br', 'Letícia Leunam', 'coordenador'],
  ['projetos11@gavazziengenharia.com.br', 'Lincon Santos', 'projetista'],
  ['projetos6@gavazziengenharia.com.br', 'Lindmbergh Alves', 'projetista'],
  ['projetos23@gavazziengenharia.com.br', 'Luigi Regolini', 'projetista'],
  ['projetos27@gavazziengenharia.com.br', 'Luiz Felipe', 'projetista'],
  ['projetos17@gavazziengenharia.com.br', 'Matheus Levi', 'projetista'],
  ['projetos25@gavazziengenharia.com.br', 'Nicolly', 'projetista'],
  ['osvaldo@gavazziengenharia.com.br', 'Osvaldo', 'projetista'],
  ['pietro.abruzzeze@gavazziengenharia.com.br', 'Pietro Abruzzeze', 'coordenador'],
  ['projetos@gavazziengenharia.com.br', 'Sueli (Projetos)', 'projetista'],
  ['projetos9@gavazziengenharia.com.br', 'Rodrigo Yudi', 'projetista'],
  ['projetos19@gavazziengenharia.com.br', 'Stephanie Sansão', 'projetista'],
  ['projetos2@gavazziengenharia.com.br', 'Thalia Gomez', 'projetista'],
  ['thiago.morais@gavazziengenharia.com.br', 'Thiago Grobas de Morais', 'projetista'],
  ['tomaz.silva@gavazziengenharia.com.br', 'Tomaz Silva', 'coordenador'],
  ['projetos8@gavazziengenharia.com.br', 'Vitória Girotto', 'projetista'],
]
const TOMAZ_ERRADO = 'tomaz.silva@gavazzienharia.com.br'
const TOMAZ_CERTO = 'tomaz.silva@gavazziengenharia.com.br'
const LOTE = 'base_gavazzi_2026-11-05'

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const auditCol = app.findCollectionByNameOrId('auth_audit')
    const audit = (action, targetId, details) => {
      const a = new Record(auditCol)
      a.set('actor_id', '')
      a.set('target_id', targetId)
      a.set('action', action)
      a.set('outcome', 'success')
      a.set('details', Object.assign({ lote: LOTE, origem: 'migracao 0023' }, details))
      app.save(a)
    }
    const achar = (email) => {
      try {
        return app.findAuthRecordByEmail('_pb_users_auth_', email)
      } catch (_) {
        return null
      }
    }

    // Corrige o e-mail do Tomaz, se só existir a versão com erro de digitação
    if (!achar(TOMAZ_CERTO)) {
      const t = achar(TOMAZ_ERRADO)
      if (t) {
        t.setEmail(TOMAZ_CERTO)
        app.save(t)
        audit('user.update', t.id, { campo: 'email', antes: TOMAZ_ERRADO, depois: TOMAZ_CERTO })
      }
    }

    for (const [email, nome, papel] of BASE_GAVAZZI) {
      const rec = achar(email)
      if (!rec) {
        const novo = new Record(users)
        novo.setEmail(email)
        novo.setPassword($security.randomString(40))
        novo.setVerified(false)
        novo.set('name', nome)
        novo.set('role', papel)
        novo.set('active', true)
        novo.set('failed_attempts', 0)
        app.save(novo)
        audit('user.create', novo.id, { papel: papel, ativo: true })
        continue
      }
      const antes = { nome: rec.getString('name'), papel: rec.getString('role') }
      if (antes.nome === nome && antes.papel === papel) continue
      rec.set('name', nome)
      rec.set('role', papel)
      app.save(rec)
      audit('user.update', rec.id, { antes: antes, depois: { nome: nome, papel: papel } })
    }
  },
  (app) => {
    // Desfaz pelo registro de auditoria do lote: contas criadas e ainda nunca usadas são
    // removidas; contas já usadas são só revogadas (preserva a autoria); alterações de
    // nome/papel/e-mail voltam ao valor anterior.
    const regs = app.findRecordsByFilter(
      'auth_audit',
      "details.lote = '" + LOTE + "'",
      '-created',
      0,
      0,
    )
    for (const r of regs) {
      let u
      try {
        u = app.findRecordById('_pb_users_auth_', r.getString('target_id'))
      } catch (_) {
        continue
      }
      const d = r.get('details') || {}
      const det = typeof d === 'string' ? JSON.parse(d) : JSON.parse(JSON.stringify(d))
      if (r.getString('action') === 'user.create') {
        if (u.getString('session_issued_at') === '') app.delete(u)
        else {
          u.set('active', false)
          app.save(u)
        }
      } else if (det.campo === 'email') {
        u.setEmail(det.antes)
        app.save(u)
      } else if (det.antes) {
        u.set('name', det.antes.nome)
        u.set('role', det.antes.papel)
        app.save(u)
      }
    }
  },
)
