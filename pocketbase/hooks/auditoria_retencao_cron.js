// SPEC-1-007 (CA-1-007-11) — retenção da auditoria: todo dia 1º, às 05:00 (UTC),
// remove só os registros de auditoria com mais de 24 meses. Históricos de projeto,
// transições e importações não são removidos.
cronAdd('auditoria_retencao_24m', '0 5 1 * *', () => {
  const limite = new Date()
  limite.setMonth(limite.getMonth() - 24)
  const corte = limite.toISOString().replace('T', ' ')
  for (const r of $app.findRecordsByFilter('auth_audit', 'created < {:c}', 'created', 5000, 0, {
    c: corte,
  })) {
    try {
      $app.delete(r)
    } catch (err) {
      $app.logger().error('retenção da auditoria falhou', 'id', r.id)
    }
  }
})
