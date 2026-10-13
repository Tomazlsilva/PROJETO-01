import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getNotificacoes, lerNotificacao, type Notificacao } from '@/services/handoffs'

const quando = (s: string) => (s ? new Date(s.replace(' ', 'T')).toLocaleString('pt-BR') : '')

// SPEC-1-005 (CA-1-005-08): sino com notificações internas persistentes.
// Ao abrir uma notificação, registra a leitura e leva ao card da atividade.
export function Notificacoes() {
  const navigate = useNavigate()
  const [aberto, setAberto] = useState(false)
  const [naoLidas, setNaoLidas] = useState(0)
  const [itens, setItens] = useState<Notificacao[]>([])

  const carregar = useCallback(async () => {
    try {
      const r = await getNotificacoes()
      setNaoLidas(r.nao_lidas)
      setItens(r.itens)
    } catch {
      // sem conexão: mantém o que já havia
    }
  }, [])

  useEffect(() => {
    void carregar()
    const id = setInterval(() => void carregar(), 60_000)
    return () => clearInterval(id)
  }, [carregar])

  useEffect(() => {
    if (aberto) void carregar()
  }, [aberto, carregar])

  const abrir = async (n: Notificacao) => {
    setAberto(false)
    if (!n.lida) {
      try {
        await lerNotificacao(n.id)
      } catch {
        // a navegação segue mesmo se a marcação falhar
      }
    }
    void carregar()
    navigate(`/kanban?projeto=${n.projeto}&card=${n.card}`)
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={naoLidas > 0 ? `${naoLidas} notificação(ões) não lida(s)` : 'Notificações'}
          className="relative w-9 h-9 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 border border-slate-200"
        >
          <Bell className="w-4 h-4" />
          {naoLidas > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
              {naoLidas > 99 ? '99+' : naoLidas}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] max-w-[calc(100vw-32px)] p-0">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-900">Notificações</span>
          <span className="text-xs text-slate-500">{naoLidas} não lida(s)</span>
        </div>
        <ul className="max-h-[400px] overflow-y-auto divide-y divide-slate-100">
          {itens.length === 0 && (
            <li className="px-4 py-6 text-sm text-slate-500 text-center">Nenhuma notificação.</li>
          )}
          {itens.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => void abrir(n)}
                className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${n.lida ? '' : 'bg-blue-50/60'}`}
              >
                <div className="flex items-start gap-2">
                  {!n.lida && (
                    <span className="mt-1.5 w-2 h-2 rounded-full bg-[#1E3A8A] shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p
                      className={`text-sm ${n.lida ? 'text-slate-700' : 'font-semibold text-slate-900'}`}
                    >
                      {n.titulo}
                    </p>
                    {n.texto && <p className="text-xs text-slate-500 mt-0.5">{n.texto}</p>}
                    <p className="text-[11px] text-slate-400 mt-1">{quando(n.created)}</p>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
