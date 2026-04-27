import { migrateAppState, type AppState } from '../domain/appState'
import { stringifyAppBackup } from '../domain/appStateBackup'

const BASE = 'https://api.jsonbin.io/v3/b'

function binId(): string {
  return (import.meta.env.VITE_JSONBIN_BIN_ID ?? '').trim()
}

/** 官方顯示的 X-MASTER-KEY 為完整 bcrypt 字串（約 60 字、以 $2a$10$ 等開頭） */
function looksLikeJsonBinMasterKey(s: string): boolean {
  if (s.length < 50) return false
  return /^\$2[aby]\$\d{2}\$/.test(s)
}

/** 優先讀 Base64，避免 .env 內 $ 被展開、也避免 O/0 手誤。 */
function masterKey(): string {
  const b64 = (import.meta.env.VITE_JSONBIN_X_MASTER_KEY_B64 ?? '')
    .replace(/[\r\n\t ]/g, '')
    .trim()
  if (b64) {
    try {
      const raw = atob(b64)
      if (!looksLikeJsonBinMasterKey(raw)) {
        return ''
      }
      return raw
    } catch {
      return ''
    }
  }
  const plain = (import.meta.env.VITE_JSONBIN_X_MASTER_KEY ?? '').trim()
  if (plain) {
    return looksLikeJsonBinMasterKey(plain) ? plain : ''
  }
  return ''
}

export function isJsonBinConfigured(): boolean {
  return Boolean(binId() && masterKey())
}

function rawB64(): string {
  return (import.meta.env.VITE_JSONBIN_X_MASTER_KEY_B64 ?? '').replace(/[\r\n\t ]/g, '').trim()
}
function rawPlainKey(): string {
  return (import.meta.env.VITE_JSONBIN_X_MASTER_KEY ?? '').trim()
}

/** 有填 Bin id 與金鑰欄位，即顯示 JSONBin 列（金鑰格式錯也顯示，以便露錯誤） */
export function hasJsonBinEnvIntent(): boolean {
  return Boolean(binId() && (rawB64() || rawPlainKey()))
}

/**
 * 有填寫欄但無法得到合法 X-MASTER-KEY 時的說明：常見為 Base64 只轉了半條、漏了 $2a$10$ 前綴。
 */
export function getJsonBinKeyErrorMessage(): string | null {
  if (!hasJsonBinEnvIntent() || isJsonBinConfigured()) return null
  if (rawB64()) {
    let dec: string
    try {
      dec = atob(rawB64())
    } catch {
      return 'VITE_JSONBIN_X_MASTER_KEY_B64 不是有效的 Base64。'
    }
    if (!looksLikeJsonBinMasterKey(dec)) {
      return `金鑰 Base64 內容不對。常見原因：\n(1) 只轉了半條、漏了 $2a$10$ 前綴。\n(2) PowerShell 用「雙引號」包住金鑰：雙引號內的 $ 會被當變數展開，金鑰就壞了。請改用「單引號」整段包住官網複製的一行，例如：\n[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('從官網貼在單引號內，含$也原樣保留'))`
    }
  }
  if (rawPlainKey() && !looksLikeJsonBinMasterKey(rawPlainKey())) {
    return 'VITE_JSONBIN_X_MASTER_KEY 不是完整一條（需像官網顯示的約 60 字、$2a$10$ 開頭）。'
  }
  return '金鑰無法使用，請檢查 .env。'
}

/**
 * 從 JSONBin 的 record 解出要交給 {@link migrateAppState} 的物件。
 * 支援與匯出備份相同之外層 `{ app, version, data }`，或整包即 AppState。
 */
function extractAppStatePayload(record: unknown): unknown {
  if (record == null || typeof record !== 'object') return null
  const o = record as Record<string, unknown>
  if (o.data !== undefined && typeof o.data === 'object' && o.data !== null) {
    return o.data
  }
  return record
}

function isUsableAppPayload(loaded: unknown): boolean {
  if (!loaded || typeof loaded !== 'object') return false
  const d = loaded as Record<string, unknown>
  if (!d.salaryBook || typeof d.salaryBook !== 'object') return false
  const months = (d.salaryBook as { months?: unknown }).months
  return Array.isArray(months)
}

/**
 * 讀取雲端 record；回傳可套用之 AppState，若尚無有效資料則回傳 null。
 */
export async function downloadAppStateFromJsonBin(): Promise<AppState | null> {
  if (!isJsonBinConfigured()) return null
  const id = binId()
  const key = masterKey()
  const res = await fetch(`${BASE}/${id}/latest`, {
    method: 'GET',
    headers: { 'X-Master-Key': key },
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `JSONBin 讀取失敗：${res.status}`)
  }
  const j = (await res.json()) as { record?: unknown }
  const record = j.record !== undefined ? j.record : (j as unknown)
  const payload = extractAppStatePayload(record)
  if (payload == null || !isUsableAppPayload(payload)) return null
  return migrateAppState(payload)
}

export async function uploadAppStateToJsonBin(state: AppState): Promise<void> {
  if (!isJsonBinConfigured()) return
  const id = binId()
  const key = masterKey()
  const body = stringifyAppBackup(state)
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': key,
    },
    body,
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `JSONBin 寫入失敗：${res.status}`)
  }
}
