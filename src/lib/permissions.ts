// Matriz papel × ação da SPEC-1-001 — usada SOMENTE para a interface.
// A autorização real é feita no servidor (regras das coleções e hooks).

// SPEC-1-008: 5 papéis — Administrador, Diretor (admin + tipo de conta), Coordenador,
// Administrativo e Projetista. Saem Revisor e Executivo.
export type Role = 'admin' | 'coordenador' | 'projetista' | 'administrativo'

export const ROLES: Role[] = ['admin', 'coordenador', 'administrativo', 'projetista']

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  coordenador: 'Coordenador',
  projetista: 'Projetista',
  administrativo: 'Administrativo',
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
    'Faz a revisão técnica (aprova ou devolve) nos projetos que coordena',
    'Não administra usuários',
  ],
  projetista: ['Vê somente os projetos em que está vinculado', 'Não acessa a administração'],
  administrativo: [
    'Vê todos os projetos, painéis e horas, com nomes, e exporta CSV',
    'Corrige horas apontadas, com motivo',
    'Não altera datas, entregas nem a produção',
  ],
}

// SPEC-1-008 — Diretor: mesmo poder do Administrador (papel 'admin'), tipo de conta diferente.
export type Papel = Role | 'diretor'

export const PAPEIS: Papel[] = ['admin', 'diretor', 'coordenador', 'projetista']

export const PAPEL_LABEL: Record<Papel, string> = { ...ROLE_LABEL, diretor: 'Diretor' }

export const papelDe = (u: { role?: unknown; tipo_conta?: unknown } | null | undefined) =>
  u && u.role === 'admin' && u.tipo_conta === 'diretor' ? 'diretor' : asRole(u?.role)

export const camposDoPapel = (p: Papel): { role: Role; tipo_conta: '' | 'diretor' } =>
  p === 'diretor' ? { role: 'admin', tipo_conta: 'diretor' } : { role: p, tipo_conta: '' }

export function asRole(value: unknown): Role | null {
  return typeof value === 'string' && (ROLES as string[]).includes(value) ? (value as Role) : null
}

export const canWriteReview = (role: Role | null) => role === 'admin' || role === 'coordenador'
