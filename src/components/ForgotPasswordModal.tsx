import React, { useState, useEffect } from 'react'
import { Mail, Loader2, CheckCircle2, X, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'

interface ForgotPasswordModalProps {
  isOpen: boolean
  onClose: () => void
  defaultEmail?: string
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  isOpen,
  onClose,
  defaultEmail = '',
}) => {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState(defaultEmail)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  // Atualiza com email default ao abrir
  useEffect(() => {
    if (isOpen) {
      setEmail(defaultEmail)
      setError(null)
      setIsSuccess(false)
      setIsLoading(false)
    }
  }, [isOpen, defaultEmail])

  // Listener para fechar com tecla ESC
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const validateEmail = (val: string) => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validationError = validateEmail(email)
    if (validationError) {
      setError(validationError)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      await requestPasswordReset(email)
      setIsSuccess(true)
    } catch (err: unknown) {
      // Resposta uniforme: nunca revela se o e-mail tem conta. Só falha de rede aparece.
      const status =
        err && typeof err === 'object' && 'status' in err
          ? (err as { status?: number }).status
          : undefined
      if (status === 0 || status === undefined) {
        setError('Não foi possível conectar ao servidor. Tente novamente.')
      } else {
        setIsSuccess(true)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-200 animate-in fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="forgot-password-title"
    >
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 sm:p-8 text-slate-800 transition-all transform animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botão fechar (X) */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar modal"
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 rounded-lg p-1 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
        >
          <X className="w-5 h-5" />
        </button>

        {isSuccess ? (
          /* Estado de sucesso */
          <div className="flex flex-col items-center text-center py-4 space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center animate-check-pop border border-emerald-200">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-xl font-bold tracking-tight text-slate-900">Link enviado!</h3>
              <p className="text-sm text-slate-500 max-w-xs">
                Se houver uma conta com esse e-mail, enviaremos um link para redefinir a senha. O
                link vale por 15 minutos e só pode ser usado uma vez.
              </p>
            </div>

            <div className="w-full pt-3">
              <Button
                type="button"
                onClick={onClose}
                className="w-full h-11 bg-[#1E3A8A] hover:bg-[#1E2A6B] text-white font-semibold rounded-lg shadow-sm transition-all"
              >
                Fechar
              </Button>
            </div>
          </div>
        ) : (
          /* Formulário de recuperação */
          <div>
            <div className="space-y-2 mb-6">
              <h2
                id="forgot-password-title"
                className="text-2xl font-bold tracking-tight text-slate-900"
              >
                Recuperar senha
              </h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                Informe seu e-mail cadastrado e enviaremos um link para redefinir sua senha.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div className="space-y-2">
                <Label htmlFor="forgot-email" className="text-sm font-medium text-slate-700">
                  E-mail cadastrado
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <Input
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (error) setError(null)
                    }}
                    placeholder="voce@empresa.com.br"
                    autoFocus
                    className={`pl-10 h-11 text-[15px] transition-all rounded-lg ${
                      error
                        ? 'border-red-500 focus-visible:ring-red-400'
                        : 'border-slate-300 focus-visible:ring-[#1E3A8A] focus-visible:border-[#1E3A8A]'
                    }`}
                  />
                </div>
                {error && (
                  <p className="text-xs font-medium text-red-600 flex items-center gap-1.5 mt-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{error}</span>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isLoading}
                  className="w-1/3 h-11 text-slate-700 border-slate-300 hover:bg-slate-50 font-medium rounded-lg"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-2/3 h-11 bg-[#1E3A8A] hover:bg-[#1E2A6B] text-white font-semibold rounded-lg shadow-sm transition-all"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Enviando...</span>
                    </span>
                  ) : (
                    'Enviar link'
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
