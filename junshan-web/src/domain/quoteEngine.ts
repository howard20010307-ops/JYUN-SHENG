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
  baseTotal: number
  pricingPerFloor: number
  pricingTotal: number
  instrumentPerFloor: number
  instrumentModule: number
  miscModule: number
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
    regionCost,
  }
}

export type FloorArea = { name: string; m2: number }

export type QuoteSite = {
  name: string
  floors: FloorArea[]
  fees: SiteFees
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

export function exampleSite(): QuoteSite {
  const f = defaultSiteFees()
  return {
    name: '範例案場',
    fees: f,
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

function row(p: Omit<QuoteRow, 'id'>, i: number): QuoteRow {
  return { id: `q-${i}`, ...p }
}

/** 與試算表相同結構的預設工序（可於 UI 增刪改） */
export function defaultQuoteRows(): QuoteRow[] {
  const risk = 30
  const T = true
  const F = false
  return [
    row(
      {
      zone: '基礎工程',
      item: '點位收測',
      sameFloors: 1,
      basePerFloor: 2,
      riskPct: risk,
      useTotalStation: T,
      useRotatingLaser: F,
      useLineLaser: F,
      miscPerFloor: 100,
    },
      0,
    ),
    row(
      {
      zone: '基礎工程',
      item: 'GL+100高程放樣',
      sameFloors: 1,
      basePerFloor: 2,
      riskPct: risk,
      useTotalStation: F,
      useRotatingLaser: T,
      useLineLaser: F,
      miscPerFloor: 100,
    },
      1,
    ),
    row(
      {
      zone: '基礎工程',
      item: ' 基礎放樣',
      sameFloors: 1,
      basePerFloor: 10,
      riskPct: risk,
      useTotalStation: T,
      useRotatingLaser: F,
      useLineLaser: T,
      miscPerFloor: 100,
    },
      2,
    ),
    row(
      {
      zone: 'B1F',
      item: '樓板放樣',
      sameFloors: 1,
      basePerFloor: 6,
      riskPct: risk,
      useTotalStation: T,
      useRotatingLaser: F,
      useLineLaser: T,
      miscPerFloor: 100,
    },
      3,
    ),
    row(
      {
      zone: '1F',
      item: '樓板放樣',
      sameFloors: 1,
      basePerFloor: 6,
      riskPct: risk,
      useTotalStation: T,
      useRotatingLaser: F,
      useLineLaser: T,
      miscPerFloor: 100,
    },
      4,
    ),
    row(
      {
      zone: '夾層',
      item: '樓板放樣',
      sameFloors: 1,
      basePerFloor: 6,
      riskPct: risk,
      useTotalStation: T,
      useRotatingLaser: F,
      useLineLaser: T,
      miscPerFloor: 100,
    },
      5,
    ),
    row(
      {
      zone: '正常樓',
      item: '樓板放樣',
      sameFloors: 8,
      basePerFloor: 6,
      riskPct: risk,
      useTotalStation: T,
      useRotatingLaser: F,
      useLineLaser: T,
      miscPerFloor: 100,
    },
      6,
    ),
    row(
      {
      zone: 'RF',
      item: '樓板放樣',
      sameFloors: 3,
      basePerFloor: 2,
      riskPct: risk,
      useTotalStation: T,
      useRotatingLaser: F,
      useLineLaser: T,
      miscPerFloor: 100,
    },
      7,
    ),
  ]
}
