/**
 * 階段（期間）：與收帳「階段（期間）」相同之正規化與解析。
 * 西元 YYYY/M/D、民國年（數值 < 1000 視為民國）；區間以 ~ 或 ～，經正規化為 `YYYY/MM/DD ~ YYYY/MM/DD` 風格存檔。
 */

export function singleLinePhaseText(raw: string): string {
  return (raw ?? '').replace(/\r\n|\r|\n/g, ' ')
}

/** 統一符號與空白（收帳表單同款）。 */
export function normalizePhasePeriodLabel(raw: string): string {
  return singleLinePhaseText(raw)
    .replace(/～/g, '~')
    .replace(/\s*~\s*/g, ' ~ ')
    .replace(/[.]/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 單一日期片段 → ISO `YYYY-MM-DD`；供 `<input type="date">` 與區間運算。 */
export function parsePhaseDateFragmentToIso(fragment: string): string | null {
  const s = (fragment ?? '').trim()
  if (!s) return null
  const m4 = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s)
  if (m4) return `${m4[1]}-${m4[2]!.padStart(2, '0')}-${m4[3]!.padStart(2, '0')}`
  const mRoc = /^(\d{2,3})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s)
  if (mRoc) {
    let y = Number(mRoc[1])
    if (y < 1000) y += 1911
    return `${y}-${mRoc[2]!.padStart(2, '0')}-${mRoc[3]!.padStart(2, '0')}`
  }
  return null
}

/** 供 `<input type="date">`：由階段字串解析起迄（可僅一側有值；無法解析則空字串）。 */
export function phaseRangeDateFieldsFromText(raw: string): { startDate: string; endDate: string } {
  const normalized = normalizePhasePeriodLabel(raw)
  const parts = normalized.split('~').map((x) => x.trim())
  const startDate = parsePhaseDateFragmentToIso(parts[0] ?? '') ?? ''
  const endDate = parsePhaseDateFragmentToIso(parts[1] ?? '') ?? ''
  return { startDate, endDate }
}

/** 與收帳 UI 寫回之字串一致。 */
export function phasePeriodLabelFromIsoRange(startIso: string, endIso: string): string {
  if (!startIso && !endIso) return ''
  const s = startIso ? startIso.replace(/-/g, '/') : ''
  const e = endIso ? endIso.replace(/-/g, '/') : ''
  if (s && e) return `${s} ~ ${e}`
  return s || e
}

/**
 * 兩端日期皆須可解析（未填或純文字階段傳回 null）。
 * 供案場分析「未對應收帳」列依期間對齊出工成本。
 */
export function parsePhasePeriodRangeStrict(raw: string): { start: string; end: string } | null {
  const t = normalizePhasePeriodLabel((raw ?? '').replace(/\u3000/g, ' '))
  if (!t || t === '未填') return null
  const parts = t
    .split('~')
    .map((x) => x.trim())
    .filter(Boolean)
  if (parts.length < 2) return null
  const a = parsePhaseDateFragmentToIso(parts[0]!)
  const b = parsePhaseDateFragmentToIso(parts[1]!)
  if (!a || !b) return null
  return a <= b ? { start: a, end: b } : { start: b, end: a }
}
