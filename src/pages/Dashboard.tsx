import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderKanban, ShieldCheck, ChevronRight, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { ROLE_LABEL, ROLE_PERMISSIONS } from '@/lib/permissions'
import { listMeusProjetos, type Projeto } from '@/services/projetos'

export default function Dashboard() {
  const { user, role } = useAuth()
  const [projetos, setProjetos] = useState<Projeto[] | null>(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    listMeusProjetos()
      .then(setProjetos)
      .catch(() => setErro(true))
  }, [])

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
          <div className="flex items-center gap-2 mb-4">
            <FolderKanban className="w-5 h-5 text-[#1E3A8A]" />
            <h2 className="text-base font-bold text-slate-900">Projetos que você pode ver</h2>
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
                    className="flex items-center justify-between py-3 px-2 -mx-2 rounded-md hover:bg-slate-50"
                  >
                    <span className="text-sm font-medium text-slate-800">{p.nome}</span>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {p.coordenador === user?.id && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
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
