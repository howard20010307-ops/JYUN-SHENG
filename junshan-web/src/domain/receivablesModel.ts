/** 收帳：每列一筆實際入帳（案名、階段、未稅；預設 5% 稅，可改 0 稅） */

export type ReceivableEntryId = string

export type ReceivableEntry = {
  id: ReceivableEntryId
  /** 入帳日 YYYY-MM-DD */
  bookedDate: string
  /** 案名 */
  projectName: string
  /** 棟別（可空；例：A棟） */
  buildingLabel: string
  /** 樓層／區位（可空；例：3F、B1；與估價案名一致時可由清單選） */
  floorLabel: string
  /** 階段 */
  phaseLabel: string
  net: number
  /**
   * 為 true 時稅金固定 0、含稅＝未稅（調工／免稅等）。
   * 為 false 時稅金＝未稅×5% 四捨五入。
   */
  taxZero: boolean
  /** 與未稅、taxZero 連動（儲存用） */
  tax: number
  note: string
}

function safeNet(net: unknown): number {
  return typeof net === 'number' && Number.isFinite(net) ? net : 0
}

/** 稅金固定 5%（四捨五入至整數，與慣用發票未稅額對齊） */
export function taxFromNet(net: number): number {
  return Math.round(safeNet(net) * 0.05)
}

/** 單列稅金（含 0 稅） */
export function entryTax(e: ReceivableEntry): number {
  if (e.taxZero) return 0
  return taxFromNet(e.net)
}

/** 單列含稅 */
export function entryGross(e: ReceivableEntry): number {
  return safeNet(e.net) + entryTax(e)
}

export function grossFromNet(net: number): number {
  return safeNet(net) + taxFromNet(net)
}

export type ReceivablesState = {
  entries: ReceivableEntry[]
}

function isBookedDateYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

/** 依入帳日由早到晚；非 YYYY-MM-DD 或空值排在最後，同日再依 id */
export function compareReceivableEntriesByBookedDate(
  a: ReceivableEntry,
  b: ReceivableEntry,
): number {
  const aa = isBookedDateYmd(a.bookedDate)
  const bb = isBookedDateYmd(b.bookedDate)
  if (aa && bb) {
    const d = a.bookedDate.localeCompare(b.bookedDate)
    if (d !== 0) return d
    return a.id.localeCompare(b.id)
  }
  if (aa && !bb) return -1
  if (!aa && bb) return 1
  const d = a.bookedDate.localeCompare(b.bookedDate)
  if (d !== 0) return d
  return a.id.localeCompare(b.id)
}

export function sortReceivableEntriesByBookedDate(
  entries: ReceivableEntry[],
): ReceivableEntry[] {
  return entries.slice().sort(compareReceivableEntriesByBookedDate)
}

/** @deprecated 請用 {@link grossFromNet}；稅金改為固定由未稅推算 */
export function grossOf(net: number, tax: number): number {
  const n = typeof net === 'number' && Number.isFinite(net) ? net : 0
  const t = typeof tax === 'number' && Number.isFinite(tax) ? tax : 0
  return n + t
}

function syncEntryTax(e: ReceivableEntry): ReceivableEntry {
  const net = safeNet(e.net)
  const taxZero = Boolean(e.taxZero)
  const tax = taxZero ? 0 : taxFromNet(net)
  return { ...e, net, taxZero, tax }
}

function syncEntriesTax(entries: ReceivableEntry[]): ReceivableEntry[] {
  return entries.map(syncEntryTax)
}

export function initialReceivablesState(): ReceivablesState {
  return { entries: [] }
}

/** 與月表「全書案場更名」同步：僅 `projectName` 字元完全等於 `oldExact` 者更新 */
export function renameReceivableProjectNames(
  state: ReceivablesState,
  oldExact: string,
  newNameTrimmed: string,
): ReceivablesState {
  const newT = newNameTrimmed.trim()
  return {
    entries: sortReceivableEntriesByBookedDate(
      state.entries.map((e) =>
        e.projectName === oldExact ? { ...e, projectName: newT } : e,
      ),
    ),
  }
}

function num(v: unknown, d = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d
}

function str(v: unknown, d = ''): string {
  return typeof v === 'string' ? v : d
}

/** 階段／備註欄為單行：載入時把舊資料換行轉空白 */
function receivableSingleLineField(s: string): string {
  return s.replace(/\r\n|\r|\n/g, ' ')
}

/** 舊 JSON 可能將 id 存成數字；略過會導致整批收帳消失 */
function entryIdFromRaw(id: unknown): string {
  if (typeof id === 'string') {
    const t = id.trim()
    return t
  }
  if (typeof id === 'number' && Number.isFinite(id)) {
    return String(Math.trunc(id))
  }
  return ''
}

function migrateEntriesArray(raw: unknown[]): ReceivableEntry[] {
  const out: ReceivableEntry[] = []
  const seen = new Set<string>()
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const id = entryIdFromRaw(r.id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const bookedDate = str(r.bookedDate, str(r.receivedDate, ''))
    const net = num(r.net, 0)
    const storedTax = num(r.tax, 0)
    const tz = r.taxZero
    const taxZero =
      tz === true ? true : tz === false ? false : storedTax === 0 && net > 0
    out.push({
      id,
      bookedDate,
      projectName: str(r.projectName, ''),
      buildingLabel: str(r.buildingLabel, ''),
      floorLabel: str(r.floorLabel, ''),
      phaseLabel: receivableSingleLineField(str(r.phaseLabel, '')),
      net,
      taxZero,
      tax: 0,
      note: receivableSingleLineField(str(r.note, '')),
    })
  }
  return out
}

/** 舊版：projects / phases / receipts → 只遷移實收列 */
function migrateLegacyNested(o: Record<string, unknown>): ReceivablesState {
  const projectsRaw = Array.isArray(o.projects) ? o.projects : []
  const projectNameById = new Map<string, string>()
  for (const row of projectsRaw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const id = str(r.id, '').trim()
    if (!id) continue
    projectNameById.set(id, str(r.name, '未命名'))
  }

  const phasesRaw = Array.isArray(o.phases) ? o.phases : []
  const phaseInfo = new Map<string, { projectName: string; label: string }>()
  for (const row of phasesRaw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const id = str(r.id, '').trim()
    const pid = str(r.projectId, '').trim()
    if (!id) continue
    phaseInfo.set(id, {
      projectName: projectNameById.get(pid) ?? '',
      label: str(r.label, ''),
    })
  }

  const receiptsRaw = Array.isArray(o.receipts) ? o.receipts : []
  const entries: ReceivableEntry[] = []
  const seen = new Set<string>()
  for (const row of receiptsRaw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const id = entryIdFromRaw(r.id)
    const phaseId = str(r.phaseId, '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    const info = phaseInfo.get(phaseId)
    const net = num(r.net, 0)
    const storedTax = num(r.tax, 0)
    const tz = r.taxZero
    const taxZero =
      tz === true ? true : tz === false ? false : storedTax === 0 && net > 0
    entries.push({
      id,
      bookedDate: str(r.receivedDate, ''),
      projectName: info?.projectName ?? '',
      buildingLabel: '',
      floorLabel: '',
      phaseLabel: receivableSingleLineField(info?.label ?? ''),
      net,
      taxZero,
      tax: 0,
      note: receivableSingleLineField(str(r.note, '')),
    })
  }
  return { entries }
}

export function migrateReceivablesState(loaded: unknown): ReceivablesState {
  const init = initialReceivablesState()
  if (!loaded || typeof loaded !== 'object') return init
  const o = loaded as Record<string, unknown>

  if (Array.isArray(o.entries)) {
    return {
      entries: sortReceivableEntriesByBookedDate(
        syncEntriesTax(migrateEntriesArray(o.entries)),
      ),
    }
  }

  if (Array.isArray(o.receipts) && (o.receipts as unknown[]).length > 0) {
    return {
      entries: sortReceivableEntriesByBookedDate(
        syncEntriesTax(migrateLegacyNested(o).entries),
      ),
    }
  }

  return init
}

export function sumEntriesNetTaxGross(entries: ReceivableEntry[]): {
  net: number
  tax: number
  gross: number
} {
  let netSum = 0
  let taxSum = 0
  for (const e of entries) {
    const n = safeNet(e.net)
    netSum += n
    taxSum += entryTax(e)
  }
  return { net: netSum, tax: taxSum, gross: netSum + taxSum }
}

/** 依入帳日年月（YYYY-MM）加總，供日後帶入公司帳 */
export function sumEntriesInMonth(
  entries: ReceivableEntry[],
  yearMonth: string,
): { net: number; tax: number; gross: number } {
  const prefix = yearMonth.trim()
  if (!/^\d{4}-\d{2}$/.test(prefix)) {
    return { net: 0, tax: 0, gross: 0 }
  }
  const inMonth = entries.filter(
    (e) => typeof e.bookedDate === 'string' && e.bookedDate.startsWith(prefix),
  )
  return sumEntriesNetTaxGross(inMonth)
}

/** 依入帳日年份（YYYY）加總 */
export function sumEntriesInYear(
  entries: ReceivableEntry[],
  year: string,
): { net: number; tax: number; gross: number } {
  const y = year.trim()
  if (!/^\d{4}$/.test(y)) {
    return { net: 0, tax: 0, gross: 0 }
  }
  const prefix = `${y}-`
  const inYear = entries.filter(
    (e) => typeof e.bookedDate === 'string' && e.bookedDate.startsWith(prefix),
  )
  return sumEntriesNetTaxGross(inYear)
}

export function newReceivableId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `rcv-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

/**
 * JSONBin 下載套用時合併收帳：同 `id` 以**本機**為準，其餘 id 併入（雲端舊備份常不含收帳，避免整包覆寫後收帳消失）。
 */
export function mergeReceivablesPreferLocal(
  local: ReceivablesState,
  remote: ReceivablesState,
): ReceivablesState {
  const l = migrateReceivablesState(local)
  const r = migrateReceivablesState(remote)
  const byId = new Map<string, ReceivableEntry>()
  for (const e of r.entries) byId.set(e.id, e)
  for (const e of l.entries) byId.set(e.id, e)
  return {
    entries: sortReceivableEntriesByBookedDate([...byId.values()]),
  }
}
