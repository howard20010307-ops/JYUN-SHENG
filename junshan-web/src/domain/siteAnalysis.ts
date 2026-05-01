import type { ReceivablesState } from './receivablesModel'
import type { SalaryBook } from './salaryExcelModel'
import type { WorkLogState } from './workLogModel'
import { effectiveEntriesForCalendar } from './workLogModel'
import { QUICK_SITE_JUN_ADJUST, QUICK_SITE_TSAI_ADJUST } from './fieldworkQuickApply'

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

export type SiteAnalysisSnapshot = {
  siteNames: string[]
  bySite: Record<
    string,
    {
      groups: SiteAnalysisGroup[]
      details: SiteAnalysisDetail[]
      totals: SiteAnalysisGroup
    }
  >
}

const UNMATCHED_SITE = '（未對應案場）'
const UNMATCHED_RECEIVABLE_DONG = '未對應收帳'

function nz(n: number): number {
  return Number.isFinite(n) ? n : 0
}

function norm(v: string): string {
  const t = (v ?? '').trim()
  return t === '' ? '未填' : t
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

function toGroupKey(siteKey: string, dong: string, floor: string, phase: string): string {
  return [siteKey, norm(dong), norm(floor), norm(phase)].join('\u0001')
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
          const rate = nz(m.rateJun[staffName] ?? 0)
          add(dateKey, site.key, staffName, days, rate)
        }
      }
      for (const [staffName, row] of Object.entries(m.junAdjustDays ?? {})) {
        const days = nz((row ?? [])[j] ?? 0)
        const rate = nz(m.rateJun[staffName] ?? 0)
        add(dateKey, resolveSite(QUICK_SITE_JUN_ADJUST).key, staffName, days, rate)
      }
      for (const [staffName, row] of Object.entries(m.tsaiAdjustDays ?? {})) {
        const days = nz((row ?? [])[j] ?? 0)
        const rate = nz(m.rateTsai[staffName] ?? 0)
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
): SiteAnalysisSnapshot {
  /**
   * 工作日誌優先：
   * 1) 先用工作日誌建立案場/棟/樓層/階段骨幹與明細
   * 2) 再把收帳掛載到既有分類；對不到者歸入「未對應收帳」
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
    let instrumentAnchorIdx = 0
    let instrumentAnchorDays = -1
    for (let i = 0; i < perBlockDays.length; i++) {
      const d = nz(perBlockDays[i] ?? 0)
      if (d > instrumentAnchorDays) {
        instrumentAnchorDays = d
        instrumentAnchorIdx = i
      }
    }
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
      const instrument = i === instrumentAnchorIdx ? nz(doc.instrumentCost) : 0
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
        dong: norm(b.dong),
        floorLevel: norm(b.floorLevel),
        workPhase: norm(b.workPhase),
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
    const dn = norm(dong)
    const fn = norm(floor)
    const pn = norm(phase)
    const candidates = groupKeysBySite.get(siteKey) ?? []
    if (candidates.length === 0) {
      return toGroupKey(siteKey, UNMATCHED_RECEIVABLE_DONG, floor, phase)
    }
    const parts = candidates.map((k) => ({ key: k, p: splitGroupKey(k) }))
    const exact = parts.find((x) => x.p.dong === dn && x.p.floorLevel === fn && x.p.workPhase === pn)
    if (exact) return exact.key
    const floorPhase = parts.find((x) => x.p.floorLevel === fn && x.p.workPhase === pn)
    if (floorPhase) return floorPhase.key
    const phaseOnly = parts.find((x) => x.p.workPhase === pn)
    if (phaseOnly) return phaseOnly.key
    const floorOnly = parts.find((x) => x.p.floorLevel === fn)
    if (floorOnly) return floorOnly.key
    if (parts.length === 1) return parts[0]!.key
    return toGroupKey(siteKey, UNMATCHED_RECEIVABLE_DONG, floor, phase)
  }

  for (const r of receivables.entries ?? []) {
    const rawSite = (r.projectName ?? '').trim() || (r.siteBlockId ?? '').trim()
    const site = resolveSite(rawSite)
    siteDisplayByKey.set(site.key, site.display)
    const key = pickReceivableTargetKey(site.key, r.buildingLabel, r.floorLabel, r.phaseLabel)
    const g = ensureGroup(groupMap, key, site.display)
    g.revenueNet += nz(r.net)
    if (!groupKeysBySite.has(site.key)) groupKeysBySite.set(site.key, [])
    const arr = groupKeysBySite.get(site.key)!
    if (!arr.includes(key)) arr.push(key)
  }

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
  for (const siteKey of siteKeys) {
    const siteName = siteDisplayByKey.get(siteKey) ?? UNMATCHED_SITE
    const groups = [...groupMap.values()]
      .filter((g) => normalizeSiteNameKey(g.siteName) === siteKey)
      .map(finalizeGroup)
      .sort((a, b) => {
        const d = a.dong.localeCompare(b.dong, 'zh-Hant')
        if (d !== 0) return d
        const f = a.floorLevel.localeCompare(b.floorLevel, 'zh-Hant')
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
    bySite[siteName] = { groups, details, totals }
  }

  return { siteNames, bySite }
}

