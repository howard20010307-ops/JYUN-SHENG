/** 放樣估價：對應《鈞泩估價表》成本估算列的計算邏輯 */

import { canonicalQuoteItemOrder, EXCEL_STAGE } from './quoteExcelCanonical'

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

/** 業主／發包方（甲方）：承攬供述明細 PDF 用，與案場一併儲存 */
export type QuoteOwnerClient = {
  companyName: string
  /** 選填；有填寫則 PDF 多一行「聯絡地址」 */
  address: string
  contactName: string
  phoneEmail: string
  taxId: string
}

export function defaultQuoteOwnerClient(): QuoteOwnerClient {
  return {
    companyName: '',
    address: '',
    contactName: '',
    phoneEmail: '',
    taxId: '',
  }
}

function migrateQuoteOwnerClient(raw: unknown): QuoteOwnerClient {
  const d = defaultQuoteOwnerClient()
  if (!raw || typeof raw !== 'object') return d
  const o = raw as Record<string, unknown>
  const str = (key: keyof QuoteOwnerClient): string =>
    typeof o[key] === 'string' ? (o[key] as string) : d[key]
  return {
    companyName: str('companyName'),
    address: str('address'),
    contactName: str('contactName'),
    phoneEmail: str('phoneEmail'),
    taxId: str('taxId'),
  }
}

export type QuoteSite = {
  name: string
  floors: FloorArea[]
  fees: SiteFees
  layout: QuoteLayout
  ownerClient: QuoteOwnerClient
}

/** 依專案樓層產生樓層面積表列名順序：基礎 → B1…Bn → 1F → 夾層（有則）→ nF… → R… */
export function floorNamesFromQuoteLayout(l: QuoteLayout): string[] {
  const names: string[] = ['基礎工程']
  if (l.basementFloors >= 1) {
    for (let k = 1; k <= l.basementFloors; k++) {
      names.push(`B${k}`)
    }
  }
  names.push('1F')
  if (l.hasMezzanine) {
    names.push('夾層')
  }
  const start = l.typicalStartFloor
  for (let i = 0; i < l.typicalFloors; i++) {
    names.push(`${start + i}F`)
  }
  for (let r = 1; r <= l.rfCount; r++) {
    names.push(`R${r}`)
  }
  return names
}

/**
 * 是否為「與專案樓層連動」的固定列名格式；若已不在目前 {@link floorNamesFromQuoteLayout} 清單內，代表舊 layout 殘列應刪除（例如少掉一層地下後的 B2）。
 */
function isStructuredFloorLabel(name: string): boolean {
  if (name === '基礎工程' || name === '1F' || name === '夾層') return true
  if (/^B\d+$/.test(name)) return true
  if (/^\d+F$/.test(name)) return true
  if (/^R\d+$/.test(name)) return true
  return false
}

/**
 * 依 {@link QuoteLayout} 重排／增刪樓層面積列；同名樓層保留原 ㎡，其餘補 0。
 * 表尾僅保留非上述固定格式的自訂列（例如「閣樓」）；曾存在但 layout 已刪除的 B2／9F 等不保留。
 */
export function syncFloorsWithLayout(
  prevFloors: readonly FloorArea[],
  layout: QuoteLayout,
): FloorArea[] {
  const canonical = floorNamesFromQuoteLayout(layout)
  const byName = new Map(prevFloors.map((f) => [f.name, f.m2]))
  const core = canonical.map((name) => ({
    name,
    m2: byName.has(name) ? (byName.get(name) as number) : 0,
  }))
  const canonSet = new Set(canonical)
  const extras = prevFloors.filter(
    (f) => !canonSet.has(f.name) && !isStructuredFloorLabel(f.name),
  )
  return [...core, ...extras]
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

/** 與試算表常見範例一致：B1、夾層、2F 起 8 層、RF×3（無 B2 時不產生「地下室(除B1F以外)」區塊） */
export function exampleQuoteLayout(): QuoteLayout {
  return {
    basementFloors: 1,
    hasMezzanine: true,
    typicalStartFloor: 2,
    typicalFloors: 8,
    rfCount: 3,
  }
}

/** 新案場預設＝試算表範例樓層，以確保 B1F／夾層／正常樓／RF 等區塊會產生估價列 */
export function defaultQuoteLayout(): QuoteLayout {
  return exampleQuoteLayout()
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
  const init: QuoteSite = {
    name: '',
    floors: [],
    fees: defaultSiteFees(),
    layout: defaultQuoteLayout(),
    ownerClient: defaultQuoteOwnerClient(),
  }
  if (!raw || typeof raw !== 'object') return init
  const s = raw as Record<string, unknown>
  const nameRaw = typeof s.name === 'string' ? s.name : init.name
  const name = nameRaw === '鈞泩調工' ? '調工支援' : nameRaw
  const d0 = defaultSiteFees()
  const o = s.fees && typeof s.fees === 'object' && s.fees !== null ? (s.fees as Record<string, unknown>) : {}
  const fees: SiteFees = {
    laborPerDay: feeN(o.laborPerDay, d0.laborPerDay),
    totalStationPerDay: feeN(o.totalStationPerDay, d0.totalStationPerDay),
    rotatingLaserPerDay: feeN(o.rotatingLaserPerDay, d0.rotatingLaserPerDay),
    lineLaserPerDay: feeN(o.lineLaserPerDay, d0.lineLaserPerDay),
    drawingPerPing: feeN(o.drawingPerPing, d0.drawingPerPing),
  }
  const layout = 'layout' in s ? normalizeQuoteLayout(s.layout) : init.layout
  const floorsParsed: FloorArea[] = Array.isArray(s.floors)
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
  const floors = syncFloorsWithLayout(floorsParsed, layout)
  const ownerClient =
    'ownerClient' in s ? migrateQuoteOwnerClient(s.ownerClient) : init.ownerClient
  return {
    name,
    floors,
    fees,
    layout,
    ownerClient,
  }
}

/** 與月表「全書案場更名」同步：估價案名與 `oldExact` 完全相等或 trim 後相同時改為 `newNameTrimmed`（trim 後）。 */
export function renameQuoteSiteIfProjectNameMatches(
  site: QuoteSite,
  oldExact: string,
  newNameTrimmed: string,
): QuoteSite {
  const newT = newNameTrimmed.trim()
  const oldTrim = oldExact.trim()
  const n = site.name
  const match = n === oldExact || (oldTrim !== '' && n.trim() === oldTrim)
  return match ? { ...site, name: newT } : site
}

/**
 * 總坪數（用於作圖總額、每坪成本）：樓層㎡換算後加總，**不含**名稱為「基礎工程」之列（該列不計入坪數）。
 */
export function sumPing(site: QuoteSite): number {
  return site.floors.reduce((s, f) => {
    if (f.name.trim() === EXCEL_STAGE.foundation) return s
    return s + m2ToPing(f.m2)
  }, 0)
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

/**
 * 樓層面積表一列對應成本估算之「套用模組」（與 {@link EXCEL_STAGE} 區名一致時才可加總攤提）。
 * 同一模組多列樓層（如多層正常樓、多個 RF）時，該模組之工數／儀器／雜項／區域成本採**平均攤**至各列。
 */
/** 每層計價列之攤提脈絡（供 hover 明細） */
export type FloorPricingShareMeta = {
  /** 對應試算表階段／模組名；無法對應時為 null */
  zone: string | null
  /** 樓層面積表中同階段之列數（平均攤分母） */
  moduleFloorRowCount: number
  /** 成本估算同階段合計（攤前提）；該階段無資料時為 null */
  agg: {
    base: number
    pricing: number
    instr: number
    misc: number
    region: number
  } | null
}

export type FloorPricingRow = {
  floorLabel: string
  moduleLabel: string
  baseTotal: number
  pricingTotal: number
  ping: number
  instrumentCost: number
  miscCost: number
  drawingCost: number
  costExDrawing: number
  costTotal: number
  costPerPing: number
  shareMeta: FloorPricingShareMeta
}

/** 由樓層名稱與 layout 推得成本估算列所用之區名（與 {@link EXCEL_STAGE} 一致） */
export function floorNameToQuoteZone(floorName: string, layout: QuoteLayout): string | null {
  if (floorName === EXCEL_STAGE.foundation) return EXCEL_STAGE.foundation
  const b = floorName.match(/^B(\d+)$/)
  if (b) {
    const k = parseInt(b[1]!, 10)
    if (k === 1 && layout.basementFloors >= 1) return EXCEL_STAGE.b1f
    if (k >= 2 && k <= layout.basementFloors) return EXCEL_STAGE.basementExceptB1F
  }
  if (floorName === '1F') return EXCEL_STAGE.f1
  if (floorName === EXCEL_STAGE.mezzanine && layout.hasMezzanine) return EXCEL_STAGE.mezzanine
  const mf = floorName.match(/^(\d+)F$/)
  if (mf) {
    const n = parseInt(mf[1]!, 10)
    if (
      n >= layout.typicalStartFloor &&
      n < layout.typicalStartFloor + layout.typicalFloors
    ) {
      return EXCEL_STAGE.typical
    }
  }
  const rf = floorName.match(/^R(\d+)$/)
  if (rf) {
    const r = parseInt(rf[1]!, 10)
    if (r >= 1 && r <= layout.rfCount) return EXCEL_STAGE.rf
  }
  return null
}

/** 每層計價工數表：依樓層面積列順序，對應模組並攤提成本估算列之合計 */
export function computeFloorPricingTable(site: QuoteSite, rows: QuoteRow[]): FloorPricingRow[] {
  const computed = rows.map((r) => computeRow(r, site.fees))
  const byZone = new Map<
    string,
    { base: number; pricing: number; instr: number; misc: number; region: number }
  >()
  for (const r of computed) {
    const cur = byZone.get(r.zone) ?? { base: 0, pricing: 0, instr: 0, misc: 0, region: 0 }
    cur.base += r.baseTotal
    cur.pricing += r.pricingTotal
    cur.instr += r.instrumentModule
    cur.misc += r.miscModule
    cur.region += r.regionCost
    byZone.set(r.zone, cur)
  }

  const counts = new Map<string, number>()
  for (const f of site.floors) {
    const z = floorNameToQuoteZone(f.name, site.layout)
    if (z) counts.set(z, (counts.get(z) ?? 0) + 1)
  }

  return site.floors.map((floor) => {
    const zone = floorNameToQuoteZone(floor.name, site.layout)
    const ping = m2ToPing(floor.m2)
    const drawing = ping * site.fees.drawingPerPing
    if (!zone) {
      return {
        floorLabel: floor.name,
        moduleLabel: '—',
        baseTotal: 0,
        pricingTotal: 0,
        ping,
        instrumentCost: 0,
        miscCost: 0,
        drawingCost: drawing,
        costExDrawing: 0,
        costTotal: drawing,
        costPerPing: ping > 0 ? drawing / ping : 0,
        shareMeta: {
          zone: null,
          moduleFloorRowCount: 1,
          agg: null,
        },
      }
    }
    const agg = byZone.get(zone)
    const n = Math.max(1, counts.get(zone) ?? 1)
    if (!agg) {
      return {
        floorLabel: floor.name,
        moduleLabel: zone,
        baseTotal: 0,
        pricingTotal: 0,
        ping,
        instrumentCost: 0,
        miscCost: 0,
        drawingCost: drawing,
        costExDrawing: 0,
        costTotal: drawing,
        costPerPing: ping > 0 ? drawing / ping : 0,
        shareMeta: {
          zone,
          moduleFloorRowCount: n,
          agg: null,
        },
      }
    }
    const base = agg.base / n
    const pricing = agg.pricing / n
    const instr = agg.instr / n
    const misc = agg.misc / n
    const costExDrawing = agg.region / n
    const costTotal = costExDrawing + drawing
    return {
      floorLabel: floor.name,
      moduleLabel: zone,
      baseTotal: base,
      pricingTotal: pricing,
      ping,
      instrumentCost: instr,
      miscCost: misc,
      drawingCost: drawing,
      costExDrawing,
      costTotal,
      costPerPing: ping > 0 ? costTotal / ping : 0,
      shareMeta: {
        zone,
        moduleFloorRowCount: n,
        agg: {
          base: agg.base,
          pricing: agg.pricing,
          instr: agg.instr,
          misc: agg.misc,
          region: agg.region,
        },
      },
    }
  })
}

/** 每項工程細項計價：依細項名稱加總各列區域合計（元）、基礎總工數；占總為該細項占「細項計價總額」之百分比（表內合計 100%） */
export type ItemPricingRow = {
  item: string
  /** 加總各列 E 欄「基礎總工數」 */
  totalBaseLabor: number
  cost: number
  /** 占細項計價總額（全表區域合計加總），單位為百分比 */
  pctOfTotal: number
}

export function computeItemPricingTable(site: QuoteSite, rows: QuoteRow[]): ItemPricingRow[] {
  const { computed, totalRegion } = computeQuote(site, rows)
  const byItem = new Map<string, number>()
  const byItemBase = new Map<string, number>()
  for (const r of computed) {
    byItem.set(r.item, (byItem.get(r.item) ?? 0) + r.regionCost)
    byItemBase.set(r.item, (byItemBase.get(r.item) ?? 0) + r.baseTotal)
  }
  const order = canonicalQuoteItemOrder()
  const used = new Set<string>()
  const out: ItemPricingRow[] = []
  const pushRow = (item: string) => {
    used.add(item)
    const cost = byItem.get(item) ?? 0
    const totalBaseLabor = byItemBase.get(item) ?? 0
    out.push({
      item,
      totalBaseLabor,
      cost,
      pctOfTotal: totalRegion > 0 ? (cost / totalRegion) * 100 : 0,
    })
  }
  for (const item of order) {
    pushRow(item)
  }
  const extras = [...byItem.keys()]
    .filter((k) => !used.has(k))
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  for (const item of extras) {
    pushRow(item)
  }
  return out
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
    layout: exampleQuoteLayout(),
    ownerClient: defaultQuoteOwnerClient(),
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
  mergeQuoteRowsPreservingValues,
  TEMPLATE,
  ZONES,
  defaultQuoteRows,
} from './quoteLayoutBuild'
