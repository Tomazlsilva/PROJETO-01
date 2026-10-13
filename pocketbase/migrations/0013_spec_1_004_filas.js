// SPEC-1-004 — filas, prioridades e bloqueios.
// - card (projeto_disciplinas) ganha prioridade e prazo próprios (vazio = herda do projeto);
// - histórico do card passa a registrar alterações (responsável, prioridade, prazo)
//   e revisões de bloqueio, sempre com antes/depois, autor e horário;
// - índice para montar a fila do dono de bloqueio (o de responsável já existe desde a 0006).
migrate(
  (app) => {
    const pd = app.findCollectionByNameOrId('projeto_disciplinas')
    if (!pd.fields.getByName('prioridade')) {
      pd.fields.add(
        new SelectField({
          name: 'prioridade',
          values: ['Baixa', 'Normal', 'Alta', 'Urgente'],
          maxSelect: 1,
        }),
      )
    }
    if (!pd.fields.getByName('prazo')) pd.fields.add(new DateField({ name: 'prazo' }))
    pd.addIndex('idx_projeto_disciplinas_bloqueio_dono', false, 'bloqueio_dono', '')
    app.save(pd)

    const t = app.findCollectionByNameOrId('transicoes')
    const tipo = t.fields.getByName('tipo')
    tipo.values = [
      'criacao',
      'transicao',
      'bloqueio',
      'desbloqueio',
      'remapeamento',
      'alteracao',
      'bloqueio_revisado',
    ]
    app.save(t)
  },
  (app) => {
    // os tipos novos do histórico permanecem (o histórico é somente de inclusão)
    const pd = app.findCollectionByNameOrId('projeto_disciplinas')
    pd.removeIndex('idx_projeto_disciplinas_bloqueio_dono')
    pd.fields.removeByName('prioridade')
    pd.fields.removeByName('prazo')
    app.save(pd)
  },
)
