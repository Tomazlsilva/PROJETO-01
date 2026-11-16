// SPEC-2-002 (T2.04/T2.05) — checklist aplicado e congelado em cada disciplina do projeto,
// marcação por item, pendência de entrada (motivo, dono, prazo) e histórico.
// Tudo é lido e gravado só pelas rotas /backend/v1/cards/{id}/checklists* (regras null).
// Modelo de exemplo nunca é aplicado: só modelos reais publicados e vigentes.
migrate(
  (app) => {
    const cards = app.findCollectionByNameOrId('projeto_disciplinas')
    const projetos = app.findCollectionByNameOrId('projetos')
    const modelos = app.findCollectionByNameOrId('checklist_modelos')
    const versoes = app.findCollectionByNameOrId('checklist_versoes')
    const datas = [
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ]
    const rel = (name, col, required) => ({
      name: name,
      type: 'relation',
      required: !!required,
      collectionId: col,
      cascadeDelete: false,
      maxSelect: 1,
    })
    const fechada = {
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
    }

    const aplicados = new Collection(
      Object.assign(
        {
          name: 'checklists_aplicados',
          type: 'base',
          fields: [
            rel('card', cards.id, true),
            rel('projeto', projetos.id, true),
            {
              name: 'tipo',
              type: 'select',
              required: true,
              maxSelect: 1,
              values: ['entrada', 'revisao'],
            },
            rel('modelo', modelos.id, true),
            rel('versao', versoes.id, true),
            { name: 'numero', type: 'number', required: true, onlyInt: true, min: 1 },
            { name: 'itens', type: 'json', required: true, maxSize: 200000 },
            { name: 'resultados', type: 'json', maxSize: 400000 },
            { name: 'etapa', type: 'text', max: 40 },
            { name: 'origem', type: 'select', maxSelect: 1, values: ['etapa', 'manual'] },
            rel('aplicado_por', '_pb_users_auth_'),
          ].concat(datas),
          indexes: [
            'CREATE UNIQUE INDEX idx_chk_aplicado_card_tipo ON checklists_aplicados (card, tipo)',
            'CREATE INDEX idx_chk_aplicado_projeto ON checklists_aplicados (projeto)',
          ],
        },
        fechada,
      ),
    )
    app.save(aplicados)

    const pendencias = new Collection(
      Object.assign(
        {
          name: 'checklist_pendencias',
          type: 'base',
          fields: [
            rel('aplicado', aplicados.id, true),
            rel('card', cards.id, true),
            rel('projeto', projetos.id, true),
            { name: 'item_id', type: 'text', required: true, max: 20 },
            { name: 'item_texto', type: 'text', max: 500 },
            { name: 'critico', type: 'bool' },
            { name: 'motivo', type: 'text', required: true, max: 500 },
            rel('dono', '_pb_users_auth_', true),
            { name: 'prazo', type: 'date', required: true },
            {
              name: 'status',
              type: 'select',
              required: true,
              maxSelect: 1,
              values: ['aberta', 'resolvida'],
            },
            { name: 'resolucao', type: 'text', max: 500 },
            rel('resolvida_por', '_pb_users_auth_'),
            { name: 'resolvida_em', type: 'date' },
            rel('aberta_por', '_pb_users_auth_'),
          ].concat(datas),
          indexes: [
            'CREATE INDEX idx_chk_pend_dono ON checklist_pendencias (dono, status)',
            'CREATE INDEX idx_chk_pend_card ON checklist_pendencias (card, status)',
          ],
        },
        fechada,
      ),
    )
    app.save(pendencias)

    const eventos = new Collection(
      Object.assign(
        {
          name: 'checklist_eventos',
          type: 'base',
          fields: [
            rel('aplicado', aplicados.id),
            rel('card', cards.id, true),
            rel('projeto', projetos.id, true),
            { name: 'tipo', type: 'text', max: 20 },
            { name: 'acao', type: 'text', required: true, max: 40 },
            { name: 'item_id', type: 'text', max: 20 },
            { name: 'item_texto', type: 'text', max: 500 },
            { name: 'antes', type: 'text', max: 40 },
            { name: 'depois', type: 'text', max: 40 },
            { name: 'justificativa', type: 'text', max: 1000 },
            { name: 'detalhes', type: 'json', maxSize: 4000 },
            rel('autor', '_pb_users_auth_'),
          ].concat(datas),
          indexes: ['CREATE INDEX idx_chk_eventos_card ON checklist_eventos (card, created)'],
        },
        fechada,
      ),
    )
    app.save(eventos)

    // padrão de aplicação na configuração vigente do fluxo (entra no histórico de configuração
    // quando o administrador salvar uma versão nova)
    const ativas = app.findRecordsByFilter('fluxo_versoes', 'ativa = true', '-numero', 1, 0)
    if (ativas.length > 0) {
      const cfg = JSON.parse(ativas[0].getString('config') || '{}')
      if (!cfg.checklists) {
        cfg.checklists = { entrada: 'entrada_pendente', revisao: 'aguardando_revisao' }
        ativas[0].set('config', cfg)
        app.save(ativas[0])
      }
    }
  },
  (app) => {
    for (const n of ['checklist_eventos', 'checklist_pendencias', 'checklists_aplicados']) {
      try {
        app.delete(app.findCollectionByNameOrId(n))
      } catch (_) {}
    }
  },
)
