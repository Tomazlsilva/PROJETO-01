import pb from '@/lib/pocketbase/client'
import type { RecordModel } from 'pocketbase'
import type { Role } from '@/lib/permissions'

export interface UserRecord extends RecordModel {
  name: string
  email: string
  role: Role | ''
  active: boolean
  failed_attempts: number
  locked_until: string
  session_expires_at: string
}

export const listUsers = () =>
  pb.collection('users').getFullList<UserRecord>({ sort: 'name,email' })

// Senha opcional: em branco, o servidor grava uma senha aleatória desconhecida e a
// pessoa entra pela conta Microsoft ou define a senha em "Esqueci a senha".
export const createUser = (data: { name: string; email: string; role: Role; password: string }) =>
  pb.collection('users').create<UserRecord>({
    name: data.name,
    email: data.email,
    role: data.role,
    ...(data.password ? { password: data.password, passwordConfirm: data.password } : {}),
    active: true,
    verified: true,
    emailVisibility: false,
  })

export const updateUserRole = (id: string, role: Role) =>
  pb.collection('users').update<UserRecord>(id, { role })

export const setUserActive = (id: string, active: boolean) =>
  pb.collection('users').update<UserRecord>(id, { active })

export const unlockUser = (id: string) =>
  pb.collection('users').update<UserRecord>(id, { locked_until: '', failed_attempts: 0 })

export const setUserPassword = (id: string, password: string) =>
  pb.collection('users').update<UserRecord>(id, { password, passwordConfirm: password })

export const isLocked = (u: UserRecord) =>
  !!u.locked_until && new Date(u.locked_until.replace(' ', 'T')) > new Date()
