/**
 * 依《估價表》區塊與欄 C 邏輯產列；左欄區名／細項文字來自 quoteExcelCanonical。
 * 變更細項清單或列展開規則時請遞增 appState 內 {@link QUOTE_ROWS_SCHEMA_VERSION}。
 */
import type { QuoteLayout, QuoteRow } from './quoteEngine'
import {
  EXCEL_ABOVE_STANDARD_ITEMS,
  EXCEL_BASEMENT_ITEMS,
  EXCEL_FOUNDATION_ITEMS,
  EXCEL_STAGE,
} from './quoteExcelCanonical'

const RISK = 30
const T = true
const F = false
const M = 100

type Seed = Pick<
  QuoteRow,
  | 'basePerFloor'
  | 'useTotalStation'
  | 'useRotatingLaser'
  | 'useLineLaser'
  | 'miscPerFloor'
> & { riskPct?: number }

function rowId(seed: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `q-${Date.now()}-${seed}-${Math.random().toString(36).slice(2, 10)}`
}

function makeRow(
  zone: string,
  item: string,
  sameFloors: number,
  s: Seed,
  idKey: string,
): QuoteRow {
  return {
    id: rowId(idKey),
    zone,
    item,
    sameFloors,
    basePerFloor: s.basePerFloor,
    riskPct: s.riskPct ?? RISK,
    useTotalStation: s.useTotalStation,
    useRotatingLaser: s.useRotatingLaser,
    useLineLaser: s.useLineLaser,
    miscPerFloor: s.miscPerFloor,
  }
}

/** 基礎工程預設（列序須與 EXCEL_FOUNDATION_ITEMS 對齊） */
const FOUNDATION_SEEDS: Seed[] = [
  { basePerFloor: 2, useTotalStation: T, useRotatingLaser: F, useLineLaser: F, miscPerFloor: M },
  { basePerFloor: 2, useTotalStation: F, useRotatingLaser: T, useLineLaser: F, miscPerFloor: M },
  { basePerFloor: 6, useTotalStation: T, useRotatingLaser: F, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 4, useTotalStation: T, useRotatingLaser: F, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 4, useTotalStation: T, useRotatingLaser: F, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 4, useTotalStation: T, useRotatingLaser: T, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 4, useTotalStation: T, useRotatingLaser: F, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 4, useTotalStation: T, useRotatingLaser: T, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 10, useTotalStation: T, useRotatingLaser: F, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 4, useTotalStation: T, useRotatingLaser: T, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 4, useTotalStation: T, useRotatingLaser: F, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 4, useTotalStation: T, useRotatingLaser: F, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 4, useTotalStation: T, useRotatingLaser: F, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 2, useTotalStation: T, useRotatingLaser: F, useLineLaser: T, miscPerFloor: M },
]

/** 地下室預設（須與 EXCEL_BASEMENT_ITEMS 對齊，共 8 列） */
const BASEMENT_SEEDS: Seed[] = [
  { basePerFloor: 6, useTotalStation: T, useRotatingLaser: F, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 6, useTotalStation: T, useRotatingLaser: T, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 4, useTotalStation: T, useRotatingLaser: F, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 4, useTotalStation: T, useRotatingLaser: F, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 4, useTotalStation: T, useRotatingLaser: F, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 4, useTotalStation: T, useRotatingLaser: F, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 2, useTotalStation: T, useRotatingLaser: F, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 4, useTotalStation: T, useRotatingLaser: T, useLineLaser: T, miscPerFloor: M },
]

const ABOVE_STANDARD_SEEDS: Seed[] = [
  { basePerFloor: 6, useTotalStation: T, useRotatingLaser: F, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 6, useTotalStation: T, useRotatingLaser: T, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 4, useTotalStation: T, useRotatingLaser: F, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 4, useTotalStation: T, useRotatingLaser: F, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 4, useTotalStation: T, useRotatingLaser: F, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 4, useTotalStation: T, useRotatingLaser: F, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 2, useTotalStation: T, useRotatingLaser: F, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 4, useTotalStation: T, useRotatingLaser: F, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 4, useTotalStation: T, useRotatingLaser: T, useLineLaser: T, miscPerFloor: M },
  { basePerFloor: 4, useTotalStation: T, useRotatingLaser: F, useLineLaser: T, miscPerFloor: M },
]

if (EXCEL_FOUNDATION_ITEMS.length !== FOUNDATION_SEEDS.length) {
  throw new Error('EXCEL_FOUNDATION_ITEMS 與 FOUNDATION_SEEDS 筆數須一致')
}
if (EXCEL_BASEMENT_ITEMS.length !== BASEMENT_SEEDS.length) {
  throw new Error('EXCEL_BASEMENT_ITEMS 與 BASEMENT_SEEDS 筆數須一致')
}
if (EXCEL_ABOVE_STANDARD_ITEMS.length !== ABOVE_STANDARD_SEEDS.length) {
  throw new Error('EXCEL_ABOVE_STANDARD_ITEMS 與 ABOVE_STANDARD_SEEDS 筆數須一致')
}

const FOUNDATION = EXCEL_FOUNDATION_ITEMS.map((item, i) => ({ item, s: FOUNDATION_SEEDS[i]! }))
const BASEMENT = EXCEL_BASEMENT_ITEMS.map((item, i) => ({ item, s: BASEMENT_SEEDS[i]! }))
const ABOVE_STANDARD = EXCEL_ABOVE_STANDARD_ITEMS.map((item, i) => ({
  item,
  s: ABOVE_STANDARD_SEEDS[i]!,
}))

/**
 * Excel 列序：基礎 → 地下室(除B1)，欄 C＝地下層數−1 → B1F → 1F（10 項，與夾層／正常樓／RF 同一套）→ 夾層 → 正常樓 → RF。
 */
export function buildQuoteRowsFromLayout(l: QuoteLayout): QuoteRow[] {
  const out: QuoteRow[] = []
  let n = 0

  for (const { item, s } of FOUNDATION) {
    n += 1
    out.push(makeRow(EXCEL_STAGE.foundation, item, 1, s, `f-${n}`))
  }

  const belowB1 = Math.max(0, l.basementFloors - 1)
  if (belowB1 > 0) {
    for (const { item, s } of BASEMENT) {
      n += 1
      out.push(makeRow(EXCEL_STAGE.basementExceptB1F, item, belowB1, s, `sub-${n}`))
    }
  }

  if (l.basementFloors >= 1) {
    for (const { item, s } of BASEMENT) {
      n += 1
      out.push(makeRow(EXCEL_STAGE.b1f, item, 1, s, `b1-${n}`))
    }
  }

  for (const { item, s } of ABOVE_STANDARD) {
    n += 1
    out.push(makeRow(EXCEL_STAGE.f1, item, 1, s, `1f-${n}`))
  }

  if (l.hasMezzanine) {
    for (const { item, s } of ABOVE_STANDARD) {
      n += 1
      out.push(makeRow(EXCEL_STAGE.mezzanine, item, 1, s, `m-${n}`))
    }
  }

  if (l.typicalFloors > 0) {
    for (const { item, s } of ABOVE_STANDARD) {
      n += 1
      out.push(makeRow(EXCEL_STAGE.typical, item, l.typicalFloors, s, `t-${n}`))
    }
  }

  if (l.rfCount > 0) {
    for (const { item, s } of ABOVE_STANDARD) {
      n += 1
      out.push(makeRow(EXCEL_STAGE.rf, item, l.rfCount, s, `r-${n}`))
    }
  }

  return out
}

/** 依新 layout 重建估價列，並盡量保留同一「區段＋細項」列上已填的工數／儀器／雜項／風險（欄 C 隨 layout 重算）；手動新增列（id 為 r＋數字）一律附在表尾 */
export function mergeQuoteRowsPreservingValues(
  oldRows: readonly QuoteRow[],
  layout: QuoteLayout,
): QuoteRow[] {
  const next = buildQuoteRowsFromLayout(layout)
  const key = (r: QuoteRow) => `${r.zone}\0${r.item}`
  const oldByKey = new Map<string, QuoteRow>(oldRows.map((r) => [key(r), r]))
  const merged = next.map((nr) => {
    const o = oldByKey.get(key(nr))
    if (!o) return nr
    return {
      ...nr,
      basePerFloor: o.basePerFloor,
      riskPct: o.riskPct,
      useTotalStation: o.useTotalStation,
      useRotatingLaser: o.useRotatingLaser,
      useLineLaser: o.useLineLaser,
      miscPerFloor: o.miscPerFloor,
    }
  })
  const manual = oldRows.filter((r) => /^r\d+$/.test(r.id))
  return [...merged, ...manual]
}

export const ZONES = EXCEL_STAGE

export const TEMPLATE = {
  foundation: [...EXCEL_FOUNDATION_ITEMS],
  basement: [...EXCEL_BASEMENT_ITEMS],
  /** 1F／夾層／正常樓／RF 共用同一套細項 */
  above: [...EXCEL_ABOVE_STANDARD_ITEMS],
} as const

const EXAMPLE_LAYOUT: QuoteLayout = {
  basementFloors: 1,
  hasMezzanine: true,
  typicalStartFloor: 2,
  typicalFloors: 8,
  rfCount: 3,
}

export function defaultQuoteRows(): QuoteRow[] {
  return buildQuoteRowsFromLayout(EXAMPLE_LAYOUT)
}
