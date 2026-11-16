// SPEC-2-003 (T2.07–T2.09) — rodadas de revisão do coordenador, item a item, com retorno
// para correção, nova rodada e exceção técnica. Leitura e gravação só pelas rotas
// /backend/v1/cards/{id}/revisao* e pela mudança de etapa (cards_mover) — regras null.
migrate(
  (app) => {
    const cards = app.findCollectionByNameOrId('projeto_disciplinas')
    const projetos = app.findCollectionByNameOrId('projetos')
    const aplicados = app.findCollectionByNameOrId('checklists_aplicados')
    const rel = (name, col, required) => ({
      name: name,
      type: 'relation',
      required: !!required,
      collectionId: col,
      cascadeDelete: false,
      maxSelect: 1,
    })
    const rodadas = new Collection({
      name: 'revisao_rodadas',
      type: 'base',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        rel('card', cards.id, true),
        rel('projeto', projetos.id, true),
        rel('aplicado', aplicados.id),
        { name: 'numero', type: 'number', required: true, onlyInt: true, min: 1 },
        {
          name: 'status',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['aberta', 'encerrada'],
        },
        {
          name: 'resultado',
          type: 'select',
          maxSelect: 1,
          values: ['aprovado', 'aprovado_com_excecao', 'reprovado'],
        },
        { name: 'sem_checklist', type: 'bool' },
        // { itemId: { resultado, observacao, justificativa, autor, em, excecao_por,
        //             corrigido, correcao_nota, corrigido_por, corrigido_em } }
        { name: 'itens', type: 'json', maxSize: 400000 },
        { name: 'motivo', type: 'text', max: 1000 },
        rel('responsavel_correcao', '_pb_users_auth_'),
        rel('aberta_por', '_pb_users_auth_'),
        rel('encerrada_por', '_pb_users_auth_'),
        { name: 'encerrada_em', type: 'date' },
        // reaberturas: versões anteriores da rodada (antes, quem, quando, justificativa)
        { name: 'historico', type: 'json', maxSize: 400000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_rev_rodada_num ON revisao_rodadas (card, numero)',
        'CREATE INDEX idx_rev_rodada_proj ON revisao_rodadas (projeto, created)',
        "CREATE UNIQUE INDEX idx_rev_rodada_aberta ON revisao_rodadas (card) WHERE status = 'aberta'",
      ],
    })
    app.save(rodadas)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('revisao_rodadas'))
    } catch (_) {}
  },
)
