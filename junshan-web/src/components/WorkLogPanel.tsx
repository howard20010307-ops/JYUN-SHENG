import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SalaryBook } from '../domain/salaryExcelModel'
import { isPlaceholderMonthBlockSiteName } from '../domain/salaryExcelModel'
import type { WorkLogEntry, WorkLogState } from '../domain/workLogModel'
import {
  todayYmdLocal,
  DEFAULT_WORK_END,
  DEFAULT_WORK_START,
  mergedWorkItemOptions,
  sortWorkItemLabelsList,
  getDayDocument,
  emptyInstrumentQty,
  instrumentExpenseFromQty,
  WORK_LOG_INSTRUMENT_UNIT_PRICE_LINE_LASER,
  WORK_LOG_INSTRUMENT_UNIT_PRICE_ROTATING_LASER,
  WORK_LOG_INSTRUMENT_UNIT_PRICE_TOTAL_STATION,
  replaceDayDocument,
  removeDayDocumentAndEntries,
  summarizeWorkLogDayDocument,
  effectiveEntriesForCalendar,
  datesWithAnyLogInMonth,
  newSiteBlock,
  countDistinctNamedSites,
  newWorkLogSiteWorkLine,
  canonicalWorkLogDayDocIdForDraft,
  stableWorkLogWorkLineId,
  stableWorkLogToolLineId,
  WORK_LOG_INSTRUMENT_OPTIONS,
  instrumentQtyAnyPositive,
  parseInstrumentQtyFromDraftStrings,
  normStaffWorkDays,
  sumStaffWorkDaysInDayDocument,
} from '../domain/workLogModel'
import {
  buildLinkedDayDraftFromState,
  clearPayrollBookDayDataForDate,
  clearPayrollBookWorkGridMealAndAdjustForDate,
  linkedDayDraftToDayDocument,
  pruneDayDocumentToPayroll,
  syncPayrollBookFromDayDocument,
  type LinkedDayBlockDraft,
  type LinkedDayDraft,
  type LinkedDayStaffLineDraft,
} from '../domain/workLogPayrollLink'
import {
  buildPayrollDaySnapshot,
  datesWithPayrollActivityInCalendarMonth,
  payrollCalendarCellSummary,
  payrollStaffMealForFormSite,
  prefillFromPayrollDaySnapshot,
  type PayrollDaySnapshot,
} from '../domain/payrollDayForWorkLog'
import { normalizeQuickSiteKey, QUICK_SITE_JUN_ADJUST, QUICK_SITE_TSAI_ADJUST } from '../domain/fieldworkQuickApply'

const EMPTY_SITE = ''

type Props = {
  workLog: WorkLogState
  setWorkLog: (v: WorkLogState | ((prev: WorkLogState) => WorkLogState)) => void
  siteOptions: readonly { id: string; name: string }[]
  /** 全站「工作內容」datalist 預設（與放樣估價分開） */
  workItemPresetLabels: readonly string[]
  /** 將新字串併入預設清單（去重、依字長排序） */
  ensureWorkItemLabelsInPresets: (labels: readonly string[]) => void
  staffOptions: readonly string[]
  salaryBook: SalaryBook
  /** 儲存整日日誌時，將「餐費」寫回薪水月表該日餐列（與月表連動） */
  setSalaryBook?: (fn: (prev: SalaryBook) => SalaryBook) => void
}

type StaffLineDraft = LinkedDayStaffLineDraft
type BlockDraft = LinkedDayBlockDraft
/** 表單狀態：餐費／整日工具為整日；工作內容／儀器台數與人員在案場區塊；儀器支出全日欄唯讀（依台數加總）；案場／人員與月表連動 */
type DayDraft = LinkedDayDraft

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate()
}

function calendarDayCells(year: number, month1to12: number): (number | null)[] {
  const firstDow = new Date(year, month1to12 - 1, 1).getDay()
  const dim = daysInMonth(year, month1to12)
  const out: (number | null)[] = []
  for (let i = 0; i < 42; i++) {
    const d = i - firstDow + 1
    if (d < 1 || d > dim) out.push(null)
    else out.push(d)
  }
  return out
}

function toHhmm24(s: string, fallback: string): string {
  const t = (s || fallback).trim()
  const m = /^(\d{1,2}):(\d{2})$/.exec(t)
  if (!m) return fallback
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)))
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)))
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function ymd(year: number, month1to12: number, day: number): string {
  return `${year}-${String(month1to12).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function formatYmdChinese(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim())
  if (!m) return iso || '—'
  const y = parseInt(m[1], 10)
  const mo = parseInt(m[2], 10)
  const d = parseInt(m[3], 10)
  return `${y}年${mo}月${d}日`
}

function partsFromYmdStrict(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return null
  return { y: parseInt(m[1], 10), m: parseInt(m[2], 10), d: parseInt(m[3], 10) }
}

/** 與 index.css 月曆 @media (max-width: 520px) 一致：窄螢幕只顯示記號、不顯示格內摘要 */
const WORKLOG_CALENDAR_COMPACT_MQ = '(max-width: 520px)'

function useWorklogCalendarCompact(): boolean {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(WORKLOG_CALENDAR_COMPACT_MQ).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(WORKLOG_CALENDAR_COMPACT_MQ)
    const sync = () => setCompact(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return compact
}

function orderStaffNamesForForm(
  staffOptionsOrdered: readonly string[],
  payrollStaff: readonly string[],
): string[] {
  return [
    ...staffOptionsOrdered.filter((n) => payrollStaff.includes(n)),
    ...payrollStaff.filter((n) => !staffOptionsOrdered.includes(n)),
  ]
}

/** 切換案場時：自月表該日帶入該員計工數（非 1 才顯示字串） */
function staffDraftWorkDaysFromPayrollCell(
  snap: PayrollDaySnapshot,
  siteRaw: string,
  name: string,
): string {
  const ns = normalizeQuickSiteKey(siteRaw.trim())
  if (ns === QUICK_SITE_JUN_ADJUST) {
    const v = snap.junAdjust.find((x) => x.name === name)?.value
    return v !== undefined && Number.isFinite(v) && v !== 1 ? String(v) : ''
  }
  if (ns === QUICK_SITE_TSAI_ADJUST) {
    const v = snap.tsaiAdjust.find((x) => x.name === name)?.value
    return v !== undefined && Number.isFinite(v) && v !== 1 ? String(v) : ''
  }
  const blk = snap.blocks.find((bb) => normalizeQuickSiteKey(bb.siteName.trim()) === ns)
  const v = blk?.workers.find((w) => w.name === name)?.dayValue
  return v !== undefined && Number.isFinite(v) && v !== 1 ? String(v) : ''
}

type DayCellSummary = {
  siteLabel: string
  staffCount: number
  staffLabel: string
  workLabel: string
  /** 該日計工天數加總（整日文件為各列計工數；僅月表為格線＋調工；舊 entries 為人次估算） */
  totalWorkDays?: number
  /** 月表僅預支：月曆格不顯示地點／人數／人員／工作列（仍顯示「預」角標） */
  advanceOnlyMinimalCell?: boolean
  /** 月表該日「預支」列有非零（與出工／日誌分開標示） */
  hasPayrollAdvance?: boolean
}

function formatWorkLogCalendarTotalWorkDays(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '—'
  const r = Math.round(n * 100) / 100
  return Number.isInteger(r) ? String(r) : String(r)
}

function workLogCalendarSiteKey(siteName: string): string {
  const t = siteName.trim()
  if (!t) return '（無案場）'
  if (isPlaceholderMonthBlockSiteName(t)) return '（草稿案場）'
  return t
}

function aggregateWorkLogEntriesForDay(
  list: WorkLogEntry[],
): Pick<DayCellSummary, 'siteLabel' | 'staffCount' | 'staffLabel' | 'workLabel' | 'totalWorkDays'> {
  const sites = new Set<string>()
  const staff = new Set<string>()
  const works = new Set<string>()
  for (const e of list) {
    if (e.siteName.trim()) sites.add(workLogCalendarSiteKey(e.siteName))
    for (const n of e.staffNames ?? []) {
      if (n.trim()) staff.add(n.trim())
    }
    if (e.workItem.trim()) works.add(e.workItem.trim())
  }
  const staffArr = [...staff].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  const workArr = [...works].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  let workLabel: string
  const distinctSiteKeys = new Set(list.map((e) => workLogCalendarSiteKey(e.siteName)))
  if (distinctSiteKeys.size > 1) {
    const workBySite = new Map<string, Set<string>>()
    for (const e of list) {
      const key = workLogCalendarSiteKey(e.siteName)
      const w = e.workItem.trim()
      if (!w) continue
      let ws = workBySite.get(key)
      if (!ws) {
        ws = new Set()
        workBySite.set(key, ws)
      }
      ws.add(w)
    }
    const siteKeysSorted = [...distinctSiteKeys].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
    workLabel = siteKeysSorted
      .map((site) => {
        const ws = [...(workBySite.get(site) ?? [])].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
        return `${site}：\n${ws.length ? ws.join('\n') : '—'}`
      })
      .join('\n')
    if (list.length > 1) {
      workLabel = workLabel === '—' ? `（${list.length} 筆）` : `${workLabel}（${list.length} 筆）`
    }
  } else {
    workLabel = workArr.join('\n') || '—'
    if (list.length > 1) {
      workLabel = workLabel === '—' ? `（${list.length} 筆）` : `${workLabel}（${list.length} 筆）`
    }
  }
  let staffLabel: string
  let staffCount: number
  if (distinctSiteKeys.size > 1) {
    const bySite = new Map<string, Set<string>>()
    for (const e of list) {
      const key = workLogCalendarSiteKey(e.siteName)
      let set = bySite.get(key)
      if (!set) {
        set = new Set()
        bySite.set(key, set)
      }
      for (const n of e.staffNames ?? []) {
        if (n.trim()) set.add(n.trim())
      }
    }
    const siteKeys = [...bySite.keys()].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
    const parts = siteKeys.map((site) => {
      const names = [...(bySite.get(site) ?? [])].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
      return `${site}：\n${names.length ? names.join('\n') : '—'}`
    })
    staffLabel = parts.join('\n')
    staffCount = staffArr.length
  } else {
    const siteKey = [...distinctSiteKeys][0] ?? ''
    if (siteKey && staffArr.length > 0) {
      staffLabel = `${siteKey}：\n${staffArr.join('\n')}`
    } else {
      staffLabel = staffArr.join('\n') || '—'
    }
    staffCount = staffArr.length
  }
  const totalWorkDays = list.reduce(
    (s, e) => s + (e.staffNames?.filter((n) => n.trim()).length ?? 0),
    0,
  )
  return {
    siteLabel: [...sites].sort((a, b) => a.localeCompare(b, 'zh-Hant')).join('\n') || '—',
    staffCount,
    staffLabel,
    workLabel,
    totalWorkDays,
  }
}

export function WorkLogPanel({
  workLog,
  setWorkLog,
  siteOptions,
  workItemPresetLabels,
  ensureWorkItemLabelsInPresets,
  staffOptions,
  salaryBook,
  setSalaryBook,
}: Props) {
  const today = todayYmdLocal()
  const [viewYear, setViewYear] = useState(() => {
    const [y] = today.split('-').map(Number)
    return y
  })
  const [viewMonth, setViewMonth] = useState(() => {
    const [, m] = today.split('-').map(Number)
    return m
  })
  const [selectedYmd, setSelectedYmd] = useState<string | null>(today)
  const [dayDraft, setDayDraft] = useState<DayDraft>(() =>
    buildLinkedDayDraftFromState(today, workLog, salaryBook, staffOptions),
  )
  /** 各案場「新增自訂選項到清單」暫存字串（key = block.id，每案場一組） */
  const [blockCustomPresetDraft, setBlockCustomPresetDraft] = useState<Record<string, string>>({})
  const [formUnlocked, setFormUnlocked] = useState(false)
  /** 全螢幕編輯：月曆格顯示摘要，完整內容於 overlay（可捲、不截斷） */
  const [dayOverlayOpen, setDayOverlayOpen] = useState(false)
  const calendarCompact = useWorklogCalendarCompact()
  /** 本次全螢幕編輯自月曆選定的日期；若儲存時 {@link LinkedDayDraft.logDate} 已改，須自 state 移除原日之整日文件以免重複 */
  const dayEditSessionSourceYmdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!dayOverlayOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDayOverlayOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [dayOverlayOpen])

  useEffect(() => {
    if (!selectedYmd || formUnlocked) return
    setDayDraft(buildLinkedDayDraftFromState(selectedYmd, workLog, salaryBook, staffOptions))
  }, [salaryBook, selectedYmd, staffOptions, formUnlocked, workLog])

  const payrollFromMonthSheet = useMemo(() => {
    const y = (dayDraft.logDate || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(y)) return null
    const snapshot = buildPayrollDaySnapshot(salaryBook, y)
    if (!snapshot) return null
    return { snapshot, prefill: prefillFromPayrollDaySnapshot(snapshot) }
  }, [salaryBook, dayDraft.logDate])

  const payrollDayPrefill = payrollFromMonthSheet?.prefill ?? null
  const payrollSnapshotForWorkLogDay = payrollFromMonthSheet?.snapshot ?? null

  const siteChoices = useMemo(() => {
    const s = new Set<string>()
    s.add(QUICK_SITE_TSAI_ADJUST)
    s.add(QUICK_SITE_JUN_ADJUST)
    for (const o of siteOptions) {
      if (o.name.trim()) s.add(o.name)
    }
    if (payrollDayPrefill) {
      for (const name of payrollDayPrefill.siteNamesWithWork) {
        const t = name.trim()
        if (t) s.add(t)
      }
    }
    for (const b of dayDraft.blocks) {
      const t = b.siteName.trim()
      if (t) s.add(t)
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  }, [siteOptions, payrollDayPrefill, dayDraft.blocks])

  const workItemOptions = useMemo(
    () => mergedWorkItemOptions(workItemPresetLabels, workLog.customWorkItemLabels ?? []),
    [workItemPresetLabels, workLog.customWorkItemLabels],
  )

  const datesWithPayroll = useMemo(
    () => datesWithPayrollActivityInCalendarMonth(salaryBook, viewYear, viewMonth),
    [salaryBook, viewYear, viewMonth],
  )

  const datesWithLog = useMemo(
    () => datesWithAnyLogInMonth(workLog, viewYear, viewMonth),
    [workLog, viewYear, viewMonth],
  )

  const calCells = useMemo(() => calendarDayCells(viewYear, viewMonth), [viewYear, viewMonth])

  const multiSiteMode = countDistinctNamedSites(dayDraft.blocks) >= 2

  const aggregatedInstrumentQtyForDay = useMemo(() => {
    const o = emptyInstrumentQty()
    for (const b of dayDraft.blocks) {
      const iq = parseInstrumentQtyFromDraftStrings(
        b.instrumentTotalStation ?? '',
        b.instrumentRotatingLaser ?? '',
        b.instrumentLineLaser ?? '',
      )
      o.totalStation += iq.totalStation
      o.rotatingLaser += iq.rotatingLaser
      o.lineLaser += iq.lineLaser
    }
    return {
      totalStation: Math.min(9999, o.totalStation),
      rotatingLaser: Math.min(9999, o.rotatingLaser),
      lineLaser: Math.min(9999, o.lineLaser),
    }
  }, [dayDraft.blocks])

  const instrumentExpenseAuto = useMemo(
    () => instrumentExpenseFromQty(aggregatedInstrumentQtyForDay),
    [aggregatedInstrumentQtyForDay],
  )
  const instrumentUsesStructuredQty = instrumentQtyAnyPositive(aggregatedInstrumentQtyForDay)

  const dayCellSummaries = useMemo(() => {
    const p = `${viewYear}-${String(viewMonth).padStart(2, '0')}-`
    const m = new Map<string, DayCellSummary>()
    for (const doc of workLog.dayDocuments ?? []) {
      if (!doc.logDate.startsWith(p)) continue
      const a = summarizeWorkLogDayDocument(doc)
      m.set(doc.logDate, { ...a, totalWorkDays: sumStaffWorkDaysInDayDocument(doc) })
    }
    const byDate = new Map<string, WorkLogEntry[]>()
    for (const e of effectiveEntriesForCalendar(workLog)) {
      if (!e.logDate.startsWith(p)) continue
      if (getDayDocument(workLog, e.logDate)) continue
      const arr = byDate.get(e.logDate) ?? []
      arr.push(e)
      byDate.set(e.logDate, arr)
    }
    for (const [iso, list] of byDate) {
      if (m.has(iso)) continue
      const a = aggregateWorkLogEntriesForDay(list)
      m.set(iso, { ...a })
    }
    const dim = daysInMonth(viewYear, viewMonth)
    for (let day = 1; day <= dim; day++) {
      const iso = ymd(viewYear, viewMonth, day)
      if (m.has(iso)) continue
      if (!datesWithPayroll.has(iso)) continue
      const sn = buildPayrollDaySnapshot(salaryBook, iso)
      if (!sn) continue
      const pSum = payrollCalendarCellSummary(sn)
      const hasPayrollAdvance = sn.advances.some((x) => x.value !== 0)
      m.set(iso, { ...pSum, hasPayrollAdvance })
    }
    for (let day = 1; day <= dim; day++) {
      const iso = ymd(viewYear, viewMonth, day)
      const sn = buildPayrollDaySnapshot(salaryBook, iso)
      if (!sn || !sn.advances.some((x) => x.value !== 0)) continue
      const cur = m.get(iso)
      if (cur && !cur.hasPayrollAdvance) m.set(iso, { ...cur, hasPayrollAdvance: true })
    }
    return m
  }, [workLog, viewYear, viewMonth, datesWithPayroll, salaryBook])

  const selectedInCalendarView = useMemo(() => {
    if (!selectedYmd) return true
    const p = partsFromYmdStrict(selectedYmd)
    if (!p) return true
    return p.y === viewYear && p.m === viewMonth
  }, [selectedYmd, viewYear, viewMonth])

  const resetDraftForDay = useCallback(
    (ymdStr: string) => {
      dayEditSessionSourceYmdRef.current = ymdStr
      setDayDraft(buildLinkedDayDraftFromState(ymdStr, workLog, salaryBook, staffOptions))
      setFormUnlocked(false)
    },
    [workLog, salaryBook, staffOptions],
  )

  const prevMonth = useCallback(() => {
    if (viewMonth <= 1) {
      setViewYear((y) => y - 1)
      setViewMonth(12)
    } else setViewMonth((m) => m - 1)
  }, [viewMonth])

  const nextMonth = useCallback(() => {
    if (viewMonth >= 12) {
      setViewYear((y) => y + 1)
      setViewMonth(1)
    } else setViewMonth((m) => m + 1)
  }, [viewMonth])

  const jumpCalendarToYmd = useCallback((iso: string) => {
    const p = partsFromYmdStrict(iso)
    if (!p) return
    setViewYear(p.y)
    setViewMonth(p.m)
  }, [])

  const fixApplyBlockSite = useCallback(
    (blockIndex: number, siteRaw: string) => {
      const site = siteRaw === EMPTY_SITE ? '' : siteRaw
      setDayDraft((d) => {
        const snap = buildPayrollDaySnapshot(salaryBook, d.logDate)
        const scoped = snap ? payrollStaffMealForFormSite(snap, site) : null
        const blocks = d.blocks.map((b, i) => {
          if (i !== blockIndex) return b
          if (!snap) return { ...b, siteName: site }
          const lines: StaffLineDraft[] =
            scoped && scoped.staffNames.length > 0 && snap
              ? orderStaffNamesForForm(staffOptions, scoped.staffNames).map((name) => ({
                  name,
                  timeStart: DEFAULT_WORK_START,
                  timeEnd: DEFAULT_WORK_END,
                  workDays: staffDraftWorkDaysFromPayrollCell(snap, site, name),
                }))
              : b.staffLines.length
                ? b.staffLines.map((s) => ({
                    ...s,
                    workDays: s.workDays ?? '',
                  }))
                : [{ name: '', timeStart: DEFAULT_WORK_START, timeEnd: DEFAULT_WORK_END, workDays: '' }]
          return { ...b, siteName: site, staffLines: lines }
        })
        const mealCost =
          blockIndex === 0 && scoped ? (scoped.mealCost === 0 ? '' : String(scoped.mealCost)) : d.mealCost
        return { ...d, blocks, mealCost }
      })
    },
    [salaryBook, staffOptions],
  )

  const syncTimesInBlock = useCallback((blockIndex: number) => {
    setDayDraft((d) => {
      const blocks = d.blocks.map((b, i) => {
        if (i !== blockIndex || b.staffLines.length === 0) return b
        const t0 = toHhmm24(b.staffLines[0].timeStart, DEFAULT_WORK_START)
        const t1 = toHhmm24(b.staffLines[0].timeEnd, DEFAULT_WORK_END)
        return {
          ...b,
          staffLines: b.staffLines.map((ln) => ({ ...ln, timeStart: t0, timeEnd: t1 })),
        }
      })
      return { ...d, blocks }
    })
  }, [])

  const syncTimesAllDay = useCallback(() => {
    setDayDraft((d) => {
      let t0 = DEFAULT_WORK_START
      let t1 = DEFAULT_WORK_END
      for (const b of d.blocks) {
        if (b.staffLines.length) {
          t0 = toHhmm24(b.staffLines[0].timeStart, DEFAULT_WORK_START)
          t1 = toHhmm24(b.staffLines[0].timeEnd, DEFAULT_WORK_END)
          break
        }
      }
      const blocks = d.blocks.map((b) => ({
        ...b,
        staffLines: b.staffLines.map((ln) => ({ ...ln, timeStart: t0, timeEnd: t1 })),
      }))
      return { ...d, blocks }
    })
  }, [])

  const onSave = useCallback(() => {
    if (!formUnlocked) return
    if (!dayDraft.logDate || !/^\d{4}-\d{2}-\d{2}$/.test(dayDraft.logDate)) {
      window.alert('請選擇有效日期。')
      return
    }
    const existing = getDayDocument(workLog, dayDraft.logDate)
    const docRaw = linkedDayDraftToDayDocument(dayDraft, existing)
    const snapForSave = buildPayrollDaySnapshot(salaryBook, docRaw.logDate)
    const doc = snapForSave ? pruneDayDocumentToPayroll(salaryBook, docRaw.logDate, docRaw) : docRaw
    if (snapForSave) {
      const sig = (d: typeof doc) =>
        JSON.stringify(
          (d.blocks ?? []).map((b) => ({
            site: (b.siteName ?? '').trim(),
            staff: (b.staffLines ?? [])
              .map((ln) => ln.name.trim())
              .filter(Boolean)
              .sort((a, b2) => a.localeCompare(b2, 'zh-Hant')),
          })),
        )
      if (sig(docRaw) !== sig(doc)) {
        window.alert(
          '已依「該日月表」自動移除：月表上沒有的案場區塊、或不在該月表人員清單的姓名（日誌與月表須一致）。',
        )
      }
    }

    const namedLines: { blockIdx: number; name: string }[] = []
    for (let bi = 0; bi < doc.blocks.length; bi++) {
      for (const ln of doc.blocks[bi].staffLines) {
        if (ln.name.trim()) namedLines.push({ blockIdx: bi, name: ln.name.trim() })
      }
    }
    if (namedLines.length === 0) {
      window.alert('請至少於某一案場區塊新增一位施工人員（姓名）；若該日有月表，人員須為月表清單內、案場須為月表列名。')
      return
    }
    const seen = new Set<string>()
    for (const { blockIdx, name } of namedLines) {
      const site = doc.blocks[blockIdx].siteName.trim() || ''
      const key = `${site}\0${name}`
      if (seen.has(key)) {
        window.alert(`案場「${site || '（未填）'}」內，${name} 重複；同人同場請併成一列。`)
        return
      }
      seen.add(key)
    }
    const mergedWorkOpts = mergedWorkItemOptions(
      workItemPresetLabels,
      workLog.customWorkItemLabels ?? [],
    )
    const workLabelsFromDraft: string[] = []
    for (const b of dayDraft.blocks) {
      for (const wl of b.workLines ?? []) {
        const t = wl.label.trim()
        if (t) workLabelsFromDraft.push(t)
      }
    }
    const workLabelsToAddPreset = sortWorkItemLabelsList(workLabelsFromDraft).filter(
      (l) => !mergedWorkOpts.includes(l),
    )
    if (workLabelsToAddPreset.length) ensureWorkItemLabelsInPresets(workLabelsToAddPreset)

    const sessionOrigin = dayEditSessionSourceYmdRef.current
    setWorkLog((w) => {
      let next = replaceDayDocument(w, doc)
      if (sessionOrigin && sessionOrigin !== doc.logDate) {
        next = removeDayDocumentAndEntries(next, sessionOrigin)
      }
      queueMicrotask(() => {
        dayEditSessionSourceYmdRef.current = doc.logDate
        const bookForDraft = setSalaryBook
          ? (() => {
              let b = syncPayrollBookFromDayDocument(salaryBook, doc.logDate, doc)
              if (sessionOrigin && sessionOrigin !== doc.logDate) {
                b = clearPayrollBookWorkGridMealAndAdjustForDate(b, sessionOrigin)
              }
              return b
            })()
          : salaryBook
        setDayDraft(buildLinkedDayDraftFromState(doc.logDate, next, bookForDraft, staffOptions))
        if (setSalaryBook) {
          setSalaryBook((book) => {
            let b = syncPayrollBookFromDayDocument(book, doc.logDate, doc)
            if (sessionOrigin && sessionOrigin !== doc.logDate) {
              b = clearPayrollBookWorkGridMealAndAdjustForDate(b, sessionOrigin)
            }
            return b
          })
        }
      })
      return next
    })
    setFormUnlocked(false)
  }, [
    dayDraft,
    formUnlocked,
    setSalaryBook,
    setWorkLog,
    workLog,
    salaryBook,
    staffOptions,
    workItemPresetLabels,
    workLog.customWorkItemLabels,
    ensureWorkItemLabelsInPresets,
  ])

  const onDeleteCurrentDayLog = useCallback(() => {
    if (!formUnlocked) return
    const iso = (dayDraft.logDate || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      window.alert('請選擇有效日期。')
      return
    }
    if (
      !window.confirm(
        `確定刪除「${formatYmdChinese(iso)}」（${iso}）的整日工作日誌與同日舊筆？\n同時會清空該日在「薪水月表」的出工格線、餐費、預支／調工／加班等當日欄。\n此動作無法復原。`,
      )
    ) {
      return
    }
    setWorkLog((w) => {
      const next = removeDayDocumentAndEntries(w, iso)
      queueMicrotask(() => {
        dayEditSessionSourceYmdRef.current = iso
        setSelectedYmd(iso)
        const bookForDraft = setSalaryBook
          ? clearPayrollBookDayDataForDate(salaryBook, iso)
          : salaryBook
        setDayDraft(buildLinkedDayDraftFromState(iso, next, bookForDraft, staffOptions))
        if (setSalaryBook) {
          setSalaryBook((book) => clearPayrollBookDayDataForDate(book, iso))
        }
      })
      return next
    })
    setFormUnlocked(false)
  }, [dayDraft, formUnlocked, setSalaryBook, setWorkLog, salaryBook, staffOptions])

  const addCustomWorkItemForSiteBlock = useCallback(
    (blockIdx: number) => {
      const block = dayDraft.blocks[blockIdx]
      if (!block) return
      const v = (blockCustomPresetDraft[block.id] ?? '').trim()
      if (!v) return
      const opts = mergedWorkItemOptions(workItemPresetLabels, workLog.customWorkItemLabels ?? [])
      if (!opts.includes(v)) {
        ensureWorkItemLabelsInPresets([v])
      }
      const docId = canonicalWorkLogDayDocIdForDraft(dayDraft.logDate, dayDraft.docId)
      setDayDraft((d) => ({
        ...d,
        blocks: d.blocks.map((b, i) => {
          if (i !== blockIdx) return b
          const raw = b.workLines?.length
            ? [...b.workLines]
            : [{ ...newWorkLogSiteWorkLine(docId, blockIdx, 0) }]
          const emptyIdx = raw.findIndex((w) => !(w.label ?? '').trim())
          let workLines: typeof raw
          if (emptyIdx >= 0) {
            workLines = raw.map((w, j) => (j === emptyIdx ? { ...w, label: v } : w))
          } else {
            workLines = [
              ...raw,
              { id: stableWorkLogWorkLineId(docId, blockIdx, raw.length), label: v },
            ]
          }
          return { ...b, workLines }
        }),
      }))
      setBlockCustomPresetDraft((m) => {
        const next = { ...m }
        delete next[block.id]
        return next
      })
    },
    [
      blockCustomPresetDraft,
      dayDraft.blocks,
      ensureWorkItemLabelsInPresets,
      workItemPresetLabels,
      workLog.customWorkItemLabels,
    ],
  )

  const addWorkLine = useCallback((blockIdx: number) => {
    setDayDraft((d) => {
      const docId = canonicalWorkLogDayDocIdForDraft(d.logDate, d.docId)
      return {
        ...d,
        blocks: d.blocks.map((b, i) => {
          if (i !== blockIdx) return b
          const base = b.workLines?.length
            ? b.workLines
            : [newWorkLogSiteWorkLine(docId, blockIdx, 0)]
          return {
            ...b,
            workLines: [
              ...base,
              { id: stableWorkLogWorkLineId(docId, blockIdx, base.length), label: '' },
            ],
          }
        }),
      }
    })
  }, [])

  const removeWorkLine = useCallback((blockIdx: number, lineIdx: number) => {
    setDayDraft((d) => {
      const docId = canonicalWorkLogDayDocIdForDraft(d.logDate, d.docId)
      return {
        ...d,
        blocks: d.blocks.map((b, i) => {
          if (i !== blockIdx) return b
          const lines = b.workLines?.length
            ? b.workLines
            : [newWorkLogSiteWorkLine(docId, blockIdx, 0)]
          if (lines.length <= 1) {
            return { ...b, workLines: [newWorkLogSiteWorkLine(docId, blockIdx, 0)] }
          }
          return {
            ...b,
            workLines: lines
              .filter((_, j) => j !== lineIdx)
              .map((wl, li) => ({ ...wl, id: stableWorkLogWorkLineId(docId, blockIdx, li) })),
          }
        }),
      }
    })
  }, [])

  const addBlock = useCallback(() => {
    setDayDraft((d) => {
      const docId = canonicalWorkLogDayDocIdForDraft(d.logDate, d.docId)
      const nb = newSiteBlock(docId, d.blocks.length)
      return {
        ...d,
        blocks: [
          ...d.blocks,
          {
            id: nb.id,
            siteName: nb.siteName,
            workLines: nb.workLines.map((x) => ({ ...x })),
            instrumentTotalStation: '',
            instrumentRotatingLaser: '',
            instrumentLineLaser: '',
            equipment: '',
            remark: nb.remark,
            dong: nb.dong,
            floorLevel: nb.floorLevel,
            workPhase: nb.workPhase,
            staffLines: nb.staffLines.map((x) => ({
              name: x.name,
              timeStart: x.timeStart,
              timeEnd: x.timeEnd,
              workDays:
                x.workDays !== undefined &&
                Number.isFinite(x.workDays) &&
                normStaffWorkDays(x.workDays) !== 1
                  ? String(normStaffWorkDays(x.workDays))
                  : '',
            })),
          },
        ],
      }
    })
  }, [])

  const removeBlock = useCallback((idx: number) => {
    setDayDraft((d) => {
      if (d.blocks.length <= 1) return d
      return { ...d, blocks: d.blocks.filter((_, i) => i !== idx) }
    })
  }, [])

  const addStaffLine = useCallback((blockIdx: number) => {
    setDayDraft((d) => ({
      ...d,
      blocks: d.blocks.map((b, i) =>
        i === blockIdx
          ? {
              ...b,
              staffLines: [
                ...b.staffLines,
                { name: '', timeStart: DEFAULT_WORK_START, timeEnd: DEFAULT_WORK_END, workDays: '' },
              ],
            }
          : b,
      ),
    }))
  }, [])

  const removeStaffLine = useCallback((blockIdx: number, lineIdx: number) => {
    setDayDraft((d) => ({
      ...d,
      blocks: d.blocks.map((b, i) => {
        if (i !== blockIdx) return b
        if (b.staffLines.length <= 1) return b
        return { ...b, staffLines: b.staffLines.filter((_, j) => j !== lineIdx) }
      }),
    }))
  }, [])

  const addToolLineRow = useCallback(() => {
    setDayDraft((d) => {
      const docId = canonicalWorkLogDayDocIdForDraft(d.logDate, d.docId)
      const tl = d.toolLines ?? []
      return {
        ...d,
        toolLines: [
          ...tl,
          {
            id: stableWorkLogToolLineId(docId, tl.length),
            name: '',
            qty: '',
            unit: '',
            amount: '',
          },
        ],
      }
    })
  }, [])

  const removeToolLineRow = useCallback((lineIdx: number) => {
    setDayDraft((d) => {
      const docId = canonicalWorkLogDayDocIdForDraft(d.logDate, d.docId)
      const tl = d.toolLines ?? []
      if (tl.length <= 1) {
        return {
          ...d,
          toolLines: [
            { id: stableWorkLogToolLineId(docId, 0), name: '', qty: '', unit: '', amount: '' },
          ],
        }
      }
      return {
        ...d,
        toolLines: tl
          .filter((_, j) => j !== lineIdx)
          .map((row, ti) => ({ ...row, id: stableWorkLogToolLineId(docId, ti) })),
      }
    })
  }, [])

  return (
    <div className="panel">
      <h2>工作日誌</h2>

      <section
        className={`card worklogCalendarCard${calendarCompact ? ' worklogCalendarCard--compact' : ''}`}
      >
        <div className="worklogMonthNav">
          <div className="worklogMonthNavPrimary">
            <button type="button" className="btn secondary" onClick={prevMonth}>
              ← 上個月
            </button>
            <h3 className="worklogMonthTitle">
              {viewYear} 年 {viewMonth} 月
            </h3>
            <button type="button" className="btn secondary" onClick={nextMonth}>
              下個月 →
            </button>
          </div>
        </div>
        <div className="worklogCalGrid" role="grid" aria-label="月曆">
          {['日', '一', '二', '三', '四', '五', '六'].map((w) => (
            <div key={w} className="worklogCalDow">
              {w}
            </div>
          ))}
          {calCells.map((day, idx) => {
            if (day == null) {
              return <div key={`e-${idx}`} className="worklogDayCell worklogDayCell--empty" />
            }
            const cellYmd = ymd(viewYear, viewMonth, day)
            const hasLog = datesWithLog.has(cellYmd)
            const isSel = selectedYmd === cellYmd
            const isToday = cellYmd === today
            const cellSum = dayCellSummaries.get(cellYmd)
            const showCellBody = !calendarCompact && cellSum && !cellSum.advanceOnlyMinimalCell
            return (
              <button
                key={cellYmd}
                type="button"
                className={`worklogDayCell${hasLog ? ' worklogDayCell--hasLog' : ''}${cellSum?.hasPayrollAdvance ? ' worklogDayCell--hasAdvance' : ''}${isSel ? ' worklogDayCell--selected' : ''}${isToday ? ' worklogDayCell--today' : ''}`}
                onClick={() => {
                  setSelectedYmd(cellYmd)
                  resetDraftForDay(cellYmd)
                  setDayOverlayOpen(true)
                }}
              >
                <div className="worklogDayCellTop">
                  <span className="worklogDayNum">{day}</span>
                  <span className="worklogDayDots" aria-hidden>
                    {hasLog ? <span className="worklogDayDot worklogDayDot--log" title="有日誌" /> : null}
                    {cellSum?.hasPayrollAdvance ? (
                      <span className="worklogDayAdvanceMark" title="月表該日有預支（非零）">
                        預
                      </span>
                    ) : null}
                  </span>
                </div>
                {showCellBody ? (
                  <div className="worklogDayCellBody">
                    <div className="worklogDayCellLine">
                      <span className="worklogDayCellK">地點</span>
                      <span className="worklogDayCellV">{cellSum!.siteLabel}</span>
                    </div>
                    <div className="worklogDayCellLine worklogDayCellLine--count">
                      <span className="worklogDayCellK">人數</span>
                      <span className="worklogDayCellV">{cellSum!.staffCount}</span>
                    </div>
                    <div className="worklogDayCellLine">
                      <span className="worklogDayCellK">人員</span>
                      <span className="worklogDayCellV">{cellSum!.staffLabel}</span>
                    </div>
                    <div className="worklogDayCellLine">
                      <span className="worklogDayCellK">工作</span>
                      <span className="worklogDayCellV">{cellSum!.workLabel}</span>
                    </div>
                    {cellSum!.totalWorkDays !== undefined ? (
                      <div className="worklogDayCellLine worklogDayCellLine--count">
                        <span className="worklogDayCellK">總計工數</span>
                        <span className="worklogDayCellV">
                          {formatWorkLogCalendarTotalWorkDays(cellSum!.totalWorkDays)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </button>
            )
          })}
        </div>
        {calendarCompact ? (
          <p className="hint worklogCalLegend worklogCalLegend--compact">
            <span className="worklogDayDot worklogDayDot--log" /> 有日誌
            <span style={{ width: 8, display: 'inline-block' }} />
            <span className="worklogDayAdvanceMark worklogDayAdvanceMark--legend" aria-hidden>
              預
            </span>
            該日有預支（非零）· 點日期 → 全螢幕編輯
          </p>
        ) : (
          <p className="hint worklogCalLegend">
            <span className="worklogDayDot worklogDayDot--log" /> 有日誌
            <span style={{ width: 8, display: 'inline-block' }} />
            <span className="worklogDayAdvanceMark worklogDayAdvanceMark--legend" aria-hidden>
              預
            </span>
            月表該日有預支（非零）
            <span style={{ width: 8, display: 'inline-block' }} />
            格內摘要可捲；點日期 → 全螢幕編輯（全文）
          </p>
        )}
        {selectedYmd && !selectedInCalendarView ? (
          <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
            目前選取為 <strong>{formatYmdChinese(selectedYmd)}</strong>，不在此月曆月份。{' '}
            <button type="button" className="btn secondary" onClick={() => jumpCalendarToYmd(selectedYmd)}>
              切到此月
            </button>
          </p>
        ) : null}
      </section>

      {selectedYmd && !dayOverlayOpen ? (
        <section className="card worklogCalendarReopenHint">
          <p className="hint" style={{ margin: 0 }}>
            已選取 <strong>{formatYmdChinese(selectedYmd)}</strong>（{selectedYmd}）。再點該日格或下方按鈕以全螢幕編輯。
          </p>
          <div className="btnRow" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (selectedYmd) resetDraftForDay(selectedYmd)
                setDayOverlayOpen(true)
              }}
            >
              開啟當日編輯
            </button>
          </div>
        </section>
      ) : null}

      {dayOverlayOpen && selectedYmd ? (
        <div
          className="worklogDayOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="worklog-day-overlay-title"
        >
          <div
            className="worklogDayOverlayBackdrop"
            onClick={() => setDayOverlayOpen(false)}
            aria-hidden
          />
          <div className="worklogDayOverlayPanel">
            <header className="worklogDayOverlayHeader">
              <button type="button" className="btn secondary" onClick={() => setDayOverlayOpen(false)}>
                關閉
              </button>
              <div className="worklogDayOverlayTitleGroup">
                <h3 className="worklogDayOverlayTitle" id="worklog-day-overlay-title">
                  編輯整日工作日誌
                </h3>
                <p className="worklogDayOverlayDate muted">
                  {formatYmdChinese(selectedYmd)} · {selectedYmd}
                </p>
              </div>
              <div className="worklogMonthNavLock worklogDayOverlayLock">
                <span
                  className={`worklogLockPill${formUnlocked ? ' worklogLockPill--on' : ''}`}
                  title={formUnlocked ? '可修改欄位與儲存' : '僅能檢視；請先解鎖再改'}
                >
                  {formUnlocked ? '已解鎖' : '已鎖定'}
                </span>
                <button type="button" className="btn secondary" onClick={() => setFormUnlocked((u) => !u)}>
                  {formUnlocked ? '鎖定' : '解鎖編輯'}
                </button>
              </div>
            </header>
            <div className="worklogDayOverlayScroll">
              <section className="card worklogForm worklogDayInfoCard worklogDayOverlayCard">

          <datalist id="worklog-workitem-list">
            {workItemOptions.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>

          <div className="worklogKvRow worklogKvRow--first">
            <div className="worklogKvTitle">
              <span className="worklogDayInfoNum" aria-hidden>
                1
              </span>
              記錄日期
            </div>
            <div className="worklogKvValue">
              <p className="worklogDayInfoZhDate">
                {formatYmdChinese(dayDraft.logDate)}
                <span className="muted">（{dayDraft.logDate}）</span>
              </p>
              <input
                type="date"
                className="titleInput"
                disabled={!formUnlocked}
                title="僅變更本筆要儲存的日期；表單內已填內容會保留"
                value={dayDraft.logDate}
                onChange={(e) => {
                  const v = e.target.value
                  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
                    setDayDraft((d) => ({ ...d, logDate: v }))
                    return
                  }
                  setSelectedYmd(v)
                  jumpCalendarToYmd(v)
                  setDayDraft((d) => ({ ...d, logDate: v }))
                }}
              />
            </div>
          </div>

          <div className={`worklogSharedDayFields${multiSiteMode ? ' worklogSharedDayFields--multi' : ''}`}>
            <p className="worklogSharedDayFieldsTitle">當日共用（餐費、工具、儀器支出）</p>
            <div className="worklogKvRow">
              <div className="worklogKvTitle">
                <span className="worklogDayInfoNum" aria-hidden>
                  2
                </span>
                餐費（元）
              </div>
              <div className="worklogKvValue">
                <input
                  type="text"
                  inputMode="decimal"
                  className="titleInput"
                  disabled={!formUnlocked}
                  value={dayDraft.mealCost}
                  onChange={(e) => setDayDraft((d) => ({ ...d, mealCost: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="worklogKvRow">
              <div className="worklogKvTitle">
                <span className="worklogDayInfoNum" aria-hidden>
                  3
                </span>
                工具
              </div>
              <div className="worklogKvValue">
                <p className="hint muted" style={{ margin: 0, fontSize: 12 }}>
                  名稱、數量、單位、金額，可複數列。數量空白則視為 1；損益仍以「金額」加總。
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(dayDraft.toolLines ?? []).map((row, ti) => (
                  <div key={row.id} className="btnRow" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
                    <label className="worklogFormLabel" style={{ flex: '1 1 140px', minWidth: 100 }}>
                      <span className="muted" style={{ fontSize: '0.9em' }}>
                        名稱
                      </span>
                      <input
                        type="text"
                        className="titleInput"
                        disabled={!formUnlocked}
                        value={row.name}
                        onChange={(e) =>
                          setDayDraft((d) => ({
                            ...d,
                            toolLines: (d.toolLines ?? []).map((r, i) =>
                              i === ti ? { ...r, name: e.target.value } : r,
                            ),
                          }))
                        }
                        placeholder="選填"
                      />
                    </label>
                    <label className="worklogFormLabel" style={{ flex: '0 1 88px', minWidth: 72 }}>
                      <span className="muted" style={{ fontSize: '0.9em' }}>
                        數量
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="titleInput"
                        disabled={!formUnlocked}
                        value={row.qty ?? ''}
                        onChange={(e) =>
                          setDayDraft((d) => ({
                            ...d,
                            toolLines: (d.toolLines ?? []).map((r, i) =>
                              i === ti ? { ...r, qty: e.target.value } : r,
                            ),
                          }))
                        }
                        placeholder="1"
                        title="空白則視為 1"
                      />
                    </label>
                    <label className="worklogFormLabel" style={{ flex: '0 1 88px', minWidth: 64 }}>
                      <span className="muted" style={{ fontSize: '0.9em' }}>
                        單位
                      </span>
                      <input
                        type="text"
                        className="titleInput"
                        disabled={!formUnlocked}
                        value={row.unit ?? ''}
                        onChange={(e) =>
                          setDayDraft((d) => ({
                            ...d,
                            toolLines: (d.toolLines ?? []).map((r, i) =>
                              i === ti ? { ...r, unit: e.target.value } : r,
                            ),
                          }))
                        }
                        placeholder="組"
                      />
                    </label>
                    <label className="worklogFormLabel" style={{ flex: '0 1 120px' }}>
                      <span className="muted" style={{ fontSize: '0.9em' }}>
                        金額（元）
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="titleInput"
                        disabled={!formUnlocked}
                        value={row.amount}
                        onChange={(e) =>
                          setDayDraft((d) => ({
                            ...d,
                            toolLines: (d.toolLines ?? []).map((r, i) =>
                              i === ti ? { ...r, amount: e.target.value } : r,
                            ),
                          }))
                        }
                        placeholder="0"
                      />
                    </label>
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={!formUnlocked || (dayDraft.toolLines ?? []).length <= 1}
                      onClick={() => removeToolLineRow(ti)}
                    >
                      移除此列
                    </button>
                  </div>
                ))}
                <button type="button" className="btn secondary" disabled={!formUnlocked} onClick={addToolLineRow}>
                  新增工具列
                </button>
              </div>
            </div>
            </div>
            <div className="worklogKvRow">
              <div className="worklogKvTitle">
                <span className="worklogDayInfoNum" aria-hidden>
                  4
                </span>
                儀器支出（元）
              </div>
              <div className="worklogKvValue">
                <p className="hint muted" style={{ margin: 0, fontSize: 12 }}>
                  單價：全站儀 {WORK_LOG_INSTRUMENT_UNIT_PRICE_TOTAL_STATION.toLocaleString()} 元／台、旋轉雷射{' '}
                  {WORK_LOG_INSTRUMENT_UNIT_PRICE_ROTATING_LASER.toLocaleString()} 元／台、墨線儀{' '}
                  {WORK_LOG_INSTRUMENT_UNIT_PRICE_LINE_LASER.toLocaleString()} 元／台。
                  {instrumentUsesStructuredQty
                    ? ' 各案場有填台數時由此欄自動加總（唯讀）。'
                    : ' 此欄唯讀；請於各案場填寫儀器台數後儲存，即會依台數自動計入；僅舊資料無台數時顯示已存金額。'}
                </p>
                <input
                  type="text"
                  inputMode="decimal"
                  className="titleInput"
                  disabled
                  readOnly
                  value={
                    instrumentUsesStructuredQty
                      ? instrumentExpenseAuto
                      : dayDraft.instrumentCost === ''
                        ? ''
                        : dayDraft.instrumentCost
                  }
                  placeholder="0"
                  title={
                    instrumentUsesStructuredQty
                      ? '依各案場儀器台數與單價自動加總（唯讀）'
                      : '唯讀：無台數時顯示已存金額，請改由各案場填寫台數後自動計算'
                  }
                />
              </div>
            </div>
          </div>

          <div className="worklogDayBlockActionsGlobal btnRow" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn secondary" disabled={!formUnlocked} onClick={syncTimesAllDay}>
              全日人員時間一致（跨案場）
            </button>
            <button type="button" className="btn secondary" disabled={!formUnlocked} onClick={addBlock}>
              新增案場區塊
            </button>
          </div>

          {dayDraft.blocks.map((block, bi) => (
            <div
              key={block.id}
              className={`worklogSiteBlock${multiSiteMode ? ' worklogSiteBlock--multi' : ''}`}
            >
              {dayDraft.blocks.length > 1 ? (
                <div className="worklogSiteBlockHead" style={{ justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn secondary ghost"
                    disabled={!formUnlocked}
                    onClick={() => removeBlock(bi)}
                  >
                    移除此區塊
                  </button>
                </div>
              ) : null}
              <div
                className="worklogSiteBlockSiteInfo"
                style={{
                  marginTop: bi === 0 ? 4 : 18,
                  paddingTop: bi === 0 ? 0 : 12,
                  borderTop: bi === 0 ? undefined : '1px solid var(--border, #ddd)',
                }}
              >
                <p className="worklogSharedDayFieldsTitle" style={{ marginBottom: 10 }}>
                  案場資訊
                  {dayDraft.blocks.length > 1 ? (
                    <span className="muted" style={{ fontWeight: 'normal', fontSize: '0.92em' }}>
                      {' '}
                      （第 {bi + 1} 區）
                    </span>
                  ) : null}
                </p>
                <div className="worklogKvRow">
                  <div className="worklogKvTitle">案場地點</div>
                  <div className="worklogKvValue">
                    <select
                      className="titleInput"
                      disabled={!formUnlocked}
                      value={block.siteName ? block.siteName : EMPTY_SITE}
                      onChange={(e) => fixApplyBlockSite(bi, e.target.value)}
                    >
                      <option value={EMPTY_SITE}>請選擇</option>
                      {siteChoices.map((n) => (
                        <option key={n} value={n}>
                          {isPlaceholderMonthBlockSiteName(n) ? '（草稿案場）' : n}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div
                  className="btnRow"
                  style={{ flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 10, width: '100%' }}
                >
                  <label className="worklogFormLabel" style={{ flex: '1 1 100px', minWidth: 80, margin: 0 }}>
                    <span className="worklogDayInfoLabel">棟</span>
                    <input
                    type="text"
                    className="titleInput"
                    disabled={!formUnlocked}
                    value={block.dong}
                    onChange={(e) =>
                      setDayDraft((d) => ({
                        ...d,
                        blocks: d.blocks.map((b, i) => (i === bi ? { ...b, dong: e.target.value } : b)),
                      }))
                    }
                    placeholder="例：A棟"
                  />
                </label>
                <label className="worklogFormLabel" style={{ flex: '1 1 100px', minWidth: 80, margin: 0 }}>
                  <span className="worklogDayInfoLabel">樓層</span>
                  <input
                    type="text"
                    className="titleInput"
                    disabled={!formUnlocked}
                    value={block.floorLevel}
                    onChange={(e) =>
                      setDayDraft((d) => ({
                        ...d,
                        blocks: d.blocks.map((b, i) => (i === bi ? { ...b, floorLevel: e.target.value } : b)),
                      }))
                    }
                    placeholder="例：3F"
                  />
                </label>
                <label className="worklogFormLabel" style={{ flex: '1 1 120px', minWidth: 96, margin: 0 }}>
                  <span className="worklogDayInfoLabel">階段</span>
                  <input
                    type="text"
                    className="titleInput"
                    disabled={!formUnlocked}
                    value={block.workPhase}
                    onChange={(e) =>
                      setDayDraft((d) => ({
                        ...d,
                        blocks: d.blocks.map((b, i) => (i === bi ? { ...b, workPhase: e.target.value } : b)),
                      }))
                    }
                    placeholder="例：結構／粗裝"
                  />
                </label>
                </div>
              </div>
              {payrollDayPrefill && payrollDayPrefill.siteNamesWithWork.length > 1 ? (
                <p className="hint muted" style={{ marginTop: 0, marginBottom: 8 }}>
                  月表本日多案場：{payrollDayPrefill.siteNamesWithWork.join('、')}。可「新增案場區塊」後各選一案場；同人不同場請分區塊登記。
                </p>
              ) : null}
              <div className="btnRow" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
                <button type="button" className="btn secondary" disabled={!formUnlocked} onClick={() => syncTimesInBlock(bi)}>
                  本案場人員時間一致
                </button>
                <button type="button" className="btn secondary" disabled={!formUnlocked} onClick={() => addStaffLine(bi)}>
                  新增人員列
                </button>
              </div>
              <div className="worklogStaffLineTableWrap">
                <table className="worklogStaffLineTable data tight">
                  <thead>
                    <tr>
                      <th>施工人員</th>
                      <th>上班</th>
                      <th>下班</th>
                      <th aria-label="操作" />
                      <th>計工數</th>
                    </tr>
                  </thead>
                  <tbody>
                    {block.staffLines.map((ln, li) => (
                      <tr key={`${block.id}-${li}`}>
                        <td>
                          <input
                            type="text"
                            className="titleInput"
                            disabled={!formUnlocked}
                            list={`worklog-staff-dl-${bi}`}
                            value={ln.name}
                            onChange={(e) =>
                              setDayDraft((d) => ({
                                ...d,
                                blocks: d.blocks.map((b, i) =>
                                  i !== bi
                                    ? b
                                    : {
                                        ...b,
                                        staffLines: b.staffLines.map((s, j) =>
                                          j !== li ? s : { ...s, name: e.target.value },
                                        ),
                                      },
                                ),
                              }))
                            }
                            placeholder="姓名"
                          />
                          <datalist id={`worklog-staff-dl-${bi}`}>
                            {staffOptions.map((n) => (
                              <option key={n} value={n} />
                            ))}
                          </datalist>
                        </td>
                        <td>
                          <input
                            type="time"
                            disabled={!formUnlocked}
                            value={toHhmm24(ln.timeStart, DEFAULT_WORK_START)}
                            onChange={(e) =>
                              setDayDraft((d) => ({
                                ...d,
                                blocks: d.blocks.map((b, i) =>
                                  i !== bi
                                    ? b
                                    : {
                                        ...b,
                                        staffLines: b.staffLines.map((s, j) =>
                                          j !== li ? s : { ...s, timeStart: e.target.value },
                                        ),
                                      },
                                ),
                              }))
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="time"
                            disabled={!formUnlocked}
                            value={toHhmm24(ln.timeEnd, DEFAULT_WORK_END)}
                            onChange={(e) =>
                              setDayDraft((d) => ({
                                ...d,
                                blocks: d.blocks.map((b, i) =>
                                  i !== bi
                                    ? b
                                    : {
                                        ...b,
                                        staffLines: b.staffLines.map((s, j) =>
                                          j !== li ? s : { ...s, timeEnd: e.target.value },
                                        ),
                                      },
                                ),
                              }))
                            }
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn secondary ghost"
                            disabled={!formUnlocked || block.staffLines.length <= 1}
                            onClick={() => removeStaffLine(bi, li)}
                          >
                            刪列
                          </button>
                        </td>
                        <td>
                          <input
                            type="text"
                            inputMode="decimal"
                            className="titleInput"
                            disabled={!formUnlocked}
                            placeholder="1"
                            value={ln.workDays}
                            onChange={(e) =>
                              setDayDraft((d) => ({
                                ...d,
                                blocks: d.blocks.map((b, i) =>
                                  i !== bi
                                    ? b
                                    : {
                                        ...b,
                                        staffLines: b.staffLines.map((s, j) =>
                                          j !== li ? s : { ...s, workDays: e.target.value },
                                        ),
                                      },
                                ),
                              }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="worklogKvRow">
                <div className="worklogKvTitle">工作內容（本案場）</div>
                <div className="worklogKvValue">
                  <div
                    className="btnRow"
                    style={{
                      flexWrap: 'wrap',
                      alignItems: 'flex-end',
                      gap: 10,
                      marginBottom: 8,
                      width: '100%',
                    }}
                  >
                    <div
                      className="worklogCustomItemRow"
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                        alignItems: 'center',
                        flex: '1 1 280px',
                        minWidth: 0,
                        marginTop: 0,
                      }}
                    >
                    <input
                      type="text"
                      className="titleInput"
                      disabled={!formUnlocked}
                      placeholder="新增自訂選項到清單"
                      style={{ flex: '1 1 160px', minWidth: 120 }}
                      value={blockCustomPresetDraft[block.id] ?? ''}
                      onChange={(e) =>
                        setBlockCustomPresetDraft((m) => ({
                          ...m,
                          [block.id]: e.target.value,
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={!formUnlocked}
                      onClick={() => addCustomWorkItemForSiteBlock(bi)}
                    >
                      加入選項
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={!formUnlocked}
                    onClick={() => addWorkLine(bi)}
                  >
                    新增工作列
                  </button>
                </div>
                <p className="hint muted" style={{ margin: '0 0 10px', fontSize: 12 }}>
                  全站選單請至<strong>薪水</strong>分頁 → <strong>快速登記</strong>最下方「工作內容選項」管理。
                </p>
                {(block.workLines?.length
                  ? block.workLines
                  : [
                      newWorkLogSiteWorkLine(
                        canonicalWorkLogDayDocIdForDraft(dayDraft.logDate, dayDraft.docId),
                        bi,
                        0,
                      ),
                    ]
                ).map((wl, li) => (
                  <div
                    key={wl.id}
                    className="worklogWorkLineBlock"
                    style={{
                      marginBottom: 12,
                      paddingBottom: 12,
                      borderBottom: '1px solid var(--border, #e8e8e8)',
                    }}
                  >
                    <div
                      className="btnRow"
                      style={{
                        flexWrap: 'wrap',
                        alignItems: 'flex-end',
                        gap: 8,
                        width: '100%',
                      }}
                    >
                      <label className="worklogFormLabel" style={{ margin: 0, flex: '1 1 200px', minWidth: 0 }}>
                        <span className="muted" style={{ fontSize: 13 }}>
                          工作描述
                        </span>
                        <input
                          className="titleInput"
                          disabled={!formUnlocked}
                          list="worklog-workitem-list"
                          value={wl.label}
                          onChange={(e) =>
                            setDayDraft((d) => ({
                              ...d,
                              blocks: d.blocks.map((b, i) =>
                                i !== bi
                                  ? b
                                  : {
                                      ...b,
                                      workLines: b.workLines.map((w, j) =>
                                        j !== li ? w : { ...w, label: e.target.value },
                                      ),
                                    },
                              ),
                            }))
                          }
                          placeholder="從清單選或自填"
                        />
                      </label>
                      <button
                        type="button"
                        className="btn secondary ghost"
                        disabled={!formUnlocked}
                        style={{ flexShrink: 0 }}
                        onClick={() => removeWorkLine(bi, li)}
                      >
                        刪除此工作列
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              </div>
              <div className="worklogKvRow">
                <div className="worklogKvTitle">使用儀器（本案場）</div>
                <div className="worklogKvValue">
                  <p className="hint muted" style={{ margin: 0, fontSize: 13 }}>
                    僅三種：全站儀、旋轉雷射、墨線儀。請填<strong>台數</strong>（0 或空白＝未使用）；有使用才填數量。
                    儀器支出單價：全站儀 {WORK_LOG_INSTRUMENT_UNIT_PRICE_TOTAL_STATION.toLocaleString()} 元／台、旋轉雷射{' '}
                    {WORK_LOG_INSTRUMENT_UNIT_PRICE_ROTATING_LASER.toLocaleString()} 元／台、墨線儀{' '}
                    {WORK_LOG_INSTRUMENT_UNIT_PRICE_LINE_LASER.toLocaleString()} 元／台（全日各案場台數加總）。
                  </p>
                {(() => {
                  const q = parseInstrumentQtyFromDraftStrings(
                    block.instrumentTotalStation ?? '',
                    block.instrumentRotatingLaser ?? '',
                    block.instrumentLineLaser ?? '',
                  )
                  const showLegacy =
                    (block.equipment ?? '').trim() && !instrumentQtyAnyPositive(q)
                  return showLegacy ? (
                    <p className="hint" style={{ marginBottom: 10 }}>
                      舊資料（自由文字）：<strong>{block.equipment}</strong>
                      — 請改填下方台數後儲存，以轉成新格式。
                    </p>
                  ) : null
                })()}
                <div className="worklogFormGrid" style={{ gap: 10 }}>
                  {WORK_LOG_INSTRUMENT_OPTIONS.map(({ key, label }) => {
                    const field =
                      key === 'totalStation'
                        ? 'instrumentTotalStation'
                        : key === 'rotatingLaser'
                          ? 'instrumentRotatingLaser'
                          : 'instrumentLineLaser'
                    const val =
                      field === 'instrumentTotalStation'
                        ? block.instrumentTotalStation ?? ''
                        : field === 'instrumentRotatingLaser'
                          ? block.instrumentRotatingLaser ?? ''
                          : block.instrumentLineLaser ?? ''
                    return (
                      <label key={key} className="worklogFormLabel" style={{ margin: 0 }}>
                        <span className="muted" style={{ fontSize: 13 }}>
                          {label}（台）
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="titleInput"
                          disabled={!formUnlocked}
                          value={val}
                          onChange={(e) =>
                            setDayDraft((d) => ({
                              ...d,
                              blocks: d.blocks.map((b, i) =>
                                i !== bi ? b : { ...b, [field]: e.target.value },
                              ),
                            }))
                          }
                          placeholder="0"
                        />
                      </label>
                    )
                  })}
                </div>
              </div>
              </div>
              <div className="worklogKvRow">
                <div className="worklogKvTitle">備註（本案場）</div>
                <div className="worklogKvValue">
                  <textarea
                    className="titleInput"
                    disabled={!formUnlocked}
                    value={block.remark}
                    onChange={(e) =>
                      setDayDraft((d) => ({
                        ...d,
                        blocks: d.blocks.map((b, i) => (i === bi ? { ...b, remark: e.target.value } : b)),
                      }))
                    }
                    placeholder="該案場施工重點、注意事項等（選填）"
                    rows={3}
                    style={{ width: '100%', minHeight: '5.5rem', resize: 'vertical' }}
                  />
                </div>
              </div>
            </div>
          ))}

          {payrollSnapshotForWorkLogDay &&
          (payrollSnapshotForWorkLogDay.junOt.length > 0 ||
            payrollSnapshotForWorkLogDay.tsaiOt.length > 0) ? (
            <div className="worklogPayrollOvertimeSection">
              <span className="worklogDayInfoLabel" style={{ marginBottom: 10 }}>
                月表加班（本日，唯讀）
              </span>
              {payrollSnapshotForWorkLogDay.junOt.length > 0 ? (
                <>
                  <div className="worklogPayrollOtSubhead">鈞泩加班（時數）</div>
                  <ul className="worklogPayrollAdvanceList worklogPayrollOtList">
                    {payrollSnapshotForWorkLogDay.junOt.map((x) => (
                      <li key={`jun-ot-${x.name}`}>
                        <span className="worklogPayrollAdvanceName">{x.name}</span>
                        <span className="muted"> — </span>
                        <span className="worklogPayrollAdvanceAmount">{x.value}</span>
                        <span className="muted"> 小時</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {payrollSnapshotForWorkLogDay.tsaiOt.length > 0 ? (
                <>
                  <div
                    className={`worklogPayrollOtSubhead${payrollSnapshotForWorkLogDay.junOt.length > 0 ? ' worklogPayrollOtSubhead--spaced' : ''}`}
                  >
                    蔡董加班（時數）
                  </div>
                  <ul className="worklogPayrollAdvanceList worklogPayrollOtList">
                    {payrollSnapshotForWorkLogDay.tsaiOt.map((x) => (
                      <li key={`tsai-ot-${x.name}`}>
                        <span className="worklogPayrollAdvanceName">{x.name}</span>
                        <span className="muted"> — </span>
                        <span className="worklogPayrollAdvanceAmount">{x.value}</span>
                        <span className="muted"> 小時</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}

          {payrollSnapshotForWorkLogDay && payrollSnapshotForWorkLogDay.advances.length > 0 ? (
            <div className="worklogPayrollAdvanceSection">
              <span className="worklogDayInfoLabel" style={{ marginBottom: 8 }}>
                月表預支（本日明細）
              </span>
              <p className="hint muted worklogPayrollAdvanceHint">
                來自月表「{payrollSnapshotForWorkLogDay.sheetLabel}」當日預支欄（非案場出工）。若要修改金額請至「薪水」頁同一月表編輯。
              </p>
              <ul className="worklogPayrollAdvanceList">
                {payrollSnapshotForWorkLogDay.advances.map((a) => (
                  <li key={a.name}>
                    <span className="worklogPayrollAdvanceName">{a.name}</span>
                    <span className="muted"> — 預支 </span>
                    <span className="worklogPayrollAdvanceAmount">
                      {Number(a.value).toLocaleString('zh-TW')}
                    </span>
                    <span className="muted"> 元</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="btnRow" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="btn" disabled={!formUnlocked} onClick={onSave}>
              儲存當日日誌
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={!formUnlocked}
              onClick={() => selectedYmd && resetDraftForDay(selectedYmd)}
            >
              還原未儲存
            </button>
            <button
              type="button"
              className="btn danger ghost"
              disabled={!formUnlocked}
              title="刪除整日文件與同日舊筆，並清空該日在薪水月表的出工、餐費、預支／調工／加班等當日欄"
              onClick={onDeleteCurrentDayLog}
            >
              刪除當日日誌
            </button>
          </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {!selectedYmd ? (
        <section className="card worklogForm worklogDayInfoCard">
          <p className="hint" style={{ margin: 0 }}>
            請在月曆選擇日期。
          </p>
        </section>
      ) : null}
    </div>
  )
}
