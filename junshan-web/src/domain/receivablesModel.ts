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
  /** 備註（可含換行） */
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

/**
 * 與月表「全書案場更名」同步：除完全相等外，也涵蓋「舊名緊接括號註記」等常見變體（一律改為新名，不保留括號內文字）。
 */
export function renameReceivableProjectNames(
  state: ReceivablesState,
  oldExact: string,
  newNameTrimmed: string,
): ReceivablesState {
  const newT = newNameTrimmed.trim()
  const oldTrim = oldExact.trim()
  return {
    entries: sortReceivableEntriesByBookedDate(
      state.entries.map((e) => {
        const p = e.projectName
        const pt = p.trim()
        if (oldTrim === '') {
          return e
        }
        if (p === oldExact || pt === oldTrim) {
          return { ...e, projectName: newT }
        }
        if (pt.startsWith(oldTrim)) {
          const rest = pt.slice(oldTrim.length)
          if (
            rest === '' ||
            /^\s*[\uFF08(]/.test(rest) ||
            (rest.startsWith(' ') && /^\s+\(/.test(rest))
          ) {
            return { ...e, projectName: newT }
          }
        }
        return e
      }),
    ),
  }
}

function num(v: unknown, d = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d
}

function str(v: unknown, d = ''): string {
  return typeof v === 'string' ? v : d
}

/** 階段欄為單行：載入時把換行轉空白 */
function receivableSingleLineField(s: string): string {
  return s.replace(/\r\n|\r|\n/g, ' ')
}

/** 備註可含換行：僅正規化換行字元為 \n */
export function normalizeReceivableNote(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

const FP_SEP_SANS_PROJECT = '\u001f'

/** 不含案名：雲端與本機「同筆款、不同案名字串」時收斂用 */
function receivableMergeSansProjectFingerprint(e: ReceivableEntry): string {
  const net = safeNet(e.net)
  return [
    e.bookedDate.trim(),
    String(net),
    receivableSingleLineField(e.phaseLabel).trim(),
    e.buildingLabel.trim(),
    e.floorLabel.trim(),
    e.taxZero ? '1' : '0',
    normalizeReceivableNote(e.note).trim(),
  ].join(FP_SEP_SANS_PROJECT)
}

function pickBestReceivableSansProjectGroup(
  group: ReceivableEntry[],
  localIds: Set<string>,
): ReceivableEntry {
  const score = (e: ReceivableEntry) => {
    let s = 0
    if (localIds.has(e.id)) s += 1000
    if (!/舊資料/.test(e.projectName)) s += 100
    return s
  }
  return group.slice().sort((a, b) => {
    const ds = score(b) - score(a)
    if (ds !== 0) return ds
    return compareReceivableEntriesByBookedDate(a, b)
  })[0]
}

/**
 * 載入與 JSONBin 合併後：若入帳日、未稅、階段、棟、樓層、稅別、備註皆相同，僅案名不同（含一筆帶「舊資料」），收斂為一列。
 * 優先：本機 id → 案名不含「舊資料」→ 早／小 id。
 * 若同一天同金額確為兩筆不同收款，請用備註區分。
 */
function dedupeReceivablesSansProjectFingerprints(
  entries: ReceivableEntry[],
  localIds: Set<string>,
): ReceivableEntry[] {
  const byFp = new Map<string, ReceivableEntry[]>()
  for (const e of entries) {
    const fp = receivableMergeSansProjectFingerprint(e)
    const arr = byFp.get(fp)
    if (arr) arr.push(e)
    else byFp.set(fp, [e])
  }
  const out: ReceivableEntry[] = []
  for (const group of byFp.values()) {
    if (group.length === 1) {
      out.push(group[0])
    } else {
      out.push(pickBestReceivableSansProjectGroup(group, localIds))
    }
  }
  return sortReceivableEntriesByBookedDate(out)
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
      note: normalizeReceivableNote(str(r.note, '')),
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
      note: normalizeReceivableNote(str(r.note, '')),
    })
  }
  return { entries }
}

export function migrateReceivablesState(loaded: unknown): ReceivablesState {
  const init = initialReceivablesState()
  if (!loaded || typeof loaded !== 'object') return init
  const o = loaded as Record<string, unknown>

  if (Array.isArray(o.entries)) {
    const raw = sortReceivableEntriesByBookedDate(
      syncEntriesTax(migrateEntriesArray(o.entries)),
    )
    return {
      entries: dedupeReceivablesSansProjectFingerprints(raw, new Set()),
    }
  }

  if (Array.isArray(o.receipts) && (o.receipts as unknown[]).length > 0) {
    const raw = sortReceivableEntriesByBookedDate(
      syncEntriesTax(migrateLegacyNested(o).entries),
    )
    return {
      entries: dedupeReceivablesSansProjectFingerprints(raw, new Set()),
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

/** 依入帳日年月（YYYY-MM）加總，供公司損益表帶入 */
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

const FP_SEP = '\u001f'

/**
 * 雲端／本機合併時辨識「同一筆入帳」用（非 id）。
 * 欄位皆 trim／正規化後串接；若實際有兩筆完全相同的付款，可改備註區分以免被併成一筆。
 */
function receivableCloudMergeFingerprint(e: ReceivableEntry): string {
  const net = safeNet(e.net)
  const parts = [
    e.bookedDate.trim(),
    e.projectName.trim(),
    String(net),
    receivableSingleLineField(e.phaseLabel).trim(),
    e.buildingLabel.trim(),
    e.floorLabel.trim(),
    e.taxZero ? '1' : '0',
    normalizeReceivableNote(e.note).trim(),
  ]
  return parts.join(FP_SEP)
}

/** 指紋相同且 id 不同時只留一筆：優先保留原屬本機之列，否則保留 id 字順最小者 */
function dedupeReceivablesAfterIdMerge(
  entries: ReceivableEntry[],
  localIds: Set<string>,
): ReceivableEntry[] {
  const byFp = new Map<string, ReceivableEntry[]>()
  for (const e of entries) {
    const fp = receivableCloudMergeFingerprint(e)
    const arr = byFp.get(fp)
    if (arr) arr.push(e)
    else byFp.set(fp, [e])
  }
  const out: ReceivableEntry[] = []
  for (const group of byFp.values()) {
    if (group.length === 1) {
      out.push(group[0])
      continue
    }
    const fromLocal = group.filter((e) => localIds.has(e.id))
    const pick =
      fromLocal.length > 0
        ? fromLocal.slice().sort(compareReceivableEntriesByBookedDate)[0]
        : group.slice().sort((a, b) => a.id.localeCompare(b.id))[0]
    out.push(pick)
  }
  return out
}

/**
 * JSONBin 下載套用時合併收帳：
 * 1. 同 `id` 以**本機**為準，其餘 id 併入（雲端舊備份常不含收帳，避免整包覆寫後收帳消失）。
 * 2. **再依業務指紋去重**：入帳日、案名、未稅、階段、棟、樓層、是否零稅、備註皆相同則視為同一筆；
 *    僅保留一列，且**優先保留本機原列**（避免雲端／本機各登記一次變成兩筆不同 id 的重複）。
 *
 * 3. **不含案名**之第二層：同入帳日、未稅、階段、棟、樓、稅別、備註亦視為同一筆（可避免本機「新案名」與雲端「舊案名＋註記」兩列並存）；優先本機 id 與不含「舊資料」之案名。
 *
 * 注意：若同一天同金額確實有兩筆，請在**備註**區分，否則合併後只會剩一筆。
 */
export function mergeReceivablesPreferLocal(
  local: ReceivablesState,
  remote: ReceivablesState,
): ReceivablesState {
  const l = migrateReceivablesState(local)
  const r = migrateReceivablesState(remote)
  const localIds = new Set(l.entries.map((e) => e.id))
  const byId = new Map<string, ReceivableEntry>()
  for (const e of r.entries) byId.set(e.id, e)
  for (const e of l.entries) byId.set(e.id, e)
  const merged = dedupeReceivablesSansProjectFingerprints(
    dedupeReceivablesAfterIdMerge([...byId.values()], localIds),
    localIds,
  )
  return {
    entries: sortReceivableEntriesByBookedDate(merged),
  }
}
