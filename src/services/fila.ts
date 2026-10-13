import pb from '@/lib/pocketbase/client'
import type { Pessoa } from '@/services/projetos'
import type { Bloqueio } from '@/services/kanban'
import type { Etapa } from '@/lib/fluxo'

export type MotivoFila = 'responsavel' | 'revisao' | 'bloqueio'

export interface ItemFila {
  id: string
  etapa: Etapa
  etapa_nome: string
  motivos: MotivoFila[]
  projeto: { id: string; nome: string; coordenador: string; membros: string[] }
  disciplina: { id: string; nome: string; sigla: string }
  responsavel: Pessoa | null
  prioridade: string
  prioridade_propria: boolean
  prazo: string
  prazo_proprio: boolean
  atrasado: boolean
  bloqueado: boolean
  bloqueio: (Bloqueio & { vencido: boolean }) | null
  versao: string
  created: string
}

export interface ResumoFila {
  total: number
  atrasados: number
  bloqueados: number
  vencidos: number
}

export interface Fila {
  pessoa: { id: string; nome: string; papel: string }
  hoje: string
  resumo: ResumoFila
  itens: ItemFila[]
}

export interface FilaEquipe {
  hoje: string
  pessoas: {
    pessoa: { id: string; nome: string; papel: string; ativo: boolean }
    resumo: ResumoFila
    itens: ItemFila[]
  }[]
}

export interface FiltrosFila {
  pessoa?: string
  projeto?: string
  prioridade?: string
  etapa?: string
  situacao?: '' | 'atrasado' | 'bloqueado' | 'vencido'
}

const q = (f: FiltrosFila) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v)
  const s = p.toString()
  return s ? '?' + s : ''
}

export const getFila = (f: FiltrosFila = {}) =>
  pb.send<Fila>('/backend/v1/fila' + q(f), { method: 'GET' })

export const getFilaEquipe = (f: Omit<FiltrosFila, 'pessoa'> = {}) =>
  pb.send<FilaEquipe>('/backend/v1/fila/equipe' + q(f), { method: 'GET' })

export const MOTIVO_LABEL: Record<MotivoFila, string> = {
  responsavel: 'Responsável',
  revisao: 'Revisar',
  bloqueio: 'Resolver bloqueio',
}
