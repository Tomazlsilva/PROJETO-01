import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import type { RecordModel } from 'pocketbase'
import { asRole, type Role } from '@/lib/permissions'

// Sessão (SPEC-1-001): validade absoluta de 8h definida no servidor no login.
// A renovação troca o token (o anterior deixa de valer) e nunca estende as 8h.
const REFRESH_INTERVAL_MS = 30 * 60 * 1000
export const SESSION_ENDED_KEY = 'central_session_ended'

interface AuthContextType {
  user: RecordModel | null
  role: Role | null
  isAdmin: boolean
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, pass: string) => Promise<RecordModel>
  logout: () => void
  requestPasswordReset: (email: string) => Promise<void>
  confirmPasswordReset: (token: string, password: string, passwordConfirm: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function sessionExpiry(record: RecordModel | null): number | null {
  const raw = record?.session_expires_at as string | undefined
  if (!raw) return null
  const t = new Date(raw.replace(' ', 'T')).getTime()
  return Number.isFinite(t) ? t : null
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<RecordModel | null>(() => pb.authStore.record)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const endSession = useCallback((reason?: string) => {
    if (reason) {
      try {
        sessionStorage.setItem(SESSION_ENDED_KEY, reason)
      } catch {
        // armazenamento indisponível: segue sem a mensagem
      }
    }
    pb.authStore.clear()
    setUser(null)
  }, [])

  const refresh = useCallback(async () => {
    if (!pb.authStore.isValid) return
    try {
      const res = await pb.collection('users').authRefresh()
      setUser(res.record)
    } catch (err) {
      const status = (err as { status?: number })?.status
      if (status === 401 || status === 403 || status === 404) {
        endSession('Sua sessão terminou. Entre novamente.')
      }
    }
  }, [endSession])

  // Validação inicial: confirma com o servidor (conta revogada/sessão vencida saem aqui)
  useEffect(() => {
    const unsubscribe = pb.authStore.onChange((_token, model) => setUser(model))
    const init = async () => {
      if (pb.authStore.isValid) {
        await refresh()
      } else {
        pb.authStore.clear()
        setUser(null)
      }
      setIsLoading(false)
    }
    void init()
    return () => unsubscribe()
  }, [refresh])

  // Renovação periódica enquanto a aba estiver aberta
  useEffect(() => {
    if (!user) return
    const id = setInterval(() => void refresh(), REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [user, refresh])

  // Encerra exatamente no fim das 8h
  useEffect(() => {
    if (expiryTimer.current) clearTimeout(expiryTimer.current)
    const exp = sessionExpiry(user)
    if (!user || !exp) return
    const ms = exp - Date.now()
    if (ms <= 0) {
      endSession('Sua sessão de 8 horas terminou. Entre novamente.')
      return
    }
    expiryTimer.current = setTimeout(
      () => endSession('Sua sessão de 8 horas terminou. Entre novamente.'),
      Math.min(ms, 2_147_000_000),
    )
    return () => {
      if (expiryTimer.current) clearTimeout(expiryTimer.current)
    }
  }, [user, endSession])

  const login = async (email: string, pass: string): Promise<RecordModel> => {
    const authData = await pb.collection('users').authWithPassword(email.trim(), pass)
    setUser(authData.record)
    return authData.record
  }

  const logout = () => endSession()

  const requestPasswordReset = async (email: string): Promise<void> => {
    await pb.collection('users').requestPasswordReset(email.trim())
  }

  const confirmPasswordReset = async (
    token: string,
    password: string,
    passwordConfirm: string,
  ): Promise<void> => {
    await pb.collection('users').confirmPasswordReset(token, password, passwordConfirm)
  }

  const role = asRole(user?.role)

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAdmin: role === 'admin',
        isLoading,
        isAuthenticated: !!user && pb.authStore.isValid,
        login,
        logout,
        requestPasswordReset,
        confirmPasswordReset,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider')
  }
  return context
}
