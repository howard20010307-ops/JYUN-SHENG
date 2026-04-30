import { migrateAppState, type AppState } from '../domain/appState'
import { assertJsonBinBackupWireStringComplete, stringifyAppBackupCompact, stringifyAppBackupFingerprint } from '../domain/appStateBackup'

const BASE = 'https://api.jsonbin.io/v3/b'

/** 免費帳戶單一 Bin 約 100KB 上限；壓縮後仍超過則建議升級或刪減本機月表內容 */
const JSONBIN_FREE_MAX_BYTES = 99_000

/** 本機 localStorage：上次自動上傳 JSONBin 成功時間（ISO），重新整理後仍顯示 */
const LOCALSTORAGE_LAST_UPLOAD_OK_AT = 'junshan.jsonBin.lastUploadSuccessAt'
/** 含收帳筆數之上傳紀錄（新） */
const LOCALSTORAGE_LAST_UPLOAD_META = 'junshan.jsonBin.lastUploadMeta'

export type JsonBinLastUploadMeta = {
  at: Date | null
  receivablesCount: number | null
  /**
   * 與 {@link stringifyAppBackupFingerprint} 產生字串（UTF-8）之 SHA-256 hex；
   * 與當前相同時略過 PUT（`exportedAt` 不納入指紋）。
   */
  wireSha256Hex: string | null
}

function parseWireSha256Hex(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase()
  return /^[0-9a-f]{64}$/.test(s) ? s : null
}

export function readLastJsonBinUploadMeta(): JsonBinLastUploadMeta {
  if (typeof localStorage === 'undefined') {
    return { at: null, receivablesCount: null, wireSha256Hex: null }
  }
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_LAST_UPLOAD_META)
    if (raw != null && raw.trim() !== '') {
      const o = JSON.parse(raw) as {
        at?: string
        receivablesCount?: number
        wireSha256Hex?: unknown
      }
      const d = typeof o.at === 'string' ? new Date(o.at) : null
      const at = d && !Number.isNaN(d.getTime()) ? d : null
      const receivablesCount =
        typeof o.receivablesCount === 'number' && Number.isFinite(o.receivablesCount)
          ? Math.max(0, Math.floor(o.receivablesCount))
          : null
      const wireSha256Hex = parseWireSha256Hex(o.wireSha256Hex)
      if (at) return { at, receivablesCount, wireSha256Hex }
    }
  } catch {
    /* ignore */
  }
  const legacy = readLastJsonBinUploadSuccessAtLegacy()
  return { at: legacy, receivablesCount: null, wireSha256Hex: null }
}

function readLastJsonBinUploadSuccessAtLegacy(): Date | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_LAST_UPLOAD_OK_AT)
    if (raw == null || raw.trim() === '') return null
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

export function readLastJsonBinUploadSuccessAt(): Date | null {
  return readLastJsonBinUploadMeta().at
}

export function writeLastJsonBinUploadMeta(
  d: Date,
  receivablesCount: number,
  wireSha256Hex: string | null = null,
): void {
  if (typeof localStorage === 'undefined') return
  try {
    const payload: Record<string, unknown> = {
      at: d.toISOString(),
      receivablesCount,
    }
    if (wireSha256Hex) payload.wireSha256Hex = wireSha256Hex
    localStorage.setItem(LOCALSTORAGE_LAST_UPLOAD_META, JSON.stringify(payload))
    localStorage.setItem(LOCALSTORAGE_LAST_UPLOAD_OK_AT, d.toISOString())
  } catch {
    /* 配額／隱私模式等 */
  }
}

/** @deprecated 請用 {@link writeLastJsonBinUploadMeta} */
export function writeLastJsonBinUploadSuccessAt(d: Date): void {
  writeLastJsonBinUploadMeta(d, 0, null)
}

/** 備份線路字串 UTF-8 之 SHA-256 hex；無 Web Crypto 時回傳 null（略過重複偵測、仍允許上傳）。 */
export async function sha256HexUtf8(text: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return null
  const buf = await subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const JUNSHAN_GZIP = 1 as const

type JsonBinRecordGzipV1 = {
  junshanJsonBin: typeof JUNSHAN_GZIP
  /** 備份 JSON（UTF-8）經 Gzip 後的 Base64 */
  g: string
}

function bytesToB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const u = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  return u
}

async function gzipTextToB64(text: string): Promise<string> {
  const C = (globalThis as unknown as { CompressionStream?: new (f: string) => TransformStream }).CompressionStream
  if (!C) {
    throw new Error(
      '此瀏覽器不支援 Gzip 壓縮；請改用最新 Chrome／Edge 或以「匯出／匯入備份」同步，或更換可支援的瀏覽器／方案。',
    )
  }
  const enc = new TextEncoder().encode(text)
  const stream = new Blob([enc]).stream().pipeThrough(new C('gzip'))
  const buf = await new Response(stream).arrayBuffer()
  return bytesToB64(new Uint8Array(buf))
}

async function gunzipB64ToText(b64: string): Promise<string> {
  const D = (globalThis as unknown as { DecompressionStream?: new (f: string) => TransformStream }).DecompressionStream
  if (!D) {
    throw new Error('此瀏覽器不支援 Gzip 解壓。')
  }
  const u = b64ToBytes(b64)
  const stream = new Blob([u as BlobPart]).stream().pipeThrough(new D('gzip'))
  return new Response(stream).text()
}

/** 將雲端 record 還原成與匯出備份相同的根物件，或舊式直接內容 */
async function jsonBinRecordToRootObject(record: unknown): Promise<unknown> {
  if (record == null || typeof record !== 'object') return record
  const o = record as Record<string, unknown>
  if (o.junshanJsonBin === JUNSHAN_GZIP && typeof o.g === 'string') {
    const text = await gunzipB64ToText(o.g)
    return JSON.parse(text) as unknown
  }
  return record
}

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
 * 內文經 {@link jsonBinRecordToRootObject} 解出與上傳相同之備份 JSON，再 {@link migrateAppState}。
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
  const root = await jsonBinRecordToRootObject(record)
  const payload = extractAppStatePayload(root)
  if (payload == null || !isUsableAppPayload(payload)) return null
  return migrateAppState(payload)
}

/**
 * JSONBin 與本機「匯出備份」共用同一條線路：
 * - **上傳**：`stringifyAppBackupCompact` → 結構校驗 → Gzip → Base64 → `PUT`；若 Gzip 解回字串與原始 JSON **逐字元相同**，則線上數值／文字在壓縮層**零損耗**。
 * - **下載**：`GET` → 解 gzip → 解析與上傳相同之 JSON → `migrateAppState` 正規化各子域（薪水／估價／收帳／日誌等）。
 */
export type JsonBinUploadResult = {
  /** 與上次成功上傳之備份字串指紋相同，已略過 PUT */
  skippedDuplicate: boolean
}

/**
 * 上傳完整狀態至 JSONBin。
 * 若與 {@link readLastJsonBinUploadMeta} 所存之 `wireSha256Hex` 相同（{@link stringifyAppBackupFingerprint} 一致），則略過 PUT。
 * 成功寫入後才更新 {@link writeLastJsonBinUploadMeta} 之時間、收帳筆數與指紋。
 */
export async function uploadAppStateToJsonBin(state: AppState): Promise<JsonBinUploadResult> {
  if (!isJsonBinConfigured()) return { skippedDuplicate: false }
  const id = binId()
  const key = masterKey()
  const raw = stringifyAppBackupCompact(state)
  assertJsonBinBackupWireStringComplete(raw)
  const fpRaw = stringifyAppBackupFingerprint(state)
  const fp = await sha256HexUtf8(fpRaw)
  const prev = readLastJsonBinUploadMeta()
  if (fp != null && prev.wireSha256Hex != null && prev.wireSha256Hex === fp) {
    return { skippedDuplicate: true }
  }
  const g = await gzipTextToB64(raw)
  const roundTrip = await gunzipB64ToText(g)
  if (roundTrip !== raw) {
    throw new Error(
      '內部錯誤：Gzip 壓縮還原後與原始備份字串不一致（全站任一欄位皆須無損），已中止上傳。請改用最新 Chrome／Edge 或匯出備份。',
    )
  }
  const wrapper: JsonBinRecordGzipV1 = { junshanJsonBin: JUNSHAN_GZIP, g }
  const body = JSON.stringify(wrapper)
  if (body.length > JSONBIN_FREE_MAX_BYTES) {
    throw new Error(
      '壓縮後仍超過 JSONBin 免費版單筆大小上限。請刪減歷史月表／備份內容、匯出備份後減量，或升級 Pro／改用其他雲端方案。',
    )
  }
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
  const d = new Date()
  const rc = state.receivables?.entries?.length ?? 0
  writeLastJsonBinUploadMeta(d, rc, fp)
  return { skippedDuplicate: false }
}
