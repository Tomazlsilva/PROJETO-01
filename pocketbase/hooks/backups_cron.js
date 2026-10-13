// SPEC-1-007 (T1.36, CA-1-007-12) — backup automático diário às 06:00 UTC (03:00 de Brasília)
// e remoção dos backups com mais de 90 dias. Mesmo formato do backup manual.
cronAdd('backup_diario', '0 6 * * *', () => {
  let chave = ''
  try {
    chave = $secrets.get('BACKUP_KEY') || ''
  } catch (_) {}
  if (!chave) chave = $os.getenv('BACKUP_KEY') || ''
  const col = $app.findCollectionByNameOrId('backups')
  const validade = new Date(Date.now() + 90 * 86400000).toISOString().replace('T', ' ')
  const falha = (msg) => {
    const f = new Record(col)
    f.set('origem', 'automatico')
    f.set('expira_em', validade)
    f.set('status', 'falha')
    f.set('erro', msg)
    $app.save(f)
    const r = new Record($app.findCollectionByNameOrId('auth_audit'))
    r.set('action', 'backup.falha')
    r.set('outcome', 'failure')
    r.set('details', { backup: f.id, origem: 'automatico' })
    $app.save(r)
  }
  if (chave.length !== 32) {
    falha('Chave de backup (BACKUP_KEY) ausente ou inválida — precisa ter 32 caracteres.')
  } else {
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
    try {
      const dados = { versao: 1, criado_em: new Date().toISOString(), colecoes: {} }
      const contagens = {}
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
      const cifrado = $security.encrypt(claro, chave)
      const reg = new Record(col)
      reg.set('origem', 'automatico')
      reg.set('expira_em', validade)
      reg.set(
        'arquivo',
        $filesystem.fileFromBytes(
          cifrado,
          'backup-' + new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '') + '.enc',
        ),
      )
      reg.set('status', 'ok')
      reg.set('sha256', $security.sha256(claro))
      reg.set('tamanho_bytes', cifrado.length)
      reg.set('contagens', contagens)
      $app.save(reg)
      const r = new Record($app.findCollectionByNameOrId('auth_audit'))
      r.set('action', 'backup.criado')
      r.set('outcome', 'success')
      r.set('details', { backup: reg.id, origem: 'automatico', contagens: contagens })
      $app.save(r)
    } catch (err) {
      $app.logger().error('backup automático falhou', 'erro', String(err).slice(0, 300))
      try {
        falha(String(err).replace(chave, '***').slice(0, 480))
      } catch (_) {}
    }
  }
  const agora = new Date().toISOString().replace('T', ' ')
  for (const b of $app.findRecordsByFilter(
    'backups',
    "expira_em != '' && expira_em < {:a}",
    'expira_em',
    1000,
    0,
    { a: agora },
  )) {
    try {
      $app.delete(b)
    } catch (err) {
      $app.logger().error('remoção de backup vencido falhou', 'backup', b.id)
    }
  }
})
