// Regras do fluxo do Kanban (espelho das regras do servidor, só para a interface).
// Quem decide de fato é o servidor: a interface apenas mostra os movimentos prováveis.
import type { Role } from '@/lib/permissions'

export const ETAPAS = [
  'entrada_pendente',
  'pronto',
  'em_elaboracao',
  'aguardando_revisao',
  'em_correcao',
  'aprovado',
] as const
export type Etapa = (typeof ETAPAS)[number]

export const NOME_PADRAO: Record<Etapa, string> = {
  entrada_pendente: 'Entrada pendente',
  pronto: 'Pronto',
  em_elaboracao: 'Em elaboração',
  aguardando_revisao: 'Aguardando revisão',
  em_correcao: 'Em correção',
  aprovado: 'Aprovado',
}

export const CAMPOS_ETAPA = ['observacao', 'link_entrega'] as const
export type CampoEtapa = (typeof CAMPOS_ETAPA)[number]
export const ROTULO_CAMPO: Record<CampoEtapa, string> = {
  observacao: 'Observação',
  link_entrega: 'Link da entrega',
}

export type Classe = 'exec' | 'rev' | 'reabrir' | 'reverter'

// Transições permitidas e quem pode fazê-las
export const TRANSICOES: [Etapa, Etapa, Classe][] = [
  ['entrada_pendente', 'pronto', 'exec'],
  ['pronto', 'em_elaboracao', 'exec'],
  ['em_elaboracao', 'aguardando_revisao', 'exec'],
  ['aguardando_revisao', 'em_correcao', 'rev'],
  ['aguardando_revisao', 'aprovado', 'rev'],
  ['em_correcao', 'aguardando_revisao', 'exec'],
  ['aprovado', 'em_correcao', 'reabrir'],
  ['aprovado', 'em_elaboracao', 'reabrir'],
]

export interface EtapaConfig {
  chave: Etapa
  nome: string
  ordem: number
  ativa: boolean
}

export function classeDaTransicao(de: Etapa, para: Etapa, ativas: Set<string>): Classe | null {
  if (de === para || !ativas.has(para)) return null
  const direta = TRANSICOES.find((t) => t[0] === de && t[1] === para)
  if (direta) return direta[2]
  // pula uma etapa inativa no caminho
  for (const t1 of TRANSICOES) {
    if (t1[0] !== de || ativas.has(t1[1])) continue
    if (TRANSICOES.some((t2) => t2[0] === t1[1] && t2[1] === para)) return t1[2]
  }
  if (ETAPAS.indexOf(para) < ETAPAS.indexOf(de)) return 'reverter'
  return null
}

export interface ContextoMovimento {
  userId: string
  role: Role | null
  coordenadorId: string
  membros: string[]
  responsavelId: string
}

export function podeMover(classe: Classe, c: ContextoMovimento): boolean {
  const admin = c.role === 'admin'
  const coord = c.role === 'coordenador' && c.coordenadorId === c.userId
  const resp = c.responsavelId === c.userId && c.role !== 'executivo'
  const revisor = c.role === 'revisor' && c.membros.includes(c.userId)
  if (classe === 'exec') return admin || coord || resp
  if (classe === 'rev') return admin || coord || (revisor && !resp)
  return admin || coord
}

export const exigeJustificativa = (classe: Classe) => classe === 'reabrir' || classe === 'reverter'

export const podeBloquear = (c: ContextoMovimento) =>
  c.role === 'admin' ||
  (c.role === 'coordenador' && c.coordenadorId === c.userId) ||
  (c.role !== 'executivo' && c.responsavelId === c.userId)
