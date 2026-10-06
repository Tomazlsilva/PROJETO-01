import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ACTION_LABEL, listAudit, type AuditEntry } from '@/services/audit'
import { listUsers, type UserRecord } from '@/services/users'

const OUTCOME: Record<string, { label: string; cls: string }> = {
  success: { label: 'Sucesso', cls: 'bg-emerald-50 text-emerald-700' },
  failure: { label: 'Falha', cls: 'bg-amber-50 text-amber-800' },
  blocked: { label: 'Bloqueado', cls: 'bg-red-50 text-red-700' },
}

export default function Auditoria() {
  const [items, setItems] = useState<AuditEntry[] | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [acao, setAcao] = useState('todas')
  const [users, setUsers] = useState<UserRecord[]>([])

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch(() => setUsers([]))
  }, [])

  useEffect(() => {
    setItems(null)
    listAudit(page, 50, acao === 'todas' ? '' : acao)
      .then((r) => {
        setItems(r.items)
        setTotalPages(Math.max(1, r.totalPages))
      })
      .catch(() => setItems([]))
  }, [page, acao])

  const nome = useMemo(() => {
    const m = new Map(users.map((u) => [u.id, u.name || u.email]))
    return (id: string) => (id ? m.get(id) || id : '—')
  }, [users])

  const detalhe = (e: AuditEntry) => {
    const d = e.details || {}
    if (e.action === 'user.role_change' && d.antes !== undefined)
      return `${d.antes || '—'} → ${d.depois}`
    if (e.action === 'access.denied' && d.recurso) return String(d.recurso)
    if (e.action === 'login.failure' && d.tentativa) return `tentativa ${d.tentativa}/5`
    return ''
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Auditoria de acesso</h1>
          <p className="text-sm text-slate-500">
            Registro somente de inclusão — não pode ser editado nem apagado.
          </p>
        </div>
        <div className="w-64">
          <Select
            value={acao}
            onValueChange={(v) => {
              setPage(1)
              setAcao(v)
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as ações</SelectItem>
              {Object.entries(ACTION_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        {items === null ? (
          <div className="p-6 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
          </div>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Nenhum registro.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Quando</th>
                <th className="px-4 py-3">Ação</th>
                <th className="px-4 py-3">Quem</th>
                <th className="px-4 py-3">Alvo</th>
                <th className="px-4 py-3">Resultado</th>
                <th className="px-4 py-3">Detalhe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((e) => {
                const o = OUTCOME[e.outcome] || {
                  label: e.outcome || '—',
                  cls: 'bg-slate-100 text-slate-600',
                }
                return (
                  <tr key={e.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">
                      {new Date(e.created.replace(' ', 'T')).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-2.5">{ACTION_LABEL[e.action] || e.action}</td>
                    <td className="px-4 py-2.5">{nome(e.actor_id)}</td>
                    <td className="px-4 py-2.5">{nome(e.target_id)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${o.cls}`}>{o.label}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{detalhe(e)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 text-sm">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </Button>
        <span className="text-slate-500">
          Página {page} de {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima
        </Button>
      </div>
    </div>
  )
}
