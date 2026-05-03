/**
 * 業主版工作內容：由估價列產生「細項＋工數（基礎或計價擇一）＋坪數」，不帶金額。
 * 所選工數為 0 之細項不列入。
 */
import {
  computeRow,
  floorNameToQuoteZone,
  m2ToPing,
  type QuoteRow,
  type QuoteRowComputed,
  type QuoteSite,
} from './quoteEngine'

export type OwnerWorkScopeMode = 'module' | 'perFloor'

/** 業主表欲顯示之工數欄：基礎總工數（E）或計價工數（H，含風險係數） */
export type OwnerWorkScopeLaborKind = 'base' | 'pricing'

export type OwnerWorkScopeLine = {
  item: string
  /** 依 {@link OwnerWorkScopeLaborKind} 為基礎總工數或計價工數（逐層版為該層攤額） */
  laborDays: number
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

export function ownerWorkScopeLaborColumnLabel(kind: OwnerWorkScopeLaborKind): string {
  return kind === 'base' ? '基礎工數' : '計價工數'
}

function nonZeroLabor(n: number): boolean {
  return Number.isFinite(n) && n > 1e-9
}

function pickLabor(c: QuoteRowComputed, kind: OwnerWorkScopeLaborKind): number {
  return kind === 'base' ? c.baseTotal : c.pricingTotal
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
 * @param mode `module`：依估價模組合併；`perFloor`：依樓層面積表逐層攤工數。
 * @param laborKind `base`：E 欄基礎總工數；`pricing`：H 欄計價工數（含風險係數）。
 */
export function buildOwnerWorkScope(
  site: QuoteSite,
  rows: readonly QuoteRow[],
  mode: OwnerWorkScopeMode,
  laborKind: OwnerWorkScopeLaborKind,
): OwnerWorkScopeSection[] {
  if (mode === 'module') {
    const out: OwnerWorkScopeSection[] = []
    for (const zone of zonesInRowOrder(rows)) {
      const ping = moduleTotalPing(site, zone)
      const lines: OwnerWorkScopeLine[] = []
      for (const r of rows) {
        if (r.zone !== zone) continue
        const c = computeRow(r, site.fees)
        const v = pickLabor(c, laborKind)
        if (!nonZeroLabor(v)) continue
        lines.push({
          item: r.item,
          laborDays: v,
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
        const total = pickLabor(c, laborKind)
        const perFloor = total / floors
        if (!nonZeroLabor(perFloor)) continue
        lines.push({
          item: r.item,
          laborDays: perFloor,
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
