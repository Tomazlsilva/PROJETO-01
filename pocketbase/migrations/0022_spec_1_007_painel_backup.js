// SPEC-1-007 — painel, auditoria, adoção, exportação e backup.
// - backups: cópias criptografadas (AES-256-GCM) dos dados de negócio, com hash do conteúdo,
//   contagem por coleção, validade de 90 dias e resultado da última verificação.
//   O arquivo é protegido e só o administrador o vê; a chave NÃO fica no banco
//   (secret BACKUP_KEY do Skip Cloud).
// - índices para as consultas do painel e da auditoria.
migrate(
  (app) => {
    const A =
      "@request.auth.id != '' && @request.auth.active = true && @request.auth.session_expires_at > @now"
    const backups = new Collection({
      name: 'backups',
      type: 'base',
      listRule: A + " && @request.auth.role = 'admin'",
      viewRule: A + " && @request.auth.role = 'admin'",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'arquivo', type: 'file', maxSelect: 1, maxSize: 200000000, protected: true },
        { name: 'status', type: 'select', required: true, values: ['ok', 'falha'], maxSelect: 1 },
        { name: 'origem', type: 'select', values: ['manual', 'automatico'], maxSelect: 1 },
        { name: 'erro', type: 'text', max: 500 },
        { name: 'tamanho_bytes', type: 'number', onlyInt: true, min: 0 },
        { name: 'sha256', type: 'text', max: 64 },
        { name: 'contagens', type: 'json', maxSize: 20000 },
        {
          name: 'criado_por',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'expira_em', type: 'date' },
        { name: 'verificado_em', type: 'date' },
        { name: 'verificacao', type: 'json', maxSize: 20000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_backups_expira ON backups (expira_em)'],
    })
    app.save(backups)

    const audit = app.findCollectionByNameOrId('auth_audit')
    audit.addIndex('idx_auth_audit_created', false, 'created', '')
    app.save(audit)
    const t = app.findCollectionByNameOrId('transicoes')
    t.addIndex('idx_transicoes_created', false, 'created', '')
    app.save(t)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('backups'))
    } catch (_) {}
    const audit = app.findCollectionByNameOrId('auth_audit')
    audit.removeIndex('idx_auth_audit_created')
    app.save(audit)
    const t = app.findCollectionByNameOrId('transicoes')
    t.removeIndex('idx_transicoes_created')
    app.save(t)
  },
)
