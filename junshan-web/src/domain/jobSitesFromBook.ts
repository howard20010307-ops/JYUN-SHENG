import { isPlaceholderMonthBlockSiteName, type SalaryBook } from './salaryExcelModel'
import { QUICK_SITE_JUN_ADJUST, QUICK_SITE_TSAI_ADJUST } from './fieldworkQuickApply'

/** 收帳「案名」下拉選項：`value` 與 {@link receivableSiteSelectValue} 相同（`v:`／`p:`） */
export type PayrollSitePickerOption = { value: string; label: string }

/**
 * 收帳案名選單：與快速登記「總案場整理」相同一覽，**僅顯示案名**（不分月份、不帶月表標籤）。
 */
export function receivableSiteSelectOptionsFromOverview(book: SalaryBook): PayrollSitePickerOption[] {
  return payrollSitesOverviewRows(book).map((r) =>
    r.isVirtualAdjustment
      ? { value: `v:${r.siteName}`, label: r.siteName }
      : { value: `p:${encodeURIComponent(r.siteName)}`, label: r.siteName },
  )
}

/** 快速登記「總案場整理」：不分月份，列出調工列與所有正式案名；`blockCount` 為該案名在全書月表區塊中的列數。 */
export type PayrollSiteOverviewRow = {
  siteName: string
  blockCount: number
  /** 蔡董調工／調工支援等月表專列，非一般案場區塊 */
  isVirtualAdjustment: boolean
}

export function payrollSitesOverviewRows(book: SalaryBook): PayrollSiteOverviewRow[] {
  const virtual: PayrollSiteOverviewRow[] = [
    { siteName: QUICK_SITE_TSAI_ADJUST, blockCount: 0, isVirtualAdjustment: true },
    { siteName: QUICK_SITE_JUN_ADJUST, blockCount: 0, isVirtualAdjustment: true },
  ]
  const byName = new Map<string, number>()
  for (const m of book.months) {
    for (const b of m.blocks) {
      const n = b.siteName.trim()
      if (!n || isPlaceholderMonthBlockSiteName(n)) continue
      byName.set(n, (byName.get(n) ?? 0) + 1)
    }
  }
  const blocks = [...byName.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'zh-Hant'))
    .map(([siteName, blockCount]) => ({
      siteName,
      blockCount,
      isVirtualAdjustment: false,
    }))
  return [...virtual, ...blocks]
}

/** 案名以儲存字串**完全**比對；去尾端空白後非空才出現於選單；不併「看起來像」的不同寫法。 */
export function jobSitesFromSalaryBook(book: SalaryBook): { id: string; name: string }[] {
  const seen = new Set<string>()
  const out: { id: string; name: string }[] = []
  for (const raw of [QUICK_SITE_TSAI_ADJUST, QUICK_SITE_JUN_ADJUST]) {
    if (seen.has(raw)) continue
    seen.add(raw)
    out.push({ id: raw, name: raw })
  }
  for (const m of book.months) {
    for (const b of m.blocks) {
      const raw = b.siteName
      if (!raw.trim() || seen.has(raw) || isPlaceholderMonthBlockSiteName(raw)) continue
      seen.add(raw)
      out.push({ id: raw, name: raw })
    }
  }
  const head = [QUICK_SITE_TSAI_ADJUST, QUICK_SITE_JUN_ADJUST]
  const tail = out
    .filter((o) => !head.includes(o.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
  return [...head.filter((n) => seen.has(n)).map((n) => ({ id: n, name: n })), ...tail]
}
