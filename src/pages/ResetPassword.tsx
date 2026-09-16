import React, { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { confirmPasswordReset } = useAuth()
  const token = useMemo(() => searchParams.get('token')?.trim() ?? '', [searchParams])
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const validate = () => {
    if (!token) return 'Este link de redefinição é inválido ou está incompleto.'
    if (password.length < 12) return 'A senha deve ter pelo menos 12 caracteres.'
    if (password !== passwordConfirm) return 'As senhas não coincidem.'
    return null
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      await confirmPasswordReset(token, password, passwordConfirm)
      setIsSuccess(true)
    } catch {
      setError('Este link é inválido, expirou ou já foi utilizado. Solicite uma nova redefinição.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#F5F7FA] px-4 py-8 text-slate-800">
      <main className="w-full max-w-md bg-white rounded-2xl border border-slate-200/80 shadow-[0_10px_35px_-5px_rgba(15,23,42,0.08)] p-6 sm:p-10">
        {isSuccess ? (
          <section className="flex flex-col items-center text-center space-y-4" aria-live="polite">
            <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900">Senha redefinida</h1>
            <p className="text-sm text-slate-500 leading-relaxed">
              Sua senha foi atualizada. Você já pode entrar no sistema com a nova senha.
            </p>
            <Button
              type="button"
              onClick={() => navigate('/')}
              className="w-full h-11 bg-[#1E3A8A] hover:bg-[#1E2A6B] text-white font-semibold rounded-lg"
            >
              Ir para o login
            </Button>
          </section>
        ) : (
          <section>
            <div className="space-y-2 mb-7">
              <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center mb-4">
                <KeyRound className="w-5 h-5" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.03em] text-slate-900">
                Redefinir senha
              </h1>
              <p className="text-sm text-slate-500 leading-relaxed">
                Crie uma nova senha com pelo menos 12 caracteres.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 text-sm"
              >
                <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
                <span className="leading-snug font-medium">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="new-password" className="text-sm font-semibold text-slate-700">
                  Nova senha
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={12}
                  required
                  disabled={isSubmitting}
                  className="h-12 text-[15px] rounded-lg border-slate-300 focus-visible:ring-[#1E3A8A]/20 focus-visible:border-[#1E3A8A]"
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="new-password-confirm"
                  className="text-sm font-semibold text-slate-700"
                >
                  Confirmar nova senha
                </Label>
                <Input
                  id="new-password-confirm"
                  type="password"
                  value={passwordConfirm}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  autoComplete="new-password"
                  minLength={12}
                  required
                  disabled={isSubmitting}
                  className="h-12 text-[15px] rounded-lg border-slate-300 focus-visible:ring-[#1E3A8A]/20 focus-visible:border-[#1E3A8A]"
                />
              </div>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-12 bg-[#1E3A8A] hover:bg-[#1E2A6B] text-white font-semibold rounded-lg"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando...
                  </span>
                ) : (
                  'Salvar nova senha'
                )}
              </Button>
            </form>
          </section>
        )}
      </main>
    </div>
  )
}
