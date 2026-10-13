import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  Download,
  Loader2,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react'
import { ClientResponseError } from 'pocketbase'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import {
  baixarBackup,
  criarBackup,
  limparBackups,
  listBackups,
  verificarBackup,
  type Backup,
} from '@/services/painel'

const quando = (s: string) =>
  s
    ? new Date(s.replace(' ', 'T')).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '—'

const tamanho = (b: number) =>
  b >= 1_000_000 ? (b / 1_000_000).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1000)) + ' KB'

// SPEC-1-007 (CA-1-007-08/12): backups criptografados, só administrador.
// A chave fica no secret BACKUP_KEY do Skip Cloud — esta tela só diz se ela existe.
export default function Backups() {
  const [dados, setDados] = useState<{
    chave_configurada: boolean
    retencao_dias: number
    itens: Backup[]
  } | null>(null)
  const [ocupado, setOcupado] = useState('')

  const carregar = useCallback(async () => {
    try {
      setDados(await listBackups())
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const executar = async (chave: string, fn: () => Promise<void>) => {
    setOcupado(chave)
    try {
      await fn()
    } catch (err) {
      if (err instanceof ClientResponseError && err.status === 409) {
        toast.error((err.response as { message?: string }).message || getErrorMessage(err))
      } else toast.error(getErrorMessage(err))
    } finally {
      setOcupado('')
      await carregar()
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <DatabaseBackup className="w-6 h-6 text-[#1E3A8A]" /> Backups
          </h1>
          <p className="text-sm text-slate-500">
            Cópia diária automática às 03:00 · criptografada (AES-256-GCM) · guardada por{' '}
            {dados?.retencao_dias ?? 90} dias.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={!!ocupado}
            onClick={() =>
              executar('limpar', async () => {
                const r = await limparBackups()
                toast.success(`${r.removidos} backup(s) vencido(s) removido(s).`)
              })
            }
          >
            <Trash2 className="w-4 h-4" /> Remover vencidos
          </Button>
          <Button
            size="sm"
            className="gap-1 bg-[#1E3A8A] hover:bg-[#1E2A6B]"
            disabled={!!ocupado || (dados !== null && !dados.chave_configurada)}
            onClick={() =>
              executar('criar', async () => {
                await criarBackup()
                toast.success('Backup criado.')
              })
            }
          >
            {ocupado === 'criar' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <DatabaseBackup className="w-4 h-4" />
            )}
            Fazer backup agora
          </Button>
        </div>
      </div>

      {dados && !dados.chave_configurada && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <strong>Chave de backup não configurada.</strong> Cadastre o secret{' '}
            <code>BACKUP_KEY</code> (32 caracteres) no Skip Cloud e guarde uma cópia da chave fora
            do sistema — sem ela os backups não podem ser lidos. Enquanto isso, os backups
            automáticos ficam registrados como falha.
          </div>
        </div>
      )}

      {!dados ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </div>
      ) : dados.itens.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum backup ainda.</p>
      ) : (
        <section className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">Criado em</th>
                <th className="px-3 py-2">Origem</th>
                <th className="px-3 py-2">Situação</th>
                <th className="px-3 py-2">Conteúdo</th>
                <th className="px-3 py-2">Verificação</th>
                <th className="px-3 py-2">Vence em</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dados.itens.map((b) => {
                const total = Object.values(b.contagens || {}).reduce((s, n) => s + n, 0)
                return (
                  <tr key={b.id} className="align-top">
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                      {quando(b.criado_em)}
                      {b.criado_por && <div className="text-xs text-slate-500">{b.criado_por}</div>}
                    </td>
                    <td className="px-3 py-2">
                      {b.origem === 'automatico' ? 'Automático' : 'Manual'}
                    </td>
                    <td className="px-3 py-2">
                      {b.status === 'ok' ? (
                        <span className="text-green-700 font-semibold">OK</span>
                      ) : (
                        <span className="text-red-700 font-semibold" title={b.erro}>
                          Falha
                        </span>
                      )}
                      {b.status !== 'ok' && (
                        <div className="text-xs text-red-700 max-w-xs">{b.erro}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {b.status === 'ok' ? (
                        <>
                          {total.toLocaleString('pt-BR')} registros · {tamanho(b.tamanho_bytes)}
                          <div className="font-mono text-[10px] text-slate-400" title={b.sha256}>
                            SHA-256 {b.sha256.slice(0, 12)}…
                          </div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {!b.verificacao ? (
                        <span className="text-slate-400">Não verificado</span>
                      ) : b.verificacao.ok ? (
                        <span className="text-green-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Íntegro ·{' '}
                          {quando(b.verificado_em)}
                        </span>
                      ) : (
                        <span className="text-red-700 flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" /> Com problema ·{' '}
                          {quando(b.verificado_em)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums text-xs">
                      {quando(b.expira_em)}
                    </td>
                    <td className="px-3 py-2">
                      {b.status === 'ok' && (
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            disabled={!!ocupado || !dados.chave_configurada}
                            onClick={() =>
                              executar('v' + b.id, async () => {
                                const r = await verificarBackup(b.id)
                                if (r.ok)
                                  toast.success('Backup íntegro: hash e contagens conferem.')
                                else toast.error(r.erro || 'O backup não passou na verificação.')
                              })
                            }
                          >
                            {ocupado === 'v' + b.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <ShieldCheck className="w-3.5 h-3.5" />
                            )}
                            Verificar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            title="Baixar arquivo criptografado"
                            onClick={() =>
                              baixarBackup(b).catch((err) => toast.error(getErrorMessage(err)))
                            }
                          >
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      <section className="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-600 space-y-1">
        <h2 className="font-bold text-slate-900">Restauração</h2>
        <p>
          A restauração é sempre feita em um ambiente isolado (outra instância), nunca sobre a
          produção. O arquivo baixado está cifrado; para restaurar é preciso a chave guardada pelo
          administrador técnico. O procedimento está descrito na evidência da SPEC-1-007.
        </p>
      </section>
    </div>
  )
}
