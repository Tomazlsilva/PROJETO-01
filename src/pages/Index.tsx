import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useAuth, SESSION_ENDED_KEY } from '@/contexts/AuthContext'
import { CmxLogo } from '@/components/CmxLogo'
import { LOGO_GAVAZZI } from '@/assets/marcaGavazzi'
import { ForgotPasswordModal } from '@/components/ForgotPasswordModal'

const REMEMBER_EMAIL_KEY = 'cmx_remember_email'

export default function Index() {
  const navigate = useNavigate()
  const {
    login,
    loginWithProvider,
    listLoginProviders,
    isAuthenticated,
    isLoading: authChecking,
  } = useAuth()
  const [provedores, setProvedores] = useState<{ name: string; displayName: string }[]>([])
  const [entrandoCom, setEntrandoCom] = useState<string | null>(null)

  // Form states
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)

  // Validation & error states
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [shakeFields, setShakeFields] = useState(false)

  // Modal forgot password
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false)

  // Redireciona se já estiver autenticado
  useEffect(() => {
    if (!authChecking && isAuthenticated) {
      navigate('/dashboard', { replace: true })
    }
  }, [authChecking, isAuthenticated, navigate])

  // Mostra o motivo quando a sessão foi encerrada (8h, revogação ou nova senha)
  useEffect(() => {
    try {
      const motivo = sessionStorage.getItem(SESSION_ENDED_KEY)
      if (motivo) {
        setServerError(motivo)
        sessionStorage.removeItem(SESSION_ENDED_KEY)
      }
    } catch {
      // armazenamento indisponível
    }
  }, [])

  // Botões de login por conta corporativa (aparecem quando configurados no Skip Cloud)
  useEffect(() => {
    void listLoginProviders().then(setProvedores)
  }, [listLoginProviders])

  // Sem provedor configurado ainda, o botão aparece mas só avisa
  const botoesLogin = provedores.length > 0 ? provedores : [{ name: '', displayName: 'Microsoft' }]

  const entrarComProvedor = async (provider: string) => {
    setServerError(null)
    if (!provider) {
      setServerError(
        'O login com a conta Microsoft ainda está sendo configurado. Por enquanto, entre com e-mail e senha.',
      )
      return
    }
    setEntrandoCom(provider)
    try {
      await loginWithProvider(provider)
      navigate('/dashboard')
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status
      setServerError(
        status === 400
          ? 'Acesso não liberado para esta conta. Fale com o administrador.'
          : 'Não foi possível entrar com a conta corporativa. Se a janela foi bloqueada, permita pop-ups e tente de novo.',
      )
    } finally {
      setEntrandoCom(null)
    }
  }

  // Carrega e-mail persistido do localStorage
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY)
      if (savedEmail) {
        setEmail(savedEmail)
        setRememberMe(true)
      }
    } catch {
      // Ignora erro de localStorage desabilitado em modo anônimo
    }
  }, [])

  // Validações client-side
  const validateEmail = (val: string): string | null => {
    const trimmed = val.trim()
    if (!trimmed) {
      return 'Informe um e-mail válido.'
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmed)) {
      return 'Informe um e-mail válido.'
    }
    return null
  }

  const validatePassword = (val: string): string | null => {
    if (!val || val.length < 8) {
      return 'A senha deve ter pelo menos 8 caracteres.'
    }
    return null
  }

  const handleEmailBlur = () => {
    if (email || hasSubmitted) {
      setEmailError(validateEmail(email))
    }
  }

  const handlePasswordBlur = () => {
    if (password || hasSubmitted) {
      setPasswordError(validatePassword(password))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setHasSubmitted(true)
    setServerError(null)

    const eErr = validateEmail(email)
    const pErr = validatePassword(password)

    setEmailError(eErr)
    setPasswordError(pErr)

    if (eErr || pErr) {
      // Ativa efeito de shake
      setShakeFields(true)
      setTimeout(() => setShakeFields(false), 350)
      return
    }

    setIsSubmitting(true)

    try {
      await login(email, password)

      // Se "Lembrar de mim" selecionado, persiste e-mail
      try {
        if (rememberMe) {
          localStorage.setItem(REMEMBER_EMAIL_KEY, email.trim())
        } else {
          localStorage.removeItem(REMEMBER_EMAIL_KEY)
        }
      } catch {
        // Fallback silencioso
      }

      navigate('/dashboard')
    } catch (err: unknown) {
      // Mensagem única: não revela se a conta existe, está bloqueada ou revogada
      let message =
        'Não foi possível entrar. Verifique e-mail e senha. Após 5 tentativas inválidas o acesso fica bloqueado por 15 minutos.'
      if (err instanceof Error) {
        if (
          err.message.includes('Failed to fetch') ||
          err.message.includes('NetworkError') ||
          err.name === 'ClientResponseError 0'
        ) {
          message = 'Não foi possível conectar ao servidor. Tente novamente.'
        }
      }
      setServerError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#F5F7FA] text-slate-800">
      {/* ============================================================== */}
      {/* COLUNA ESQUERDA — MARCA GAVAZZI (azul da marca #284480)          */}
      {/* ============================================================== */}
      <div className="hidden lg:flex lg:w-[48%] xl:w-[50%] bg-[linear-gradient(160deg,#284480_0%,#1F3768_45%,#172A52_100%)] text-white flex-col justify-between p-12 xl:p-16 relative overflow-hidden select-none">
        {/* Elementos visuais decorativos de fundo */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-white/[0.06] blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 -right-32 w-96 h-96 rounded-full bg-white/5 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 left-1/3 w-80 h-80 rounded-full bg-white/[0.04] blur-2xl pointer-events-none" />

        {/* Linhas de grid sutil (estética técnica) */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Centro: só o logo, em cartão branco, e a identificação do sistema */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-7">
          <div className="bg-white rounded-[28px] px-10 py-8 shadow-[0_20px_50px_rgba(0,0,0,0.35)] ring-1 ring-white/30">
            <img
              src={LOGO_GAVAZZI}
              alt="Gavazzi Engenharia"
              className="h-[280px] xl:h-[395px] w-auto"
            />
          </div>
          <p className="text-white/85 text-[17px] tracking-[0.02em]">
            Central de Gestão da Produção Técnica
          </p>
        </div>

        {/* Rodapé da coluna esquerda */}
        <div className="relative z-10 pt-6 border-t border-white/15 flex items-center justify-between text-xs text-white/60">
          <span>&copy; {new Date().getFullYear()} Gavazzi Engenharia</span>
          <span className="text-[11px]">Central Gavazzi</span>
        </div>
      </div>

      {/* ============================================================== */}
      {/* COLUNA DIREITA — FORMULÁRIO DE LOGIN                             */}
      {/* ============================================================== */}
      <div className="flex-1 flex flex-col justify-center items-center px-4 py-8 sm:px-6 lg:px-12 relative min-h-screen">
        {/* Barra de marca visível apenas no mobile / telas menores */}
        <div className="lg:hidden w-full max-w-[440px] mb-8 flex items-center justify-between">
          <CmxLogo variant="light" size="md" />
          <span className="text-xs font-mono text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded">
            Acesso Restrito
          </span>
        </div>

        {/* Card do formulário de Login */}
        <div
          className={`w-full max-w-[440px] bg-white rounded-2xl border border-slate-200/80 shadow-[0_10px_35px_-5px_rgba(15,23,42,0.08)] p-6 sm:p-10 transition-all duration-300 animate-card-enter ${
            shakeFields ? 'animate-shake' : ''
          }`}
        >
          {/* Cabeçalho do Card */}
          <div className="space-y-2 mb-7">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.03em] text-[#1E293B]">
              Acesse sua conta
            </h2>
            <p className="text-sm text-[#64748B] leading-relaxed">
              Bem-vindo à Central Gavazzi. Entre para acompanhar seus projetos.
            </p>
          </div>

          {/* Alerta de erro do servidor */}
          {serverError && (
            <div
              role="alert"
              className="mb-6 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 text-sm animate-in fade-in slide-in-from-top-2"
            >
              <AlertCircle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
              <div className="flex-1 leading-snug font-medium">{serverError}</div>
            </div>
          )}

          {/* Login pela conta corporativa (Microsoft) */}
          {botoesLogin.length > 0 && (
            <div className="mb-6 space-y-3">
              {botoesLogin.map((p) => (
                <Button
                  key={p.name || 'microsoft'}
                  type="button"
                  variant="outline"
                  disabled={isSubmitting || entrandoCom !== null}
                  onClick={() => void entrarComProvedor(p.name)}
                  className="w-full h-12 text-[15px] font-semibold border-slate-300 rounded-lg flex items-center justify-center gap-2.5"
                >
                  {entrandoCom !== null && entrandoCom === p.name ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <svg viewBox="0 0 21 21" className="w-4 h-4" aria-hidden="true">
                      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                    </svg>
                  )}
                  <span>Entrar com {p.displayName || 'Microsoft'}</span>
                </Button>
              ))}
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="flex-1 h-px bg-slate-200" />
                ou entre com e-mail e senha
                <span className="flex-1 h-px bg-slate-200" />
              </div>
            </div>
          )}

          {/* Formulário */}
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Campo E-mail */}
            <div className="space-y-1.5">
              <Label
                htmlFor="login-email"
                className="text-sm font-semibold text-slate-700 flex items-center justify-between"
              >
                <span>E-mail</span>
              </Label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <Input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (emailError) setEmailError(null)
                    if (serverError) setServerError(null)
                  }}
                  onBlur={handleEmailBlur}
                  placeholder="voce@gavazziengenharia.com.br"
                  autoComplete="email"
                  required
                  disabled={isSubmitting}
                  className={`pl-10 h-12 text-[15px] rounded-lg transition-all ${
                    emailError
                      ? 'border-red-500 focus-visible:ring-red-400 focus-visible:border-red-500'
                      : 'border-slate-300 focus-visible:ring-[#1E3A8A]/20 focus-visible:border-[#1E3A8A]'
                  }`}
                />
              </div>
              {emailError && (
                <p className="text-xs font-medium text-red-600 flex items-center gap-1.5 pt-0.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{emailError}</span>
                </p>
              )}
            </div>

            {/* Campo Senha */}
            <div className="space-y-1.5">
              <Label htmlFor="login-password" className="text-sm font-semibold text-slate-700">
                Senha
              </Label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <Input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (passwordError) setPasswordError(null)
                    if (serverError) setServerError(null)
                  }}
                  onBlur={handlePasswordBlur}
                  placeholder="Digite sua senha"
                  autoComplete="current-password"
                  required
                  disabled={isSubmitting}
                  className={`pl-10 pr-11 h-12 text-[15px] rounded-lg transition-all ${
                    passwordError
                      ? 'border-red-500 focus-visible:ring-red-400 focus-visible:border-red-500'
                      : 'border-slate-300 focus-visible:ring-[#1E3A8A]/20 focus-visible:border-[#1E3A8A]'
                  }`}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-md focus:outline-none focus:ring-1 focus:ring-[#1E3A8A]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordError && (
                <p className="text-xs font-medium text-red-600 flex items-center gap-1.5 pt-0.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{passwordError}</span>
                </p>
              )}
            </div>

            {/* Linha "Lembrar de mim" e "Esqueci a senha?" */}
            <div className="flex items-center justify-between pt-1 text-sm">
              <label
                htmlFor="remember-me"
                className="flex items-center gap-2 cursor-pointer select-none text-slate-600 hover:text-slate-800"
              >
                <Checkbox
                  id="remember-me"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                  disabled={isSubmitting}
                  className="border-slate-300 data-[state=checked]:bg-[#1E3A8A] data-[state=checked]:border-[#1E3A8A] transition-all rounded"
                />
                <span className="text-[13px] font-medium">Lembrar de mim</span>
              </label>

              <button
                type="button"
                onClick={() => setIsForgotModalOpen(true)}
                className="text-[13px] font-semibold text-[#1E3A8A] hover:text-[#1E2A6B] hover:underline transition-colors focus:outline-none focus:underline"
              >
                Esqueci a senha?
              </button>
            </div>

            {/* Botão Submit "Entrar" */}
            <div className="pt-2">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-12 bg-[#1E3A8A] hover:bg-[#1E2A6B] active:scale-[0.98] text-white font-semibold text-[15px] rounded-lg shadow-[0_4px_12px_rgba(30,58,138,0.25)] hover:shadow-[0_6px_16px_rgba(30,58,138,0.35)] hover:scale-[1.01] transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-70 disabled:hover:scale-100 disabled:shadow-none"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Entrando...</span>
                  </>
                ) : (
                  <>
                    <span>Entrar</span>
                    <ArrowRight className="w-4 h-4 ml-0.5 opacity-80" />
                  </>
                )}
              </Button>
            </div>
          </form>

          {/* Rodapé do formulário: Acesso restrito */}
          <div className="mt-8 pt-5 border-t border-slate-100 text-center">
            <p className="text-xs text-[#64748B] flex items-center justify-center gap-1.5 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
              Acesso restrito — Somente usuários autorizados.
            </p>
          </div>
        </div>
      </div>

      {/* Modal Esqueci a Senha */}
      <ForgotPasswordModal
        isOpen={isForgotModalOpen}
        onClose={() => setIsForgotModalOpen(false)}
        defaultEmail={email}
      />
    </div>
  )
}
