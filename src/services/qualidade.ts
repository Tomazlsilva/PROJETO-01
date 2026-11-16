// SPEC-2-005 — indicadores de qualidade (K2, K3, retorno e rodadas até aprovar).
import pb from '@/lib/pocketbase/client'

export interface GrupoQualidade {
  id: string
  nome: string
  disciplinas_revisadas: number
  aplicaveis: number
  conformes: number
  na: number
  excecoes: number
  k2: number | null
  k2_inconclusivo: boolean
  rodadas: number
  reprovadas: number
  retorno: number | null
  rodadas_ate_aprovar: number | null
  aprovadas: number
  emitidas: number
  correcoes_validas: number
  k3: number | null
  k3_inconclusivo: boolean
}

export interface FiltrosQualidade {
  inicio?: string
  fim?: string
  projeto?: string
  disciplina?: string
  pessoa?: string
  tipologia?: string
}

type Base = { card: string; projeto: string; disciplina: string; pessoa: string; data: string }

export interface PainelQualidade {
  filtros: Required<FiltrosQualidade>
  escopo: 'tudo' | 'equipe' | 'proprio'
  limiares: { k2: number; k3: number }
  total: GrupoQualidade
  k3_matriz: Record<'cliente' | 'obra' | 'interna', Record<'alta' | 'media' | 'baixa', number>>
  correcoes_invalidas: number
  por_pessoa: GrupoQualidade[]
  por_disciplina: GrupoQualidade[]
  linhas: {
    k2: (Base & { item: string; severidade: string; resultado: string })[]
    rodadas: (Base & { rodada: number; resultado: string; sem_checklist: boolean })[]
    emissoes: (Base & { rotulo: string })[]
    correcoes: (Base & { emissao: string; origem: string; severidade: string; descricao: string })[]
  }
  opcoes: {
    projetos: { id: string; nome: string }[]
    disciplinas: { id: string; nome: string }[]
    pessoas: { id: string; nome: string }[]
    tipologias: string[]
  }
  pode_configurar: boolean
}

export const getQualidade = (f: FiltrosQualidade) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v)
  const s = p.toString()
  return pb.send<PainelQualidade>('/backend/v1/painel/qualidade' + (s ? '?' + s : ''), {
    method: 'GET',
  })
}

export const salvarLimiares = (limiar_k2: number, limiar_k3: number, motivo: string) =>
  pb.send('/backend/v1/painel/qualidade/config', {
    method: 'POST',
    body: { limiar_k2, limiar_k3, motivo },
  })
