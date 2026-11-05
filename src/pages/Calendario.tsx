// SPEC-1-008 — Calendário de entregas (substitui o Planner "CRONOGRAMA").
// Semana (segunda a domingo) e mês; busca por projeto; filtro por disciplina; feriados;
// janelas de execução; card com mudança de data, entregue/ART, revisão e pessoas;
// linha do tempo do projeto. Quem pode editar é decidido pelo servidor (pode_editar).
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  History,
  Loader2,
  Plus,
  Play,
  Search,
  Timer,
  Trash2,
  Users,
} from 'lucide-react'
import { EVENTO_TEMPO } from '@/components/TimerTopo'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  getProjeto,
  listAtribuiveis,
  listDisciplinas,
  type Disciplina,
  type PessoaAtribuivel,
} from '@/services/projetos'
import {
  DIAS_SEMANA,
  MESES,
  TIPO_LABEL,
  acaoEntrega,
  dataBR,
  dataHoraBR,
  getCalendario,
  getLinhaDoTempo,
  hojeBR,
  horasTxt,
  iniciarNaEntrega,
  recusaDe,
  rotuloEntrega,
  segundaDe,
  somaDias,
  type AcaoEntrega,
  type Calendario as Cal,
  type Entrega,
  type LinhaDoTempo,
  type TipoEntrega,
} from '@/services/entregas'

const COR: Record<TipoEntrega, string> = {
  previa: 'border-l-amber-500 bg-amber-50',
  final: 'border-l-blue-700 bg-blue-50',
  revisao: 'border-l-purple-600 bg-purple-50',
  outro: 'border-l-slate-400 bg-slate-50',
}

type Confirmacao = { mensagem: string; repetir: () => void } | null

// Executa uma ação; em "feriado" pede confirmação e repete com confirmar_feriado
function useExecutor(aoConcluir: () => void) {
  const [confirmacao, setConfirmacao] = useState<Confirmacao>(null)
  const [ocupado, setOcupado] = useState(false)
  const executar = useCallback(
    async (
      id: string,
      acao: AcaoEntrega,
      corpo: Record<string, unknown>,
      ok: string,
      aoRecusar?: (code: string, r: ReturnType<typeof recusaDe>) => boolean,
    ) => {
      setOcupado(true)
      try {
        await acaoEntrega(id, acao, corpo)
        toast.success(ok)
        aoConcluir()
        return true
      } catch (err) {
        const r = recusaDe(err)
        if (r && r.code === 'feriado') {
          setConfirmacao({
            mensagem: r.message,
            repetir: () =>
              void executar(id, acao, { ...corpo, confirmar_feriado: true }, ok, aoRecusar),
          })
        } else if (!(r && aoRecusar && aoRecusar(r.code, r))) {
          toast.error(getErrorMessage(err))
        }
        return false
      } finally {
        setOcupado(false)
      }
    },
    [aoConcluir],
  )
  const dialogo = (
    <Dialog open={!!confirmacao} onOpenChange={(o) => !o && setConfirmacao(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Data em feriado</DialogTitle>
          <DialogDescription>{confirmacao?.mensagem}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmacao(null)}>
            Escolher outra data
          </Button>
          <Button
            className="bg-[#1E3A8A] hover:bg-[#1E2A6B]"
            onClick={() => {
              const c = confirmacao
              setConfirmacao(null)
              c?.repetir()
            }}
          >
            Gravar mesmo assim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
  return { executar, ocupado, dialogo }
}

export default function Calendario() {
  const { role, user } = useAuth()
  const podeMes =
    role !== 'projetista' || !!(user as { ve_cronograma?: boolean } | null)?.ve_cronograma
  const [modo, setModo] = useState<'semana' | 'mes'>('semana')
  const [ref, setRef] = useState(hojeBR())
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [disciplina, setDisciplina] = useState('')
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([])
  const [cal, setCal] = useState<Cal | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [aberta, setAberta] = useState<Entrega | null>(null)
  const [nova, setNova] = useState<string | null>(null) // data sugerida
  const [linha, setLinha] = useState<string | null>(null) // projeto

  const periodo = useMemo(() => {
    if (modo === 'semana') {
      const de = segundaDe(ref)
      return { de, ate: somaDias(de, 6) }
    }
    const primeiro = ref.slice(0, 8) + '01'
    const de = segundaDe(primeiro)
    const ultimo = somaDias(
      (Number(ref.slice(5, 7)) === 12
        ? Number(ref.slice(0, 4)) + 1 + '-01'
        : ref.slice(0, 5) + String(Number(ref.slice(5, 7)) + 1).padStart(2, '0')) + '-01',
      -1,
    )
    const fimSemana = somaDias(segundaDe(ultimo), 6)
    return { de, ate: fimSemana }
  }, [modo, ref])

  const carregar = useCallback(() => {
    setCarregando(true)
    getCalendario({ ...periodo, busca: buscaAplicada, disciplina })
      .then((c) => {
        setCal(c)
        setAberta((a) => (a ? c.entregas.find((x) => x.id === a.id) || null : null))
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setCarregando(false))
  }, [periodo, buscaAplicada, disciplina])

  useEffect(() => carregar(), [carregar])
  useEffect(() => {
    listDisciplinas()
      .then(setDisciplinas)
      .catch(() => setDisciplinas([]))
  }, [])

  const dias = useMemo(() => {
    const l: string[] = []
    for (let d = periodo.de; d <= periodo.ate; d = somaDias(d, 1)) l.push(d)
    return l
  }, [periodo])
  const feriadoDo = (d: string) => cal?.feriados.filter((f) => f.ativo && f.data === d) || []
  const entregasDo = (d: string) => cal?.entregas.filter((e) => e.data === d) || []
  // janelas: quem está executando cada entrega naquele dia (antes do dia da entrega)
  const janelasDo = (d: string) => {
    const l: { entrega: Entrega; pessoas: string[] }[] = []
    for (const e of cal?.entregas || []) {
      if (e.data === d) continue
      const ps = e.alocacoes
        .filter((a) => a.inicio <= d && a.fim >= d)
        .map((a) => a.pessoa?.nome || a.pessoa_texto)
      if (ps.length) l.push({ entrega: e, pessoas: ps })
    }
    return l
  }
  const mover = (n: number) =>
    setRef(
      modo === 'semana'
        ? somaDias(ref, 7 * n)
        : (() => {
            const a = Number(ref.slice(0, 4))
            const m = Number(ref.slice(5, 7)) - 1 + n
            const ano = a + Math.floor(m / 12)
            const mes = ((m % 12) + 12) % 12
            return `${ano}-${String(mes + 1).padStart(2, '0')}-01`
          })(),
    )
  const titulo =
    modo === 'semana'
      ? `${dataBR(periodo.de)} a ${dataBR(periodo.ate)}/${periodo.ate.slice(0, 4)}`
      : `${MESES[Number(ref.slice(5, 7)) - 1]} de ${ref.slice(0, 4)}`
  const hoje = cal?.hoje || hojeBR()
  const mesAtual = ref.slice(0, 7)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-[#1E3A8A]" /> Calendário de entregas
          </h1>
          <p className="text-sm text-slate-500">
            {cal?.escopo === 'proprio'
              ? 'Sua semana nos projetos em que você está.'
              : 'Prévias, finais e revisões, com as janelas de execução de cada pessoa.'}
          </p>
        </div>
        {cal && cal.projetos_editaveis.length > 0 && (
          <Button
            onClick={() => setNova(ref >= hoje ? ref : hoje)}
            className="bg-[#1E3A8A] hover:bg-[#1E2A6B] gap-1.5"
          >
            <Plus className="w-4 h-4" /> Nova entrega
          </Button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => mover(-1)} aria-label="Anterior">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRef(hojeBR())}>
            Hoje
          </Button>
          <Button size="sm" variant="outline" onClick={() => mover(1)} aria-label="Próximo">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="font-semibold text-slate-800 capitalize min-w-[150px]">{titulo}</div>
        {podeMes && (
          <div className="flex rounded-md border border-slate-200 overflow-hidden">
            {(['semana', 'mes'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setModo(m)}
                className={`px-3 py-1.5 text-sm ${modo === m ? 'bg-blue-50 text-[#1E3A8A] font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {m === 'semana' ? 'Semana' : 'Mês'}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex items-center gap-1 ml-auto"
          onSubmit={(ev) => {
            ev.preventDefault()
            setBuscaAplicada(busca.trim())
          }}
        >
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar projeto"
            className="h-9 w-44"
          />
          <Button size="sm" variant="outline" type="submit" aria-label="Buscar">
            <Search className="w-4 h-4" />
          </Button>
        </form>
        <Select
          value={disciplina || 'todas'}
          onValueChange={(v) => setDisciplina(v === 'todas' ? '' : v)}
        >
          <SelectTrigger className="h-9 w-48">
            <SelectValue placeholder="Disciplina" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as disciplinas</SelectItem>
            {disciplinas.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {carregando && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        {(Object.keys(TIPO_LABEL) as TipoEntrega[]).map((t) => (
          <span key={t} className={`border-l-4 pl-1.5 ${COR[t]}`}>
            {TIPO_LABEL[t]}
          </span>
        ))}
        <span className="pl-1.5 border-l-4 border-l-emerald-600">Entregue</span>
        <span className="pl-1.5 italic">Em execução (janela)</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <div className="grid grid-cols-7 min-w-[900px]">
          {DIAS_SEMANA.map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-xs font-semibold uppercase text-slate-500 border-b border-slate-100"
            >
              {d}
            </div>
          ))}
          {dias.map((d) => {
            const fer = feriadoDo(d)
            const facultativo =
              fer.length > 0 && fer.every((f) => f.abrangencia === 'ponto_facultativo')
            const fora = modo === 'mes' && d.slice(0, 7) !== mesAtual
            return (
              <div
                key={d}
                className={`border-b border-r border-slate-100 p-1.5 space-y-1 ${modo === 'semana' ? 'min-h-[320px]' : 'min-h-[120px]'} ${fer.length ? (facultativo ? 'bg-amber-50/40' : 'bg-rose-50/60') : ''} ${fora ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-semibold ${d === hoje ? 'bg-[#1E3A8A] text-white rounded px-1.5' : 'text-slate-600'}`}
                  >
                    {d.slice(8, 10)}
                    {modo === 'semana' ? '/' + d.slice(5, 7) : ''}
                  </span>
                </div>
                {fer.map((f) => (
                  <div
                    key={f.id}
                    className={`text-[11px] leading-tight ${f.abrangencia === 'ponto_facultativo' ? 'text-amber-700' : 'text-rose-700 font-medium'}`}
                  >
                    {f.nome}
                  </div>
                ))}
                {entregasDo(d).map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setAberta(e)}
                    className={`w-full text-left border-l-4 rounded px-1.5 py-1 text-xs hover:ring-1 hover:ring-slate-300 ${e.entregue ? 'border-l-emerald-600 bg-emerald-50' : COR[e.tipo]}`}
                  >
                    <div className="font-semibold text-slate-800 truncate">{e.projeto.nome}</div>
                    <div className="text-slate-600 truncate">
                      {e.entregue && <Check className="inline w-3 h-3 mr-0.5 text-emerald-700" />}
                      {rotuloEntrega(e)}
                      {e.disciplinas.length > 0 &&
                        ' · ' + e.disciplinas.map((x) => x.sigla || x.nome).join('/')}
                    </div>
                    {modo === 'semana' && e.alocacoes.length > 0 && (
                      <div className="text-slate-500 truncate">
                        {e.alocacoes.map((a) => a.pessoa?.nome || a.pessoa_texto).join(', ')}
                      </div>
                    )}
                    {e.art_entregue && (
                      <span className="inline-block mt-0.5 text-[10px] px-1 rounded bg-emerald-100 text-emerald-800">
                        ART entregue
                      </span>
                    )}
                  </button>
                ))}
                {modo === 'semana' &&
                  janelasDo(d).map(({ entrega: e, pessoas }) => (
                    <button
                      key={e.id + d}
                      onClick={() => setAberta(e)}
                      className="w-full text-left rounded px-1.5 py-1 text-[11px] italic text-slate-600 bg-slate-50 border border-dashed border-slate-200 hover:bg-slate-100"
                    >
                      {pessoas.join(', ')} → {e.projeto.nome} ({rotuloEntrega(e)} em{' '}
                      {dataBR(e.data)})
                    </button>
                  ))}
              </div>
            )
          })}
        </div>
      </div>

      {aberta && (
        <EntregaDialog
          entrega={aberta}
          onClose={() => setAberta(null)}
          onChanged={carregar}
          onLinha={(pid) => setLinha(pid)}
        />
      )}
      {nova && cal && (
        <NovaEntregaDialog
          data={nova}
          projetos={cal.projetos_editaveis}
          onClose={() => setNova(null)}
          onCreated={carregar}
        />
      )}
      {linha && <LinhaDoTempoDialog projetoId={linha} onClose={() => setLinha(null)} />}
    </div>
  )
}

// ---------- pessoas e janelas ----------
type LinhaPessoa = { pessoa: string; pessoa_texto: string; inicio: string; fim: string }

function EditorPessoas({
  linhas,
  setLinhas,
  pessoas,
  dataEntrega,
}: {
  linhas: LinhaPessoa[]
  setLinhas: (l: LinhaPessoa[]) => void
  pessoas: PessoaAtribuivel[]
  dataEntrega: string
}) {
  const muda = (i: number, campo: keyof LinhaPessoa, v: string) =>
    setLinhas(linhas.map((l, j) => (j === i ? { ...l, [campo]: v } : l)))
  return (
    <div className="space-y-2">
      {linhas.map((l, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[160px]">
            {l.pessoa || !l.pessoa_texto ? (
              <Select value={l.pessoa || undefined} onValueChange={(v) => muda(i, 'pessoa', v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Pessoa" />
                </SelectTrigger>
                <SelectContent>
                  {pessoas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={l.pessoa_texto}
                disabled
                className="h-9"
                title="Nome vindo do Planner"
              />
            )}
          </div>
          <div>
            <Label className="text-[11px] text-slate-500">Início</Label>
            <Input
              type="date"
              value={l.inicio}
              max={dataEntrega}
              onChange={(e) => muda(i, 'inicio', e.target.value)}
              className="h-9 w-36"
            />
          </div>
          <div>
            <Label className="text-[11px] text-slate-500">Fim</Label>
            <Input
              type="date"
              value={l.fim}
              max={dataEntrega}
              onChange={(e) => muda(i, 'fim', e.target.value)}
              className="h-9 w-36"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 px-2"
            onClick={() => setLinhas(linhas.filter((_, j) => j !== i))}
            aria-label="Tirar pessoa"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        className="gap-1"
        onClick={() =>
          setLinhas([...linhas, { pessoa: '', pessoa_texto: '', inicio: '', fim: '' }])
        }
      >
        <Plus className="w-3.5 h-3.5" /> Pessoa
      </Button>
      <p className="text-xs text-slate-500">
        Sem início e fim, a pessoa aparece só no dia da entrega. A janela termina no máximo na data
        da entrega ({dataBR(dataEntrega)}).
      </p>
    </div>
  )
}

const paraEnvio = (linhas: LinhaPessoa[]) =>
  linhas
    .filter((l) => l.pessoa || l.pessoa_texto)
    .map((l) => ({
      ...(l.pessoa ? { pessoa: l.pessoa } : { pessoa_texto: l.pessoa_texto }),
      ...(l.inicio || l.fim ? { inicio: l.inicio, fim: l.fim } : {}),
    }))

// ---------- card da entrega ----------
function EntregaDialog({
  entrega: e,
  onClose,
  onChanged,
  onLinha,
}: {
  entrega: Entrega
  onClose: () => void
  onChanged: () => void
  onLinha: (projetoId: string) => void
}) {
  const { executar, ocupado, dialogo } = useExecutor(onChanged)
  const { role } = useAuth()
  const [timerAberto, setTimerAberto] = useState(false)
  const iniciar = async (encerrarAnterior: boolean) => {
    try {
      await iniciarNaEntrega(e.id, encerrarAnterior)
      setTimerAberto(false)
      toast.success('Apontamento iniciado nesta entrega.')
      window.dispatchEvent(new Event(EVENTO_TEMPO))
    } catch (err) {
      const r = recusaDe(err)
      if (r?.code === 'timer_ativo') setTimerAberto(true)
      else toast.error(getErrorMessage(err))
    }
  }
  const [novaData, setNovaData] = useState(e.data)
  const [dataRevisao, setDataRevisao] = useState('')
  const [editandoPessoas, setEditandoPessoas] = useState(false)
  const [pessoas, setPessoas] = useState<PessoaAtribuivel[]>([])
  const [linhas, setLinhas] = useState<LinhaPessoa[]>([])
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    setNovaData(e.data)
    setAviso('')
  }, [e.id, e.data])
  useEffect(() => {
    if (!e.pode_editar) return
    listAtribuiveis()
      .then(setPessoas)
      .catch(() => setPessoas([]))
  }, [e.pode_editar])
  const abrirPessoas = () => {
    setLinhas(
      e.alocacoes.map((a) => ({
        pessoa: a.pessoa?.id || '',
        pessoa_texto: a.pessoa ? '' : a.pessoa_texto,
        inicio: a.inicio === e.data && a.fim === e.data ? '' : a.inicio,
        fim: a.inicio === e.data && a.fim === e.data ? '' : a.fim,
      })),
    )
    setEditandoPessoas(true)
  }
  const corpo = (extra: Record<string, unknown>) => ({ versao: e.versao, ...extra })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {rotuloEntrega(e)} · {e.projeto.nome}
          </DialogTitle>
          <DialogDescription>
            {dataBR(e.data)}/{e.data.slice(0, 4)}
            {e.descricao ? ' · ' + e.descricao : ''}
            {e.projeto.coordenador ? ' · Coordenação: ' + e.projeto.coordenador.nome : ''}
            {e.origem === 'planner' ? ' · importada do Planner' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-2">
            {e.disciplinas.length === 0 && !e.disciplinas_texto && (
              <span className="text-slate-500">Sem disciplina ligada</span>
            )}
            {e.disciplinas_texto && (
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs">
                Planner: {e.disciplinas_texto}
              </span>
            )}
            {e.disciplinas.map((d) => (
              <span
                key={d.card_id}
                className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs"
              >
                {d.nome}
              </span>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="font-semibold text-slate-800">Etapa entregue</div>
              <div className="text-slate-500 text-xs">
                {e.entregue
                  ? `Sim — ${dataHoraBR(e.entregue_em)} por ${e.entregue_por?.nome || '—'}`
                  : 'Ainda não'}
              </div>
              {e.pode_editar && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  disabled={ocupado}
                  onClick={() =>
                    executar(
                      e.id,
                      e.entregue ? 'desfazer_entrega' : 'entregar',
                      corpo({}),
                      e.entregue ? 'Entrega desfeita.' : 'Etapa marcada como entregue.',
                    )
                  }
                >
                  {e.entregue ? 'Desfazer entrega' : 'Marcar entregue'}
                </Button>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="font-semibold text-slate-800">ART</div>
              <div className="text-slate-500 text-xs">
                {e.art_entregue
                  ? `Entregue — ${dataHoraBR(e.art_em)} por ${e.art_por?.nome || '—'}`
                  : e.art_pendente
                    ? 'Pendente'
                    : 'Não entregue'}
              </div>
              {e.pode_editar && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  disabled={ocupado}
                  onClick={() =>
                    executar(
                      e.id,
                      e.art_entregue ? 'desfazer_art' : 'art',
                      corpo({}),
                      e.art_entregue ? 'ART desmarcada.' : 'ART marcada como entregue.',
                    )
                  }
                >
                  {e.art_entregue ? 'Desfazer ART' : 'Marcar ART entregue'}
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                <Timer className="w-4 h-4" /> Horas apontadas: {horasTxt(e.horas.total_seg)}
              </div>
              {role !== 'administrativo' && !e.entregue && (
                <Button
                  size="sm"
                  className="gap-1 bg-green-700 hover:bg-green-800"
                  onClick={() => iniciar(false)}
                >
                  <Play className="w-3.5 h-3.5" /> Iniciar apontamento
                </Button>
              )}
            </div>
            {timerAberto && (
              <div className="mt-2 text-xs text-amber-800 bg-amber-50 rounded p-2 flex flex-wrap items-center gap-2">
                Você já tem um apontamento aberto.
                <Button size="sm" variant="outline" className="h-7" onClick={() => iniciar(true)}>
                  Encerrar o anterior e começar este
                </Button>
              </div>
            )}
            {e.horas.por_pessoa.length > 0 && (
              <ul className="mt-1 text-xs text-slate-600">
                {e.horas.por_pessoa.map((p, i) => (
                  <li key={p.pessoa?.id || i}>
                    {p.pessoa?.nome || '—'}: {horasTxt(p.seg)}
                  </li>
                ))}
              </ul>
            )}
            {e.horas.fora_da_janela > 0 && (
              <p className="mt-1 text-xs text-amber-700">
                {e.horas.fora_da_janela} apontamento(s) fora da janela de execução.
              </p>
            )}
          </div>

          <div>
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <Users className="w-4 h-4" /> Pessoas e janelas
            </div>
            {!editandoPessoas ? (
              <>
                {e.alocacoes.length === 0 && (
                  <div className="text-slate-500 text-xs">Ninguém definido.</div>
                )}
                <ul className="mt-1 space-y-0.5">
                  {e.alocacoes.map((a, i) => (
                    <li key={a.id || i} className="text-slate-700">
                      {a.pessoa?.nome || a.pessoa_texto}
                      <span className="text-slate-500">
                        {a.inicio === a.fim
                          ? ` — ${dataBR(a.inicio)}`
                          : ` — de ${dataBR(a.inicio)} a ${dataBR(a.fim)}`}
                      </span>
                    </li>
                  ))}
                </ul>
                {e.pode_editar && (
                  <Button size="sm" variant="outline" className="mt-2" onClick={abrirPessoas}>
                    Definir pessoas e janelas
                  </Button>
                )}
              </>
            ) : (
              <div className="mt-2 space-y-2">
                <EditorPessoas
                  linhas={linhas}
                  setLinhas={setLinhas}
                  pessoas={pessoas}
                  dataEntrega={novaData || e.data}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={ocupado}
                    className="bg-[#1E3A8A] hover:bg-[#1E2A6B]"
                    onClick={async () => {
                      const mudouData = novaData && novaData !== e.data
                      const ok = await executar(
                        e.id,
                        mudouData ? 'alterar' : 'alocacoes',
                        corpo(
                          mudouData
                            ? { data: novaData, alocacoes: paraEnvio(linhas) }
                            : { alocacoes: paraEnvio(linhas) },
                        ),
                        'Pessoas e janelas salvas.',
                      )
                      if (ok) setEditandoPessoas(false)
                    }}
                  >
                    Salvar pessoas
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditandoPessoas(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>

          {e.pode_editar && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                <Label>Mudar a data</Label>
                <Input
                  type="date"
                  value={novaData}
                  onChange={(ev) => setNovaData(ev.target.value)}
                />
                {e.principal && (
                  <p className="text-xs text-slate-500">
                    É a Final principal: o prazo do projeto muda junto.
                  </p>
                )}
                {aviso && <p className="text-xs text-amber-700">{aviso}</p>}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={ocupado || !novaData || novaData === e.data}
                  onClick={() =>
                    executar(
                      e.id,
                      'alterar',
                      corpo({ data: novaData }),
                      'Data alterada.',
                      (code, r) => {
                        if (code === 'janela_conflito') {
                          setAviso(r?.message || '')
                          abrirPessoas()
                          return true
                        }
                        return false
                      },
                    )
                  }
                >
                  Salvar data
                </Button>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                <Label>Adicionar revisão</Label>
                <Input
                  type="date"
                  value={dataRevisao}
                  onChange={(ev) => setDataRevisao(ev.target.value)}
                />
                <p className="text-xs text-slate-500">
                  Mesmo projeto, disciplinas e pessoas; a Final não muda.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={ocupado || !dataRevisao}
                  onClick={async () => {
                    const ok = await executar(
                      e.id,
                      'revisao',
                      corpo({ data: dataRevisao }),
                      'Revisão adicionada.',
                    )
                    if (ok) setDataRevisao('')
                  }}
                >
                  Adicionar revisão
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" className="gap-1" onClick={() => onLinha(e.projeto.id)}>
            <History className="w-4 h-4" /> Linha do tempo do projeto
          </Button>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
        {dialogo}
      </DialogContent>
    </Dialog>
  )
}

// ---------- nova entrega ----------
function NovaEntregaDialog({
  data,
  projetos,
  onClose,
  onCreated,
}: {
  data: string
  projetos: { id: string; nome: string }[]
  onClose: () => void
  onCreated: () => void
}) {
  const { executar, ocupado, dialogo } = useExecutor(onCreated)
  const [projeto, setProjeto] = useState('')
  const [tipo, setTipo] = useState<TipoEntrega>('previa')
  const [dia, setDia] = useState(data)
  const [descricao, setDescricao] = useState('')
  const [cards, setCards] = useState<{ id: string; nome: string }[]>([])
  const [marcados, setMarcados] = useState<string[]>([])
  const [pessoas, setPessoas] = useState<PessoaAtribuivel[]>([])
  const [linhas, setLinhas] = useState<LinhaPessoa[]>([])

  useEffect(() => {
    listAtribuiveis()
      .then(setPessoas)
      .catch(() => setPessoas([]))
  }, [])
  useEffect(() => {
    setCards([])
    setMarcados([])
    if (!projeto) return
    getProjeto(projeto)
      .then((p) => {
        if (p === 'negado') return
        setCards(p.detalhe.disciplinas.map((d) => ({ id: d.id, nome: d.disciplina.nome })))
      })
      .catch(() => setCards([]))
  }, [projeto])

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova entrega</DialogTitle>
          <DialogDescription>
            A Final principal de cada projeto nasce do prazo do projeto.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Projeto</Label>
            <Select value={projeto || undefined} onValueChange={setProjeto}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha o projeto" />
              </SelectTrigger>
              <SelectContent>
                {projetos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoEntrega)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIPO_LABEL) as TipoEntrega[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data do envio</Label>
              <Input type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Descrição (opcional)</Label>
            <Input
              value={descricao}
              maxLength={300}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: REV. ARC/ELE"
            />
          </div>
          {cards.length > 0 && (
            <div className="space-y-1.5">
              <Label>Disciplinas</Label>
              <div className="flex flex-wrap gap-3">
                {cards.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={marcados.includes(c.id)}
                      onCheckedChange={(v) =>
                        setMarcados(
                          v === true ? [...marcados, c.id] : marcados.filter((x) => x !== c.id),
                        )
                      }
                    />
                    {c.nome}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Pessoas e janelas</Label>
            <EditorPessoas
              linhas={linhas}
              setLinhas={setLinhas}
              pessoas={pessoas}
              dataEntrega={dia}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={ocupado || !projeto || !dia}
            className="bg-[#1E3A8A] hover:bg-[#1E2A6B]"
            onClick={async () => {
              const ok = await executar(
                projeto,
                'criar',
                {
                  tipo,
                  data: dia,
                  descricao,
                  disciplinas: marcados,
                  alocacoes: paraEnvio(linhas),
                },
                'Entrega criada.',
              )
              if (ok) onClose()
            }}
          >
            Criar entrega
          </Button>
        </DialogFooter>
        {dialogo}
      </DialogContent>
    </Dialog>
  )
}

// ---------- linha do tempo ----------
const ACAO_LABEL: Record<string, string> = {
  criada: 'Criada',
  data_alterada: 'Data alterada',
  tipo_alterado: 'Tipo alterado',
  descricao_alterada: 'Descrição alterada',
  disciplinas_alteradas: 'Disciplinas alteradas',
  alocacao_alterada: 'Pessoas/janelas alteradas',
  entregue: 'Marcada como entregue',
  entrega_desfeita: 'Entrega desfeita',
  art_entregue: 'ART entregue',
  art_desfeita: 'ART desfeita',
  horas_corrigidas: 'Horas corrigidas',
}

function LinhaDoTempoDialog({ projetoId, onClose }: { projetoId: string; onClose: () => void }) {
  const [dados, setDados] = useState<LinhaDoTempo | null>(null)
  useEffect(() => {
    getLinhaDoTempo(projetoId)
      .then(setDados)
      .catch((err) => {
        toast.error(getErrorMessage(err))
        onClose()
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetoId])
  const nomeEntrega = (id: string) => {
    const x = dados?.entregas.find((e) => e.id === id)
    return x ? `${rotuloEntrega(x)} (${dataBR(x.data)})` : ''
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Linha do tempo{dados ? ' · ' + dados.projeto.nome : ''}</DialogTitle>
          <DialogDescription>
            {dados
              ? `Prazo ${dataBR(dados.projeto.prazo)}/${dados.projeto.prazo.slice(0, 4)}`
              : 'Carregando…'}
          </DialogDescription>
        </DialogHeader>
        {!dados ? (
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        ) : (
          <div className="space-y-5 text-sm">
            <ol className="relative border-l border-slate-200 ml-2 space-y-3">
              {dados.entregas.map((e) => (
                <li key={e.id} className="ml-4">
                  <span
                    className={`absolute -left-1.5 w-3 h-3 rounded-full ${e.entregue ? 'bg-emerald-600' : 'bg-slate-300'}`}
                  />
                  <div className="font-semibold text-slate-800">
                    {dataBR(e.data)}/{e.data.slice(0, 4)} — {rotuloEntrega(e)}
                    {e.descricao ? ' · ' + e.descricao : ''}
                  </div>
                  <div className="text-xs text-slate-500">
                    {e.disciplinas.map((d) => d.nome).join(', ') || 'sem disciplina'}
                    {e.alocacoes.length
                      ? ' · ' + e.alocacoes.map((a) => a.pessoa?.nome || a.pessoa_texto).join(', ')
                      : ''}
                    {e.horas_seg ? ' · ' + horasTxt(e.horas_seg) + ' apontadas' : ''}
                    {e.entregue ? ' · entregue ' + dataHoraBR(e.entregue_em) : ''}
                    {e.art_entregue ? ' · ART entregue' : ''}
                  </div>
                </li>
              ))}
            </ol>
            <div>
              <div className="font-semibold text-slate-800 mb-1">Histórico</div>
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-100">
                  {dados.historico.map((h) => (
                    <tr key={h.id}>
                      <td className="py-1 pr-2 text-slate-500 whitespace-nowrap">
                        {dataHoraBR(h.created)}
                      </td>
                      <td className="py-1 pr-2">{ACAO_LABEL[h.acao] || h.acao}</td>
                      <td className="py-1 pr-2 text-slate-600">{nomeEntrega(h.entrega)}</td>
                      <td className="py-1 pr-2 text-slate-600">
                        {h.antes || h.depois ? `${h.antes || '—'} → ${h.depois || '—'}` : ''}
                      </td>
                      <td className="py-1 text-slate-500">{h.autor?.nome || 'Central'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
