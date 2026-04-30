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

/** 表單工具列：空白／完整／缺欄（缺欄時不應送出） */
export function quickToolDraftRowStatus(row: {
  name: string
  qty: string
  unit: string
  amount: string
}): 'empty' | 'partial' | 'complete' {
  const name = row.name.trim()
  const unit = row.unit.trim()
  const qtyS = row.qty.trim()
  const amtS = row.amount.trim()
  const qtyN = qtyS === '' ? NaN : parseFloat(qtyS)
  const amtN = amtS === '' ? NaN : parseFloat(amtS)
  const hasAny =
    name.length > 0 || unit.length > 0 || qtyS.length > 0 || amtS.length > 0
  if (!hasAny) return 'empty'
  const qtyOk = qtyS.length > 0 && Number.isFinite(qtyN) && qtyN > 0
  const amtOk = amtS.length > 0 && Number.isFinite(amtN) && amtN !== 0
  if (name.length > 0 && unit.length > 0 && qtyOk && amtOk) return 'complete'
  return 'partial'
}

function isCompleteToolPayloadLine(l: {
  name?: string
  amount?: number
  qty?: number
  unit?: string
}): boolean {
  const name = typeof l.name === 'string' ? l.name.trim() : ''
  const unit = typeof l.unit === 'string' ? l.unit.trim() : ''
  const qty = typeof l.qty === 'number' && Number.isFinite(l.qty) ? l.qty : 0
  const amt = typeof l.amount === 'number' && Number.isFinite(l.amount) ? l.amount : 0
  return name.length > 0 && unit.length > 0 && qty > 0 && amt !== 0
}

export type FieldworkQuickPayload = {
  isoDate: string
  siteName: string
  workers: string[]
  dayValue: number
  /** 公司損益表「餐費」加帳（可正負）；0 表示不加 */
  mealLedgerAmount: number
  /**
   * 公司損益表「工具」加帳：多筆具名工具（金額加總入帳）。
   * 有傳入且至少一筆有名稱或非零金額時，優先於 {@link miscLedgerAmount}。
   */
  toolLedgerLines?: { name: string; amount: number; qty?: number; unit?: string }[]
  /** 單筆工具金額（舊表單）；若 {@link toolLedgerLines} 有資料則忽略 */
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
  /**
   * 月表「預支」：所選人員該日每人累加金額（元，可正負）；0 或未傳則不變更預支欄。
   */
  advanceLedgerAmountPerPerson?: number
}

function monthIndexForIso(book: SalaryBook, iso: string): number {
  return book.months.findIndex((m) => m.dates.includes(iso))
}

/** 月表該案場區塊之「餐」列：指定日欄累加金額（與 Excel 餐列一致；供損益表 {@link autoLedgerMealsForMonthKeyInYear} 加總）。 */
function addMealDeltaToPayrollBlockForSite(
  book: SalaryBook,
  monthIndex: number,
  siteName: string,
  dayIdx: number,
  mealDelta: number,
): SalaryBook {
  const d = Number.isFinite(mealDelta) ? mealDelta : 0
  if (d === 0 || dayIdx < 0) return book
  const sheet = book.months[monthIndex]
  if (!sheet) return book
  const len = sheet.dates.length
  if (dayIdx >= len) return book
  let blocks = [...sheet.blocks]
  let bi = blocks.findIndex((b) => b.siteName === siteName)
  if (bi < 0) {
    blocks = [...blocks, emptyBlock(siteName, len, staffKeysForMonthDisplay(sheet))]
    bi = blocks.length - 1
  }
  const block = blocks[bi]
  const mealRow = [...padArray(block.meal, len)]
  mealRow[dayIdx] = (mealRow[dayIdx] ?? 0) + d
  blocks[bi] = { ...block, meal: mealRow }
  return {
    ...book,
    months: book.months.map((x, i) => (i === monthIndex ? { ...sheet, blocks } : x)),
  }
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
  const hasSite = siteKey.length > 0
  const workers = payload.workers.map((w) => w.trim()).filter(Boolean)
  /** 0 即不加該日出工／調工；非有限數字視為 0（不再預設為 1） */
  const dayVal = Number.isFinite(payload.dayValue) ? payload.dayValue : 0

  if (!iso) {
    return { book, months, ok: false, message: '請填日期。' }
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

  const mealAmt = Number.isFinite(payload.mealLedgerAmount) ? payload.mealLedgerAmount : 0
  const wantsMeal = mealAmt !== 0
  if (wantsMeal && !hasSite) {
    return {
      book,
      months,
      ok: false,
      message: '餐費需填寫日期與案場（地點）。',
    }
  }

  const toolLinesRaw = Array.isArray(payload.toolLedgerLines) ? payload.toolLedgerLines : []
  const toolLines = toolLinesRaw.filter(isCompleteToolPayloadLine)
  const miscAmtFromLines = toolLines.reduce(
    (a, l) => a + (Number.isFinite(l.amount) ? l.amount : 0),
    0,
  )
  const miscAmtRawLegacy =
    typeof payload.miscLedgerAmount === 'number' && Number.isFinite(payload.miscLedgerAmount)
      ? payload.miscLedgerAmount
      : 0
  const miscAmt = toolLines.length > 0 ? miscAmtFromLines : miscAmtRawLegacy
  const otHours = payload.otHoursPerPerson
  const otManual = payload.otManualAmount

  const wantsMisc = miscAmt !== 0
  const hours = Number.isFinite(otHours) && otHours > 0 ? otHours : 0
  const wantsOtAuto = hours > 0 && workers.length > 0
  const wantsOtManual =
    !wantsOtAuto && Number.isFinite(otManual) && otManual !== 0

  const advRaw = payload.advanceLedgerAmountPerPerson
  const advPer: number =
    typeof advRaw === 'number' && Number.isFinite(advRaw) ? advRaw : 0
  const wantsAdvance = advPer !== 0 && workers.length > 0

  const isTsaiAdjustSite = hasSite && siteKey === QUICK_SITE_TSAI_ADJUST
  const isJunAdjustSite = hasSite && siteKey === QUICK_SITE_JUN_ADJUST

  /** 未填地點或人員時不寫出工格線，避免因表單預設出工天數阻擋「僅工具／預支」等登記 */
  const gridDayVal =
    hasSite && workers.length > 0 && dayVal !== 0 ? dayVal : 0

  if (
    dayVal !== 0 &&
    gridDayVal === 0 &&
    !wantsMisc &&
    !wantsOtManual &&
    !wantsAdvance &&
    !wantsOtAuto &&
    !wantsMeal
  ) {
    return {
      book,
      months,
      ok: false,
      message:
        '出工天數已填，請填寫地點並選擇人員；若僅要登記工具、預支或加班費且不出工，請將「出工天數」改為 0。',
    }
  }

  if (wantsOtAuto && workers.length === 0) {
    return { book, months, ok: false, message: '加班費（依時數）需選擇人員。' }
  }

  const wantsFieldworkDays = hasSite && workers.length > 0 && gridDayVal !== 0
  const hasAnyAction =
    wantsAdvance ||
    wantsMisc ||
    (wantsMeal && hasSite) ||
    wantsOtAuto ||
    wantsOtManual ||
    wantsFieldworkDays ||
    (hasSite && workers.length > 0 && gridDayVal === 0)

  if (!hasAnyAction) {
    return {
      book,
      months,
      ok: false,
      message:
        '沒有可登記的內容。請擇一：出工（地點＋人員）、餐費（日期＋案場＋金額）、預支（日期＋人員）、工具（日期且名稱／數量／單位／金額填妥）、或加班費。',
    }
  }

  const bookAfterStaff =
    workers.length > 0 ? ensureWorkersAcrossBook(book, workers) : book
  let newBook: SalaryBook = bookAfterStaff
  let m = newBook.months[mi]
  const dayIdx = m.dates.indexOf(iso)
  const len = m.dates.length

  let msg = ''

  if (hasSite && (isTsaiAdjustSite || isJunAdjustSite)) {
    const field = isTsaiAdjustSite ? 'tsaiAdjustDays' : 'junAdjustDays'
    const recIn = m[field]
    const rec: Record<string, number[]> = { ...recIn }
    for (const w of workers) {
      const row = [...padArray(rec[w], len)]
      if (dayIdx >= 0 && dayIdx < len) {
        row[dayIdx] = (row[dayIdx] ?? 0) + gridDayVal
      }
      rec[w] = row
    }
    const updatedMonth = { ...m, [field]: rec }
    newBook = {
      ...bookAfterStaff,
      months: bookAfterStaff.months.map((x, i) => (i === mi ? updatedMonth : x)),
    }
    const bookLine = isTsaiAdjustSite ? '月表「蔡董調工」' : '月表「調工支援」'
    if (gridDayVal !== 0) {
      msg = `已登記：${iso}、${workers.join('、')} → ${bookLine} 該日各 +${gridDayVal} 天（與案場格線分開）。`
    } else if (workers.length > 0) {
      msg = `出工天數為 0：未變更 ${bookLine} 該日天數（${iso}、${workers.join('、')}）。`
    }
  } else if (hasSite) {
    let bi = m.blocks.findIndex((b) => b.siteName === siteKey)
    let blocks = [...m.blocks]
    if (bi < 0) {
      blocks = [...blocks, emptyBlock(siteKey, len, staffKeysForMonthDisplay(m))]
      bi = blocks.length - 1
    }

    let block = blocks[bi]
    if (workers.length > 0) {
      for (const w of workers) {
        block = ensureGridWorker(block, w, len)
        const row = [...padArray(block.grid[w], len)]
        if (dayIdx >= 0 && dayIdx < len && gridDayVal !== 0) {
          row[dayIdx] = (row[dayIdx] ?? 0) + gridDayVal
        }
        block = { ...block, grid: { ...block.grid, [w]: row } }
      }
    }
    blocks[bi] = block

    const newMonthsData = bookAfterStaff.months.map((x, i) =>
      i === mi ? { ...m, blocks } : x,
    )
    newBook = { ...bookAfterStaff, months: newMonthsData }
    if (gridDayVal !== 0 && workers.length > 0) {
      msg = `已登記：${iso}、${siteKey}、${workers.join('、')}，該日出工合計 +${gridDayVal} 天。`
    } else if (workers.length > 0) {
      msg = `出工天數為 0：未變更案場「${siteKey}」該日格線（${iso}、${workers.join('、')}）。`
    }
  }

  let newLedger = months

  const calMo = parseInt(iso.slice(5, 7), 10)
  const monthKey = String(calMo)
  const li = months.findIndex((row) => row.month === monthKey)

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

  if (
    advPer !== 0 &&
    workers.length > 0 &&
    dayIdx >= 0 &&
    dayIdx < len
  ) {
    const sheet = newBook.months[mi]
    let advances = { ...sheet.advances }
    for (const w of workers) {
      const row = [...padArray(advances[w], len)]
      row[dayIdx] = (row[dayIdx] ?? 0) + advPer
      advances = { ...advances, [w]: row }
    }
    newBook = {
      ...newBook,
      months: newBook.months.map((x, i) =>
        i === mi ? { ...sheet, advances } : x,
      ),
    }
    const advSign = advPer > 0 ? '+' : ''
    msg += ` 月表「預支」已於 ${iso} 為所選人員每人 ${advSign}${advPer} 元。`
  }

  if (wantsMeal && hasSite && dayIdx >= 0 && dayIdx < len) {
    newBook = addMealDeltaToPayrollBlockForSite(newBook, mi, siteKey, dayIdx, mealAmt)
    msg += ` 月表「${siteKey}」${iso} 餐費欄 +${mealAmt}；公司損益表「餐費」將依月表自動加總。`
  }

  if (li < 0) {
    if (wantsMisc || wantsOtAuto || wantsOtManual) {
      msg += ` 公司損益表：找不到「${monthKey} 月」列，略過工具／加班費加帳。`
    }
  } else {
    const parts: string[] = []
    let ledger = months

    if (wantsMisc) {
      ledger = ledger.map((row, i) =>
        i !== li ? row : { ...row, tools: row.tools + miscAmt },
      )
      parts.push(`工具 ${miscAmt}`)
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

  if (workers.length > 0) {
    msg += ` 所涉人員已同步至全書各月表（新進者各案場格線為 0）。`
  }
  return { book: newBook, months: newLedger, ok: true, message: msg }
}
