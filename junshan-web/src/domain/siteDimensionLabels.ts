/**
 * 棟／樓層／階段：全形空白與連續空白壓成單一空白後 trim（不變更空字串，利於收帳與合約欄位一致）。
 */
export function collapseSiteDimensionWhitespace(raw: string): string {
  return (raw ?? '').replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * 與 {@link collapseSiteDimensionWhitespace} 相同，另將空字串視為「未填」——供案場分析分組、計價工作區對鍵與畫面補字一致使用。
 */
export function normalizeSiteDimensionLabel(raw: string): string {
  const t = collapseSiteDimensionWhitespace(raw)
  return t === '' ? '未填' : t
}
