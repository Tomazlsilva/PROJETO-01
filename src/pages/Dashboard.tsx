import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderKanban, ShieldCheck, ChevronRight, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/contexts/AuthContext'
import { ROLE_LABEL, ROLE_PERMISSIONS } from '@/lib/permissions'
import { formatarData, listMeusProjetos, type Projeto } from '@/services/projetos'

const PRIORIDADE_COR: Record<string, string> = {
  Urgente: 'bg-red-50 text-red-700 border-red-100',
  Alta: 'bg-amber-50 text-amber-800 border-amber-100',
  Normal: 'bg-slate-50 text-slate-600 border-slate-200',
  Baixa: 'bg-slate-50 text-slate-500 border-slate-200',
}

export default function Dashboard() {
  const { user, role } = useAuth()
  const [projetos, setProjetos] = useState<Projeto[] | null>(null)
  const [erro, setErro] = useState(false)
  const [arquivados, setArquivados] = useState(false)
  const podeCriar = role === 'admin' || role === 'coordenador'

  useEffect(() => {
    setProjetos(null)
    setErro(false)
    listMeusProjetos(arquivados)
      .then(setProjetos)
      .catch(() => setErro(true))
  }, [arquivados])

  const userName = (user?.name as string) || (user?.email as string)?.split('@')[0] || 'Usuário'

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-[#0F172A] via-[#1E293B] to-[#1E3A8A] rounded-2xl p-6 sm:p-8 text-white">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.03em]">Olá, {userName}.</h1>
        <p className="text-slate-300 text-sm sm:text-base mt-1">
          Central de Gestão da Produção Técnica — você está como{' '}
          <strong className="text-white">{role ? ROLE_LABEL[role] : 'usuário sem papel'}</strong>.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-[#1E3A8A]" />
              <h2 className="text-base font-bold text-slate-900">Projetos que você pode ver</h2>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                <Switch checked={arquivados} onCheckedChange={setArquivados} />
                Mostrar arquivados
              </label>
              {podeCriar && (
                <Button asChild size="sm" className="bg-[#1E3A8A] hover:bg-[#1E2A6B] gap-1">
                  <Link to="/projetos/novo">
                    <Plus className="w-4 h-4" /> Novo projeto
                  </Link>
                </Button>
              )}
            </div>
          </div>
          {projetos === null && !erro && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
            </div>
          )}
          {erro && <p className="text-sm text-red-600">Não foi possível carregar os projetos.</p>}
          {projetos && projetos.length === 0 && (
            <p className="text-sm text-slate-500">Nenhum projeto vinculado a você ainda.</p>
          )}
          {projetos && projetos.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {projetos.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/projetos/${p.id}`}
                    className="flex items-center justify-between gap-3 py-3 px-2 -mx-2 rounded-md hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span
                        className={`block text-sm font-medium truncate ${p.arquivado ? 'text-slate-400' : 'text-slate-800'}`}
                      >
                        {p.nome}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {p.tipologia || 'Sem tipologia'} · prazo {formatarData(p.prazo)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
                      {p.arquivado && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200">
                          arquivado
                        </span>
                      )}
                      {p.prioridade && (
                        <span
                          className={`px-2 py-0.5 rounded-full border ${PRIORIDADE_COR[p.prioridade] ?? ''}`}
                        >
                          {p.prioridade}
                        </span>
                      )}
                      {p.coordenador === user?.id && (
                        <span className="hidden sm:inline px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                          você coordena
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-bold text-slate-900">O que seu papel permite</h2>
          </div>
          {role ? (
            <ul className="space-y-2 text-sm text-slate-600 list-disc pl-5">
              {ROLE_PERMISSIONS[role].map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Sua conta ainda não tem papel definido.</p>
          )}
          <p className="text-xs text-slate-400 mt-4">
            Sessão válida por até 8 horas a partir do login.
          </p>
        </section>
      </div>
    </div>
  )
}
