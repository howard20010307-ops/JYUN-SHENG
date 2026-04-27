/** 放樣估價：對應《鈞泩估價表》成本估算列的計算邏輯 */

export type SiteFees = {
  laborPerDay: number
  totalStationPerDay: number
  rotatingLaserPerDay: number
  lineLaserPerDay: number
  drawingPerPing: number
}

export type QuoteRow = {
  id: string
  zone: string
  item: string
  sameFloors: number
  basePerFloor: number
  riskPct: number
  useTotalStation: boolean
  useRotatingLaser: boolean
  useLineLaser: boolean
  miscPerFloor: number
}

export type QuoteRowComputed = QuoteRow & {
  /** E 基礎總工數 */
  baseTotal: number
  /** G 單趟計價工數（單層、含風險係數後） */
  pricingPerFloor: number
  /** H 總計價工數 */
  pricingTotal: number
  /** N 單趟儀器成本（元／趟，費率來自案場費率） */
  instrumentPerFloor: number
  /** O 模組儀器成本 */
  instrumentModule: number
  /** M 模組細項單項成本（雜項×樓層數） */
  miscModule: number
  /** P 單層細項計價（元）：計價工數×單工＋單趟儀器＋單層雜項 */
  floorStageQuote: number
  /** Q 區域細項合計計價（元） */
  regionCost: number
}

export function m2ToPing(m2: number): number {
  return m2 / 3.305785123966941
}

export function computeRow(row: QuoteRow, fees: SiteFees): QuoteRowComputed {
  const baseTotal = row.basePerFloor * row.sameFloors
  const k = 1 + row.riskPct / 100
  const pricingPerFloor = row.basePerFloor * k
  const pricingTotal = baseTotal * k
  const instrumentPerFloor =
    (row.useTotalStation ? fees.totalStationPerDay : 0) +
    (row.useRotatingLaser ? fees.rotatingLaserPerDay : 0) +
    (row.useLineLaser ? fees.lineLaserPerDay : 0)
  const instrumentModule = instrumentPerFloor * row.sameFloors
  const miscModule = row.miscPerFloor * row.sameFloors
  const floorStageQuote =
    pricingPerFloor * fees.laborPerDay +
    instrumentPerFloor +
    row.miscPerFloor
  const regionCost =
    pricingTotal * fees.laborPerDay + instrumentModule + miscModule
  return {
    ...row,
    baseTotal,
    pricingPerFloor,
    pricingTotal,
    instrumentPerFloor,
    instrumentModule,
    miscModule,
    floorStageQuote,
    regionCost,
  }
}

export type FloorArea = { name: string; m2: number }

/** 專案樓層（成本表展開為「每樓層逐列」，與 Excel 對齊時各列之「樓層／階段」） */
export type QuoteLayout = {
  /** 0＝無地下；≥2 時依序列出 B2…Bn（地下非 B1 各層一批固定細項） */
  basementFloors: number
  hasMezzanine: boolean
  /** 標準層第一層為第幾 F（必須 ≥2；1F 永遠獨立於此區） */
  typicalStartFloor: number
  /** 正常樓連續層數（自 typicalStartFloor 起）；0＝不展開標準層 */
  typicalFloors: number
  /** RF 等屋突樓數：逐一列出 R1、R2… */
  rfCount: number
}

export type QuoteSite = {
  name: string
  floors: FloorArea[]
  fees: SiteFees
  layout: QuoteLayout
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Math.max(min, Math.min(max, Math.trunc(v)))
  }
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseInt(v, 10)
    if (Number.isFinite(n)) return Math.max(min, Math.min(max, n))
  }
  return fallback
}

export function defaultQuoteLayout(): QuoteLayout {
  return {
    basementFloors: 0,
    hasMezzanine: false,
    typicalStartFloor: 2,
    typicalFloors: 0,
    rfCount: 0,
  }
}

export function normalizeQuoteLayout(raw: unknown): QuoteLayout {
  const d = defaultQuoteLayout()
  if (!raw || typeof raw !== 'object') return d
  const o = raw as Record<string, unknown>
  return {
    basementFloors: clampInt(o.basementFloors, 0, 30, d.basementFloors),
    hasMezzanine: typeof o.hasMezzanine === 'boolean' ? o.hasMezzanine : d.hasMezzanine,
    typicalStartFloor: clampInt(o.typicalStartFloor, 2, 99, d.typicalStartFloor),
    typicalFloors: clampInt(o.typicalFloors, 0, 200, d.typicalFloors),
    rfCount: clampInt(o.rfCount, 0, 50, d.rfCount),
  }
}

function feeN(v: unknown, d: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v)
    if (Number.isFinite(n)) return n
  }
  return d
}

export function migrateQuoteSite(raw: unknown): QuoteSite {
  const init: QuoteSite = { name: '', floors: [], fees: defaultSiteFees(), layout: defaultQuoteLayout() }
  if (!raw || typeof raw !== 'object') return init
  const s = raw as Record<string, unknown>
  const name = typeof s.name === 'string' ? s.name : init.name
  const d0 = defaultSiteFees()
  const o = s.fees && typeof s.fees === 'object' && s.fees !== null ? (s.fees as Record<string, unknown>) : {}
  const fees: SiteFees = {
    laborPerDay: feeN(o.laborPerDay, d0.laborPerDay),
    totalStationPerDay: feeN(o.totalStationPerDay, d0.totalStationPerDay),
    rotatingLaserPerDay: feeN(o.rotatingLaserPerDay, d0.rotatingLaserPerDay),
    lineLaserPerDay: feeN(o.lineLaserPerDay, d0.lineLaserPerDay),
    drawingPerPing: feeN(o.drawingPerPing, d0.drawingPerPing),
  }
  const floors: FloorArea[] = Array.isArray(s.floors)
    ? s.floors
        .map((f) => {
          if (!f || typeof f !== 'object') return null
          const e = f as Record<string, unknown>
          return {
            name: typeof e.name === 'string' ? e.name : '樓層',
            m2: feeN(e.m2, 0),
          }
        })
        .filter((x): x is FloorArea => x !== null)
    : init.floors
  return {
    name,
    floors,
    fees,
    layout: 'layout' in s ? normalizeQuoteLayout(s.layout) : init.layout,
  }
}

export function sumPing(site: QuoteSite): number {
  return site.floors.reduce((s, f) => s + m2ToPing(f.m2), 0)
}

export function computeQuote(site: QuoteSite, rows: QuoteRow[]) {
  const computed = rows.map((r) => computeRow(r, site.fees))
  const totalBase = computed.reduce((s, r) => s + r.baseTotal, 0)
  const totalPricingDays = computed.reduce((s, r) => s + r.pricingTotal, 0)
  const totalRegion = computed.reduce((s, r) => s + r.regionCost, 0)
  const ping = sumPing(site)
  const drawingCost = ping * site.fees.drawingPerPing
  const totalCost = totalRegion + drawingCost
  const costPerPing = ping > 0 ? totalCost / ping : 0
  const costPerPingExDrawing =
    ping > 0 ? (totalCost - drawingCost) / ping : 0
  return {
    computed,
    totalBase,
    totalPricingDays,
    totalRegion,
    drawingCost,
    totalCost,
    ping,
    costPerPing,
    costPerPingExDrawing,
  }
}

export function defaultSiteFees(): SiteFees {
  return {
    laborPerDay: 3500,
    totalStationPerDay: 2000,
    rotatingLaserPerDay: 500,
    lineLaserPerDay: 100,
    drawingPerPing: 100,
  }
}

export function exampleQuoteLayout(): QuoteLayout {
  return {
    basementFloors: 1,
    hasMezzanine: true,
    typicalStartFloor: 2,
    typicalFloors: 8,
    rfCount: 3,
  }
}

export function exampleSite(): QuoteSite {
  const f = defaultSiteFees()
  return {
    name: '範例案場',
    fees: f,
    layout: exampleQuoteLayout(),
    floors: [
      { name: '基礎工程', m2: 1899.29 },
      { name: 'B1', m2: 1899.29 },
      { name: '1F', m2: 1264.73 },
      { name: '夾層', m2: 219.73 },
      ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
        name: `${n}F`,
        m2: 762.23,
      })),
      ...[1, 2, 3].map((n) => ({ name: `R${n}`, m2: 120.71 })),
    ],
  }
}

export {
  buildQuoteRowsFromLayout,
  TEMPLATE,
  ZONES,
  defaultQuoteRows,
} from './quoteLayoutBuild'
