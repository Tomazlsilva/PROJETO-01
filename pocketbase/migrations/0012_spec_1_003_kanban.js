// SPEC-1-003 — Kanban e fluxo configurável.
// - fluxo_versoes: configuração das 6 etapas (nome, ordem, ativa) e campos
//   obrigatórios por transição; cada alteração cria uma versão nova (reversível).
// - projeto_disciplinas vira o card do Kanban: etapa atual, bloqueio e campos da etapa.
// - transicoes: histórico somente de inclusão (transição, bloqueio, desbloqueio, remapeamento).
// Escrita apenas pelas rotas /backend/v1/cards* e /backend/v1/fluxo*.
migrate(
  (app) => {
    const A =
      "@request.auth.id != '' && @request.auth.active = true && @request.auth.session_expires_at > @now"

    const fluxo = new Collection({
      name: 'fluxo_versoes',
      type: 'base',
      listRule: A,
      viewRule: A,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'numero', type: 'number', required: true, onlyInt: true, min: 1 },
        { name: 'ativa', type: 'bool' },
        { name: 'config', type: 'json', required: true, maxSize: 20000 },
        { name: 'motivo', type: 'text', max: 500 },
        { name: 'restaurada_de', type: 'number', onlyInt: true },
        {
          name: 'autor',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_fluxo_versoes_numero ON fluxo_versoes (numero)'],
    })
    app.save(fluxo)

    const padrao = new Record(fluxo)
    padrao.set('numero', 1)
    padrao.set('ativa', true)
    padrao.set('motivo', 'Fluxo padrão da Fase 1')
    padrao.set('config', {
      etapas: [
        { chave: 'entrada_pendente', nome: 'Entrada pendente', ordem: 1, ativa: true },
        { chave: 'pronto', nome: 'Pronto', ordem: 2, ativa: true },
        { chave: 'em_elaboracao', nome: 'Em elaboração', ordem: 3, ativa: true },
        { chave: 'aguardando_revisao', nome: 'Aguardando revisão', ordem: 4, ativa: true },
        { chave: 'em_correcao', nome: 'Em correção', ordem: 5, ativa: true },
        { chave: 'aprovado', nome: 'Aprovado', ordem: 6, ativa: true },
      ],
      requisitos: {},
    })
    app.save(padrao)

    // ---------- cards (projeto_disciplinas) ----------
    const pd = app.findCollectionByNameOrId('projeto_disciplinas')
    const novos = [
      new SelectField({
        name: 'etapa',
        values: [
          'entrada_pendente',
          'pronto',
          'em_elaboracao',
          'aguardando_revisao',
          'em_correcao',
          'aprovado',
        ],
        maxSelect: 1,
      }),
      new BoolField({ name: 'bloqueado' }),
      new TextField({ name: 'bloqueio_motivo', max: 500 }),
      new RelationField({
        name: 'bloqueio_dono',
        collectionId: '_pb_users_auth_',
        maxSelect: 1,
        cascadeDelete: false,
      }),
      new DateField({ name: 'bloqueio_revisao' }),
      new DateField({ name: 'bloqueado_em' }),
      new TextField({ name: 'observacao', max: 2000 }),
      new URLField({ name: 'link_entrega' }),
    ]
    for (const f of novos) {
      if (!pd.fields.getByName(f.name)) pd.fields.add(f)
    }
    pd.addIndex('idx_projeto_disciplinas_etapa', false, 'etapa', '')
    app.save(pd)

    // ---------- histórico de transições ----------
    const projetos = app.findCollectionByNameOrId('projetos')
    const vis =
      A +
      " && (@request.auth.role = 'admin' || @request.auth.role = 'executivo' || projeto.coordenador = @request.auth.id || projeto.membros.id ?= @request.auth.id)"
    const transicoes = new Collection({
      name: 'transicoes',
      type: 'base',
      listRule: vis,
      viewRule: vis,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
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
        {
          name: 'tipo',
          type: 'select',
          required: true,
          values: ['criacao', 'transicao', 'bloqueio', 'desbloqueio', 'remapeamento'],
          maxSelect: 1,
        },
        { name: 'de', type: 'text', max: 40 },
        { name: 'para', type: 'text', max: 40 },
        { name: 'justificativa', type: 'text', max: 1000 },
        { name: 'detalhes', type: 'json', maxSize: 4000 },
        {
          name: 'autor',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_transicoes_card ON transicoes (card, created)',
        'CREATE INDEX idx_transicoes_projeto ON transicoes (projeto, created)',
      ],
    })
    app.save(transicoes)

    // Cards existentes começam em Entrada pendente, com registro de criação
    for (const c of app.findRecordsByFilter('projeto_disciplinas', "id != ''", 'created', 0, 0)) {
      if (!c.getString('etapa')) {
        c.set('etapa', 'entrada_pendente')
        c.set('bloqueado', false)
        app.save(c)
      }
      const t = new Record(transicoes)
      t.set('card', c.id)
      t.set('projeto', c.getString('projeto'))
      t.set('tipo', 'criacao')
      t.set('para', c.getString('etapa'))
      t.set('detalhes', { origem: 'carga inicial' })
      app.save(t)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('transicoes'))
    } catch (_) {}
    const pd = app.findCollectionByNameOrId('projeto_disciplinas')
    pd.removeIndex('idx_projeto_disciplinas_etapa')
    for (const n of [
      'etapa',
      'bloqueado',
      'bloqueio_motivo',
      'bloqueio_dono',
      'bloqueio_revisao',
      'bloqueado_em',
      'observacao',
      'link_entrega',
    ]) {
      pd.fields.removeByName(n)
    }
    app.save(pd)
    try {
      app.delete(app.findCollectionByNameOrId('fluxo_versoes'))
    } catch (_) {}
  },
)
