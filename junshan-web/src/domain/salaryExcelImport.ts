/// <reference path="../xlsx-shim.d.ts" />
import * as XLSX from 'xlsx'
import type { Period, PeriodEntry, Worker } from './payrollEngine'
import {
  DEFAULT_STAFF,
  emptyBlock,
  legacyToCanonicalWorkerKey,
  newMonthSheet,
  normalizeSalaryBook,
  type MonthSheetData,
  type SalaryBook,
  type SiteBlock,
} from './salaryExcelModel'

type WorkSheet = XLSX.WorkSheet

type SheetRow = (string | number | null | undefined)[]
type Raw = SheetRow[]

const SUMMARY_SHEET = '員工總出工及薪水計算'
const BOOK_YEAR = 2026

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function cellNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (v === null || v === undefined) return 0
  const n = parseFloat(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function pad2(n: number): string {
  return String(Math.floor(Math.abs(n))).padStart(2, '0')
}

/** 與 Excel 對人名對齊（與 {@link legacyToCanonicalWorkerKey} 一致） */
export function normalizeWorkerKey(name: string): string {
  return legacyToCanonicalWorkerKey(cellStr(name))
}

/** 月表／格線資料用：與 UI 的 DEFAULT_STAFF 鍵一致（舊名見 salaryExcelModel LEGACY_WORKER_RENAMES） */
function excelNameToBookStaffKey(name: string): string | null {
  const c = legacyToCanonicalWorkerKey(cellStr(name))
  if ((DEFAULT_STAFF as readonly string[]).includes(c)) return c
  return null
}

function getSheetPair(
  wb: XLSX.WorkBook,
  sheetName: string,
): { rows: Raw; ws: WorkSheet } | null {
  const exact = wb.SheetNames.find((n) => n === sheetName)
  const sn =
    exact ??
    wb.SheetNames.find(
      (n) => n.replace(/\s/g, '') === sheetName.replace(/\s/g, ''),
    )
  if (!sn) return null
  const ws = wb.Sheets[sn] as WorkSheet
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as Raw
  return { rows, ws }
}

function getRows(wb: XLSX.WorkBook, sheetName: string): Raw | null {
  return getSheetPair(wb, sheetName)?.rows ?? null
}

type ExcelColor = { rgb?: string; theme?: number; indexed?: number }
type CellFillStyle = {
  patternType?: string
  fgColor?: ExcelColor
  bgColor?: ExcelColor
}

function normalizeRgb6(hex: string): string {
  let x = hex.replace(/^#/, '').toUpperCase()
  if (x.length === 8) x = x.slice(2)
  return x.length === 6 ? x : ''
}

/** 辨識 Excel 常見「綠色案場」儲存格底色（含淺綠、佈景主題綠） */
function isGreenishHex(hex: string): boolean {
  const six = normalizeRgb6(hex)
  if (six.length !== 6) return false
  const r = parseInt(six.slice(0, 2), 16)
  const g = parseInt(six.slice(2, 4), 16)
  const b = parseInt(six.slice(4, 6), 16)
  if (g >= 165 && g >= r + 30 && g >= b + 30) return true
  if (g >= 185 && r <= 235 && b <= 235 && g >= r + 25 && g >= b + 25) return true
  if (g >= 210 && r <= 245 && b <= 245 && g > r && g > b) return true
  return false
}

function fillIsGreenish(s: unknown): boolean {
  if (!s || typeof s !== 'object') return false
  const f = s as CellFillStyle
  const fg = f.fgColor?.rgb
  const bg = f.bgColor?.rgb
  if (fg && isGreenishHex(String(fg))) return true
  if (bg && isGreenishHex(String(bg))) return true
  return false
}

/** 試算表以綠格標示案場名（富邦、鳳山、南興計畫等）時，依儲存格樣式擷取 */
function extractGreenSiteLabel(
  ws: WorkSheet,
  rowIdx: number,
  maxCol: number,
): string | null {
  let best = ''
  const lim = Math.max(0, Math.min(maxCol, 64))
  for (let c = 0; c <= lim; c++) {
    const addr = XLSX.utils.encode_cell({ r: rowIdx, c })
    const cell = ws[addr] as
      | { v?: unknown; w?: string; s?: unknown; t?: string }
      | undefined
    if (!cell || !fillIsGreenish(cell.s)) continue
    const str = cellStr(cell.w ?? cell.v).trim()
    if (!str || str.length < 2) continue
    if (cellToIsoDate(cell.v)) continue
    if (c === 0 && excelNameToBookStaffKey(str)) continue
    if (isBadSiteCandidate(str)) continue
    if (isMostlyNumericLabel(str)) continue
    if (str.length > best.length) best = str
  }
  return best || null
}

function greenScanMaxCol(cols: number[]): number {
  if (!cols.length) return 28
  return Math.max(28, Math.max(...cols) + 10)
}

type Block = { labels: string[]; data: Map<string, number[]> }

function extractBlock(
  rows: Raw,
  matcher: (a: string) => boolean,
): Block | null {
  const i = rows.findIndex((r) => matcher(cellStr(r[0])))
  if (i < 0) return null
  const header = rows[i]
  const labels: string[] = []
  for (let c = 1; c < (header?.length ?? 0); c++) {
    const h = cellStr(header[c])
    if (!h) break
    labels.push(h)
  }
  if (labels.length === 0) return null

  const data = new Map<string, number[]>()
  for (let j = i + 1; j < rows.length; j++) {
    const r = rows[j]
    const a = cellStr(r[0])
    if (!a) continue
    if (a.includes('總計') || a === '總計©') break
    const key = normalizeWorkerKey(a)
    const vals = labels.map((_, idx) => cellNum(r[idx + 1]))
    const prev = data.get(key)
    data.set(key, prev ? mergeExcelAliasStaffRows(prev, vals) : vals)
  }
  return { labels, data }
}

function serialToIso(n: number): string | null {
  const parse =
    (XLSX.SSF as { parse_date_code?: (v: number) => { y: number; m: number; d: number } })
      .parse_date_code
  if (typeof parse === 'function') {
    const u = parse(n)
    if (u && Number.isFinite(u.y))
      return `${u.y}-${pad2(u.m)}-${pad2(u.d)}`
  }
  const d = new Date(Math.round((n - 25569) * 86400 * 1000))
  if (Number.isNaN(d.getTime())) return null
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

/** 將儲存格轉成 YYYY-MM-DD（用於辨識日期列） */
function cellToIsoDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'boolean') return null
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v > 20000 && v < 120000) return serialToIso(v)
    return null
  }
  const s = cellStr(v)
  const m1 = s.match(/(\d{1,2})\s*[月\/\-\.]\s*(\d{1,2})\s*(?:日)?/)
  if (m1) {
    const mo = +m1[1]
    const da = +m1[2]
    if (mo < 1 || mo > 12 || da < 1 || da > 31) return null
    return `${BOOK_YEAR}-${pad2(mo)}-${pad2(da)}`
  }
  return null
}

type DateLayout = { dates: string[]; cols: number[]; rowIndex: number }

function buildDateLayoutFromRow(r: SheetRow | undefined): {
  dates: string[]
  cols: number[]
} | null {
  if (!r?.length) return null
  const dates: string[] = []
  const cols: number[] = []
  /** 日期可能從 A 欄開始，案名常在日期左側同一列 */
  for (let c = 0; c < r.length; c++) {
    const iso = cellToIsoDate(r[c])
    if (!iso) continue
    if (dates.includes(iso)) continue
    dates.push(iso)
    cols.push(c)
  }
  if (dates.length < 3) return null
  return { dates, cols }
}

function findBestDateLayout(rows: Raw): DateLayout | null {
  let best: DateLayout | null = null
  for (let i = 0; i < rows.length; i++) {
    const built = buildDateLayoutFromRow(rows[i])
    if (!built) continue
    if (!best || built.dates.length > best.dates.length) {
      best = { ...built, rowIndex: i }
    }
  }
  return best
}

function isRowMostlyEmpty(r: SheetRow | undefined): boolean {
  if (!r?.length) return true
  let n = 0
  for (let c = 0; c < r.length; c++) {
    if (cellStr(r[c])) n++
    if (n > 3) return false
  }
  return n === 0
}

/** Excel 常把案名放在 A 或 B（合併儲存格只留一格有字） */
function rowTitle(r: SheetRow): string {
  return cellStr(r[0]) || cellStr(r[1])
}

function isMostlyNumericLabel(s: string): boolean {
  return /^[\d,.\s]+$/.test(s.trim())
}

function isBadSiteCandidate(s: string): boolean {
  const t = s.trim()
  if (!t || t.length < 2) return true
  if (/^(姓名|案名|日期|備註|項目)$/.test(t)) return true
  if (t.includes('鈞泩薪水') || t.includes('蔡董薪水')) return true
  if (t.includes('總計') || t.includes('合計')) return true
  if (isFooterSectionStart(t)) return true
  if (isMostlyNumericLabel(t)) return true
  return false
}

/** 第一個「日期欄」左側儲存格：常與日期表頭同一列（例：…富邦 | 2/1 | 2/2…） */
function extractSiteLabelBeforeDateColumns(
  r: SheetRow,
  firstDateCol: number,
): string | null {
  let best = ''
  const end = Math.min(r.length, Math.max(0, firstDateCol))
  for (let c = 0; c < end; c++) {
    const raw = r[c]
    const s = cellStr(raw).trim()
    if (!s) continue
    if (cellToIsoDate(raw)) continue
    if (c === 0 && excelNameToBookStaffKey(s)) continue
    if (isBadSiteCandidate(s)) continue
    if (s.length > best.length) best = s
  }
  return best || null
}

/** 合併儲存格案名常與「日期欄」重疊：在日期索引上若明顯不是日期／數字工數，仍當成案名候選 */
function couldBeMergedSiteTitleInDateCol(raw: unknown): boolean {
  if (cellToIsoDate(raw)) return false
  const s = cellStr(raw).trim()
  if (s.length < 2) return false
  if (isMostlyNumericLabel(s)) return false
  if (/^[\d.]+$/.test(s)) return false
  if (excelNameToBookStaffKey(s)) return false
  if (isBadSiteCandidate(s)) return false
  return true
}

/** 整列掃描案名（含與日期欄重疊的合併標題格） */
function rowScanLongestSiteLabel(r: SheetRow, cols: number[]): string | null {
  const dateCols = new Set(cols)
  let best = ''
  const lim = Math.min(r.length, 56)
  for (let c = 0; c < lim; c++) {
    const raw = r[c]
    const s = cellStr(raw).trim()
    if (!s) continue
    if (c === 0 && excelNameToBookStaffKey(s)) continue
    if (isBadSiteCandidate(s)) continue
    if (dateCols.has(c)) {
      if (!couldBeMergedSiteTitleInDateCol(raw)) continue
    } else {
      if (cellToIsoDate(raw)) continue
    }
    if (s.length > best.length) best = s
  }
  return best || null
}

/** 從可能是「案場標題」的列擷取案名（綠格優先，再與日期欄同列或獨立列） */
function resolveSiteLabelFromRow(
  r: SheetRow,
  cols: number[],
  ws: WorkSheet | null,
  rowIdx: number,
): string | null {
  if (!cols.length) return null
  if (ws) {
    const green = extractGreenSiteLabel(ws, rowIdx, greenScanMaxCol(cols))
    if (green) return green
  }
  const firstCol = Math.min(...cols)
  const left = extractSiteLabelBeforeDateColumns(r, firstCol)
  if (left) return left
  if (excelNameToBookStaffKey(cellStr(r[0]))) return null
  const scanned = rowScanLongestSiteLabel(r, cols)
  if (scanned) return scanned
  if (dateColsSignificantCells(r, cols) > 12) return null
  const t = rowTitle(r)
  if (t && !isBadSiteCandidate(t) && !excelNameToBookStaffKey(cellStr(r[0]))) {
    if (!t.includes('餐') && !t.includes('總出工')) return t
  }
  return null
}

/** 與本表日期欄對齊的欄位裡，有實質內容的格數（用來辨識「標題列」vs「出工資料列」） */
function dateColsSignificantCells(r: SheetRow, cols: number[]): number {
  let n = 0
  for (const c of cols) {
    const v = r[c]
    if (v === null || v === undefined) continue
    if (typeof v === 'number' && v !== 0) {
      n++
      continue
    }
    const s = cellStr(v)
    if (s !== '' && s !== '0') n++
  }
  return n
}

function looksLikeSiteNameRow(
  r: SheetRow,
  cols: number[],
  ws: WorkSheet | null,
  rowIdx: number,
): boolean {
  return resolveSiteLabelFromRow(r, cols, ws, rowIdx) !== null
}

function inferSiteAboveDateRow(
  rows: Raw,
  rowIndex: number,
  cols: number[],
  ws: WorkSheet | null,
): string {
  for (let up = rowIndex - 1; up >= Math.max(0, rowIndex - 15); up--) {
    const pr: SheetRow = rows[up] ?? []
    if (buildDateLayoutFromRow(pr)) continue
    const t = resolveSiteLabelFromRow(pr, cols, ws, up)
    if (t) return t
  }
  return '案場'
}

function isTotalRow(a: string): boolean {
  return a.includes('總計') || a === '總計©' || a.includes('合計')
}

function isFooterSectionStart(a: string): boolean {
  if (!a) return false
  if (a.includes('總出工')) return true
  if (a.includes('蔡董') && a.includes('調工')) return true
  if (a === '調工' || a.includes('鈞泩調工')) return true
  if (a === '預支' || a === '預支款') return true
  if (a.startsWith('預支') && a.length <= 6) return true
  if (a.includes('鈞泩') && a.includes('加班') && !a.includes('薪')) {
    if (a.includes('費')) return false
    return true
  }
  if (a.includes('蔡董') && a.includes('加班') && !a.includes('薪')) {
    if (a.includes('費')) return false
    return true
  }
  if (a.includes('當期工數')) return true
  if (a.includes('收帳')) return true
  return false
}

function readCells(r: SheetRow | undefined, cols: number[]): number[] {
  if (!r) return cols.map(() => 0)
  return cols.map((c) => cellNum(r[c]))
}

/**
 * Excel 多列對應同一人（如 阿全婆＝劉子瑜）時合併：後列該欄為 0 不覆蓋前列；兩列都有值則取較大（避免重複列相加變兩倍）。
 */
function mergeExcelAliasStaffRows(prev: number[] | undefined, next: number[]): number[] {
  if (!prev?.length) return [...next]
  const len = Math.max(prev.length, next.length)
  return Array.from({ length: len }, (_, j) => {
    const a = prev[j] ?? 0
    const b = next[j] ?? 0
    if (b === 0) return a
    if (a === 0) return b
    return Math.max(a, b)
  })
}

function blankStaffGrids(dateLen: number): Record<string, number[]> {
  const o: Record<string, number[]> = {}
  for (const n of DEFAULT_STAFF) o[n] = Array(dateLen).fill(0)
  return o
}

function readStaffNumericSection(
  rows: Raw,
  start: number,
  cols: number[],
  target: Record<string, number[]>,
): number {
  let i = start
  while (i < rows.length) {
    const key = excelNameToBookStaffKey(cellStr(rows[i]?.[0]))
    if (!key) return i
    const vals = readCells(rows[i], cols)
    const prev = target[key]
    target[key] = prev ? mergeExcelAliasStaffRows(prev, vals) : vals
    i++
  }
  return i
}

function parseFooterSections(
  rows: Raw,
  start: number,
  cols: number[],
  dateLen: number,
): {
  advances: Record<string, number[]>
  junAdjustDays: Record<string, number[]>
  tsaiAdjustDays: Record<string, number[]>
  junOtHours: Record<string, number[]>
  tsaiOtHours: Record<string, number[]>
} {
  const advances = blankStaffGrids(dateLen)
  const junAdjustDays = blankStaffGrids(dateLen)
  const tsaiAdjustDays = blankStaffGrids(dateLen)
  const junOtHours = blankStaffGrids(dateLen)
  const tsaiOtHours = blankStaffGrids(dateLen)
  let i = start
  while (i < rows.length) {
    const row = rows[i] ?? []
    const a0 = cellStr(row[0])
    const a1 = cellStr(row[1])
    const a = a0 || a1
    if (a0.includes('總出工') || a1.includes('總出工')) {
      i++
      continue
    }
    if (a === '預支' || a === '預支款' || (a.startsWith('預支') && a.length <= 6)) {
      i = readStaffNumericSection(rows, i + 1, cols, advances)
      continue
    }
    if (a.includes('蔡董') && a.includes('調工')) {
      i = readStaffNumericSection(rows, i + 1, cols, tsaiAdjustDays)
      continue
    }
    if (a.includes('調工')) {
      i = readStaffNumericSection(rows, i + 1, cols, junAdjustDays)
      continue
    }
    if (a.includes('鈞泩') && a.includes('加班') && !a.includes('薪')) {
      if (!a.includes('費')) {
        i = readStaffNumericSection(rows, i + 1, cols, junOtHours)
        continue
      }
    }
    if (a.includes('蔡董') && a.includes('加班') && !a.includes('薪')) {
      if (!a.includes('費')) {
        i = readStaffNumericSection(rows, i + 1, cols, tsaiOtHours)
        continue
      }
    }
    i++
  }
  return { advances, junAdjustDays, tsaiAdjustDays, junOtHours, tsaiOtHours }
}

function parseRatesFromSheetRows(rows: Raw, upToRow: number): Map<string, { jun: number; tsai: number }> {
  const rates = new Map<string, { jun: number; tsai: number }>()
  const slice = rows.slice(0, Math.max(0, upToRow))
  for (let i = 0; i < slice.length - 1; i++) {
    const r = slice[i]
    const b = cellStr(r[1])
    const c = cellStr(r[2])
    if (!b.includes('鈞泩') || !b.includes('薪')) continue
    if (!c.includes('蔡董') || !c.includes('薪')) continue
    for (let j = i + 1; j < slice.length; j++) {
      const rr = slice[j]
      const name = cellStr(rr[0])
      if (!name) continue
      if (name.includes('總計')) break
      const jun = cellNum(rr[1])
      const tsai = cellNum(rr[2])
      const key = excelNameToBookStaffKey(name) ?? excelNameToBookStaffKey(normalizeWorkerKey(name))
      if (!key) continue
      if (jun > 0 || tsai > 0) {
        const prev = rates.get(key)
        rates.set(key, {
          jun: jun || prev?.jun || 0,
          tsai: tsai || prev?.tsai || 0,
        })
      }
    }
    break
  }
  return rates
}

function parseMonthSheetRows(
  rows: Raw,
  sheetLabel: string,
  ws: WorkSheet | null,
): MonthSheetData | null {
  const layout = findBestDateLayout(rows)
  if (!layout) return null

  const { dates, cols, rowIndex } = layout
  const dateLen = dates.length
  const ratesMap = parseRatesFromSheetRows(rows, rowIndex)

  const headerRow = rows[rowIndex] ?? []
  let pendingSite =
    resolveSiteLabelFromRow(headerRow, cols, ws, rowIndex) ??
    inferSiteAboveDateRow(rows, rowIndex, cols, ws)
  const blocks: MonthSheetData['blocks'] = []
  let cur: SiteBlock | null = null

  function flush() {
    if (cur) {
      blocks.push(cur)
      cur = null
      pendingSite = '案場'
    }
  }

  let footerStart = rows.length
  for (let i = rowIndex + 1; i < rows.length; i++) {
    const r: SheetRow = rows[i] ?? []
    const a = cellStr(r[0])
    const title = rowTitle(r)

    if (isFooterSectionStart(a) || isFooterSectionStart(cellStr(r[1]))) {
      footerStart = i
      break
    }

    if (isRowMostlyEmpty(r)) continue

    const dupHeader = buildDateLayoutFromRow(r)
    if (dupHeader && dupHeader.dates.length >= dateLen * 0.85) {
      /** 案場列與「3月1日…」同列時也會被判成 dupHeader，不可略過，否則 pendingSite 永遠對不到下一區 */
      const siteOnRow = resolveSiteLabelFromRow(r, cols, ws, i)
      if (!siteOnRow) continue
    }

    const staffKey = excelNameToBookStaffKey(a)
    if (staffKey) {
      if (!cur) {
        cur = emptyBlock(pendingSite, dateLen)
      }
      const nextCells = readCells(r, cols)
      const prevCells = cur.grid[staffKey]
      const merged = mergeExcelAliasStaffRows(prevCells, nextCells)
      const g: SiteBlock['grid'] = { ...cur.grid, [staffKey]: merged }
      cur = { ...cur, grid: g }
      continue
    }

    if (a === '餐' || a === '餐費' || title === '餐' || title === '餐費') {
      if (!cur) continue
      const prev: SiteBlock = cur
      cur = { ...prev, meal: readCells(r, cols) }
      continue
    }

    if (isTotalRow(a) || isTotalRow(cellStr(r[1]))) {
      flush()
      continue
    }

    if (looksLikeSiteNameRow(r, cols, ws, i)) {
      if (cur) flush()
      const lab = resolveSiteLabelFromRow(r, cols, ws, i)
      if (lab) pendingSite = lab
      continue
    }
  }
  flush()

  const footer = parseFooterSections(rows, footerStart, cols, dateLen)
  const base = newMonthSheet(sheetLabel, dates)
  const rateJun = { ...base.rateJun }
  const rateTsai = { ...base.rateTsai }
  for (const [k, v] of ratesMap) {
    rateJun[k] = v.jun
    rateTsai[k] = v.tsai
  }

  const advances = { ...base.advances }
  const junAdjustDays = { ...base.junAdjustDays }
  const tsaiAdjustDays = { ...base.tsaiAdjustDays }
  const junOtHours = { ...base.junOtHours }
  const tsaiOtHours = { ...base.tsaiOtHours }
  for (const n of DEFAULT_STAFF) {
    advances[n] = footer.advances[n] ?? advances[n]
    junAdjustDays[n] = footer.junAdjustDays[n] ?? junAdjustDays[n]
    tsaiAdjustDays[n] = footer.tsaiAdjustDays[n] ?? tsaiAdjustDays[n]
    junOtHours[n] = footer.junOtHours[n] ?? junOtHours[n]
    tsaiOtHours[n] = footer.tsaiOtHours[n] ?? tsaiOtHours[n]
  }

  const finalBlocks = blocks.length > 0 ? blocks : [emptyBlock('新案場', dateLen)]

  return {
    ...base,
    id: `m-${sheetLabel}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: sheetLabel,
    dates,
    rateJun,
    rateTsai,
    blocks: finalBlocks,
    advances,
    junAdjustDays,
    tsaiAdjustDays,
    junOtHours,
    tsaiOtHours,
  }
}

function monthSheetOrderKey(name: string): number {
  const m = name.match(/(\d{1,2})/)
  return m ? +m[1] : 99
}

/** 從「N月」工作表抓 鈞泩薪水／蔡董薪水（跨月表；舊匯入仍使用） */
function parseDailyRates(wb: XLSX.WorkBook): Map<string, { jun: number; tsai: number }> {
  const rates = new Map<string, { jun: number; tsai: number }>()
  const monthRe = /^\s*\d{1,2}月\s*$/
  for (const sn of wb.SheetNames) {
    if (!monthRe.test(sn)) continue
    const rows = getRows(wb, sn)
    if (!rows) continue
    const part = parseRatesFromSheetRows(rows, rows.length)
    for (const [k, v] of part) {
      const prev = rates.get(k)
      rates.set(k, {
        jun: v.jun || prev?.jun || 0,
        tsai: v.tsai || prev?.tsai || 0,
      })
    }
  }
  return rates
}

export type SalaryImportResult = {
  workers: Worker[]
  periods: Period[]
}

export function importSalaryWorkbook(buf: ArrayBuffer): SalaryImportResult {
  const wb = XLSX.read(new Uint8Array(buf), {
    type: 'array',
    cellDates: true,
    cellStyles: true,
  })
  const rows = getRows(wb, SUMMARY_SHEET)
  if (!rows) {
    throw new Error(
      `找不到工作表「${SUMMARY_SHEET}」。請確認檔案為《2026鈞泩薪水統計》且未改表名。`,
    )
  }

  const rates = parseDailyRates(wb)

  const junDays = extractBlock(rows, (a) => a.includes('鈞泩出工數'))
  if (!junDays) {
    throw new Error('在總表內找不到「鈞泩出工數」區塊，無法匯入。')
  }

  const advances =
    extractBlock(rows, (a) => a === '預支') ?? {
      labels: junDays.labels,
      data: new Map(),
    }
  const junOt = extractBlock(rows, (a) => a.includes('鈞泩加班時數'))
  const tsaiDays = extractBlock(rows, (a) => a.includes('蔡董出工數'))
  const tsaiOt = extractBlock(
    rows,
    (a) =>
      a.includes('蔡董') &&
      a.includes('加班') &&
      !a.includes('費') &&
      !a.includes('薪'),
  )
  const junAdjust = extractBlock(
    rows,
    (a) => a.includes('調工') && !a.includes('蔡董'),
  )
  const tsaiAdjust = extractBlock(
    rows,
    (a) => a.includes('蔡董') && a.includes('調工'),
  )

  const labels = junDays.labels
  const keys = new Set<string>()
  for (const m of [junDays, advances, junOt, tsaiDays, tsaiOt, junAdjust, tsaiAdjust]) {
    if (!m) continue
    for (const k of m.data.keys()) keys.add(k)
  }

  const sortedNames: string[] = []
  for (const k of junDays.data.keys()) {
    if (k === '餐') continue
    sortedNames.push(k)
  }
  for (const k of keys) {
    if (k === '餐') continue
    if (!sortedNames.includes(k)) sortedNames.push(k)
  }
  const workers: Worker[] = sortedNames.map((k, idx) => {
    const c = legacyToCanonicalWorkerKey(k)
    const r = rates.get(c) ?? rates.get(k)
    return {
      id: `imp-${idx}-${k}`,
      name: c,
      junDaily: r?.jun || 3500,
      tsaiDaily: r?.tsai || 2800,
    }
  })

  const periods: Period[] = labels.map((label, pIdx) => {
    const entries: PeriodEntry[] = workers.map((w, wIdx) => {
      const rowKey = sortedNames[wIdx]
      const nk = normalizeWorkerKey(rowKey)
      return {
        workerId: w.id,
        junDays: junDays.data.get(nk)?.[pIdx] ?? 0,
        junAdjustDays: junAdjust?.data.get(nk)?.[pIdx] ?? 0,
        junOtHours: junOt?.data.get(nk)?.[pIdx] ?? 0,
        advance: advances.data.get(nk)?.[pIdx] ?? 0,
        tsaiDays: tsaiDays?.data.get(nk)?.[pIdx] ?? 0,
        tsaiAdjustDays: tsaiAdjust?.data.get(nk)?.[pIdx] ?? 0,
        tsaiOtHours: tsaiOt?.data.get(nk)?.[pIdx] ?? 0,
      }
    })
    return {
      id: `imp-p-${pIdx}-${encodeURIComponent(label)}`,
      label,
      entries,
    }
  })

  return { workers, periods }
}

/**
 * 讀取整本《薪水統計》xlsx：總表分期欄＋各「N月」工作表之案場格線、餐、預支、加班時數等。
 * 會**取代**目前 App 內的 salaryBook（請於 PayrollPanel 整本 setState）。
 */
export function importSalaryWorkbookToBook(buf: ArrayBuffer): SalaryBook {
  const wb = XLSX.read(new Uint8Array(buf), {
    type: 'array',
    cellDates: true,
    cellStyles: true,
  })
  const rows = getRows(wb, SUMMARY_SHEET)
  if (!rows) {
    throw new Error(
      `找不到工作表「${SUMMARY_SHEET}」。請確認檔案為《2026鈞泩薪水統計》且未改表名。`,
    )
  }

  const junDays = extractBlock(rows, (a) => a.includes('鈞泩出工數'))
  if (!junDays) {
    throw new Error('在總表內找不到「鈞泩出工數」區塊，無法匯入。')
  }

  const monthRe = /^\s*\d{1,2}月\s*$/
  const monthNames = wb.SheetNames.filter((n) => monthRe.test(n))
  monthNames.sort((a, b) => monthSheetOrderKey(a) - monthSheetOrderKey(b))

  const months: MonthSheetData[] = []
  for (const sn of monthNames) {
    const pair = getSheetPair(wb, sn)
    if (!pair) continue
    const parsed = parseMonthSheetRows(pair.rows, sn.trim(), pair.ws)
    if (parsed) months.push(parsed)
  }

  if (months.length === 0) {
    throw new Error(
      '找不到可解析的「N月」工作表（需有至少一列橫向日期欄位）。請確認月表格式與試算表一致。',
    )
  }

  return normalizeSalaryBook({
    version: 1,
    periodColumns: [],
    months,
  })
}

export async function importSalaryExcelFile(file: File): Promise<SalaryImportResult> {
  const buf = await file.arrayBuffer()
  return importSalaryWorkbook(buf)
}

export async function importSalaryExcelToBook(file: File): Promise<SalaryBook> {
  const buf = await file.arrayBuffer()
  return importSalaryWorkbookToBook(buf)
}

/** 將「員工總表」匯入的日薪寫回各月月表表頭（與 Excel 各月鈞泩／蔡董薪一致） */
export function mergeImportedRatesIntoBook(
  book: SalaryBook,
  data: SalaryImportResult,
): SalaryBook {
  const nameKey = (n: string) => legacyToCanonicalWorkerKey(n)
  const months = book.months.map((m) => {
    const rateJun = { ...m.rateJun }
    const rateTsai = { ...m.rateTsai }
    for (const w of data.workers) {
      const k = nameKey(w.name)
      rateJun[k] = w.junDaily
      rateTsai[k] = w.tsaiDaily
    }
    return { ...m, rateJun, rateTsai }
  })
  return { ...book, months }
}
