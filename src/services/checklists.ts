// SPEC-2-001 — modelos de checklist (entrada e revisão) por disciplina.
import pb from '@/lib/pocketbase/client'
import type { Pessoa } from '@/services/projetos'

export type TipoChecklist = 'entrada' | 'revisao'
export type Severidade = 'critico' | 'normal'

export const ROTULO_TIPO: Record<TipoChecklist, string> = {
  entrada: 'Entrada',
  revisao: 'Revisão',
}

export interface ItemChecklist {
  id: string
  texto: string
  grupo: string
  severidade: Severidade
  referencia: string
}

export interface DisciplinaRef {
  id: string
  nome: string
  sigla: string
}

export interface ResumoModelo {
  id: string
  disciplina: DisciplinaRef
  tipo: TipoChecklist
  tipologia: string
  estado: 'ativo' | 'arquivado'
  exemplo: boolean
  vigente: boolean
  versao_atual: number
  tem_rascunho: boolean
  total_itens: number
  criticos: number
  updated: string
}

export interface VersaoChecklist {
  id: string
  numero: number
  itens: ItemChecklist[]
  total_itens: number
  criticos: number
  nota: string
  republicada_de: number | null
  autor: Pessoa | null
  created: string
}

export interface ModeloDetalhe {
  id: string
  disciplina: DisciplinaRef
  tipo: TipoChecklist
  tipologia: string
  estado: 'ativo' | 'arquivado'
  exemplo: boolean
  vigente: boolean
  versao_atual: number
  tem_rascunho: boolean
  rascunho: ItemChecklist[] | null
  rascunho_origem: number | null
  rascunho_por: Pessoa | null
  rascunho_em: string
  criado_por: Pessoa | null
  versoes: VersaoChecklist[]
  updated: string
  pode_editar: boolean
}

const enc = encodeURIComponent

export const listarChecklists = () =>
  pb.send<{ modelos: ResumoModelo[]; disciplinas: DisciplinaRef[]; tipologias: string[] }>(
    '/backend/v1/checklists',
    { method: 'GET' },
  )

export const getChecklist = (id: string) =>
  pb.send<ModeloDetalhe>(`/backend/v1/checklists/${enc(id)}`, { method: 'GET' })

export const criarChecklist = (dados: {
  disciplina: string
  tipo: TipoChecklist
  tipologia: string
  duplicar_de?: { modelo: string; versao?: number }
}) => pb.send<{ id: string }>('/backend/v1/checklists', { method: 'POST', body: dados })

const acao = <T = { ok: true; updated: string }>(
  id: string,
  nome: string,
  body: Record<string, unknown> = {},
) => pb.send<T>(`/backend/v1/checklists/${enc(id)}/${nome}`, { method: 'POST', body })

export const salvarRascunho = (id: string, base: string, itens: ItemChecklist[]) =>
  acao(id, 'rascunho', { base, itens })

export const publicarChecklist = (id: string, base: string, itens: ItemChecklist[], nota: string) =>
  acao<{ ok: true; numero: number }>(id, 'publicar', { base, itens, nota })

export const descartarRascunho = (id: string, base: string) => acao(id, 'descartar', { base })

export const arquivarChecklist = (id: string) => acao(id, 'arquivar')

export const reativarChecklist = (id: string) => acao(id, 'reativar')

export const usarVersaoComoRascunho = (id: string, base: string, numero: number) =>
  acao(id, 'usar_versao', { base, numero })

export const mudarTipologia = (id: string, base: string, tipologia: string) =>
  acao(id, 'tipologia', { base, tipologia })

// "Colar itens": uma linha = um item; linhas vazias são ignoradas
export const itensDeTexto = (
  texto: string,
  padrao: { grupo: string; severidade: Severidade },
): ItemChecklist[] =>
  texto
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((l) => l.length > 0)
    .map((l) => ({
      id: Math.random().toString(36).slice(2, 12),
      texto: l.slice(0, 500),
      grupo: padrao.grupo,
      severidade: padrao.severidade,
      referencia: '',
    }))
