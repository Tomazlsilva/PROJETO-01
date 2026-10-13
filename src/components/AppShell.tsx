import React, { useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LogOut,
  User,
  LayoutDashboard,
  Users,
  ScrollText,
  Loader2,
  KanbanSquare,
  ListTodo,
  Workflow,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CmxLogo } from '@/components/CmxLogo'
import { useAuth } from '@/contexts/AuthContext'
import { ROLE_LABEL, type Role } from '@/lib/permissions'

interface AppShellProps {
  roles?: Role[]
  // páginas largas (Kanban) usam a largura toda da tela
  largo?: boolean
}

// Casca das páginas autenticadas: exige sessão e, opcionalmente, papéis.
// Esconder na interface é conveniência; quem bloqueia de fato é o servidor.
export default function AppShell({ roles, largo }: AppShellProps) {
  const { user, role, isAdmin, isAuthenticated, isLoading, logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate('/', { replace: true })
  }, [isLoading, isAuthenticated, navigate])

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA]">
        <Loader2 className="w-6 h-6 animate-spin text-[#1E3A8A]" />
      </div>
    )
  }

  const allowed = !roles || (role !== null && roles.includes(role))
  const userName = (user?.name as string) || (user?.email as string)?.split('@')[0] || 'Usuário'

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? 'bg-blue-50 text-[#1E3A8A]'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
    }`

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-slate-800 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 sm:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <CmxLogo variant="light" size="sm" />
          <nav className="hidden md:flex items-center gap-1 pl-4 border-l border-slate-200">
            <NavLink to="/dashboard" className={navClass}>
              <LayoutDashboard className="w-4 h-4" /> Início
            </NavLink>
            <NavLink to="/fila" className={navClass}>
              <ListTodo className="w-4 h-4" /> Fila
            </NavLink>
            <NavLink to="/kanban" className={navClass}>
              <KanbanSquare className="w-4 h-4" /> Kanban
            </NavLink>
            {isAdmin && (
              <>
                <NavLink to="/admin/usuarios" className={navClass}>
                  <Users className="w-4 h-4" /> Usuários
                </NavLink>
                <NavLink to="/admin/fluxo" className={navClass}>
                  <Workflow className="w-4 h-4" /> Fluxo
                </NavLink>
                <NavLink to="/admin/auditoria" className={navClass}>
                  <ScrollText className="w-4 h-4" /> Auditoria
                </NavLink>
              </>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-right">
            <div className="text-sm font-semibold text-slate-800 leading-tight">{userName}</div>
            <div className="text-xs text-slate-500">{role ? ROLE_LABEL[role] : 'Sem papel'}</div>
          </div>
          <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center border border-blue-200">
            <User className="w-4 h-4" />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              logout()
              navigate('/', { replace: true })
            }}
            className="text-slate-600 hover:text-red-600 hover:border-red-200 hover:bg-red-50 flex items-center gap-1.5"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
      </header>
      <nav className="md:hidden flex gap-1 px-4 py-2 bg-white border-b border-slate-200 overflow-x-auto">
        <NavLink to="/dashboard" className={navClass}>
          Início
        </NavLink>
        <NavLink to="/fila" className={navClass}>
          Fila
        </NavLink>
        <NavLink to="/kanban" className={navClass}>
          Kanban
        </NavLink>
        {isAdmin && (
          <>
            <NavLink to="/admin/usuarios" className={navClass}>
              Usuários
            </NavLink>
            <NavLink to="/admin/fluxo" className={navClass}>
              Fluxo
            </NavLink>
            <NavLink to="/admin/auditoria" className={navClass}>
              Auditoria
            </NavLink>
          </>
        )}
      </nav>
      <main
        className={`flex-1 w-full mx-auto p-4 sm:p-8 min-w-0 ${largo ? 'max-w-[1800px]' : 'max-w-6xl'}`}
      >
        {allowed ? <Outlet /> : <AcessoNegado />}
      </main>
    </div>
  )
}

export const AcessoNegado: React.FC = () => (
  <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-lg mx-auto mt-8">
    <h1 className="text-xl font-bold text-slate-900">Acesso negado</h1>
    <p className="text-sm text-slate-500 mt-2">
      Você não tem permissão para acessar este conteúdo. Se precisar, fale com o administrador.
    </p>
  </div>
)
