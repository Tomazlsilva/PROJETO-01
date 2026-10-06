import pb from '@/lib/pocketbase/client'
import type { RecordModel } from 'pocketbase'

export interface AuditEntry extends RecordModel {
  actor_id: string
  target_id: string
  action: string
  outcome: 'success' | 'failure' | 'blocked' | ''
  details: Record<string, unknown> | null
}

export const listAudit = (page = 1, perPage = 50, action = '') =>
  pb.collection('auth_audit').getList<AuditEntry>(page, perPage, {
    sort: '-created',
    filter: action ? pb.filter('action = {:a}', { a: action }) : '',
  })

export const ACTION_LABEL: Record<string, string> = {
  'login.success': 'Login realizado',
  'login.failure': 'Tentativa de login inválida',
  'login.locked': 'Conta bloqueada por tentativas',
  'login.rejected_locked': 'Login recusado (conta bloqueada)',
  'login.inactive': 'Login recusado (conta revogada)',
  'session.expired': 'Sessão expirada (8h)',
  'password.reset': 'Senha redefinida por link',
  'password.change': 'Senha alterada pelo usuário',
  'password.set_by_admin': 'Senha definida pelo administrador',
  'user.create': 'Usuário criado',
  'user.role_change': 'Papel alterado',
  'user.revoke': 'Acesso revogado',
  'user.activate': 'Acesso reativado',
  'user.unlock': 'Bloqueio removido',
  'user.email_change': 'E-mail alterado',
  'access.denied': 'Acesso negado (403)',
}
