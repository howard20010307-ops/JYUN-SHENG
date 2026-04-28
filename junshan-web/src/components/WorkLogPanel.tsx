import { useCallback, useEffect, useMemo, useState } from 'react'
import type { QuoteRow } from '../domain/quoteEngine'
import type { MonthKey, MonthLine } from '../domain/ledgerEngine'
import type { SalaryBook } from '../domain/salaryExcelModel'
import type { WorkLogEntry, WorkLogState } from '../domain/workLogModel'
import {
  newWorkLogEntry,
  nowIso,
  sortWorkLogEntries,
  todayYmdLocal,
  DEFAULT_WORK_END,
  DEFAULT_WORK_START,
  buildWorkLogContentSummary,
  mergedWorkItemOptions,
  entriesForDate,
  datesWithEntriesInMonth,
} from '../domain/workLogModel'
import {
  buildPayrollDaySnapshot,
  datesWithPayrollActivityInCalendarMonth,
  payrollCalendarCellSummary,
  payrollStaffMealForFormSite,
  prefillFromPayrollDaySnapshot,
} from '../domain/payrollDayForWorkLog'
import {
  QUICK_SITE_JUN_ADJUST,
  QUICK_SITE_TSAI_ADJUST,
} from '../domain/fieldworkQuickApply'

const EMPTY_SITE = ''

type Props = {
  workLog: WorkLogState
  setWorkLog: (v: WorkLogState | ((prev: WorkLogState) => WorkLogState)) => void
  siteOptions: readonly { id: string; name: string }[]
  quoteRows: readonly QuoteRow[]
  staffOptions: readonly string[]
  /** 薪水月表：與日曆／表單連動 */
  salaryBook: SalaryBook
  /** 公司帳月度列（2–12 月）；與選定日期所屬月份對齊（無選日時依月曆檢視月） */
  ledgerMonths?: readonly MonthLine[]
}

type DraftForm = {
  id: string | null
  logDate: string
  staffNames: string[]
  timeStart: string
  timeEnd: string
  siteName: string
  workItem: string
  equipment: string
  mealCost: string
  miscCost: string
  remark: string
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate()
}

/** 週日為第一欄，共 6 列 × 7 欄 */
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

/** 顯示用：2026-04-27 → 2026年4月27日 */
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

/** 月表帶入人員：先依主選單順序，其餘附後 */
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
  source: 'worklog' | 'payroll'
}

function aggregateWorkLogEntriesForDay(list: WorkLogEntry[]): Omit<DayCellSummary, 'source'> {
  const sites = new Set<string>()
  const staff = new Set<string>()
  const works = new Set<string>()
  for (const e of list) {
    if (e.siteName.trim()) sites.add(e.siteName.trim())
    for (const n of e.staffNames) {
      if (n.trim()) staff.add(n.trim())
    }
    if (e.workItem.trim()) works.add(e.workItem.trim())
  }
  const staffArr = [...staff].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  const workArr = [...works].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  let workLabel = workArr.join('、') || '—'
  if (list.length > 1) {
    workLabel = workLabel === '—' ? `（${list.length} 筆日誌）` : `${workLabel}（${list.length} 筆）`
  }

  let staffLabel: string
  let staffCount: number
  if (list.length > 1) {
    const bySite = new Map<string, Set<string>>()
    for (const e of list) {
      const key = e.siteName.trim() || '（無案場）'
      let set = bySite.get(key)
      if (!set) {
        set = new Set()
        bySite.set(key, set)
      }
      for (const n of e.staffNames) {
        if (n.trim()) set.add(n.trim())
      }
    }
    const siteKeys = [...bySite.keys()].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
    const parts = siteKeys.map((site) => {
      const names = [...(bySite.get(site) ?? [])].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
      return `${site}：${names.length ? names.join('、') : '—'}`
    })
    staffLabel = parts.join('； ')
    staffCount = staffArr.length
  } else {
    staffLabel = staffArr.join('、') || '—'
    staffCount = staffArr.length
  }

  return {
    siteLabel: [...sites].join('、') || '—',
    staffCount,
    staffLabel,
    workLabel,
  }
}

function parseMoney(s: string): number {
  const n = parseFloat(s.trim())
  return Number.isFinite(n) ? n : 0
}

function emptyDraft(logDate: string): DraftForm {
  return {
    id: null,
    logDate,
    staffNames: [],
    timeStart: DEFAULT_WORK_START,
    timeEnd: DEFAULT_WORK_END,
    siteName: '',
    workItem: '',
    equipment: '',
    mealCost: '',
    miscCost: '',
    remark: '',
  }
}

function entryToDraft(e: WorkLogEntry): DraftForm {
  return {
    id: e.id,
    logDate: e.logDate,
    staffNames: [...e.staffNames],
    timeStart: e.timeStart,
    timeEnd: e.timeEnd,
    siteName: e.siteName,
    workItem: e.workItem,
    equipment: e.equipment,
    mealCost: e.mealCost === 0 ? '' : String(e.mealCost),
    miscCost: e.miscCost === 0 ? '' : String(e.miscCost),
    remark: e.remark,
  }
}

/** 新增一筆：以月表該日為基準（人員、餐費加總、案場）；備註預設空白；無該日於月表則空白欄 */
function newDraftWithPayrollForDay(
  book: SalaryBook,
  ymd: string,
  staffOptionsOrdered: readonly string[],
): DraftForm {
  const base = emptyDraft(ymd)
  const snap = buildPayrollDaySnapshot(book, ymd)
  if (!snap) return base
  const p = prefillFromPayrollDaySnapshot(snap)
  const ordered = orderStaffNamesForForm(staffOptionsOrdered, p.staffNames)
  return {
    ...base,
    staffNames: ordered,
    mealCost: p.mealCost === 0 ? '' : String(p.mealCost),
    siteName: p.siteName,
    remark: '',
  }
}

export function WorkLogPanel({
  workLog,
  setWorkLog,
  siteOptions,
  quoteRows,
  staffOptions,
  salaryBook,
  ledgerMonths,
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
  const [draft, setDraft] = useState<DraftForm>(() =>
    newDraftWithPayrollForDay(salaryBook, today, staffOptions),
  )
  const [newCustomItem, setNewCustomItem] = useState('')
  /** 預設鎖定：解鎖後才可改欄位與儲存 */
  const [formUnlocked, setFormUnlocked] = useState(false)

  useEffect(() => {
    setFormUnlocked(false)
  }, [selectedYmd])

  /** 與表單「記錄幾月幾號」同日之月表帶入（多案場提示、案場選單合併用） */
  const payrollDayPrefill = useMemo(() => {
    const ymd = (draft.logDate || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
    const snap = buildPayrollDaySnapshot(salaryBook, ymd)
    return snap ? prefillFromPayrollDaySnapshot(snap) : null
  }, [salaryBook, draft.logDate])

  /** 案場下拉：估價／月表累積案名 ＋ 本選定日格線有出工之案名（同日多場必出現在選單） */
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
    const draftSite = draft.siteName.trim()
    if (draftSite) s.add(draftSite)
    return [...s].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  }, [siteOptions, payrollDayPrefill, draft.siteName])

  const workItemOptions = useMemo(
    () => mergedWorkItemOptions(quoteRows, workLog.customWorkItemLabels ?? []),
    [quoteRows, workLog.customWorkItemLabels],
  )

  const datesWithPayroll = useMemo(
    () => datesWithPayrollActivityInCalendarMonth(salaryBook, viewYear, viewMonth),
    [salaryBook, viewYear, viewMonth],
  )

  const ledgerDisplayMonth = useMemo(() => {
    const iso =
      draft.logDate && /^\d{4}-\d{2}-\d{2}$/.test(draft.logDate.trim())
        ? draft.logDate.trim()
        : selectedYmd
    if (iso) {
      const p = partsFromYmdStrict(iso)
      if (p) return p.m
    }
    return viewMonth
  }, [draft.logDate, selectedYmd, viewMonth])

  const ledgerRowForContext = useMemo(() => {
    if (!ledgerMonths?.length || ledgerDisplayMonth < 2 || ledgerDisplayMonth > 12) return null
    const key = String(ledgerDisplayMonth) as MonthKey
    return ledgerMonths.find((m) => m.month === key) ?? null
  }, [ledgerMonths, ledgerDisplayMonth])

  const datesWithLog = useMemo(
    () => datesWithEntriesInMonth(workLog.entries, viewYear, viewMonth),
    [workLog.entries, viewYear, viewMonth],
  )

  const calCells = useMemo(
    () => calendarDayCells(viewYear, viewMonth),
    [viewYear, viewMonth],
  )

  const dayCellSummaries = useMemo(() => {
    const p = `${viewYear}-${String(viewMonth).padStart(2, '0')}-`
    const byDate = new Map<string, WorkLogEntry[]>()
    for (const e of workLog.entries) {
      if (!e.logDate.startsWith(p)) continue
      const arr = byDate.get(e.logDate) ?? []
      arr.push(e)
      byDate.set(e.logDate, arr)
    }
    const m = new Map<string, DayCellSummary>()
    for (const [ymd, list] of byDate) {
      const a = aggregateWorkLogEntriesForDay(list)
      m.set(ymd, { ...a, source: 'worklog' })
    }
    const dim = daysInMonth(viewYear, viewMonth)
    for (let day = 1; day <= dim; day++) {
      const iso = ymd(viewYear, viewMonth, day)
      if (m.has(iso)) continue
      if (!datesWithPayroll.has(iso)) continue
      const sn = buildPayrollDaySnapshot(salaryBook, iso)
      if (!sn) continue
      const pSum = payrollCalendarCellSummary(sn)
      m.set(iso, { ...pSum, source: 'payroll' })
    }
    return m
  }, [workLog.entries, viewYear, viewMonth, datesWithPayroll, salaryBook])

  const dayEntries = useMemo(() => {
    if (!selectedYmd) return []
    return sortWorkLogEntries(entriesForDate(workLog.entries, selectedYmd))
  }, [workLog.entries, selectedYmd])

  const dayEntriesForPicker = useMemo(() => {
    if (!draft.id) return dayEntries
    if (dayEntries.some((e) => e.id === draft.id)) return dayEntries
    const saved = workLog.entries.find((e) => e.id === draft.id)
    if (!saved) return dayEntries
    return sortWorkLogEntries([saved, ...dayEntries])
  }, [dayEntries, draft.id, workLog.entries])

  const selectedInCalendarView = useMemo(() => {
    if (!selectedYmd) return true
    const p = partsFromYmdStrict(selectedYmd)
    if (!p) return true
    return p.y === viewYear && p.m === viewMonth
  }, [selectedYmd, viewYear, viewMonth])

  const isEditing = draft.id != null

  const resetDraftForDay = useCallback(
    (ymd: string) => {
      setDraft(newDraftWithPayrollForDay(salaryBook, ymd, staffOptions))
      setFormUnlocked(false)
    },
    [salaryBook, staffOptions],
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

  const toggleStaff = useCallback((name: string) => {
    setDraft((d) => {
      const set = new Set(d.staffNames)
      if (set.has(name)) set.delete(name)
      else set.add(name)
      const ordered = staffOptions.filter((n) => set.has(n))
      const extras = d.staffNames.filter((n) => !staffOptions.includes(n))
      return { ...d, staffNames: [...ordered, ...extras] }
    })
  }, [staffOptions])

  /** 解鎖後切換案場：依月表重算該案場格線人員與餐費（同日多場不混人） */
  const onWorkLogSiteChange = useCallback(
    (nextRaw: string) => {
      const nextSite = nextRaw === EMPTY_SITE ? '' : nextRaw
      setDraft((d) => {
        const snap = buildPayrollDaySnapshot(salaryBook, d.logDate)
        if (!snap) return { ...d, siteName: nextSite }
        const scoped = payrollStaffMealForFormSite(snap, nextSite)
        if (!scoped) return { ...d, siteName: nextSite }
        return {
          ...d,
          siteName: nextSite,
          staffNames: orderStaffNamesForForm(staffOptions, scoped.staffNames),
          mealCost: scoped.mealCost === 0 ? '' : String(scoped.mealCost),
        }
      })
    },
    [salaryBook, staffOptions],
  )

  const onSave = useCallback(() => {
    if (!formUnlocked) return
    const t = nowIso()
    if (!draft.logDate) {
      window.alert('請選擇日期。')
      return
    }
    const meal = parseMoney(draft.mealCost)
    const misc = parseMoney(draft.miscCost)
    const base = {
      logDate: draft.logDate,
      siteName: draft.siteName.trim(),
      staffNames: draft.staffNames.filter(Boolean),
      timeStart: toHhmm24(draft.timeStart, DEFAULT_WORK_START),
      timeEnd: toHhmm24(draft.timeEnd, DEFAULT_WORK_END),
      workItem: draft.workItem.trim(),
      equipment: draft.equipment.trim(),
      mealCost: meal,
      miscCost: misc,
      remark: draft.remark.trim(),
    }
    const content = buildWorkLogContentSummary({
      staffNames: base.staffNames,
      siteName: base.siteName,
      workItem: base.workItem,
      remark: base.remark,
    })
    if (draft.id) {
      setWorkLog((w) => ({
        ...w,
        entries: w.entries.map((x) =>
          x.id === draft.id
            ? {
                ...x,
                ...base,
                content,
                updatedAt: t,
              }
            : x,
        ),
      }))
    } else {
      setWorkLog((w) => ({
        ...w,
        entries: [
          ...w.entries,
          newWorkLogEntry({
            ...base,
            content,
          }),
        ],
      }))
    }
    resetDraftForDay(draft.logDate)
  }, [draft, formUnlocked, setWorkLog, resetDraftForDay])

  const addCustomWorkItem = useCallback(() => {
    const v = newCustomItem.trim()
    if (!v) return
    setWorkLog((w) => {
      const cur = w.customWorkItemLabels ?? []
      if (cur.includes(v)) return w
      return { ...w, customWorkItemLabels: [...cur, v].sort((a, b) => a.localeCompare(b, 'zh-Hant')) }
    })
    setDraft((d) => ({ ...d, workItem: v }))
    setNewCustomItem('')
  }, [newCustomItem, setWorkLog])

  return (
    <div className="panel">
      <h2>工作日誌</h2>
      <p className="hint" style={{ marginBottom: 14 }}>
        依<strong>月曆</strong>選日並編輯日誌；選日後欄位依<strong>薪水月表該日</strong>帶入（<strong>案場</strong>與該場<strong>格線人員／餐費</strong>；同日多案場請<strong>分筆</strong>，一人跑多場亦請分筆；備註空白）。表單預設<strong>鎖定</strong>，請用月曆列右側「<strong>解鎖編輯</strong>」後再改。與<strong>公司帳</strong>、<strong>快速登記</strong>、<strong>估價細項</strong>連動。
      </p>

      <section className="card worklogCalendarCard">
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
          {selectedYmd ? (
            <div className="worklogMonthNavLock">
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
          ) : null}
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
            const hasPayroll = datesWithPayroll.has(cellYmd)
            const isSel = selectedYmd === cellYmd
            const isToday = cellYmd === today
            const cellSum = dayCellSummaries.get(cellYmd)
            return (
              <button
                key={cellYmd}
                type="button"
                className={`worklogDayCell${hasLog ? ' worklogDayCell--hasLog' : ''}${hasPayroll ? ' worklogDayCell--hasPayroll' : ''}${isSel ? ' worklogDayCell--selected' : ''}${isToday ? ' worklogDayCell--today' : ''}`}
                onClick={() => {
                  setSelectedYmd(cellYmd)
                  resetDraftForDay(cellYmd)
                }}
              >
                <div className="worklogDayCellTop">
                  <span className="worklogDayNum">{day}</span>
                  <span className="worklogDayDots" aria-hidden>
                    {hasLog ? <span className="worklogDayDot worklogDayDot--log" title="有日誌" /> : null}
                    {hasPayroll ? (
                      <span className="worklogDayDot worklogDayDot--payroll" title="月表有資料" />
                    ) : null}
                  </span>
                </div>
                {cellSum ? (
                  <div
                    className={`worklogDayCellBody${cellSum.source === 'payroll' ? ' worklogDayCellBody--payroll' : ''}`}
                  >
                    <div className="worklogDayCellLine" title={`地點：${cellSum.siteLabel}`}>
                      <span className="worklogDayCellK">地點</span>
                      <span className="worklogDayCellV">{cellSum.siteLabel}</span>
                    </div>
                    <div
                      className="worklogDayCellLine worklogDayCellLine--count"
                      title={`施工人數（不重複人數）：${cellSum.staffCount}`}
                    >
                      <span className="worklogDayCellK">人數</span>
                      <span className="worklogDayCellV">{cellSum.staffCount}</span>
                    </div>
                    <div className="worklogDayCellLine" title={`施工人員：${cellSum.staffLabel}`}>
                      <span className="worklogDayCellK">人員</span>
                      <span className="worklogDayCellV">{cellSum.staffLabel}</span>
                    </div>
                    <div className="worklogDayCellLine" title={`工作內容：${cellSum.workLabel}`}>
                      <span className="worklogDayCellK">工作內容</span>
                      <span className="worklogDayCellV">{cellSum.workLabel}</span>
                    </div>
                  </div>
                ) : null}
              </button>
            )
          })}
        </div>
        <p className="hint worklogCalLegend">
          <span className="worklogDayDot worklogDayDot--log" /> 有日誌
          <span style={{ width: 8, display: 'inline-block' }} />
          <span className="worklogDayDot worklogDayDot--payroll" /> 薪水月表當日有紀錄
        </p>
        {selectedYmd && !selectedInCalendarView ? (
          <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
            目前選取為 <strong>{formatYmdChinese(selectedYmd)}</strong>，不在此月曆月份。{' '}
            <button
              type="button"
              className="btn secondary"
              onClick={() => jumpCalendarToYmd(selectedYmd)}
            >
              切到此月
            </button>
          </p>
        ) : null}
      </section>

      {selectedYmd ? (
        <section className="card worklogForm worklogDayInfoCard">
          <h3 className="sr-only">日誌欄位</h3>
          <label className="worklogFormLabel worklogDayInfoField worklogDayInfoField--picker">
            <span className="sr-only">此日記錄（選擇一筆或新增）</span>
            <select
              className="titleInput"
              aria-label="此日記錄，選擇一筆或新增"
              value={draft.id ?? '__new__'}
              onChange={(e) => {
                const v = e.target.value
                if (v === '__new__') resetDraftForDay(selectedYmd)
                else {
                  const ent = dayEntriesForPicker.find((x) => x.id === v)
                  if (ent) {
                    setDraft(entryToDraft(ent))
                    setSelectedYmd(ent.logDate)
                    jumpCalendarToYmd(ent.logDate)
                  }
                }
                setFormUnlocked(false)
              }}
            >
              <option value="__new__">新增一筆</option>
              {sortWorkLogEntries(dayEntriesForPicker).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.timeStart}–{e.timeEnd} · {e.siteName.trim() || '無案場'} · {e.staffNames.length} 人
                  {e.workItem.trim() ? ` · ${e.workItem.trim().slice(0, 12)}${e.workItem.trim().length > 12 ? '…' : ''}` : ''}
                </option>
              ))}
            </select>
          </label>

          <div className="worklogDayInfoField">
            <span className="worklogDayInfoLabel">
              <span className="worklogDayInfoNum" aria-hidden>
                1
              </span>
              記錄幾月幾號
            </span>
            <p className="worklogDayInfoZhDate">
              {formatYmdChinese(draft.logDate)}
              <span className="muted">（{draft.logDate}）</span>
            </p>
            <input
              type="date"
              className="titleInput"
              disabled={!formUnlocked}
              value={draft.logDate}
              onChange={(e) => {
                const v = e.target.value
                if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
                  setDraft((d) => ({ ...d, logDate: v }))
                  return
                }
                setSelectedYmd(v)
                jumpCalendarToYmd(v)
                setFormUnlocked(false)
                setDraft((d) => {
                  if (d.id != null) return { ...d, logDate: v }
                  return newDraftWithPayrollForDay(salaryBook, v, staffOptions)
                })
              }}
            />
          </div>

          <div className="worklogDayInfoField worklogStaffBlock">
            <span className="worklogDayInfoLabel">
              <span className="worklogDayInfoNum" aria-hidden>
                2
              </span>
              施工人員有誰，總共幾個
              <span className="worklogDayInfoCount">（共 {draft.staffNames.length} 人）</span>
            </span>
            <div className="worklogStaffChecks">
              {staffOptions.map((name) => (
                <label key={name} className="rowCheck">
                  <input
                    type="checkbox"
                    disabled={!formUnlocked}
                    checked={draft.staffNames.includes(name)}
                    onChange={() => toggleStaff(name)}
                  />
                  {name}
                </label>
              ))}
            </div>
          </div>

          <div className="worklogDayInfoField">
            <span className="worklogDayInfoLabel">
              <span className="worklogDayInfoNum" aria-hidden>
                3
              </span>
              幾點上班（預設 7:30）、幾點下班（預設 16:30）
            </span>
            <span className="worklogTimePair">
              <input
                type="time"
                disabled={!formUnlocked}
                value={toHhmm24(draft.timeStart, DEFAULT_WORK_START)}
                onChange={(e) => setDraft((d) => ({ ...d, timeStart: e.target.value }))}
              />
              <span className="muted">～</span>
              <input
                type="time"
                disabled={!formUnlocked}
                value={toHhmm24(draft.timeEnd, DEFAULT_WORK_END)}
                onChange={(e) => setDraft((d) => ({ ...d, timeEnd: e.target.value }))}
              />
            </span>
          </div>

          <div className="worklogDayInfoField">
            <label className="worklogFormLabel" style={{ margin: 0, width: '100%' }}>
              <span className="worklogDayInfoLabel">
                <span className="worklogDayInfoNum" aria-hidden>
                  4
                </span>
                案場地點（月表多場時人員／餐費依本案場；一般案場、調工支援、蔡董調工）
              </span>
              <select
                className="titleInput"
                disabled={!formUnlocked}
                value={draft.siteName ? draft.siteName : EMPTY_SITE}
                onChange={(e) => onWorkLogSiteChange(e.target.value)}
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
              <p className="hint muted" style={{ marginTop: 8, marginBottom: 0 }}>
                月表<strong>本日</strong>有 {payrollDayPrefill.siteNamesWithWork.length}{' '}
                個案場出工（{payrollDayPrefill.siteNamesWithWork.join('、')}）。日誌請<strong>依案場分筆儲存</strong>
                （一案場一筆；不同人去不同場、或同一人跑多場，皆建議分筆）。預選第一案場；<strong>解鎖後改選案場</strong>
                會依月表<strong>重算該場施工人員與餐費</strong>。完成一筆後用「新增一筆」再選下一案場即可。
              </p>
            ) : null}
            {payrollDayPrefill?.hasUnnamedSiteWork ? (
              <p className="hint muted" style={{ marginTop: 8, marginBottom: 0 }}>
                月表含<strong>未命名案場</strong>格線有出工，請至月表補案名，或於此手動選擇／輸入地點（必要時先將該案名加入估價或案場清單）。
              </p>
            ) : null}
          </div>

          <div className="worklogDayInfoField">
            <label className="worklogFormLabel" style={{ margin: 0, width: '100%' }}>
              <span className="worklogDayInfoLabel">
                <span className="worklogDayInfoNum" aria-hidden>
                  5
                </span>
                工作內容（選項來自放樣估價細項，可另新增選項）
              </span>
              <input
                className="titleInput"
                disabled={!formUnlocked}
                list="worklog-workitem-list"
                value={draft.workItem}
                onChange={(e) => setDraft((d) => ({ ...d, workItem: e.target.value }))}
                placeholder="選擇或輸入"
              />
              <datalist id="worklog-workitem-list">
                {workItemOptions.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </label>
          </div>
          <div className="worklogCustomItemRow">
            <input
              type="text"
              className="titleInput"
              disabled={!formUnlocked}
              placeholder="新增自訂選項到清單"
              value={newCustomItem}
              onChange={(e) => setNewCustomItem(e.target.value)}
            />
            <button type="button" className="btn secondary" disabled={!formUnlocked} onClick={addCustomWorkItem}>
              加入選項
            </button>
          </div>

          <div className="worklogDayInfoField">
            <label className="worklogFormLabel" style={{ margin: 0, width: '100%' }}>
              <span className="worklogDayInfoLabel">
                <span className="worklogDayInfoNum" aria-hidden>
                  6
                </span>
                使用儀器
              </span>
              <input
                className="titleInput"
                disabled={!formUnlocked}
                value={draft.equipment}
                onChange={(e) => setDraft((d) => ({ ...d, equipment: e.target.value }))}
                placeholder="例如：全站、墨線儀…"
              />
            </label>
          </div>

          <div className="worklogFormGrid" style={{ marginTop: 4 }}>
            <label className="worklogFormLabel">
              <span className="worklogDayInfoLabel">
                <span className="worklogDayInfoNum" aria-hidden>
                  7
                </span>
                餐費（元）
              </span>
              <input
                type="number"
                className="titleInput"
                disabled={!formUnlocked}
                value={draft.mealCost}
                onChange={(e) => setDraft((d) => ({ ...d, mealCost: e.target.value }))}
                placeholder="0"
              />
            </label>
            <label className="worklogFormLabel">
              <span className="worklogDayInfoLabel">
                <span className="worklogDayInfoNum" aria-hidden>
                  8
                </span>
                雜項支出（元）
              </span>
              <input
                type="number"
                className="titleInput"
                disabled={!formUnlocked}
                value={draft.miscCost}
                onChange={(e) => setDraft((d) => ({ ...d, miscCost: e.target.value }))}
                placeholder="0"
              />
            </label>
          </div>

          <label className="worklogFormLabel worklogDayInfoField" style={{ marginTop: 8 }}>
            <span className="worklogDayInfoLabel">
              <span className="worklogDayInfoNum" aria-hidden>
                9
              </span>
              備註資訊（紀錄詳細內容）
            </span>
            <textarea
              className="worklogTextarea"
              disabled={!formUnlocked}
              value={draft.remark}
              onChange={(e) => setDraft((d) => ({ ...d, remark: e.target.value }))}
              rows={5}
              placeholder="現場狀況、待辦、交接…"
            />
          </label>

          {ledgerRowForContext ? (
            <p className="hint worklogLedgerHint" style={{ marginTop: 10 }}>
              公司帳 <strong>{ledgerDisplayMonth} 月</strong>列（整月累計，非單日）：薪資 {ledgerRowForContext.salary}、加班{' '}
              {ledgerRowForContext.overtimePay}、餐費 {ledgerRowForContext.meals}、工具／雜項{' '}
              {ledgerRowForContext.tools}、蔡董薪 {ledgerRowForContext.bossSalary}、儀器{' '}
              {ledgerRowForContext.instrument}、風險金 {ledgerRowForContext.risk}、工程款（未稅）{' '}
              {ledgerRowForContext.revenueNet}、稅 {ledgerRowForContext.tax}
            </p>
          ) : ledgerDisplayMonth === 1 ? (
            <p className="hint worklogLedgerHint" style={{ marginTop: 10 }}>
              公司帳目前僅有 2–12 月列，1 月無對應列。
            </p>
          ) : null}

          <div className="btnRow" style={{ marginTop: 12 }}>
            <button type="button" className="btn" disabled={!formUnlocked} onClick={onSave}>
              {isEditing ? '儲存變更' : '新增儲存'}
            </button>
            {isEditing ? (
              <button
                type="button"
                className="btn secondary"
                onClick={() => resetDraftForDay(draft.logDate)}
              >
                取消編輯
              </button>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="card worklogForm worklogDayInfoCard">
          <p className="hint" style={{ margin: '0 0 8px' }}>
            請先在月曆選擇日期；選日後可於此編輯日誌。
          </p>
        </section>
      )}

    </div>
  )
}
