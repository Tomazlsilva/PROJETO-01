import pb from '@/lib/pocketbase/client'
import type { Pessoa } from '@/services/projetos'

// SPEC-1-006 — touch time (apontamento) e baseline em modo sombra

export type Categoria = 'elaboracao' | 'revisao' | 'espera'
export const CATEGORIA_LABEL: Record<Categoria, string> = {
  elaboracao: 'Elaboração',
  revisao: 'Revisão',
  espera: 'Espera',
}

export interface Apontamento {
  id: string
  card: string
  projeto: string
  projeto_nome: string
  disciplina_nome: string
  etapa: string
  categoria: Categoria
  status: 'ativo' | 'pausado' | 'encerrado' | 'pendente_revisao'
  inicio: string
  fim: string
  segmento_aberto_em: string
  acumulado_seg: number
  revisado: boolean
  substituido: boolean
  excluido: boolean
}

export interface SituacaoTempo {
  atual: Apontamento | null
  pendentes: Apontamento[]
  recentes: Apontamento[]
}

export const getTempoAtual = () =>
  pb.send<SituacaoTempo>('/backend/v1/tempo/atual', { method: 'GET', requestKey: null })

export const iniciarTempo = (card: string, categoria?: Categoria, encerrarAnterior = false) =>
  pb.send<{ id: string }>('/backend/v1/tempo/iniciar', {
    method: 'POST',
    body: { card, categoria, encerrar_anterior: encerrarAnterior },
  })

type Acao = 'pausar' | 'retomar' | 'encerrar' | 'revisar' | 'corrigir' | 'excluir'
export const acaoTempo = (id: string, acao: Acao, body: Record<string, unknown> = {}) =>
  pb.send<{ id: string }>(`/backend/v1/tempo/${encodeURIComponent(id)}/${acao}`, {
    method: 'POST',
    body,
  })

export interface EventoTempo {
  id: string
  usuario: Pessoa | null
  etapa: string
  categoria: Categoria
  origem: 'timer' | 'importacao' | 'correcao'
  status: Apontamento['status']
  inicio: string
  fim: string
  duracao_seg: number
  revisado: boolean
  revisao_motivo: string
  substituido: boolean
  substitui: string
  correcao_motivo: string
  excluido: boolean
  exclusao_motivo: string
}

export const getTempoDoCard = (card: string) =>
  pb.send<{ pode_corrigir: boolean; itens: EventoTempo[] }>(
    '/backend/v1/tempo/eventos?card=' + encodeURIComponent(card),
    { method: 'GET', requestKey: null },
  )

export interface GrupoBaseline {
  n_projetos: number
  n_eventos: number
  elaboracao_seg: number
  revisao_seg: number
  espera_seg: number
  touch_seg: number
  touch_horas: number
  espera_horas: number
  media_touch_horas_por_projeto: number
  mediana_touch_horas_por_projeto: number
  situacao: 'conclusivo' | 'inconclusivo'
  motivo: string
}

export interface Baseline {
  filtros: { tipologia: string; disciplina: string }
  grupos: { antes: GrupoBaseline; depois: GrupoBaseline }
  comparacao: { situacao: 'conclusivo' | 'inconclusivo'; diferenca_media_horas: number | null }
  excluidos: { pendentes: number; em_andamento: number; excluidos: number; substituidos: number }
  protocolo: string
  aviso: string
}

const filtrosQS = (tipologia: string, disciplina: string) => {
  const p = new URLSearchParams()
  if (tipologia) p.set('tipologia', tipologia)
  if (disciplina) p.set('disciplina', disciplina)
  const s = p.toString()
  return s ? '?' + s : ''
}

export const getBaseline = (tipologia = '', disciplina = '') =>
  pb.send<Baseline>('/backend/v1/tempo/baseline' + filtrosQS(tipologia, disciplina), {
    method: 'GET',
  })

// Baixa o CSV com o token da sessão (mesmos filtros do painel)
export async function baixarBaselineCsv(tipologia = '', disciplina = '') {
  const url = pb.buildURL('/backend/v1/tempo/baseline.csv' + filtrosQS(tipologia, disciplina))
  const res = await fetch(url, { headers: { Authorization: pb.authStore.token } })
  if (!res.ok) throw new Error('Não foi possível gerar o CSV.')
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `baseline-touch-time${tipologia ? '-' + tipologia.replace(/[^\w-]+/g, '_') : ''}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

export interface ResultadoImportacao {
  id: string
  simulacao?: boolean
  arquivo: string
  total: number
  aceitas: number
  rejeitadas: number
  erros: { linha: number; campo: string; mensagem: string; conteudo: string }[]
}

export const importarHistorico = (arquivo: string, csv: string, simular: boolean) =>
  pb.send<ResultadoImportacao>('/backend/v1/tempo/importar', {
    method: 'POST',
    body: { arquivo, csv, simular },
  })

export const formatarDuracao = (seg: number) => {
  const h = Math.floor(seg / 3600)
  const m = Math.floor((seg % 3600) / 60)
  const s = seg % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
