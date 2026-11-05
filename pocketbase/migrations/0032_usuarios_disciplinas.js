// Disciplina de cada pessoa (lista do Alessandro, 05/11/2026). Aparece ao lado do nome nos
// seletores de pessoa e no calendário, para identificar quem é de cada disciplina no projeto.
// Só o administrador altera (users_update_policy).
const DISC = ['Hidráulica', 'Elétrica', 'Ar-condicionado', 'PPCI', 'Estrutura']
const H = 'Hidráulica'
const E = 'Elétrica'
const AC = 'Ar-condicionado'
const P = 'PPCI'
const ES = 'Estrutura'
const LISTA = {
  projetos20: [ES], // Alice Nogueira
  projetos13: [E, AC], // Ana Galvani
  projetos12: [E], // Carlos Eduardo
  projetos10: [E], // Henrique Fonseca
  projetos4: [H], // Igor Holanda
  projetos7: [AC], // Ivan Petryszin
  projetos21: [H], // Jonathan Lopes
  projetos3: [E], // Júlia Lima
  projetos5: [H], // Julio Domingues
  projetos11: [H], // Lincon Santos
  projetos6: [H], // Lindmbergh (Bergh)
  projetos23: [H], // Luigi Regolini
  projetos15: [P], // Luiz Augusto
  projetos27: [E], // Luiz Felipe
  projetos17: [ES], // Matheus Levi
  projetos25: [ES], // Nicolly
  osvaldo: [H],
  projetos9: [E], // Rodrigo Yudi
  projetos19: [P], // Stephanie Sansão
  projetos2: [AC], // Thalia Gomez
  'thiago.morais': [AC],
  projetos8: [P], // Vitória Girotto
  karen: [P],
  leonardo: [E],
  'pietro.abruzzeze': [ES],
  'tomaz.silva': [H],
  'felipe.miotto': [ES],
}
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    if (!users.fields.getByName('disciplinas')) {
      users.fields.add(
        new SelectField({ name: 'disciplinas', values: DISC, maxSelect: DISC.length }),
      )
      app.save(users)
    }
    for (const local of Object.keys(LISTA)) {
      try {
        const u = app.findAuthRecordByEmail('_pb_users_auth_', local + '@gavazziengenharia.com.br')
        u.set('disciplinas', LISTA[local])
        app.save(u)
      } catch (_) {}
    }
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.fields.removeByName('disciplinas')
    app.save(users)
  },
)
