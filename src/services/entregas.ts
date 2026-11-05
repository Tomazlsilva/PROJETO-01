// SPEC-1-008 — calendário de entregas (prévias, finais, revisões), janelas e feriados.
import pb from '@/lib/pocketbase/client'
import { ClientResponseError } from 'pocketbase'
import type { Pessoa } from '@/services/projetos'

export type TipoEntrega = 'previa' | 'final' | 'revisao' | 'outro'

export const TIPO_LABEL: Record<TipoEntrega, string> = {
  previa: 'Prévia',
  final: 'Final',
  revisao: 'Revisão',
  outro: 'Outro',
}

export interface Alocacao {
  id?: string
  pessoa: Pessoa | null
  pessoa_texto: string
  inicio: string
  fim: string
  janela_definida?: boolean
}

export interface Entrega {
  id: string
  projeto: { id: string; nome: string; coordenador: Pessoa | null }
  tipo: TipoEntrega
  descricao: string
  data: string
  principal: boolean
  numero_revisao: number
  entregue: boolean
  entregue_em: string
  entregue_por: Pessoa | null
  art_pendente: boolean
  art_entregue: boolean
  art_em: string
  art_por: Pessoa | null
  origem: string
  disciplinas: {
    card_id: string
    disciplina_id: string
    nome: string
    sigla: string
    etapa: string
  }[]
  alocacoes: Alocacao[]
  minha_janela: Alocacao[]
  pode_editar: boolean
  versao: string
  horas: HorasEntrega
}

export interface HorasEntrega {
  total_seg: number
  fora_da_janela: number
  por_pessoa: { pessoa: Pessoa | null; seg: number }[]
}

export const horasTxt = (seg: number) => {
  const h = Math.floor(seg / 3600)
  const m = Math.round((seg % 3600) / 60)
  return `${h}h${String(m).padStart(2, '0')}`
}

// Start no apontamento direto na entrega (o servidor escolhe a disciplina da pessoa)
export const iniciarNaEntrega = (entrega: string, encerrarAnterior = false) =>
  pb.send('/backend/v1/tempo/iniciar', {
    method: 'POST',
    body: { entrega, encerrar_anterior: encerrarAnterior },
  })

export interface Feriado {
  id: string
  data: string
  nome: string
  abrangencia: string
  origem: string
  ativo: boolean
}

export interface Calendario {
  de: string
  ate: string
  hoje: string
  escopo: 'todos' | 'equipe' | 'proprio'
  pode_mes: boolean
  feriados: Feriado[]
  entregas: Entrega[]
  projetos_editaveis: { id: string; nome: string }[]
}

export const getCalendario = (f: {
  de: string
  ate: string
  busca?: string
  disciplina?: string
  projeto?: string
}) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v)
  return pb.send<Calendario>('/backend/v1/calendario?' + p.toString(), { method: 'GET' })
}

export interface EventoEntrega {
  id: string
  entrega: string
  acao: string
  antes: string
  depois: string
  detalhes: Record<string, unknown>
  autor: Pessoa | null
  created: string
}

export interface LinhaDoTempo {
  projeto: { id: string; nome: string; prazo: string; coordenador: Pessoa | null }
  pode_editar: boolean
  entregas: (Omit<
    Entrega,
    'projeto' | 'minha_janela' | 'pode_editar' | 'disciplinas' | 'art_por'
  > & {
    disciplinas: { card_id: string; nome: string }[]
  })[]
  historico: EventoEntrega[]
}

export const getLinhaDoTempo = (projetoId: string) =>
  pb.send<LinhaDoTempo>(`/backend/v1/entregas/projeto/${encodeURIComponent(projetoId)}`, {
    method: 'GET',
  })

export interface AlocacaoEnvio {
  pessoa?: string
  pessoa_texto?: string
  inicio?: string
  fim?: string
}

export type AcaoEntrega =
  | 'criar'
  | 'alterar'
  | 'revisao'
  | 'alocacoes'
  | 'entregar'
  | 'desfazer_entrega'
  | 'art'
  | 'desfazer_art'

// Recusas que a tela trata de forma especial (feriado, janela, conflito de edição)
export interface Recusa {
  code: string
  message: string
  feriados?: { data: string; nome: string }[]
  janelas?: { id: string; pessoa: string; pessoa_texto: string; inicio: string; fim: string }[]
}

export const recusaDe = (err: unknown): Recusa | null => {
  if (err instanceof ClientResponseError && err.status === 409) {
    const r = err.response as Partial<Recusa>
    if (r && typeof r.code === 'string') return { code: r.code, message: r.message || '', ...r }
  }
  return null
}

// {id} é a entrega; em "criar", é o projeto
export const acaoEntrega = (id: string, acao: AcaoEntrega, corpo: Record<string, unknown>) =>
  pb.send<{ id: string; versao?: string; numero_revisao?: number }>(
    `/backend/v1/entregas/${encodeURIComponent(id)}/${acao}`,
    { method: 'POST', body: corpo },
  )

// ---------- datas (sempre AAAA-MM-DD, sem fuso) ----------
export const somaDias = (d: string, n: number) => {
  const t = new Date(d + 'T12:00:00Z')
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}
export const segundaDe = (d: string) => {
  const dia = new Date(d + 'T12:00:00Z').getUTCDay() // 0 = domingo
  return somaDias(d, dia === 0 ? -6 : 1 - dia)
}
export const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
export const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]
export const dataBR = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—')
export const dataHoraBR = (s: string) => {
  if (!s) return '—'
  const t = new Date(s.replace(' ', 'T'))
  return t.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}
export const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)

export const rotuloEntrega = (e: {
  tipo: TipoEntrega
  numero_revisao: number
  principal: boolean
}) =>
  e.tipo === 'revisao' && e.numero_revisao
    ? `Revisão ${e.numero_revisao}`
    : e.tipo === 'final' && e.principal
      ? 'Final (prazo)'
      : TIPO_LABEL[e.tipo]
