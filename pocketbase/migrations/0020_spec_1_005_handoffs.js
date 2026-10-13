// SPEC-1-005 — handoffs e recuperação de falhas.
// - atividades: pendência criada para o próximo responsável quando o card muda de etapa
//   (chave idempotente = transição); recebida/concluída/cancelada/devolvida.
// - handoff_eventos: caixa de eventos/falhas (motivo, tentativas, próxima ação, histórico
//   de reprocessamento). Destino ausente/inativo → pendência vai ao coordenador.
// - notificacoes: aviso interno persistente (não lida → lida) ligado à atividade.
// - card ganha "revisor" (destino do handoff para Aguardando revisão).
// - transicoes ganha "idempotencia" (repetir a mesma requisição não duplica) e tipo "handoff".
// Escrita só pelas rotas /backend/v1/cards*, /atividades*, /handoffs*, /notificacoes*.
migrate(
  (app) => {
    const A =
      "@request.auth.id != '' && @request.auth.active = true && @request.auth.session_expires_at > @now"
    const pd = app.findCollectionByNameOrId('projeto_disciplinas')
    const projetos = app.findCollectionByNameOrId('projetos')
    if (!pd.fields.getByName('revisor')) {
      pd.fields.add(
        new RelationField({
          name: 'revisor',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          cascadeDelete: false,
        }),
      )
    }
    app.save(pd)

    const t = app.findCollectionByNameOrId('transicoes')
    t.fields.getByName('tipo').values = [
      'criacao',
      'transicao',
      'bloqueio',
      'desbloqueio',
      'remapeamento',
      'alteracao',
      'bloqueio_revisado',
      'handoff',
    ]
    if (!t.fields.getByName('idempotencia'))
      t.fields.add(new TextField({ name: 'idempotencia', max: 64 }))
    t.addIndex('idx_transicoes_idempotencia', true, 'idempotencia', "idempotencia != ''")
    app.save(t)

    const vis =
      A +
      " && (@request.auth.role = 'admin' || @request.auth.role = 'executivo' || projeto.coordenador = @request.auth.id || projeto.membros.id ?= @request.auth.id)"
    const atividades = new Collection({
      name: 'atividades',
      type: 'base',
      listRule: vis,
      viewRule: vis,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'chave', type: 'text', required: true, max: 80 },
        {
          name: 'card',
          type: 'relation',
          required: true,
          collectionId: pd.id,
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
        { name: 'evento', type: 'text', max: 15 },
        { name: 'etapa', type: 'text', max: 40 },
        { name: 'etapa_origem', type: 'text', max: 40 },
        {
          name: 'destinatario',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'remetente',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['pendente', 'recebida', 'concluida', 'cancelada', 'devolvida'],
          maxSelect: 1,
        },
        { name: 'precisa_ajuste', type: 'bool' },
        { name: 'motivo_ajuste', type: 'text', max: 300 },
        { name: 'recebida_em', type: 'date' },
        { name: 'encerrada_em', type: 'date' },
        {
          name: 'encerrada_por',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'encerramento', type: 'text', max: 1000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_atividades_chave ON atividades (chave)',
        'CREATE INDEX idx_atividades_destinatario ON atividades (destinatario, status)',
        'CREATE INDEX idx_atividades_card ON atividades (card, status)',
      ],
    })
    app.save(atividades)

    const eventos = new Collection({
      name: 'handoff_eventos',
      type: 'base',
      listRule: A + " && (@request.auth.role = 'admin' || projeto.coordenador = @request.auth.id)",
      viewRule: A + " && (@request.auth.role = 'admin' || projeto.coordenador = @request.auth.id)",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'chave', type: 'text', required: true, max: 80 },
        {
          name: 'card',
          type: 'relation',
          required: true,
          collectionId: pd.id,
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
        { name: 'transicao', type: 'text', max: 15 },
        { name: 'atividade', type: 'text', max: 15 },
        { name: 'etapa_origem', type: 'text', max: 40 },
        { name: 'etapa_destino', type: 'text', max: 40 },
        {
          name: 'destino_esperado',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['entregue', 'falha', 'obsoleto'],
          maxSelect: 1,
        },
        { name: 'motivo', type: 'text', max: 300 },
        { name: 'proxima_acao', type: 'text', max: 300 },
        { name: 'tentativas', type: 'number', onlyInt: true, min: 0 },
        { name: 'historico', type: 'json', maxSize: 20000 },
        { name: 'resolvido_em', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_handoff_eventos_chave ON handoff_eventos (chave)',
        'CREATE INDEX idx_handoff_eventos_status ON handoff_eventos (status, projeto)',
      ],
    })
    app.save(eventos)

    const notificacoes = new Collection({
      name: 'notificacoes',
      type: 'base',
      listRule: A + ' && destinatario = @request.auth.id',
      viewRule: A + ' && destinatario = @request.auth.id',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'destinatario',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'atividade', type: 'text', max: 15 },
        { name: 'card', type: 'text', max: 15 },
        { name: 'projeto', type: 'text', max: 15 },
        { name: 'titulo', type: 'text', max: 200 },
        { name: 'texto', type: 'text', max: 1000 },
        { name: 'lida', type: 'bool' },
        { name: 'lida_em', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_notificacoes_dest ON notificacoes (destinatario, lida, created)'],
    })
    app.save(notificacoes)
  },
  (app) => {
    for (const n of ['notificacoes', 'handoff_eventos', 'atividades']) {
      try {
        app.delete(app.findCollectionByNameOrId(n))
      } catch (_) {}
    }
    const t = app.findCollectionByNameOrId('transicoes')
    t.removeIndex('idx_transicoes_idempotencia')
    t.fields.removeByName('idempotencia')
    app.save(t)
    const pd = app.findCollectionByNameOrId('projeto_disciplinas')
    pd.fields.removeByName('revisor')
    app.save(pd)
  },
)
