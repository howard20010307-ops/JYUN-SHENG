import type { MonthLine } from './ledgerEngine'
import type { SalaryBook } from './salaryExcelModel'
import {
  emptyBlock,
  ensureGridWorker,
  ensureWorkersAcrossBook,
  padArray,
  staffKeysForMonthDisplay,
} from './salaryExcelModel'

/**
 * 地點填此字串時，出工寫入月表「蔡董調工」列（蔡董日薪），不寫一般案場格線。
 */
export const QUICK_SITE_TSAI_ADJUST = '蔡董調工'
/**
 * 地點填此字串時，出工寫入月表之鈞泩調工欄（`junAdjustDays`；鈞泩日薪，與總表「調工」列一致）。
 */
export const QUICK_SITE_JUN_ADJUST = '調工支援'

/** 舊版存檔與手動輸入仍可能出現此鍵名，載入與快速登記時會視同 {@link QUICK_SITE_JUN_ADJUST} */
export const LEGACY_QUICK_SITE_JUN_ADJUST = '鈞泩調工'

/** 快速登記等地點字串：舊鍵「鈞泩調工」正規化為「調工支援」 */
export function normalizeQuickSiteKey(siteTrimmed: string): string {
  if (siteTrimmed === LEGACY_QUICK_SITE_JUN_ADJUST) return QUICK_SITE_JUN_ADJUST
  return siteTrimmed
}

export type FieldworkQuickPayload = {
  isoDate: string
  siteName: string
  workers: string[]
  dayValue: number
  /** 公司損益表「餐費」加帳（可正負）；0 表示不加 */
  mealLedgerAmount: number
  /** 公司損益表「工具」加帳（可正負）；0 表示不加；工作日誌雜項支出與此連動 */
  miscLedgerAmount?: number
  /**
   * 加班費：每人加班時數；與月表一致：時薪＝日薪／8，再乘時數。
   * 若為 0 且 otManualAmount≠0，則加班費改用手動金額。
   */
  otHoursPerPerson: number
  /** 加班費用哪一條日薪：鈞泩（rateJun）或蔡董（rateTsai） */
  otRateLine: 'jun' | 'tsai'
  /** 加班費手動加帳（可正負）；僅在 otHoursPerPerson 為 0 時作為加班費入帳 */
  otManualAmount: number
}

function monthIndexForIso(book: SalaryBook, iso: string): number {
  return book.months.findIndex((m) => m.dates.includes(iso))
}

/** 與加班費試算相同：調工地點固定對應日薪線，其餘依表單單選 */
function otRateLineForQuick(
  isTsaiAdjustSite: boolean,
  isJunAdjustSite: boolean,
  otRateLine: 'jun' | 'tsai',
): 'jun' | 'tsai' {
  if (isTsaiAdjustSite) return 'tsai'
  if (isJunAdjustSite) return 'jun'
  return otRateLine === 'tsai' ? 'tsai' : 'jun'
}

/** 依該月月表日薪（鈞泩或蔡董），每人時數相同時之加班費合計（四捨五入整數） */
export function computeOvertimePayFromDailyRate(
  dailyRates: Record<string, number>,
  workers: string[],
  hoursPerPerson: number,
): number {
  if (!Number.isFinite(hoursPerPerson) || hoursPerPerson <= 0 || workers.length === 0)
    return 0
  let sum = 0
  for (const w of workers) {
    const rate = dailyRates[w] ?? 0
    sum += (rate / 8) * hoursPerPerson
  }
  return Math.round(sum)
}

export function applyFieldworkQuick(
  book: SalaryBook,
  months: MonthLine[],
  payload: FieldworkQuickPayload,
): { book: SalaryBook; months: MonthLine[]; ok: boolean; message: string } {
  const iso = payload.isoDate.trim()
  const siteTrim = payload.siteName.trim()
  const siteKey = normalizeQuickSiteKey(siteTrim)
  const workers = payload.workers.map((w) => w.trim()).filter(Boolean)
  /** 0 即不加該日出工／調工；非有限數字視為 0（不再預設為 1） */
  const dayVal = Number.isFinite(payload.dayValue) ? payload.dayValue : 0

  if (!iso || !siteKey || workers.length === 0) {
    return { book, months, ok: false, message: '請填日期、地點，並至少選一位人員。' }
  }

  const mi = monthIndexForIso(book, iso)
  if (mi < 0) {
    return {
      book,
      months,
      ok: false,
      message: '目前沒有任何月表包含這個日期，請先新增該月或匯入含該日的月表。',
    }
  }

  const bookWithStaff = ensureWorkersAcrossBook(book, workers)

  const dayIdx = bookWithStaff.months[mi].dates.indexOf(iso)
  let m = bookWithStaff.months[mi]
  const len = m.dates.length

  const isTsaiAdjustSite = siteKey === QUICK_SITE_TSAI_ADJUST
  const isJunAdjustSite = siteKey === QUICK_SITE_JUN_ADJUST

  let newBook: SalaryBook
  let msg: string

  if (isTsaiAdjustSite || isJunAdjustSite) {
    const field = isTsaiAdjustSite ? 'tsaiAdjustDays' : 'junAdjustDays'
    const recIn = m[field]
    const rec: Record<string, number[]> = { ...recIn }
    for (const w of workers) {
      const row = [...padArray(rec[w], len)]
      if (dayIdx >= 0 && dayIdx < len) {
        row[dayIdx] = (row[dayIdx] ?? 0) + dayVal
      }
      rec[w] = row
    }
    const updatedMonth = { ...m, [field]: rec }
    newBook = {
      ...bookWithStaff,
      months: bookWithStaff.months.map((x, i) => (i === mi ? updatedMonth : x)),
    }
    const bookLine = isTsaiAdjustSite ? '月表「蔡董調工」' : '月表「調工支援」'
    msg =
      dayVal !== 0
        ? `已登記：${iso}、${workers.join('、')} → ${bookLine} 該日各 +${dayVal} 天（與案場格線分開）。`
        : `出工天數為 0：未變更 ${bookLine} 該日天數（${iso}、${workers.join('、')}）。`
  } else {
    let bi = m.blocks.findIndex((b) => b.siteName === siteKey)
    let blocks = [...m.blocks]
    if (bi < 0) {
      blocks = [...blocks, emptyBlock(siteKey, len, staffKeysForMonthDisplay(m))]
      bi = blocks.length - 1
    }

    let block = blocks[bi]
    for (const w of workers) {
      block = ensureGridWorker(block, w, len)
      const row = [...padArray(block.grid[w], len)]
      if (dayIdx >= 0 && dayIdx < len) {
        row[dayIdx] = (row[dayIdx] ?? 0) + dayVal
      }
      block = { ...block, grid: { ...block.grid, [w]: row } }
    }
    blocks[bi] = block

    const newMonthsData = bookWithStaff.months.map((x, i) =>
      i === mi ? { ...m, blocks } : x,
    )
    newBook = { ...bookWithStaff, months: newMonthsData }
    msg =
      dayVal !== 0
        ? `已登記：${iso}、${siteKey}、${workers.join('、')}，該日出工合計 +${dayVal} 天。`
        : `出工天數為 0：未變更案場「${siteKey}」該日格線（${iso}、${workers.join('、')}）。`
  }
  let newLedger = months

  const calMo = parseInt(iso.slice(5, 7), 10)
  const monthKey = String(calMo)
  const li = months.findIndex((row) => row.month === monthKey)

  const mealAmt = payload.mealLedgerAmount
  const miscAmtRaw =
    typeof payload.miscLedgerAmount === 'number' && Number.isFinite(payload.miscLedgerAmount)
      ? payload.miscLedgerAmount
      : 0
  const miscAmt = miscAmtRaw
  const otHours = payload.otHoursPerPerson
  const otManual = payload.otManualAmount

  const wantsMeal = Number.isFinite(mealAmt) && mealAmt !== 0
  const wantsMisc = miscAmt !== 0
  const hours = Number.isFinite(otHours) && otHours > 0 ? otHours : 0
  const wantsOtAuto = hours > 0 && workers.length > 0
  const wantsOtManual =
    !wantsOtAuto && Number.isFinite(otManual) && otManual !== 0

  if (wantsOtAuto) {
    const line = otRateLineForQuick(isTsaiAdjustSite, isJunAdjustSite, payload.otRateLine)
    const field = line === 'tsai' ? 'tsaiOtHours' : 'junOtHours'
    const gridLabel = line === 'tsai' ? '蔡董加班' : '鈞泩加班'
    newBook = {
      ...newBook,
      months: newBook.months.map((sheet, i) => {
        if (i !== mi) return sheet
        const grids: Record<string, number[]> = { ...sheet[field] }
        for (const w of workers) {
          const row = [...padArray(grids[w], len)]
          if (dayIdx >= 0 && dayIdx < len) {
            row[dayIdx] = (row[dayIdx] ?? 0) + hours
          }
          grids[w] = row
        }
        return { ...sheet, [field]: grids }
      }),
    }
    msg += ` 月表「${gridLabel}」已於 ${iso} 為所選人員每人 +${hours} 時（與加班費試算同一條日薪線）。`
  }

  if (li < 0) {
    if (wantsMeal || wantsMisc || wantsOtAuto || wantsOtManual) {
      msg += ` 公司損益表：找不到「${monthKey} 月」列，略過餐費／工具（雜項）／加班費加帳。`
    }
  } else {
    const parts: string[] = []
    let ledger = months

    if (wantsMeal) {
      ledger = ledger.map((row, i) =>
        i !== li ? row : { ...row, meals: row.meals + mealAmt },
      )
      parts.push(`餐費 ${mealAmt}`)
    }

    if (wantsMisc) {
      ledger = ledger.map((row, i) =>
        i !== li ? row : { ...row, tools: row.tools + miscAmt },
      )
      parts.push(`工具（雜項） ${miscAmt}`)
    }

    let otDelta = 0
    let otDesc = ''
    if (wantsOtAuto) {
      const sheet = newBook.months[mi]
      const line = otRateLineForQuick(isTsaiAdjustSite, isJunAdjustSite, payload.otRateLine)
      const rates = line === 'tsai' ? sheet.rateTsai : sheet.rateJun
      const lineLabel = line === 'tsai' ? '蔡董日薪' : '鈞泩日薪'
      otDelta = computeOvertimePayFromDailyRate(rates, workers, hours)
      otDesc = `加班費 ${otDelta}（${lineLabel}÷8×${hours}時／人×${workers.length}人）`
    } else if (wantsOtManual) {
      otDelta = otManual
      otDesc = `加班費手動 ${otDelta}`
    }

    if (otDelta !== 0 && otDesc) {
      ledger = ledger.map((row, i) =>
        i !== li ? row : { ...row, overtimePay: row.overtimePay + otDelta },
      )
      parts.push(otDesc)
    }

    if (parts.length > 0) {
      newLedger = ledger
      msg += ` 公司損益表：${parts.join('；')}（${monthKey} 月）。`
    }
  }

  msg += ` 所涉人員已同步至全書各月表（新進者各案場格線為 0）。`
  return { book: newBook, months: newLedger, ok: true, message: msg }
}
