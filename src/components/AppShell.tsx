import React, { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
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
  AlertTriangle,
  BarChart3,
  Gauge,
  History,
  DatabaseBackup,
  CalendarDays,
  Clock,
  FileUp,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  Sun,
  BookOpen,
} from 'lucide-react'
import { salvarTema, temaSalvo, type Tema } from '@/lib/tema'
import { TimerTopo } from '@/components/TimerTopo'
import { Button } from '@/components/ui/button'
import { CmxLogo } from '@/components/CmxLogo'
import { Notificacoes } from '@/components/Notificacoes'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { PAPEL_LABEL, papelDe, type Role } from '@/lib/permissions'

interface AppShellProps {
  roles?: Role[]
  // páginas largas (Kanban) usam a largura toda da tela
  largo?: boolean
}

interface ItemMenu {
  to: string
  rotulo: string
  icone: React.ComponentType<{ className?: string }>
  end?: boolean
}

interface GrupoMenu {
  titulo: string
  itens: ItemMenu[]
}

const CHAVE_RECOLHIDO = 'central.menu.recolhido'

const lerRecolhido = () => {
  try {
    return window.localStorage.getItem(CHAVE_RECOLHIDO) === '1'
  } catch {
    return false
  }
}

const gravarRecolhido = (v: boolean) => {
  try {
    window.localStorage.setItem(CHAVE_RECOLHIDO, v ? '1' : '0')
  } catch {
    // sem armazenamento: só não lembra a escolha
  }
}

// Casca das páginas autenticadas: exige sessão e, opcionalmente, papéis.
// Esconder na interface é conveniência; quem bloqueia de fato é o servidor.
export default function AppShell({ roles, largo }: AppShellProps) {
  const { user, role, isAdmin, isAuthenticated, isLoading, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [recolhido, setRecolhido] = useState(lerRecolhido)
  const [menuCelular, setMenuCelular] = useState(false)
  const [tema, setTema] = useState<Tema>(temaSalvo)
  const trocarTema = () => {
    const t: Tema = tema === 'escuro' ? 'claro' : 'escuro'
    setTema(t)
    salvarTema(t)
  }

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate('/', { replace: true })
  }, [isLoading, isAuthenticated, navigate])

  // fecha o menu do celular ao trocar de página
  useEffect(() => setMenuCelular(false), [location.pathname])

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA]">
        <Loader2 className="w-6 h-6 animate-spin text-[#1E3A8A]" />
      </div>
    )
  }

  const allowed = !roles || (role !== null && roles.includes(role))
  const vePendencias = role === 'admin' || role === 'coordenador'
  const veAcompanhamento = vePendencias || role === 'administrativo'
  const papel = papelDe(user as { role?: unknown; tipo_conta?: unknown } | null)
  const userName = (user?.name as string) || (user?.email as string)?.split('@')[0] || 'Usuário'
  const foto =
    user && user.avatar ? pb.files.getURL(user, user.avatar as string, { thumb: '100x100' }) : ''

  const grupos: GrupoMenu[] = [
    {
      titulo: 'Trabalho',
      itens: [
        { to: '/dashboard', rotulo: 'Início', icone: LayoutDashboard },
        { to: '/fila', rotulo: 'Minhas tarefas', icone: ListTodo },
        { to: '/kanban', rotulo: 'Projetos', icone: KanbanSquare },
        { to: '/calendario', rotulo: 'Calendário', icone: CalendarDays },
        ...(vePendencias ? [{ to: '/falhas', rotulo: 'Pendências', icone: AlertTriangle }] : []),
      ],
    },
    ...(veAcompanhamento
      ? [
          {
            titulo: 'Acompanhamento',
            itens: [
              { to: '/painel', rotulo: 'Indicadores', icone: Gauge, end: true },
              { to: '/painel/entregas', rotulo: 'Entregas', icone: BarChart3 },
              { to: '/baseline', rotulo: 'Apontamentos', icone: Clock },
              { to: '/mudancas', rotulo: 'Registro de alterações', icone: History },
            ],
          },
        ]
      : []),
    ...(isAdmin
      ? [
          {
            titulo: 'Administração',
            itens: [
              { to: '/admin/usuarios', rotulo: 'Equipe', icone: Users },
              { to: '/admin/fluxo', rotulo: 'Etapas do projeto', icone: Workflow },
              { to: '/admin/auditoria', rotulo: 'Acessos e ações', icone: ScrollText },
              { to: '/admin/backups', rotulo: 'Cópias de segurança', icone: DatabaseBackup },
              { to: '/admin/importar-planner', rotulo: 'Importar do Planner', icone: FileUp },
            ],
          },
        ]
      : []),
  ]

  const alternarRecolhido = () => {
    const v = !recolhido
    setRecolhido(v)
    gravarRecolhido(v)
  }

  const listaMenu = (compacto: boolean) => (
    <nav className="flex flex-col gap-5">
      {grupos.map((g) => (
        <div key={g.titulo}>
          {compacto ? (
            <div className="mx-3 mb-2 border-t border-slate-200" />
          ) : (
            <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {g.titulo}
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            {g.itens.map((it) => {
              const Icone = it.icone
              return (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.end}
                  title={compacto ? it.rotulo : undefined}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-md text-sm font-medium transition-colors ${
                      compacto ? 'justify-center px-2 py-2' : 'px-3 py-2'
                    } ${
                      isActive
                        ? 'bg-blue-50 text-[#1E3A8A]'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`
                  }
                >
                  <Icone className="w-4 h-4 shrink-0" />
                  {!compacto && <span className="truncate">{it.rotulo}</span>}
                </NavLink>
              )
            })}
          </div>
        </div>
      ))}
      <div>
        {compacto ? (
          <div className="mx-3 mb-2 border-t border-slate-200" />
        ) : (
          <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Ajuda
          </div>
        )}
        <a
          href="/manual-central-gavazzi.pdf"
          target="_blank"
          rel="noopener noreferrer"
          title={compacto ? 'Manual' : undefined}
          className={`flex items-center gap-2.5 rounded-md text-sm font-medium transition-colors text-slate-600 hover:text-slate-900 hover:bg-slate-100 ${
            compacto ? 'justify-center px-2 py-2' : 'px-3 py-2'
          }`}
        >
          <BookOpen className="w-4 h-4 shrink-0" />
          {!compacto && <span className="truncate">Manual</span>}
        </a>
      </div>
    </nav>
  )

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-slate-800 flex">
      {/* Menu lateral (computador) */}
      <aside
        className={`hidden md:flex flex-col shrink-0 bg-white border-r border-slate-200 sticky top-0 h-screen transition-[width] duration-200 ${
          recolhido ? 'w-16' : 'w-60'
        }`}
      >
        <div
          className={`h-16 flex items-center border-b border-slate-200 ${
            recolhido ? 'justify-center' : 'px-4'
          }`}
        >
          {recolhido ? (
            <span className="text-lg font-extrabold text-[#1E3A8A]">G</span>
          ) : (
            <CmxLogo variant="light" size="sm" />
          )}
        </div>
        <div className="flex-1 overflow-y-auto py-4 px-2">{listaMenu(recolhido)}</div>
        <button
          type="button"
          onClick={alternarRecolhido}
          className={`h-11 border-t border-slate-200 flex items-center gap-2 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-50 ${
            recolhido ? 'justify-center' : 'px-4'
          }`}
          title={recolhido ? 'Abrir menu' : 'Recolher menu'}
        >
          {recolhido ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <>
              <PanelLeftClose className="w-4 h-4" /> Recolher menu
            </>
          )}
        </button>
      </aside>

      {/* Menu do celular */}
      <Sheet open={menuCelular} onOpenChange={setMenuCelular}>
        <SheetContent side="left" className="w-64 p-0 flex flex-col">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="h-16 flex items-center px-4 border-b border-slate-200">
            <CmxLogo variant="light" size="sm" />
          </div>
          <div className="flex-1 overflow-y-auto py-4 px-2">{listaMenu(false)}</div>
        </SheetContent>
      </Sheet>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 sm:px-8 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMenuCelular(true)}
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </Button>
            <div className="md:hidden">
              <CmxLogo variant="light" size="sm" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={trocarTema}
              title={tema === 'escuro' ? 'Usar modo claro' : 'Usar modo escuro'}
              aria-label={tema === 'escuro' ? 'Usar modo claro' : 'Usar modo escuro'}
              className="text-slate-500 hover:text-slate-900"
            >
              {tema === 'escuro' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
            <TimerTopo />
            <Notificacoes />
            <div className="hidden sm:block text-right">
              <div className="text-sm font-semibold text-slate-800 leading-tight">{userName}</div>
              <div className="text-xs text-slate-500">
                {papel ? PAPEL_LABEL[papel] : 'Sem papel'}
              </div>
            </div>
            <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center border border-blue-200 overflow-hidden">
              {foto ? (
                <img src={foto} alt={userName} className="w-full h-full object-cover" />
              ) : (
                <User className="w-4 h-4" />
              )}
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
        <main
          className={`flex-1 w-full mx-auto p-4 sm:p-8 min-w-0 ${largo ? 'max-w-[1800px]' : 'max-w-6xl'}`}
        >
          {allowed ? <Outlet /> : <AcessoNegado />}
        </main>
      </div>
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
