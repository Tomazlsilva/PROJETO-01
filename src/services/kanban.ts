import pb from '@/lib/pocketbase/client'
import type { Pessoa } from '@/services/projetos'
import type { CampoEtapa, Etapa, EtapaConfig } from '@/lib/fluxo'

export interface Bloqueio {
  motivo: string
  dono: Pessoa | null
  revisao: string
  desde: string
  vencido?: boolean
}

export interface CardKanban {
  id: string
  etapa: Etapa
  bloqueado: boolean
  bloqueio: Bloqueio | null
  projeto: {
    id: string
    nome: string
    prioridade: string
    prazo: string
    coordenador: string
    membros: string[]
  }
  disciplina: { id: string; nome: string; sigla: string }
  responsavel: Pessoa | null
  prioridade: string
  prazo: string
  atrasado: boolean
  tem_link: boolean
  versao: string
  created: string
}

export type Requisitos = Record<string, CampoEtapa[]>

export interface Quadro {
  configuracao: number
  etapas: { chave: Etapa; nome: string; ordem: number }[]
  requisitos: Requisitos
  cards: CardKanban[]
}

export interface EventoCard {
  id: string
  tipo:
    | 'criacao'
    | 'transicao'
    | 'bloqueio'
    | 'desbloqueio'
    | 'remapeamento'
    | 'alteracao'
    | 'bloqueio_revisado'
  de: string
  para: string
  justificativa: string
  detalhes: Record<string, unknown> | null
  autor: Pessoa | null
  created: string
}

export interface CardDetalhe {
  id: string
  etapa: Etapa
  bloqueado: boolean
  bloqueio: Bloqueio | null
  observacao: string
  link_entrega: string
  versao: string
  prioridade: string
  prioridade_propria: boolean
  prazo: string
  prazo_proprio: boolean
  atrasado: boolean
  pode_editar: boolean
  projeto: {
    id: string
    nome: string
    arquivado: boolean
    coordenador: Pessoa | null
    membros: string[]
    prioridade: string
    prazo: string
  }
  equipe: Pessoa[]
  disciplina: { id: string; nome: string; sigla: string }
  responsavel: Pessoa | null
  historico: EventoCard[]
}

export interface VersaoFluxo {
  id: string
  numero: number
  ativa: boolean
  config: { etapas: EtapaConfig[]; requisitos: Requisitos }
  motivo: string
  restaurada_de: number | null
  autor: Pessoa | null
  created: string
}

export interface FiltrosKanban {
  projeto?: string
  responsavel?: string
  prioridade?: string
}

const q = (f: FiltrosKanban) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v)
  const s = p.toString()
  return s ? '?' + s : ''
}

export const getQuadro = (f: FiltrosKanban = {}) =>
  pb.send<Quadro>('/backend/v1/kanban' + q(f), { method: 'GET' })

export const getCard = (id: string) =>
  pb.send<CardDetalhe>(`/backend/v1/cards/${encodeURIComponent(id)}`, { method: 'GET' })

export const moverCard = (
  id: string,
  para: Etapa,
  versao: string,
  justificativa?: string,
  campos?: Partial<Record<CampoEtapa, string>>,
) =>
  pb.send<{ id: string; etapa: Etapa; versao: string }>(
    `/backend/v1/cards/${encodeURIComponent(id)}/mover`,
    {
      method: 'POST',
      body: { para, versao, justificativa: justificativa || '', campos: campos || {} },
    },
  )

export const bloquearCard = (
  id: string,
  versao: string,
  dados: { motivo: string; dono: string; revisao: string },
) =>
  pb.send(`/backend/v1/cards/${encodeURIComponent(id)}/bloquear`, {
    method: 'POST',
    body: { versao, ...dados },
  })

export const desbloquearCard = (id: string, versao: string, resolucao: string) =>
  pb.send(`/backend/v1/cards/${encodeURIComponent(id)}/desbloquear`, {
    method: 'POST',
    body: { versao, resolucao },
  })

// Reatribuir / mudar prioridade / prazo do card (coordenador do projeto ou admin).
// Valor vazio volta a herdar (responsável → coordenador; prioridade e prazo → projeto).
export const atualizarCard = (
  id: string,
  versao: string,
  campos: { responsavel?: string; prioridade?: string; prazo?: string },
  justificativa: string,
) =>
  pb.send<{ id: string; versao: string; alterado: boolean }>(
    `/backend/v1/cards/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: { versao, justificativa, ...campos } },
  )

export const revisarBloqueio = (
  id: string,
  versao: string,
  dados: { revisao: string; nota: string; dono?: string },
) =>
  pb.send(`/backend/v1/cards/${encodeURIComponent(id)}/bloqueio/revisar`, {
    method: 'POST',
    body: { versao, ...dados },
  })

export const getFluxo = () =>
  pb.send<{
    ativa: VersaoFluxo | null
    versoes: VersaoFluxo[]
    cards_por_etapa: Record<string, number>
  }>('/backend/v1/fluxo', { method: 'GET' })

export const salvarFluxo = (dados: {
  base: string
  etapas: EtapaConfig[]
  requisitos: Requisitos
  motivo: string
  remapeamentos?: Record<string, string>
}) => pb.send<{ id: string; numero: number }>('/backend/v1/fluxo', { method: 'POST', body: dados })

export const restaurarFluxo = (
  versaoId: string,
  dados: { base: string; motivo: string; remapeamentos?: Record<string, string> },
) =>
  pb.send<{ id: string; numero: number }>(
    `/backend/v1/fluxo/restaurar/${encodeURIComponent(versaoId)}`,
    { method: 'POST', body: dados },
  )
