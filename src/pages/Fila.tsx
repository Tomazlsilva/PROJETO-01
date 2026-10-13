import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ListTodo,
  Loader2,
  Lock,
  RefreshCw,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import {
  MOTIVO_LABEL,
  getFila,
  getFilaEquipe,
  type Fila as FilaDados,
  type FilaEquipe,
  type FiltrosFila,
  type ItemFila,
  type ResumoFila,
} from '@/services/fila'
import { PRIORIDADES, formatarData, listMeusProjetos, type Projeto } from '@/services/projetos'
import { ROLE_LABEL, type Role } from '@/lib/permissions'

const TODOS = '__todos__'

const COR_PRIORIDADE: Record<string, string> = {
  Urgente: 'bg-red-50 text-red-700 border-red-200',
  Alta: 'bg-amber-50 text-amber-700 border-amber-200',
  Normal: 'bg-slate-50 text-slate-600 border-slate-200',
  Baixa: 'bg-slate-50 text-slate-400 border-slate-200',
}

const SITUACOES: { valor: FiltrosFila['situacao']; rotulo: string }[] = [
  { valor: 'atrasado', rotulo: 'Atrasados' },
  { valor: 'bloqueado', rotulo: 'Bloqueados' },
  { valor: 'vencido', rotulo: 'Bloqueio vencido' },
]

export default function Fila() {
  const { role } = useAuth()
  const veEquipe = role === 'admin' || role === 'coordenador' || role === 'executivo'
  const [aba, setAba] = useState<'minha' | 'equipe'>('minha')
  const [projeto, setProjeto] = useState('')
  const [prioridade, setPrioridade] = useState('')
  const [situacao, setSituacao] = useState<FiltrosFila['situacao']>('')
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [minha, setMinha] = useState<FilaDados | null>(null)
  const [equipe, setEquipe] = useState<FilaEquipe | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    const f = { projeto, prioridade, situacao }
    try {
      if (aba === 'minha') setMinha(await getFila(f))
      else setEquipe(await getFilaEquipe(f))
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setCarregando(false)
    }
  }, [aba, projeto, prioridade, situacao])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useEffect(() => {
    listMeusProjetos()
      .then(setProjetos)
      .catch(() => setProjetos([]))
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <ListTodo className="w-6 h-6 text-[#1E3A8A]" /> Fila de trabalho
          </h1>
          <p className="text-sm text-slate-500">
            Ordem: bloqueio vencido, prioridade (Urgente → Baixa), prazo e criação.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => void carregar()}>
          <RefreshCw className="w-4 h-4" /> Atualizar
        </Button>
      </div>

      {veEquipe && (
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
          {(
            [
              ['minha', 'Minha fila', ListTodo],
              ['equipe', 'Equipe', Users],
            ] as const
          ).map(([k, rot, Icone]) => (
            <button
              key={k}
              type="button"
              onClick={() => setAba(k)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium ${
                aba === k ? 'bg-[#1E3A8A] text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icone className="w-4 h-4" /> {rot}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-64">
          <Select value={projeto || TODOS} onValueChange={(v) => setProjeto(v === TODOS ? '' : v)}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Projeto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os projetos</SelectItem>
              {projetos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-44">
          <Select
            value={prioridade || TODOS}
            onValueChange={(v) => setPrioridade(v === TODOS ? '' : v)}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas as prioridades</SelectItem>
              {[...PRIORIDADES].reverse().map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-1">
          {SITUACOES.map((s) => (
            <button
              key={s.valor}
              type="button"
              onClick={() => setSituacao(situacao === s.valor ? '' : s.valor)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                situacao === s.valor
                  ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {s.rotulo}
            </button>
          ))}
        </div>
        {carregando && <Loader2 className="w-4 h-4 animate-spin text-slate-400 sm:ml-auto" />}
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      {aba === 'minha' ? (
        !minha ? (
          <Carregando />
        ) : (
          <div className="space-y-3">
            <Resumo r={minha.resumo} />
            <ListaItens itens={minha.itens} vazio="Nada na sua fila com esses filtros." />
          </div>
        )
      ) : !equipe ? (
        <Carregando />
      ) : equipe.pessoas.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum item ativo na equipe com esses filtros.</p>
      ) : (
        <div className="space-y-3">
          {equipe.pessoas.map((p) => (
            <PessoaEquipe key={p.pessoa.id} dados={p} />
          ))}
        </div>
      )}
    </div>
  )
}

function Carregando() {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
    </div>
  )
}

function Resumo({ r }: { r: ResumoFila }) {
  const caixa = (rotulo: string, valor: number, cor: string) => (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 min-w-[120px]">
      <div className={`text-2xl font-extrabold ${valor > 0 ? cor : 'text-slate-800'}`}>{valor}</div>
      <div className="text-xs text-slate-500">{rotulo}</div>
    </div>
  )
  return (
    <div className="flex flex-wrap gap-3">
      {caixa('itens', r.total, 'text-slate-800')}
      {caixa('atrasados', r.atrasados, 'text-red-600')}
      {caixa('bloqueados', r.bloqueados, 'text-red-600')}
      {caixa('bloqueio vencido', r.vencidos, 'text-red-700')}
    </div>
  )
}

function PessoaEquipe({ dados }: { dados: FilaEquipe['pessoas'][number] }) {
  const [aberto, setAberto] = useState(false)
  const r = dados.resumo
  return (
    <section className="bg-white border border-slate-200 rounded-xl">
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        className="w-full flex flex-wrap items-center gap-3 p-4 text-left"
      >
        {aberto ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400" />
        )}
        <span className="font-semibold text-slate-900">{dados.pessoa.nome}</span>
        <span className="text-xs text-slate-500">
          {ROLE_LABEL[dados.pessoa.papel as Role] ?? dados.pessoa.papel}
          {!dados.pessoa.ativo && ' · inativo'}
        </span>
        <span className="sm:ml-auto flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
            {r.total} itens
          </span>
          {r.atrasados > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
              {r.atrasados} atrasado(s)
            </span>
          )}
          {r.bloqueados > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
              {r.bloqueados} bloqueado(s)
            </span>
          )}
          {r.vencidos > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-600 text-white">
              {r.vencidos} bloqueio(s) vencido(s)
            </span>
          )}
        </span>
      </button>
      {aberto && (
        <div className="border-t border-slate-100 p-3">
          <ListaItens itens={dados.itens} vazio="Sem itens." />
        </div>
      )}
    </section>
  )
}

function ListaItens({ itens, vazio }: { itens: ItemFila[]; vazio: string }) {
  if (itens.length === 0) return <p className="text-sm text-slate-500">{vazio}</p>
  return (
    <ul className="space-y-2">
      {itens.map((i) => (
        <li key={i.id}>
          <Link
            to={`/kanban?projeto=${i.projeto.id}&card=${i.id}`}
            className={`block bg-white rounded-lg border p-3 hover:shadow-sm transition-shadow ${
              i.bloqueio?.vencido
                ? 'border-red-400 ring-1 ring-red-200'
                : i.bloqueado
                  ? 'border-red-200'
                  : 'border-slate-200'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-900">{i.disciplina.nome}</span>
              <span className="text-sm text-slate-500">· {i.projeto.nome}</span>
              <span
                className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${
                  COR_PRIORIDADE[i.prioridade] ?? COR_PRIORIDADE.Normal
                }`}
                title={i.prioridade_propria ? 'Prioridade da disciplina' : 'Prioridade do projeto'}
              >
                {i.prioridade}
                {i.prioridade_propria && ' •'}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-[#1E3A8A] border border-blue-100">
                {i.etapa_nome}
              </span>
              {i.atividade?.precisa_ajuste && (
                <span
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800"
                  title={i.atividade.motivo_ajuste}
                >
                  Ajuste necessário
                </span>
              )}
              {i.atividade && !i.atividade.precisa_ajuste && i.atividade.status === 'pendente' && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#1E3A8A] text-white">
                  Nova
                </span>
              )}
              <span className="sm:ml-auto flex flex-wrap gap-1">
                {i.motivos.map((m) => (
                  <span
                    key={m}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600"
                  >
                    {MOTIVO_LABEL[m]}
                  </span>
                ))}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500">
              <span
                className={`flex items-center gap-1 ${i.atrasado ? 'text-red-600 font-semibold' : ''}`}
              >
                <CalendarClock className="w-3.5 h-3.5" /> {formatarData(i.prazo)}
                {i.prazo_proprio && ' (disciplina)'}
                {i.atrasado && ' · atrasado'}
              </span>
              <span>Responsável: {i.responsavel?.nome ?? '—'}</span>
              {i.bloqueado && i.bloqueio && (
                <span className="flex items-center gap-1 text-red-700">
                  {i.bloqueio.vencido ? (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  ) : (
                    <Lock className="w-3.5 h-3.5" />
                  )}
                  {i.bloqueio.motivo} · dono {i.bloqueio.dono?.nome ?? '—'} · revisar{' '}
                  {formatarData(i.bloqueio.revisao)}
                  {i.bloqueio.vencido && (
                    <strong className="ml-1 px-1.5 rounded bg-red-600 text-white">vencido</strong>
                  )}
                </span>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
