// SPEC-2-004 (T2.11/T2.12) — emissão da disciplina (só com revisão aprovada), ligada à entrega
// do calendário, e correções recebidas depois da emissão (origem, severidade, decisão).
// Leitura e gravação só pelas rotas /backend/v1/cards/{id}/emissoes* — regras null.
migrate(
  (app) => {
    const cards = app.findCollectionByNameOrId('projeto_disciplinas')
    const projetos = app.findCollectionByNameOrId('projetos')
    const rodadas = app.findCollectionByNameOrId('revisao_rodadas')
    const entregas = app.findCollectionByNameOrId('entregas')
    const rel = (name, col, required) => ({
      name: name,
      type: 'relation',
      required: !!required,
      collectionId: col,
      cascadeDelete: false,
      maxSelect: 1,
    })
    const datas = [
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ]
    const fechada = {
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
    }

    const emissoes = new Collection(
      Object.assign(
        {
          name: 'emissoes',
          type: 'base',
          fields: [
            rel('card', cards.id, true),
            rel('projeto', projetos.id, true),
            rel('rodada', rodadas.id, true),
            rel('entrega', entregas.id, true),
            {
              name: 'tipo',
              type: 'select',
              maxSelect: 1,
              values: ['previa', 'final', 'revisao', 'outro'],
            },
            { name: 'rotulo', type: 'text', required: true, max: 20 },
            { name: 'numero_revisao', type: 'number', onlyInt: true, min: 0 },
            { name: 'data', type: 'date', required: true },
            { name: 'destinatario', type: 'text', max: 300 },
            rel('responsavel', '_pb_users_auth_', true),
            {
              name: 'status',
              type: 'select',
              required: true,
              maxSelect: 1,
              values: ['emitida', 'cancelada'],
            },
            { name: 'entrega_criada', type: 'bool' },
            { name: 'cancelamento', type: 'text', max: 1000 },
            rel('cancelada_por', '_pb_users_auth_'),
            { name: 'cancelada_em', type: 'date' },
            rel('autor', '_pb_users_auth_'),
          ].concat(datas),
          indexes: [
            'CREATE INDEX idx_emissoes_card ON emissoes (card, created)',
            'CREATE INDEX idx_emissoes_proj ON emissoes (projeto, data)',
            'CREATE INDEX idx_emissoes_entrega ON emissoes (entrega)',
          ],
        },
        fechada,
      ),
    )
    app.save(emissoes)

    const correcoes = new Collection(
      Object.assign(
        {
          name: 'correcoes_pos_emissao',
          type: 'base',
          fields: [
            rel('emissao', emissoes.id, true),
            rel('card', cards.id, true),
            rel('projeto', projetos.id, true),
            {
              name: 'origem',
              type: 'select',
              required: true,
              maxSelect: 1,
              values: ['cliente', 'obra', 'interna'],
            },
            {
              name: 'severidade',
              type: 'select',
              required: true,
              maxSelect: 1,
              values: ['alta', 'media', 'baixa'],
            },
            { name: 'descricao', type: 'text', required: true, max: 2000 },
            { name: 'item_id', type: 'text', max: 20 },
            { name: 'item_texto', type: 'text', max: 500 },
            {
              name: 'decisao',
              type: 'select',
              required: true,
              maxSelect: 1,
              values: ['valida', 'invalida'],
            },
            { name: 'justificativa', type: 'text', max: 1000 },
            rel('decidido_por', '_pb_users_auth_'),
            { name: 'decidido_em', type: 'date' },
            { name: 'atividade', type: 'text', max: 15 },
            { name: 'historico', type: 'json', maxSize: 100000 },
            rel('autor', '_pb_users_auth_'),
          ].concat(datas),
          indexes: [
            'CREATE INDEX idx_correcoes_card ON correcoes_pos_emissao (card, created)',
            'CREATE INDEX idx_correcoes_proj ON correcoes_pos_emissao (projeto, created)',
            'CREATE INDEX idx_correcoes_emissao ON correcoes_pos_emissao (emissao)',
          ],
        },
        fechada,
      ),
    )
    app.save(correcoes)
  },
  (app) => {
    for (const n of ['correcoes_pos_emissao', 'emissoes']) {
      try {
        app.delete(app.findCollectionByNameOrId(n))
      } catch (_) {}
    }
  },
)
