import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertOctagon,
  ArrowRight,
  CalendarClock,
  Download,
  ExternalLink,
  Link2,
  Loader2,
  Lock,
  Pencil,
  RefreshCw,
  Unlock,
  User,
} from 'lucide-react'
import { toast } from 'sonner'
import { ClientResponseError } from 'pocketbase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
import { extractFieldErrors, getErrorMessage } from '@/lib/pocketbase/errors'
import {
  NOME_PADRAO,
  ROTULO_CAMPO,
  classeDaTransicao,
  exigeJustificativa,
  podeBloquear,
  podeMover,
  type CampoEtapa,
  type Classe,
  type ContextoMovimento,
  type Etapa,
} from '@/lib/fluxo'
import {
  atualizarCard,
  bloquearCard,
  desbloquearCard,
  getCard,
  getQuadro,
  moverCard,
  revisarBloqueio,
  type CardDetalhe,
  type CardKanban,
  type Quadro,
} from '@/services/kanban'
import {
  PRIORIDADES,
  formatarData,
  hojeBR,
  listAtribuiveis,
  listMeusProjetos,
  type PessoaAtribuivel,
  type Projeto,
} from '@/services/projetos'

const TODOS = '__todos__'
const BLOQ = '__bloqueado__'

const COR_PRIORIDADE: Record<string, string> = {
  Urgente: 'bg-red-50 text-red-700 border-red-200',
  Alta: 'bg-amber-50 text-amber-700 border-amber-200',
  Normal: 'bg-slate-50 text-slate-600 border-slate-200',
  Baixa: 'bg-slate-50 text-slate-400 border-slate-200',
}

const quando = (s: string) => (s ? new Date(s.replace(' ', 'T')).toLocaleString('pt-BR') : '—')

const msg409 = (err: unknown) =>
  err instanceof ClientResponseError && err.status === 409
    ? (err.response as { message?: string }).message || 'Operação recusada.'
    : null

interface Movimento {
  card: { id: string; etapa: Etapa; versao: string }
  para: Etapa
  classe: Classe
  campos: CampoEtapa[]
  valores: Partial<Record<CampoEtapa, string>>
}

export default function Kanban() {
  const { user, role } = useAuth()
  const userId = user?.id ?? ''
  const [params, setParams] = useSearchParams()
  const projetoFiltro = params.get('projeto') || ''
  const [meus, setMeus] = useState(false)
  const [prioridade, setPrioridade] = useState('')
  const [quadro, setQuadro] = useState<Quadro | null>(null)
  const [erro, setErro] = useState('')
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [aberto, setAberto] = useState<string | null>(null)
  const [movimento, setMovimento] = useState<Movimento | null>(null)
  const [bloquear, setBloquear] = useState<CardDetalhe | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [alvo, setAlvo] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      setErro('')
      setQuadro(
        await getQuadro({
          projeto: projetoFiltro,
          responsavel: meus ? 'eu' : '',
          prioridade,
        }),
      )
    } catch (err) {
      setErro(getErrorMessage(err))
    }
  }, [projetoFiltro, meus, prioridade])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useEffect(() => {
    listMeusProjetos()
      .then(setProjetos)
      .catch(() => setProjetos([]))
  }, [])

  // /kanban?card=<id> (vindo da fila) abre o card direto
  useEffect(() => {
    const c = params.get('card')
    if (c && quadro) {
      setAberto(c)
      const p = new URLSearchParams(params)
      p.delete('card')
      setParams(p, { replace: true })
    }
  }, [params, quadro, setParams])

  const ativas = useMemo(() => new Set(quadro?.etapas.map((e) => e.chave) ?? []), [quadro])
  const nomeEtapa = useCallback(
    (k: string) => quadro?.etapas.find((e) => e.chave === k)?.nome ?? NOME_PADRAO[k as Etapa] ?? k,
    [quadro],
  )

  const ctx = (c: CardKanban): ContextoMovimento => ({
    userId,
    role,
    coordenadorId: c.projeto.coordenador,
    membros: c.projeto.membros,
    responsavelId: c.responsavel?.id ?? '',
  })

  const executarMovimento = async (
    c: { id: string; versao: string },
    para: Etapa,
    justificativa?: string,
    campos?: Partial<Record<CampoEtapa, string>>,
  ): Promise<Record<string, string> | null> => {
    try {
      await moverCard(c.id, para, c.versao, justificativa, campos)
      toast.success(`Card movido para "${nomeEtapa(para)}".`)
      await carregar()
      return null
    } catch (err) {
      const m = msg409(err)
      if (m) {
        toast.error(m)
        await carregar()
        return null
      }
      const f = extractFieldErrors(err)
      toast.error(
        f.para ||
          (Object.keys(f).length ? 'Faltam informações para mover o card.' : getErrorMessage(err)),
      )
      return f
    }
  }

  // Tenta mover; se a transição pede justificativa ou campos, abre o diálogo
  const iniciarMovimento = async (c: { id: string; etapa: Etapa; versao: string }, para: Etapa) => {
    const classe = classeDaTransicao(c.etapa, para, ativas)
    if (!classe) {
      toast.error(`Não é possível ir de "${nomeEtapa(c.etapa)}" para "${nomeEtapa(para)}".`)
      return
    }
    const campos = (quadro?.requisitos[`${c.etapa}>${para}`] ?? []) as CampoEtapa[]
    if (exigeJustificativa(classe) || campos.length > 0 || classe === 'rev') {
      let valores: Partial<Record<CampoEtapa, string>> = {}
      if (campos.length > 0) {
        try {
          const d = await getCard(c.id)
          valores = { observacao: d.observacao, link_entrega: d.link_entrega }
        } catch {
          /* segue sem valores atuais */
        }
      }
      setMovimento({ card: c, para, classe, campos, valores })
      return
    }
    await executarMovimento(c, para)
  }

  const soltar = async (coluna: string) => {
    const id = arrastando
    setArrastando(null)
    setAlvo(null)
    const c = quadro?.cards.find((x) => x.id === id)
    if (!c) return
    if (coluna === BLOQ) {
      if (c.bloqueado) return
      if (!podeBloquear(ctx(c))) {
        toast.error('Você não pode bloquear este card.')
        return
      }
      try {
        setBloquear(await getCard(c.id))
      } catch (err) {
        toast.error(getErrorMessage(err))
      }
      return
    }
    if (c.bloqueado) {
      toast.error('Card bloqueado: resolva o bloqueio antes de mover.')
      return
    }
    if (coluna === c.etapa) return
    await iniciarMovimento(c, coluna as Etapa)
  }

  const bloqueados = quadro?.cards.filter((c) => c.bloqueado) ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">Kanban da produção</h1>
          <p className="text-sm text-slate-500">
            Cada card é uma disciplina de um projeto. Arraste para mudar de etapa ou clique para ver
            detalhes.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => void carregar()}>
          <RefreshCw className="w-4 h-4" /> Atualizar
        </Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-64">
          <Select
            value={projetoFiltro || TODOS}
            onValueChange={(v) => {
              const p = new URLSearchParams(params)
              if (v === TODOS) p.delete('projeto')
              else p.set('projeto', v)
              setParams(p, { replace: true })
            }}
          >
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
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <Switch checked={meus} onCheckedChange={setMeus} /> Só os meus cards
        </label>
        {quadro && (
          <span className="text-xs text-slate-400 sm:ml-auto">
            {quadro.cards.length} card(s) · fluxo v{quadro.configuracao}
          </span>
        )}
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {!quadro ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-3 min-w-max">
            {quadro.etapas.map((et) => {
              const cards = quadro.cards.filter((c) => c.etapa === et.chave && !c.bloqueado)
              return (
                <Coluna
                  key={et.chave}
                  titulo={et.nome}
                  quantidade={cards.length}
                  destaque={alvo === et.chave}
                  onDragOver={() => setAlvo(et.chave)}
                  onDrop={() => void soltar(et.chave)}
                >
                  {cards.map((c) => (
                    <CartaoCard
                      key={c.id}
                      card={c}
                      arrastavel
                      onDragStart={() => setArrastando(c.id)}
                      onClick={() => setAberto(c.id)}
                    />
                  ))}
                </Coluna>
              )
            })}
            <Coluna
              titulo="Bloqueado"
              quantidade={bloqueados.length}
              bloqueio
              destaque={alvo === BLOQ}
              onDragOver={() => setAlvo(BLOQ)}
              onDrop={() => void soltar(BLOQ)}
            >
              {bloqueados.map((c) => (
                <CartaoCard
                  key={c.id}
                  card={c}
                  etapaNome={nomeEtapa(c.etapa)}
                  arrastavel={false}
                  onClick={() => setAberto(c.id)}
                />
              ))}
            </Coluna>
          </div>
        </div>
      )}

      {aberto && quadro && (
        <CardDialog
          id={aberto}
          quadro={quadro}
          userId={userId}
          ctxDe={ctx}
          nomeEtapa={nomeEtapa}
          onClose={() => setAberto(null)}
          onMover={(c, para) => {
            setAberto(null)
            void iniciarMovimento(c, para)
          }}
          onBloquear={(d) => {
            setAberto(null)
            setBloquear(d)
          }}
          onAlterado={carregar}
        />
      )}

      {movimento && (
        <MoverDialog
          mov={movimento}
          nomeEtapa={nomeEtapa}
          onClose={() => setMovimento(null)}
          onConfirm={async (just, campos) => {
            const r = await executarMovimento(movimento.card, movimento.para, just, campos)
            if (!r) setMovimento(null)
            return r
          }}
        />
      )}

      {bloquear && (
        <BloquearDialog
          card={bloquear}
          onClose={() => setBloquear(null)}
          onDone={async () => {
            setBloquear(null)
            await carregar()
          }}
        />
      )}
    </div>
  )
}

function Coluna({
  titulo,
  quantidade,
  bloqueio,
  destaque,
  onDragOver,
  onDrop,
  children,
}: {
  titulo: string
  quantidade: number
  bloqueio?: boolean
  destaque: boolean
  onDragOver: () => void
  onDrop: () => void
  children: ReactNode
}) {
  return (
    <section
      onDragOver={(e) => {
        e.preventDefault()
        onDragOver()
      }}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
      className={`w-72 shrink-0 rounded-xl border p-2 flex flex-col max-h-[calc(100vh-260px)] min-h-[200px] transition-colors ${
        bloqueio ? 'bg-red-50/60 border-red-200' : 'bg-slate-100/70 border-slate-200'
      } ${destaque ? 'ring-2 ring-[#1E3A8A]/40' : ''}`}
    >
      <header className="flex items-center justify-between px-2 py-1.5">
        <h2
          className={`text-sm font-bold ${bloqueio ? 'text-red-700' : 'text-slate-700'} flex items-center gap-1.5`}
        >
          {bloqueio && <Lock className="w-3.5 h-3.5" />}
          {titulo}
        </h2>
        <span className="text-xs font-semibold text-slate-500 bg-white rounded-full px-2 py-0.5 border border-slate-200">
          {quantidade}
        </span>
      </header>
      <div className="flex-1 overflow-y-auto space-y-2 p-1">
        {quantidade === 0 && <p className="text-xs text-slate-400 text-center py-6">Nenhum card</p>}
        {children}
      </div>
    </section>
  )
}

function CartaoCard({
  card,
  etapaNome,
  arrastavel,
  onDragStart,
  onClick,
}: {
  card: CardKanban
  etapaNome?: string
  arrastavel: boolean
  onDragStart?: () => void
  onClick: () => void
}) {
  return (
    <button
      type="button"
      draggable={arrastavel}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', card.id)
        onDragStart?.()
      }}
      onClick={onClick}
      className={`w-full text-left bg-white rounded-lg border p-3 shadow-sm hover:shadow transition-shadow ${
        card.bloqueado ? 'border-red-200' : 'border-slate-200'
      } ${arrastavel ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-slate-900 text-sm leading-snug">
          {card.disciplina.nome}
        </span>
        <span
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap ${
            COR_PRIORIDADE[card.prioridade] ?? COR_PRIORIDADE.Normal
          }`}
        >
          {card.prioridade}
        </span>
      </div>
      <p className="text-xs text-slate-500 mt-0.5 truncate">{card.projeto.nome}</p>
      <div className="flex items-center justify-between gap-2 mt-2 text-xs text-slate-500">
        <span className="flex items-center gap-1 truncate">
          <User className="w-3 h-3 shrink-0" /> {card.responsavel?.nome ?? '—'}
        </span>
        <span
          className={`flex items-center gap-1 whitespace-nowrap ${card.atrasado ? 'text-red-600 font-semibold' : ''}`}
          title={card.atrasado ? 'Prazo vencido' : 'Prazo'}
        >
          {card.tem_link && <Link2 className="w-3 h-3 text-[#1E3A8A]" />}
          <CalendarClock className="w-3 h-3" /> {formatarData(card.prazo)}
        </span>
      </div>
      {card.bloqueado && card.bloqueio && (
        <div className="mt-2 rounded-md bg-red-50 border border-red-100 p-2 text-xs text-red-800 space-y-0.5">
          {etapaNome && <p className="font-semibold">Etapa: {etapaNome}</p>}
          <p className="line-clamp-2">{card.bloqueio.motivo}</p>
          <p className="text-red-600">
            Dono: {card.bloqueio.dono?.nome ?? '—'} · revisar em{' '}
            {formatarData(card.bloqueio.revisao)}
          </p>
          {card.bloqueio.vencido && (
            <p className="inline-block mt-1 px-1.5 py-0.5 rounded bg-red-600 text-white font-semibold">
              Revisão do bloqueio vencida
            </p>
          )}
        </div>
      )}
    </button>
  )
}

const TIPO: Record<string, string> = {
  criacao: 'Card criado',
  transicao: 'Mudança de etapa',
  bloqueio: 'Bloqueado',
  desbloqueio: 'Desbloqueado',
  remapeamento: 'Remapeado pelo fluxo',
  alteracao: 'Alteração',
  bloqueio_revisado: 'Bloqueio revisado',
}

const ROTULO_ALTERACAO: Record<string, string> = {
  responsavel: 'Responsável',
  prioridade: 'Prioridade',
  prazo: 'Prazo',
}
const fmtValor = (campo: string, v: string) =>
  campo === 'prazo' && /^\d{4}-\d{2}-\d{2}/.test(v) ? formatarData(v) + v.slice(10) : v

function DetalheEvento({ h }: { h: CardDetalhe['historico'][number] }) {
  const det = (h.detalhes || {}) as Record<string, unknown>
  if (h.tipo === 'alteracao' && Array.isArray(det.mudancas)) {
    return (
      <ul className="text-xs text-slate-600 mt-0.5">
        {(det.mudancas as { campo: string; antes: string; depois: string }[]).map((m, i) => (
          <li key={i}>
            {ROTULO_ALTERACAO[m.campo] ?? m.campo}: {fmtValor(m.campo, m.antes)} →{' '}
            <strong>{fmtValor(m.campo, m.depois)}</strong>
          </li>
        ))}
      </ul>
    )
  }
  if (h.tipo === 'bloqueio_revisado') {
    return (
      <p className="text-xs text-slate-600 mt-0.5">
        Revisão: {formatarData(String(det.revisao_antes ?? ''))} →{' '}
        <strong>{formatarData(String(det.revisao_depois ?? ''))}</strong>
        {det.dono_antes !== det.dono_depois && (
          <>
            {' '}
            · dono: {String(det.dono_antes)} → <strong>{String(det.dono_depois)}</strong>
          </>
        )}
      </p>
    )
  }
  return null
}

function CardDialog({
  id,
  quadro,
  userId,
  ctxDe,
  nomeEtapa,
  onClose,
  onMover,
  onBloquear,
  onAlterado,
}: {
  id: string
  quadro: Quadro
  userId: string
  ctxDe: (c: CardKanban) => ContextoMovimento
  nomeEtapa: (k: string) => string
  onClose: () => void
  onMover: (c: { id: string; etapa: Etapa; versao: string }, para: Etapa) => void
  onBloquear: (d: CardDetalhe) => void
  onAlterado: () => Promise<void>
}) {
  const [d, setD] = useState<CardDetalhe | null>(null)
  const [falha, setFalha] = useState('')
  const [resolucao, setResolucao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [editar, setEditar] = useState(false)
  const [revData, setRevData] = useState('')
  const [revNota, setRevNota] = useState('')

  const carregar = useCallback(async () => {
    try {
      setD(await getCard(id))
    } catch (err) {
      setFalha(getErrorMessage(err))
    }
  }, [id])
  useEffect(() => {
    void carregar()
  }, [carregar])

  const resumo = quadro.cards.find((c) => c.id === id)
  const ctx = resumo ? ctxDe(resumo) : null
  const ativas = new Set<string>(quadro.etapas.map((e) => e.chave))
  const destinos =
    d && ctx && !d.projeto.arquivado
      ? quadro.etapas
          .map((e) => ({ para: e.chave, classe: classeDaTransicao(d.etapa, e.chave, ativas) }))
          .filter(
            (x): x is { para: Etapa; classe: Classe } => !!x.classe && podeMover(x.classe, ctx),
          )
      : []
  const podeDesbloquear =
    !!d &&
    !!ctx &&
    (ctx.role === 'admin' ||
      (ctx.role === 'coordenador' && ctx.coordenadorId === userId) ||
      (d.bloqueio?.dono?.id === userId && ctx.role !== 'executivo'))

  const desbloquear = async () => {
    if (!d) return
    setEnviando(true)
    try {
      await desbloquearCard(d.id, d.versao, resolucao.trim())
      toast.success('Card desbloqueado.')
      setResolucao('')
      await carregar()
      await onAlterado()
    } catch (err) {
      const m = msg409(err)
      if (m) {
        toast.error(m)
        await carregar()
      } else {
        const f = extractFieldErrors(err)
        toast.error(f.resolucao || getErrorMessage(err))
      }
    } finally {
      setEnviando(false)
    }
  }

  const revisar = async () => {
    if (!d) return
    setEnviando(true)
    try {
      await revisarBloqueio(d.id, d.versao, { revisao: revData, nota: revNota.trim() })
      toast.success('Revisão do bloqueio registrada.')
      setRevData('')
      setRevNota('')
      await carregar()
      await onAlterado()
    } catch (err) {
      const m = msg409(err)
      if (m) {
        toast.error(m)
        await carregar()
      } else toast.error(getErrorMessage(err))
    } finally {
      setEnviando(false)
    }
  }

  const exportar = () => {
    if (!d) return
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const linhas = [['data_hora', 'autor', 'evento', 'de', 'para', 'justificativa']]
    for (const h of [...d.historico].reverse()) {
      linhas.push([
        quando(h.created),
        h.autor?.nome ?? 'Sistema',
        TIPO[h.tipo] ?? h.tipo,
        h.de ? nomeEtapa(h.de) : '',
        h.para ? nomeEtapa(h.para) : '',
        h.justificativa,
      ])
    }
    const csv = '﻿' + linhas.map((l) => l.map(esc).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `card-${d.disciplina.sigla || 'disciplina'}-${d.projeto.nome.replace(/[^\w-]+/g, '_').slice(0, 50)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {falha ? (
          <>
            <DialogHeader>
              <DialogTitle>Card</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-red-600 py-6 text-center">{falha}</p>
          </>
        ) : !d ? (
          <>
            <DialogHeader>
              <DialogTitle>Card</DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{d.disciplina.nome}</DialogTitle>
              <DialogDescription>
                <Link to={`/projetos/${d.projeto.id}`} className="text-[#1E3A8A] hover:underline">
                  {d.projeto.nome}
                </Link>{' '}
                · Responsável: {d.responsavel?.nome ?? '—'}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="px-2.5 py-1 rounded-full bg-blue-50 text-[#1E3A8A] font-semibold border border-blue-100">
                {nomeEtapa(d.etapa)}
              </span>
              {d.bloqueado && (
                <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 font-semibold border border-red-200 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" /> Bloqueado
                </span>
              )}
              {d.projeto.arquivado && (
                <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                  Projeto arquivado
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700">
              <span>
                Prioridade: <strong>{d.prioridade}</strong>
                {!d.prioridade_propria && <span className="text-slate-400"> (do projeto)</span>}
              </span>
              <span className={d.atrasado ? 'text-red-600 font-semibold' : ''}>
                Prazo: <strong>{formatarData(d.prazo)}</strong>
                {!d.prazo_proprio && (
                  <span className="text-slate-400 font-normal"> (do projeto)</span>
                )}
                {d.atrasado && ' · atrasado'}
              </span>
              {d.pode_editar && !d.projeto.arquivado && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1 h-7 text-[#1E3A8A]"
                  onClick={() => setEditar(true)}
                >
                  <Pencil className="w-3.5 h-3.5" /> Reatribuir / prioridade / prazo
                </Button>
              )}
            </div>

            {(d.observacao || d.link_entrega) && (
              <div className="rounded-lg border border-slate-200 p-3 text-sm space-y-1">
                {d.observacao && (
                  <p>
                    <span className="font-semibold text-slate-600">Observação:</span> {d.observacao}
                  </p>
                )}
                {d.link_entrega && (
                  <a
                    href={d.link_entrega}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 text-[#1E3A8A] hover:underline"
                  >
                    Abrir entrega <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            )}

            {d.bloqueado && d.bloqueio && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm space-y-2">
                <p className="flex items-start gap-1.5 text-red-800">
                  <AlertOctagon className="w-4 h-4 mt-0.5 shrink-0" /> {d.bloqueio.motivo}
                </p>
                <p className="text-xs text-red-700">
                  Dono: {d.bloqueio.dono?.nome ?? '—'} · revisar em{' '}
                  {formatarData(d.bloqueio.revisao)} · desde {quando(d.bloqueio.desde)}
                </p>
                {d.bloqueio.vencido && (
                  <p className="text-xs font-semibold text-white bg-red-600 rounded px-2 py-1 inline-block">
                    A data de revisão deste bloqueio já passou. Revise ou resolva.
                  </p>
                )}
                {podeDesbloquear && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      type="date"
                      min={hojeBR()}
                      value={revData}
                      onChange={(e) => setRevData(e.target.value)}
                      className="bg-white sm:w-44"
                      aria-label="Nova data de revisão"
                    />
                    <Input
                      value={revNota}
                      onChange={(e) => setRevNota(e.target.value)}
                      placeholder="O que foi verificado? (nova revisão)"
                      maxLength={1000}
                      className="bg-white"
                    />
                    <Button
                      variant="outline"
                      onClick={revisar}
                      disabled={enviando || !revData || revNota.trim().length < 3}
                      className="bg-white"
                    >
                      Revisar
                    </Button>
                  </div>
                )}
                {podeDesbloquear && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      value={resolucao}
                      onChange={(e) => setResolucao(e.target.value)}
                      placeholder="Como foi resolvido?"
                      maxLength={1000}
                      className="bg-white"
                    />
                    <Button
                      onClick={desbloquear}
                      disabled={enviando || resolucao.trim().length < 3}
                      className="gap-1 bg-[#1E3A8A] hover:bg-[#1E2A6B]"
                    >
                      <Unlock className="w-4 h-4" /> Desbloquear
                    </Button>
                  </div>
                )}
              </div>
            )}

            {!d.bloqueado &&
              !d.projeto.arquivado &&
              (destinos.length > 0 || (ctx && podeBloquear(ctx))) && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-slate-500">Ações</p>
                  <div className="flex flex-wrap gap-2">
                    {destinos.map((x) => (
                      <Button
                        key={x.para}
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() =>
                          onMover({ id: d.id, etapa: d.etapa, versao: d.versao }, x.para)
                        }
                      >
                        <ArrowRight className="w-3.5 h-3.5" /> {nomeEtapa(x.para)}
                        {exigeJustificativa(x.classe) && (
                          <span className="text-xs text-slate-400">(justificar)</span>
                        )}
                      </Button>
                    ))}
                    {ctx && podeBloquear(ctx) && d.etapa !== 'aprovado' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-red-700 border-red-200 hover:bg-red-50"
                        onClick={() => onBloquear(d)}
                      >
                        <Lock className="w-3.5 h-3.5" /> Bloquear
                      </Button>
                    )}
                  </div>
                </div>
              )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase text-slate-500">Histórico</p>
                <Button size="sm" variant="ghost" className="gap-1 h-7" onClick={exportar}>
                  <Download className="w-3.5 h-3.5" /> CSV
                </Button>
              </div>
              <ul className="divide-y divide-slate-100 text-sm border border-slate-100 rounded-lg">
                {d.historico.map((h) => (
                  <li key={h.id} className="px-3 py-2">
                    <div className="flex flex-wrap gap-x-2 text-slate-800">
                      <span className="text-slate-500 whitespace-nowrap">{quando(h.created)}</span>
                      <strong>{h.autor?.nome ?? 'Sistema'}</strong>
                      <span>· {TIPO[h.tipo] ?? h.tipo}</span>
                      {h.tipo === 'transicao' || h.tipo === 'remapeamento' ? (
                        <span>
                          : {nomeEtapa(h.de)} → {nomeEtapa(h.para)}
                        </span>
                      ) : h.tipo === 'criacao' ? (
                        <span>em {nomeEtapa(h.para)}</span>
                      ) : null}
                    </div>
                    <DetalheEvento h={h} />
                    {h.justificativa && (
                      <p className="text-xs text-slate-500 mt-0.5">“{h.justificativa}”</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </DialogContent>
      {editar && d && (
        <AtribuicaoDialog
          card={d}
          onClose={() => setEditar(false)}
          onDone={async () => {
            setEditar(false)
            await carregar()
            await onAlterado()
          }}
        />
      )}
    </Dialog>
  )
}

const HERDAR = '__herdar__'

function AtribuicaoDialog({
  card,
  onClose,
  onDone,
}: {
  card: CardDetalhe
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [pessoas, setPessoas] = useState<PessoaAtribuivel[]>([])
  const [resp, setResp] = useState(card.responsavel?.id ?? HERDAR)
  const [prio, setPrio] = useState(card.prioridade_propria ? card.prioridade : HERDAR)
  const [prazo, setPrazo] = useState(card.prazo_proprio ? card.prazo : '')
  const [just, setJust] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    listAtribuiveis()
      .then((l) => setPessoas(l.filter((p) => p.papel !== 'executivo')))
      .catch(() => setPessoas([]))
  }, [])

  const salvar = async () => {
    const campos: { responsavel?: string; prioridade?: string; prazo?: string } = {}
    if (resp !== (card.responsavel?.id ?? HERDAR)) campos.responsavel = resp === HERDAR ? '' : resp
    const prioAtual = card.prioridade_propria ? card.prioridade : HERDAR
    if (prio !== prioAtual) campos.prioridade = prio === HERDAR ? '' : prio
    const prazoAtual = card.prazo_proprio ? card.prazo : ''
    if (prazo !== prazoAtual) campos.prazo = prazo
    if (Object.keys(campos).length === 0) {
      onClose()
      return
    }
    setEnviando(true)
    setErros({})
    try {
      await atualizarCard(card.id, card.versao, campos, just.trim())
      toast.success('Alteração registrada no histórico do card.')
      await onDone()
    } catch (err) {
      const m = msg409(err)
      if (m) {
        toast.error(m)
        await onDone()
      } else {
        const f = extractFieldErrors(err)
        setErros(f)
        toast.error(Object.keys(f).length ? 'Revise os campos destacados.' : getErrorMessage(err))
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reatribuir, prioridade e prazo</DialogTitle>
          <DialogDescription>
            {card.disciplina.nome} · {card.projeto.nome}. A alteração fica no histórico com antes,
            depois, autor e justificativa.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Responsável</Label>
            <Select value={resp} onValueChange={setResp}>
              <SelectTrigger className={erros.responsavel ? 'border-red-500' : ''}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={HERDAR}>
                  Herdar do coordenador ({card.projeto.coordenador?.nome ?? '—'})
                </SelectItem>
                {card.responsavel && !pessoas.some((p) => p.id === card.responsavel?.id) && (
                  <SelectItem value={card.responsavel.id}>{card.responsavel.nome}</SelectItem>
                )}
                {pessoas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {erros.responsavel && <p className="text-xs text-red-600 mt-1">{erros.responsavel}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Prioridade</Label>
              <Select value={prio} onValueChange={setPrio}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={HERDAR}>Do projeto ({card.projeto.prioridade})</SelectItem>
                  {[...PRIORIDADES].reverse().map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prazo da disciplina</Label>
              <Input
                type="date"
                min={hojeBR()}
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
                className={erros.prazo ? 'border-red-500' : ''}
              />
              <p className="text-xs text-slate-500 mt-1">
                Vazio = prazo do projeto ({formatarData(card.projeto.prazo)})
              </p>
              {erros.prazo && <p className="text-xs text-red-600 mt-1">{erros.prazo}</p>}
            </div>
          </div>
          <div>
            <Label>Justificativa *</Label>
            <Textarea
              rows={2}
              maxLength={1000}
              value={just}
              onChange={(e) => setJust(e.target.value)}
              className={erros.justificativa ? 'border-red-500' : ''}
            />
            {erros.justificativa && (
              <p className="text-xs text-red-600 mt-1">{erros.justificativa}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={salvar}
            disabled={enviando || just.trim().length < 3}
            className="bg-[#1E3A8A] hover:bg-[#1E2A6B]"
          >
            {enviando ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MoverDialog({
  mov,
  nomeEtapa,
  onClose,
  onConfirm,
}: {
  mov: Movimento
  nomeEtapa: (k: string) => string
  onClose: () => void
  onConfirm: (
    justificativa: string,
    campos: Partial<Record<CampoEtapa, string>>,
  ) => Promise<Record<string, string> | null>
}) {
  const [just, setJust] = useState('')
  const [valores, setValores] = useState<Partial<Record<CampoEtapa, string>>>(mov.valores)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const pedeJust = exigeJustificativa(mov.classe)
  const opcional = mov.classe === 'rev' && !pedeJust

  const confirmar = async () => {
    setEnviando(true)
    const campos: Partial<Record<CampoEtapa, string>> = {}
    for (const f of mov.campos) campos[f] = (valores[f] ?? '').trim()
    const r = await onConfirm(just.trim(), campos)
    if (r) setErros(r)
    setEnviando(false)
  }

  const prontos =
    (!pedeJust || just.trim().length >= 3) &&
    mov.campos.every((f) => (valores[f] ?? '').trim().length > 0)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {nomeEtapa(mov.card.etapa)} → {nomeEtapa(mov.para)}
          </DialogTitle>
          <DialogDescription>
            {pedeJust
              ? 'Reabrir ou voltar etapa exige justificativa; ela fica no histórico do card.'
              : 'Confirme a mudança de etapa. Tudo fica registrado no histórico do card.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {mov.campos.map((f) => (
            <div key={f}>
              <Label>{ROTULO_CAMPO[f]} *</Label>
              {f === 'observacao' ? (
                <Textarea
                  rows={3}
                  maxLength={2000}
                  value={valores[f] ?? ''}
                  onChange={(e) => setValores({ ...valores, [f]: e.target.value })}
                  className={erros[f] ? 'border-red-500' : ''}
                />
              ) : (
                <Input
                  placeholder="https://…"
                  value={valores[f] ?? ''}
                  onChange={(e) => setValores({ ...valores, [f]: e.target.value })}
                  className={erros[f] ? 'border-red-500' : ''}
                />
              )}
              {erros[f] && <p className="text-xs text-red-600 mt-1">{erros[f]}</p>}
            </div>
          ))}
          {(pedeJust || opcional) && (
            <div>
              <Label>{pedeJust ? 'Justificativa *' : 'Comentário (opcional)'}</Label>
              <Textarea
                rows={3}
                maxLength={1000}
                value={just}
                onChange={(e) => setJust(e.target.value)}
                className={erros.justificativa ? 'border-red-500' : ''}
              />
              {erros.justificativa && (
                <p className="text-xs text-red-600 mt-1">{erros.justificativa}</p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={confirmar}
            disabled={enviando || !prontos}
            className="bg-[#1E3A8A] hover:bg-[#1E2A6B]"
          >
            {enviando ? 'Movendo…' : 'Mover'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BloquearDialog({
  card,
  onClose,
  onDone,
}: {
  card: CardDetalhe
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [motivo, setMotivo] = useState('')
  const [dono, setDono] = useState(card.projeto.coordenador?.id ?? '')
  const [revisao, setRevisao] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)

  const enviar = async () => {
    setEnviando(true)
    setErros({})
    try {
      await bloquearCard(card.id, card.versao, { motivo: motivo.trim(), dono, revisao })
      toast.success('Card bloqueado.')
      await onDone()
    } catch (err) {
      const m = msg409(err)
      if (m) {
        toast.error(m)
        await onDone()
      } else {
        const f = extractFieldErrors(err)
        setErros(f)
        toast.error(Object.keys(f).length ? 'Revise os campos destacados.' : getErrorMessage(err))
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bloquear card</DialogTitle>
          <DialogDescription>
            {card.disciplina.nome} · {card.projeto.nome}. O card mantém a etapa atual e fica
            impedido de mudar até ser desbloqueado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Motivo *</Label>
            <Textarea
              rows={3}
              maxLength={500}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: aguardando planta do cliente"
              className={erros.motivo ? 'border-red-500' : ''}
            />
            {erros.motivo && <p className="text-xs text-red-600 mt-1">{erros.motivo}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Dono do desbloqueio *</Label>
              <Select value={dono || undefined} onValueChange={setDono}>
                <SelectTrigger className={erros.dono ? 'border-red-500' : ''}>
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {card.equipe.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {erros.dono && <p className="text-xs text-red-600 mt-1">{erros.dono}</p>}
            </div>
            <div>
              <Label>Revisar em *</Label>
              <Input
                type="date"
                min={hojeBR()}
                value={revisao}
                onChange={(e) => setRevisao(e.target.value)}
                className={erros.revisao ? 'border-red-500' : ''}
              />
              {erros.revisao && <p className="text-xs text-red-600 mt-1">{erros.revisao}</p>}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={enviar}
            disabled={enviando || motivo.trim().length < 3 || !dono || !revisao}
            className="bg-red-700 hover:bg-red-800"
          >
            {enviando ? 'Bloqueando…' : 'Bloquear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
