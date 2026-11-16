// SPEC-2-002 — checklist aplicado no card: marcação do checklist de entrada, pendência de
// entrada (motivo, dono, prazo), aviso de trava antes de "Pronto" e troca de versão.
import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, ClipboardCheck, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { ClientResponseError } from 'pocketbase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { extractFieldErrors, getErrorMessage } from '@/lib/pocketbase/errors'
import {
  aplicarVersaoNoCard,
  getChecklistsDoCard,
  marcarItemEntrada,
  type ChecklistAplicado,
  type ChecklistsDoCard,
  type ItemAplicado,
  type ResultadoItem,
  type TipoChecklist,
} from '@/services/checklists'
import { formatarData, hojeBR, type Pessoa } from '@/services/projetos'

const quando = (s: string) => (s ? new Date(s.replace(' ', 'T')).toLocaleString('pt-BR') : '—')

const mensagemErro = (err: unknown) => {
  if (err instanceof ClientResponseError && err.status === 409)
    return (err.response as { message?: string }).message || 'Operação recusada.'
  const f = extractFieldErrors(err)
  return Object.values(f)[0] || getErrorMessage(err)
}

const ACAO: Record<string, string> = {
  aplicado: 'Checklist aplicado',
  aplicado_manual: 'Checklist aplicado pelo coordenador',
  versao_trocada: 'Versão trocada',
  marcado: 'Item marcado',
  desmarcado: 'Marcação retirada',
  pendencia_aberta: 'Pendência de entrada aberta',
  pendencia_alterada: 'Pendência de entrada alterada',
  pendencia_resolvida: 'Pendência de entrada resolvida',
}
const RES: Record<string, string> = {
  conforme: 'conforme',
  nao_conforme: 'não conforme',
  nao_se_aplica: 'não se aplica',
}

const emDias = (n: number) => {
  const d = new Date(Date.now() - 3 * 3600000 + n * 86400000)
  return d.toISOString().slice(0, 10)
}

export function ChecklistDoCard({
  cardId,
  equipe,
  coordenadorId,
  onAlterado,
}: {
  cardId: string
  equipe: Pessoa[]
  coordenadorId: string
  onAlterado: () => Promise<void>
}) {
  const [d, setD] = useState<ChecklistsDoCard | null>(null)
  const [erro, setErro] = useState('')
  const [historico, setHistorico] = useState(false)
  const [trocar, setTrocar] = useState<null | {
    tipo: TipoChecklist
    numero: number
    atual: ChecklistAplicado | null
  }>(null)

  const carregar = useCallback(async () => {
    try {
      setD(await getChecklistsDoCard(cardId))
      setErro('')
    } catch (err) {
      setErro(getErrorMessage(err))
    }
  }, [cardId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  if (erro) return <p className="text-xs text-red-600">{erro}</p>
  if (!d)
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando checklist…
      </div>
    )

  const recarregar = async () => {
    await carregar()
    await onAlterado()
  }
  const abertas = d.pendencias.filter((p) => p.status === 'aberta')

  const cabecalho = (tipo: TipoChecklist, c: ChecklistAplicado | null) => {
    const vig = d.vigente[tipo]
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase text-slate-500 flex items-center gap-1.5">
          <ClipboardCheck className="w-3.5 h-3.5" /> Checklist de{' '}
          {tipo === 'entrada' ? 'entrada' : 'revisão'}
          {c && <span className="normal-case font-normal text-slate-400">· v{c.numero}</span>}
        </p>
        {d.pode_trocar && vig && (!c || vig.numero !== c.numero || vig.modelo !== c.modelo) && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1"
            onClick={() => setTrocar({ tipo, numero: vig.numero, atual: c })}
          >
            <RefreshCw className="w-3.5 h-3.5" />{' '}
            {c ? `Trocar para v${vig.numero}` : `Aplicar v${vig.numero}`}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 p-3 space-y-2">
        {cabecalho('entrada', d.entrada)}
        {!d.entrada ? (
          <p className="text-sm text-slate-500">
            Sem checklist de entrada
            {d.vigente.entrada ? '' : ' (nenhum checklist real publicado para esta disciplina)'}.
            Nada trava o andamento.
          </p>
        ) : (
          <>
            {d.entrada.criticos_pendentes.length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                <strong>Não pode ir para “Pronto”.</strong>{' '}
                {d.entrada.criticos_pendentes.length === 1
                  ? 'Falta 1 item crítico: '
                  : `Faltam ${d.entrada.criticos_pendentes.length} itens críticos: `}
                {d.entrada.criticos_pendentes.join('; ')}.
              </div>
            )}
            {d.vigente.entrada && d.vigente.entrada.numero !== d.entrada.numero && (
              <p className="text-xs text-slate-500">
                Este card ficou na v{d.entrada.numero}; o modelo já tem a v
                {d.vigente.entrada.numero}. Só o coordenador troca, e a troca fica registrada.
              </p>
            )}
            <ul className="divide-y divide-slate-100">
              {d.entrada.itens.map((it) => (
                <LinhaEntrada
                  key={it.id}
                  item={it}
                  cardId={cardId}
                  versao={d.entrada!.versao}
                  podeMarcar={d.pode_marcar}
                  equipe={equipe}
                  donoPadrao={coordenadorId}
                  pendencia={abertas.find((p) => p.item_id === it.id) ?? null}
                  onFeito={recarregar}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 p-3 space-y-1">
        {cabecalho('revisao', d.revisao)}
        {d.revisao ? (
          <p className="text-sm text-slate-600">
            {d.revisao.itens.length} itens (
            {d.revisao.itens.filter((i) => i.severidade === 'critico').length} críticos), aplicado
            em {quando(d.revisao.aplicado_em)}. O coordenador usa este checklist na revisão.
          </p>
        ) : (
          <p className="text-sm text-slate-500">
            {d.vigente.revisao
              ? `Será aplicado quando o card entrar na etapa de revisão (v${d.vigente.revisao.numero}).`
              : 'Sem checklist de revisão (nenhum checklist real publicado para esta disciplina).'}
          </p>
        )}
      </div>

      {d.eventos.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setHistorico(!historico)}
            className="text-xs font-semibold uppercase text-slate-500 flex items-center gap-1"
          >
            {historico ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            Histórico do checklist ({d.eventos.length})
          </button>
          {historico && (
            <ul className="mt-1 divide-y divide-slate-100 text-xs border border-slate-100 rounded-lg">
              {d.eventos.map((ev) => (
                <li key={ev.id} className="px-3 py-1.5">
                  <span className="text-slate-500">{quando(ev.created)}</span> ·{' '}
                  <strong>{ev.autor?.nome ?? 'Sistema'}</strong> · {ACAO[ev.acao] ?? ev.acao}
                  {ev.item_texto && <> · {ev.item_texto}</>}
                  {(ev.antes || ev.depois) && (
                    <>
                      {' '}
                      ({RES[ev.antes] ?? (ev.antes || '—')} → {RES[ev.depois] ?? (ev.depois || '—')}
                      )
                    </>
                  )}
                  {ev.justificativa && (
                    <span className="text-slate-500"> · “{ev.justificativa}”</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {trocar && (
        <TrocarVersaoDialog
          cardId={cardId}
          tipo={trocar.tipo}
          numero={trocar.numero}
          atual={trocar.atual}
          onClose={() => setTrocar(null)}
          onDone={async () => {
            setTrocar(null)
            await recarregar()
          }}
        />
      )}
    </div>
  )
}

function LinhaEntrada({
  item,
  cardId,
  versao,
  podeMarcar,
  equipe,
  donoPadrao,
  pendencia,
  onFeito,
}: {
  item: ItemAplicado
  cardId: string
  versao: string
  podeMarcar: boolean
  equipe: Pessoa[]
  donoPadrao: string
  pendencia: ChecklistsDoCard['pendencias'][number] | null
  onFeito: () => Promise<void>
}) {
  const [abrir, setAbrir] = useState<'' | 'nao_conforme' | 'nao_se_aplica'>('')
  const [just, setJust] = useState(item.justificativa)
  const [motivo, setMotivo] = useState(pendencia?.motivo ?? '')
  const [dono, setDono] = useState(pendencia?.dono?.id ?? donoPadrao)
  const [prazo, setPrazo] = useState(pendencia?.prazo || emDias(3))
  const [enviando, setEnviando] = useState(false)

  const enviar = async (resultado: ResultadoItem) => {
    setEnviando(true)
    try {
      await marcarItemEntrada(cardId, {
        versao,
        item: item.id,
        resultado,
        justificativa: resultado === 'nao_se_aplica' ? just.trim() : '',
        pendencia:
          resultado === 'nao_conforme' ? { motivo: motivo.trim(), dono, prazo } : undefined,
      })
      setAbrir('')
      await onFeito()
    } catch (err) {
      toast.error(mensagemErro(err))
      if (err instanceof ClientResponseError && err.status === 409) await onFeito()
    } finally {
      setEnviando(false)
    }
  }

  const clicar = (r: Exclude<ResultadoItem, ''>) => {
    if (!podeMarcar || enviando) return
    if (item.resultado === r && !abrir) {
      void enviar('') // clicar de novo retira a marcação
      return
    }
    if (r === 'conforme') void enviar('conforme')
    else setAbrir(r)
  }

  const btn = (r: Exclude<ResultadoItem, ''>, rotulo: string, cor: string) => {
    const ativo = item.resultado === r || abrir === r
    return (
      <button
        type="button"
        disabled={!podeMarcar || enviando}
        aria-pressed={item.resultado === r}
        onClick={() => clicar(r)}
        className={`px-2.5 h-8 text-xs font-medium border-r last:border-r-0 border-slate-300 disabled:cursor-not-allowed ${
          ativo ? cor : 'bg-white text-slate-600 hover:bg-slate-50'
        }`}
      >
        {rotulo}
      </button>
    )
  }

  return (
    <li className="py-2 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex-1 min-w-[200px] text-sm text-slate-800">
          {item.texto}
          {item.severidade === 'critico' && (
            <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-700">
              Crítico
            </span>
          )}
          {item.referencia && (
            <span className="ml-1.5 text-xs text-slate-400">{item.referencia}</span>
          )}
          {item.autor && (
            <div className="text-[11px] text-slate-400">
              {RES[item.resultado]} · {item.autor.nome} · {quando(item.em)}
              {item.resultado === 'nao_se_aplica' && item.justificativa && (
                <> · “{item.justificativa}”</>
              )}
            </div>
          )}
        </div>
        <div
          className="inline-flex rounded-md border border-slate-300 overflow-hidden"
          role="group"
          aria-label="Resultado"
        >
          {btn('conforme', 'Conforme', 'bg-emerald-700 text-white')}
          {btn('nao_conforme', 'Não conforme', 'bg-red-700 text-white')}
          {btn('nao_se_aplica', 'Não se aplica', 'bg-slate-600 text-white')}
        </div>
      </div>

      {pendencia && abrir !== 'nao_conforme' && (
        <div className="rounded-md bg-red-50 border border-red-100 px-2.5 py-1.5 text-xs text-red-800">
          <strong>Pendência de entrada:</strong> {pendencia.motivo} · dono{' '}
          {pendencia.dono?.nome ?? '—'} · prazo {formatarData(pendencia.prazo)}
          {podeMarcar && (
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => setAbrir('nao_conforme')}
            >
              alterar
            </button>
          )}
        </div>
      )}

      {abrir === 'nao_se_aplica' && (
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            autoFocus
            value={just}
            maxLength={1000}
            onChange={(e) => setJust(e.target.value)}
            placeholder="Por que não se aplica? (obrigatório)"
            aria-label="Justificativa"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={enviando || just.trim().length < 3}
              onClick={() => void enviar('nao_se_aplica')}
            >
              Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAbrir('')}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {abrir === 'nao_conforme' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2.5 space-y-2">
          <p className="text-xs font-semibold text-red-800">Pendência de entrada</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-3">
              <Label className="text-xs">O que falta *</Label>
              <Input
                autoFocus
                value={motivo}
                maxLength={500}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: cliente ainda não enviou a rev. 03"
                className="bg-white h-8"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Dono *</Label>
              <select
                value={dono}
                onChange={(e) => setDono(e.target.value)}
                className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
                aria-label="Dono da pendência"
              >
                <option value="">Escolha…</option>
                {equipe.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Prazo *</Label>
              <Input
                type="date"
                min={hojeBR()}
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
                className="bg-white h-8"
              />
            </div>
          </div>
          <p className="text-[11px] text-red-700">
            Aparece em “Minhas tarefas” do dono até o item ser resolvido.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-red-700 hover:bg-red-800"
              disabled={enviando || motivo.trim().length < 3 || !dono || !prazo}
              onClick={() => void enviar('nao_conforme')}
            >
              Salvar pendência
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAbrir('')}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

function TrocarVersaoDialog({
  cardId,
  tipo,
  numero,
  atual,
  onClose,
  onDone,
}: {
  cardId: string
  tipo: TipoChecklist
  numero: number
  atual: ChecklistAplicado | null
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const enviar = async () => {
    setEnviando(true)
    try {
      await aplicarVersaoNoCard(cardId, tipo, motivo.trim(), atual?.versao)
      toast.success(
        atual ? `Checklist trocado para a v${numero}.` : `Checklist v${numero} aplicado.`,
      )
      await onDone()
    } catch (err) {
      toast.error(mensagemErro(err))
    } finally {
      setEnviando(false)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {atual ? `Trocar para a v${numero}` : `Aplicar checklist v${numero}`}
          </DialogTitle>
          <DialogDescription>
            {atual
              ? `O card sai da v${atual.numero}. Marcações de itens que continuam na v${numero} são mantidas; a troca fica no histórico.`
              : 'O checklist vigente da disciplina passa a valer neste card. Fica no histórico.'}
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="trocar-motivo">Motivo *</Label>
          <Textarea
            id="trocar-motivo"
            rows={2}
            maxLength={1000}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="mt-1"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={enviando || motivo.trim().length < 3}
            onClick={enviar}
            className="bg-[#1E3A8A] hover:bg-[#1E2A6B]"
          >
            {enviando ? 'Salvando…' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
