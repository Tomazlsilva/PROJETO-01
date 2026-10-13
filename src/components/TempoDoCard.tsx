import { useCallback, useEffect, useState } from 'react'
import { Play, Timer } from 'lucide-react'
import { toast } from 'sonner'
import { ClientResponseError } from 'pocketbase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { EVENTO_TEMPO } from '@/components/TimerTopo'
import {
  CATEGORIA_LABEL,
  acaoTempo,
  formatarDuracao,
  getTempoDoCard,
  iniciarTempo,
  type Categoria,
  type EventoTempo,
} from '@/services/tempo'

const quando = (s: string) => (s ? new Date(s.replace(' ', 'T')).toLocaleString('pt-BR') : '—')
const paraLocal = (s: string) => {
  if (!s) return ''
  const d = new Date(s.replace(' ', 'T'))
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().slice(0, 16)
}
const localParaIso = (v: string) => (v ? new Date(v).toISOString() : '')

const STATUS: Record<string, string> = {
  ativo: 'em andamento',
  pausado: 'pausado',
  encerrado: 'encerrado',
  pendente_revisao: 'pendente de revisão (>12h)',
}

// SPEC-1-006: apontamento de touch time dentro do card + correções do coordenador.
export function TempoDoCard({
  cardId,
  etapa,
  podeApontar,
}: {
  cardId: string
  etapa: string
  podeApontar: boolean
}) {
  const [itens, setItens] = useState<EventoTempo[]>([])
  const [podeCorrigir, setPodeCorrigir] = useState(false)
  const [categoria, setCategoria] = useState<Categoria>(
    etapa === 'aguardando_revisao' ? 'revisao' : 'elaboracao',
  )
  const [conflito, setConflito] = useState<string | null>(null)
  const [editando, setEditando] = useState<{
    id: string
    modo: 'corrigir' | 'excluir' | 'revisar'
  } | null>(null)
  const [ini, setIni] = useState('')
  const [fim, setFim] = useState('')
  const [motivo, setMotivo] = useState('')

  const carregar = useCallback(async () => {
    try {
      const r = await getTempoDoCard(cardId)
      setItens(r.itens)
      setPodeCorrigir(r.pode_corrigir)
    } catch {
      setItens([])
    }
  }, [cardId])

  useEffect(() => {
    void carregar()
    const ouvir = () => void carregar()
    window.addEventListener(EVENTO_TEMPO, ouvir)
    return () => window.removeEventListener(EVENTO_TEMPO, ouvir)
  }, [carregar])

  const iniciar = async (encerrar: boolean) => {
    try {
      await iniciarTempo(cardId, categoria, encerrar)
      setConflito(null)
      toast.success('Apontamento iniciado. O relógio aparece no topo da tela.')
      window.dispatchEvent(new Event(EVENTO_TEMPO))
    } catch (err) {
      if (
        err instanceof ClientResponseError &&
        err.status === 409 &&
        err.response?.code === 'timer_ativo'
      ) {
        const a = err.response.atual as { disciplina_nome?: string; projeto_nome?: string } | null
        setConflito(a ? `${a.disciplina_nome} — ${a.projeto_nome}` : 'outro card')
      } else toast.error(getErrorMessage(err))
    }
  }

  const salvarEdicao = async () => {
    if (!editando) return
    try {
      if (editando.modo === 'corrigir') {
        await acaoTempo(editando.id, 'corrigir', {
          inicio: localParaIso(ini),
          fim: localParaIso(fim),
          motivo: motivo.trim(),
        })
      } else if (editando.modo === 'revisar') {
        await acaoTempo(editando.id, 'revisar', { fim: localParaIso(fim), motivo: motivo.trim() })
      } else await acaoTempo(editando.id, 'excluir', { motivo: motivo.trim() })
      toast.success('Registrado. O apontamento original foi preservado.')
      setEditando(null)
      window.dispatchEvent(new Event(EVENTO_TEMPO))
      await carregar()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase text-slate-500 flex items-center gap-1.5">
        <Timer className="w-3.5 h-3.5" /> Touch time
      </p>
      {podeApontar && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={categoria} onValueChange={(v) => setCategoria(v as Categoria)}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(CATEGORIA_LABEL) as Categoria[]).map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORIA_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => void iniciar(false)}>
            <Play className="w-4 h-4" /> Iniciar apontamento
          </Button>
          <span className="text-xs text-slate-400">Espera é medida à parte do touch time.</span>
        </div>
      )}
      {conflito && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm space-y-2">
          <p>
            Você já tem um apontamento aberto em <strong>{conflito}</strong>. Encerrar aquele e
            começar este?
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void iniciar(true)}>
              Encerrar e começar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConflito(null)}>
              Manter o atual
            </Button>
          </div>
        </div>
      )}
      {itens.length > 0 && (
        <ul className="divide-y divide-slate-100 text-sm border border-slate-100 rounded-lg">
          {itens.map((t) => (
            <li
              key={t.id}
              className={`px-3 py-2 ${t.substituido || t.excluido ? 'opacity-60' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="tabular-nums font-semibold">{formatarDuracao(t.duracao_seg)}</span>
                <span className="text-slate-600">{CATEGORIA_LABEL[t.categoria]}</span>
                {t.usuario && <span className="text-slate-500">· {t.usuario.nome}</span>}
                <span className="text-xs text-slate-400">
                  {quando(t.inicio)} → {t.fim ? quando(t.fim) : STATUS[t.status]}
                </span>
                {t.origem === 'correcao' && (
                  <span className="text-[11px] px-1.5 rounded bg-blue-50 text-blue-700">
                    corrigido
                  </span>
                )}
                {t.substituido && (
                  <span className="text-[11px] px-1.5 rounded bg-slate-100 text-slate-600">
                    versão original
                  </span>
                )}
                {t.excluido && (
                  <span className="text-[11px] px-1.5 rounded bg-red-50 text-red-700">
                    fora do baseline
                  </span>
                )}
                {t.status === 'pendente_revisao' && (
                  <span className="text-[11px] px-1.5 rounded bg-amber-100 text-amber-800">
                    pendente (&gt;12h)
                  </span>
                )}
                {t.revisado && (
                  <span className="text-[11px] px-1.5 rounded bg-green-50 text-green-700">
                    revisado
                  </span>
                )}
                {podeCorrigir && !t.substituido && !t.excluido && (
                  <span className="ml-auto flex gap-2 text-xs">
                    {t.status === 'pendente_revisao' ? (
                      <button
                        type="button"
                        className="text-[#1E3A8A] hover:underline"
                        onClick={() => {
                          setEditando({ id: t.id, modo: 'revisar' })
                          setFim('')
                          setMotivo('')
                        }}
                      >
                        Revisar
                      </button>
                    ) : t.status === 'encerrado' ? (
                      <>
                        <button
                          type="button"
                          className="text-[#1E3A8A] hover:underline"
                          onClick={() => {
                            setEditando({ id: t.id, modo: 'corrigir' })
                            setIni(paraLocal(t.inicio))
                            setFim(paraLocal(t.fim))
                            setMotivo('')
                          }}
                        >
                          Corrigir
                        </button>
                        <button
                          type="button"
                          className="text-red-700 hover:underline"
                          onClick={() => {
                            setEditando({ id: t.id, modo: 'excluir' })
                            setMotivo('')
                          }}
                        >
                          Excluir
                        </button>
                      </>
                    ) : null}
                  </span>
                )}
              </div>
              {(t.correcao_motivo || t.exclusao_motivo || t.revisao_motivo) && (
                <p className="text-xs text-slate-500 mt-0.5">
                  “{t.correcao_motivo || t.exclusao_motivo || t.revisao_motivo}”
                </p>
              )}
              {editando?.id === t.id && (
                <div className="mt-2 flex flex-col gap-2 rounded-lg bg-slate-50 p-2">
                  {editando.modo === 'corrigir' && (
                    <Input
                      type="datetime-local"
                      value={ini}
                      onChange={(e) => setIni(e.target.value)}
                      aria-label="Início"
                    />
                  )}
                  {editando.modo !== 'excluir' && (
                    <Input
                      type="datetime-local"
                      value={fim}
                      onChange={(e) => setFim(e.target.value)}
                      aria-label="Fim"
                    />
                  )}
                  <Input
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Motivo (obrigatório)"
                    maxLength={1000}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={
                        motivo.trim().length < 3 ||
                        (editando.modo !== 'excluir' && !fim) ||
                        (editando.modo === 'corrigir' && !ini)
                      }
                      onClick={() => void salvarEdicao()}
                    >
                      Salvar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditando(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
