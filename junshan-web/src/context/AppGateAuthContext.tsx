import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  clearLoginSession,
  readLoginSessionRole,
  verifyAppLogin,
  writeLoginSessionOk,
  type AppLoginRole,
} from '../domain/appLoginCredentials'

export type AppGateAuthContextValue = {
  isUnlocked: boolean
  role: AppLoginRole | null
  /** 管理者 howard07 可改寫全站；訪客唯讀 */
  canEdit: boolean
  tryLogin: (user: string, password: string) => boolean
  logout: () => void
}

const AppGateAuthContext = createContext<AppGateAuthContextValue | null>(null)

export function AppGateAuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<AppLoginRole | null>(() => readLoginSessionRole())

  const tryLogin = useCallback((user: string, password: string) => {
    const r = verifyAppLogin(user, password)
    if (r === null) return false
    writeLoginSessionOk(r)
    setRole(r)
    return true
  }, [])

  const logout = useCallback(() => {
    clearLoginSession()
    setRole(null)
  }, [])

  const value = useMemo<AppGateAuthContextValue>(
    () => ({
      isUnlocked: role !== null,
      role,
      canEdit: role === 'admin',
      tryLogin,
      logout,
    }),
    [role, tryLogin, logout],
  )

  return <AppGateAuthContext.Provider value={value}>{children}</AppGateAuthContext.Provider>
}

export function useAppGateAuth(): AppGateAuthContextValue {
  const v = useContext(AppGateAuthContext)
  if (!v) {
    throw new Error('useAppGateAuth 須在 AppGateAuthProvider 內使用')
  }
  return v
}
