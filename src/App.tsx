/* Main App Component - Handles routing (using react-router-dom), query client and other providers - use this file to add all routes */
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import Index from './pages/Index'
import Dashboard from './pages/Dashboard'
import NotFound from './pages/NotFound'
import ResetPassword from './pages/ResetPassword'
import OAuth2Redirect from './pages/OAuth2Redirect'
import ProjetoDetalhe from './pages/ProjetoDetalhe'
import ProjetoNovo from './pages/ProjetoNovo'
import Usuarios from './pages/admin/Usuarios'
import Auditoria from './pages/admin/Auditoria'
import Fluxo from './pages/admin/Fluxo'
import Kanban from './pages/Kanban'
import Calendario from './pages/Calendario'
import PainelEntregas from './pages/PainelEntregas'
import Fila from './pages/Fila'
import Falhas from './pages/Falhas'
import Baseline from './pages/Baseline'
import Painel from './pages/Painel'
import Mudancas from './pages/Mudancas'
import Backups from './pages/admin/Backups'
import ImportarPlanner from './pages/admin/ImportarPlanner'
import Layout from './components/Layout'
import AppShell from './components/AppShell'

// ONLY IMPORT AND RENDER WORKING PAGES, NEVER ADD PLACEHOLDER COMPONENTS OR PAGES IN THIS FILE
// AVOID REMOVING ANY CONTEXT PROVIDERS FROM THIS FILE (e.g. TooltipProvider, Toaster, Sonner)

const App = () => (
  <BrowserRouter>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Index />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/api/oauth2-redirect" element={<OAuth2Redirect />} />
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/projetos/novo" element={<ProjetoNovo />} />
            <Route path="/projetos/:id" element={<ProjetoDetalhe />} />
            <Route path="/fila" element={<Fila />} />
          </Route>
          <Route element={<AppShell largo />}>
            <Route path="/kanban" element={<Kanban />} />
            <Route path="/calendario" element={<Calendario />} />
          </Route>
          <Route element={<AppShell roles={['admin', 'coordenador']} />}>
            <Route path="/falhas" element={<Falhas />} />
          </Route>
          <Route element={<AppShell roles={['admin', 'coordenador', 'administrativo']} />}>
            <Route path="/mudancas" element={<Mudancas />} />
            <Route path="/baseline" element={<Baseline />} />
            <Route path="/painel" element={<Painel />} />
            <Route path="/painel/entregas" element={<PainelEntregas />} />
          </Route>
          <Route element={<AppShell roles={['admin']} />}>
            <Route path="/admin/usuarios" element={<Usuarios />} />
            <Route path="/admin/auditoria" element={<Auditoria />} />
            <Route path="/admin/fluxo" element={<Fluxo />} />
            <Route path="/admin/backups" element={<Backups />} />
            <Route path="/admin/importar-planner" element={<ImportarPlanner />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES MUST BE ADDED HERE */}
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </TooltipProvider>
  </BrowserRouter>
)

export default App
