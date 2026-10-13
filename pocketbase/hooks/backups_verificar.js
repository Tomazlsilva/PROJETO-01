// SPEC-1-007 (T1.36, CA-1-007-08) — verificação de integridade de um backup (só administrador):
// lê o arquivo, decifra com a chave, confere o SHA-256 e a contagem de cada coleção.
// Não toca nos dados de produção. O resultado fica registrado no próprio backup.
routerAdd(
  'POST',
  '/backend/v1/backups/{id}/verificar',
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
    let b = null
    try {
      b = $app.findRecordById('backups', e.request.pathValue('id'))
    } catch (_) {}
    if (!b) throw new NotFoundError('Backup não encontrado.')
    if (b.getString('status') !== 'ok' || !b.getString('arquivo')) {
      return e.json(409, {
        code: 'sem_arquivo',
        message: 'Este backup falhou e não tem arquivo para verificar.',
      })
    }
    let chave = ''
    try {
      chave = $secrets.get('BACKUP_KEY') || ''
    } catch (_) {}
    if (!chave) chave = $os.getenv('BACKUP_KEY') || ''
    if (chave.length !== 32)
      return e.json(409, { code: 'sem_chave', message: 'A chave de backup não está configurada.' })

    const res = {
      ok: false,
      sha_ok: false,
      decifrado: false,
      contagens_ok: false,
      colecoes: {},
      erro: '',
    }
    let fs = null
    try {
      fs = $app.newFilesystem()
      const reader = fs.getReader(b.baseFilesPath() + '/' + b.getString('arquivo'))
      let cifrado = ''
      try {
        cifrado = toString(reader)
      } finally {
        reader.close()
      }
      const claro = $security.decrypt(cifrado, chave)
      res.decifrado = !!claro
      res.sha_ok = $security.sha256(claro) === b.getString('sha256')
      const dados = JSON.parse(claro)
      let esperado = {}
      try {
        esperado = JSON.parse(b.getString('contagens') || '{}') || {}
      } catch (_) {}
      let todas = true
      for (const nome of Object.keys(esperado)) {
        const c = dados.colecoes && dados.colecoes[nome]
        const n = c ? c.linhas.length : -1
        const okc =
          n === esperado[nome] && (!c || c.linhas.every((l) => l.length === c.colunas.length))
        res.colecoes[nome] = { esperado: esperado[nome], no_arquivo: n, ok: okc }
        if (!okc) todas = false
      }
      res.contagens_ok = todas && Object.keys(esperado).length > 0
      res.ok = res.decifrado && res.sha_ok && res.contagens_ok
    } catch (err) {
      res.erro =
        'Não foi possível ler ou decifrar o arquivo (chave diferente ou arquivo corrompido).'
      $app.logger().error('verificação de backup falhou', 'backup', b.id)
    } finally {
      if (fs) fs.close()
    }
    b.set('verificado_em', new Date().toISOString().replace('T', ' '))
    b.set('verificacao', res)
    $app.save(b)
    auditar('backup.verificado', res.ok ? 'success' : 'failure', {
      backup: b.id,
      ok: res.ok,
      sha_ok: res.sha_ok,
    })
    return e.json(200, res)
  },
  $apis.requireAuth('users'),
)
