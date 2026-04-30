/** 公司損益表：月度營業收入（未稅）、銷貨成本、毛利、營業費用、營業利益；稅金另列記錄 */

import type { MonthSheetData, SalaryBook } from './salaryExcelModel'
import {
  inferPayrollYearFromBook,
  inferYearFromMonthSheet,
  junGridSalaryTotalInPeriod,
  junOtPayInPeriod,
  mealMoneyTotalInMonthSheetPeriod,
  monthSheetCalendarMonth,
  periodColumnFromMonthSheet,
  staffKeysForMonthDisplay,
} from './salaryExcelModel'
import type { ReceivablesState } from './receivablesModel'
import { sumEntriesInMonth } from './receivablesModel'
import type { WorkLogState } from './workLogModel'
import { sumWorkLogInstrumentCostInCalendarMonth, sumWorkLogMiscCostInCalendarMonth } from './workLogModel'

export type MonthKey =
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | '11'
  | '12'

export type MonthLine = {
  month: MonthKey
  /**
   * 與薪水總表「鈞泩薪水(未扣預支)」同義：由月表自動寫入，**不含**調工、**未扣**預支。
   * 數值來自 {@link withAutoLedgerDerived}／{@link withAutoLedgerJunSalary}（依檢視年度之月表，加總該曆月所有人員格線×日薪）。
   */
  salary: number
  /** 加班費：鈞泩加班費加總（時數×鈞泩日薪÷8），由月表自動帶入；不含蔡董加班。 */
  overtimePay: number
  /** 餐費：月表各案場餐列金額加總，自動帶入。 */
  meals: number
  /** 工具（雜項）：工作日誌該曆月雜項支出加總，自動帶入。 */
  tools: number
  /** 營業費用：老闆薪（手填）。 */
  bossSalary: number
  /** 會計費（手填）；列入營業費用。 */
  accountingFee: number
  /** 營登地址租金（手填）；列入營業費用。 */
  registeredAddressRent: number
  /** 儀器使用成本：由工作日誌該曆月「儀器支出」加總，自動帶入。 */
  instrument: number
  /**
   * 營業收入（未稅）：工程款，由收帳依入帳日加總（年為 `ledgerYear`）。
   */
  revenueNet: number
  /**
   * 加計稅金（記錄用）：業主吸收、稅外加；**不**列入營業收入與營業利益計算。
   */
  tax: number
}

export type MonthComputed = MonthLine & {
  /** 鈞泩格線薪＋鈞泩加班費（損益表「鈞泩薪水(含加班)」列） */
  junLaborWithOt: number
  /** 銷貨成本 */
  costOfGoodsSold: number
  /** 毛利＝營業收入(未稅)−銷貨成本 */
  grossProfit: number
  /** 營業費用：老闆薪＋會計費＋營登租金 */
  operatingExpenses: number
  /** 營業利益＝毛利−營業費用 */
  operatingIncome: number
  /** 銷貨成本＋營業費用（便於與舊版「總成本」對照） */
  totalCost: number
  /**
   * 與 {@link MonthLine.revenueNet} 同值：營業收入（未稅）。
   * 舊欄位名保留供序列化／相容；不含加計稅。
   */
  revenueGross: number
  /** 營業利益（與 {@link MonthComputed.operatingIncome} 同值） */
  surplus: number
}

export function computeMonth(m: MonthLine): MonthComputed {
  const junLaborWithOt = m.salary + (m.overtimePay ?? 0)
  const costOfGoodsSold = junLaborWithOt + m.meals + m.tools + m.instrument
  const grossProfit = m.revenueNet - costOfGoodsSold
  const accountingFee = m.accountingFee ?? 0
  const registeredAddressRent = m.registeredAddressRent ?? 0
  const operatingExpenses = m.bossSalary + accountingFee + registeredAddressRent
  const operatingIncome = grossProfit - operatingExpenses
  return {
    ...m,
    junLaborWithOt,
    costOfGoodsSold,
    grossProfit,
    operatingExpenses,
    operatingIncome,
    totalCost: costOfGoodsSold + operatingExpenses,
    revenueGross: m.revenueNet,
    surplus: operatingIncome,
  }
}

export function cumulativeProfit(months: MonthLine[]): number {
  let acc = 0
  for (const m of months) {
    acc += computeMonth(m).operatingIncome
  }
  return acc
}

export function runningCumulative(months: MonthLine[]): number[] {
  const out: number[] = []
  let acc = 0
  for (const m of months) {
    acc += computeMonth(m).operatingIncome
    out.push(acc)
  }
  return out
}

export const MONTH_ORDER: MonthKey[] = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
]

/** 載入舊備份時：略過已刪除之欄位（如 risk），並補齊數字欄位 */
export function normalizeStoredMonthLine(raw: unknown, base: MonthLine): MonthLine {
  if (!raw || typeof raw !== 'object') return base
  const m = raw as Record<string, unknown>
  const num = (v: unknown, d: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : d
  const mo = typeof m.month === 'string' ? m.month : base.month
  const month = (MONTH_ORDER as readonly string[]).includes(mo) ? (mo as MonthKey) : base.month
  return {
    month,
    salary: num(m.salary, base.salary),
    overtimePay: num(m.overtimePay, 0),
    meals: num(m.meals, base.meals),
    tools: num(m.tools, base.tools),
    bossSalary: num(m.bossSalary, base.bossSalary),
    accountingFee: num(m.accountingFee, base.accountingFee),
    registeredAddressRent: num(m.registeredAddressRent, base.registeredAddressRent),
    instrument: num(m.instrument, base.instrument),
    revenueNet: num(m.revenueNet, base.revenueNet),
    tax: num(m.tax, base.tax),
  }
}

/** 單張月表：全員格線鈞泩薪水合計（與總表該月分期欄同式） */
function junGridSalaryTotalForMonthSheet(book: SalaryBook, m: MonthSheetData): number {
  const period = periodColumnFromMonthSheet(m)
  if (!period) return 0
  let s = 0
  for (const name of staffKeysForMonthDisplay(m)) {
    s += junGridSalaryTotalInPeriod(book, name, period)
  }
  return s
}

/** 單張月表：全員鈞泩加班費合計（與總表「鈞泩加班費」同式；不含蔡董）。 */
function junOtPayTotalForMonthSheet(book: SalaryBook, m: MonthSheetData): number {
  const period = periodColumnFromMonthSheet(m)
  if (!period) return 0
  let s = 0
  for (const name of staffKeysForMonthDisplay(m)) {
    s += junOtPayInPeriod(book, name, period)
  }
  return s
}

/** 損益表某一曆月列：`ledgerYear` 年該月，各月表鈞泩加班費加總。 */
export function autoLedgerJunOtPayForMonthKeyInYear(
  book: SalaryBook,
  monthKey: MonthKey,
  year: number,
): number {
  const cal = Number.parseInt(monthKey, 10)
  if (!Number.isFinite(cal)) return 0
  const yOk =
    Number.isFinite(year) && year >= 2000 && year <= 2100
      ? Math.trunc(year)
      : inferPayrollYearFromBook(book)
  let sum = 0
  for (const m of book.months) {
    if (monthSheetCalendarMonth(m) !== cal) continue
    if (inferYearFromMonthSheet(m) !== yOk) continue
    sum += junOtPayTotalForMonthSheet(book, m)
  }
  return Math.round(sum)
}

/** 損益表某一曆月列：月表餐列金額加總（`ledgerYear` 年該月）。 */
export function autoLedgerMealsForMonthKeyInYear(
  book: SalaryBook,
  monthKey: MonthKey,
  year: number,
): number {
  const cal = Number.parseInt(monthKey, 10)
  if (!Number.isFinite(cal)) return 0
  const yOk =
    Number.isFinite(year) && year >= 2000 && year <= 2100
      ? Math.trunc(year)
      : inferPayrollYearFromBook(book)
  let sum = 0
  for (const m of book.months) {
    if (monthSheetCalendarMonth(m) !== cal) continue
    if (inferYearFromMonthSheet(m) !== yOk) continue
    sum += mealMoneyTotalInMonthSheetPeriod(m)
  }
  return Math.round(sum)
}

/** 損益表「儀器」：工作日誌該年該曆月儀器支出加總。 */
export function autoLedgerInstrumentForMonthKeyInYear(
  workLog: WorkLogState,
  monthKey: MonthKey,
  year: number,
): number {
  const cal = Number.parseInt(monthKey, 10)
  if (!Number.isFinite(cal) || cal < 1 || cal > 12) return 0
  const yOk =
    Number.isFinite(year) && year >= 2000 && year <= 2100 ? Math.trunc(year) : 2026
  return sumWorkLogInstrumentCostInCalendarMonth(workLog, yOk, cal)
}

/** 損益表「工具」：工作日誌該年該曆月雜項支出加總。 */
export function autoLedgerToolsForMonthKeyInYear(
  workLog: WorkLogState,
  monthKey: MonthKey,
  year: number,
): number {
  const cal = Number.parseInt(monthKey, 10)
  if (!Number.isFinite(cal) || cal < 1 || cal > 12) return 0
  const yOk =
    Number.isFinite(year) && year >= 2000 && year <= 2100 ? Math.trunc(year) : 2026
  return sumWorkLogMiscCostInCalendarMonth(workLog, yOk, cal)
}

/**
 * 損益表某一曆月列：加總該西元年、該曆月之月表鈞泩格線薪水（未扣預支、不含調工）。
 * 同年同曆月多張月表會一併加總。
 */
export function autoLedgerJunSalaryForMonthKeyInYear(
  book: SalaryBook,
  monthKey: MonthKey,
  year: number,
): number {
  const cal = Number.parseInt(monthKey, 10)
  if (!Number.isFinite(cal)) return 0
  const yOk =
    Number.isFinite(year) && year >= 2000 && year <= 2100
      ? Math.trunc(year)
      : inferPayrollYearFromBook(book)
  let sum = 0
  for (const m of book.months) {
    if (monthSheetCalendarMonth(m) !== cal) continue
    if (inferYearFromMonthSheet(m) !== yOk) continue
    sum += junGridSalaryTotalForMonthSheet(book, m)
  }
  return Math.round(sum)
}

/** 等同 {@link autoLedgerJunSalaryForMonthKeyInYear}（`year`＝{@link inferPayrollYearFromBook}）。 */
export function autoLedgerJunSalaryForMonthKey(book: SalaryBook, monthKey: MonthKey): number {
  return autoLedgerJunSalaryForMonthKeyInYear(book, monthKey, inferPayrollYearFromBook(book))
}

/** 將各月 `salary` 改為依 {@link autoLedgerJunSalaryForMonthKey} 自薪水月表帶入之值（其餘欄不變）。 */
export function withAutoLedgerJunSalary(months: MonthLine[], book: SalaryBook): MonthLine[] {
  const y = inferPayrollYearFromBook(book)
  return months.map((row) => ({
    ...row,
    salary: autoLedgerJunSalaryForMonthKeyInYear(book, row.month, y),
  }))
}

/**
 * 損益表某一列：收帳中入帳日為 `ledgerYear` 年該曆月之未稅、稅金加總。
 */
export function autoLedgerRevenueTaxForMonthKey(
  receivables: ReceivablesState,
  payrollYear: number,
  monthKey: MonthKey,
): { revenueNet: number; tax: number } {
  const cal = Number.parseInt(monthKey, 10)
  if (!Number.isFinite(cal) || cal < 1 || cal > 12) return { revenueNet: 0, tax: 0 }
  const ym = `${payrollYear}-${String(cal).padStart(2, '0')}`
  const { net, tax } = sumEntriesInMonth(receivables.entries, ym)
  return { revenueNet: Math.round(net), tax: Math.round(tax) }
}

/**
 * 自動帶入公司損益表列：`salary`／`overtimePay`（僅鈞泩）／`meals` 依薪水月表；
 * `tools`／`instrument` 依工作日誌雜項與儀器支出；`revenueNet`／`tax` 依收帳；皆限 `ledgerYear` 該年之曆月。
 */
export function withAutoLedgerDerived(
  months: MonthLine[],
  book: SalaryBook,
  receivables: ReceivablesState,
  ledgerYear: number,
  workLog: WorkLogState,
): MonthLine[] {
  const year =
    Number.isFinite(ledgerYear) && ledgerYear >= 2000 && ledgerYear <= 2100
      ? Math.trunc(ledgerYear)
      : inferPayrollYearFromBook(book)
  return months.map((row) => {
    const { revenueNet, tax } = autoLedgerRevenueTaxForMonthKey(receivables, year, row.month)
    return {
      ...row,
      salary: autoLedgerJunSalaryForMonthKeyInYear(book, row.month, year),
      overtimePay: autoLedgerJunOtPayForMonthKeyInYear(book, row.month, year),
      meals: autoLedgerMealsForMonthKeyInYear(book, row.month, year),
      tools: autoLedgerToolsForMonthKeyInYear(workLog, row.month, year),
      instrument: autoLedgerInstrumentForMonthKeyInYear(workLog, row.month, year),
      revenueNet,
      tax,
    }
  })
}

function monthNum(m: MonthKey): number {
  return parseInt(m, 10)
}

export function defaultLedger(): MonthLine[] {
  return MONTH_ORDER.map((month) => ({
    month,
    salary: 0,
    overtimePay: 0,
    meals: 0,
    tools: 0,
    bossSalary: monthNum(month) >= 5 ? 100000 : 0,
    accountingFee: 0,
    registeredAddressRent: 0,
    instrument: 0,
    revenueNet: 0,
    tax: 0,
  }))
}

/** 舊版僅 2～12 月、陣列順序即曆月時，用此對照還原 `month` 缺漏之列。 */
const LEGACY_MONTH_ORDER_FEB_TO_DEC: MonthKey[] = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
]

/**
 * 合併備份中的公司損益月列與目前預設列（1～12 月）：依 `month` 欄對位；無 `month` 且恰 11 筆時依舊版順序視為 2～12 月。
 */
export function mergeStoredMonthLines(rawRows: unknown[] | undefined): MonthLine[] {
  const defaults = defaultLedger()
  const map = new Map<MonthKey, MonthLine>()
  for (const row of defaults) map.set(row.month, { ...row })
  if (!rawRows?.length) return MONTH_ORDER.map((k) => map.get(k)!)
  rawRows.forEach((raw, idx) => {
    let guess: MonthKey | undefined
    if (raw && typeof raw === 'object') {
      const mo = (raw as Record<string, unknown>).month
      if (typeof mo === 'string' && (MONTH_ORDER as readonly string[]).includes(mo)) {
        guess = mo as MonthKey
      }
    }
    if (!guess && rawRows.length === 11 && idx < LEGACY_MONTH_ORDER_FEB_TO_DEC.length) {
      guess = LEGACY_MONTH_ORDER_FEB_TO_DEC[idx]
    }
    const base =
      guess !== undefined
        ? (defaults.find((t) => t.month === guess) ?? defaults[0]!)
        : defaults[Math.min(idx, defaults.length - 1)]!
    const line = normalizeStoredMonthLine(raw, base)
    map.set(line.month, line)
  })
  return MONTH_ORDER.map((k) => map.get(k)!)
}

/**
 * JSONBin 首載合併：公司損益月列以 `month` 為穩定鍵做聯集；同月本機優先。
 * 避免雲端整包覆寫抹掉本機手填（老闆薪、會計費、營登租金等）。
 */
export function mergeLedgerMonthLinesPreferLocal(
  localRows: readonly MonthLine[] | undefined,
  remoteRows: readonly MonthLine[] | undefined,
): MonthLine[] {
  const defaults = defaultLedger()
  const local = mergeStoredMonthLines((localRows ?? []) as unknown[])
  const remote = mergeStoredMonthLines((remoteRows ?? []) as unknown[])
  const byMonth = new Map<MonthKey, MonthLine>()
  for (const row of remote) byMonth.set(row.month, { ...row })
  for (const row of local) {
    const prev = byMonth.get(row.month)
    byMonth.set(row.month, prev ? { ...prev, ...row } : { ...row })
  }
  return MONTH_ORDER.map((m, idx) => byMonth.get(m) ?? { ...defaults[idx]! })
}
