// SPEC-1-008 (T1.39) — entregas do calendário, janelas de execução, histórico e feriados.
// Leitura pela API só no escopo (administrador/diretor, administrativo, "vê o cronograma",
// coordenador ou membro do projeto). Gravação só pelas rotas /backend/v1/entregas*.
// Cada projeto com prazo ganha a Final principal nessa data (prazo = Final principal).
migrate(
  (app) => {
    const A =
      "@request.auth.id != '' && @request.auth.active = true && @request.auth.session_expires_at > @now"
    const escopo = (p) =>
      A +
      " && (@request.auth.role = 'admin' || @request.auth.role = 'administrativo' || @request.auth.ve_cronograma = true || " +
      p +
      'coordenador = @request.auth.id || ' +
      p +
      'membros.id ?= @request.auth.id)'
    const projetos = app.findCollectionByNameOrId('projetos')
    const cards = app.findCollectionByNameOrId('projeto_disciplinas')
    const datas = [
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ]
    const usuario = (name) => ({
      name: name,
      type: 'relation',
      collectionId: '_pb_users_auth_',
      cascadeDelete: false,
      maxSelect: 1,
    })

    const feriados = new Collection({
      name: 'feriados',
      type: 'base',
      listRule: A,
      viewRule: A,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'data', type: 'date', required: true },
        { name: 'nome', type: 'text', required: true, max: 120 },
        {
          name: 'abrangencia',
          type: 'select',
          maxSelect: 1,
          values: [
            'nacional',
            'estadual_sp',
            'municipal_sp',
            'ponto_facultativo',
            'municipal_outro',
            'empresa',
          ],
        },
        { name: 'origem', type: 'select', maxSelect: 1, values: ['gerado', 'manual'] },
        { name: 'ativo', type: 'bool' },
        usuario('criado_por'),
      ].concat(datas),
      indexes: ['CREATE INDEX idx_feriados_data ON feriados (data)'],
    })
    app.save(feriados)

    const entregas = new Collection({
      name: 'entregas',
      type: 'base',
      listRule: escopo('projeto.'),
      viewRule: escopo('projeto.'),
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'projeto',
          type: 'relation',
          required: true,
          collectionId: projetos.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['previa', 'final', 'revisao', 'outro'],
        },
        { name: 'descricao', type: 'text', max: 300 },
        { name: 'data', type: 'date', required: true },
        {
          name: 'disciplinas',
          type: 'relation',
          collectionId: cards.id,
          cascadeDelete: false,
          maxSelect: 50,
        },
        { name: 'principal', type: 'bool' },
        { name: 'numero_revisao', type: 'number', onlyInt: true, min: 0 },
        { name: 'revisao_de', type: 'text', max: 15 },
        { name: 'entregue', type: 'bool' },
        { name: 'entregue_em', type: 'date' },
        usuario('entregue_por'),
        { name: 'art_pendente', type: 'bool' },
        { name: 'art_entregue', type: 'bool' },
        { name: 'art_em', type: 'date' },
        usuario('art_por'),
        { name: 'origem', type: 'select', maxSelect: 1, values: ['central', 'planner'] },
        { name: 'lote_importacao', type: 'text', max: 40 },
      ].concat(datas),
      indexes: [
        'CREATE INDEX idx_entregas_data ON entregas (data)',
        'CREATE INDEX idx_entregas_projeto ON entregas (projeto, data)',
      ],
    })
    app.save(entregas)

    const alocacoes = new Collection({
      name: 'entrega_alocacoes',
      type: 'base',
      listRule: escopo('entrega.projeto.'),
      viewRule: escopo('entrega.projeto.'),
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'entrega',
          type: 'relation',
          required: true,
          collectionId: entregas.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        usuario('pessoa'),
        { name: 'pessoa_texto', type: 'text', max: 80 },
        { name: 'inicio', type: 'date', required: true },
        { name: 'fim', type: 'date', required: true },
        { name: 'janela_definida', type: 'bool' },
      ].concat(datas),
      indexes: [
        'CREATE INDEX idx_alocacoes_entrega ON entrega_alocacoes (entrega)',
        'CREATE INDEX idx_alocacoes_periodo ON entrega_alocacoes (inicio, fim)',
        'CREATE INDEX idx_alocacoes_pessoa ON entrega_alocacoes (pessoa)',
      ],
    })
    app.save(alocacoes)

    const historico = new Collection({
      name: 'entrega_historico',
      type: 'base',
      listRule: escopo('projeto.'),
      viewRule: escopo('projeto.'),
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'entrega',
          type: 'relation',
          required: true,
          collectionId: entregas.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'projeto',
          type: 'relation',
          required: true,
          collectionId: projetos.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'acao', type: 'text', required: true, max: 40 },
        { name: 'antes', type: 'text', max: 2000 },
        { name: 'depois', type: 'text', max: 2000 },
        usuario('autor'),
        { name: 'detalhes', type: 'json', maxSize: 4000 },
      ].concat(datas),
      indexes: [
        'CREATE INDEX idx_entrega_historico ON entrega_historico (entrega, created)',
        'CREATE INDEX idx_entrega_historico_proj ON entrega_historico (projeto, created)',
      ],
    })
    app.save(historico)

    // apontamento de tempo ligado à entrega (usado na etapa do timer)
    const tempo = app.findCollectionByNameOrId('tempo_eventos')
    if (!tempo.fields.getByName('entrega')) {
      tempo.fields.add(
        new RelationField({
          name: 'entrega',
          collectionId: entregas.id,
          cascadeDelete: false,
          maxSelect: 1,
        }),
      )
    }
    if (!tempo.fields.getByName('fora_da_janela')) {
      tempo.fields.add(new BoolField({ name: 'fora_da_janela' }))
    }
    app.save(tempo)

    // Final principal dos projetos que já existem (prazo = Final principal)
    for (const p of app.findRecordsByFilter('projetos', "prazo != ''", 'created', 0, 0)) {
      const f = new Record(entregas)
      f.set('projeto', p.id)
      f.set('tipo', 'final')
      f.set('principal', true)
      f.set('data', p.getString('prazo').slice(0, 10) + ' 12:00:00.000Z')
      f.set('origem', 'central')
      app.save(f)
      const h = new Record(historico)
      h.set('entrega', f.id)
      h.set('projeto', p.id)
      h.set('acao', 'criada')
      h.set('depois', p.getString('prazo').slice(0, 10))
      h.set('detalhes', {
        origem: 'carga inicial (prazo do projeto)',
        tipo: 'final',
        principal: true,
      })
      app.save(h)
    }
  },
  (app) => {
    const tempo = app.findCollectionByNameOrId('tempo_eventos')
    tempo.fields.removeByName('entrega')
    tempo.fields.removeByName('fora_da_janela')
    app.save(tempo)
    for (const n of ['entrega_historico', 'entrega_alocacoes', 'entregas', 'feriados']) {
      try {
        app.delete(app.findCollectionByNameOrId(n))
      } catch (_) {}
    }
  },
)
