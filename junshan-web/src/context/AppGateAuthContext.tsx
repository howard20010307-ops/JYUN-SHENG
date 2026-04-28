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
  readLoginSessionOk,
  verifyAppLogin,
  writeLoginSessionOk,
} from '../domain/appLoginCredentials'

export type AppGateAuthContextValue = {
  isUnlocked: boolean
  tryLogin: (user: string, password: string) => boolean
  logout: () => void
}

const AppGateAuthContext = createContext<AppGateAuthContextValue | null>(null)

export function AppGateAuthProvider({ children }: { children: ReactNode }) {
  const [sessionOk, setSessionOk] = useState(() => readLoginSessionOk())

  const tryLogin = useCallback((user: string, password: string) => {
    if (!verifyAppLogin(user, password)) return false
    writeLoginSessionOk()
    setSessionOk(true)
    return true
  }, [])

  const logout = useCallback(() => {
    clearLoginSession()
    setSessionOk(false)
  }, [])

  const value = useMemo<AppGateAuthContextValue>(
    () => ({
      isUnlocked: sessionOk,
      tryLogin,
      logout,
    }),
    [sessionOk, tryLogin, logout],
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
