import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, MessageSquareText, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { AcessoNegado } from '@/components/AppShell'
import { canWriteReview } from '@/lib/permissions'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import {
  createRevisao,
  getProjeto,
  listRevisoes,
  updateRevisao,
  type Projeto,
  type Revisao,
} from '@/services/projetos'

export default function ProjetoDetalhe() {
  const { id = '' } = useParams()
  const { user, role } = useAuth()
  const [projeto, setProjeto] = useState<Projeto | 'negado' | null>(null)
  const [revisoes, setRevisoes] = useState<Revisao[]>([])
  const [parecer, setParecer] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [textoEdicao, setTextoEdicao] = useState('')

  const carregarRevisoes = useCallback(() => {
    listRevisoes(id)
      .then(setRevisoes)
      .catch(() => setRevisoes([]))
  }, [id])

  useEffect(() => {
    setProjeto(null)
    getProjeto(id)
      .then((p) => {
        setProjeto(p)
        if (p !== 'negado') carregarRevisoes()
      })
      .catch(() => setProjeto('negado'))
  }, [id, carregarRevisoes])

  if (projeto === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
      </div>
    )
  }
  if (projeto === 'negado') return <AcessoNegado />

  const podeRevisar =
    canWriteReview(role) &&
    (role === 'admin' ||
      projeto.coordenador === user?.id ||
      (projeto.membros || []).includes(user?.id ?? ''))

  const registrar = async () => {
    if (!user || !parecer.trim()) return
    setSalvando(true)
    try {
      await createRevisao(projeto.id, user.id, parecer.trim())
      setParecer('')
      toast.success('Revisão registrada.')
      carregarRevisoes()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSalvando(false)
    }
  }

  const salvarEdicao = async (revId: string) => {
    if (!textoEdicao.trim()) return
    try {
      await updateRevisao(revId, textoEdicao.trim())
      setEditando(null)
      toast.success('Revisão atualizada.')
      carregarRevisoes()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">{projeto.nome}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {projeto.coordenador === user?.id
            ? 'Você coordena este projeto.'
            : 'Projeto em que você tem acesso.'}
        </p>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquareText className="w-5 h-5 text-[#1E3A8A]" />
          <h2 className="text-base font-bold text-slate-900">Revisões</h2>
        </div>

        {podeRevisar && (
          <div className="space-y-2">
            <Textarea
              value={parecer}
              onChange={(e) => setParecer(e.target.value)}
              placeholder="Registre o parecer da revisão"
              maxLength={5000}
              rows={3}
            />
            <Button
              onClick={registrar}
              disabled={salvando || !parecer.trim()}
              className="bg-[#1E3A8A] hover:bg-[#1E2A6B]"
            >
              {salvando ? 'Registrando…' : 'Registrar revisão'}
            </Button>
          </div>
        )}

        {revisoes.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma revisão registrada.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {revisoes.map((r) => {
              const minha = r.autor === user?.id
              const autorNome =
                (r.expand?.autor?.name as string) || (minha ? 'Você' : 'Membro da equipe')
              return (
                <li key={r.id} className="py-3 space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      <strong className="text-slate-700">{minha ? 'Você' : autorNome}</strong> ·{' '}
                      {new Date(r.created.replace(' ', 'T')).toLocaleString('pt-BR')}
                    </span>
                    {minha && editando !== r.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditando(r.id)
                          setTextoEdicao(r.parecer)
                        }}
                        className="inline-flex items-center gap-1 text-[#1E3A8A] hover:underline"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Editar
                      </button>
                    )}
                  </div>
                  {editando === r.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={textoEdicao}
                        onChange={(e) => setTextoEdicao(e.target.value)}
                        rows={3}
                        maxLength={5000}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => salvarEdicao(r.id)}>
                          Salvar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditando(null)}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{r.parecer}</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
