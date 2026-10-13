import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, RotateCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { MOTIVO_FALHA, getFalhas, reprocessarHandoff, type FalhaHandoff } from '@/services/handoffs'

const quando = (s: string) => (s ? new Date(s.replace(' ', 'T')).toLocaleString('pt-BR') : '—')

const STATUS: Record<string, { rotulo: string; cor: string }> = {
  falha: { rotulo: 'Falha', cor: 'bg-red-50 text-red-700 border-red-200' },
  entregue: { rotulo: 'Entregue', cor: 'bg-green-50 text-green-700 border-green-200' },
  obsoleto: { rotulo: 'Sem efeito', cor: 'bg-slate-100 text-slate-600 border-slate-200' },
}

// SPEC-1-005 (CA-1-005-04/05/09): caixa de falhas de handoff — coordenador/administrador.
export default function Falhas() {
  const [itens, setItens] = useState<FalhaHandoff[] | null>(null)
  const [todos, setTodos] = useState(false)
  const [processando, setProcessando] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      setItens((await getFalhas(todos)).itens)
    } catch (err) {
      toast.error(getErrorMessage(err))
      setItens([])
    }
  }, [todos])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const reprocessar = async (f: FalhaHandoff) => {
    setProcessando(f.id)
    try {
      const r = await reprocessarHandoff(f.id)
      if (r.resultado === 'entregue') toast.success('Pendência entregue ao destinatário.')
      else if (r.resultado === 'falha')
        toast.error(`Ainda não foi possível entregar: ${MOTIVO_FALHA[r.motivo] ?? r.motivo}.`)
      else if (r.resultado === 'ja_entregue') toast.info('Esta pendência já tinha sido entregue.')
      else toast.info('O card já mudou de etapa; o evento ficou sem efeito.')
      await carregar()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setProcessando(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-600" /> Caixa de falhas
          </h1>
          <p className="text-sm text-slate-500">
            Pendências que não chegaram ao destinatário certo. A pendência nunca se perde: fica com
            o coordenador até o ajuste. Corrija o que falta e reprocesse.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <Switch checked={todos} onCheckedChange={setTodos} /> Mostrar resolvidas
          </label>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => void carregar()}>
            <RefreshCw className="w-4 h-4" /> Atualizar
          </Button>
        </div>
      </div>

      {!itens ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </div>
      ) : itens.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500 flex flex-col items-center gap-2">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
          Nenhuma falha pendente.
        </div>
      ) : (
        <ul className="space-y-3">
          {itens.map((f) => {
            const st = STATUS[f.status] ?? STATUS.falha
            return (
              <li key={f.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${st.cor}`}
                  >
                    {st.rotulo}
                  </span>
                  <span className="font-semibold text-slate-900">{f.disciplina?.nome ?? '—'}</span>
                  <span className="text-sm text-slate-500">· {f.projeto?.nome ?? '—'}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-[#1E3A8A] border border-blue-100">
                    → {f.etapa_destino_nome}
                  </span>
                  <span className="sm:ml-auto text-xs text-slate-500">
                    {f.tentativas} tentativa(s) · última em {quando(f.updated)}
                  </span>
                </div>
                {f.status === 'falha' && (
                  <div className="text-sm">
                    <p className="text-red-700">
                      <strong>Motivo:</strong> {f.motivo_texto}
                    </p>
                    <p className="text-slate-700">
                      <strong>Próxima ação:</strong> {f.proxima_acao}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Enquanto isso, a pendência está com {f.atividade?.destinatario?.nome ?? '—'}.
                    </p>
                  </div>
                )}
                {f.historico.length > 0 && (
                  <details className="text-xs text-slate-600">
                    <summary className="cursor-pointer select-none">Tentativas</summary>
                    <ul className="mt-1 space-y-0.5">
                      {f.historico.map((h, i) => (
                        <li key={i}>
                          #{h.tentativa} · {quando(h.em)} · {h.autor?.nome ?? 'Sistema'} ·{' '}
                          {h.resultado}
                          {h.motivo ? ` (${MOTIVO_FALHA[h.motivo] ?? h.motivo})` : ''}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="flex flex-wrap gap-2">
                  {f.card && f.projeto && (
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/kanban?projeto=${f.projeto.id}&card=${f.card.id}`}>
                        Abrir card para ajustar
                      </Link>
                    </Button>
                  )}
                  {f.status === 'falha' && (
                    <Button
                      size="sm"
                      className="gap-1 bg-[#1E3A8A] hover:bg-[#1E2A6B]"
                      disabled={processando === f.id}
                      onClick={() => void reprocessar(f)}
                    >
                      {processando === f.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RotateCw className="w-4 h-4" />
                      )}
                      Reprocessar
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
