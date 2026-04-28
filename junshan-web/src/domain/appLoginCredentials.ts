/**
 * 站內登入預設帳密（寫在程式內；僅適合內部使用，勿當成高強度保護）。
 * 若要更換請改此檔並重新建置。
 */
export const APP_LOGIN_DEFAULT_USER = 'howard07'
export const APP_LOGIN_DEFAULT_PASSWORD = '900307ab'

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

export function verifyAppLogin(user: string, password: string): boolean {
  return (
    timingSafeEqualStrings(user.trim(), APP_LOGIN_DEFAULT_USER) &&
    timingSafeEqualStrings(password, APP_LOGIN_DEFAULT_PASSWORD)
  )
}

export function readLoginSessionOk(): boolean {
  clearLegacyStorage()
  try {
    return sessionStorage.getItem(SS_SESSION) === '1'
  } catch {
    return false
  }
}

export function writeLoginSessionOk(): void {
  try {
    sessionStorage.setItem(SS_SESSION, '1')
  } catch {
    /* ignore */
  }
}

export function clearLoginSession(): void {
  try {
    sessionStorage.removeItem(SS_SESSION)
  } catch {
    /* ignore */
  }
}
