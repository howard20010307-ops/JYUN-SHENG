import { useCallback, useEffect, useMemo, useState } from 'react'
import type { QuoteRow } from '../domain/quoteEngine'
import type { SalaryBook } from '../domain/salaryExcelModel'
import type { WorkLogEntry, WorkLogState } from '../domain/workLogModel'
import {
  todayYmdLocal,
  DEFAULT_WORK_END,
  DEFAULT_WORK_START,
  mergedWorkItemOptions,
  getDayDocument,
  replaceDayDocument,
  summarizeWorkLogDayDocument,
  effectiveEntriesForCalendar,
  datesWithAnyLogInMonth,
  newSiteBlock,
  countDistinctNamedSites,
  newWorkLogEntityId,
  newWorkLogSiteWorkLine,
  WORK_LOG_INSTRUMENT_OPTIONS,
  instrumentQtyAnyPositive,
  parseInstrumentQtyFromDraftStrings,
} from '../domain/workLogModel'
import {
  buildLinkedDayDraftFromState,
  linkedDayDraftToDayDocument,
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
} from '../domain/payrollDayForWorkLog'
import { QUICK_SITE_JUN_ADJUST, QUICK_SITE_TSAI_ADJUST } from '../domain/fieldworkQuickApply'

const EMPTY_SITE = ''

type Props = {
  workLog: WorkLogState
  setWorkLog: (v: WorkLogState | ((prev: WorkLogState) => WorkLogState)) => void
  siteOptions: readonly { id: string; name: string }[]
  quoteRows: readonly QuoteRow[]
  staffOptions: readonly string[]
  salaryBook: SalaryBook
}

type StaffLineDraft = LinkedDayStaffLineDraft
type BlockDraft = LinkedDayBlockDraft
/** 表單狀態：餐費／雜項為整日；工作內容／儀器／備註與人員在案場區塊；案場／人員與月表連動 */
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

type DayCellSummary = {
  siteLabel: string
  staffCount: number
  staffLabel: string
  workLabel: string
  /** 月表僅預支：月曆格不顯示地點／人數／人員／工作列（仍顯示「預」角標） */
  advanceOnlyMinimalCell?: boolean
  /** 月表該日「預支」列有非零（與出工／日誌分開標示） */
  hasPayrollAdvance?: boolean
}

function aggregateWorkLogEntriesForDay(
  list: WorkLogEntry[],
): Pick<DayCellSummary, 'siteLabel' | 'staffCount' | 'staffLabel' | 'workLabel'> {
  const sites = new Set<string>()
  const staff = new Set<string>()
  const works = new Set<string>()
  for (const e of list) {
    if (e.siteName.trim()) sites.add(e.siteName.trim())
    for (const n of e.staffNames ?? []) {
      if (n.trim()) staff.add(n.trim())
    }
    if (e.workItem.trim()) works.add(e.workItem.trim())
  }
  const staffArr = [...staff].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  const workArr = [...works].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  let workLabel = workArr.join('、') || '—'
  if (list.length > 1) {
    workLabel = workLabel === '—' ? `（${list.length} 筆）` : `${workLabel}（${list.length} 筆）`
  }
  let staffLabel: string
  let staffCount: number
  const distinctSiteKeys = new Set(list.map((e) => e.siteName.trim() || '（無案場）'))
  if (distinctSiteKeys.size > 1) {
    const bySite = new Map<string, Set<string>>()
    for (const e of list) {
      const key = e.siteName.trim() || '（無案場）'
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
      return `${site}：${names.length ? names.join('\n') : '—'}`
    })
    staffLabel = parts.join('\n')
    staffCount = staffArr.length
  } else {
    staffLabel = staffArr.join('\n') || '—'
    staffCount = staffArr.length
  }
  return {
    siteLabel: [...sites].sort((a, b) => a.localeCompare(b, 'zh-Hant')).join('\n') || '—',
    staffCount,
    staffLabel,
    workLabel,
  }
}

export function WorkLogPanel({
  workLog,
  setWorkLog,
  siteOptions,
  quoteRows,
  staffOptions,
  salaryBook,
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
  /** 各工作列「加入選項」輸入暫存（key = block.id:workLine.id） */
  const [blockCustomWorkLine, setBlockCustomWorkLine] = useState<Record<string, string>>({})
  const [formUnlocked, setFormUnlocked] = useState(false)
  /** 全螢幕編輯：月曆格顯示摘要，完整內容於 overlay（可捲、不截斷） */
  const [dayOverlayOpen, setDayOverlayOpen] = useState(false)
  const calendarCompact = useWorklogCalendarCompact()

  useEffect(() => {
    setFormUnlocked(false)
  }, [selectedYmd])

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
    () => mergedWorkItemOptions(quoteRows, workLog.customWorkItemLabels ?? []),
    [quoteRows, workLog.customWorkItemLabels],
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

  const dayCellSummaries = useMemo(() => {
    const p = `${viewYear}-${String(viewMonth).padStart(2, '0')}-`
    const m = new Map<string, DayCellSummary>()
    for (const doc of workLog.dayDocuments ?? []) {
      if (!doc.logDate.startsWith(p)) continue
      const a = summarizeWorkLogDayDocument(doc)
      m.set(doc.logDate, { ...a })
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
            scoped && scoped.staffNames.length > 0
              ? orderStaffNamesForForm(staffOptions, scoped.staffNames).map((name) => ({
                  name,
                  timeStart: DEFAULT_WORK_START,
                  timeEnd: DEFAULT_WORK_END,
                }))
              : b.staffLines.length
                ? b.staffLines
                : [{ name: '', timeStart: DEFAULT_WORK_START, timeEnd: DEFAULT_WORK_END }]
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
    const namedLines: { blockIdx: number; name: string }[] = []
    for (let bi = 0; bi < dayDraft.blocks.length; bi++) {
      for (const ln of dayDraft.blocks[bi].staffLines) {
        if (ln.name.trim()) namedLines.push({ blockIdx: bi, name: ln.name.trim() })
      }
    }
    if (namedLines.length === 0) {
      window.alert('請至少於某一案場區塊新增一位施工人員（姓名）。')
      return
    }
    const seen = new Set<string>()
    for (const { blockIdx, name } of namedLines) {
      const site = dayDraft.blocks[blockIdx].siteName.trim() || ''
      const key = `${site}\0${name}`
      if (seen.has(key)) {
        window.alert(`案場「${site || '（未填）'}」內，${name} 重複；同人同場請併成一列。`)
        return
      }
      seen.add(key)
    }
    const existing = getDayDocument(workLog, dayDraft.logDate)
    const doc = linkedDayDraftToDayDocument(dayDraft, existing)
    setWorkLog((w) => {
      const next = replaceDayDocument(w, doc)
      queueMicrotask(() =>
        setDayDraft(buildLinkedDayDraftFromState(doc.logDate, next, salaryBook, staffOptions)),
      )
      return next
    })
    setFormUnlocked(false)
  }, [dayDraft, formUnlocked, setWorkLog, workLog])

  const addCustomWorkItemForBlock = useCallback(
    (blockIdx: number, lineIdx: number) => {
      const block = dayDraft.blocks[blockIdx]
      if (!block) return
      const wl = block.workLines[lineIdx]
      if (!wl) return
      const key = `${block.id}:${wl.id}`
      const v = (blockCustomWorkLine[key] ?? '').trim()
      if (!v) return
      setWorkLog((w) => {
        const cur = w.customWorkItemLabels ?? []
        if (cur.includes(v)) return w
        return { ...w, customWorkItemLabels: [...cur, v].sort((a, b) => a.localeCompare(b, 'zh-Hant')) }
      })
      setDayDraft((d) => ({
        ...d,
        blocks: d.blocks.map((b, i) =>
          i === blockIdx
            ? {
                ...b,
                workLines: b.workLines.map((w, j) => (j !== lineIdx ? w : { ...w, label: v })),
              }
            : b,
        ),
      }))
      setBlockCustomWorkLine((m) => {
        const next = { ...m }
        delete next[key]
        return next
      })
    },
    [blockCustomWorkLine, dayDraft.blocks, setWorkLog],
  )

  const addWorkLine = useCallback((blockIdx: number) => {
    setDayDraft((d) => ({
      ...d,
      blocks: d.blocks.map((b, i) =>
        i === blockIdx
          ? {
              ...b,
              workLines: [
                ...(b.workLines?.length ? b.workLines : [newWorkLogSiteWorkLine()]),
                { id: newWorkLogEntityId(), label: '' },
              ],
            }
          : b,
      ),
    }))
  }, [])

  const removeWorkLine = useCallback((blockIdx: number, lineIdx: number) => {
    setDayDraft((d) => ({
      ...d,
      blocks: d.blocks.map((b, i) => {
        if (i !== blockIdx) return b
        const lines = b.workLines?.length ? b.workLines : [newWorkLogSiteWorkLine()]
        if (lines.length <= 1) return { ...b, workLines: [newWorkLogSiteWorkLine()] }
        return { ...b, workLines: lines.filter((_, j) => j !== lineIdx) }
      }),
    }))
  }, [])

  const addBlock = useCallback(() => {
    const nb = newSiteBlock()
    setDayDraft((d) => ({
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
          staffLines: nb.staffLines.map((x) => ({ ...x })),
        },
      ],
    }))
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
                { name: '', timeStart: DEFAULT_WORK_START, timeEnd: DEFAULT_WORK_END },
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

  return (
    <div className="panel">
      <h2>工作日誌</h2>
      <p className="hint" style={{ marginBottom: 14 }}>
        {calendarCompact ? (
          <>
            <strong>月曆</strong>於窄螢幕僅以<strong>記號</strong>顯示是否有<strong>日誌</strong>與<strong>預支</strong>；完整摘要與編輯請<strong>點選日期</strong>開<strong>全螢幕</strong>（內文不截斷）。案場／人員／
          </>
        ) : (
          <>
            <strong>月曆</strong>顯示當日摘要（地點／人數／人員／工作）；格內過長可<strong>上下捲動</strong>，完整編輯請<strong>點選日期</strong>開<strong>全螢幕</strong>（內文不截斷）。案場／人員／
          </>
        )}
        <strong>餐費</strong>以<strong>薪水月表</strong>為準並自動帶入（鎖定時隨月表同步）；<strong>工作內容、儀器、備註</strong>依<strong>案場區塊</strong>填寫，<strong>餐費與雜項</strong>為<strong>整日一筆</strong>。表單預設<strong>鎖定</strong>。與公司帳、快速登記連動；工作內容選項<strong>參考</strong>放樣估價之細項字串（儲存為純文字）。
      </p>

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
                  setFormUnlocked(false)
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
            <button type="button" className="btn" onClick={() => setDayOverlayOpen(true)}>
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

          <div className="worklogDayInfoField">
            <span className="worklogDayInfoLabel">
              <span className="worklogDayInfoNum" aria-hidden>
                1
              </span>
              記錄幾月幾號
            </span>
            <p className="worklogDayInfoZhDate">
              {formatYmdChinese(dayDraft.logDate)}
              <span className="muted">（{dayDraft.logDate}）</span>
            </p>
            <input
              type="date"
              className="titleInput"
              disabled={!formUnlocked}
              value={dayDraft.logDate}
              onChange={(e) => {
                const v = e.target.value
                if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
                  setDayDraft((d) => ({ ...d, logDate: v }))
                  return
                }
                setSelectedYmd(v)
                jumpCalendarToYmd(v)
                setFormUnlocked(false)
                setDayDraft(buildLinkedDayDraftFromState(v, workLog, salaryBook, staffOptions))
              }}
            />
          </div>

          <datalist id="worklog-workitem-list">
            {workItemOptions.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>

          <div className={`worklogSharedDayFields${multiSiteMode ? ' worklogSharedDayFields--multi' : ''}`}>
            <p className="worklogSharedDayFieldsTitle">當日共用（餐費、雜項）</p>
            <div className="worklogFormGrid" style={{ marginTop: 4 }}>
              <label className="worklogFormLabel">
                <span className="worklogDayInfoLabel">
                  <span className="worklogDayInfoNum" aria-hidden>
                    2
                  </span>
                  餐費（元）
                </span>
                <input
                  type="number"
                  className="titleInput"
                  disabled={!formUnlocked}
                  value={dayDraft.mealCost}
                  onChange={(e) => setDayDraft((d) => ({ ...d, mealCost: e.target.value }))}
                  placeholder="0"
                />
              </label>
              <label className="worklogFormLabel">
                <span className="worklogDayInfoLabel">
                  <span className="worklogDayInfoNum" aria-hidden>
                    3
                  </span>
                  雜項支出（元）
                </span>
                <input
                  type="number"
                  className="titleInput"
                  disabled={!formUnlocked}
                  value={dayDraft.miscCost}
                  onChange={(e) => setDayDraft((d) => ({ ...d, miscCost: e.target.value }))}
                  placeholder="0"
                />
              </label>
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
              <div className="worklogSiteBlockHead">
                <span className="worklogSiteBlockTitle">
                  案場區塊 {bi + 1}
                  {multiSiteMode ? <span className="muted">（多案場模式）</span> : null}
                </span>
                {dayDraft.blocks.length > 1 ? (
                  <button
                    type="button"
                    className="btn secondary ghost"
                    disabled={!formUnlocked}
                    onClick={() => removeBlock(bi)}
                  >
                    移除此區塊
                  </button>
                ) : null}
              </div>
              <label className="worklogFormLabel" style={{ margin: '0 0 10px', width: '100%' }}>
                <span className="worklogDayInfoLabel">案場地點</span>
                <select
                  className="titleInput"
                  disabled={!formUnlocked}
                  value={block.siteName ? block.siteName : EMPTY_SITE}
                  onChange={(e) => fixApplyBlockSite(bi, e.target.value)}
                >
                  <option value={EMPTY_SITE}>請選擇</option>
                  {siteChoices.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="worklogDayInfoField" style={{ marginTop: 12 }}>
                <span className="worklogDayInfoLabel">
                  工作內容（本案場，可多列）
                </span>
                <div className="btnRow" style={{ marginTop: 8, marginBottom: 10 }}>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={!formUnlocked}
                    onClick={() => addWorkLine(bi)}
                  >
                    新增工作列
                  </button>
                </div>
                {(block.workLines?.length ? block.workLines : [newWorkLogSiteWorkLine()]).map((wl, li) => {
                  const customKey = `${block.id}:${wl.id}`
                  return (
                    <div
                      key={wl.id}
                      className="worklogWorkLineBlock"
                      style={{
                        marginBottom: 12,
                        paddingBottom: 12,
                        borderBottom: '1px solid var(--border, #e8e8e8)',
                      }}
                    >
                      <label className="worklogFormLabel" style={{ margin: 0, width: '100%' }}>
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
                      <div className="worklogCustomItemRow" style={{ marginTop: 8 }}>
                        <input
                          type="text"
                          className="titleInput"
                          disabled={!formUnlocked}
                          placeholder="新增自訂選項到清單"
                          value={blockCustomWorkLine[customKey] ?? ''}
                          onChange={(e) =>
                            setBlockCustomWorkLine((m) => ({ ...m, [customKey]: e.target.value }))
                          }
                        />
                        <button
                          type="button"
                          className="btn secondary"
                          disabled={!formUnlocked}
                          onClick={() => addCustomWorkItemForBlock(bi, li)}
                        >
                          加入選項
                        </button>
                      </div>
                      <div className="btnRow" style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="btn secondary ghost"
                          disabled={!formUnlocked}
                          onClick={() => removeWorkLine(bi, li)}
                        >
                          刪除此工作列
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="worklogDayInfoField">
                <span className="worklogDayInfoLabel">使用儀器（本案場）</span>
                <p className="hint muted" style={{ margin: '6px 0 10px', fontSize: 13 }}>
                  僅三種：全站儀、旋轉雷射、墨線儀。請填<strong>台數</strong>（0 或空白＝未使用）；有使用才填數量。
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
                          type="number"
                          min={0}
                          max={999}
                          step={1}
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
              <label className="worklogFormLabel worklogDayInfoField" style={{ marginTop: 8 }}>
                <span className="worklogDayInfoLabel">備註（本案場）</span>
                <textarea
                  className="worklogTextarea"
                  disabled={!formUnlocked}
                  value={block.remark}
                  onChange={(e) =>
                    setDayDraft((d) => ({
                      ...d,
                      blocks: d.blocks.map((b, i) =>
                        i !== bi ? b : { ...b, remark: e.target.value },
                      ),
                    }))
                  }
                  rows={4}
                  placeholder="現場狀況、待辦、交接…"
                />
              </label>
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

          <div className="btnRow" style={{ marginTop: 12 }}>
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
