// Matriz papel × ação da SPEC-1-001 — usada SOMENTE para a interface.
// A autorização real é feita no servidor (regras das coleções e hooks).

export type Role = 'admin' | 'coordenador' | 'projetista' | 'revisor' | 'executivo'

export const ROLES: Role[] = ['admin', 'coordenador', 'projetista', 'revisor', 'executivo']

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  coordenador: 'Coordenador',
  projetista: 'Projetista',
  revisor: 'Revisor',
  executivo: 'Executivo',
}

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  admin: [
    'Cria, ativa, revoga e altera o papel de usuários',
    'Remove bloqueio por tentativas inválidas',
    'Consulta a trilha de auditoria',
    'Vê e edita todos os projetos',
  ],
  coordenador: [
    'Cria projetos sob sua coordenação',
    'Edita os projetos que coordena',
    'Registra revisões nos projetos que coordena',
    'Não administra usuários',
  ],
  projetista: ['Vê somente os projetos em que está vinculado', 'Não acessa a administração'],
  revisor: [
    'Vê os projetos em que está vinculado',
    'Registra revisões com a própria autoria',
    'Não altera a autoria de outros usuários',
  ],
  executivo: ['Consulta todos os projetos e painéis', 'Não edita a produção'],
}

export function asRole(value: unknown): Role | null {
  return typeof value === 'string' && (ROLES as string[]).includes(value) ? (value as Role) : null
}

export const canWriteReview = (role: Role | null) =>
  role === 'admin' || role === 'coordenador' || role === 'revisor'
