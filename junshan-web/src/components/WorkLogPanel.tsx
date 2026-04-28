import { useCallback, useMemo, useState } from 'react'
import type { QuoteRow } from '../domain/quoteEngine'
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
import { QUICK_SITE_JUN_ADJUST, QUICK_SITE_TSAI_ADJUST } from '../domain/fieldworkQuickApply'

type Props = {
  workLog: WorkLogState
  setWorkLog: (v: WorkLogState | ((prev: WorkLogState) => WorkLogState)) => void
  siteOptions: readonly { id: string; name: string }[]
  quoteRows: readonly QuoteRow[]
  staffOptions: readonly string[]
}

const EMPTY_SITE = ''

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

export function WorkLogPanel({
  workLog,
  setWorkLog,
  siteOptions,
  quoteRows,
  staffOptions,
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
  const [draft, setDraft] = useState<DraftForm>(() => emptyDraft(today))
  const [newCustomItem, setNewCustomItem] = useState('')

  const siteChoices = useMemo(() => {
    const s = new Set<string>()
    s.add(QUICK_SITE_TSAI_ADJUST)
    s.add(QUICK_SITE_JUN_ADJUST)
    for (const o of siteOptions) {
      if (o.name.trim()) s.add(o.name)
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  }, [siteOptions])

  const workItemOptions = useMemo(
    () => mergedWorkItemOptions(quoteRows, workLog.customWorkItemLabels ?? []),
    [quoteRows, workLog.customWorkItemLabels],
  )

  const datesWithLog = useMemo(
    () => datesWithEntriesInMonth(workLog.entries, viewYear, viewMonth),
    [workLog.entries, viewYear, viewMonth],
  )

  const calCells = useMemo(
    () => calendarDayCells(viewYear, viewMonth),
    [viewYear, viewMonth],
  )

  const dayEntries = useMemo(() => {
    if (!selectedYmd) return []
    return sortWorkLogEntries(entriesForDate(workLog.entries, selectedYmd))
  }, [workLog.entries, selectedYmd])

  const isEditing = draft.id != null

  const resetDraftForDay = useCallback((ymd: string) => {
    setDraft(emptyDraft(ymd))
  }, [])

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

  const onSave = useCallback(() => {
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
  }, [draft, setWorkLog, resetDraftForDay])

  const onDelete = useCallback(
    (id: string) => {
      if (!window.confirm('確定刪除此筆日誌？')) return
      setWorkLog((w) => ({ ...w, entries: w.entries.filter((x) => x.id !== id) }))
      if (draft.id === id) resetDraftForDay(selectedYmd ?? todayYmdLocal())
    },
    [setWorkLog, draft.id, selectedYmd, resetDraftForDay],
  )

  const startEdit = useCallback((e: WorkLogEntry) => {
    setDraft(entryToDraft(e))
  }, [])

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
        依<strong>月曆</strong>檢視與新增；欄位與<strong>快速登記</strong>、<strong>估價細項</strong>、<strong>案場／人員</strong>連動。餐費／雜項可於快速登記同步寫入公司帳（雜項入「工具」欄）。資料含於備份與 JSONBin。
      </p>

      <section className="card worklogCalendarCard">
        <div className="worklogMonthNav">
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
            const has = datesWithLog.has(cellYmd)
            const isSel = selectedYmd === cellYmd
            const isToday = cellYmd === today
            return (
              <button
                key={cellYmd}
                type="button"
                className={`worklogDayCell${has ? ' worklogDayCell--hasEntry' : ''}${isSel ? ' worklogDayCell--selected' : ''}${isToday ? ' worklogDayCell--today' : ''}`}
                onClick={() => {
                  setSelectedYmd(cellYmd)
                  setDraft((d) => (d.id ? d : emptyDraft(cellYmd)))
                }}
              >
                <span className="worklogDayNum">{day}</span>
                {has ? <span className="worklogDayDot" aria-hidden /> : null}
              </button>
            )
          })}
        </div>
      </section>

      {selectedYmd ? (
        <section className="card worklogDaySection">
          <h3>{selectedYmd} 的紀錄</h3>
          {dayEntries.length === 0 ? (
            <p className="hint">此日尚無紀錄；下方表單可新增。</p>
          ) : (
            <ul className="worklogDayEntryList">
              {dayEntries.map((e) => (
                <li key={e.id} className="worklogDayEntryItem">
                  <div className="worklogDayEntryHead">
                    <span className="worklogDayEntryMeta">
                      {e.timeStart}–{e.timeEnd}
                      {e.staffNames.length ? ` · ${e.staffNames.length} 人` : ''}
                      {e.siteName ? ` · ${e.siteName}` : ''}
                    </span>
                    <span className="worklogListActions">
                      <button type="button" className="btn secondary" onClick={() => startEdit(e)}>
                        編輯
                      </button>
                      <button type="button" className="btn danger ghost" onClick={() => onDelete(e.id)}>
                        刪除
                      </button>
                    </span>
                  </div>
                  {e.workItem ? <p className="worklogDayEntryLine">內容：{e.workItem}</p> : null}
                  {e.equipment ? <p className="worklogDayEntryLine">儀器：{e.equipment}</p> : null}
                  {(e.mealCost !== 0 || e.miscCost !== 0) ? (
                    <p className="worklogDayEntryLine">
                      餐費 {e.mealCost} ／ 雜項 {e.miscCost}
                    </p>
                  ) : null}
                  {e.remark ? <pre className="worklogListBody">{e.remark}</pre> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="card worklogForm">
        <h3>{isEditing ? '編輯日誌' : '新增／編輯表單'}</h3>
        <div className="worklogFormGrid">
          <label className="worklogFormLabel">
            <span>日期</span>
            <input
              type="date"
              className="titleInput"
              value={draft.logDate}
              onChange={(e) => setDraft((d) => ({ ...d, logDate: e.target.value }))}
            />
          </label>
          <label className="worklogFormLabel">
            <span>上班／下班（預設 7:30、16:30）</span>
            <span className="worklogTimePair">
              <input
                type="time"
                value={toHhmm24(draft.timeStart, DEFAULT_WORK_START)}
                onChange={(e) => setDraft((d) => ({ ...d, timeStart: e.target.value }))}
              />
              <span className="muted">～</span>
              <input
                type="time"
                value={toHhmm24(draft.timeEnd, DEFAULT_WORK_END)}
                onChange={(e) => setDraft((d) => ({ ...d, timeEnd: e.target.value }))}
              />
            </span>
          </label>
        </div>

        <div className="worklogStaffBlock">
          <span className="worklogStaffTitle">
            施工人員（已選 {draft.staffNames.length} 人）
          </span>
          <div className="worklogStaffChecks">
            {staffOptions.map((name) => (
              <label key={name} className="rowCheck">
                <input
                  type="checkbox"
                  checked={draft.staffNames.includes(name)}
                  onChange={() => toggleStaff(name)}
                />
                {name}
              </label>
            ))}
          </div>
        </div>

        <div className="worklogFormGrid" style={{ marginTop: 10 }}>
          <label className="worklogFormLabel">
            <span>案場地點</span>
            <select
              className="titleInput"
              value={draft.siteName ? draft.siteName : EMPTY_SITE}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  siteName: e.target.value === EMPTY_SITE ? '' : e.target.value,
                }))
              }
            >
              <option value={EMPTY_SITE}>請選擇</option>
              {siteChoices.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="worklogFormLabel">
            <span>工作內容（估價細項）</span>
            <input
              className="titleInput"
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
            placeholder="新增自訂選項到清單"
            value={newCustomItem}
            onChange={(e) => setNewCustomItem(e.target.value)}
          />
          <button type="button" className="btn secondary" onClick={addCustomWorkItem}>
            加入選項
          </button>
        </div>

        <label className="worklogFormLabel" style={{ marginTop: 8 }}>
          <span>使用儀器</span>
          <input
            className="titleInput"
            value={draft.equipment}
            onChange={(e) => setDraft((d) => ({ ...d, equipment: e.target.value }))}
            placeholder="例如：全站、墨線儀…"
          />
        </label>

        <div className="worklogFormGrid" style={{ marginTop: 8 }}>
          <label className="worklogFormLabel">
            <span>餐費（元）</span>
            <input
              type="number"
              className="titleInput"
              value={draft.mealCost}
              onChange={(e) => setDraft((d) => ({ ...d, mealCost: e.target.value }))}
              placeholder="0"
            />
          </label>
          <label className="worklogFormLabel">
            <span>雜項支出（元）</span>
            <input
              type="number"
              className="titleInput"
              value={draft.miscCost}
              onChange={(e) => setDraft((d) => ({ ...d, miscCost: e.target.value }))}
              placeholder="0"
            />
          </label>
        </div>

        <label className="worklogFormLabel" style={{ marginTop: 8 }}>
          <span>備註（詳細內容）</span>
          <textarea
            className="worklogTextarea"
            value={draft.remark}
            onChange={(e) => setDraft((d) => ({ ...d, remark: e.target.value }))}
            rows={5}
            placeholder="現場狀況、待辦、交接…"
          />
        </label>

        <div className="btnRow" style={{ marginTop: 12 }}>
          <button type="button" className="btn" onClick={onSave}>
            {isEditing ? '儲存變更' : '新增儲存'}
          </button>
          {isEditing ? (
            <button type="button" className="btn secondary" onClick={() => resetDraftForDay(draft.logDate)}>
              取消編輯
            </button>
          ) : null}
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h3>全部日誌（新→舊）</h3>
        {sortWorkLogEntries(workLog.entries).length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>
            尚無日誌。
          </p>
        ) : (
          <ul className="worklogList">
            {sortWorkLogEntries(workLog.entries).map((e) => (
              <li key={e.id} className="worklogListItem">
                <div className="worklogListItemHead">
                  <span className="worklogListDate">
                    {e.logDate}{' '}
                    {e.siteName ? <span className="worklogSitePill">· {e.siteName}</span> : null}
                  </span>
                  <span className="worklogListActions">
                    <button type="button" className="btn secondary" onClick={() => {
                      setSelectedYmd(e.logDate)
                      startEdit(e)
                    }}>
                      編輯
                    </button>
                    <button type="button" className="btn danger ghost" onClick={() => onDelete(e.id)}>
                      刪除
                    </button>
                  </span>
                </div>
                <p className="worklogListSummary">{e.content}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
