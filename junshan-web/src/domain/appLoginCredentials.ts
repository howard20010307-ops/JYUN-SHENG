/**
 * 站內登入預設帳密（寫在程式內；僅適合內部使用，勿當成高強度保護）。
 * 若要更換請改此檔並重新建置。
 *
 * - 管理者：可編輯全站資料
 * - 訪客：僅能瀏覽（唯讀），可改此處帳密或設為與管理者相同以停用訪客入口
 */
export const APP_LOGIN_DEFAULT_USER = 'howard07'
export const APP_LOGIN_DEFAULT_PASSWORD = '900307ab'

/** 唯讀訪客（可改帳密；若與管理者帳密相同則實務上僅管理者能登入） */
export const APP_VIEWER_USER = 'guest'
export const APP_VIEWER_PASSWORD = 'guestview'

export type AppLoginRole = 'admin' | 'viewer'

/** 僅目前分頁有效，關閉分頁後須重新手動登入 */
const SS_SESSION = 'junshan-app-session'
const LEGACY_LS_SESSION = 'junshan-app-session'
const LEGACY_LS_SAVED = 'junshan-login-saved'

function clearLegacyStorage(): void {
  try {
    localStorage.removeItem(LEGACY_LS_SESSION)
    localStorage.removeItem(LEGACY_LS_SAVED)
  } catch {
    /* ignore */
  }
}

export function timingSafeEqualStrings(a: string, b: string): boolean {
  const na = a.length
  const nb = b.length
  const n = Math.max(na, nb)
  let acc = na === nb ? 0 : 1
  for (let i = 0; i < n; i++) {
    const ca = i < na ? a.charCodeAt(i)! : 0
    const cb = i < nb ? b.charCodeAt(i)! : 0
    acc |= ca ^ cb
  }
  return acc === 0
}

export function verifyAppLogin(user: string, password: string): AppLoginRole | null {
  const u = user.trim()
  if (
    timingSafeEqualStrings(u, APP_LOGIN_DEFAULT_USER) &&
    timingSafeEqualStrings(password, APP_LOGIN_DEFAULT_PASSWORD)
  ) {
    return 'admin'
  }
  if (
    timingSafeEqualStrings(u, APP_VIEWER_USER) &&
    timingSafeEqualStrings(password, APP_VIEWER_PASSWORD)
  ) {
    return 'viewer'
  }
  return null
}

const SS_ROLE = 'junshan-app-role'

export function readLoginSessionRole(): AppLoginRole | null {
  clearLegacyStorage()
  try {
    const r = sessionStorage.getItem(SS_ROLE)
    if (r === 'admin' || r === 'viewer') return r
    if (sessionStorage.getItem(SS_SESSION) === '1') {
      sessionStorage.setItem(SS_ROLE, 'admin')
      return 'admin'
    }
    return null
  } catch {
    return null
  }
}

export function writeLoginSessionOk(role: AppLoginRole): void {
  try {
    sessionStorage.setItem(SS_SESSION, '1')
    sessionStorage.setItem(SS_ROLE, role)
  } catch {
    /* ignore */
  }
}

export function clearLoginSession(): void {
  try {
    sessionStorage.removeItem(SS_SESSION)
    sessionStorage.removeItem(SS_ROLE)
  } catch {
    /* ignore */
  }
}
