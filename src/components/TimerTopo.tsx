import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Pause, Play, Square, Timer } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import {
  CATEGORIA_LABEL,
  acaoTempo,
  formatarDuracao,
  getTempoAtual,
  type Apontamento,
  type SituacaoTempo,
} from '@/services/tempo'

// Outras telas disparam este evento quando iniciam/encerram um apontamento
export const EVENTO_TEMPO = 'central:tempo-mudou'

const quando = (s: string) => (s ? new Date(s.replace(' ', 'T')).toLocaleString('pt-BR') : '')
const localParaIso = (v: string) => (v ? new Date(v).toISOString() : '')

// SPEC-1-006: relógio do apontamento no topo — mostra o timer aberto, pausa/retoma/encerra
// e as pendências (timer esquecido >12h) para informar o fim real.
export function TimerTopo() {
  const navigate = useNavigate()
  const [sit, setSit] = useState<SituacaoTempo | null>(null)
  const [lidoEm, setLidoEm] = useState(Date.now())
  const [agora, setAgora] = useState(Date.now())
  const [aberto, setAberto] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const r = await getTempoAtual()
      setSit(r)
      setLidoEm(Date.now())
      setAgora(Date.now())
    } catch {
      // mantém o estado anterior
    }
  }, [])

  useEffect(() => {
    void carregar()
    const id = setInterval(() => void carregar(), 60_000)
    const ouvir = () => void carregar()
    window.addEventListener(EVENTO_TEMPO, ouvir)
    return () => {
      clearInterval(id)
      window.removeEventListener(EVENTO_TEMPO, ouvir)
    }
  }, [carregar])

  useEffect(() => {
    if (sit?.atual?.status !== 'ativo') return
    const id = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [sit?.atual?.status])

  const atual = sit?.atual ?? null
  const pend = sit?.pendentes ?? []
  if (!atual && pend.length === 0) return null

  // o servidor devolve o acumulado até a leitura; entre leituras o relógio anda aqui
  const decorrido = (a: Apontamento) =>
    a.status === 'ativo'
      ? a.acumulado_seg + Math.max(0, Math.round((agora - lidoEm) / 1000))
      : a.acumulado_seg

  const agir = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      toast.success(ok)
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
    await carregar()
    window.dispatchEvent(new Event(EVENTO_TEMPO))
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex items-center gap-1.5 h-9 px-3 rounded-full border text-sm font-semibold ${
            atual?.status === 'ativo'
              ? 'bg-green-50 text-green-800 border-green-200'
              : pend.length > 0 && !atual
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-slate-50 text-slate-700 border-slate-200'
          }`}
          aria-label="Apontamento de tempo"
        >
          {pend.length > 0 && !atual ? (
            <AlertTriangle className="w-4 h-4" />
          ) : (
            <Timer className="w-4 h-4" />
          )}
          {atual ? (
            <span className="tabular-nums">
              {formatarDuracao(decorrido(atual))}
              {atual.status === 'pausado' && ' (pausado)'}
            </span>
          ) : (
            <span>{pend.length}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] max-w-[calc(100vw-32px)] space-y-3">
        {atual && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-slate-500">Apontamento aberto</p>
            <button
              type="button"
              className="text-left text-sm font-semibold text-[#1E3A8A] hover:underline"
              onClick={() => {
                setAberto(false)
                navigate(`/kanban?projeto=${atual.projeto}&card=${atual.card}`)
              }}
            >
              {atual.disciplina_nome} — {atual.projeto_nome}
            </button>
            <p className="text-xs text-slate-500">
              {CATEGORIA_LABEL[atual.categoria]} · desde {quando(atual.inicio)}
            </p>
            <div className="flex gap-2">
              {atual.status === 'ativo' ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => agir(() => acaoTempo(atual.id, 'pausar'), 'Pausado.')}
                >
                  <Pause className="w-4 h-4" /> Pausar
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => agir(() => acaoTempo(atual.id, 'retomar'), 'Retomado.')}
                >
                  <Play className="w-4 h-4" /> Retomar
                </Button>
              )}
              <Button
                size="sm"
                className="gap-1 bg-[#1E3A8A] hover:bg-[#1E2A6B]"
                onClick={() =>
                  agir(() => acaoTempo(atual.id, 'encerrar'), 'Apontamento encerrado.')
                }
              >
                <Square className="w-4 h-4" /> Encerrar
              </Button>
            </div>
          </div>
        )}
        {pend.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-amber-700">
              Timer esquecido (mais de 12h) — informe o fim real
            </p>
            {pend.map((p) => (
              <Pendente
                key={p.id}
                p={p}
                onEnviar={(fim, motivo) =>
                  agir(() => acaoTempo(p.id, 'revisar', { fim, motivo }), 'Revisão registrada.')
                }
              />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function Pendente({
  p,
  onEnviar,
}: {
  p: Apontamento
  onEnviar: (fimIso: string, motivo: string) => Promise<void>
}) {
  const [fim, setFim] = useState('')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2 space-y-1.5">
      <p className="text-sm text-slate-800">
        {p.disciplina_nome} — {p.projeto_nome}
      </p>
      <p className="text-xs text-slate-500">Começou em {quando(p.inicio)}</p>
      <Input
        type="datetime-local"
        value={fim}
        onChange={(e) => setFim(e.target.value)}
        className="h-8 bg-white"
        aria-label="Fim real"
      />
      <Input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo (ex.: esqueci de encerrar)"
        maxLength={1000}
        className="h-8 bg-white"
      />
      <Button
        size="sm"
        disabled={enviando || !fim || motivo.trim().length < 3}
        onClick={async () => {
          setEnviando(true)
          await onEnviar(localParaIso(fim), motivo.trim())
          setEnviando(false)
        }}
      >
        Registrar fim
      </Button>
    </div>
  )
}
