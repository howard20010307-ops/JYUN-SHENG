import { migrateAppState, type AppState } from '../domain/appState'
import { stringifyAppBackup } from '../domain/appStateBackup'

const BASE = 'https://api.jsonbin.io/v3/b'

function binId(): string {
  return (import.meta.env.VITE_JSONBIN_BIN_ID ?? '').trim()
}

function masterKey(): string {
  return (import.meta.env.VITE_JSONBIN_X_MASTER_KEY ?? '').trim()
}

export function isJsonBinConfigured(): boolean {
  return Boolean(binId() && masterKey())
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
