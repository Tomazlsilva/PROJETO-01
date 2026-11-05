import pb from '@/lib/pocketbase/client'
import type { RecordModel } from 'pocketbase'
import { camposDoPapel, type Papel, type Role } from '@/lib/permissions'

export interface UserRecord extends RecordModel {
  name: string
  email: string
  role: Role | ''
  active: boolean
  failed_attempts: number
  locked_until: string
  session_expires_at: string
  tipo_conta: '' | 'diretor'
  ve_cronograma: boolean
}

export const listUsers = () =>
  pb.collection('users').getFullList<UserRecord>({ sort: 'name,email' })

// Senha opcional: em branco, o servidor grava uma senha aleatória desconhecida e a
// pessoa entra pela conta Microsoft ou define a senha em "Esqueci a senha".
export const createUser = (data: { name: string; email: string; role: Papel; password: string }) =>
  pb.collection('users').create<UserRecord>({
    name: data.name,
    email: data.email,
    ...camposDoPapel(data.role),
    ...(data.password ? { password: data.password, passwordConfirm: data.password } : {}),
    active: true,
    verified: true,
    emailVisibility: false,
  })

export const updateUserRole = (id: string, papel: Papel) =>
  pb.collection('users').update<UserRecord>(id, camposDoPapel(papel))

// Projetista que vê o cronograma inteiro, só leitura (SPEC-1-008)
export const setVeCronograma = (id: string, ve_cronograma: boolean) =>
  pb.collection('users').update<UserRecord>(id, { ve_cronograma })

export const DISCIPLINAS_PESSOA = ['Hidráulica', 'Elétrica', 'Ar-condicionado', 'PPCI', 'Estrutura']

// Disciplinas que a pessoa faz (só o administrador altera)
export const setDisciplinas = (id: string, disciplinas: string[]) =>
  pb.collection('users').update<UserRecord>(id, { disciplinas })

export type { Role }

export const setUserActive = (id: string, active: boolean) =>
  pb.collection('users').update<UserRecord>(id, { active })

export const unlockUser = (id: string) =>
  pb.collection('users').update<UserRecord>(id, { locked_until: '', failed_attempts: 0 })

export const setUserPassword = (id: string, password: string) =>
  pb.collection('users').update<UserRecord>(id, { password, passwordConfirm: password })

// Só apaga conta sem histórico; com histórico o servidor responde 409 e indica Revogar
export const deleteUser = (id: string) =>
  pb.send<{ id: string; apagado: boolean }>(
    `/backend/v1/usuarios/${encodeURIComponent(id)}/apagar`,
    { method: 'POST', body: {} },
  )

export const isLocked = (u: UserRecord) =>
  !!u.locked_until && new Date(u.locked_until.replace(' ', 'T')) > new Date()
