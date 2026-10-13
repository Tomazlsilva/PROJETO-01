import { useCallback, useEffect, useState } from 'react'
import { Loader2, Lock, UserPlus, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { ROLES, ROLE_LABEL, asRole, type Role } from '@/lib/permissions'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import {
  createUser,
  isLocked,
  listUsers,
  setUserActive,
  setUserPassword,
  unlockUser,
  updateUserRole,
  type UserRecord,
} from '@/services/users'

export default function Usuarios() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<UserRecord[] | null>(null)
  const [novoAberto, setNovoAberto] = useState(false)
  const [senhaPara, setSenhaPara] = useState<UserRecord | null>(null)
  const [revogar, setRevogar] = useState<UserRecord | null>(null)

  const carregar = useCallback(() => {
    listUsers()
      .then(setUsers)
      .catch((err) => toast.error(getErrorMessage(err)))
  }, [])

  useEffect(() => carregar(), [carregar])

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      toast.success(ok)
      carregar()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Usuários</h1>
          <p className="text-sm text-slate-500">
            Contas individuais e papéis. Revogar encerra as sessões e preserva o histórico.
          </p>
        </div>
        <Button
          onClick={() => setNovoAberto(true)}
          className="bg-[#1E3A8A] hover:bg-[#1E2A6B] gap-1.5"
        >
          <UserPlus className="w-4 h-4" /> Novo usuário
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        {users === null ? (
          <div className="p-6 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Papel</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const souEu = u.id === me?.id
                const bloqueado = isLocked(u)
                return (
                  <tr key={u.id} className={u.active ? '' : 'bg-slate-50/70 text-slate-400'}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{u.name || '—'}</div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </td>
                    <td className="px-4 py-3 min-w-[170px]">
                      <Select
                        value={asRole(u.role) ?? undefined}
                        disabled={souEu || !u.active}
                        onValueChange={(v) =>
                          run(() => updateUserRole(u.id, v as Role), 'Papel atualizado.')
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Sem papel" />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      {!u.active ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-slate-200 text-slate-600">
                          Revogada
                        </span>
                      ) : bloqueado ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 inline-flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Bloqueada
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700">
                          Ativa
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end flex-wrap gap-2">
                        {bloqueado && u.active && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => run(() => unlockUser(u.id), 'Bloqueio removido.')}
                          >
                            Desbloquear
                          </Button>
                        )}
                        {u.active && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSenhaPara(u)}
                            className="gap-1"
                          >
                            <KeyRound className="w-3.5 h-3.5" /> Senha
                          </Button>
                        )}
                        {!souEu &&
                          (u.active ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:bg-red-50 hover:text-red-700"
                              onClick={() => setRevogar(u)}
                            >
                              Revogar
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                run(() => setUserActive(u.id, true), 'Acesso reativado.')
                              }
                            >
                              Reativar
                            </Button>
                          ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <NovoUsuarioDialog open={novoAberto} onOpenChange={setNovoAberto} onCreated={carregar} />
      <SenhaDialog alvo={senhaPara} onClose={() => setSenhaPara(null)} />

      <Dialog open={!!revogar} onOpenChange={(o) => !o && setRevogar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revogar acesso</DialogTitle>
            <DialogDescription>
              {revogar?.name || revogar?.email} perde o acesso imediatamente e todas as sessões
              abertas são encerradas. O histórico e a autoria dos registros são mantidos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevogar(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                const alvo = revogar
                setRevogar(null)
                if (alvo) void run(() => setUserActive(alvo.id, false), 'Acesso revogado.')
              }}
            >
              Revogar acesso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function gerarSenha(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*'
  const bytes = new Uint32Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('')
}

function NovoUsuarioDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('projetista')
  const [password, setPassword] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setEmail('')
      setRole('projetista')
      setPassword('')
    }
  }, [open])

  const salvar = async () => {
    if (password !== '' && password.length < 8) {
      toast.error('A senha deve ter pelo menos 8 caracteres, ou deixe em branco.')
      return
    }
    setSalvando(true)
    try {
      await createUser({ name: name.trim(), email: email.trim(), role, password })
      toast.success(
        password
          ? 'Usuário criado. Entregue a senha temporária por um canal seguro.'
          : 'Usuário liberado. A pessoa entra com a conta Microsoft ou cria a senha em "Esqueci a senha".',
      )
      onOpenChange(false)
      onCreated()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            Cada pessoa usa conta própria — nunca conta compartilhada.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nu-nome">Nome</Label>
            <Input id="nu-nome" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nu-email">E-mail</Label>
            <Input
              id="nu-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Papel</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nu-senha">Senha temporária (opcional, mínimo 8)</Label>
            <div className="flex gap-2">
              <Input
                id="nu-senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <Button type="button" variant="outline" onClick={() => setPassword(gerarSenha())}>
                Gerar
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Pode deixar em branco: a pessoa entra com a conta Microsoft da empresa ou cria a
              própria senha em “Esqueci a senha”.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={salvar}
            disabled={salvando || !email.trim()}
            className="bg-[#1E3A8A] hover:bg-[#1E2A6B]"
          >
            {salvando ? 'Criando…' : 'Criar usuário'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SenhaDialog({ alvo, onClose }: { alvo: UserRecord | null; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => setPassword(''), [alvo])

  const salvar = async () => {
    if (!alvo) return
    if (password.length < 8) {
      toast.error('A senha deve ter pelo menos 8 caracteres.')
      return
    }
    setSalvando(true)
    try {
      await setUserPassword(alvo.id, password)
      toast.success('Senha definida. As sessões anteriores dessa conta foram encerradas.')
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={!!alvo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Definir senha</DialogTitle>
          <DialogDescription>
            Nova senha temporária para {alvo?.name || alvo?.email}. Ela não fica registrada em
            nenhum log.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="Mínimo de 8 caracteres"
          />
          <Button type="button" variant="outline" onClick={() => setPassword(gerarSenha())}>
            Gerar
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando} className="bg-[#1E3A8A] hover:bg-[#1E2A6B]">
            {salvando ? 'Salvando…' : 'Definir senha'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
