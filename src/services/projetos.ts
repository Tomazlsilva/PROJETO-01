import pb from '@/lib/pocketbase/client'
import { ClientResponseError, type RecordModel } from 'pocketbase'

export interface Projeto extends RecordModel {
  nome: string
  coordenador: string
  membros: string[]
}

export interface Revisao extends RecordModel {
  projeto: string
  autor: string
  parecer: string
  expand?: { autor?: RecordModel }
}

export const listMeusProjetos = () =>
  pb.collection('projetos').getFullList<Projeto>({ sort: 'nome' })

// Leitura pelo servidor com resposta uniforme: inexistente e sem permissão → 403
export async function getProjeto(id: string): Promise<Projeto | 'negado'> {
  try {
    return await pb.send<Projeto>(`/backend/v1/projetos/${encodeURIComponent(id)}`, {
      method: 'GET',
    })
  } catch (err) {
    if (err instanceof ClientResponseError && (err.status === 403 || err.status === 404)) {
      return 'negado'
    }
    throw err
  }
}

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
