import { isPlaceholderMonthBlockSiteName, type SalaryBook } from './salaryExcelModel'
import { QUICK_SITE_JUN_ADJUST, QUICK_SITE_TSAI_ADJUST } from './fieldworkQuickApply'

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
