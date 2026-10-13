import pb from '@/lib/pocketbase/client'
import type { Pessoa } from '@/services/projetos'

// SPEC-1-007 — painel executivo, auditoria de mudanças e backups

export type Situacao = 'conclusivo' | 'inconclusivo' | 'sem_dados'

export interface FiltrosPainel {
  de?: string
  ate?: string
  projeto?: string
  disciplina?: string
  etapa?: string
  responsavel?: string
}

export interface ResumoPainel {
  periodo: { de: string; ate: string }
  escopo: 'equipe' | 'todos'
  somente_leitura: boolean
  pode_exportar: boolean
  limiar: number
  projetos: { valor: number }
  etapas: { chave: string; nome: string; ativa: boolean; valor: number }[]
  atrasados: { valor: number }
  bloqueados: { valor: number; vencidos: number }
  carga:
    | { responsavel: Pessoa | null; valor: number; atrasados: number; bloqueados: number }[]
    | null
  movimentacoes: { valor: number | null; situacao: 'ok' | 'sem_dados' }
  touch_time: {
    n_eventos: number
    touch_seg: number | null
    elaboracao_seg: number | null
    revisao_seg: number | null
    espera_seg: number | null
    situacao: Situacao
    motivo: string
  }
  completude: {
    esperados: number
    preenchidos: number
    taxa: number | null
    situacao: Situacao
    motivo: string
  }
  adocao: {
    vinculados: number
    ativos: number | null
    taxa: number | null
    por_papel: Record<string, { vinculados: number; ativos: number; taxa: number | null }>
    situacao: Situacao
    motivo: string
  }
}

const qs = (f: Record<string, string | undefined>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v)
  return p.toString()
}

export const getPainel = (f: FiltrosPainel) =>
  pb.send<ResumoPainel>('/backend/v1/painel?' + qs({ ...f }), { method: 'GET', requestKey: null })

export const getRegistros = (metrica: string, f: FiltrosPainel) =>
  pb.send<{ metrica: string; total: number; itens: Record<string, unknown>[] }>(
    '/backend/v1/painel?' + qs({ metrica, ...f }),
    { method: 'GET', requestKey: null },
  )

// Baixa o CSV (o servidor confere a permissão e registra a exportação na auditoria)
export async function exportarCsv(metrica: string, f: FiltrosPainel) {
  const url = pb.buildURL('/backend/v1/painel?' + qs({ formato: 'csv', metrica, ...f }))
  const res = await fetch(url, { headers: { Authorization: pb.authStore.token } })
  if (!res.ok) {
    let msg = 'Não foi possível exportar.'
    try {
      msg = (await res.json()).message || msg
    } catch {
      /* resposta sem JSON */
    }
    throw new Error(msg)
  }
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `painel-${metrica.replace(/[^\w-]+/g, '_')}-${f.de || ''}-${f.ate || ''}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

export type TipoMudanca =
  | 'estado'
  | 'prioridade'
  | 'responsavel'
  | 'prazo'
  | 'bloqueio'
  | 'handoff'
  | 'tempo'

export const TIPO_MUDANCA_LABEL: Record<TipoMudanca, string> = {
  estado: 'Estado (etapa)',
  prioridade: 'Prioridade',
  responsavel: 'Responsável / revisor',
  prazo: 'Prazo',
  bloqueio: 'Bloqueio',
  handoff: 'Pendência (handoff)',
  tempo: 'Tempo (correções)',
}

export interface Mudanca {
  id: string
  tipo: TipoMudanca
  descricao: string
  campo?: string
  antes?: unknown
  depois?: unknown
  autor: Pessoa | null
  quando: string
  justificativa: string
  projeto_id: string
  projeto: string
  disciplina: string
  card_id: string
}

export const getMudancas = (f: {
  tipo?: string
  projeto?: string
  de?: string
  ate?: string
  pagina?: number
}) =>
  pb.send<{ total: number; pagina: number; por_pagina: number; itens: Mudanca[] }>(
    '/backend/v1/auditoria/mudancas?' +
      qs({ ...f, pagina: f.pagina ? String(f.pagina) : undefined }),
    { method: 'GET', requestKey: null },
  )

export interface Politica {
  retencao_meses: number
  somente_inclusao: string[]
  consulta: string
  backup_retencao_dias: number
  backup_automatico: string
  backup_criptografia: string
  restauracao: string
}

export const getPolitica = () =>
  pb.send<Politica>('/backend/v1/auditoria/politica', { method: 'GET' })

export interface Backup {
  id: string
  criado_em: string
  status: 'ok' | 'falha'
  origem: 'manual' | 'automatico'
  erro: string
  arquivo: string
  tamanho_bytes: number
  sha256: string
  contagens: Record<string, number>
  criado_por: string
  expira_em: string
  verificado_em: string
  verificacao: {
    ok: boolean
    sha_ok: boolean
    decifrado: boolean
    contagens_ok: boolean
    erro: string
  } | null
}

export const listBackups = () =>
  pb.send<{ chave_configurada: boolean; retencao_dias: number; itens: Backup[] }>(
    '/backend/v1/backups',
    { method: 'GET', requestKey: null },
  )

export const criarBackup = () =>
  pb.send<{ id: string; sha256: string }>('/backend/v1/backups', { method: 'POST', body: {} })

export const verificarBackup = (id: string) =>
  pb.send<{ ok: boolean; sha_ok: boolean; erro: string }>(
    `/backend/v1/backups/${encodeURIComponent(id)}/verificar`,
    { method: 'POST', body: {} },
  )

export const limparBackups = () =>
  pb.send<{ removidos: number }>('/backend/v1/backups/limpar', { method: 'POST', body: {} })

// Download do arquivo cifrado (só administrador; precisa de token de arquivo protegido)
export async function baixarBackup(b: Backup) {
  const token = await pb.files.getToken()
  const url = pb.buildURL(
    `/api/files/backups/${b.id}/${encodeURIComponent(b.arquivo)}?token=${token}&download=1`,
  )
  const a = document.createElement('a')
  a.href = url
  a.download = b.arquivo
  a.click()
}

export const horas = (seg: number | null) =>
  seg === null ? '—' : (seg / 3600).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' h'

export const pct = (t: number | null) =>
  t === null ? '—' : (t * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'
