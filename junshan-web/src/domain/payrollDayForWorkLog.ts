/**
 * 將薪水「月表」（MonthSheetData）某日欄位彙總，供工作日誌顯示／帶入表單。
 */

import { QUICK_SITE_JUN_ADJUST, QUICK_SITE_TSAI_ADJUST } from './fieldworkQuickApply'
import {
  isPlaceholderMonthBlockSiteName,
  padArray,
  siteBlockLabelForSummary,
  type MonthSheetData,
  type SalaryBook,
} from './salaryExcelModel'

export type PayrollDayBlockSnapshot = {
  siteName: string
  workers: { name: string; dayValue: number }[]
  /** 該案場列當日餐費欄 */
  mealAmount: number
}

export type PayrollDayNameAmount = { name: string; value: number }

export type PayrollDaySnapshot = {
  iso: string
  sheetId: string
  sheetLabel: string
  dayIndex: number
  blocks: PayrollDayBlockSnapshot[]
  advances: PayrollDayNameAmount[]
  junAdjust: PayrollDayNameAmount[]
  tsaiAdjust: PayrollDayNameAmount[]
  junOt: PayrollDayNameAmount[]
  tsaiOt: PayrollDayNameAmount[]
  /** 當日欄位曾出現的人員，附該月表之鈞泩／蔡董日薪（表頭） */
  staffRates: { name: string; rateJun: number; rateTsai: number }[]
}

export function findMonthSheetContainingDate(
  book: SalaryBook,
  iso: string,
): MonthSheetData | null {
  for (const m of book.months) {
    if (m.dates.includes(iso)) return m
  }
  return null
}

export function dayIndexInSheet(sheet: MonthSheetData, iso: string): number {
  return sheet.dates.indexOf(iso)
}

function collectNameAmount(
  rec: Record<string, number[]>,
  len: number,
  j: number,
): PayrollDayNameAmount[] {
  const out: PayrollDayNameAmount[] = []
  for (const [name, arr] of Object.entries(rec)) {
    const v = padArray(arr, len)[j] ?? 0
    if (v !== 0) out.push({ name, value: v })
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
  return out
}

export function dayHasPayrollActivity(sheet: MonthSheetData, j: number): boolean {
  const len = sheet.dates.length
  if (j < 0 || j >= len) return false
  for (const b of sheet.blocks) {
    if ((padArray(b.meal, len)[j] ?? 0) !== 0) return true
    for (const arr of Object.values(b.grid)) {
      if ((padArray(arr, len)[j] ?? 0) !== 0) return true
    }
  }
  for (const arr of Object.values(sheet.advances)) {
    if ((padArray(arr, len)[j] ?? 0) !== 0) return true
  }
  for (const arr of Object.values(sheet.junAdjustDays)) {
    if ((padArray(arr, len)[j] ?? 0) !== 0) return true
  }
  for (const arr of Object.values(sheet.tsaiAdjustDays)) {
    if ((padArray(arr, len)[j] ?? 0) !== 0) return true
  }
  for (const arr of Object.values(sheet.junOtHours)) {
    if ((padArray(arr, len)[j] ?? 0) !== 0) return true
  }
  for (const arr of Object.values(sheet.tsaiOtHours)) {
    if ((padArray(arr, len)[j] ?? 0) !== 0) return true
  }
  return false
}

/** 月曆年／月內，月表日期欄有非零資料的日期（YYYY-MM-DD） */
export function datesWithPayrollActivityInCalendarMonth(
  book: SalaryBook,
  year: number,
  month1to12: number,
): Set<string> {
  const pfx = `${year}-${String(month1to12).padStart(2, '0')}-`
  const set = new Set<string>()
  for (const m of book.months) {
    for (let j = 0; j < m.dates.length; j++) {
      const iso = m.dates[j]
      if (typeof iso !== 'string' || !iso.startsWith(pfx)) continue
      if (dayHasPayrollActivity(m, j)) set.add(iso)
    }
  }
  return set
}

export function buildPayrollDaySnapshot(
  book: SalaryBook,
  iso: string,
): PayrollDaySnapshot | null {
  const sheet = findMonthSheetContainingDate(book, iso)
  if (!sheet) return null
  const j = dayIndexInSheet(sheet, iso)
  if (j < 0) return null
  const len = sheet.dates.length

  const blocks: PayrollDayBlockSnapshot[] = []
  const nameSet = new Set<string>()
  for (const b of sheet.blocks) {
    const workers: { name: string; dayValue: number }[] = []
    for (const [name, arr] of Object.entries(b.grid)) {
      const v = padArray(arr, len)[j] ?? 0
      if (v !== 0) {
        workers.push({ name, dayValue: v })
        nameSet.add(name)
      }
    }
    workers.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
    const mealAmount = padArray(b.meal, len)[j] ?? 0
    blocks.push({ siteName: b.siteName, workers, mealAmount })
  }

  const advances = collectNameAmount(sheet.advances, len, j)
  const junAdjust = collectNameAmount(sheet.junAdjustDays, len, j)
  const tsaiAdjust = collectNameAmount(sheet.tsaiAdjustDays, len, j)
  const junOt = collectNameAmount(sheet.junOtHours, len, j)
  const tsaiOt = collectNameAmount(sheet.tsaiOtHours, len, j)
  for (const x of advances) nameSet.add(x.name)
  for (const x of junAdjust) nameSet.add(x.name)
  for (const x of tsaiAdjust) nameSet.add(x.name)
  for (const x of junOt) nameSet.add(x.name)
  for (const x of tsaiOt) nameSet.add(x.name)

  const staffRates = [...nameSet]
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'))
    .map((name) => ({
      name,
      rateJun: sheet.rateJun[name] ?? 0,
      rateTsai: sheet.rateTsai[name] ?? 0,
    }))

  return {
    iso,
    sheetId: sheet.id,
    sheetLabel: sheet.label,
    dayIndex: j,
    blocks,
    advances,
    junAdjust,
    tsaiAdjust,
    junOt,
    tsaiOt,
    staffRates,
  }
}

function formatBlockWorkers(b: PayrollDayBlockSnapshot): string {
  if (b.workers.length === 0) return '—'
  return b.workers.map((w) => `${w.name}（${w.dayValue}）`).join('、')
}

/** 供備註或預覽：完整文字區塊 */
export function formatPayrollDaySnapshotLines(s: PayrollDaySnapshot): string {
  const lines: string[] = [
    `【月表 ${s.sheetLabel}（${s.sheetId}）｜${s.iso}】`,
    '',
    '— 案場出工 —',
  ]
  const activeBlocks = s.blocks.filter((b) => b.workers.length > 0 || b.mealAmount !== 0)
  if (activeBlocks.length === 0) {
    lines.push('（當日各案場格線與餐費皆為 0）')
  } else {
    for (const b of activeBlocks) {
      lines.push(`· ${siteBlockLabelForSummary(b.siteName)}`)
      lines.push(`  出工：${formatBlockWorkers(b)}`)
      if (b.mealAmount !== 0) lines.push(`  餐費欄：${b.mealAmount}`)
    }
  }
  lines.push('', '— 預支 —')
  if (s.advances.length === 0) lines.push('（無）')
  else
    for (const a of s.advances) {
      lines.push(`· ${a.name}：${a.value}`)
    }
  lines.push('', '— 調工支援 —')
  if (s.junAdjust.length === 0) lines.push('（無）')
  else for (const x of s.junAdjust) lines.push(`· ${x.name}：${x.value}`)
  lines.push('', '— 蔡董調工（調工支援）—')
  if (s.tsaiAdjust.length === 0) lines.push('（無）')
  else for (const x of s.tsaiAdjust) lines.push(`· ${x.name}：${x.value}`)
  lines.push('', '— 鈞泩加班（時數）—')
  if (s.junOt.length === 0) lines.push('（無）')
  else for (const x of s.junOt) lines.push(`· ${x.name}：${x.value} 小時`)
  lines.push('', '— 蔡董加班（時數）—')
  if (s.tsaiOt.length === 0) lines.push('（無）')
  else for (const x of s.tsaiOt) lines.push(`· ${x.name}：${x.value} 小時`)
  lines.push('', '— 當日相關人員 · 表頭日薪 —')
  if (s.staffRates.length === 0) lines.push('（無）')
  else
    for (const r of s.staffRates) {
      lines.push(`· ${r.name}：鈞泩 ${r.rateJun} ／ 蔡董 ${r.rateTsai}`)
    }
  return lines.join('\n')
}

export type PayrollDraftPrefill = {
  staffNames: string[]
  mealCost: number
  /** 表單預選案場（單一案名）；多案場時為排序後第一個，請分筆儲存 */
  siteName: string
  /** 當日格線有出工之案場名（去重、排序）；一案場一筆日誌時用於提示 */
  siteNamesWithWork: readonly string[]
  /** 當日是否有出工但案場名為空（未命名區塊） */
  hasUnnamedSiteWork: boolean
  remarkAppend: string
}

/** 當日各案場格線有出工者之案名（不含重複）；另標是否含未命名案場區塊 */
export function payrollSiteNamesWithGridWork(s: PayrollDaySnapshot): {
  siteNamesWithWork: string[]
  hasUnnamedSiteWork: boolean
} {
  const blocksWithWorkers = s.blocks.filter((b) => b.workers.length > 0)
  const named = new Set<string>()
  let hasUnnamedSiteWork = false
  for (const b of blocksWithWorkers) {
    const t = b.siteName.trim()
    if (t && !isPlaceholderMonthBlockSiteName(t)) named.add(t)
    else if (!t || isPlaceholderMonthBlockSiteName(t)) hasUnnamedSiteWork = true
  }
  const siteNamesWithWork = [...named].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  return { siteNamesWithWork, hasUnnamedSiteWork }
}

function sortZhNames(names: Iterable<string>): string[] {
  return [...names].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
}

/** 當日預支／調工支援／加班等非格線列、曾出現之人員（數值非零） */
function dayWideStaffNames(s: PayrollDaySnapshot): Set<string> {
  const names = new Set<string>()
  for (const x of s.advances) if (x.value !== 0) names.add(x.name)
  for (const x of s.junAdjust) if (x.value !== 0) names.add(x.name)
  for (const x of s.tsaiAdjust) if (x.value !== 0) names.add(x.name)
  for (const x of s.junOt) if (x.value !== 0) names.add(x.name)
  for (const x of s.tsaiOt) if (x.value !== 0) names.add(x.name)
  return names
}

/** 指定案名（trim 相等）之格線出工人員 */
export function payrollGridStaffAtSite(s: PayrollDaySnapshot, siteName: string): string[] {
  const t = siteName.trim()
  if (!t) return []
  const names = new Set<string>()
  for (const b of s.blocks) {
    if (b.siteName.trim() !== t) continue
    for (const w of b.workers) names.add(w.name)
  }
  return sortZhNames(names)
}

/** 指定案名對應區塊之餐費欄加總（月表該日） */
export function payrollMealSumAtNamedSite(s: PayrollDaySnapshot, siteName: string): number {
  const t = siteName.trim()
  if (!t) return 0
  return s.blocks
    .filter((b) => b.siteName.trim() === t)
    .reduce((sum, b) => sum + (b.mealAmount || 0), 0)
}

/**
 * 依表單選定「案場」從月表推算施工人員與餐費，供帶入或切換案場時套用。
 * - 具名格線案場：人員為該案場列當日出工者；同日僅一案場格線時另併入預支／調工／加班等當日列之人員，多案場格線時**不**併入（避免 A 場帶到 B 場的人），餐費為該案場列餐費加總。
 * - 調工支援鍵：人員為該列當日非零者，餐費 0。
 * - 未命名格線：僅當當日**沒有任何具名格線案場**時，選「請選擇」才帶入未命名區塊之人員／餐費；否則回傳 null。
 * - 自訂案名與當日格線無對應時回傳 null（不自動改人員／餐費）。
 */
export function payrollStaffMealForFormSite(
  s: PayrollDaySnapshot,
  siteName: string,
): { staffNames: string[]; mealCost: number } | null {
  const { siteNamesWithWork, hasUnnamedSiteWork } = payrollSiteNamesWithGridWork(s)
  const multiNamedGridSites = siteNamesWithWork.length > 1
  const t = siteName.trim()

  if (siteName === QUICK_SITE_TSAI_ADJUST) {
    const names = new Set(s.tsaiAdjust.filter((x) => x.value !== 0).map((x) => x.name))
    return { staffNames: sortZhNames(names), mealCost: 0 }
  }
  if (siteName === QUICK_SITE_JUN_ADJUST) {
    const names = new Set(s.junAdjust.filter((x) => x.value !== 0).map((x) => x.name))
    return { staffNames: sortZhNames(names), mealCost: 0 }
  }

  if (t && siteNamesWithWork.includes(t)) {
    const gridStaff = payrollGridStaffAtSite(s, t)
    const merged = new Set<string>(gridStaff)
    if (!multiNamedGridSites) {
      for (const n of dayWideStaffNames(s)) merged.add(n)
    }
    return { staffNames: sortZhNames(merged), mealCost: payrollMealSumAtNamedSite(s, t) }
  }

  if (!t && hasUnnamedSiteWork && siteNamesWithWork.length === 0) {
    const names = new Set<string>()
    let meal = 0
    for (const b of s.blocks) {
      if (b.siteName.trim() && !isPlaceholderMonthBlockSiteName(b.siteName)) continue
      meal += b.mealAmount || 0
      for (const w of b.workers) names.add(w.name)
    }
    if (names.size === 0 && meal === 0) return null
    return { staffNames: sortZhNames(names), mealCost: meal }
  }

  return null
}

/**
 * 依月表當日彙總帶入表單：案場為格線有出工者——僅一案名則帶入該名；多案名則帶入排序後第一案名（日誌應分筆）；僅調工時帶入調工鍵名；僅未命名格線則案場空白。
 * 施工人員與餐費依**上列預選案場**由 {@link payrollStaffMealForFormSite} 決定（多案場日僅帶該場格線人員與該場餐費）。
 */
export function prefillFromPayrollDaySnapshot(s: PayrollDaySnapshot): PayrollDraftPrefill {
  const { siteNamesWithWork, hasUnnamedSiteWork } = payrollSiteNamesWithGridWork(s)

  let siteName = ''
  if (siteNamesWithWork.length === 1) {
    siteName = siteNamesWithWork[0]
  } else if (siteNamesWithWork.length > 1) {
    siteName = siteNamesWithWork[0]
  } else if (hasUnnamedSiteWork) {
    siteName = ''
  } else {
    const hasJun = s.junAdjust.some((x) => x.value !== 0)
    const hasTsai = s.tsaiAdjust.some((x) => x.value !== 0)
    if (hasTsai && !hasJun) siteName = QUICK_SITE_TSAI_ADJUST
    else if (hasJun && !hasTsai) siteName = QUICK_SITE_JUN_ADJUST
    else if (hasJun && hasTsai) siteName = QUICK_SITE_JUN_ADJUST
  }

  const scoped = payrollStaffMealForFormSite(s, siteName)
  let staffNames: string[]
  let mealCost: number
  if (scoped) {
    staffNames = scoped.staffNames
    mealCost = scoped.mealCost
  } else {
    const names = new Set<string>()
    for (const b of s.blocks) for (const w of b.workers) names.add(w.name)
    for (const n of dayWideStaffNames(s)) names.add(n)
    staffNames = sortZhNames(names)
    mealCost = s.blocks.reduce((sum, b) => sum + (b.mealAmount || 0), 0)
  }

  const remarkAppend = formatPayrollDaySnapshotLines(s)
  return { staffNames, mealCost, siteName, siteNamesWithWork, hasUnnamedSiteWork, remarkAppend }
}

/** 未命名案場區塊之格線出工人員 */
function payrollGridStaffUnnamedBlocks(s: PayrollDaySnapshot): string[] {
  const names = new Set<string>()
  for (const b of s.blocks) {
    if (b.siteName.trim() && !isPlaceholderMonthBlockSiteName(b.siteName)) continue
    for (const w of b.workers) names.add(w.name)
  }
  return sortZhNames(names)
}

/**
 * 月表該日：各案場出工格＋調工支援／蔡董調工「天數」加總（同人跨案場多格各算一格）。
 */
export function payrollDayTotalWorkDays(s: PayrollDaySnapshot): number {
  let sum = 0
  for (const b of s.blocks) {
    for (const w of b.workers) {
      const v = w.dayValue
      if (Number.isFinite(v)) sum += v
    }
  }
  for (const x of s.junAdjust) {
    if (Number.isFinite(x.value)) sum += x.value
  }
  for (const x of s.tsaiAdjust) {
    if (Number.isFinite(x.value)) sum += x.value
  }
  return Math.round(sum * 1000) / 1000
}

/**
 * 月曆格僅有月表、無日誌時：地點／人數／人員與表單帶入一致——
 * 多具名案場（或具名＋未命名）時人員依「案場：人員」分段；單一案場格線時人員含當日預支／加班等列（與 {@link payrollStaffMealForFormSite} 一致）。
 * **地點**僅表示格線或調工案場；僅有預支列非零時地點仍內部記為「—」，且設 {@link advanceOnlyMinimalCell}：月曆格**不顯示**地點／人數／人員／工作列；**仍**顯示「預」角標（明細見整日工作誌底部月表預支區塊）。
 */
export function payrollCalendarCellSummary(s: PayrollDaySnapshot): {
  siteLabel: string
  staffCount: number
  staffLabel: string
  workLabel: string
  /** 月表該日出工格＋調工天數加總（天） */
  totalWorkDays: number
  /** 僅預支、無案場／調工：月曆格不顯示摘要列（「預」仍由 UI 依月表顯示） */
  advanceOnlyMinimalCell: boolean
} {
  const { siteNamesWithWork, hasUnnamedSiteWork } = payrollSiteNamesWithGridWork(s)

  let siteLabel = siteNamesWithWork.join('\n')
  if (hasUnnamedSiteWork) {
    siteLabel = siteLabel ? `${siteLabel}\n（未命名）` : '（未命名）'
  }
  if (!siteLabel) {
    const hasJun = s.junAdjust.some((x) => x.value !== 0)
    const hasTsai = s.tsaiAdjust.some((x) => x.value !== 0)
    if (hasTsai && !hasJun) siteLabel = QUICK_SITE_TSAI_ADJUST
    else if (hasJun && !hasTsai) siteLabel = QUICK_SITE_JUN_ADJUST
    else if (hasJun && hasTsai) siteLabel = `${QUICK_SITE_JUN_ADJUST}\n${QUICK_SITE_TSAI_ADJUST}`
    else if (s.advances.some((x) => x.value)) siteLabel = '—'
    else siteLabel = '月表'
  }

  const segmentCount = siteNamesWithWork.length + (hasUnnamedSiteWork ? 1 : 0)
  const splitStaffBySite = segmentCount > 1

  let staffLabel: string
  let staffCount: number

  if (splitStaffBySite) {
    const parts: string[] = []
    const uniq = new Set<string>()
    for (const site of siteNamesWithWork) {
      const names = payrollGridStaffAtSite(s, site)
      for (const n of names) uniq.add(n)
      parts.push(`${site}：\n${names.length ? names.join('\n') : '—'}`)
    }
    if (hasUnnamedSiteWork) {
      const un = payrollGridStaffUnnamedBlocks(s)
      for (const n of un) uniq.add(n)
      parts.push(`（未命名）：\n${un.length ? un.join('\n') : '—'}`)
    }
    staffLabel = parts.join('\n')
    staffCount = uniq.size
  } else if (siteNamesWithWork.length === 1) {
    const site = siteNamesWithWork[0]
    const scoped = payrollStaffMealForFormSite(s, site)
    const names = scoped?.staffNames ?? []
    staffLabel = names.length ? `${site}：\n${names.join('\n')}` : '—'
    staffCount = names.length
  } else if (hasUnnamedSiteWork) {
    const scoped = payrollStaffMealForFormSite(s, '')
    const names = scoped?.staffNames ?? []
    staffLabel = names.length ? `（未命名）：\n${names.join('\n')}` : '—'
    staffCount = names.length
  } else {
    const hasJun = s.junAdjust.some((x) => x.value !== 0)
    const hasTsai = s.tsaiAdjust.some((x) => x.value !== 0)
    let siteKey = ''
    if (hasTsai && !hasJun) siteKey = QUICK_SITE_TSAI_ADJUST
    else if (hasJun && !hasTsai) siteKey = QUICK_SITE_JUN_ADJUST
    else if (hasJun && hasTsai) siteKey = QUICK_SITE_JUN_ADJUST
    if (siteKey) {
      const scoped = payrollStaffMealForFormSite(s, siteKey)
      const names = scoped?.staffNames ?? []
      staffLabel = names.length ? `${siteKey}：\n${names.join('\n')}` : '—'
      staffCount = names.length
    } else {
      staffLabel = s.staffRates.map((r) => r.name).join('\n') || '—'
      staffCount = s.staffRates.length
    }
  }

  const workLabel = '—'
  /** 本函式內僅「僅預支」分支會將地點設為「—」 */
  const advanceOnlyMinimalCell = siteLabel === '—'
  const totalWorkDays = payrollDayTotalWorkDays(s)
  if (advanceOnlyMinimalCell) {
    staffCount = 0
    staffLabel = ''
  }
  return { siteLabel, staffCount, staffLabel, workLabel, totalWorkDays, advanceOnlyMinimalCell }
}
