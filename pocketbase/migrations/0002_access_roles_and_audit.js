migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    if (!users.fields.getByName('role')) {
      users.fields.add(
        new SelectField({
          name: 'role',
          values: ['admin', 'coordenador', 'projetista', 'revisor', 'executivo'],
          maxSelect: 1,
        }),
      )
    }
    if (!users.fields.getByName('active')) {
      users.fields.add(new BoolField({ name: 'active' }))
    }
    if (!users.fields.getByName('failed_attempts')) {
      users.fields.add(new NumberField({ name: 'failed_attempts', onlyInt: true, min: 0 }))
    }
    if (!users.fields.getByName('locked_until')) {
      users.fields.add(new DateField({ name: 'locked_until' }))
    }
    if (!users.fields.getByName('session_issued_at')) {
      users.fields.add(new DateField({ name: 'session_issued_at' }))
    }

    users.listRule =
      "@request.auth.id != '' && (id = @request.auth.id || @request.auth.role = 'admin')"
    users.viewRule =
      "@request.auth.id != '' && (id = @request.auth.id || @request.auth.role = 'admin')"
    users.createRule = "@request.auth.role = 'admin'"
    users.updateRule =
      "@request.auth.id != '' && (id = @request.auth.id || @request.auth.role = 'admin')"
    users.deleteRule = "@request.auth.role = 'admin'"
    app.save(users)

    try {
      const owner = app.findAuthRecordByEmail(
        '_pb_users_auth_',
        'alessandro@gavazziengenharia.com.br',
      )
      owner.set('role', 'admin')
      owner.set('active', true)
      owner.set('failed_attempts', 0)
      app.save(owner)
    } catch (_) {}

    if (!app.hasTable('auth_audit')) {
      const audit = new Collection({
        name: 'auth_audit',
        type: 'base',
        listRule: "@request.auth.role = 'admin'",
        viewRule: "@request.auth.role = 'admin'",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'actor_id', type: 'text', max: 15 },
          { name: 'target_id', type: 'text', max: 15 },
          { name: 'action', type: 'text', required: true, max: 80 },
          {
            name: 'outcome',
            type: 'select',
            values: ['success', 'failure', 'blocked'],
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
      })
      app.save(audit)
    }
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.fields.removeByName('role')
    users.fields.removeByName('active')
    users.fields.removeByName('failed_attempts')
    users.fields.removeByName('locked_until')
    users.fields.removeByName('session_issued_at')
    app.save(users)
    try {
      app.delete(app.findCollectionByNameOrId('auth_audit'))
    } catch (_) {}
  },
)
