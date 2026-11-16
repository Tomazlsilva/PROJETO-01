// SPEC-2-006 — modelo de pastas padrão no OneDrive (editor, versões e simulação).
import pb from '@/lib/pocketbase/client'
import type { Pessoa } from '@/services/projetos'

export interface VersaoPastas {
  id: string
  numero: number
  caminho_projeto: string
  subpastas: string[]
  motivo: string
  autor: Pessoa | null
  created: string
}

export interface DadosPastas {
  vigente: VersaoPastas | null
  versoes: VersaoPastas[]
  config: { criacao_automatica: boolean; pasta_raiz: string; acesso_liberado: boolean }
  projetos: { id: string; nome: string }[]
}

export interface ArvoreProjeto {
  projeto: { id: string; nome: string }
  pasta_projeto: string
  caminhos: string[]
  disciplinas: number
  campos_vazios: string[]
}

export const getPastas = () => pb.send<DadosPastas>('/backend/v1/pastas', { method: 'GET' })

export const publicarPastas = (caminho_projeto: string, subpastas: string[], motivo: string) =>
  pb.send<{ numero: number }>('/backend/v1/pastas/publicar', {
    method: 'POST',
    body: { caminho_projeto, subpastas, motivo },
  })

export const previaPastas = (projeto: string, caminho_projeto: string, subpastas: string[]) =>
  pb.send<ArvoreProjeto>('/backend/v1/pastas/simular', {
    method: 'POST',
    body: { projeto, caminho_projeto, subpastas },
  })

export const simularTodos = () =>
  pb.send<{ projetos: number; pastas: number; lista: ArvoreProjeto[]; aviso: string }>(
    '/backend/v1/pastas/simular',
    {
      method: 'POST',
      body: { todos: true },
    },
  )
