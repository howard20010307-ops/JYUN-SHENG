import type { AppState } from './appState'

const BACKUP_APP_ID = 'junshan-web'

export type BackupFileV1 = {
  app: typeof BACKUP_APP_ID
  version: 1
  exportedAt: string
  data: AppState
}

/** 與 {@link AppState} 對齊；上傳 JSONBin 前須全部存在於 `data` 內（含巢狀結構之最小形狀）。 */
const WIRE_DATA_KEYS: (keyof AppState)[] = [
  'tab',
  'salaryBook',
  'site',
  'quoteRows',
  'quoteRowsSchemaVersion',
  'months',
  'ledgerYear',
  'workLog',
  'receivables',
]

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function backupFilenameDate(): string {
  const d = new Date()
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`
}

/** 產生可下載的 JSON 字串（含版本與時間，與本機 localStorage 的 `data` 欄相容） */
export function stringifyAppBackup(state: AppState): string {
  const payload: BackupFileV1 = {
    app: BACKUP_APP_ID,
    version: 1,
    exportedAt: new Date().toISOString(),
    data: state,
  }
  return JSON.stringify(payload, null, 2)
}

/**
 * 供 JSONBin「與上次成功上傳是否同一資料」比對：**不含 `exportedAt`**，避免僅時間戳變動即觸發 PUT。
 * `data` 與 {@link stringifyAppBackupCompact} 語意相同；鍵順序依 `JSON.stringify(state)`。
 */
export function stringifyAppBackupFingerprint(state: AppState): string {
  return JSON.stringify({
    app: BACKUP_APP_ID,
    version: 1,
    data: state,
  })
}

/** 不換行、供 JSONBin 上傳（減小體積） */
export function stringifyAppBackupCompact(state: AppState): string {
  const payload: BackupFileV1 = {
    app: BACKUP_APP_ID,
    version: 1,
    exportedAt: new Date().toISOString(),
    data: state,
  }
  return JSON.stringify(payload)
}

/**
 * 上傳 JSONBin 前校驗：備份線路字串須為完整 `{ app, version, data }`，且 `data` 含全站欄位與必要巢狀形狀。
 * 與下載端 {@link rawDataFromBackupJson} / {@link migrateAppState} 對接之「單一真相來源」。
 */
export function assertJsonBinBackupWireStringComplete(raw: string): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    throw new Error('內部錯誤：備份字串不是有效 JSON，已中止上傳以免覆寫雲端。')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('內部錯誤：備份根物件無效，已中止上傳。')
  }
  const file = parsed as Record<string, unknown>
  if (file.app !== BACKUP_APP_ID) {
    throw new Error(`上傳中止：備份 app 須為「${BACKUP_APP_ID}」。`)
  }
  if (file.version !== 1) {
    throw new Error('上傳中止：備份 version 須為 1。')
  }
  if (typeof file.exportedAt !== 'string' || file.exportedAt.trim() === '') {
    throw new Error('上傳中止：備份缺少 exportedAt。')
  }
  if (!file.data || typeof file.data !== 'object' || file.data === null) {
    throw new Error('上傳中止：備份缺少 data（全站狀態）。')
  }
  const data = file.data as Record<string, unknown>
  for (const k of WIRE_DATA_KEYS) {
    if (!(k in data)) {
      throw new Error(`上傳中止：備份 data 缺少欄位「${String(k)}」，無法保證整站寫入 JSONBin。`)
    }
  }
  if (typeof data.tab !== 'string') {
    throw new Error('上傳中止：data.tab 無效。')
  }
  const sb = data.salaryBook
  if (!sb || typeof sb !== 'object' || !Array.isArray((sb as { months?: unknown }).months)) {
    throw new Error('上傳中止：salaryBook.months 必須為陣列。')
  }
  if (!data.site || typeof data.site !== 'object') {
    throw new Error('上傳中止：site 必須為物件。')
  }
  if (!Array.isArray(data.quoteRows)) {
    throw new Error('上傳中止：quoteRows 必須為陣列。')
  }
  const qv = data.quoteRowsSchemaVersion
  if (typeof qv !== 'number' || !Number.isFinite(qv)) {
    throw new Error('上傳中止：quoteRowsSchemaVersion 必須為有限數字。')
  }
  if (!Array.isArray(data.months)) {
    throw new Error('上傳中止：公司帳 months 必須為陣列。')
  }
  const ly = data.ledgerYear
  if (typeof ly !== 'number' || !Number.isFinite(ly)) {
    throw new Error('上傳中止：ledgerYear 必須為有限數字。')
  }
  if (!data.workLog || typeof data.workLog !== 'object') {
    throw new Error('上傳中止：workLog 必須為物件。')
  }
  const rec = data.receivables
  if (!rec || typeof rec !== 'object' || !Array.isArray((rec as { entries?: unknown }).entries)) {
    throw new Error('上傳中止：receivables.entries 必須為陣列。')
  }
}

/**
 * 解析與 {@link stringifyAppBackupCompact} 相同格式之 JSON 字串，取得 `data.receivables.entries` 筆數。
 * 回傳 -1 表示無法解析或缺收帳結構。
 */
export function receivableEntryCountInBackupJsonString(jsonText: string): number {
  try {
    const parsed = JSON.parse(jsonText) as unknown
    if (!parsed || typeof parsed !== 'object') return -1
    const o = parsed as Record<string, unknown>
    const root =
      o.data !== undefined && typeof o.data === 'object' && o.data !== null
        ? (o.data as Record<string, unknown>)
        : o
    const r = root.receivables
    if (r === undefined || r === null || typeof r !== 'object') return -1
    const ent = (r as { entries?: unknown }).entries
    if (!Array.isArray(ent)) return -1
    return ent.length
  } catch {
    return -1
  }
}

export function downloadAppBackup(state: AppState): void {
  const text = stringifyAppBackup(state)
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `junshan-web-備份-${backupFilenameDate()}.json`
  a.rel = 'noopener'
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * 從備份檔 JSON 還原出可交給 {@link migrateAppState} 的物件。
 * 接受本專案備份格式 `{ app, version, data }`，或舊版僅 `{ data }`，或整包即為 AppState。
 */
export function rawDataFromBackupJson(text: string): unknown {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    throw new Error('不是有效的 JSON 檔案。')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('備份內容必須是 JSON 物件。')
  }
  const o = parsed as Record<string, unknown>
  if (o.data !== undefined && typeof o.data === 'object' && o.data !== null) {
    if (o.app === BACKUP_APP_ID || o.app === undefined) {
      return o.data
    }
    throw new Error('此檔案不是鈞泩營運試算的備份（app 欄位不符）。')
  }
  return parsed
}
