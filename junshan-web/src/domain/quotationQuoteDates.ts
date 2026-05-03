/**
 * 報價日期／有效天數／報價期限：以可解析的西元日期為準互相換算（本地曆日，不含時段）。
 */

export function parseQuotationCalendarDate(raw: string): Date | null {
  const s = raw.trim()
  if (!s) return null
  const m = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/.exec(s)
  if (m) {
    const y = Number(m[1])
    const mo = Number(m[2])
    const d = Number(m[3])
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null
    const dt = new Date(y, mo - 1, d)
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
    return dt
  }
  const t = Date.parse(s.replace(/\//g, '-'))
  if (Number.isNaN(t)) return null
  const dt = new Date(t)
  if (Number.isNaN(dt.getTime())) return null
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())
}

export function formatQuotationCalendarDate(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}/${mo}/${day}`
}

export function addCalendarDays(base: Date, days: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  d.setDate(d.getDate() + days)
  return d
}

/** 自 start 至 end 的曆日差（end 當天算第 N 天則 N = diff；同日為 0）。 */
export function diffCalendarDays(start: Date, end: Date): number {
  const a = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const b = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

export function parseDayCount(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  const n = Number.parseInt(s, 10)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

/** 報價日期存檔字串 → `<input type="date">` 的 value（YYYY-MM-DD）；無法解析則 `''`。 */
export function quotationMetaDateToIsoInput(raw: string): string {
  const d = parseQuotationCalendarDate(raw)
  if (!d) return ''
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

/** date input 的 value（YYYY-MM-DD）→ 存檔用 `YYYY/MM/DD`；清空則 `''`。 */
export function quotationIsoInputToMetaDate(iso: string): string {
  const t = iso.trim()
  if (!t) return ''
  const d = parseQuotationCalendarDate(t)
  if (!d) return ''
  return formatQuotationCalendarDate(d)
}
