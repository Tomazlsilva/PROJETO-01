// SPEC-1-006 — touch time e baseline em modo sombra.
// - tempo_eventos: apontamentos (timer com pausas), linhas históricas importadas e
//   correções (nova versão; o evento original permanece). Grupo "antes" só vem da
//   importação histórica; tudo que nasce na Central é "depois".
// - um único timer aberto (ativo/pausado) por usuário — índice único parcial.
// - tempo_importacoes: relatório de cada importação (arquivo, autor, aceitas, erros por linha).
// Escrita só pelas rotas /backend/v1/tempo*.
migrate(
  (app) => {
    const A =
      "@request.auth.id != '' && @request.auth.active = true && @request.auth.session_expires_at > @now"
    const pd = app.findCollectionByNameOrId('projeto_disciplinas')
    const projetos = app.findCollectionByNameOrId('projetos')
    const U = '_pb_users_auth_'
    const eventos = new Collection({
      name: 'tempo_eventos',
      type: 'base',
      listRule:
        A +
        " && (@request.auth.role = 'admin' || @request.auth.role = 'executivo' || usuario = @request.auth.id || projeto.coordenador = @request.auth.id)",
      viewRule:
        A +
        " && (@request.auth.role = 'admin' || @request.auth.role = 'executivo' || usuario = @request.auth.id || projeto.coordenador = @request.auth.id)",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'usuario', type: 'relation', collectionId: U, cascadeDelete: false, maxSelect: 1 },
        { name: 'card', type: 'relation', collectionId: pd.id, cascadeDelete: false, maxSelect: 1 },
        {
          name: 'projeto',
          type: 'relation',
          collectionId: projetos.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'projeto_nome', type: 'text', max: 300 },
        { name: 'disciplina_nome', type: 'text', max: 120 },
        { name: 'tipologia', type: 'text', max: 120 },
        { name: 'etapa', type: 'text', max: 40 },
        {
          name: 'categoria',
          type: 'select',
          required: true,
          values: ['elaboracao', 'revisao', 'espera'],
          maxSelect: 1,
        },
        {
          name: 'grupo',
          type: 'select',
          required: true,
          values: ['antes', 'depois'],
          maxSelect: 1,
        },
        {
          name: 'origem',
          type: 'select',
          required: true,
          values: ['timer', 'importacao', 'correcao'],
          maxSelect: 1,
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['ativo', 'pausado', 'encerrado', 'pendente_revisao'],
          maxSelect: 1,
        },
        { name: 'segmentos', type: 'json', maxSize: 20000 },
        { name: 'segmento_aberto_em', type: 'date' },
        { name: 'inicio', type: 'date' },
        { name: 'fim', type: 'date' },
        { name: 'duracao_seg', type: 'number', onlyInt: true, min: 0 },
        { name: 'revisado', type: 'bool' },
        { name: 'revisao_motivo', type: 'text', max: 1000 },
        {
          name: 'revisado_por',
          type: 'relation',
          collectionId: U,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'substitui', type: 'text', max: 15 },
        { name: 'substituido', type: 'bool' },
        { name: 'substituido_por', type: 'text', max: 15 },
        { name: 'correcao_motivo', type: 'text', max: 1000 },
        {
          name: 'corrigido_por',
          type: 'relation',
          collectionId: U,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'excluido', type: 'bool' },
        { name: 'exclusao_motivo', type: 'text', max: 1000 },
        {
          name: 'excluido_por',
          type: 'relation',
          collectionId: U,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'importacao', type: 'text', max: 15 },
        { name: 'arquivo', type: 'text', max: 200 },
        { name: 'linha', type: 'number', onlyInt: true, min: 0 },
        { name: 'fonte', type: 'text', max: 200 },
        { name: 'qualidade', type: 'text', max: 40 },
        { name: 'data_referencia', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_tempo_um_timer ON tempo_eventos (usuario) WHERE status = 'ativo' OR status = 'pausado'",
        'CREATE INDEX idx_tempo_card ON tempo_eventos (card, created)',
        'CREATE INDEX idx_tempo_grupo ON tempo_eventos (grupo, status)',
      ],
    })
    app.save(eventos)

    const imps = new Collection({
      name: 'tempo_importacoes',
      type: 'base',
      listRule: A + " && (@request.auth.role = 'admin' || @request.auth.role = 'executivo')",
      viewRule: A + " && (@request.auth.role = 'admin' || @request.auth.role = 'executivo')",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'arquivo', type: 'text', max: 200 },
        { name: 'autor', type: 'relation', collectionId: U, cascadeDelete: false, maxSelect: 1 },
        { name: 'total', type: 'number', onlyInt: true, min: 0 },
        { name: 'aceitas', type: 'number', onlyInt: true, min: 0 },
        { name: 'rejeitadas', type: 'number', onlyInt: true, min: 0 },
        { name: 'erros', type: 'json', maxSize: 200000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(imps)
  },
  (app) => {
    for (const n of ['tempo_importacoes', 'tempo_eventos']) {
      try {
        app.delete(app.findCollectionByNameOrId(n))
      } catch (_) {}
    }
  },
)
