// SPEC-1-001 (CA-1-001-05) — ao revogar uma conta (active: true → false), por
// qualquer caminho, troca a tokenKey: todos os tokens emitidos deixam de valer
// na próxima requisição. O registro e o histórico autoral são preservados.
onRecordUpdate((e) => {
  const orig = e.record.original()
  if (orig.getBool('active') && !e.record.getBool('active')) {
    e.record.refreshTokenKey()
    e.record.set('session_expires_at', '')
  }
  return e.next()
}, 'users')
