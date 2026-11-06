import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  FolderKanban,
  Loader2,
  Plus,
  Search,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'
import { ROLE_LABEL } from '@/lib/permissions'
import { TIPO_LABEL, dataBR, type TipoEntrega } from '@/services/entregas'

interface EntregaResumo {
  id: string
  data: string
  tipo: TipoEntrega
  numero_revisao: number
  principal: boolean
}
interface ProjetoInicio {
  id: string
  nome: string
  arquivado: boolean
  prioridade: string
  prazo: string
  coordenador: { id: string; nome: string } | null
  meu: boolean
  coordeno: boolean
  disciplinas: string[]
  disciplinas_texto: string
  proxima: EntregaResumo | null
  atrasadas: number
}
interface Inicio {
  hoje: string
  ve_todos: boolean
  itens: ProjetoInicio[]
  semana: (EntregaResumo & { projeto: { id: string; nome: string } })[]
  atrasadas: (EntregaResumo & { projeto: { id: string; nome: string } })[]
  total_atrasadas: number
}

type Aba = 'meus' | 'todos' | 'arquivados'

const PRIORIDADE_COR: Record<string, string> = {
  Urgente: 'bg-red-50 text-red-700 border-red-100',
  Alta: 'bg-amber-50 text-amber-800 border-amber-100',
}

const rotulo = (e: EntregaResumo) =>
  e.tipo === 'revisao' && e.numero_revisao
    ? `Revisão ${e.numero_revisao}`
    : (TIPO_LABEL[e.tipo] ?? e.tipo)

const diaSemana = (d: string) =>
  ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(d + 'T12:00:00Z').getUTCDay()]

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

export default function Dashboard() {
  const { user, role } = useAuth()
  const [aba, setAba] = useState<Aba>('meus')
  const [busca, setBusca] = useState('')
  const [dados, setDados] = useState<Inicio | null>(null)
  const [erro, setErro] = useState(false)
  const podeCriar = role === 'admin' || role === 'coordenador'
  const arquivados = aba === 'arquivados'

  useEffect(() => {
    setErro(false)
    pb.send<Inicio>(`/backend/v1/inicio${arquivados ? '?arquivados=1' : ''}`, {
      method: 'GET',
      requestKey: null,
    })
      .then((d) => {
        setDados(d)
        // quem vê todos e não tem projeto próprio começa em "Todos"
        if (!arquivados && d.ve_todos && aba === 'meus' && !d.itens.some((p) => p.meu)) {
          setAba('todos')
        }
      })
      .catch(() => setErro(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arquivados])

  const lista = useMemo(() => {
    if (!dados) return []
    const b = normalizar(busca.trim())
    return dados.itens.filter(
      (p) =>
        (aba !== 'meus' || p.meu) &&
        (!b || normalizar(p.nome).includes(b) || normalizar(p.coordenador?.nome || '').includes(b)),
    )
  }, [dados, aba, busca])

  const userName = (user?.name as string) || (user?.email as string)?.split('@')[0] || 'Usuário'
  const primeiroNome = userName.split(' ')[0]
  const abas: { k: Aba; rot: string }[] = [
    { k: 'meus', rot: 'Meus' },
    ...(dados?.ve_todos ? [{ k: 'todos' as Aba, rot: 'Todos' }] : []),
    { k: 'arquivados', rot: 'Arquivados' },
  ]

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-[#0F172A] via-[#1E293B] to-[#1E3A8A] rounded-2xl px-6 py-5 sm:px-8 text-white flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-0.03em]">Olá, {primeiroNome}.</h1>
          <p className="text-slate-300 text-sm mt-0.5">
            Você está como{' '}
            <strong className="text-white">{role ? ROLE_LABEL[role] : 'usuário sem papel'}</strong>.
          </p>
        </div>
        {podeCriar && (
          <Button asChild size="sm" className="bg-white text-[#1E3A8A] hover:bg-blue-50 gap-1">
            <Link to="/projetos/novo">
              <Plus className="w-4 h-4" /> Novo projeto
            </Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Projetos */}
        <section className="lg:col-span-2 bg-white rounded-xl border border-slate-200">
          <div className="p-4 sm:p-5 border-b border-slate-100 space-y-3">
            <div className="flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-[#1E3A8A]" />
              <h2 className="text-base font-bold text-slate-900">Projetos</h2>
              {dados && (
                <span className="text-xs text-slate-400">
                  {lista.length} {lista.length === 1 ? 'projeto' : 'projetos'}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                {abas.map((a) => (
                  <button
                    key={a.k}
                    type="button"
                    onClick={() => setAba(a.k)}
                    className={`px-3 py-1 rounded-md text-sm font-medium ${
                      aba === a.k
                        ? 'bg-white text-[#1E3A8A] shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {a.rot}
                  </button>
                ))}
              </div>
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar projeto ou coordenador"
                  className="h-9 pl-8"
                />
              </div>
            </div>
          </div>

          {!dados && !erro && (
            <div className="p-5 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
            </div>
          )}
          {erro && <p className="p-5 text-sm text-red-600">Não foi possível carregar.</p>}
          {dados && lista.length === 0 && (
            <p className="p-5 text-sm text-slate-500">
              {busca
                ? 'Nenhum projeto com essa busca.'
                : aba === 'meus'
                  ? 'Você ainda não está em nenhum projeto.'
                  : 'Nenhum projeto aqui.'}
            </p>
          )}
          {dados && lista.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {lista.map((p) => {
                const disc = p.disciplinas.length ? p.disciplinas.join(' · ') : p.disciplinas_texto
                const prox = p.proxima
                return (
                  <li key={p.id}>
                    <Link
                      to={`/projetos/${p.id}`}
                      className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`text-sm font-semibold truncate ${p.arquivado ? 'text-slate-400' : 'text-slate-800'}`}
                          >
                            {p.nome}
                          </span>
                          {PRIORIDADE_COR[p.prioridade] && (
                            <span
                              className={`shrink-0 text-[11px] px-1.5 py-0.5 rounded border ${PRIORIDADE_COR[p.prioridade]}`}
                            >
                              {p.prioridade}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 truncate mt-0.5">
                          {p.coordeno ? (
                            <span className="text-[#1E3A8A] font-medium">Você coordena</span>
                          ) : (
                            <>Coord.: {p.coordenador?.nome || '—'}</>
                          )}
                          {disc && <> · {disc}</>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        {p.atrasadas > 0 && (
                          <div className="text-red-700 font-semibold flex items-center justify-end gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" /> {p.atrasadas} atrasada
                            {p.atrasadas > 1 ? 's' : ''}
                          </div>
                        )}
                        {prox ? (
                          <div className="text-slate-700">
                            {rotulo(prox)}{' '}
                            <span className="font-semibold">em {dataBR(prox.data)}</span>
                          </div>
                        ) : (
                          !p.atrasadas && <div className="text-slate-400">Sem entrega marcada</div>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* Entregas */}
        <div className="space-y-6">
          {dados && dados.total_atrasadas > 0 && (
            <section className="bg-white rounded-xl border border-red-200">
              <div className="px-4 py-3 border-b border-red-100 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <h2 className="text-sm font-bold text-red-800">
                  Atrasadas ({dados.total_atrasadas})
                </h2>
              </div>
              <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {dados.atrasadas.map((e) => (
                  <ItemEntrega key={e.id} e={e} atrasada />
                ))}
              </ul>
            </section>
          )}

          <section className="bg-white rounded-xl border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-[#1E3A8A]" />
                <h2 className="text-sm font-bold text-slate-900">Próximos 7 dias</h2>
              </div>
              <Link
                to="/calendario"
                className="text-xs text-[#1E3A8A] hover:underline flex items-center gap-1"
              >
                <CalendarDays className="w-3.5 h-3.5" /> Calendário
              </Link>
            </div>
            {!dados ? (
              <div className="p-4">
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              </div>
            ) : dados.semana.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Nenhuma entrega nos próximos 7 dias.</p>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
                {dados.semana.map((e) => (
                  <ItemEntrega key={e.id} e={e} hoje={dados.hoje} />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function ItemEntrega({
  e,
  atrasada,
  hoje,
}: {
  e: EntregaResumo & { projeto: { id: string; nome: string } }
  atrasada?: boolean
  hoje?: string
}) {
  const ehHoje = hoje === e.data
  return (
    <li>
      <Link
        to={`/projetos/${e.projeto.id}`}
        className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50"
      >
        <div
          className={`w-11 shrink-0 text-center rounded-md py-1 ${
            atrasada
              ? 'bg-red-50 text-red-700'
              : ehHoje
                ? 'bg-[#1E3A8A] text-white'
                : 'bg-slate-100 text-slate-700'
          }`}
        >
          <div className="text-[10px] uppercase leading-none">
            {ehHoje ? 'hoje' : diaSemana(e.data)}
          </div>
          <div className="text-sm font-bold leading-tight">{dataBR(e.data)}</div>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-800 truncate">{e.projeto.nome}</div>
          <div className="text-xs text-slate-500">{rotulo(e)}</div>
        </div>
      </Link>
    </li>
  )
}
