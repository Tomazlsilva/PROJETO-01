import pb from '@/lib/pocketbase/client'
import type { Pessoa } from '@/services/projetos'
import type { TentativaHandoff } from '@/services/kanban'

// SPEC-1-005 — pendências (handoffs), caixa de falhas e notificações internas

export interface Notificacao {
  id: string
  titulo: string
  texto: string
  lida: boolean
  lida_em: string
  atividade: string
  card: string
  projeto: string
  created: string
}

export const getNotificacoes = () =>
  pb.send<{ nao_lidas: number; itens: Notificacao[] }>('/backend/v1/notificacoes', {
    method: 'GET',
    requestKey: null,
  })

export const lerNotificacao = (id: string) =>
  pb.send(`/backend/v1/notificacoes/${encodeURIComponent(id)}/ler`, { method: 'POST', body: {} })

export const receberAtividade = (id: string) =>
  pb.send(`/backend/v1/atividades/${encodeURIComponent(id)}/receber`, { method: 'POST', body: {} })

export const cancelarAtividade = (id: string, justificativa: string) =>
  pb.send(`/backend/v1/atividades/${encodeURIComponent(id)}/cancelar`, {
    method: 'POST',
    body: { justificativa },
  })

export const devolverAtividade = (id: string, justificativa: string) =>
  pb.send(`/backend/v1/atividades/${encodeURIComponent(id)}/devolver`, {
    method: 'POST',
    body: { justificativa },
  })

export interface FalhaHandoff {
  id: string
  status: 'entregue' | 'falha' | 'obsoleto'
  motivo: string
  motivo_texto: string
  proxima_acao: string
  tentativas: number
  etapa_destino: string
  etapa_destino_nome: string
  card: { id: string; etapa: string; revisor: Pessoa | null; responsavel: Pessoa | null } | null
  disciplina: { id: string; nome: string; sigla: string } | null
  projeto: { id: string; nome: string } | null
  atividade: { id: string; status: string; destinatario: Pessoa | null } | null
  historico: TentativaHandoff[]
  created: string
  updated: string
}

export const getFalhas = (todos = false) =>
  pb.send<{ itens: FalhaHandoff[] }>('/backend/v1/handoffs/falhas' + (todos ? '?todos=1' : ''), {
    method: 'GET',
  })

export const reprocessarHandoff = (id: string) =>
  pb.send<{
    resultado: 'entregue' | 'falha' | 'ja_entregue' | 'obsoleto'
    motivo: string
    tentativas: number
  }>(`/backend/v1/handoffs/${encodeURIComponent(id)}/reprocessar`, { method: 'POST', body: {} })

export const MOTIVO_FALHA: Record<string, string> = {
  destino_ausente: 'Destino não definido',
  destino_inativo: 'Destinatário inativo',
  card_mudou: 'O card já mudou de etapa',
}
