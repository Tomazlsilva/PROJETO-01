// T1.07 — Fixture da SPEC-1-002: 1 cliente, 4 disciplinas e 2 projetos
// semelhantes (mesmo cliente, local e tipologia — base para o alerta de
// duplicidade da T1.09), com responsável por disciplina. Usa as contas [TESTE]
// da SPEC-1-001. Idempotente: rodar de novo não duplica nada.
migrate(
  (app) => {
    const achar = (colecao, campo, valor) => {
      try {
        return app.findFirstRecordByData(colecao, campo, valor)
      } catch (_) {
        return null
      }
    }
    const usuario = (email) => app.findAuthRecordByEmail('_pb_users_auth_', email).id

    // Cliente
    let cliente = achar('clientes', 'nome', '[TESTE] Cliente Validação')
    if (!cliente) {
      cliente = new Record(app.findCollectionByNameOrId('clientes'))
      cliente.set('nome', '[TESTE] Cliente Validação')
      app.save(cliente)
    }

    // Disciplinas do catálogo (as quatro com padrão de desenho Gavazzi)
    const catalogo = [
      ['Hidráulica', 'HID'],
      ['Elétrica', 'ELE'],
      ['Ar-condicionado', 'AC'],
      ['PPCI', 'PPCI'],
    ]
    const disc = {}
    for (const [nome, sigla] of catalogo) {
      let d = achar('disciplinas', 'nome', nome)
      if (!d) {
        d = new Record(app.findCollectionByNameOrId('disciplinas'))
        d.set('nome', nome)
        d.set('sigla', sigla)
        d.set('ativa', true)
        app.save(d)
      }
      disc[sigla] = d.id
    }

    const coord = usuario('teste.coordenador@validacao.gavazzi.test')
    const proj = usuario('teste.projetista@validacao.gavazzi.test')
    const rev = usuario('teste.revisor@validacao.gavazzi.test')

    // Dois projetos semelhantes: mesmo cliente, local e tipologia
    const projetos = [
      {
        nome: '[TESTE] Residencial Validação — Torre A',
        prazo: '2026-12-15 12:00:00.000Z',
        prioridade: 'Normal',
        disciplinas: [
          ['HID', proj],
          ['ELE', proj],
          ['AC', coord],
          ['PPCI', coord],
        ],
      },
      {
        nome: '[TESTE] Residencial Validação — Torre A (semelhante)',
        prazo: '2027-01-29 12:00:00.000Z',
        prioridade: 'Alta',
        disciplinas: [
          ['HID', proj],
          ['ELE', rev],
        ],
      },
    ]
    const colProj = app.findCollectionByNameOrId('projetos')
    const colPD = app.findCollectionByNameOrId('projeto_disciplinas')
    for (const p of projetos) {
      let rec = achar('projetos', 'nome', p.nome)
      if (!rec) {
        rec = new Record(colProj)
        rec.set('nome', p.nome)
        rec.set('cliente', cliente.id)
        rec.set('local', 'Rua de Teste, 100 — São Paulo/SP')
        rec.set('tipologia', 'Residencial multifamiliar')
        rec.set('prazo', p.prazo)
        rec.set('prioridade', p.prioridade)
        rec.set('coordenador', coord)
        rec.set('membros', [proj, rev])
        rec.set('arquivado', false)
        app.save(rec)
      }
      for (const [sigla, resp] of p.disciplinas) {
        const existentes = app.findRecordsByFilter(
          'projeto_disciplinas',
          "projeto = '" + rec.id + "' && disciplina = '" + disc[sigla] + "'",
          '',
          1,
          0,
        )
        if (existentes.length === 0) {
          const pd = new Record(colPD)
          pd.set('projeto', rec.id)
          pd.set('disciplina', disc[sigla])
          pd.set('responsavel', resp)
          app.save(pd)
        }
      }
    }
  },
  (app) => {
    for (const nome of [
      '[TESTE] Residencial Validação — Torre A',
      '[TESTE] Residencial Validação — Torre A (semelhante)',
    ]) {
      try {
        const p = app.findFirstRecordByData('projetos', 'nome', nome)
        for (const pd of app.findRecordsByFilter(
          'projeto_disciplinas',
          "projeto = '" + p.id + "'",
          '',
          0,
          0,
        )) {
          app.delete(pd)
        }
        app.delete(p)
      } catch (_) {}
    }
    try {
      app.delete(app.findFirstRecordByData('clientes', 'nome', '[TESTE] Cliente Validação'))
    } catch (_) {}
    // O catálogo de disciplinas permanece: pode já estar em uso por projetos reais.
  },
)
