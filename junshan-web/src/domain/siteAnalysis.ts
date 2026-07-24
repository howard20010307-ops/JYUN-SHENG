import type { ReceivablesState } from './receivablesModel'
import type { SalaryBook } from './salaryExcelModel'
import { staffRateOnDate } from './salaryExcelModel'
import type { WorkLogSiteBlock, WorkLogState } from './workLogModel'
import { contractAmountOf, type ContractContentState } from './contractContentModel'
import {
  effectiveEntriesForCalendar,
  emptyInstrumentQty,
  instrumentExpenseFromQty,
  instrumentQtyAnyPositive,
} from './workLogModel'
import { QUICK_SITE_JUN_ADJUST, QUICK_SITE_TSAI_ADJUST } from './fieldworkQuickApply'
import {
  normalizePhasePeriodLabel,
  parsePhaseDateFragmentToIso,
  parsePhasePeriodRangeStrict,
  parseReceivablePhasePeriodRange,
} from './receivablePhaseRange'
import { normalizeSiteDimensionLabel } from './siteDimensionLabels'

export type SiteAnalysisGroup = {
  siteName: string
  dong: string
  floorLevel: string
  workPhase: string
  revenueNet: number
  salaryCost: number
  mealCost: number
  instrumentCost: number
  directCost: number
  grossProfit: number
  grossMargin: number
  operatingExpenseAllocated: number
  netProfit: number
  netMargin: number
  workDays: number
  grossPerWorkDay: number
}

export type SiteAnalysisDetail = {
  date: string
  siteName: string
  dong: string
  floorLevel: string
  workPhase: string
  workItems: string
  staffCount: number
  staffNames: string
  workDays: number
  salaryCost: number
  mealCost: number
  instrumentCost: number
  note: string
}

export type SiteAnalysisContractRow = {
  contractLineId: string
  siteName: string
  dong: string
  floorLevel: string
  workPhase: string
  unit: string
  contractUnitPrice: number
  contractQuantity: number
  contractAmount: number
  receivableNetLinked: number
  receivableProgress: number
  receivableRemaining: number
  note: string
}

/** 「每階段分析」一列：營收與請款區間皆來自收帳階段；成本為出工日落在該區間之出工紀錄加總。 */
export type SitePhaseAnalysisRow = {
  workPhase: string
  revenueNet: number
  salaryCost: number
  mealCost: number
  instrumentCost: number
  operatingExpenseAllocated: number
  directCost: number
  grossProfit: number
  grossMargin: number
  netProfit: number
  netMargin: number
  workDays: number
  grossPerWorkDay: number
}

type PhaseCostBucket = {
  salaryCost: number
  mealCost: number
  instrumentCost: number
  workDays: number
}

function phaseKeyFromReceivablePhaseLabel(phaseLabel: string): string {
  const t = normalizePhasePeriodLabel(phaseLabel)
  return t === '' ? '未填' : normalizeSiteDimensionLabel(t)
}

/** 收帳列上可解析之階段（期間）；空白時用合約連結列之階段。 */
export function effectiveReceivablePhaseLabel(r: PhaseAnalysisReceivableInput): string {
  for (const candidate of [r.phaseLabel, r.contractPhaseLabel ?? '']) {
    const t = (candidate ?? '').trim()
    if (!t || t === '未填') continue
    if (parseReceivablePhasePeriodRange(t, r.bookedDate)) return t
  }
  return (r.phaseLabel ?? '').trim()
}

function registerReceivablePhaseRange(
  phaseLabel: string,
  bookedDate: string | undefined,
  phaseRanges: { phaseKey: string; range: { start: string; end: string } }[],
  rangePhaseSeen: Set<string>,
): void {
  const pk = phaseKeyFromReceivablePhaseLabel(phaseLabel)
  const range = parseReceivablePhasePeriodRange(phaseLabel, bookedDate)
  if (!range || rangePhaseSeen.has(pk)) return
  rangePhaseSeen.add(pk)
  phaseRanges.push({ phaseKey: pk, range })
}

/**
 * 依請款區間將出工明細成本歸期（與 {@link reallocateUnfilledDetailCostsToUnmatchedReceivablePhases} 同日邏輯）：
 * 薪資／餐費／工天按日出工加總；儀器以該日出工明細儀器合計併入（同日僅計入一期）。
 */
function allocateWorkLogCostsByPhaseRanges(
  details: readonly SiteAnalysisDetail[],
  phaseRanges: readonly { phaseKey: string; range: { start: string; end: string } }[],
): Map<string, PhaseCostBucket> {
  const costsByPhase = new Map<string, PhaseCostBucket>()
  const addCost = (phase: string, partial: PhaseCostBucket): void => {
    const got = costsByPhase.get(phase) ?? {
      salaryCost: 0,
      mealCost: 0,
      instrumentCost: 0,
      workDays: 0,
    }
    got.salaryCost += partial.salaryCost
    got.mealCost += partial.mealCost
    got.instrumentCost += partial.instrumentCost
    got.workDays += partial.workDays
    costsByPhase.set(phase, got)
  }

  const instrumentTotalByDate = new Map<string, number>()
  const byDate = new Map<string, CostBucket>()
  for (const d of details) {
    const dk = normalizeDetailDateKey(d.date)
    if (!dk) continue
    instrumentTotalByDate.set(dk, (instrumentTotalByDate.get(dk) ?? 0) + nz(d.instrumentCost))
    addToBucket(byDate, dk, {
      salaryCost: nz(d.salaryCost),
      mealCost: nz(d.mealCost),
      workDays: nz(d.workDays),
      instrumentCost: nz(d.instrumentCost),
    })
  }

  const sortedRanges = [...phaseRanges].sort((a, b) => {
    const c = a.range.start.localeCompare(b.range.start)
    return c !== 0 ? c : a.range.end.localeCompare(b.range.end)
  })
  const claimed = new Set<string>()

  for (const { phaseKey, range } of sortedRanges) {
    for (const dateKey of eachDateKeyInclusive(range.start, range.end)) {
      const b = byDate.get(dateKey)
      const instAll = nz(instrumentTotalByDate.get(dateKey) ?? 0)
      if (!b && instAll === 0) continue
      if (claimed.has(dateKey)) continue
      claimed.add(dateKey)
      addCost(phaseKey, {
        salaryCost: b?.salaryCost ?? 0,
        mealCost: b?.mealCost ?? 0,
        workDays: b?.workDays ?? 0,
        instrumentCost: instAll,
      })
    }
  }

  for (const [dateKey, b] of byDate) {
    if (claimed.has(dateKey)) continue
    const instAll = nz(instrumentTotalByDate.get(dateKey) ?? 0)
    if (b.salaryCost === 0 && b.mealCost === 0 && b.workDays === 0 && instAll === 0) continue
    addCost('未填', {
      salaryCost: b.salaryCost,
      mealCost: b.mealCost,
      workDays: b.workDays,
      instrumentCost: instAll,
    })
  }
  for (const [dateKey, instAll] of instrumentTotalByDate) {
    if (claimed.has(dateKey) || byDate.has(dateKey)) continue
    if (instAll > 0) {
      addCost('未填', { salaryCost: 0, mealCost: 0, workDays: 0, instrumentCost: instAll })
    }
  }

  return costsByPhase
}

export type PhaseAnalysisReceivableInput = {
  phaseLabel: string
  /** 收帳未填階段時，由合約連結列帶入之階段（期間） */
  contractPhaseLabel?: string
  net: number
  bookedDate?: string
}

/** 收帳未填階段、未綁合約時，以未稅金額唯一對上合約列之請款區間。 */
export function matchContractPhaseLabelByReceivableNet(
  net: number,
  contractRows: readonly { contractAmount: number; phaseLabel: string }[],
): string {
  const amount = nz(net)
  if (amount <= 0) return ''
  const hits = contractRows.filter((row) => Math.abs(nz(row.contractAmount) - amount) < 1)
  return hits.length === 1 ? (hits[0]!.phaseLabel ?? '').trim() : ''
}

/**
 * 每階段分析：
 * 1. 先讀收帳「階段（期間）」定請款起迄日，加總該期營收（未稅）。
 * 2. 再從出工紀錄找出出工日落在該區間之明細，加總薪資／餐費／儀器／工天（不看日誌區塊階段欄）。
 *
 * `supplementalPhaseLabels`：收帳未寫階段但合約對帳已有請款區間時，仍用該區間切分出工成本。
 */
export function buildSitePhaseAnalysisRows(
  details: readonly SiteAnalysisDetail[],
  receivableEntries: readonly PhaseAnalysisReceivableInput[],
  supplementalPhaseLabels: readonly string[] = [],
): SitePhaseAnalysisRow[] {
  const phaseRanges: { phaseKey: string; range: { start: string; end: string } }[] = []
  const rangePhaseSeen = new Set<string>()

  for (const r of receivableEntries) {
    const phaseText = effectiveReceivablePhaseLabel(r)
    registerReceivablePhaseRange(phaseText, r.bookedDate, phaseRanges, rangePhaseSeen)
  }
  for (const label of supplementalPhaseLabels) {
    registerReceivablePhaseRange(label, undefined, phaseRanges, rangePhaseSeen)
  }

  phaseRanges.sort((a, b) => {
    const c = a.range.start.localeCompare(b.range.start)
    return c !== 0 ? c : a.range.end.localeCompare(b.range.end)
  })

  const revenueByPhase = new Map<string, number>()
  for (const r of receivableEntries) {
    const phaseText = effectiveReceivablePhaseLabel(r)
    const pk = phaseKeyFromReceivablePhaseLabel(phaseText)
    revenueByPhase.set(pk, (revenueByPhase.get(pk) ?? 0) + nz(r.net))
  }

  const costsByPhase = allocateWorkLogCostsByPhaseRanges(details, phaseRanges)

  const phaseKeys = new Set<string>([
    ...phaseRanges.map((p) => p.phaseKey),
    ...revenueByPhase.keys(),
    ...costsByPhase.keys(),
  ])
  const rows: SitePhaseAnalysisRow[] = []
  for (const workPhase of phaseKeys) {
    const c = costsByPhase.get(workPhase) ?? {
      salaryCost: 0,
      mealCost: 0,
      instrumentCost: 0,
      workDays: 0,
    }
    const revenueNet = revenueByPhase.get(workPhase) ?? 0
    const instrumentCost = c.instrumentCost
    const directCost = c.salaryCost + c.mealCost
    const grossProfit = revenueNet - directCost
    const grossMargin = revenueNet !== 0 ? grossProfit / revenueNet : 0
    const netProfit = grossProfit - instrumentCost
    const netMargin = revenueNet !== 0 ? netProfit / revenueNet : 0
    const grossPerWorkDay = c.workDays !== 0 ? grossProfit / c.workDays : 0
    rows.push({
      workPhase,
      revenueNet,
      salaryCost: c.salaryCost,
      mealCost: c.mealCost,
      instrumentCost,
      operatingExpenseAllocated: instrumentCost,
      directCost,
      grossProfit,
      grossMargin,
      netProfit,
      netMargin,
      workDays: c.workDays,
      grossPerWorkDay,
    })
  }
  const phaseStartOrder = new Map(
    phaseRanges.map((p, i) => [p.phaseKey, p.range.start || String(i).padStart(8, '0')] as const),
  )
  return rows.sort((a, b) => {
    const oa = phaseStartOrder.get(a.workPhase)
    const ob = phaseStartOrder.get(b.workPhase)
    if (oa && ob) return oa.localeCompare(ob)
    if (oa) return -1
    if (ob) return 1
    return a.workPhase.localeCompare(b.workPhase, 'zh-Hant')
  })
}

export type SiteAnalysisSnapshot = {
  siteNames: string[]
  bySite: Record<
    string,
    {
      groups: SiteAnalysisGroup[]
      details: SiteAnalysisDetail[]
      totals: SiteAnalysisGroup
      contractRows: SiteAnalysisContractRow[]
      contractTotals: {
        contractAmount: number
        receivableNetLinked: number
        receivableRemaining: number
        receivableProgress: number
      }
    }
  >
}

const UNMATCHED_SITE = '（未對應案場）'
const UNMATCHED_RECEIVABLE_DONG = '未對應收帳'

function nz(n: number): number {
  return Number.isFinite(n) ? n : 0
}

function normalizeSiteNameKey(raw: string): string {
  return (raw ?? '')
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function resolveSite(raw: string, fallback = UNMATCHED_SITE): { key: string; display: string } {
  const display = (raw ?? '').replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim() || fallback
  const key = normalizeSiteNameKey(display)
  return { key, display }
}

function isMissingLabel(raw: string): boolean {
  const t = (raw ?? '').trim()
  return t === '' || t === '未填'
}

function toGroupKey(siteKey: string, dong: string, floor: string, phase: string): string {
  return [siteKey, normalizeSiteDimensionLabel(dong), normalizeSiteDimensionLabel(floor), normalizeSiteDimensionLabel(phase)].join('\u0001')
}

function toContractMatchKey(siteKey: string, dong: string, floor: string, phase: string): string {
  return [siteKey, normalizeSiteDimensionLabel(dong), normalizeSiteDimensionLabel(floor), normalizeSiteDimensionLabel(phase)].join('\u0001')
}

function splitGroupKey(k: string): {
  siteKey: string
  dong: string
  floorLevel: string
  workPhase: string
} {
  const [siteKey = '', dong = '未填', floorLevel = '未填', workPhase = '未填'] = k.split('\u0001')
  return { siteKey, dong, floorLevel, workPhase }
}

type MutableGroup = Omit<
  SiteAnalysisGroup,
  'directCost' | 'grossProfit' | 'grossMargin' | 'netProfit' | 'netMargin' | 'grossPerWorkDay'
>

function ensureGroup(
  map: Map<string, MutableGroup>,
  key: string,
  siteDisplay: string,
): MutableGroup {
  const got = map.get(key)
  if (got) {
    if (got.siteName === UNMATCHED_SITE && siteDisplay !== UNMATCHED_SITE) got.siteName = siteDisplay
    return got
  }
  const { dong, floorLevel, workPhase } = splitGroupKey(key)
  const created: MutableGroup = {
    siteName: siteDisplay,
    dong,
    floorLevel,
    workPhase,
    revenueNet: 0,
    salaryCost: 0,
    mealCost: 0,
    instrumentCost: 0,
    operatingExpenseAllocated: 0,
    workDays: 0,
  }
  map.set(key, created)
  return created
}

function finalizeGroup(g: MutableGroup): SiteAnalysisGroup {
  const directCost = g.salaryCost + g.mealCost
  const grossProfit = g.revenueNet - directCost
  const grossMargin = g.revenueNet !== 0 ? grossProfit / g.revenueNet : 0
  const netProfit = grossProfit - g.operatingExpenseAllocated
  const netMargin = g.revenueNet !== 0 ? netProfit / g.revenueNet : 0
  const grossPerWorkDay = g.workDays !== 0 ? grossProfit / g.workDays : 0
  return {
    ...g,
    directCost,
    grossProfit,
    grossMargin,
    netProfit,
    netMargin,
    grossPerWorkDay,
  }
}

function detailSortAsc(a: SiteAnalysisDetail, b: SiteAnalysisDetail): number {
  const d = normalizeDateKey(a.date).localeCompare(normalizeDateKey(b.date))
  if (d !== 0) return d
  const s = a.siteName.localeCompare(b.siteName, 'zh-Hant')
  if (s !== 0) return s
  const f = a.floorLevel.localeCompare(b.floorLevel, 'zh-Hant')
  if (f !== 0) return f
  return a.workPhase.localeCompare(b.workPhase, 'zh-Hant')
}

function hasMeaningfulDetail(d: SiteAnalysisDetail): boolean {
  if (d.staffCount > 0) return true
  if (d.workDays > 0) return true
  if (d.salaryCost !== 0) return true
  if (d.mealCost !== 0 || d.instrumentCost !== 0) return true
  if ((d.workItems ?? '').trim() !== '' && d.workItems !== '—') return true
  if ((d.note ?? '').trim() !== '') return true
  return false
}

function normalizeDateKey(raw: string): string {
  const t = (raw ?? '').trim()
  if (t === '') return ''
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(t)
  if (!m) return t.replace(/\//g, '-')
  const y = m[1]
  const mo = m[2]!.padStart(2, '0')
  const d = m[3]!.padStart(2, '0')
  return `${y}-${mo}-${d}`
}

/** 與 {@link normalizeDateKey} 相同，另支援單日之民國年寫法（與收帳階段一致），供出工明細與請款區間對齊。 */
function normalizeDetailDateKey(raw: string): string {
  const t = (raw ?? '').trim()
  if (!t) return ''
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(t)
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`
  const roc = parsePhaseDateFragmentToIso(t)
  if (roc) return roc
  return normalizeDateKey(raw)
}

function eachDateKeyInclusive(startIso: string, endIso: string): string[] {
  const out: string[] = []
  const [ys, ms, ds] = startIso.split('-').map((x) => parseInt(x, 10))
  const [ye, me, de] = endIso.split('-').map((x) => parseInt(x, 10))
  let t = Date.UTC(ys!, ms! - 1, ds!, 12, 0, 0)
  const endT = Date.UTC(ye!, me! - 1, de!, 12, 0, 0)
  while (t <= endT) {
    const dt = new Date(t)
    const y = dt.getUTCFullYear()
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
    const d = String(dt.getUTCDate()).padStart(2, '0')
    out.push(`${y}-${m}-${d}`)
    t += 86_400_000
  }
  return out
}

function isUnstructuredSiteDetail(d: SiteAnalysisDetail): boolean {
  return d.dong === '未填' && d.floorLevel === '未填' && d.workPhase === '未填'
}

/**
 * 與工作日誌儲存邏輯一致：有結構化台數則依區塊台數×單價；否則依當日工天分攤整日 `instrumentCost`。
 */
function instrumentCostForDayBlock(
  block: WorkLogSiteBlock,
  blocks: readonly WorkLogSiteBlock[],
  blockDays: number,
  totalDays: number,
  docInstrumentCost: number,
): number {
  const hasStructured = blocks.some((b) =>
    instrumentQtyAnyPositive(b.instrumentQty ?? emptyInstrumentQty()),
  )
  if (hasStructured) {
    return instrumentExpenseFromQty(block.instrumentQty ?? emptyInstrumentQty())
  }
  const total = nz(docInstrumentCost)
  if (total <= 0) return 0
  if (totalDays > 0) return Math.round(total * (blockDays / totalDays))
  return Math.round(total / Math.max(1, blocks.length))
}

/** 從出工明細可溯同日、同案場掛在「有填棟樓階段」列上之儀器（與日誌區塊台數對齊）。 */
function subtractInstrumentFromStructuredSiteDetailsForDay(
  groupMap: Map<string, MutableGroup>,
  siteKey: string,
  dateKey: string,
  amount: number,
  siteRows: SiteAnalysisDetail[],
): void {
  let remaining = nz(amount)
  if (remaining <= 0) return
  for (const d of siteRows) {
    if (normalizeDetailDateKey(d.date) !== dateKey) continue
    if (isUnstructuredSiteDetail(d)) continue
    const inst = nz(d.instrumentCost)
    if (inst <= 0) continue
    const gk = toGroupKey(siteKey, d.dong, d.floorLevel, d.workPhase)
    const g = groupMap.get(gk)
    if (!g) continue
    const take = Math.min(inst, remaining)
    g.instrumentCost = Math.max(0, nz(g.instrumentCost) - take)
    g.operatingExpenseAllocated = Math.max(0, nz(g.operatingExpenseAllocated) - take)
    remaining -= take
    if (remaining <= 0) return
  }
}

type CostBucket = {
  salaryCost: number
  mealCost: number
  workDays: number
  instrumentCost: number
}

function addToBucket(m: Map<string, CostBucket>, bucketKey: string, partial: CostBucket): void {
  const got = m.get(bucketKey) ?? {
    salaryCost: 0,
    mealCost: 0,
    workDays: 0,
    instrumentCost: 0,
  }
  got.salaryCost += partial.salaryCost
  got.mealCost += partial.mealCost
  got.workDays += partial.workDays
  got.instrumentCost += partial.instrumentCost
  m.set(bucketKey, got)
}

/**
 * 收帳落在「未對應收帳」且階段可解讀為日期區間時：依案場分析「出工明細」對齊成本。
 * - 薪資／餐費／工數：僅合併棟／樓／階段皆未填之明細，並自「未填」合計列扣回。
 * - 儀器：該日該案場出工明細「儀器」加總（與工作日誌區塊台數一致），併入請款列；超出未填列所承擔之部分自對應結構列扣回。
 */
function reallocateUnfilledDetailCostsToUnmatchedReceivablePhases(
  groupMap: Map<string, MutableGroup>,
  detailsBySite: Map<string, SiteAnalysisDetail[]>,
): void {
  const instrumentTotalBySiteDate = new Map<string, number>()
  for (const [siteKey, rows] of detailsBySite) {
    for (const d of rows) {
      const dk = normalizeDetailDateKey(d.date)
      if (!dk) continue
      const k = `${siteKey}\u0001${dk}`
      instrumentTotalBySiteDate.set(k, (instrumentTotalBySiteDate.get(k) ?? 0) + nz(d.instrumentCost))
    }
  }

  const bySiteDate = new Map<string, CostBucket>()
  for (const [siteKey, rows] of detailsBySite) {
    for (const d of rows) {
      if (!isUnstructuredSiteDetail(d)) continue
      const dk = normalizeDetailDateKey(d.date)
      if (!dk) continue
      addToBucket(bySiteDate, `${siteKey}\u0001${dk}`, {
        salaryCost: nz(d.salaryCost),
        mealCost: nz(d.mealCost),
        workDays: nz(d.workDays),
        instrumentCost: nz(d.instrumentCost),
      })
    }
  }

  const targets: { key: string; siteKey: string; range: { start: string; end: string } }[] = []
  for (const [key] of groupMap) {
    const p = splitGroupKey(key)
    const isPhaseCostTarget =
      p.dong === UNMATCHED_RECEIVABLE_DONG || (p.dong === '未填' && p.floorLevel === '未填')
    if (!isPhaseCostTarget) continue
    const range = parsePhasePeriodRangeStrict(p.workPhase)
    if (!range) continue
    targets.push({ key, siteKey: p.siteKey, range })
  }
  targets.sort((a, b) => {
    const c = a.range.start.localeCompare(b.range.start)
    if (c !== 0) return c
    return a.range.end.localeCompare(b.range.end)
  })

  const claimedDayBySite = new Map<string, Set<string>>()
  const claim = (siteKey: string, dateKey: string): boolean => {
    let set = claimedDayBySite.get(siteKey)
    if (!set) {
      set = new Set<string>()
      claimedDayBySite.set(siteKey, set)
    }
    if (set.has(dateKey)) return false
    set.add(dateKey)
    return true
  }

  for (const { key, siteKey, range } of targets) {
    const recv = groupMap.get(key)
    if (!recv) continue
    const transfer: CostBucket = {
      salaryCost: 0,
      mealCost: 0,
      workDays: 0,
      instrumentCost: 0,
    }
    let transferInstrumentFromUnfilled = 0
    const siteRows = detailsBySite.get(siteKey) ?? []
    for (const dateKey of eachDateKeyInclusive(range.start, range.end)) {
      const dsK = `${siteKey}\u0001${dateKey}`
      const b = bySiteDate.get(dsK)
      const instAll = nz(instrumentTotalBySiteDate.get(dsK) ?? 0)
      if (!b && instAll === 0) continue
      if (!claim(siteKey, dateKey)) continue
      if (b) {
        transfer.salaryCost += b.salaryCost
        transfer.mealCost += b.mealCost
        transfer.workDays += b.workDays
        transferInstrumentFromUnfilled += nz(b.instrumentCost)
      }
      transfer.instrumentCost += instAll
      const instUnstr = b ? nz(b.instrumentCost) : 0
      const instExtra = Math.max(0, instAll - instUnstr)
      if (instExtra > 0) {
        subtractInstrumentFromStructuredSiteDetailsForDay(groupMap, siteKey, dateKey, instExtra, siteRows)
      }
    }
    if (
      transfer.salaryCost === 0 &&
      transfer.mealCost === 0 &&
      transfer.workDays === 0 &&
      transfer.instrumentCost === 0
    ) {
      continue
    }
    const unfilledKey = toGroupKey(siteKey, '', '', '')
    const unfilled = groupMap.get(unfilledKey)
    recv.salaryCost += transfer.salaryCost
    recv.mealCost += transfer.mealCost
    recv.workDays += transfer.workDays
    recv.instrumentCost += transfer.instrumentCost
    recv.operatingExpenseAllocated += transfer.instrumentCost
    if (unfilled) {
      unfilled.salaryCost = Math.max(0, nz(unfilled.salaryCost) - transfer.salaryCost)
      unfilled.mealCost = Math.max(0, nz(unfilled.mealCost) - transfer.mealCost)
      unfilled.workDays = Math.max(0, nz(unfilled.workDays) - transfer.workDays)
      unfilled.instrumentCost = Math.max(0, nz(unfilled.instrumentCost) - transferInstrumentFromUnfilled)
      unfilled.operatingExpenseAllocated = Math.max(
        0,
        nz(unfilled.operatingExpenseAllocated) - transferInstrumentFromUnfilled,
      )
    }
  }
}

type FloorSortToken = {
  rank: number
  value: number
  text: string
}

function parseFloorSortToken(raw: string): FloorSortToken {
  const text = normalizeSiteDimensionLabel(raw)
  const compact = text.replace(/\s+/g, '').toUpperCase()

  const b = /^B(\d+)(?:F|樓)?$/.exec(compact)
  if (b) return { rank: 0, value: -Number(b[1]), text } // B數字越大越上面（B3 在 B2 前）

  if (compact.includes('夾層')) return { rank: 2, value: 0, text } // 固定放在 1F 後

  const rf = /^(?:R(\d+)F?|RF(\d+))$/.exec(compact)
  if (rf) {
    const n = Number(rf[1] ?? rf[2] ?? '1')
    return { rank: 3, value: Number.isFinite(n) ? n : 1, text } // RF 最後，數字小在前
  }

  const f = /^(-?\d+(?:\.\d+)?)(?:F|樓)?$/.exec(compact) ?? /(-?\d+(?:\.\d+)?)/.exec(compact)
  if (f) {
    const n = Number(f[1])
    return { rank: 1, value: Number.isFinite(n) ? n : 0, text } // 一般樓層數字小在前
  }

  return { rank: 4, value: 0, text }
}

export function compareFloorLevelAsc(a: string, b: string): number {
  const aa = parseFloorSortToken(a)
  const bb = parseFloorSortToken(b)
  if (aa.rank !== bb.rank) return aa.rank - bb.rank
  if (aa.value !== bb.value) return aa.value - bb.value
  return aa.text.localeCompare(bb.text, 'zh-Hant')
}

function payrollWorkerKey(dateKey: string, siteKey: string, staffName: string): string {
  return `${dateKey}\u0001${siteKey}\u0001${staffName.trim()}`
}

function dateSiteKey(dateKey: string, siteKey: string): string {
  return `${dateKey}\u0001${siteKey}`
}

function buildPayrollMaps(salaryBook: SalaryBook): {
  daysByWorker: Map<string, number>
  rateByWorker: Map<string, number>
  daysByDateSite: Map<string, number>
  mealByDateSite: Map<string, number>
  workerCountByDateSite: Map<string, number>
} {
  const daysByWorker = new Map<string, number>()
  const rateByWorker = new Map<string, number>()
  const daysByDateSite = new Map<string, number>()
  const mealByDateSite = new Map<string, number>()
  const workerNamesByDateSite = new Map<string, Set<string>>()
  const add = (dateKey: string, siteKey: string, staffName: string, days: number, rate: number) => {
    const name = staffName.trim()
    if (!name || days === 0) return
    const k = payrollWorkerKey(dateKey, siteKey, name)
    const dsKey = dateSiteKey(dateKey, siteKey)
    daysByWorker.set(k, (daysByWorker.get(k) ?? 0) + days)
    daysByDateSite.set(dsKey, (daysByDateSite.get(dsKey) ?? 0) + days)
    const names = workerNamesByDateSite.get(dsKey) ?? new Set<string>()
    names.add(name)
    workerNamesByDateSite.set(dsKey, names)
    if (!rateByWorker.has(k) && rate > 0) rateByWorker.set(k, rate)
  }

  for (const m of salaryBook.months) {
    for (let j = 0; j < m.dates.length; j++) {
      const dateKey = normalizeDateKey(m.dates[j] ?? '')
      if (!dateKey) continue
      for (const b of m.blocks) {
        const site = resolveSite(b.siteName)
        const dsKey = dateSiteKey(dateKey, site.key)
        const meal = nz((b.meal ?? [])[j] ?? 0)
        if (meal !== 0) mealByDateSite.set(dsKey, (mealByDateSite.get(dsKey) ?? 0) + meal)
        for (const [staffName, row] of Object.entries(b.grid)) {
          const days = nz((row ?? [])[j] ?? 0)
          const rate = nz(staffRateOnDate(m, staffName, 'jun', dateKey))
          add(dateKey, site.key, staffName, days, rate)
        }
      }
      for (const [staffName, row] of Object.entries(m.junAdjustDays ?? {})) {
        const days = nz((row ?? [])[j] ?? 0)
        const rate = nz(staffRateOnDate(m, staffName, 'jun', dateKey))
        add(dateKey, resolveSite(QUICK_SITE_JUN_ADJUST).key, staffName, days, rate)
      }
      for (const [staffName, row] of Object.entries(m.tsaiAdjustDays ?? {})) {
        const days = nz((row ?? [])[j] ?? 0)
        const rate = nz(staffRateOnDate(m, staffName, 'tsai', dateKey))
        add(dateKey, resolveSite(QUICK_SITE_TSAI_ADJUST).key, staffName, days, rate)
      }
    }
  }
  const workerCountByDateSite = new Map<string, number>()
  for (const [k, set] of workerNamesByDateSite) workerCountByDateSite.set(k, set.size)
  return { daysByWorker, rateByWorker, daysByDateSite, mealByDateSite, workerCountByDateSite }
}

export function buildSiteAnalysis(
  salaryBook: SalaryBook,
  workLog: WorkLogState,
  receivables: ReceivablesState,
  contractContents: ContractContentState,
): SiteAnalysisSnapshot {
  /**
   * 工作日誌優先：
   * 1) 先用工作日誌建立案場/棟/樓層/階段骨幹與明細
   * 2) 再把收帳掛載到既有分類；對不到者歸入「未對應收帳」
   * 3) 若「未對應收帳」列之階段為日期區間，則依出工明細對齊（未填者之薪資餐費工數；儀器為該日明細加總並自未填或結構列扣回）
   */
  const groupMap = new Map<string, MutableGroup>()
  const detailsBySite = new Map<string, SiteAnalysisDetail[]>()
  const siteDisplayByKey = new Map<string, string>()
  const payroll = buildPayrollMaps(salaryBook)

  const docDates = new Set((workLog.dayDocuments ?? []).map((d) => normalizeDateKey(d.logDate)))
  for (const doc of workLog.dayDocuments ?? []) {
    const blocks = doc.blocks ?? []
    if (blocks.length === 0) continue
    const dateKey = normalizeDateKey(doc.logDate)
    const staffOcc = new Map<string, number>()
    for (const b of blocks) {
      const site = resolveSite(b.siteName)
      for (const ln of b.staffLines ?? []) {
        const name = (ln.name ?? '').trim()
        if (!name) continue
        const k = `${site.key}\u0001${name}`
        staffOcc.set(k, (staffOcc.get(k) ?? 0) + 1)
      }
    }
    const perBlock = blocks.map((b) => {
      const site = resolveSite(b.siteName)
      let days = 0
      let salary = 0
      for (const ln of b.staffLines ?? []) {
        const name = (ln.name ?? '').trim()
        if (!name) continue
        const occ = staffOcc.get(`${site.key}\u0001${name}`) ?? 1
        const payKey = payrollWorkerKey(dateKey, site.key, name)
        const monthDays = payroll.daysByWorker.get(payKey)
        const usedDays = monthDays !== undefined ? monthDays / occ : 0
        const rate = payroll.rateByWorker.get(payKey) ?? 0
        days += usedDays
        salary += usedDays * rate
      }
      return { days, salary }
    })
    const perBlockDays = perBlock.map((x) => x.days)
    const totalDays = perBlockDays.reduce((sum, x) => sum + x, 0)
    const docInstrumentCost = nz(doc.instrumentCost)
    const siteDaysInDoc = new Map<string, number>()
    const siteBlockCount = new Map<string, number>()
    for (let i = 0; i < blocks.length; i++) {
      const site = resolveSite(blocks[i]!.siteName)
      siteDaysInDoc.set(site.key, (siteDaysInDoc.get(site.key) ?? 0) + nz(perBlockDays[i] ?? 0))
      siteBlockCount.set(site.key, (siteBlockCount.get(site.key) ?? 0) + 1)
    }
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]!
      const site = resolveSite(b.siteName)
      siteDisplayByKey.set(site.key, site.display)
      const blockDays = nz(perBlockDays[i] ?? 0)
      const blockSalary = nz(perBlock[i]?.salary ?? 0)
      const ratioGlobal = totalDays > 0 ? blockDays / totalDays : 1 / blocks.length
      const siteTotalDays = nz(siteDaysInDoc.get(site.key) ?? 0)
      const siteBlocks = Math.max(1, siteBlockCount.get(site.key) ?? 1)
      const ratioInSite = siteTotalDays > 0 ? blockDays / siteTotalDays : 1 / siteBlocks
      const monthMealForSite = nz(payroll.mealByDateSite.get(dateSiteKey(dateKey, site.key)) ?? 0)
      const meal = monthMealForSite * ratioInSite
      const instrument = instrumentCostForDayBlock(b, blocks, blockDays, totalDays, docInstrumentCost)
      const key = toGroupKey(site.key, b.dong, b.floorLevel, b.workPhase)
      const g = ensureGroup(groupMap, key, site.display)
      g.mealCost += meal
      g.salaryCost += blockSalary
      g.instrumentCost += instrument
      g.operatingExpenseAllocated += instrument
      g.workDays += blockDays

      const detail: SiteAnalysisDetail = {
        date: doc.logDate,
        siteName: site.display,
        dong: normalizeSiteDimensionLabel(b.dong),
        floorLevel: normalizeSiteDimensionLabel(b.floorLevel),
        workPhase: normalizeSiteDimensionLabel(b.workPhase),
        workItems:
          (b.workLines ?? [])
            .map((x) => (x.label ?? '').trim())
            .filter(Boolean)
            .join('、') || '—',
        staffCount: Math.round(
          nz(payroll.workerCountByDateSite.get(dateSiteKey(dateKey, site.key)) ?? 0) * ratioInSite,
        ),
        staffNames:
          (b.staffLines ?? [])
            .map((x) => (x.name ?? '').trim())
            .filter(Boolean)
            .filter((name, idx, arr) => arr.indexOf(name) === idx)
            .join('、') || '—',
        workDays: blockDays,
        salaryCost: blockSalary,
        mealCost: meal,
        instrumentCost: instrument,
        note: (b.remark ?? '').trim(),
      }
      if (!hasMeaningfulDetail(detail)) continue
      const arr = detailsBySite.get(site.key) ?? []
      arr.push(detail)
      detailsBySite.set(site.key, arr)
    }
  }

  for (const e of effectiveEntriesForCalendar(workLog)) {
    if (docDates.has(normalizeDateKey(e.logDate))) continue
    const site = resolveSite(e.siteName)
    siteDisplayByKey.set(site.key, site.display)
    const dateKey = normalizeDateKey(e.logDate)
    const occByName = new Map<string, number>()
    for (const n of e.staffNames ?? []) {
      const t = (n ?? '').trim()
      if (!t) continue
      occByName.set(t, (occByName.get(t) ?? 0) + 1)
    }
    let workDays = 0
    let salaryCost = 0
    for (const n of e.staffNames ?? []) {
      const name = (n ?? '').trim()
      if (!name) continue
      const occ = occByName.get(name) ?? 1
      const payKey = payrollWorkerKey(dateKey, site.key, name)
      const monthDays = payroll.daysByWorker.get(payKey)
      const usedDays = monthDays !== undefined ? monthDays / occ : 0
      const rate = payroll.rateByWorker.get(payKey) ?? 0
      workDays += usedDays
      salaryCost += usedDays * rate
    }
    const dsKey = dateSiteKey(dateKey, site.key)
    const monthWorkDays = payroll.daysByDateSite.get(dsKey)
    if (monthWorkDays !== undefined && monthWorkDays > 0) workDays = monthWorkDays
    const monthStaffCount = payroll.workerCountByDateSite.get(dsKey)
    const staffCount = monthStaffCount !== undefined && monthStaffCount > 0 ? monthStaffCount : 0
    const mealCost = nz(payroll.mealByDateSite.get(dsKey) ?? nz(e.mealCost))
    const key = toGroupKey(site.key, '', '', '')
    const g = ensureGroup(groupMap, key, site.display)
    g.mealCost += mealCost
    g.salaryCost += salaryCost
    g.instrumentCost += nz(e.instrumentCost)
    g.operatingExpenseAllocated += nz(e.instrumentCost)
    g.workDays += workDays
    const detail: SiteAnalysisDetail = {
      date: e.logDate,
      siteName: site.display,
      dong: '未填',
      floorLevel: '未填',
      workPhase: '未填',
      workItems: (e.workItem ?? '').trim() || '—',
      staffCount,
      staffNames:
        (e.staffNames ?? [])
          .map((x) => (x ?? '').trim())
          .filter(Boolean)
          .filter((name, idx, arr) => arr.indexOf(name) === idx)
          .join('、') || '—',
      workDays,
      salaryCost,
      mealCost,
      instrumentCost: nz(e.instrumentCost),
      note: (e.remark ?? '').trim(),
    }
    if (!hasMeaningfulDetail(detail)) continue
    const arr = detailsBySite.get(site.key) ?? []
    arr.push(detail)
    detailsBySite.set(site.key, arr)
  }

  // 先建立 site -> groupKeys 索引（以工作日誌骨幹為主）
  const groupKeysBySite = new Map<string, string[]>()
  for (const k of groupMap.keys()) {
    const s = splitGroupKey(k).siteKey
    const arr = groupKeysBySite.get(s) ?? []
    arr.push(k)
    groupKeysBySite.set(s, arr)
  }

  const pickReceivableTargetKey = (
    siteKey: string,
    dong: string,
    floor: string,
    phase: string,
  ): string => {
    const dn = normalizeSiteDimensionLabel(dong)
    const fn = normalizeSiteDimensionLabel(floor)
    const pn = normalizeSiteDimensionLabel(phase)
    const candidates = groupKeysBySite.get(siteKey) ?? []
    if (candidates.length === 0) {
      return toGroupKey(siteKey, UNMATCHED_RECEIVABLE_DONG, floor, phase)
    }
    const parts = candidates.map((k) => ({ key: k, p: splitGroupKey(k) }))
    const exact = parts.find((x) => x.p.dong === dn && x.p.floorLevel === fn && x.p.workPhase === pn)
    if (exact) return exact.key
    // 嚴格模式：只有在收帳欄位全空且案場只有唯一分類時，才允許單一候選自動掛載。
    if (parts.length === 1 && isMissingLabel(dong) && isMissingLabel(floor) && isMissingLabel(phase)) return parts[0]!.key
    return toGroupKey(siteKey, UNMATCHED_RECEIVABLE_DONG, floor, phase)
  }

  const contractLineById = new Map<string, (typeof contractContents.lines)[number]>()
  for (const line of contractContents.lines ?? []) {
    contractLineById.set((line.id ?? '').trim(), line)
  }

  for (const r of receivables.entries ?? []) {
    const linkedContract = contractLineById.get((r.contractLineId ?? '').trim())
    const rawSite = (linkedContract?.siteName ?? '').trim() || (r.projectName ?? '').trim() || (r.siteBlockId ?? '').trim()
    const site = resolveSite(rawSite)
    siteDisplayByKey.set(site.key, site.display)
    const key = linkedContract
      ? toGroupKey(site.key, linkedContract.buildingLabel, linkedContract.floorLabel, linkedContract.phaseLabel)
      : pickReceivableTargetKey(site.key, r.buildingLabel, r.floorLabel, r.phaseLabel)
    const g = ensureGroup(groupMap, key, site.display)
    g.revenueNet += nz(r.net)
    if (!groupKeysBySite.has(site.key)) groupKeysBySite.set(site.key, [])
    const arr = groupKeysBySite.get(site.key)!
    if (!arr.includes(key)) arr.push(key)
  }

  reallocateUnfilledDetailCostsToUnmatchedReceivablePhases(groupMap, detailsBySite)

  const siteKeys = [
    ...new Set([
      ...Array.from(groupMap.keys(), (k) => splitGroupKey(k).siteKey),
      ...detailsBySite.keys(),
    ]),
  ].filter(Boolean)
  const siteNames = siteKeys
    .map((k) => siteDisplayByKey.get(k) ?? UNMATCHED_SITE)
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'))

  const bySite: SiteAnalysisSnapshot['bySite'] = {}
  const receivableNetByContractLineId = new Map<string, number>()
  const uniqueContractLineIdByKey = new Map<string, string>()
  const duplicateContractMatchKeys = new Set<string>()
  for (const line of contractContents.lines ?? []) {
    const siteKey = normalizeSiteNameKey(line.siteName)
    if (!siteKey) continue
    const key = toContractMatchKey(siteKey, line.buildingLabel, line.floorLabel, line.phaseLabel)
    const existing = uniqueContractLineIdByKey.get(key)
    if (!existing) {
      uniqueContractLineIdByKey.set(key, line.id)
      continue
    }
    if (existing !== line.id) {
      duplicateContractMatchKeys.add(key)
      uniqueContractLineIdByKey.delete(key)
    }
  }
  for (const r of receivables.entries ?? []) {
    const boundCid = (r.contractLineId ?? '').trim()
    if (boundCid) {
      receivableNetByContractLineId.set(boundCid, (receivableNetByContractLineId.get(boundCid) ?? 0) + nz(r.net))
      continue
    }
    // 未手動綁定時，僅在「案場+棟+樓層+階段」唯一匹配單一合約列時才自動納入對帳。
    const siteKey = normalizeSiteNameKey((r.projectName ?? '').trim() || (r.siteBlockId ?? '').trim())
    if (!siteKey) continue
    const matchKey = toContractMatchKey(siteKey, r.buildingLabel, r.floorLabel, r.phaseLabel)
    if (duplicateContractMatchKeys.has(matchKey)) continue
    const autoCid = uniqueContractLineIdByKey.get(matchKey)
    if (!autoCid) continue
    receivableNetByContractLineId.set(autoCid, (receivableNetByContractLineId.get(autoCid) ?? 0) + nz(r.net))
  }
  for (const siteKey of siteKeys) {
    const siteName = siteDisplayByKey.get(siteKey) ?? UNMATCHED_SITE
    const groups = [...groupMap.values()]
      .filter((g) => normalizeSiteNameKey(g.siteName) === siteKey)
      .map(finalizeGroup)
      .sort((a, b) => {
        const d = a.dong.localeCompare(b.dong, 'zh-Hant')
        if (d !== 0) return d
        const f = compareFloorLevelAsc(a.floorLevel, b.floorLevel)
        if (f !== 0) return f
        return a.workPhase.localeCompare(b.workPhase, 'zh-Hant')
      })
    const totals = finalizeGroup(
      groups.reduce<MutableGroup>(
        (acc, g) => {
          acc.revenueNet += g.revenueNet
          acc.salaryCost += g.salaryCost
          acc.mealCost += g.mealCost
          acc.instrumentCost += g.instrumentCost
          acc.operatingExpenseAllocated += g.operatingExpenseAllocated
          acc.workDays += g.workDays
          return acc
        },
        {
          siteName,
          dong: '全部',
          floorLevel: '全部',
          workPhase: '全部',
          revenueNet: 0,
          salaryCost: 0,
          mealCost: 0,
          instrumentCost: 0,
          operatingExpenseAllocated: 0,
          workDays: 0,
        },
      ),
    )
    const details = (detailsBySite.get(siteKey) ?? []).slice().sort(detailSortAsc)
    const contractRows: SiteAnalysisContractRow[] = (contractContents.lines ?? [])
      .filter((line) => normalizeSiteNameKey(line.siteName) === siteKey)
      .map((line) => {
        const contractAmount = contractAmountOf(line)
        const receivableNetLinked = nz(receivableNetByContractLineId.get(line.id) ?? 0)
        const receivableRemaining = contractAmount - receivableNetLinked
        const receivableProgress = contractAmount > 0 ? receivableNetLinked / contractAmount : 0
        return {
          contractLineId: line.id,
          siteName,
          dong: normalizeSiteDimensionLabel(line.buildingLabel),
          floorLevel: normalizeSiteDimensionLabel(line.floorLabel),
          workPhase: normalizeSiteDimensionLabel(line.phaseLabel),
          unit: line.unit.trim() || '未填',
          contractUnitPrice: nz(line.contractUnitPrice),
          contractQuantity: nz(line.contractQuantity),
          contractAmount,
          receivableNetLinked,
          receivableRemaining,
          receivableProgress,
          note: (line.note ?? '').trim(),
        }
      })
      .sort((a, b) => {
        const d = a.dong.localeCompare(b.dong, 'zh-Hant')
        if (d !== 0) return d
        const f = compareFloorLevelAsc(a.floorLevel, b.floorLevel)
        if (f !== 0) return f
        return a.workPhase.localeCompare(b.workPhase, 'zh-Hant')
      })
    const contractTotals = contractRows.reduce(
      (acc, row) => {
        acc.contractAmount += row.contractAmount
        acc.receivableNetLinked += row.receivableNetLinked
        return acc
      },
      { contractAmount: 0, receivableNetLinked: 0, receivableRemaining: 0, receivableProgress: 0 },
    )
    contractTotals.receivableRemaining = contractTotals.contractAmount - contractTotals.receivableNetLinked
    contractTotals.receivableProgress =
      contractTotals.contractAmount > 0
        ? contractTotals.receivableNetLinked / contractTotals.contractAmount
        : 0
    bySite[siteName] = { groups, details, totals, contractRows, contractTotals }
  }

  return { siteNames, bySite }
}

