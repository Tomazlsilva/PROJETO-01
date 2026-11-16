// SPEC-2-001 (CA-2-001-03/04) — versão publicada de checklist não muda nem é apagada,
// nem por rota interna nem pelo painel do banco. Para mudar, publica-se uma versão nova.
onRecordUpdate((e) => {
  throw new BadRequestError(
    'Versão publicada de checklist não pode ser alterada. Publique uma versão nova.',
  )
}, 'checklist_versoes')

onRecordDelete((e) => {
  throw new BadRequestError('Versão publicada de checklist não pode ser apagada.')
}, 'checklist_versoes')
