// SPEC-1-007 (T1.36, CA-1-007-08/12) — backup manual, só administrador.
// Exporta as coleções de negócio (SQL bruto, preservando ids, datas e hashes de senha),
// calcula o SHA-256 do conteúdo, cifra com AES-256-GCM usando o secret BACKUP_KEY
// (32 caracteres, fora do banco) e guarda como arquivo protegido com validade de 90 dias.
// A chave nunca aparece em respostas, registros ou logs.
routerAdd(
  'POST',
  '/backend/v1/backups',
  (e) => {
    const auth = e.auth
    const expira = auth ? auth.getString('session_expires_at') : ''
    if (
      !auth ||
      !auth.getBool('active') ||
      !expira ||
      new Date(expira.replace(' ', 'T')) <= new Date()
    ) {
      throw new UnauthorizedError('Sessão inválida ou expirada.')
    }
    const auditar = (action, outcome, details) => {
      try {
        const r = new Record($app.findCollectionByNameOrId('auth_audit'))
        r.set('actor_id', auth.id)
        r.set('action', action)
        r.set('outcome', outcome)
        r.set('details', details)
        $app.save(r)
      } catch (err) {
        $app.logger().error('auditoria falhou', 'action', action)
      }
    }
    if (auth.getString('role') !== 'admin') {
      auditar('access.denied', 'blocked', { recurso: 'backups', motivo: 'papel' })
      throw new ForbiddenError('Acesso negado.')
    }

    let chave = ''
    try {
      chave = $secrets.get('BACKUP_KEY') || ''
    } catch (_) {}
    if (!chave) chave = $os.getenv('BACKUP_KEY') || ''

    const col = $app.findCollectionByNameOrId('backups')
    const reg = new Record(col)
    reg.set('origem', 'manual')
    reg.set('criado_por', auth.id)
    const validade = new Date(Date.now() + 90 * 86400000).toISOString().replace('T', ' ')
    reg.set('expira_em', validade)

    if (chave.length !== 32) {
      reg.set('status', 'falha')
      reg.set(
        'erro',
        'Chave de backup (BACKUP_KEY) ausente ou inválida — precisa ter 32 caracteres.',
      )
      $app.save(reg)
      auditar('backup.falha', 'failure', { backup: reg.id, motivo: 'sem_chave' })
      return e.json(409, {
        code: 'sem_chave',
        message:
          'A chave de backup não está configurada. Peça ao administrador técnico para cadastrar o secret BACKUP_KEY.',
        id: reg.id,
      })
    }

    const TABELAS = [
      'users',
      'clientes',
      'disciplinas',
      'projetos',
      'projeto_disciplinas',
      'projeto_historico',
      'revisoes',
      'fluxo_versoes',
      'transicoes',
      'atividades',
      'handoff_eventos',
      'notificacoes',
      'tempo_eventos',
      'tempo_importacoes',
      'auth_audit',
    ]
    const dados = { versao: 1, criado_em: new Date().toISOString(), colecoes: {} }
    const contagens = {}
    try {
      for (const t of TABELAS) {
        const info = arrayOf(new DynamicModel({ name: '' }))
        $app
          .db()
          .newQuery('PRAGMA table_info(' + t + ')')
          .all(info)
        const colunas = info.map((c) => c.name)
        const modelo = {}
        for (const c of colunas) modelo[c] = nullString()
        const linhas = arrayOf(new DynamicModel(modelo))
        $app
          .db()
          .newQuery(
            'SELECT ' +
              colunas.map((c) => '[[' + c + ']]').join(', ') +
              ' FROM ' +
              t +
              ' ORDER BY rowid',
          )
          .all(linhas)
        const valores = []
        for (const l of linhas) {
          const v = []
          for (const c of colunas) {
            const x = l[c]
            v.push(x === null || x === undefined ? null : String(x))
          }
          valores.push(v)
        }
        dados.colecoes[t] = { colunas: colunas, linhas: valores }
        contagens[t] = valores.length
      }
      const claro = JSON.stringify(dados)
      const sha = $security.sha256(claro)
      const cifrado = $security.encrypt(claro, chave)
      const nome = 'backup-' + new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '') + '.enc'
      reg.set('arquivo', $filesystem.fileFromBytes(cifrado, nome))
      reg.set('status', 'ok')
      reg.set('sha256', sha)
      reg.set('tamanho_bytes', cifrado.length)
      reg.set('contagens', contagens)
      $app.save(reg)
    } catch (err) {
      $app.logger().error('backup falhou', 'erro', String(err).slice(0, 300))
      const f = new Record(col)
      f.set('origem', 'manual')
      f.set('criado_por', auth.id)
      f.set('expira_em', validade)
      f.set('status', 'falha')
      f.set('erro', String(err).replace(chave, '***').slice(0, 480))
      $app.save(f)
      auditar('backup.falha', 'failure', { backup: f.id })
      return e.json(500, {
        code: 'falha',
        message: 'O backup falhou. Veja o registro de backups.',
        id: f.id,
      })
    }
    auditar('backup.criado', 'success', {
      backup: reg.id,
      sha256: reg.getString('sha256'),
      contagens: contagens,
    })
    return e.json(201, {
      id: reg.id,
      status: 'ok',
      sha256: reg.getString('sha256'),
      tamanho_bytes: reg.getInt('tamanho_bytes'),
      contagens: contagens,
      expira_em: reg.getString('expira_em'),
    })
  },
  $apis.requireAuth('users'),
)
