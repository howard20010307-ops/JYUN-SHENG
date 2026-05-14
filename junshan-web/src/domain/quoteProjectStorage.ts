import { migrateQuotePersistSlice, type QuotePersistSlice } from './appState'
import type { QuoteRow, QuoteSite } from './quoteEngine'
import { allocateWithSuffix, stableHash16 } from './stableIds'

/**
 * 僅存估價專案列表；**不**與主程式 `usePersistentState` 所用鍵 `junshan-web-v1` 共用，
 * 讀寫互不覆寫。
 */
export const QUOTE_PROJECT_LOCAL_STORAGE_KEY = 'junshan-quote-projects-v1' as const

const STORAGE_KEY = QUOTE_PROJECT_LOCAL_STORAGE_KEY

/** 與 appStateBackup 備份信封之 app 欄一致時，禁止走估價匯入（應使用全站備份還原）。 */
const FULL_APP_BACKUP_ENVELOPE_APP = 'junshan-web' as const

/** 與全站備份 {@link appStateBackup} 分開；僅含放樣估價三塊。 */
export const QUOTE_PROJECT_FILE_KIND = 'junshan-quote-project' as const
export const QUOTE_PROJECT_FILE_VERSION = 1 as const

export type QuoteProjectFileV1 = {
  kind: typeof QUOTE_PROJECT_FILE_KIND
  fileVersion: typeof QUOTE_PROJECT_FILE_VERSION
  exportedAt: string
  displayName?: string
  site: QuoteSite
  quoteRows: QuoteRow[]
  quoteRowsSchemaVersion: number
}

export type QuoteProjectListEntry = {
  id: string
  name: string
  savedAt: string
} & QuotePersistSlice

type QuoteProjectStoreV1 = {
  v: 1
  /** 遞增序號，僅供產生穩定專案 id（非隨機）。 */
  seq: number
  projects: QuoteProjectListEntry[]
}

function defaultStore(): QuoteProjectStoreV1 {
  return { v: 1, seq: 0, projects: [] }
}

function parseStoredEntry(raw: unknown): QuoteProjectListEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = typeof o.id === 'string' ? o.id.trim() : ''
  const name = typeof o.name === 'string' ? o.name.trim() : ''
  if (!id || !name) return null
  const savedAt = typeof o.savedAt === 'string' ? o.savedAt : ''
  const slice = migrateQuotePersistSlice({
    site: o.site,
    quoteRows: o.quoteRows,
    quoteRowsSchemaVersion: o.quoteRowsSchemaVersion,
  })
  return {
    id,
    name,
    savedAt: savedAt || '1970-01-01T00:00:00.000Z',
    ...slice,
  }
}

function migrateStore(raw: unknown): QuoteProjectStoreV1 {
  if (!raw || typeof raw !== 'object') return defaultStore()
  const o = raw as Record<string, unknown>
  if (o.v !== 1 || !Array.isArray(o.projects)) return defaultStore()
  const seqRaw = o.seq
  const seq =
    typeof seqRaw === 'number' && Number.isFinite(seqRaw) ? Math.max(0, Math.trunc(seqRaw)) : 0
  const projects: QuoteProjectListEntry[] = []
  for (const p of o.projects) {
    const ent = parseStoredEntry(p)
    if (ent) projects.push(ent)
  }
  return { v: 1, seq, projects }
}

export function loadQuoteProjectStore(): QuoteProjectStoreV1 {
  try {
    const t = localStorage.getItem(STORAGE_KEY)
    if (!t) return defaultStore()
    return migrateStore(JSON.parse(t) as unknown)
  } catch {
    return defaultStore()
  }
}

export function saveQuoteProjectStore(store: QuoteProjectStoreV1): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function nextProjectId(store: QuoteProjectStoreV1): string {
  const nextSeq = store.seq + 1
  const used = new Set(store.projects.map((p) => p.id))
  const base = `qp--${stableHash16(['quote-project', String(nextSeq)].join('\0'))}`
  return allocateWithSuffix(base, used)
}

/** 將目前估價另存為新專案（列表底部新增一筆）。 */
export function addQuoteProjectToStore(
  store: QuoteProjectStoreV1,
  displayName: string,
  slice: QuotePersistSlice,
): QuoteProjectStoreV1 {
  const name = displayName.trim()
  if (!name) return store
  const migrated = migrateQuotePersistSlice(slice)
  const id = nextProjectId(store)
  const nextSeq = store.seq + 1
  return {
    v: 1,
    seq: nextSeq,
    projects: [
      ...store.projects,
      {
        id,
        name,
        savedAt: new Date().toISOString(),
        ...migrated,
      },
    ],
  }
}

/** 以目前估價覆寫列表中既有專案（名稱不變）。 */
export function overwriteQuoteProjectInStore(
  store: QuoteProjectStoreV1,
  id: string,
  slice: QuotePersistSlice,
): QuoteProjectStoreV1 {
  const migrated = migrateQuotePersistSlice(slice)
  const projects = store.projects.map((p) =>
    p.id === id
      ? {
          ...p,
          savedAt: new Date().toISOString(),
          ...migrated,
        }
      : p,
  )
  return { ...store, projects }
}

export function deleteQuoteProjectFromStore(
  store: QuoteProjectStoreV1,
  id: string,
): QuoteProjectStoreV1 {
  return { ...store, projects: store.projects.filter((p) => p.id !== id) }
}

export function renameQuoteProjectInStore(
  store: QuoteProjectStoreV1,
  id: string,
  name: string,
): QuoteProjectStoreV1 {
  const n = name.trim()
  if (!n) return store
  return {
    ...store,
    projects: store.projects.map((p) => (p.id === id ? { ...p, name: n } : p)),
  }
}

export function buildQuoteProjectFileV1(
  slice: QuotePersistSlice,
  displayName?: string,
): QuoteProjectFileV1 {
  const m = migrateQuotePersistSlice(slice)
  return {
    kind: QUOTE_PROJECT_FILE_KIND,
    fileVersion: QUOTE_PROJECT_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    ...(displayName !== undefined && displayName.trim() !== ''
      ? { displayName: displayName.trim() }
      : {}),
    ...m,
  }
}

export function stringifyQuoteProjectFile(slice: QuotePersistSlice, displayName?: string): string {
  return JSON.stringify(buildQuoteProjectFileV1(slice, displayName), null, 2)
}

export function safeQuoteDownloadFilenameBase(nameHint: string): string {
  const t = nameHint.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 72)
  return t || '放樣估價專案'
}

export function downloadQuoteProjectFile(slice: QuotePersistSlice, displayName?: string): void {
  const text = stringifyQuoteProjectFile(slice, displayName)
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const base = safeQuoteDownloadFilenameBase(displayName?.trim() || slice.site.name?.trim() || '')
  a.download = `${base}.json`
  a.rel = 'noopener'
  a.click()
  URL.revokeObjectURL(url)
}

export type ParseQuoteProjectImportResult =
  | { ok: true; slice: QuotePersistSlice; displayName?: string }
  | { ok: false; message: string }

/** 是否形似整包 AppState（估價專案檔不應帶這些頂層域）。 */
function recordLooksLikeFullAppState(r: Record<string, unknown>): boolean {
  return (
    ('salaryBook' in r &&
      r.salaryBook !== null &&
      typeof r.salaryBook === 'object') ||
    ('workLog' in r && r.workLog !== null && typeof r.workLog === 'object') ||
    ('receivables' in r &&
      r.receivables !== null &&
      typeof r.receivables === 'object') ||
    ('months' in r && Array.isArray(r.months)) ||
    ('customLaborWorkspace' in r &&
      r.customLaborWorkspace !== null &&
      typeof r.customLaborWorkspace === 'object') ||
    ('quotationWorkspace' in r &&
      r.quotationWorkspace !== null &&
      typeof r.quotationWorkspace === 'object') ||
    ('contractContents' in r &&
      r.contractContents !== null &&
      typeof r.contractContents === 'object') ||
    ('pricingWorkspace' in r &&
      r.pricingWorkspace !== null &&
      typeof r.pricingWorkspace === 'object')
  )
}

/**
 * 從檔案或貼上 JSON 還原；含與本機 state 相同之 migrate。
 * 只解讀並套用 site／quoteRows／schema，**拒絕**全站備份與整包 AppState，避免誤載入後以為其他資料也已還原。
 */
export function parseQuoteProjectImport(json: unknown): ParseQuoteProjectImportResult {
  if (!json || typeof json !== 'object') {
    return { ok: false, message: '內容不是有效的 JSON 物件。' }
  }
  const o = json as Record<string, unknown>

  if (o.app === FULL_APP_BACKUP_ENVELOPE_APP) {
    return {
      ok: false,
      message:
        '此為全站備份檔，請使用畫面上的「備份／還原」載入整包資料，勿使用估價「從檔案載入」。',
    }
  }

  if (o.kind === QUOTE_PROJECT_FILE_KIND) {
    if (o.fileVersion !== QUOTE_PROJECT_FILE_VERSION) {
      return { ok: false, message: `不支援的專案檔版本：${String(o.fileVersion)}` }
    }
    const slice = migrateQuotePersistSlice({
      site: o.site,
      quoteRows: o.quoteRows,
      quoteRowsSchemaVersion: o.quoteRowsSchemaVersion,
    })
    const displayName = typeof o.displayName === 'string' ? o.displayName : undefined
    return { ok: true, slice, displayName }
  }

  if (recordLooksLikeFullAppState(o)) {
    return {
      ok: false,
      message:
        '此 JSON 含有薪水／帳務／日誌等多區資料，不是純放樣估價專案。請用「備份／還原」處理全站資料，或使用本頁「匯出 JSON」產生的專案檔。',
    }
  }

  if (o.data !== undefined && typeof o.data === 'object' && o.data !== null) {
    const inner = o.data as Record<string, unknown>
    if (recordLooksLikeFullAppState(inner)) {
      return {
        ok: false,
        message:
          '偵測為內含整包營運資料（例如 data 裡有薪水或帳表）。請用全站備份還原，勿用估價專案載入。',
      }
    }
    if (typeof inner.site === 'object' && inner.site !== null) {
      const slice = migrateQuotePersistSlice({
        site: inner.site,
        quoteRows: inner.quoteRows,
        quoteRowsSchemaVersion: inner.quoteRowsSchemaVersion,
      })
      return { ok: true, slice }
    }
  }

  if (typeof o.site === 'object' && o.site !== null) {
    const slice = migrateQuotePersistSlice({
      site: o.site,
      quoteRows: o.quoteRows,
      quoteRowsSchemaVersion: o.quoteRowsSchemaVersion,
    })
    return { ok: true, slice }
  }

  return {
    ok: false,
    message: '不是放樣估價專案檔（需 kind「junshan-quote-project」、根層 site，或僅含估價欄位的 data 包）。',
  }
}

export function parseQuoteProjectImportText(text: string): ParseQuoteProjectImportResult {
  try {
    return parseQuoteProjectImport(JSON.parse(text) as unknown)
  } catch {
    return { ok: false, message: '無法解析 JSON。' }
  }
}
