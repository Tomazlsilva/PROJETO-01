// Catálogo de disciplinas: inclui Estrutura de concreto e Estrutura metálica.
// Idempotente; o down só remove se a disciplina ainda não estiver em uso.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('disciplinas')
    const novas = [
      ['Estrutura de concreto', 'EST-C'],
      ['Estrutura metálica', 'EST-M'],
    ]
    for (const [nome, sigla] of novas) {
      try {
        app.findFirstRecordByData('disciplinas', 'nome', nome)
      } catch (_) {
        const d = new Record(col)
        d.set('nome', nome)
        d.set('sigla', sigla)
        d.set('ativa', true)
        app.save(d)
      }
    }
  },
  (app) => {
    for (const nome of ['Estrutura de concreto', 'Estrutura metálica']) {
      try {
        const d = app.findFirstRecordByData('disciplinas', 'nome', nome)
        const uso = app.findRecordsByFilter(
          'projeto_disciplinas',
          "disciplina = '" + d.id + "'",
          '',
          1,
          0,
        )
        if (uso.length === 0) app.delete(d)
      } catch (_) {}
    }
  },
)
