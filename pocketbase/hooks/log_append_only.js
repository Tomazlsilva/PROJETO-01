// SPEC-1-007 (T1.35, CA-1-007-11) — logs e históricos são somente de inclusão.
// Nenhuma alteração ou exclusão é aceita — nem pelo painel de superusuário nem pela API.
// Única exceção: a rotina de retenção remove registros de auditoria com mais de 24 meses.
onRecordUpdate(
  (e) => {
    throw new BadRequestError(
      'Registro de histórico/auditoria não pode ser alterado (somente inclusão).',
    )
  },
  'auth_audit',
  'transicoes',
  'projeto_historico',
  'tempo_importacoes',
)

onRecordDelete(
  (e) => {
    const nome = e.record.collection().name
    if (nome === 'auth_audit') {
      const limite = new Date()
      limite.setMonth(limite.getMonth() - 24)
      const criado = new Date(e.record.getString('created').replace(' ', 'T'))
      if (criado < limite) return e.next()
    }
    throw new BadRequestError(
      'Registro de histórico/auditoria não pode ser apagado (retenção mínima de 24 meses).',
    )
  },
  'auth_audit',
  'transicoes',
  'projeto_historico',
  'tempo_importacoes',
)
