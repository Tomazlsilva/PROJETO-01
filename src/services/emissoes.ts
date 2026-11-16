// SPEC-2-004 — emissões da disciplina e correções após a emissão.
import pb from '@/lib/pocketbase/client'
import type { Pessoa } from '@/services/projetos'

export type TipoEntrega = 'previa' | 'final' | 'revisao' | 'outro'
export const ROTULO_TIPO_ENTREGA: Record<string, string> = {
  previa: 'Prévia',
  final: 'Final',
  revisao: 'Revisão',
  outro: 'Outro',
}
export const ROTULO_ORIGEM: Record<string, string> = {
  cliente: 'Cliente',
  obra: 'Obra',
  interna: 'Interna',
}
export const ROTULO_SEVERIDADE: Record<string, string> = {
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
}

export interface EntregaOpcao {
  id: string
  tipo: TipoEntrega
  data: string
  descricao: string
  numero_revisao: number
  principal: boolean
  entregue: boolean
  emitida_aqui: boolean
}

export interface Emissao {
  id: string
  rotulo: string
  tipo: TipoEntrega
  data: string
  destinatario: string
  responsavel: Pessoa | null
  status: 'emitida' | 'cancelada'
  entrega: { id: string; tipo: TipoEntrega; data: string; descricao: string } | null
  entrega_criada: boolean
  rodada: number | null
  cancelamento: string
  cancelada_por: Pessoa | null
  cancelada_em: string
  autor: Pessoa | null
  created: string
  versao: string
}

export interface CorrecaoPosEmissao {
  id: string
  emissao: string
  origem: 'cliente' | 'obra' | 'interna'
  severidade: 'alta' | 'media' | 'baixa'
  descricao: string
  item_texto: string
  decisao: 'valida' | 'invalida'
  justificativa: string
  decidido_por: Pessoa | null
  decidido_em: string
  atividade: { id: string; status: string; destinatario: Pessoa | null } | null
  historico: { em: string; por: Pessoa | null; de: string; para: string; justificativa: string }[]
  autor: Pessoa | null
  created: string
  versao: string
}

export interface EmissoesDoCard {
  etapa: string
  aprovada: boolean
  rodada: { id: string; numero: number; resultado: string } | null
  entregas: EntregaOpcao[]
  itens_revisao: { id: string; texto: string }[]
  emissoes: Emissao[]
  correcoes: CorrecaoPosEmissao[]
  pode_emitir: boolean
}

const enc = encodeURIComponent

export const getEmissoes = (cardId: string) =>
  pb.send<EmissoesDoCard>(`/backend/v1/cards/${enc(cardId)}/emissoes`, { method: 'GET' })

export const registrarEmissao = (
  cardId: string,
  dados: {
    entrega?: string
    tipo?: TipoEntrega
    rotulo: string
    data: string
    destinatario: string
    responsavel: string
  },
) =>
  pb.send<{ id: string; entrega: string; entrega_criada: boolean; entregue: boolean }>(
    `/backend/v1/cards/${enc(cardId)}/emissoes`,
    { method: 'POST', body: dados },
  )

export const cancelarEmissao = (
  cardId: string,
  emissao: string,
  versao: string,
  justificativa: string,
) =>
  pb.send(`/backend/v1/cards/${enc(cardId)}/emissoes/${enc(emissao)}/cancelar`, {
    method: 'POST',
    body: { versao, justificativa },
  })

export const registrarCorrecao = (
  cardId: string,
  emissao: string,
  dados: {
    origem: string
    severidade: string
    descricao: string
    item?: string
    decisao: 'valida' | 'invalida'
    justificativa?: string
  },
) =>
  pb.send<{ id: string; atividade: string; card_em_correcao: boolean }>(
    `/backend/v1/cards/${enc(cardId)}/emissoes/${enc(emissao)}/correcao`,
    { method: 'POST', body: dados },
  )

export const reverDecisao = (
  cardId: string,
  correcao: string,
  dados: { versao: string; decisao: 'valida' | 'invalida'; justificativa: string },
) =>
  pb.send(`/backend/v1/cards/${enc(cardId)}/correcoes/${enc(correcao)}/decisao`, {
    method: 'POST',
    body: dados,
  })
