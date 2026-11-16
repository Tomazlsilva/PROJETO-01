// SPEC-2-003 — rodadas de revisão do coordenador.
import pb from '@/lib/pocketbase/client'
import type { Pessoa } from '@/services/projetos'
import type { ItemChecklist } from '@/services/checklists'

export type ResultadoRevisao = '' | 'conforme' | 'nao_conforme' | 'nao_se_aplica' | 'excecao'

export interface MarcacaoRevisao {
  resultado: ResultadoRevisao
  observacao: string
  justificativa: string
  autor: Pessoa | null
  em: string
  excecao_por: Pessoa | null
  herdado?: boolean
  corrigido?: boolean
  correcao_nota?: string
  corrigido_por?: Pessoa | null
  corrigido_em?: string
}

export interface Rodada {
  id: string
  numero: number
  status: 'aberta' | 'encerrada'
  resultado: '' | 'aprovado' | 'aprovado_com_excecao' | 'reprovado'
  sem_checklist: boolean
  itens: Record<string, MarcacaoRevisao>
  motivo: string
  responsavel_correcao: Pessoa | null
  aberta_por: Pessoa | null
  encerrada_por: Pessoa | null
  encerrada_em: string
  reaberturas: {
    em: string
    por: Pessoa | null
    justificativa: string
    resultado_anterior: string
  }[]
  created: string
  versao: string
}

export interface RevisaoDoCard {
  etapa: string
  checklist: { id: string; numero: number; itens: ItemChecklist[] } | null
  rodadas: Rodada[]
  pode_revisar: boolean
  pode_corrigir: boolean
}

export const ROTULO_RESULTADO: Record<string, string> = {
  aprovado: 'Aprovado',
  aprovado_com_excecao: 'Aprovado com exceção',
  reprovado: 'Devolvido para correção',
}

const enc = encodeURIComponent

export const getRevisao = (cardId: string) =>
  pb.send<RevisaoDoCard>(`/backend/v1/cards/${enc(cardId)}/revisao`, { method: 'GET' })

export const abrirRodada = (cardId: string) =>
  pb.send<{ id: string; numero: number; versao: string }>(
    `/backend/v1/cards/${enc(cardId)}/revisao/abrir`,
    {
      method: 'POST',
    },
  )

export const marcarRevisao = (
  cardId: string,
  rodada: string,
  dados: {
    versao: string
    item: string
    resultado: ResultadoRevisao
    observacao?: string
    justificativa?: string
  },
) =>
  pb.send<{ ok: true; versao: string }>(
    `/backend/v1/cards/${enc(cardId)}/revisao/${enc(rodada)}/marcar`,
    {
      method: 'POST',
      body: dados,
    },
  )

export const marcarCorrigido = (
  cardId: string,
  rodada: string,
  dados: { versao: string; item: string; corrigido: boolean; nota?: string },
) =>
  pb.send<{ ok: true; versao: string }>(
    `/backend/v1/cards/${enc(cardId)}/revisao/${enc(rodada)}/corrigir`,
    {
      method: 'POST',
      body: dados,
    },
  )

export const reabrirRodada = (
  cardId: string,
  rodada: string,
  versao: string,
  justificativa: string,
) =>
  pb.send<{ ok: true }>(`/backend/v1/cards/${enc(cardId)}/revisao/${enc(rodada)}/reabrir`, {
    method: 'POST',
    body: { versao, justificativa },
  })
