// SPEC-1-007 — política de auditoria e backup (somente leitura), para exibir no sistema.
routerAdd(
  'GET',
  '/backend/v1/auditoria/politica',
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
    return e.json(200, {
      retencao_meses: 24,
      somente_inclusao: ['auth_audit', 'transicoes', 'projeto_historico', 'tempo_importacoes'],
      consulta: 'Administrador (tudo) e coordenador (projetos que coordena).',
      backup_retencao_dias: 90,
      backup_automatico: 'Diário, às 03:00 (horário de Brasília).',
      backup_criptografia:
        'AES-256-GCM; chave no secret BACKUP_KEY do Skip Cloud, fora do banco, sob responsabilidade do administrador técnico.',
      restauracao: 'Sempre em ambiente isolado (outra instância), nunca sobre a produção.',
    })
  },
  $apis.requireAuth('users'),
)
