/**
 * 業主版工作內容：由估價列產生「細項＋計價工數＋坪數」，不帶金額。
 * 工數為 0 之細項不列入。
 */
import { computeRow, floorNameToQuoteZone, m2ToPing, type QuoteRow, type QuoteSite } from './quoteEngine'

export type OwnerWorkScopeMode = 'module' | 'perFloor'

export type OwnerWorkScopeLine = {
  item: string
  /** 計價工數（與成本表 H 欄累計邏輯一致；逐層版為該層攤額） */
  pricingDays: number
  /** 坪（㎡ 換算） */
  ping: number
}

export type OwnerWorkScopeSection = {
  /** 模組版：模組名稱；逐層版：樓層名稱 */
  title: string
  /** 逐層版：對應之估價模組名（方便對照） */
  moduleLabel?: string
  lines: OwnerWorkScopeLine[]
}

function nonZeroPricingDays(n: number): boolean {
  return Number.isFinite(n) && n > 1e-9
}

function zonesInRowOrder(rows: readonly QuoteRow[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of rows) {
    if (seen.has(r.zone)) continue
    seen.add(r.zone)
    out.push(r.zone)
  }
  return out
}

function moduleTotalPing(site: QuoteSite, zone: string): number {
  let s = 0
  for (const f of site.floors) {
    if (floorNameToQuoteZone(f.name, site.layout) === zone) {
      s += m2ToPing(f.m2)
    }
  }
  return s
}

/**
 * @param mode `module`：依估價模組合併；`perFloor`：依樓層面積表逐層攤計價工數。
 */
export function buildOwnerWorkScope(
  site: QuoteSite,
  rows: readonly QuoteRow[],
  mode: OwnerWorkScopeMode,
): OwnerWorkScopeSection[] {
  if (mode === 'module') {
    const out: OwnerWorkScopeSection[] = []
    for (const zone of zonesInRowOrder(rows)) {
      const ping = moduleTotalPing(site, zone)
      const lines: OwnerWorkScopeLine[] = []
      for (const r of rows) {
        if (r.zone !== zone) continue
        const c = computeRow(r, site.fees)
        if (!nonZeroPricingDays(c.pricingTotal)) continue
        lines.push({
          item: r.item,
          pricingDays: c.pricingTotal,
          ping,
        })
      }
      if (lines.length > 0) {
        out.push({ title: zone, lines })
      }
    }
    return out
  }

  const out: OwnerWorkScopeSection[] = []
  for (const floor of site.floors) {
    const zone = floorNameToQuoteZone(floor.name, site.layout)
    const floorPing = m2ToPing(floor.m2)
    const lines: OwnerWorkScopeLine[] = []
    if (zone) {
      for (const r of rows) {
        if (r.zone !== zone) continue
        const c = computeRow(r, site.fees)
        const floors = Math.max(1, Math.trunc(r.sameFloors) || 1)
        const perFloor = c.pricingTotal / floors
        if (!nonZeroPricingDays(perFloor)) continue
        lines.push({
          item: r.item,
          pricingDays: perFloor,
          ping: floorPing,
        })
      }
    }
    if (lines.length > 0) {
      out.push({
        title: floor.name,
        moduleLabel: zone ?? undefined,
        lines,
      })
    }
  }
  return out
}
