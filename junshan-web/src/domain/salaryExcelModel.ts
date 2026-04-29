/**
 * 與《2026鈞泩薪水統計》月表邏輯對齊：
 * - 案場區塊：每人每日欄位為「天數」可小數；總天數 = SUM(日期欄)；總計(P) = 總天數 × 鈞泩日薪
 * - 餐列：各日期欄為「金額」；總計(P) = SUM(日期欄)（與 Excel 餐列公式一致）
 * - 區塊總計列：各日期欄 = 各員工該日之和（不含餐）；總計(P) 為區塊內各人員＋餐之總計(P)相加
 * - 總出工數：跨所有案場，同日同人之天數加總；餐為金額加總
 */

export const DEFAULT_STAFF = ['蕭上彬', '楊家全', '劉子瑜', '陳建良', '黃致揚'] as const
export type StaffName = (typeof DEFAULT_STAFF)[number]

/** 每張月表必帶人員（日薪／預支／調工／加班與各案場格線一律補齊；不可自全書刪除或更名） */
export const MONTH_STAFF_FIXED = ['蕭上彬', '黃致揚'] as const

function isFixedMonthStaffName(name: string): boolean {
  return (MONTH_STAFF_FIXED as readonly string[]).includes(name.trim())
}

/**
 * 舊存檔／Excel 曾用名 → 現用表鍵（由上而下逐一比對；未命中則原樣回傳）。
 * 與 {@link reconcileLegacyWorkerNamesInMonth}、匯入 `normalizeWorkerKey` 共用。
 *
 * 與 Excel 對齊（進入網站時經 {@link normalizeSalaryBook} 自動併入現名）：
 * 最終姓名「楊家全」：別字「揚家全」、舊稱「阿全」皆併入；阿全婆／阿全嫂→劉子瑜；建良→陳建良；阿彬→蕭上彬；阿揚→黃致揚；蕭尚彬→蕭上彬；黃致陽→黃致揚。
 */
export const LEGACY_WORKER_RENAMES: ReadonlyArray<readonly [string, string]> = [
  ['揚家全', '楊家全'],
  ['阿全', '楊家全'],
  ['阿全婆', '劉子瑜'],
  ['阿全嫂', '劉子瑜'],
  ['建良', '陳建良'],
  ['阿彬', '蕭上彬'],
  ['阿揚', '黃致揚'],
  ['蕭尚彬', '蕭上彬'],
  ['黃致陽', '黃致揚'],
]

export function legacyToCanonicalWorkerKey(name: string): string {
  const n = name.trim()
  for (const [from, to] of LEGACY_WORKER_RENAMES) {
    if (n === from) return to
  }
  return n
}

export type SiteBlock = {
  id: string
  siteName: string
  /** 與 dates 等長；缺欄視為 0 */
  grid: Record<string, number[]>
  meal: number[]
}

export type MonthSheetData = {
  id: string
  label: string
  dates: string[]
  /** 鈞泩日薪／蔡董日薪（與各月表頭一致） */
  rateJun: Record<string, number>
  rateTsai: Record<string, number>
  blocks: SiteBlock[]
  /** 預支：金額，與 dates 等長 */
  advances: Record<string, number[]>
  /** 調工支援（天／日欄；日誌／快速登記地點鍵名為「調工支援」，與總表「調工」列一致） */
  junAdjustDays: Record<string, number[]>
  /** 蔡董調工（天／日欄；語意為調工支援） */
  tsaiAdjustDays: Record<string, number[]>
  /** 鈞泩加班時數 */
  junOtHours: Record<string, number[]>
  /** 蔡董加班時數 */
  tsaiOtHours: Record<string, number[]>
}

export type PeriodColumn = {
  label: string
  startIso: string
  endIso: string
  /**
   * 若設定，只從該張月表讀欄位；**各日期是否列入仍看** `startIso`～`endIso`（表內跨月時依欄位日期對齊）。
   * 未設定時：全書各月凡日期落在區間內者皆列入。
   */
  monthSheetId?: string
  /** 為真表示本欄為「總結」：數值為其餘各分期同列指標加總（不當作日期區間） */
  summaryTotal?: boolean
}

export type SalaryBook = {
  version: 1
  /** 對應「員工總出工及薪水計算」橫向分期欄 */
  periodColumns: PeriodColumn[]
  months: MonthSheetData[]
}

export function padArray(arr: number[] | undefined, len: number): number[] {
  const a = arr ?? []
  return Array.from({ length: len }, (_, i) =>
    Number.isFinite(a[i]) ? a[i] : 0,
  )
}

export function sumArr(a: number[]): number {
  return a.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)
}

/** 人員列：總天數 = SUM(日期欄) */
export function staffTotalDays(row: number[]): number {
  return sumArr(row)
}

/** 人員列：總計(P) = 總天數 × 鈞泩日薪 */
export function staffTotalPay(days: number, rateJun: number): number {
  return days * rateJun
}

/** 餐列：總計(P) = SUM(日期欄) */
export function mealTotalPay(meal: number[]): number {
  return sumArr(meal)
}

/** 區塊內：各日期「工數」欄加總（不含餐） */
export function blockDayColumnTotals(
  block: SiteBlock,
  staff: readonly string[],
  dateLen: number,
): number[] {
  return Array.from({ length: dateLen }, (_, j) =>
    staff.reduce((s, name) => s + (block.grid[name]?.[j] ?? 0), 0),
  )
}

/** 區塊總計(P)：各人總計(P)＋餐總計(P) */
export function blockGrandPay(
  block: SiteBlock,
  staff: readonly string[],
  rateJun: Record<string, number>,
): number {
  let t = 0
  for (const name of staff) {
    const days = staffTotalDays(padArray(block.grid[name], block.meal.length))
    t += staffTotalPay(days, rateJun[name] ?? 0)
  }
  t += mealTotalPay(block.meal)
  return t
}

export function computeGrandTotalSection(
  month: MonthSheetData,
  staff?: readonly string[],
): {
  staffRows: Record<string, number[]>
  mealRow: number[]
  staffTotalsDays: Record<string, number>
  staffTotalsPay: Record<string, number>
  mealPay: number
} {
  const staffList = staff ?? staffKeysForMonthDisplay(month)
  const n = month.dates.length
  const staffRows: Record<string, number[]> = {}
  for (const name of staffList) {
    staffRows[name] = Array(n).fill(0)
  }
  const mealRow = Array(n).fill(0)
  for (const b of month.blocks) {
    for (const name of staffList) {
      const row = padArray(b.grid[name], n)
      for (let j = 0; j < n; j++) staffRows[name][j] += row[j]
    }
    const m = padArray(b.meal, n)
    for (let j = 0; j < n; j++) mealRow[j] += m[j]
  }
  const staffTotalsDays: Record<string, number> = {}
  const staffTotalsPay: Record<string, number> = {}
  for (const name of staffList) {
    const d = staffTotalDays(staffRows[name])
    staffTotalsDays[name] = d
    staffTotalsPay[name] = staffTotalPay(d, month.rateJun[name] ?? 0)
  }
  const mealPay = mealTotalPay(mealRow)
  return { staffRows, mealRow, staffTotalsDays, staffTotalsPay, mealPay }
}

function inRange(iso: string, start: string, end: string): boolean {
  return iso >= start && iso <= end
}

function periodScopesSingleMonth(period: PeriodColumn): boolean {
  return typeof period.monthSheetId === 'string' && period.monthSheetId.length > 0
}

function monthMatchesPeriodColumn(month: MonthSheetData, period: PeriodColumn): boolean {
  if (!periodScopesSingleMonth(period)) return true
  return month.id === period.monthSheetId
}

/** 一律依欄位日期 ISO 是否落在分期起訖內；有綁定月表時外層只掃該表。 */
function dayColumnMatchesPeriod(
  month: MonthSheetData,
  dateIndex: number,
  period: PeriodColumn,
): boolean {
  const iso = month.dates[dateIndex] ?? ''
  return inRange(iso, period.startIso, period.endIso)
}

/** 總結欄：將同一指標對「非總結」各分期加總 */
function sumMetricAcrossNonSummaryPeriods(
  book: SalaryBook,
  staffName: string,
  period: PeriodColumn,
  metric: (book: SalaryBook, staffName: string, p: PeriodColumn) => number,
): number | undefined {
  if (!period.summaryTotal) return undefined
  let s = 0
  for (const p of book.periodColumns) {
    if (p.summaryTotal) continue
    s += metric(book, staffName, p)
  }
  return s
}

/** 鈞泩出工數：分期間內，跨所有月、所有案場加總人員天數（或僅綁定之月表） */
export function junWorkDaysInPeriod(
  book: SalaryBook,
  staffName: string,
  period: PeriodColumn,
): number {
  const bulk = sumMetricAcrossNonSummaryPeriods(
    book,
    staffName,
    period,
    junWorkDaysInPeriod,
  )
  if (bulk !== undefined) return bulk
  let s = 0
  for (const m of book.months) {
    if (!monthMatchesPeriodColumn(m, period)) continue
    for (const b of m.blocks) {
      const row = padArray(b.grid[staffName], m.dates.length)
      for (let j = 0; j < m.dates.length; j++) {
        if (!dayColumnMatchesPeriod(m, j, period)) continue
        s += row[j] ?? 0
      }
    }
  }
  return s
}

function toIsoYmd(y: number, month1to12: number, day: number): string {
  return `${y}-${String(month1to12).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * 「員工總出工及薪水計算」分期欄：每月 **11～25 日**、**26 日～次月 10 日** 各一欄（以此類推）。
 * 含所給曆年 **1～12 月**（最後一欄日期區間為 **12/26～次年 1/10**），再接一欄 **總結**（各分期同列數值加總）。
 */
export function autoPayrollPeriodColumns(year: number): PeriodColumn[] {
  const cols: PeriodColumn[] = []
  const addMonthPair = (y: number, mo: number) => {
    cols.push({
      label: `${mo}/11~${mo}/25`,
      startIso: toIsoYmd(y, mo, 11),
      endIso: toIsoYmd(y, mo, 25),
    })
    const nextMo = mo === 12 ? 1 : mo + 1
    const nextY = mo === 12 ? y + 1 : y
    cols.push({
      label: `${mo}/26~${nextMo}/10`,
      startIso: toIsoYmd(y, mo, 26),
      endIso: toIsoYmd(nextY, nextMo, 10),
    })
  }
  for (let mo = 1; mo <= 12; mo++) addMonthPair(year, mo)
  cols.push({
    label: '總結',
    startIso: '',
    endIso: '',
    summaryTotal: true,
  })
  return cols
}

/** 相容舊程式：等同 {@link autoPayrollPeriodColumns}(2026) */
export function defaultPeriodColumns(): PeriodColumn[] {
  return autoPayrollPeriodColumns(2026)
}

function periodColumnsEqual(
  a: readonly PeriodColumn[],
  b: readonly PeriodColumn[],
): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (
      x.label !== y.label ||
      x.startIso !== y.startIso ||
      x.endIso !== y.endIso ||
      (x.monthSheetId ?? '') !== (y.monthSheetId ?? '') ||
      Boolean(x.summaryTotal) !== Boolean(y.summaryTotal)
    )
      return false
  }
  return true
}

function formatPayrollSlashRange(startIso: string, endIso: string): string {
  const sliceMd = (iso: string) => {
    const mo = parseInt(iso.slice(5, 7), 10)
    const d = parseInt(iso.slice(8, 10), 10)
    return `${mo}/${d}`
  }
  if (startIso.slice(0, 4) === endIso.slice(0, 4)) {
    return `${sliceMd(startIso)}～${sliceMd(endIso)}`
  }
  return `${startIso.slice(0, 4)}/${sliceMd(startIso)}～${endIso.slice(0, 4)}/${sliceMd(endIso)}`
}

/** 由單張月表日期欄推出分期欄（起訖 ISO，並綁定該月表 id 供總表連動加總）。 */
export function periodColumnFromMonthSheet(m: MonthSheetData): PeriodColumn | null {
  const valid = m.dates
    .filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.trim()))
    .map((d) => d.trim())
    .sort()
  if (valid.length === 0) return null
  const startIso = valid[0]!
  const endIso = valid[valid.length - 1]!
  return {
    label: `${m.label}（${formatPayrollSlashRange(startIso, endIso)}）`,
    startIso,
    endIso,
    monthSheetId: m.id,
  }
}

/**
 * 總表橫向分期：依 `book.months` 順序，一欄對應一張月表；日期範圍取自該表日期列（自動對齊）。
 * 若尚無任何有效日期欄，回傳空陣列（呼叫端可改採 {@link autoPayrollPeriodColumns}）。
 */
export function payrollPeriodColumnsFromBookMonths(book: SalaryBook): PeriodColumn[] {
  const out: PeriodColumn[] = []
  for (const m of book.months) {
    const col = periodColumnFromMonthSheet(m)
    if (col) out.push(col)
  }
  return out
}

/**
 * 將 `periodColumns` 更新為 {@link autoPayrollPeriodColumns}（依書內推斷曆年：每月 11～25、26～次月 10，至 12/26～次年 1/10，並加「總結」欄）。
 */
export function reconcileSalaryBookPeriodColumns(book: SalaryBook): SalaryBook {
  const want = autoPayrollPeriodColumns(inferPayrollYearFromBook(book))
  if (periodColumnsEqual(book.periodColumns, want)) return book
  return { ...book, periodColumns: want }
}

export function defaultRatesFebruary(): {
  rateJun: Record<string, number>
  rateTsai: Record<string, number>
} {
  return {
    rateJun: {
      蕭上彬: 3500,
      楊家全: 3000,
      劉子瑜: 3000,
      陳建良: 3500,
      黃致揚: 2800,
    },
    rateTsai: {
      蕭上彬: 2800,
      楊家全: 2800,
      劉子瑜: 2800,
      陳建良: 2800,
      黃致揚: 2800,
    },
  }
}

/** 2 月預設日期欄（與你表相同之工作日集合） */
export function defaultFebruary2026Dates(): string[] {
  return [
    '2026-02-01',
    '2026-02-02',
    '2026-02-04',
    '2026-02-05',
    '2026-02-06',
    '2026-02-07',
    '2026-02-08',
    '2026-02-09',
    '2026-02-10',
    '2026-02-11',
    '2026-02-12',
    '2026-02-23',
    '2026-02-24',
    '2026-02-25',
    '2026-02-26',
    '2026-02-27',
    '2026-02-28',
  ]
}

/** 新案場區塊格線人員列；未傳則為預設班底（必含 {@link MONTH_STAFF_FIXED} 置前） */
export function emptyBlock(
  siteName: string,
  dateLen: number,
  staffRowKeys?: readonly string[],
): SiteBlock {
  const fromArg =
    staffRowKeys && staffRowKeys.length > 0 ? [...staffRowKeys] : [...DEFAULT_STAFF]
  const rest = fromArg.filter((n) => !(MONTH_STAFF_FIXED as readonly string[]).includes(n))
  const base = [...MONTH_STAFF_FIXED, ...rest]
  const grid: Record<string, number[]> = {}
  for (const n of base) grid[n] = Array(dateLen).fill(0)
  return {
    id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    siteName,
    grid,
    meal: Array(dateLen).fill(0),
  }
}

/** 該月是否仍有此人員任一資料鍵（日薪、格線、預支等） */
export function monthHasWorkerKey(m: MonthSheetData, n: string): boolean {
  if (!n) return false
  if (n in m.rateJun) return true
  if (n in m.rateTsai) return true
  if (n in m.advances) return true
  if (n in m.junAdjustDays) return true
  if (n in m.tsaiAdjustDays) return true
  if (n in m.junOtHours) return true
  if (n in m.tsaiOtHours) return true
  for (const b of m.blocks) {
    if (n in b.grid) return true
  }
  return false
}

/** 月表畫面用：固定人員置前，其餘預設班底（依 DEFAULT_STAFF 序）＋臨時人員 */
export function staffKeysForMonthDisplay(month: MonthSheetData): string[] {
  const fixed = (MONTH_STAFF_FIXED as readonly string[]).filter((n) =>
    monthHasWorkerKey(month, n),
  )
  const defaults = (DEFAULT_STAFF as readonly string[]).filter(
    (n) =>
      monthHasWorkerKey(month, n) &&
      !(MONTH_STAFF_FIXED as readonly string[]).includes(n),
  )
  const extra = new Set<string>()
  for (const b of month.blocks) {
    for (const k of Object.keys(b.grid)) {
      if ((DEFAULT_STAFF as readonly string[]).includes(k as StaffName)) continue
      if (monthHasWorkerKey(month, k)) extra.add(k)
    }
  }
  for (const k of Object.keys(month.rateJun)) {
    if ((DEFAULT_STAFF as readonly string[]).includes(k as StaffName)) continue
    if (monthHasWorkerKey(month, k)) extra.add(k)
  }
  const extras = [...extra].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  return [...fixed, ...defaults, ...extras]
}

/** 總表用：全書各月曾出現的人員（併集、穩定排序） */
export function staffKeysAcrossBook(book: SalaryBook): string[] {
  const u = new Set<string>()
  for (const m of book.months) {
    for (const k of staffKeysForMonthDisplay(m)) u.add(k)
  }
  const defaults = (DEFAULT_STAFF as readonly string[]).filter((n) => u.has(n))
  const extras = [...u]
    .filter((n) => !(DEFAULT_STAFF as readonly string[]).includes(n as StaffName))
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  return [...defaults, ...extras]
}

export function ensureGridWorker(
  block: SiteBlock,
  workerName: string,
  len: number,
): SiteBlock {
  const n = workerName.trim()
  if (!n) return block
  const row = block.grid[n] ? padArray(block.grid[n], len) : Array(len).fill(0)
  return { ...block, grid: { ...block.grid, [n]: row } }
}

/** 臨時人員：補齊日薪與預支／調工／加班等列（數值先為 0） */
export function ensureWorkerOnMonth(
  month: MonthSheetData,
  workerName: string,
): MonthSheetData {
  const n = workerName.trim()
  if (!n) return month
  const len = month.dates.length
  const rateJun = { ...month.rateJun }
  const rateTsai = { ...month.rateTsai }
  if (rateJun[n] === undefined) rateJun[n] = 0
  if (rateTsai[n] === undefined) rateTsai[n] = 0
  const padStaff = (rec: Record<string, number[]>) => {
    const o = { ...rec }
    const cur = o[n]
    o[n] = cur && cur.length === len ? [...cur] : Array(len).fill(0)
    return o
  }
  return {
    ...month,
    rateJun,
    rateTsai,
    advances: padStaff(month.advances),
    junAdjustDays: padStaff(month.junAdjustDays),
    tsaiAdjustDays: padStaff(month.tsaiAdjustDays),
    junOtHours: padStaff(month.junOtHours),
    tsaiOtHours: padStaff(month.tsaiOtHours),
  }
}

function renameStaffGridRecord(
  rec: Record<string, number[]>,
  from: string,
  to: string,
  len: number,
): Record<string, number[]> {
  if (!(from in rec)) return { ...rec }
  const o = { ...rec }
  const row = o[from]
  delete o[from]
  o[to] = padArray(row, len)
  return o
}

/** 單月內將人員鍵名 from→to（日薪、各案場 grid、預支／調工／加班列） */
export function renameWorkerInMonth(
  m: MonthSheetData,
  from: string,
  to: string,
): MonthSheetData {
  const len = m.dates.length
  const blocks = m.blocks.map((b) => {
    if (!(from in b.grid)) return b
    const grid = { ...b.grid }
    const row = grid[from]
    delete grid[from]
    grid[to] = padArray(row, len)
    return { ...b, grid }
  })
  const gridHasTo = blocks.some((b) => to in b.grid)
  const rateJun = { ...m.rateJun }
  const rateTsai = { ...m.rateTsai }
  const savedJun = rateJun[from]
  const savedTsai = rateTsai[from]
  delete rateJun[from]
  delete rateTsai[from]
  if (savedJun !== undefined) rateJun[to] = savedJun
  else if (gridHasTo) rateJun[to] = rateJun[to] ?? 0
  if (savedTsai !== undefined) rateTsai[to] = savedTsai
  else if (gridHasTo) rateTsai[to] = rateTsai[to] ?? 0

  return {
    ...m,
    blocks,
    rateJun,
    rateTsai,
    advances: renameStaffGridRecord(m.advances, from, to, len),
    junAdjustDays: renameStaffGridRecord(m.junAdjustDays, from, to, len),
    tsaiAdjustDays: renameStaffGridRecord(m.tsaiAdjustDays, from, to, len),
    junOtHours: renameStaffGridRecord(m.junOtHours, from, to, len),
    tsaiOtHours: renameStaffGridRecord(m.tsaiOtHours, from, to, len),
  }
}

/** 單月內將 {@link LEGACY_WORKER_RENAMES} 舊鍵併入現名（目標鍵已存在時略過，避免覆蓋） */
export function reconcileLegacyWorkerNamesInMonth(m: MonthSheetData): MonthSheetData {
  let mm = m
  for (const [from, to] of LEGACY_WORKER_RENAMES) {
    if (from === to) continue
    if (monthHasWorkerKey(mm, from) && !monthHasWorkerKey(mm, to)) {
      mm = renameWorkerInMonth(mm, from, to)
    }
  }
  return mm
}

/**
 * 全書更名：各月同日薪、案場格線、預支、調工、加班等同一鍵名一併改為新名。
 * 若新名已存在任一資料列則拒絕（避免合併衝突）。
 */
export function renameWorkerInBook(
  book: SalaryBook,
  fromRaw: string,
  toRaw: string,
): { book: SalaryBook; ok: boolean; message: string } {
  const from = fromRaw.trim()
  const to = toRaw.trim()
  if (!from || !to) return { book, ok: false, message: '請填舊名與新名。' }
  if (from === to) return { book, ok: true, message: '名稱相同，無需變更。' }
  const src = book.months.some((m) => monthHasWorkerKey(m, from))
  if (!src) return { book, ok: false, message: `找不到「${from}」這位人員。` }
  if (isFixedMonthStaffName(from)) {
    return {
      book,
      ok: false,
      message: `「${from}」為每月固定人員，無法更名。`,
    }
  }
  const taken = book.months.some((m) => monthHasWorkerKey(m, to))
  if (taken) {
    return {
      book,
      ok: false,
      message: `「${to}」已存在（日薪、格線或其他列已有此名），請換新名或先整理資料。`,
    }
  }
  const months = book.months.map((m) => renameWorkerInMonth(m, from, to))
  return {
    book: { ...book, months },
    ok: true,
    message: `已將「${from}」更名為「${to}」（全書各月）。`,
  }
}

/** 與快速登記「蔡董調工／調工支援」專用案名衝突時拒絕更名（避免誤用保留字）；含舊鍵「鈞泩調工」 */
export const RESERVED_SITE_NAMES_FOR_QUICK = new Set(['蔡董調工', '調工支援', '鈞泩調工'])

/** 同一月內「完整案名字串」重複（不以 trim 等同視為同一） */
function monthLabelWithDuplicateSiteName(book: SalaryBook): string | null {
  for (const m of book.months) {
    const seen = new Set<string>()
    for (const b of m.blocks) {
      const k = b.siteName
      if (!k.trim()) continue
      if (seen.has(k)) return m.label
      seen.add(k)
    }
  }
  return null
}

/** 快速登記／估價選單等：編輯中區塊（blur 時一併套用新名） */
export type SiteRenameEditedRef = { monthId: string; blockIndex: number }

/**
 * 全書案場更名：凡 `siteName` **字元完全等於**焦點時之 `oldExact` 的區塊改為 `newNameRaw` 去頭尾空白後的字串。
 * （不以 trim 視為等同：「甲」與「甲 」視為不同案名，應分別更名。）
 * 另會強制更新 `edited` 所指區塊。
 */
export function renameSiteAcrossBook(
  book: SalaryBook,
  oldExact: string,
  newNameRaw: string,
  edited?: SiteRenameEditedRef,
): { book: SalaryBook; ok: boolean; message: string } {
  const newT = newNameRaw.trim()
  if (!newT) {
    return { book, ok: false, message: '案場名稱不可為空白。' }
  }
  if (RESERVED_SITE_NAMES_FOR_QUICK.has(newT)) {
    return {
      book,
      ok: false,
      message: `「${newT}」為快速登記保留案名，請改用其他名稱。`,
    }
  }
  if (oldExact === newT) {
    return { book, ok: true, message: '名稱相同，無需變更。' }
  }

  const nextMonths = book.months.map((m) => ({
    ...m,
    blocks: m.blocks.map((b, j) => {
      const matchOld = oldExact !== '' && b.siteName === oldExact
      const matchEdited =
        edited !== undefined && m.id === edited.monthId && j === edited.blockIndex
      if (matchOld || matchEdited) return { ...b, siteName: newT }
      return b
    }),
  }))

  let identical = true
  outer: for (let i = 0; i < book.months.length; i++) {
    const a = book.months[i].blocks
    const b = nextMonths[i].blocks
    for (let j = 0; j < a.length; j++) {
      if (a[j].siteName !== b[j].siteName) {
        identical = false
        break outer
      }
    }
  }
  if (identical) {
    return { book, ok: true, message: '無需變更。' }
  }

  const trial: SalaryBook = { ...book, months: nextMonths }
  const dupIn = monthLabelWithDuplicateSiteName(trial)
  if (dupIn) {
    return {
      book,
      ok: false,
      message: `無法更名：在「${dupIn}」會與現有案場重複（同一月內案名不可重複）。`,
    }
  }

  let changedBlocks = 0
  const monthsTouched = new Set<string>()
  for (let i = 0; i < book.months.length; i++) {
    const a = book.months[i].blocks
    const b = nextMonths[i].blocks
    let hit = false
    for (let j = 0; j < a.length; j++) {
      if (a[j].siteName !== b[j].siteName) {
        changedBlocks++
        hit = true
      }
    }
    if (hit) monthsTouched.add(book.months[i].label)
  }

  const oldLabel = oldExact.trim() ? oldExact : '（原為空白或僅空白字元）'
  const msg =
    changedBlocks === 0
      ? '無需變更。'
      : `已將與「${oldLabel}」完全相同的案名，同步為「${newT}」（${monthsTouched.size} 張月表、共 ${changedBlocks} 個區塊）。`

  return { book: trial, ok: true, message: msg }
}

/**
 * 在指定月表新增一個空案場區塊（與薪水頁「新增案場區塊」一致；格線人員與該月顯示列一致）。
 * 用於收帳「新增案」與月表連動。
 */
export function addEmptySiteBlockToMonth(
  book: SalaryBook,
  monthId: string,
  siteNameRaw: string,
): { book: SalaryBook; ok: boolean; message: string } {
  const siteT = siteNameRaw.trim()
  if (!siteT) {
    return { book, ok: false, message: '案名不可為空白。' }
  }
  if (RESERVED_SITE_NAMES_FOR_QUICK.has(siteT)) {
    return {
      book,
      ok: false,
      message: `「${siteT}」為快速登記保留案名，請改用其他名稱。`,
    }
  }
  const mi = book.months.findIndex((m) => m.id === monthId)
  if (mi < 0) {
    return { book, ok: false, message: '找不到該月表。' }
  }
  const month = book.months[mi]
  if (month.blocks.some((b) => b.siteName === siteT)) {
    return {
      book,
      ok: false,
      message: `「${month.label}」已有相同案名，請勿重複新增。`,
    }
  }
  const staffOrder = staffKeysForMonthDisplay(month)
  const nb = emptyBlock(siteT, month.dates.length, staffOrder)
  const nextMonth: MonthSheetData = { ...month, blocks: [...month.blocks, nb] }
  const nextBook: SalaryBook = {
    ...book,
    months: book.months.map((m, i) => (i === mi ? nextMonth : m)),
  }
  return {
    book: nextBook,
    ok: true,
    message: `已在「${month.label}」新增案場「${siteT}」。`,
  }
}

export function addWorkerToMonth(m: MonthSheetData, name: string): MonthSheetData {
  const n = name.trim()
  if (!n) return m
  let x = ensureWorkerOnMonth(m, n)
  const len = x.dates.length
  return {
    ...x,
    blocks: x.blocks.map((b) => ensureGridWorker(b, n, len)),
  }
}

/** 單月補齊 {@link MONTH_STAFF_FIXED}（各案場空列＋日薪等） */
export function ensureFixedMonthStaffInSheet(m: MonthSheetData): MonthSheetData {
  let x = m
  for (const n of MONTH_STAFF_FIXED) {
    x = addWorkerToMonth(x, n)
  }
  return x
}

function omitRateKey(rec: Record<string, number>, key: string): Record<string, number> {
  if (!(key in rec)) return { ...rec }
  const o = { ...rec }
  delete o[key]
  return o
}

function omitGridMapKey(
  rec: Record<string, number[]>,
  key: string,
): Record<string, number[]> {
  if (!(key in rec)) return { ...rec }
  const o = { ...rec }
  delete o[key]
  return o
}

/** 自單月移除人員所有鍵（不含其他月） */
export function removeWorkerFromMonth(m: MonthSheetData, name: string): MonthSheetData {
  const n = name.trim()
  if (!n) return m
  return {
    ...m,
    blocks: m.blocks.map((b) => {
      if (!(n in b.grid)) return b
      const grid = { ...b.grid }
      delete grid[n]
      return { ...b, grid }
    }),
    rateJun: omitRateKey(m.rateJun, n),
    rateTsai: omitRateKey(m.rateTsai, n),
    advances: omitGridMapKey(m.advances, n),
    junAdjustDays: omitGridMapKey(m.junAdjustDays, n),
    tsaiAdjustDays: omitGridMapKey(m.tsaiAdjustDays, n),
    junOtHours: omitGridMapKey(m.junOtHours, n),
    tsaiOtHours: omitGridMapKey(m.tsaiOtHours, n),
  }
}

/**
 * 將多位人員補進全書每一張月表（日薪／預支／調工／加班與各案場格線；缺才補列，已有則維持）。
 * 用於快速登記等：與「新增人員」全書連動一致。
 */
export function ensureWorkersAcrossBook(book: SalaryBook, workers: string[]): SalaryBook {
  let result = book
  for (const raw of workers) {
    const n = raw.trim()
    if (!n) continue
    result = {
      ...result,
      months: result.months.map((m) => addWorkerToMonth(m, n)),
    }
  }
  return result
}

/** 全書新增人員：各月日薪列與各案場格線補齊（數值為 0） */
export function addWorkerToBook(
  book: SalaryBook,
  nameRaw: string,
): { book: SalaryBook; ok: boolean; message: string } {
  const name = nameRaw.trim()
  if (!name) return { book, ok: false, message: '請輸入姓名。' }
  if (book.months.some((m) => monthHasWorkerKey(m, name))) {
    return { book, ok: false, message: `「${name}」已存在。` }
  }
  const months = book.months.map((m) => addWorkerToMonth(m, name))
  return {
    book: { ...book, months },
    ok: true,
    message: `已新增「${name}」至全書各月（各案場已補上空列）。`,
  }
}

/** 全書刪除人員：各月與各案場移除該鍵（日薪、格線、預支、調工、加班列） */
export function removeWorkerFromBook(
  book: SalaryBook,
  nameRaw: string,
): { book: SalaryBook; ok: boolean; message: string } {
  const name = nameRaw.trim()
  if (!name) return { book, ok: false, message: '請指定要刪除的人員。' }
  if (!book.months.some((m) => monthHasWorkerKey(m, name))) {
    return { book, ok: false, message: `找不到「${name}」。` }
  }
  if (isFixedMonthStaffName(name)) {
    return {
      book,
      ok: false,
      message: `「${name}」為每月固定人員，無法刪除。`,
    }
  }
  const months = book.months.map((m) => removeWorkerFromMonth(m, name))
  return {
    book: { ...book, months },
    ok: true,
    message: `已刪除「${name}」（全書各月）。`,
  }
}

export function newMonthSheet(label: string, dates: string[]): MonthSheetData {
  const { rateJun, rateTsai } = defaultRatesFebruary()
  const advances: Record<string, number[]> = {}
  const junAdjustDays: Record<string, number[]> = {}
  const tsaiAdjustDays: Record<string, number[]> = {}
  const junOtHours: Record<string, number[]> = {}
  const tsaiOtHours: Record<string, number[]> = {}
  for (const n of DEFAULT_STAFF) {
    advances[n] = Array(dates.length).fill(0)
    junAdjustDays[n] = Array(dates.length).fill(0)
    tsaiAdjustDays[n] = Array(dates.length).fill(0)
    junOtHours[n] = Array(dates.length).fill(0)
    tsaiOtHours[n] = Array(dates.length).fill(0)
  }
  return {
    id: `m-${label}-${Date.now()}`,
    label,
    dates,
    rateJun,
    rateTsai,
    blocks: [emptyBlock('新案場', dates.length)],
    advances,
    junAdjustDays,
    tsaiAdjustDays,
    junOtHours,
    tsaiOtHours,
  }
}

/**
 * 薪水「目前月表」下拉預設：任一日期欄落在今天所屬曆年、曆月之月表。
 * 無命中則第一張月表；無月表則空字串。
 */
export function pickActiveMonthIdForToday(months: readonly MonthSheetData[]): string {
  if (months.length === 0) return ''
  const now = new Date()
  const y = now.getFullYear()
  const mo = now.getMonth() + 1
  for (const sheet of months) {
    for (const iso of sheet.dates) {
      if (!iso || typeof iso !== 'string') continue
      const head = iso.trim().slice(0, 10)
      const m = /^(\d{4})-(\d{2})-/.exec(head)
      if (!m) continue
      const sy = parseInt(m[1]!, 10)
      const sm = parseInt(m[2]!, 10)
      if (sy === y && sm === mo) return sheet.id
    }
  }
  return months[0]!.id
}

/** 舊版 localStorage 缺欄時補齊（調工／蔡董調工）；並將案場名「鈞泩調工」併入「調工支援」 */
export function normalizeSalaryBook(book: SalaryBook): SalaryBook {
  const LEGACY_JUN_SITE = '鈞泩調工'
  const JUN_SITE = '調工支援'
  const bookRenamed: SalaryBook = {
    ...book,
    months: book.months.map((m) => ({
      ...m,
      blocks: m.blocks.map((b) =>
        b.siteName === LEGACY_JUN_SITE ? { ...b, siteName: JUN_SITE } : b,
      ),
    })),
  }
  const months = bookRenamed.months.map((m) => {
    let mm = reconcileLegacyWorkerNamesInMonth(m)
    mm = ensureFixedMonthStaffInSheet(mm)
    const len = mm.dates.length
    const junAdjustDays: Record<string, number[]> = { ...mm.junAdjustDays }
    const tsaiAdjustDays: Record<string, number[]> = { ...mm.tsaiAdjustDays }
    for (const n of DEFAULT_STAFF) {
      junAdjustDays[n] = padArray(junAdjustDays[n], len)
      tsaiAdjustDays[n] = padArray(tsaiAdjustDays[n], len)
    }
    return { ...mm, junAdjustDays, tsaiAdjustDays }
  })
  const withMonths = { ...bookRenamed, months }
  return {
    ...withMonths,
    periodColumns: autoPayrollPeriodColumns(inferPayrollYearFromBook(withMonths)),
  }
}

export function defaultSalaryBook(): SalaryBook {
  const year = 2026
  const months: MonthSheetData[] = []
  let seq = 0
  for (let mo = 1; mo <= 12; mo++) {
    const label = `${mo}月`
    const dates = defaultDatesForStandardMonth(year, mo)
    const sheet = newMonthSheet(label, dates)
    const withId: MonthSheetData = {
      ...sheet,
      id: `m-init-${year}-${String(mo).padStart(2, '0')}-${++seq}`,
    }
    if (mo === 2) {
      /** 與匯出檔「富邦」區塊一致之範例（可刪改） */
      const b0 = withId.blocks[0]
      b0.siteName = '富邦'
      b0.grid['蕭上彬'] = [
        1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1,
      ]
      b0.grid['楊家全'] = [
        1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1,
      ]
      b0.grid['劉子瑜'] = [
        1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1,
      ]
      b0.meal = [
        300, 300, 0, 0, 0, 0, 0, 0, 0, 0, 0, 300, 300, 0, 0, 300, 300,
      ]
    }
    months.push(withId)
  }
  return {
    version: 1,
    periodColumns: autoPayrollPeriodColumns(year),
    months,
  }
}

export function formatDateHeader(iso: string): string {
  const [, mo, d] = iso.split('-').map(Number)
  return `${mo}月${d}日`
}

/** 總表 hover 逐列：只標幾號（左欄已有月表名，不重複「◯月◯日」） */
export function formatSummaryTooltipDay(iso: string): string {
  const seg = iso.split('-')
  if (seg.length < 3) return ''
  const d = Number(seg[2])
  if (!Number.isFinite(d) || d <= 0) return ''
  return `${d}號`
}

export function allDaysInMonth(year: number, month1to12: number): string[] {
  const last = new Date(year, month1to12, 0).getDate()
  const ym = `${year}-${String(month1to12).padStart(2, '0')}`
  return Array.from({ length: last }, (_, i) => {
    const d = String(i + 1).padStart(2, '0')
    return `${ym}-${d}`
  })
}

/** 建立「n月」新表時的日期欄：2026 年 2 月沿用範例檔工作日集合，其餘為當月曆日 */
export function defaultDatesForStandardMonth(year: number, month1to12: number): string[] {
  if (year === 2026 && month1to12 === 2) return defaultFebruary2026Dates()
  return allDaysInMonth(year, month1to12)
}

/** 從既有月表日期欄推斷年份；無有效日期時預設 2026 */
export function inferPayrollYearFromBook(book: SalaryBook): number {
  for (const m of book.months) {
    for (const iso of m.dates) {
      if (typeof iso !== 'string' || iso.length < 4) continue
      const y = parseInt(iso.slice(0, 4), 10)
      if (Number.isFinite(y) && y >= 2000 && y <= 2100) return y
    }
  }
  return 2026
}

export function advanceSumInPeriod(
  book: SalaryBook,
  staffName: string,
  period: PeriodColumn,
): number {
  const bulk = sumMetricAcrossNonSummaryPeriods(
    book,
    staffName,
    period,
    advanceSumInPeriod,
  )
  if (bulk !== undefined) return bulk
  let s = 0
  for (const m of book.months) {
    if (!monthMatchesPeriodColumn(m, period)) continue
    const row = m.advances[staffName] ?? []
    for (let j = 0; j < m.dates.length; j++) {
      if (!dayColumnMatchesPeriod(m, j, period)) continue
      s += row[j] ?? 0
    }
  }
  return s
}

export function junOtHoursInPeriod(
  book: SalaryBook,
  staffName: string,
  period: PeriodColumn,
): number {
  const bulk = sumMetricAcrossNonSummaryPeriods(
    book,
    staffName,
    period,
    junOtHoursInPeriod,
  )
  if (bulk !== undefined) return bulk
  let h = 0
  for (const m of book.months) {
    if (!monthMatchesPeriodColumn(m, period)) continue
    const row = m.junOtHours[staffName] ?? []
    for (let j = 0; j < m.dates.length; j++) {
      if (!dayColumnMatchesPeriod(m, j, period)) continue
      h += row[j] ?? 0
    }
  }
  return h
}

export function junAdjustDaysInPeriod(
  book: SalaryBook,
  staffName: string,
  period: PeriodColumn,
): number {
  const bulk = sumMetricAcrossNonSummaryPeriods(
    book,
    staffName,
    period,
    junAdjustDaysInPeriod,
  )
  if (bulk !== undefined) return bulk
  let s = 0
  for (const m of book.months) {
    if (!monthMatchesPeriodColumn(m, period)) continue
    const row = m.junAdjustDays[staffName] ?? []
    for (let j = 0; j < m.dates.length; j++) {
      if (!dayColumnMatchesPeriod(m, j, period)) continue
      s += row[j] ?? 0
    }
  }
  return s
}

export function tsaiAdjustDaysInPeriod(
  book: SalaryBook,
  staffName: string,
  period: PeriodColumn,
): number {
  const bulk = sumMetricAcrossNonSummaryPeriods(
    book,
    staffName,
    period,
    tsaiAdjustDaysInPeriod,
  )
  if (bulk !== undefined) return bulk
  let s = 0
  for (const m of book.months) {
    if (!monthMatchesPeriodColumn(m, period)) continue
    const row = m.tsaiAdjustDays[staffName] ?? []
    for (let j = 0; j < m.dates.length; j++) {
      if (!dayColumnMatchesPeriod(m, j, period)) continue
      s += row[j] ?? 0
    }
  }
  return s
}

export function tsaiOtHoursInPeriod(
  book: SalaryBook,
  staffName: string,
  period: PeriodColumn,
): number {
  const bulk = sumMetricAcrossNonSummaryPeriods(
    book,
    staffName,
    period,
    tsaiOtHoursInPeriod,
  )
  if (bulk !== undefined) return bulk
  let h = 0
  for (const m of book.months) {
    if (!monthMatchesPeriodColumn(m, period)) continue
    const row = m.tsaiOtHours[staffName] ?? []
    for (let j = 0; j < m.dates.length; j++) {
      if (!dayColumnMatchesPeriod(m, j, period)) continue
      h += row[j] ?? 0
    }
  }
  return h
}

function rateJunForStaff(book: SalaryBook, staffName: string, period?: PeriodColumn): number {
  if (period?.monthSheetId) {
    const m = book.months.find((x) => x.id === period.monthSheetId)
    if (m) {
      const v = m.rateJun[staffName]
      if (v !== undefined && Number.isFinite(v)) return v
    }
    return 0
  }
  for (const m of book.months) {
    const v = m.rateJun[staffName]
    if (v !== undefined && Number.isFinite(v)) return v
  }
  return 0
}

function rateTsaiForStaff(book: SalaryBook, staffName: string, period?: PeriodColumn): number {
  if (period?.monthSheetId) {
    const m = book.months.find((x) => x.id === period.monthSheetId)
    if (m) {
      const v = m.rateTsai[staffName]
      if (v !== undefined && Number.isFinite(v)) return v
    }
    return 0
  }
  for (const m of book.months) {
    const v = m.rateTsai[staffName]
    if (v !== undefined && Number.isFinite(v)) return v
  }
  return 0
}

/** 與試算表「鈞泩加班費」：時薪 = 鈞泩日薪／8，再乘該期總加班時數 */
export function junOtPayInPeriod(
  book: SalaryBook,
  staffName: string,
  period: PeriodColumn,
): number {
  const bulk = sumMetricAcrossNonSummaryPeriods(
    book,
    staffName,
    period,
    junOtPayInPeriod,
  )
  if (bulk !== undefined) return bulk
  const h = junOtHoursInPeriod(book, staffName, period)
  return h * (rateJunForStaff(book, staffName, period) / 8)
}

/** 蔡董加班費：時薪 = 蔡董日薪／8 × 該期蔡董加班時數 */
export function tsaiOtPayInPeriod(
  book: SalaryBook,
  staffName: string,
  period: PeriodColumn,
): number {
  const bulk = sumMetricAcrossNonSummaryPeriods(
    book,
    staffName,
    period,
    tsaiOtPayInPeriod,
  )
  if (bulk !== undefined) return bulk
  const h = tsaiOtHoursInPeriod(book, staffName, period)
  return h * (rateTsaiForStaff(book, staffName, period) / 8)
}

/**
 * 實領薪水（分期間）：**鈞泩薪水 − 預支 + 鈞泩加班費 + 蔡董加班費 + 調工薪水 + 蔡董調工薪水**。
 *
 * - **鈞泩薪水**：各月·案場格線天數×該月鈞泩日薪加總（與總表「鈞泩薪水(未扣預支)」同義，**不含**調工）。
 * - **調工薪水**：調工天數×（該期鈞泩格線薪水合計÷格線天數）；無格線天數時改為×鈞泩日薪。
 * - **蔡董**：**不**以格線×蔡董日薪計入實領；蔡董日薪僅用於 **蔡董調工薪水**（蔡董調工×蔡董日薪）與 **蔡董加班費**（蔡董加班時數×蔡董日薪÷8）。
 */
export function netTakeHomePayInPeriod(
  book: SalaryBook,
  staffName: string,
  period: PeriodColumn,
): number {
  const bulk = sumMetricAcrossNonSummaryPeriods(
    book,
    staffName,
    period,
    netTakeHomePayInPeriod,
  )
  if (bulk !== undefined) return bulk
  const rt = rateTsaiForStaff(book, staffName, period)
  const tAdj = tsaiAdjustDaysInPeriod(book, staffName, period)
  const adv = advanceSumInPeriod(book, staffName, period)
  const jOt = junOtPayInPeriod(book, staffName, period)
  const tOt = tsaiOtPayInPeriod(book, staffName, period)
  const junSalary = junGridSalaryTotalInPeriod(book, staffName, period)
  const junAdjustPay = junAdjustPayInPeriod(book, staffName, period)
  const tsaiAdjustPay = tAdj * rt
  return junSalary - adv + jOt + tOt + junAdjustPay + tsaiAdjustPay
}

/** 總表儲存格 hover 拆解：標籤＋金額（實領列之預支項為負值，與加總一致） */
export type SummaryCellBreakdownLine = {
  label: string
  amount: number
  /** 逐日「金額／薪水」列：關閉「顯示當日金額」時僅列日期、隱藏右欄數字 */
  isDailyMoney?: boolean
  /** 由 {@link applyDailyMoneyBreakdownVisibility} 設定；UI 顯示為「—」 */
  hideAmount?: boolean
}

/** 依總表選項：關閉時為所有 `isDailyMoney` 列加上 `hideAmount` */
export function applyDailyMoneyBreakdownVisibility(
  lines: SummaryCellBreakdownLine[],
  showDailyMoney: boolean,
): SummaryCellBreakdownLine[] {
  if (showDailyMoney) return lines
  return lines.map((l) =>
    l.isDailyMoney ? { ...l, hideAmount: true } : l,
  )
}

/** 隱藏金額時左欄去掉結尾（…元）括號，只留月表＋幾號 */
export function summaryBreakdownLineDisplayLabel(
  line: SummaryCellBreakdownLine,
): string {
  if (!line.hideAmount || !line.isDailyMoney) return line.label
  return line.label.replace(/（[^）]+）\s*$/u, '').trimEnd()
}

/**
 * 與 {@link netTakeHomePayInPeriod} 同一套加減項；供總表浮動提示逐項顯示金額。
 * （逐日金額列帶 `isDailyMoney`；是否隱藏由 {@link applyDailyMoneyBreakdownVisibility} 在總表組裝時套用。）
 */
export function netTakeHomeBreakdownLines(
  book: SalaryBook,
  staffName: string,
  period: PeriodColumn,
): SummaryCellBreakdownLine[] {
  const rt = rateTsaiForStaff(book, staffName, period)
  const gridDays = junWorkDaysInPeriod(book, staffName, period)
  const tAdj = tsaiAdjustDaysInPeriod(book, staffName, period)
  const adv = advanceSumInPeriod(book, staffName, period)
  const jOt = junOtPayInPeriod(book, staffName, period)
  const tOt = tsaiOtPayInPeriod(book, staffName, period)
  const junAdjustPay = junAdjustPayInPeriod(book, staffName, period)
  const tsaiAdjustPay = tAdj * rt

  const junSalaryLines = withNetIncomePlusOnFirstLine(
    junGridSalaryPopoverLines(book, staffName, period),
  )

  const advPerDate = staffPerDateColumnLines(
    book,
    staffName,
    period,
    (m) => m.advances[staffName],
    '預支·元',
    true,
  )
  const advLines: SummaryCellBreakdownLine[] =
    advPerDate.length > 0
      ? advPerDate.map((l) => ({
          label: `− ${l.label.replace(/^\s+/, '')}`,
          amount: -l.amount,
          isDailyMoney: l.isDailyMoney,
        }))
      : [{ label: '− 預支', amount: -adv }]

  const tsaiAdjDetail = staffPerDateTsaiAdjustMoneyLines(book, staffName, period)
  const tsaiAdjLines: SummaryCellBreakdownLine[] =
    tsaiAdjDetail.length > 0
      ? [
          { label: '＋ 蔡董調工薪水（蔡董調工×蔡董日薪）', amount: tsaiAdjustPay },
          ...tsaiAdjDetail,
        ]
      : [{ label: '＋ 蔡董調工薪水（蔡董調工×蔡董日薪）', amount: tsaiAdjustPay }]

  const junAdjDetail = staffPerDateJunAdjustPayLines(book, staffName, period)
  const junAdjHead: SummaryCellBreakdownLine = {
    label:
      gridDays > 0
        ? '＋ 調工薪水（調工天數×鈞泩格線薪水÷格線天數）'
        : '＋ 調工薪水（調工天數×鈞泩日薪）',
    amount: junAdjustPay,
  }
  const junAdjLines: SummaryCellBreakdownLine[] =
    junAdjDetail.length > 0 ? [junAdjHead, ...junAdjDetail] : [junAdjHead]

  return [
    ...junSalaryLines,
    ...advLines,
    { label: '＋ 鈞泩加班費', amount: jOt },
    { label: '＋ 蔡董加班費（蔡董加班時數×蔡董日薪÷8）', amount: tOt },
    ...junAdjLines,
    ...tsaiAdjLines,
  ]
}

export type SummaryBlockRow = {
  key: string
  label: string
  /** 各分期欄數值 */
  cols: number[]
  /** 各分期欄 hover 拆解（與 cols 等長；缺則畫面以單行帶過） */
  cellBreakdowns?: (SummaryCellBreakdownLine[] | undefined)[]
}

/** 總表實領列區塊名稱；與 {@link netTakeHomePayInPeriod} 一致（鈞泩薪水等 − 本分期預支 ＋ 加班與調工等）。 */
export const NET_TAKE_HOME_ROW_PREFIX = '實領薪水（已扣預支）'

/**
 * Excel「員工總出工及薪水計算」工作表：各資料區塊標題列（不含姓名列、不含「·總計」）。
 * 橫向第一列另有分期標題（如 3/11~3/25、3/26~4/10）；匯入時另會掃到「鈞泩薪／蔡董薪」表頭列（月表日薪，非此處數字區塊）。
 */
export const PAYROLL_SUMMARY_SHEET_SECTION_TITLES = [
  '鈞泩出工數',
  '鈞泩薪水(未扣預支)',
  '預支',
  '鈞泩加班時數',
  '鈞泩加班費',
  '調工',
  '調工薪水',
  '蔡董出工數',
  '蔡董薪水(未扣預支)',
  '蔡董調工',
  '蔡董調工薪水',
  '蔡董加班時數',
  '蔡董加班費',
  NET_TAKE_HOME_ROW_PREFIX,
] as const

const SUMMARY_ROW_PREFIXES = [
  'jd',
  'jg',
  'adv',
  'jot',
  'jop',
  'jad',
  'jap',
  'td',
  'tg',
  'tad',
  'tap',
  'tot',
  'top',
  'net',
] as const

type SummaryRowPrefix = (typeof SUMMARY_ROW_PREFIXES)[number]

type ParsedSummaryRowKey =
  | { prefix: SummaryRowPrefix; mode: 'staff'; staffName: string }
  | { prefix: SummaryRowPrefix; mode: 'total' }

function parseStaffSummaryRowKey(key: string): ParsedSummaryRowKey | null {
  for (const pr of SUMMARY_ROW_PREFIXES) {
    const head = `${pr}-`
    if (!key.startsWith(head)) continue
    const rest = key.slice(head.length)
    if (rest === 'total' || rest === 'sum') return { prefix: pr, mode: 'total' }
    return { prefix: pr, mode: 'staff', staffName: rest }
  }
  return null
}

/**
 * 僅用於總表「實領薪水」欄 hover 底部：本分期工數、預支、加班時數等（人員列為該員；總計列為全員加總）。
 */
export function payrollSummaryTooltipFooterTotals(
  book: SalaryBook,
  period: PeriodColumn,
  rowKey: string,
): SummaryCellBreakdownLine[] {
  const meta = parseStaffSummaryRowKey(rowKey)
  if (!meta) return []
  const staff = staffKeysAcrossBook(book)
  if (meta.mode === 'total') {
    const junD = staff.reduce((s, n) => s + junWorkDaysInPeriod(book, n, period), 0)
    const junAdj = staff.reduce((s, n) => s + junAdjustDaysInPeriod(book, n, period), 0)
    const tsaiAdj = staff.reduce((s, n) => s + tsaiAdjustDaysInPeriod(book, n, period), 0)
    const adv = staff.reduce((s, n) => s + advanceSumInPeriod(book, n, period), 0)
    const junH = staff.reduce((s, n) => s + junOtHoursInPeriod(book, n, period), 0)
    const tsaiOt = staff.reduce((s, n) => s + tsaiOtHoursInPeriod(book, n, period), 0)
    const periodWorkDays = junD + tsaiAdj + junAdj
    return [
      { label: '鈞泩總工數', amount: junD },
      { label: '調工總工數', amount: junAdj },
      { label: '蔡董調工總工數', amount: tsaiAdj },
      {
        label: '本期總工數（鈞泩工數＋蔡董調工總工數＋調工總工數）',
        amount: periodWorkDays,
      },
      { label: '預支總計', amount: adv },
      { label: '鈞泩加班總時數', amount: junH },
      { label: '蔡董加班總時數', amount: tsaiOt },
    ]
  }
  const name = meta.staffName
  const junD = junWorkDaysInPeriod(book, name, period)
  const junAdj = junAdjustDaysInPeriod(book, name, period)
  const tsaiAdj = tsaiAdjustDaysInPeriod(book, name, period)
  const periodWorkDays = junD + tsaiAdj + junAdj
  return [
    { label: '鈞泩總工數', amount: junD },
    { label: '調工總工數', amount: junAdj },
    { label: '蔡董調工總工數', amount: tsaiAdj },
    {
      label: '本期總工數（鈞泩工數＋蔡董調工總工數＋調工總工數）',
      amount: periodWorkDays,
    },
    { label: '預支總計', amount: advanceSumInPeriod(book, name, period) },
    { label: '鈞泩加班總時數', amount: junOtHoursInPeriod(book, name, period) },
    { label: '蔡董加班總時數', amount: tsaiOtHoursInPeriod(book, name, period) },
  ]
}

/** 「蔡董調工薪水」欄位值：各分期為調工天數×該期蔡董日薪；總結欄為各分期該乘積加總（非「總調工×單一日薪」）。 */
function tapRowCellAmount(
  book: SalaryBook,
  staffName: string,
  period: PeriodColumn,
): number {
  if (!period.summaryTotal) {
    return (
      tsaiAdjustDaysInPeriod(book, staffName, period) *
      rateTsaiForStaff(book, staffName, period)
    )
  }
  let s = 0
  for (const p of book.periodColumns) {
    if (p.summaryTotal) continue
    s +=
      tsaiAdjustDaysInPeriod(book, staffName, p) *
      rateTsaiForStaff(book, staffName, p)
  }
  return s
}

function valueForSummaryPrefix(
  prefix: SummaryRowPrefix,
  book: SalaryBook,
  staffName: string,
  period: PeriodColumn,
): number {
  switch (prefix) {
    case 'jd':
    case 'td':
      return junWorkDaysInPeriod(book, staffName, period)
    case 'jg':
      return junGridSalaryTotalInPeriod(book, staffName, period)
    case 'tg':
      /** 總表列「蔡董薪水(未扣預支)」：格線不計蔡董薪，固定 0（蔡董日薪僅用於調工薪水與加班費） */
      return 0
    case 'adv':
      return advanceSumInPeriod(book, staffName, period)
    case 'jot':
      return junOtHoursInPeriod(book, staffName, period)
    case 'tot':
      return tsaiOtHoursInPeriod(book, staffName, period)
    case 'jop':
      return junOtPayInPeriod(book, staffName, period)
    case 'top':
      return tsaiOtPayInPeriod(book, staffName, period)
    case 'jad':
      return junAdjustDaysInPeriod(book, staffName, period)
    case 'tad':
      return tsaiAdjustDaysInPeriod(book, staffName, period)
    case 'jap':
      return junAdjustPayInPeriod(book, staffName, period)
    case 'tap':
      return tapRowCellAmount(book, staffName, period)
    case 'net':
      return netTakeHomePayInPeriod(book, staffName, period)
    default:
      return 0
  }
}

/** 格線：依「月表＋案場」拆開之天數（與 {@link junWorkDaysInPeriod} 加總一致） */
type GridSiteDayChunk = {
  month: MonthSheetData
  siteName: string
  days: number
  block: SiteBlock
}

function collectGridSiteDayChunks(
  book: SalaryBook,
  staffName: string,
  period: PeriodColumn,
): GridSiteDayChunk[] {
  const out: GridSiteDayChunk[] = []
  for (const m of book.months) {
    if (!monthMatchesPeriodColumn(m, period)) continue
    for (const b of m.blocks) {
      let d = 0
      const row = padArray(b.grid[staffName], m.dates.length)
      for (let j = 0; j < m.dates.length; j++) {
        if (!dayColumnMatchesPeriod(m, j, period)) continue
        d += row[j] ?? 0
      }
      if (d !== 0) out.push({ month: m, siteName: b.siteName, days: d, block: b })
    }
  }
  return out
}

/** 總表 hover：某案場區塊內逐日格線（含幾月幾號）＋小計 */
function gridSiteChunkDayDetailLines(
  c: GridSiteDayChunk,
  staffName: string,
  period: PeriodColumn,
  kind: 'gridDays' | 'junPay',
): SummaryCellBreakdownLine[] {
  const m = c.month
  const row = padArray(c.block.grid[staffName], m.dates.length)
  const rj = m.rateJun[staffName] ?? 0
  const detail: SummaryCellBreakdownLine[] = []
  let sub = 0
  for (let j = 0; j < m.dates.length; j++) {
    if (!dayColumnMatchesPeriod(m, j, period)) continue
    const day = row[j] ?? 0
    if (day === 0) continue
    const iso = m.dates[j] ?? ''
    const amt = kind === 'gridDays' ? day : day * rj
    sub += amt
    const unit = kind === 'gridDays' ? '天' : '元'
    detail.push({
      label: `　${m.label} ${formatSummaryTooltipDay(iso)}（${unit}）`,
      amount: amt,
      ...(kind === 'junPay' ? { isDailyMoney: true } : {}),
    })
  }
  if (detail.length === 0) return []
  const unitWord = kind === 'gridDays' ? '天' : '元'
  return [
    { label: `── ${m.label}·${c.siteName} 小計（${unitWord}）`, amount: sub },
    ...detail,
  ]
}

/** 總表 hover：依月表日期欄逐日列出某欄數值（僅非 0） */
function staffPerDateColumnLines(
  book: SalaryBook,
  _staffName: string,
  period: PeriodColumn,
  rowFromMonth: (mo: MonthSheetData) => number[] | undefined,
  unitText: string,
  markDailyMoney = false,
): SummaryCellBreakdownLine[] {
  const lines: SummaryCellBreakdownLine[] = []
  for (const m of book.months) {
    if (!monthMatchesPeriodColumn(m, period)) continue
    const row = padArray(rowFromMonth(m), m.dates.length)
    for (let j = 0; j < m.dates.length; j++) {
      if (!dayColumnMatchesPeriod(m, j, period)) continue
      const v = row[j] ?? 0
      if (v === 0) continue
      const iso = m.dates[j] ?? ''
      lines.push({
        label: `　${m.label} ${formatSummaryTooltipDay(iso)}（${unitText}）`,
        amount: v,
        ...(markDailyMoney ? { isDailyMoney: true } : {}),
      })
    }
  }
  return lines
}

/** 蔡董調工：逐日天數×該月蔡董日薪（元） */
function staffPerDateTsaiAdjustMoneyLines(
  book: SalaryBook,
  staffName: string,
  period: PeriodColumn,
): SummaryCellBreakdownLine[] {
  const lines: SummaryCellBreakdownLine[] = []
  for (const m of book.months) {
    if (!monthMatchesPeriodColumn(m, period)) continue
    const row = padArray(m.tsaiAdjustDays[staffName], m.dates.length)
    const rt = m.rateTsai[staffName] ?? 0
    for (let j = 0; j < m.dates.length; j++) {
      if (!dayColumnMatchesPeriod(m, j, period)) continue
      const days = row[j] ?? 0
      if (days === 0) continue
      const iso = m.dates[j] ?? ''
      lines.push({
        label: `　${m.label} ${formatSummaryTooltipDay(iso)}（蔡董調工·元）`,
        amount: days * rt,
        isDailyMoney: true,
      })
    }
  }
  return lines
}

/** 調工薪水：逐日調工天數×（該期鈞泩格線薪水÷格線天數）；該期無格線天數時改×鈞泩日薪 */
function staffPerDateJunAdjustPayLines(
  book: SalaryBook,
  staffName: string,
  period: PeriodColumn,
): SummaryCellBreakdownLine[] {
  const gridDays = junWorkDaysInPeriod(book, staffName, period)
  const junSal = junGridSalaryTotalInPeriod(book, staffName, period)
  const unit = gridDays > 0 ? junSal / gridDays : rateJunForStaff(book, staffName, period)
  const lines: SummaryCellBreakdownLine[] = []
  for (const m of book.months) {
    if (!monthMatchesPeriodColumn(m, period)) continue
    const row = padArray(m.junAdjustDays[staffName], m.dates.length)
    for (let j = 0; j < m.dates.length; j++) {
      if (!dayColumnMatchesPeriod(m, j, period)) continue
      const days = row[j] ?? 0
      if (days === 0) continue
      const iso = m.dates[j] ?? ''
      lines.push({
        label: `　${m.label} ${formatSummaryTooltipDay(iso)}（調工薪水·元）`,
        amount: days * unit,
        isDailyMoney: true,
      })
    }
  }
  return lines
}

/** 逐日加班時數×該期日薪÷8（與 {@link junOtPayInPeriod}／{@link tsaiOtPayInPeriod} 使用之期別日薪一致） */
function staffPerDateOtPayLines(
  book: SalaryBook,
  staffName: string,
  period: PeriodColumn,
  rowFromMonth: (m: MonthSheetData) => number[] | undefined,
  mode: 'jun' | 'tsai',
): SummaryCellBreakdownLine[] {
  const rDay =
    mode === 'jun'
      ? rateJunForStaff(book, staffName, period)
      : rateTsaiForStaff(book, staffName, period)
  const hourly = rDay / 8
  const who = mode === 'jun' ? '鈞泩' : '蔡董'
  const lines: SummaryCellBreakdownLine[] = []
  for (const m of book.months) {
    if (!monthMatchesPeriodColumn(m, period)) continue
    const row = padArray(rowFromMonth(m), m.dates.length)
    for (let j = 0; j < m.dates.length; j++) {
      if (!dayColumnMatchesPeriod(m, j, period)) continue
      const h = row[j] ?? 0
      if (h === 0) continue
      const iso = m.dates[j] ?? ''
      lines.push({
        label: `　${m.label} ${formatSummaryTooltipDay(iso)}（${who}加班費·元）`,
        amount: h * hourly,
        isDailyMoney: true,
      })
    }
  }
  return lines
}

/** 總表「鈞泩薪水」hover：案場小計＋逐日格線金額；無格線時改為日薪說明三列 */
function junGridSalaryPopoverLines(
  book: SalaryBook,
  staffName: string,
  period: PeriodColumn,
): SummaryCellBreakdownLine[] {
  const chunks = collectGridSiteDayChunks(book, staffName, period)
  if (chunks.length === 0) {
    const d = junWorkDaysInPeriod(book, staffName, period)
    const r = rateJunForStaff(book, staffName, period)
    const total = junGridSalaryTotalInPeriod(book, staffName, period)
    return [
      { label: '案場格線出工天數', amount: d },
      { label: '鈞泩日薪（元／天）', amount: r },
      { label: '鈞泩格線薪水合計', amount: total },
    ]
  }
  const flat: SummaryCellBreakdownLine[] = []
  for (const c of chunks) {
    flat.push(...gridSiteChunkDayDetailLines(c, staffName, period, 'junPay'))
  }
  if (chunks.length > 1) {
    flat.push({
      label: '── 鈞泩薪水(格線)合計',
      amount: junGridSalaryTotalInPeriod(book, staffName, period),
    })
  }
  return flat
}

/** 實領區塊第一列加上「＋」（鈞泩薪水明細用） */
function withNetIncomePlusOnFirstLine(
  lines: SummaryCellBreakdownLine[],
): SummaryCellBreakdownLine[] {
  if (lines.length === 0) return lines
  const [first, ...rest] = lines
  const lbl = first.label.startsWith('──')
    ? `＋ ${first.label.replace(/^──\s*/, '')}`
    : `＋ ${first.label}`
  return [{ ...first, label: lbl }, ...rest]
}

function junSalaryLinesBySite(
  book: SalaryBook,
  staffName: string,
  period: PeriodColumn,
): SummaryCellBreakdownLine[] {
  return collectGridSiteDayChunks(book, staffName, period).map((c) => {
    const rj = c.month.rateJun[staffName] ?? 0
    return {
      label: `${c.month.label} · ${c.siteName}（格線×鈞泩日薪）`,
      amount: c.days * rj,
    }
  })
}

/** 該期鈞泩格線薪水加總（各月·案場依當月 rateJun），等同 {@link junSalaryLinesBySite} 金額合計 */
function junGridSalaryTotalInPeriod(
  book: SalaryBook,
  staffName: string,
  period: PeriodColumn,
): number {
  const bulk = sumMetricAcrossNonSummaryPeriods(
    book,
    staffName,
    period,
    junGridSalaryTotalInPeriod,
  )
  if (bulk !== undefined) return bulk
  return junSalaryLinesBySite(book, staffName, period).reduce((s, ln) => s + ln.amount, 0)
}

/**
 * 調工薪水：調工天數×（該期鈞泩格線薪水合計÷格線天數），與「用鈞泩薪水去算」一致；
 * 該期無格線天數時改為×鈞泩日薪。
 */
export function junAdjustPayInPeriod(
  book: SalaryBook,
  staffName: string,
  period: PeriodColumn,
): number {
  const bulk = sumMetricAcrossNonSummaryPeriods(
    book,
    staffName,
    period,
    junAdjustPayInPeriod,
  )
  if (bulk !== undefined) return bulk
  const jAdj = junAdjustDaysInPeriod(book, staffName, period)
  if (jAdj === 0) return 0
  const gridDays = junWorkDaysInPeriod(book, staffName, period)
  if (gridDays > 0) {
    const total = junGridSalaryTotalInPeriod(book, staffName, period)
    return jAdj * (total / gridDays)
  }
  return jAdj * rateJunForStaff(book, staffName, period)
}

function ensureBreakdownLines(
  lines: SummaryCellBreakdownLine[],
  fallback: SummaryCellBreakdownLine,
): SummaryCellBreakdownLine[] {
  return lines.length > 0 ? lines : [fallback]
}

function staffBreakdownTotals(
  book: SalaryBook,
  staffOrder: string[],
  period: PeriodColumn,
  prefix: SummaryRowPrefix,
): SummaryCellBreakdownLine[] {
  return staffOrder.map((n) => ({
    label: n,
    amount: valueForSummaryPrefix(prefix, book, n, period),
  }))
}

/**
 * 為 {@link buildStaffSummaryRows} 產生與每格數值對應的拆解列（人員列：公式或依月加總；總計列：依人員加總）。
 * @param showDailyMoney 為真時顯示逐日金額右欄；預設假（僅列日期等，金額隱藏）
 */
export function computeStaffSummaryCellBreakdowns(
  row: SummaryBlockRow,
  book: SalaryBook,
  staffOrder: string[],
  showDailyMoney = false,
): (SummaryCellBreakdownLine[] | undefined)[] {
  const pc = book.periodColumns
  const meta = parseStaffSummaryRowKey(row.key)
  if (!meta || row.cols.length !== pc.length) {
    return pc.map(() => undefined)
  }

  const finish = (lines: SummaryCellBreakdownLine[]) =>
    applyDailyMoneyBreakdownVisibility(lines, showDailyMoney)

  return pc.map((period, i) => {
    if (meta.mode === 'total') {
      return finish(staffBreakdownTotals(book, staffOrder, period, meta.prefix))
    }

    const name = meta.staffName
    const pr = meta.prefix

    if (period.summaryTotal) {
      const subs = book.periodColumns.filter((p) => !p.summaryTotal)
      const lines: SummaryCellBreakdownLine[] = [
        { label: '總結（各分期加總）', amount: row.cols[i] ?? 0 },
        ...subs.map((subP) => ({
          label: `　${subP.label}`,
          amount: valueForSummaryPrefix(pr, book, name, subP),
        })),
      ]
      return finish(lines)
    }

    switch (pr) {
      case 'jd':
      case 'td': {
        const chunks = collectGridSiteDayChunks(book, name, period)
        const lines = chunks.flatMap((c) =>
          gridSiteChunkDayDetailLines(c, name, period, 'gridDays'),
        )
        if (chunks.length > 1) {
          lines.push({
            label: '── 本分期格線天數合計',
            amount: row.cols[i] ?? 0,
          })
        }
        return finish(
          ensureBreakdownLines(lines, {
            label: '本分期格線天數合計',
            amount: row.cols[i] ?? 0,
          }),
        )
      }
      case 'jg': {
        return finish(junGridSalaryPopoverLines(book, name, period))
      }
      case 'tg': {
        return finish([
          {
            label: '蔡董格線不計入本列（實領僅計蔡董調工薪水＋蔡董加班費）',
            amount: 0,
          },
        ])
      }
      case 'adv': {
        const lines = staffPerDateColumnLines(
          book,
          name,
          period,
          (m) => m.advances[name],
          '預支·元',
          true,
        )
        return finish(
          ensureBreakdownLines(lines, {
            label: '本分期預支加總',
            amount: row.cols[i] ?? 0,
          }),
        )
      }
      case 'jot': {
        const lines = staffPerDateColumnLines(
          book,
          name,
          period,
          (m) => m.junOtHours[name],
          '鈞泩加班·時',
        )
        return finish(
          ensureBreakdownLines(lines, {
            label: '本分期鈞泩加班時數',
            amount: row.cols[i] ?? 0,
          }),
        )
      }
      case 'tot': {
        const lines = staffPerDateColumnLines(
          book,
          name,
          period,
          (m) => m.tsaiOtHours[name],
          '蔡董加班·時',
        )
        return finish(
          ensureBreakdownLines(lines, {
            label: '本分期蔡董加班時數',
            amount: row.cols[i] ?? 0,
          }),
        )
      }
      case 'jop': {
        const h = junOtHoursInPeriod(book, name, period)
        const rj = rateJunForStaff(book, name, period)
        const hourly = rj / 8
        const payDetail = staffPerDateOtPayLines(
          book,
          name,
          period,
          (m) => m.junOtHours[name],
          'jun',
        )
        return finish([
          ...payDetail,
          { label: '鈞泩加班時數合計', amount: h },
          { label: '時薪（鈞泩日薪÷8）', amount: hourly },
          { label: '鈞泩加班費（時數×時薪）', amount: h * hourly },
        ])
      }
      case 'top': {
        const h = tsaiOtHoursInPeriod(book, name, period)
        const rt = rateTsaiForStaff(book, name, period)
        const hourly = rt / 8
        const payDetail = staffPerDateOtPayLines(
          book,
          name,
          period,
          (m) => m.tsaiOtHours[name],
          'tsai',
        )
        return finish([
          ...payDetail,
          { label: '蔡董加班時數合計', amount: h },
          { label: '時薪（蔡董日薪÷8）', amount: hourly },
          { label: '蔡董加班費（時數×時薪）', amount: h * hourly },
        ])
      }
      case 'jad': {
        const lines = staffPerDateColumnLines(
          book,
          name,
          period,
          (m) => m.junAdjustDays[name],
          '調工支援·天',
        )
        return finish(
          ensureBreakdownLines(lines, {
            label: '本分期調工天數',
            amount: row.cols[i] ?? 0,
          }),
        )
      }
      case 'tad': {
        const lines = staffPerDateColumnLines(
          book,
          name,
          period,
          (m) => m.tsaiAdjustDays[name],
          '蔡董調工·天',
        )
        return finish(
          ensureBreakdownLines(lines, {
            label: '本分期蔡董調工天數',
            amount: row.cols[i] ?? 0,
          }),
        )
      }
      case 'jap': {
        const d = junAdjustDaysInPeriod(book, name, period)
        const gridDays = junWorkDaysInPeriod(book, name, period)
        const junSal = junGridSalaryTotalInPeriod(book, name, period)
        const perDay = staffPerDateJunAdjustPayLines(book, name, period)
        if (gridDays <= 0) {
          const r = rateJunForStaff(book, name, period)
          const total = d * r
          if (perDay.length > 0) {
            return finish([...perDay, { label: '── 調工薪水合計', amount: total }])
          }
          return finish([
            { label: '調工天數', amount: d },
            { label: '鈞泩日薪（該期無格線天數時）', amount: r },
            { label: '調工薪水', amount: total },
          ])
        }
        const unit = junSal / gridDays
        const total = d * unit
        const formulaCore = [
          { label: '調工天數', amount: d },
          { label: '該期鈞泩格線薪水合計', amount: junSal },
          { label: '格線出工天數', amount: gridDays },
          { label: '單日換算（鈞泩格線薪水÷天數）', amount: unit },
        ]
        if (perDay.length > 0) {
          return finish([
            ...perDay,
            ...formulaCore,
            { label: '── 調工薪水合計', amount: total },
          ])
        }
        return finish([
          ...formulaCore,
          { label: '調工薪水（天數×單日換算）', amount: total },
        ])
      }
      case 'tap': {
        const d = tsaiAdjustDaysInPeriod(book, name, period)
        const r = rateTsaiForStaff(book, name, period)
        const perDay = staffPerDateTsaiAdjustMoneyLines(book, name, period)
        const total = d * r
        if (perDay.length > 0) {
          return finish([...perDay, { label: '── 蔡董調工薪水合計', amount: total }])
        }
        return finish([
          { label: '蔡董調工天數', amount: d },
          { label: '蔡董日薪（元／天）', amount: r },
          { label: '蔡董調工薪水（天數×日薪）', amount: total },
        ])
      }
      case 'net':
        return finish(netTakeHomeBreakdownLines(book, name, period))
    }
  })
}

/** 對應「員工總出工及薪水計算」：列順序與 {@link PAYROLL_SUMMARY_SHEET_SECTION_TITLES} 一致（由月表加總）。 */
export function buildStaffSummaryRows(
  book: SalaryBook,
  options?: { showDailyMoney?: boolean },
): SummaryBlockRow[] {
  const showDailyMoney = options?.showDailyMoney ?? false
  const staff = staffKeysAcrossBook(book)
  const pc = book.periodColumns
  const rows: SummaryBlockRow[] = []

  for (const name of staff) {
    rows.push({
      key: `jd-${name}`,
      label: `鈞泩出工數·${name}`,
      cols: pc.map((p) => junWorkDaysInPeriod(book, name, p)),
    })
  }
  rows.push({
    key: 'jd-total',
    label: '鈞泩出工數·總計',
    cols: pc.map((p) =>
      staff.reduce((s, name) => s + junWorkDaysInPeriod(book, name, p), 0),
    ),
  })

  for (const name of staff) {
    rows.push({
      key: `jg-${name}`,
      label: `鈞泩薪水(未扣預支)·${name}`,
      cols: pc.map((p) => junGridSalaryTotalInPeriod(book, name, p)),
    })
  }
  rows.push({
    key: 'jg-total',
    label: '鈞泩薪水(未扣預支)·總計',
    cols: pc.map((p) =>
      staff.reduce((s, name) => s + junGridSalaryTotalInPeriod(book, name, p), 0),
    ),
  })

  for (const name of staff) {
    rows.push({
      key: `adv-${name}`,
      label: `預支·${name}`,
      cols: pc.map((p) => advanceSumInPeriod(book, name, p)),
    })
  }
  rows.push({
    key: 'adv-total',
    label: '預支·總計',
    cols: pc.map((p) =>
      staff.reduce((s, name) => s + advanceSumInPeriod(book, name, p), 0),
    ),
  })

  for (const name of staff) {
    rows.push({
      key: `jot-${name}`,
      label: `鈞泩加班時數·${name}`,
      cols: pc.map((p) => junOtHoursInPeriod(book, name, p)),
    })
  }
  rows.push({
    key: 'jot-total',
    label: '鈞泩加班時數·總計',
    cols: pc.map((p) =>
      staff.reduce((s, name) => s + junOtHoursInPeriod(book, name, p), 0),
    ),
  })

  for (const name of staff) {
    rows.push({
      key: `jop-${name}`,
      label: `鈞泩加班費·${name}`,
      cols: pc.map((p) => junOtPayInPeriod(book, name, p)),
    })
  }
  rows.push({
    key: 'jop-total',
    label: '鈞泩加班費·總計',
    cols: pc.map((p) =>
      staff.reduce((s, name) => s + junOtPayInPeriod(book, name, p), 0),
    ),
  })

  for (const name of staff) {
    rows.push({
      key: `jad-${name}`,
      label: `調工·${name}`,
      cols: pc.map((p) => junAdjustDaysInPeriod(book, name, p)),
    })
  }
  rows.push({
    key: 'jad-total',
    label: '調工·總計',
    cols: pc.map((p) =>
      staff.reduce((s, name) => s + junAdjustDaysInPeriod(book, name, p), 0),
    ),
  })

  for (const name of staff) {
    rows.push({
      key: `jap-${name}`,
      label: `調工薪水·${name}`,
      cols: pc.map((p) => junAdjustPayInPeriod(book, name, p)),
    })
  }
  rows.push({
    key: 'jap-total',
    label: '調工薪水·總計',
    cols: pc.map((p) =>
      staff.reduce((s, name) => s + junAdjustPayInPeriod(book, name, p), 0),
    ),
  })

  /** 與「鈞泩出工數」同源：案場格線天數（Excel 另列蔡董出工數時數值與此一致） */
  for (const name of staff) {
    rows.push({
      key: `td-${name}`,
      label: `蔡董出工數·${name}`,
      cols: pc.map((p) => junWorkDaysInPeriod(book, name, p)),
    })
  }
  rows.push({
    key: 'td-total',
    label: '蔡董出工數·總計',
    cols: pc.map((p) =>
      staff.reduce((s, name) => s + junWorkDaysInPeriod(book, name, p), 0),
    ),
  })

  for (const name of staff) {
    rows.push({
      key: `tg-${name}`,
      label: `蔡董薪水(未扣預支)·${name}`,
      cols: pc.map(() => 0),
    })
  }
  rows.push({
    key: 'tg-total',
    label: '蔡董薪水(未扣預支)·總計',
    cols: pc.map(() => 0),
  })

  for (const name of staff) {
    rows.push({
      key: `tad-${name}`,
      label: `蔡董調工·${name}`,
      cols: pc.map((p) => tsaiAdjustDaysInPeriod(book, name, p)),
    })
  }
  rows.push({
    key: 'tad-total',
    label: '蔡董調工·總計',
    cols: pc.map((p) =>
      staff.reduce((s, name) => s + tsaiAdjustDaysInPeriod(book, name, p), 0),
    ),
  })

  for (const name of staff) {
    rows.push({
      key: `tap-${name}`,
      label: `蔡董調工薪水·${name}`,
      cols: pc.map((p) => tapRowCellAmount(book, name, p)),
    })
  }
  rows.push({
    key: 'tap-total',
    label: '蔡董調工薪水·總計',
    cols: pc.map((p) =>
      staff.reduce((s, name) => s + tapRowCellAmount(book, name, p), 0),
    ),
  })

  for (const name of staff) {
    rows.push({
      key: `tot-${name}`,
      label: `蔡董加班時數·${name}`,
      cols: pc.map((p) => tsaiOtHoursInPeriod(book, name, p)),
    })
  }
  rows.push({
    key: 'tot-sum',
    label: '蔡董加班時數·總計',
    cols: pc.map((p) =>
      staff.reduce((s, name) => s + tsaiOtHoursInPeriod(book, name, p), 0),
    ),
  })

  for (const name of staff) {
    rows.push({
      key: `top-${name}`,
      label: `蔡董加班費·${name}`,
      cols: pc.map((p) => tsaiOtPayInPeriod(book, name, p)),
    })
  }
  rows.push({
    key: 'top-sum',
    label: '蔡董加班費·總計',
    cols: pc.map((p) =>
      staff.reduce((s, name) => s + tsaiOtPayInPeriod(book, name, p), 0),
    ),
  })

  for (const name of staff) {
    rows.push({
      key: `net-${name}`,
      label: `${NET_TAKE_HOME_ROW_PREFIX}·${name}`,
      cols: pc.map((p) => netTakeHomePayInPeriod(book, name, p)),
    })
  }
  rows.push({
    key: 'net-total',
    label: `${NET_TAKE_HOME_ROW_PREFIX}·總計`,
    cols: pc.map((p) =>
      staff.reduce((s, name) => s + netTakeHomePayInPeriod(book, name, p), 0),
    ),
  })

  return rows.map((row) => ({
    ...row,
    cellBreakdowns: computeStaffSummaryCellBreakdowns(
      row,
      book,
      staff,
      showDailyMoney,
    ),
  }))
}
