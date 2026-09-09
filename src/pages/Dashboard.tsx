import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { CmxLogo } from '@/components/CmxLogo'
import { Button } from '@/components/ui/button'
import {
  LogOut,
  User,
  LayoutDashboard,
  Users,
  Briefcase,
  TrendingUp,
  CheckCircle2,
} from 'lucide-react'

export default function Dashboard() {
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/', { replace: true })
    }
  }, [isLoading, isAuthenticated, navigate])

  const handleLogout = () => {
    logout()
    navigate('/', { replace: true })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#1E3A8A] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Carregando painel...</p>
        </div>
      </div>
    )
  }

  const userName = (user?.name as string) || (user?.email as string)?.split('@')[0] || 'Usuário'
  const userEmail = (user?.email as string) || ''

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-slate-800 flex flex-col">
      {/* Topbar do Dashboard */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 sm:px-8 h-16 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-6">
          <CmxLogo variant="light" size="sm" />
          <div className="hidden md:flex items-center gap-1 pl-4 border-l border-slate-200 text-xs text-slate-500 font-medium">
            <LayoutDashboard className="w-3.5 h-3.5 text-blue-600" />
            <span>Visão Geral</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5 text-right">
            <div className="hidden sm:block">
              <div className="text-sm font-semibold text-slate-800 leading-tight">{userName}</div>
              <div className="text-xs text-slate-500">{userEmail}</div>
            </div>
            <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-sm border border-blue-200">
              <User className="w-4 h-4" />
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="text-slate-600 hover:text-red-600 hover:border-red-200 hover:bg-red-50 flex items-center gap-1.5 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
      </header>

      {/* Conteúdo do Dashboard autenticado */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-8 space-y-6">
        {/* Banner de Boas-vindas */}
        <div className="bg-gradient-to-r from-[#0F172A] via-[#1E293B] to-[#1E3A8A] rounded-2xl p-6 sm:p-8 text-white shadow-md relative overflow-hidden">
          <div className="relative z-10 space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-400/30">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Sessão iniciada com sucesso
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.03em]">
              Olá, {userName}! Bem-vindo ao CMX CRM.
            </h1>
            <p className="text-slate-300 text-sm sm:text-base max-w-2xl">
              Você foi autenticado com sucesso contra o PocketBase. Seus dados de pipeline, contatos
              e oportunidades comerciais estão sincronizados.
            </p>
          </div>
        </div>

        {/* Cards de Métricas do CRM */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs uppercase font-semibold text-slate-500 tracking-wider">
                Oportunidades
              </div>
              <div className="text-2xl font-extrabold text-slate-900 mt-0.5">24 ativas</div>
              <div className="text-xs text-emerald-600 font-medium mt-0.5">+12% este mês</div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
              <Briefcase className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs uppercase font-semibold text-slate-500 tracking-wider">
                Em Negociação
              </div>
              <div className="text-2xl font-extrabold text-slate-900 mt-0.5">R$ 480.000</div>
              <div className="text-xs text-slate-500 mt-0.5">Pipeline ponderado</div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs uppercase font-semibold text-slate-500 tracking-wider">
                Clientes Ativos
              </div>
              <div className="text-2xl font-extrabold text-slate-900 mt-0.5">142 contas</div>
              <div className="text-xs text-emerald-600 font-medium mt-0.5">98.5% retenção</div>
            </div>
          </div>
        </div>

        {/* Caixa de detalhes da sessão */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
          <h2 className="text-base font-bold text-slate-900">Informações do Usuário Autenticado</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-xs font-semibold text-slate-500 uppercase block">Nome</span>
              <span className="font-medium text-slate-800">{userName}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-xs font-semibold text-slate-500 uppercase block">E-mail</span>
              <span className="font-medium text-slate-800">{userEmail}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
