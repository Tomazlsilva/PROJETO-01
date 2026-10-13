import pb from '@/lib/pocketbase/client'
import { ClientResponseError, type RecordModel } from 'pocketbase'

export const PRIORIDADES = ['Baixa', 'Normal', 'Alta', 'Urgente'] as const
export type Prioridade = (typeof PRIORIDADES)[number]

export interface Projeto extends RecordModel {
  nome: string
  cliente: string
  local: string
  tipologia: string
  prazo: string
  prioridade: Prioridade | ''
  link_entrada: string
  arquivado: boolean
  coordenador: string
  membros: string[]
}

export interface Pessoa {
  id: string
  nome: string
}

export interface DisciplinaDoProjeto {
  id: string
  disciplina: { id: string; nome: string; sigla: string; personalizada?: boolean }
  responsavel: Pessoa | null
  herdado: boolean
}

export interface EventoHistorico {
  id: string
  acao: string
  campo: string
  antes: string
  depois: string
  detalhes: Record<string, unknown> | null
  autor: Pessoa | null
  created: string
}

export interface ProjetoDetalhe extends Projeto {
  pode_editar: boolean
  detalhe: {
    cliente: { id: string; nome: string } | null
    coordenador: Pessoa | null
    disciplinas: DisciplinaDoProjeto[]
    historico: EventoHistorico[]
  }
}

export interface Revisao extends RecordModel {
  projeto: string
  autor: string
  parecer: string
  expand?: { autor?: RecordModel }
}

export interface Disciplina extends RecordModel {
  nome: string
  sigla: string
  ativa: boolean
}

export interface Cliente extends RecordModel {
  nome: string
}

export interface PessoaAtribuivel {
  id: string
  nome: string
  papel: string
}

export interface Similar {
  id?: string
  nome?: string
  local?: string
  visivel: boolean
}

export interface NovoProjeto {
  nome: string
  cliente?: string
  cliente_nome?: string
  local: string
  tipologia: string
  prazo: string
  prioridade: Prioridade
  link_entrada?: string
  coordenador?: string
  disciplinas: { disciplina?: string; disciplina_nome?: string; responsavel?: string }[]
  confirmar_duplicidade?: boolean
}

export const listMeusProjetos = (incluirArquivados = false) =>
  pb.collection('projetos').getFullList<Projeto>({
    sort: 'nome',
    filter: incluirArquivados ? '' : 'arquivado != true',
  })

// Leitura pelo servidor com resposta uniforme: inexistente e sem permissão → 403
export async function getProjeto(id: string): Promise<ProjetoDetalhe | 'negado'> {
  try {
    return await pb.send<ProjetoDetalhe>(`/backend/v1/projetos/${encodeURIComponent(id)}`, {
      method: 'GET',
    })
  } catch (err) {
    if (err instanceof ClientResponseError && (err.status === 403 || err.status === 404)) {
      return 'negado'
    }
    throw err
  }
}

export type ResultadoCriacao =
  | { tipo: 'criado'; id: string }
  | { tipo: 'duplicidade'; similares: Similar[]; mensagem: string }

export async function criarProjeto(dados: NovoProjeto): Promise<ResultadoCriacao> {
  try {
    const r = await pb.send<{ id: string }>('/backend/v1/projetos', { method: 'POST', body: dados })
    return { tipo: 'criado', id: r.id }
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 409) {
      const resp = err.response as { similares?: Similar[]; message?: string }
      return { tipo: 'duplicidade', similares: resp.similares || [], mensagem: resp.message || '' }
    }
    throw err
  }
}

export const editarProjeto = (
  id: string,
  versao: string,
  campos: Partial<
    Pick<
      Projeto,
      'nome' | 'local' | 'tipologia' | 'prazo' | 'prioridade' | 'link_entrada' | 'coordenador'
    >
  >,
) =>
  pb.send<{ id: string; versao: string }>(`/backend/v1/projetos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { versao, ...campos },
  })

export const arquivarProjeto = (id: string, motivo: string) =>
  pb.send(`/backend/v1/projetos/${encodeURIComponent(id)}/arquivar`, {
    method: 'POST',
    body: { motivo },
  })

export const restaurarProjeto = (id: string) =>
  pb.send(`/backend/v1/projetos/${encodeURIComponent(id)}/restaurar`, { method: 'POST', body: {} })

// disciplina: id do catálogo ou { nome } para disciplina personalizada
export const incluirDisciplina = (
  id: string,
  disciplina: string | { nome: string },
  responsavel?: string,
) =>
  pb.send(`/backend/v1/projetos/${encodeURIComponent(id)}/disciplinas`, {
    method: 'POST',
    body: {
      ...(typeof disciplina === 'string' ? { disciplina } : { disciplina_nome: disciplina.nome }),
      responsavel: responsavel || '',
    },
  })

export const trocarResponsavel = (id: string, pdId: string, responsavel: string) =>
  pb.send(
    `/backend/v1/projetos/${encodeURIComponent(id)}/disciplinas/${encodeURIComponent(pdId)}`,
    {
      method: 'PATCH',
      body: { responsavel },
    },
  )

export const listDisciplinas = () =>
  pb.collection('disciplinas').getFullList<Disciplina>({ sort: 'nome', filter: 'ativa = true' })

export const listClientes = () => pb.collection('clientes').getFullList<Cliente>({ sort: 'nome' })

export const listAtribuiveis = () =>
  pb
    .send<{ items: PessoaAtribuivel[] }>('/backend/v1/usuarios/atribuiveis', { method: 'GET' })
    .then((r) => r.items)

export const listRevisoes = (projetoId: string) =>
  pb.collection('revisoes').getFullList<Revisao>({
    filter: pb.filter('projeto = {:p}', { p: projetoId }),
    sort: '-created',
    expand: 'autor',
  })

export const createRevisao = (projetoId: string, autorId: string, parecer: string) =>
  pb.collection('revisoes').create<Revisao>({ projeto: projetoId, autor: autorId, parecer })

export const updateRevisao = (id: string, parecer: string) =>
  pb.collection('revisoes').update<Revisao>(id, { parecer })

// Data de hoje no fuso de Brasília (yyyy-mm-dd), usada como mínimo do prazo
export const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)

export const formatarData = (valor: string) => {
  if (!valor) return '—'
  const [a, m, d] = valor.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}
