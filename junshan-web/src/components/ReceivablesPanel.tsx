import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReceivablesState } from '../domain/receivablesModel'
import {
  entryGross,
  entryTax,
  migrateReceivablesState,
  newReceivableId,
  sortReceivableEntriesByBookedDate,
  sumEntriesInMonth,
  sumEntriesInYear,
  sumEntriesNetTaxGross,
  taxFromNet,
  type ReceivableEntry,
} from '../domain/receivablesModel'

type RangeMode = 'month' | 'year' | 'all'

import type { SalaryBook } from '../domain/salaryExcelModel'
import type { QuoteSite } from '../domain/quoteEngine'
import {
  addEmptySiteBlockToMonth,
  isPlaceholderMonthBlockSiteName,
  pickActiveMonthIdForToday,
} from '../domain/salaryExcelModel'
import { jobSitesFromSalaryBook } from '../domain/jobSitesFromBook'
import { PayrollNumberInput } from './PayrollNumberInput'

type Props = {
  receivables: ReceivablesState
  setReceivables: (fn: (prev: ReceivablesState) => ReceivablesState) => void
  salaryBook: SalaryBook
  setSalaryBook: (fn: (b: SalaryBook) => SalaryBook) => void
  /** 估價案場：案名與此相同時，樓層欄可從估價樓層清單選填 */
  quoteSite: QuoteSite
  canEdit: boolean
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })
}

/** 階段／備註：依內容即時撐寬；`ch` 為「0」字寬，CJK 需加權才不會被裁切 */
const RECEIVABLES_INPUT_GROW_MIN = 12
const RECEIVABLES_INPUT_GROW_MAX = 320

function isWideScriptCodePoint(cp: number): boolean {
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x3000 && cp <= 0x303f) ||
    (cp >= 0xff00 && cp <= 0xffef) ||
    (cp >= 0xac00 && cp <= 0xd7af) ||
    (cp >= 0x3040 && cp <= 0x309f) ||
    (cp >= 0x30a0 && cp <= 0x30ff)
  )
}

/** 以「約略 ch」累加，比純字元數 * 常數更貼近中英文混排實際寬度 */
function receivableContentWidthUnits(text: string): number {
  let u = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    if (isWideScriptCodePoint(cp)) {
      u += 2.42
    } else if (cp <= 0x20) {
      u += 0.35
    } else {
      u += 1.1
    }
  }
  return u
}

/** 欄最小寬度（ch）：取目前字串與 placeholder 較寬者，並預留邊框／內距 */
function receivableFieldWidthCh(value: string, placeholder: string): number {
  const v = receivableContentWidthUnits(value)
  const p = receivableContentWidthUnits(placeholder)
  const raw = Math.max(v, p) + 5.5
  return Math.min(
    RECEIVABLES_INPUT_GROW_MAX,
    Math.max(RECEIVABLES_INPUT_GROW_MIN, Math.ceil(raw)),
  )
}

function singleLineReceivableText(raw: string): string {
  return raw.replace(/\r\n|\r|\n/g, ' ')
}

function todayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 新增列預設入帳日：落在目前檢視範圍內，且盡量用今天（若今天在該範圍內）。 */
function defaultBookedDateForRange(
  mode: RangeMode,
  monthFilter: string,
  yearFilter: string,
): string {
  const today = todayYmd()
  if (mode === 'all') return today

  if (mode === 'month') {
    const ym = monthFilter.trim()
    if (!/^\d{4}-\d{2}$/.test(ym)) return today
    if (today.slice(0, 7) === ym) return today
    return `${ym}-01`
  }

  const y = yearFilter.trim()
  if (!/^\d{4}$/.test(y)) return today
  if (today.startsWith(`${y}-`)) return today
  return `${y}-01-01`
}

export function ReceivablesPanel({
  receivables,
  setReceivables,
  salaryBook,
  setSalaryBook,
  quoteSite,
  canEdit,
}: Props) {
  const data = useMemo(() => migrateReceivablesState(receivables), [receivables])
  const siteOptions = useMemo(() => jobSitesFromSalaryBook(salaryBook), [salaryBook])
  const siteNameSet = useMemo(() => new Set(siteOptions.map((o) => o.name)), [siteOptions])

  const [addProjectOpen, setAddProjectOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectMonthId, setNewProjectMonthId] = useState(() =>
    pickActiveMonthIdForToday(salaryBook.months),
  )

  useEffect(() => {
    if (!addProjectOpen) return
    setNewProjectMonthId((prev) => {
      if (salaryBook.months.some((m) => m.id === prev)) return prev
      return pickActiveMonthIdForToday(salaryBook.months)
    })
  }, [addProjectOpen, salaryBook.months])
  const [rangeMode, setRangeMode] = useState<RangeMode>('month')
  const [monthFilter, setMonthFilter] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [yearFilter, setYearFilter] = useState(() => String(new Date().getFullYear()))

  const visibleRows = useMemo(() => {
    const rows = data.entries
    if (rangeMode === 'all') {
      return rows
    }
    if (rangeMode === 'year') {
      const y = yearFilter.trim()
      if (!/^\d{4}$/.test(y)) return []
      const prefix = `${y}-`
      return rows.filter(
        (e) => typeof e.bookedDate === 'string' && e.bookedDate.startsWith(prefix),
      )
    }
    const prefix = monthFilter.trim()
    if (!/^\d{4}-\d{2}$/.test(prefix)) return []
    return rows.filter(
      (e) => typeof e.bookedDate === 'string' && e.bookedDate.startsWith(prefix),
    )
  }, [data.entries, rangeMode, monthFilter, yearFilter])

  const rangeTotals = useMemo(() => {
    if (rangeMode === 'all') {
      return sumEntriesNetTaxGross(data.entries)
    }
    if (rangeMode === 'year') {
      return sumEntriesInYear(data.entries, yearFilter)
    }
    return sumEntriesInMonth(data.entries, monthFilter)
  }, [data.entries, rangeMode, monthFilter, yearFilter])

  const footTotals = useMemo(() => sumEntriesNetTaxGross(visibleRows), [visibleRows])

  const phaseColMinCh = useMemo(() => {
    if (visibleRows.length === 0) return RECEIVABLES_INPUT_GROW_MIN
    return Math.max(
      RECEIVABLES_INPUT_GROW_MIN,
      ...visibleRows.map((r) => receivableFieldWidthCh(r.phaseLabel, '階段')),
    )
  }, [visibleRows])

  const noteColMinCh = useMemo(() => {
    if (visibleRows.length === 0) return RECEIVABLES_INPUT_GROW_MIN
    return Math.max(
      RECEIVABLES_INPUT_GROW_MIN,
      ...visibleRows.map((r) => receivableFieldWidthCh(r.note, '備註')),
    )
  }, [visibleRows])

  const rangeTotalsCaption = useMemo(() => {
    if (rangeMode === 'month') return `本月／${monthFilter}`
    if (rangeMode === 'year') return `${yearFilter.trim()} 年度`
    return '全部期間'
  }, [rangeMode, monthFilter, yearFilter])

  const earliestBookedYm = useMemo(() => {
    let best: string | null = null
    for (const e of data.entries) {
      const d = e.bookedDate
      if (typeof d !== 'string' || !/^\d{4}-\d{2}/.test(d)) continue
      const ym = d.slice(0, 7)
      if (!/^\d{4}-\d{2}$/.test(ym)) continue
      if (best === null || ym.localeCompare(best) < 0) best = ym
    }
    return best
  }, [data.entries])

  const addRow = useCallback(() => {
    if (!canEdit) return
    const id = newReceivableId()
    const booked = defaultBookedDateForRange(rangeMode, monthFilter, yearFilter)
    if (rangeMode === 'month') {
      setMonthFilter(booked.slice(0, 7))
      setYearFilter(booked.slice(0, 4))
    } else if (rangeMode === 'year') {
      setYearFilter(booked.slice(0, 4))
      setMonthFilter(booked.slice(0, 7))
    } else {
      setMonthFilter(booked.slice(0, 7))
      setYearFilter(booked.slice(0, 4))
    }
    setReceivables((prev) => {
      const p = migrateReceivablesState(prev)
      return {
        entries: sortReceivableEntriesByBookedDate([
          ...p.entries,
          {
            id,
            bookedDate: booked,
            projectName: '',
            buildingLabel: '',
            floorLabel: '',
            phaseLabel: '',
            net: 0,
            taxZero: false,
            tax: 0,
            note: '',
          },
        ]),
      }
    })
  }, [canEdit, setReceivables, rangeMode, monthFilter, yearFilter])

  const updateEntry = useCallback(
    (id: string, patch: Partial<ReceivableEntry>) => {
      if (!canEdit) return
      setReceivables((prev) => {
        const p = migrateReceivablesState(prev)
        return {
          entries: sortReceivableEntriesByBookedDate(
            p.entries.map((x) => (x.id === id ? { ...x, ...patch } : x)),
          ),
        }
      })
    },
    [canEdit, setReceivables],
  )

  /** 改入帳日時同步「檢視月份」，否則列會被篩掉、日期輸入卸載導致原生日曆異常關閉 */
  const updateBookedDate = useCallback(
    (id: string, value: string) => {
      if (!canEdit) return
      if (value.length >= 7) {
        const ym = value.slice(0, 7)
        if (/^\d{4}-\d{2}$/.test(ym)) {
          setMonthFilter(ym)
        }
      }
      if (value.length >= 4) {
        const y = value.slice(0, 4)
        if (/^\d{4}$/.test(y)) {
          setYearFilter(y)
        }
      }
      updateEntry(id, { bookedDate: value })
    },
    [canEdit, updateEntry],
  )

  const submitAddProject = useCallback(() => {
    if (!canEdit) return
    const r = addEmptySiteBlockToMonth(salaryBook, newProjectMonthId, newProjectName)
    if (!r.ok) {
      alert(r.message)
      return
    }
    setSalaryBook(() => r.book)
    alert(r.message)
    setAddProjectOpen(false)
    setNewProjectName('')
  }, [canEdit, newProjectMonthId, newProjectName, salaryBook, setSalaryBook])

  const removeEntry = useCallback(
    (id: string) => {
      if (!canEdit) return
      if (!window.confirm('確定刪除此筆入帳？')) return
      setReceivables((prev) => {
        const p = migrateReceivablesState(prev)
        return {
          entries: sortReceivableEntriesByBookedDate(p.entries.filter((x) => x.id !== id)),
        }
      })
    },
    [canEdit, setReceivables],
  )

  return (
    <div className="receivablesPanel">
      <div className="receivablesPanel__head">
        <div>
          <h2 className="receivablesPanel__title">收帳</h2>
        </div>
        {canEdit ? (
          <div className="receivablesPanel__headBtns">
            <button
              type="button"
              className="btn secondary"
              disabled={salaryBook.months.length === 0}
              onClick={() => {
                setNewProjectMonthId(pickActiveMonthIdForToday(salaryBook.months))
                setNewProjectName('')
                setAddProjectOpen(true)
              }}
            >
              新增案（寫入月表）
            </button>
            <button type="button" className="btn primary" onClick={addRow}>
              新增一列
            </button>
          </div>
        ) : null}
      </div>

      <section className="receivablesPanel__monthBar card">
        <div className="receivablesPanel__rangeRow">
          <label className="receivablesPanel__rangeField">
            <span>檢視範圍</span>
            <select
              className="receivablesPanel__rangeMode"
              value={rangeMode}
              onChange={(e) => setRangeMode(e.target.value as RangeMode)}
            >
              <option value="month">單月</option>
              <option value="year">整年</option>
              <option value="all">全部</option>
            </select>
          </label>
          {rangeMode === 'month' ? (
            <label className="receivablesPanel__monthLabel">
              <span>月份（依入帳日）</span>
              <input
                type="month"
                className="receivablesPanel__monthInput"
                value={monthFilter}
                onChange={(e) => {
                  const v = e.target.value
                  setMonthFilter(v)
                  if (v.length >= 4) {
                    setYearFilter(v.slice(0, 4))
                  }
                }}
              />
            </label>
          ) : null}
          {rangeMode === 'year' ? (
            <label className="receivablesPanel__yearLabel">
              <span>年度（依入帳日）</span>
              <input
                type="number"
                className="receivablesPanel__yearInput"
                min={2000}
                max={2100}
                step={1}
                value={yearFilter}
                onChange={(e) => {
                  const raw = e.target.value
                  const n = parseInt(raw, 10)
                  if (!Number.isFinite(n)) {
                    setYearFilter(raw)
                    return
                  }
                  const clamped = Math.min(2100, Math.max(2000, n))
                  setYearFilter(String(clamped))
                }}
              />
            </label>
          ) : null}
        </div>
        <div className="receivablesPanel__monthTotals">
          <span className="receivablesPanel__totalsCap muted">{rangeTotalsCaption}</span>
          {data.entries.length > 0 ? (
            <span className="receivablesPanel__countHint muted" title="依「檢視範圍」篩選入帳日後的筆數">
              表內 <strong>{visibleRows.length}</strong> 筆／全庫 <strong>{data.entries.length}</strong> 筆
            </span>
          ) : null}
          <span>
            未稅 <strong>{fmtMoney(rangeTotals.net)}</strong>
          </span>
          <span>
            稅 <strong>{fmtMoney(rangeTotals.tax)}</strong>
          </span>
          <span>
            含稅 <strong>{fmtMoney(rangeTotals.gross)}</strong>
          </span>
        </div>
      </section>

      {data.entries.length > 0 && visibleRows.length === 0 ? (
        <div className="receivablesPanel__filterGap card" role="status">
          <p className="receivablesPanel__filterGapText">
            收帳共有 <strong>{data.entries.length}</strong> 筆，但<strong>目前檢視範圍</strong>內沒有符合的入帳日。
            表內是篩選後的結果，資料仍在本機；請改選「單月／整年／全部」或調整月份／年度。
          </p>
          <div className="btnRow receivablesPanel__filterGapBtns">
            <button type="button" className="btn secondary" onClick={() => setRangeMode('all')}>
              改為顯示全部期間
            </button>
            {earliestBookedYm ? (
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setRangeMode('month')
                  setMonthFilter(earliestBookedYm)
                  setYearFilter(earliestBookedYm.slice(0, 4))
                }}
              >
                跳到最早一筆所在月份（{earliestBookedYm}）
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <fieldset className="tabFieldset" disabled={!canEdit}>
        <div className="receivablesTableScroll tableScrollSticky">
          <table className="data receivablesTable receivablesTable--flat">
            <thead>
              <tr>
                <th scope="col" className="receivablesTable__cellDate">
                  入帳日
                </th>
                <th scope="col" className="receivablesTable__cellProject">
                  案名
                </th>
                <th scope="col" className="receivablesTable__cellBuilding">
                  棟
                </th>
                <th scope="col" className="receivablesTable__cellFloor">
                  樓層
                </th>
                <th
                  scope="col"
                  className="receivablesTable__cellPhase"
                  style={{ minWidth: `${phaseColMinCh}ch` }}
                >
                  階段
                </th>
                <th scope="col" className="num receivablesTable__cellMoney">
                  金額（未稅）
                </th>
                <th scope="col" className="num receivablesTable__cellMoney receivablesTable__cellMoney--narrow">
                  稅金
                </th>
                <th scope="col" className="num receivablesTable__cellMoney">
                  金額（含稅）
                </th>
                <th
                  scope="col"
                  className="receivablesTable__cellNote"
                  style={{ minWidth: `${noteColMinCh}ch` }}
                >
                  備註
                </th>
                <th scope="col" className="receivablesTable__actCol" />
                <th scope="col" className="receivablesTable__taxCheckCol">
                  算稅
                  <span className="receivablesTable__thHint">（5%）</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="receivablesTable__empty muted">
                    此檢視範圍尚無資料。{canEdit ? '請按「新增一列」或切換範圍。' : null}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr key={row.id}>
                    <td className="receivablesTable__cellDate">
                      <input
                        type="date"
                        className="receivablesTable__inline"
                        value={row.bookedDate}
                        disabled={!canEdit}
                        onChange={(e) => updateBookedDate(row.id, e.target.value)}
                      />
                    </td>
                    <td className="receivablesTable__cellProject">
                      <select
                        className="receivablesTable__select"
                        value={
                          siteNameSet.has(row.projectName)
                            ? row.projectName
                            : isPlaceholderMonthBlockSiteName(row.projectName)
                              ? ''
                              : row.projectName
                        }
                        disabled={!canEdit}
                        onChange={(e) => updateEntry(row.id, { projectName: e.target.value })}
                        aria-label="案名"
                      >
                        <option value="">請選擇案名</option>
                        {row.projectName &&
                        !siteNameSet.has(row.projectName) &&
                        !isPlaceholderMonthBlockSiteName(row.projectName) ? (
                          <option value={row.projectName}>
                            {row.projectName}（舊資料，建議改選月表案名）
                          </option>
                        ) : null}
                        {siteOptions.map((o) => (
                          <option key={o.id} value={o.name}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="receivablesTable__cellBuilding">
                      <input
                        type="text"
                        className="receivablesTable__inline"
                        placeholder="例：A棟"
                        value={row.buildingLabel}
                        disabled={!canEdit}
                        onChange={(e) => updateEntry(row.id, { buildingLabel: e.target.value })}
                        aria-label="棟"
                      />
                    </td>
                    <td className="receivablesTable__cellFloor">
                      {row.projectName.trim() !== '' &&
                      row.projectName.trim() === quoteSite.name.trim() ? (
                        <>
                          <datalist id={`rcv-floor-${row.id}`}>
                            {quoteSite.floors.map((f, i) => (
                              <option key={`${row.id}-${i}-${f.name}`} value={f.name} />
                            ))}
                          </datalist>
                          <input
                            type="text"
                            className="receivablesTable__inline"
                            list={`rcv-floor-${row.id}`}
                            placeholder="例：3F、B1"
                            value={row.floorLabel}
                            disabled={!canEdit}
                            onChange={(e) => updateEntry(row.id, { floorLabel: e.target.value })}
                            aria-label="樓層"
                          />
                        </>
                      ) : (
                        <input
                          type="text"
                          className="receivablesTable__inline"
                          placeholder="例：3F、B1"
                          value={row.floorLabel}
                          disabled={!canEdit}
                          onChange={(e) => updateEntry(row.id, { floorLabel: e.target.value })}
                          aria-label="樓層"
                        />
                      )}
                    </td>
                    <td
                      className="receivablesTable__cellPhase"
                      style={{ minWidth: `${receivableFieldWidthCh(row.phaseLabel, '階段')}ch` }}
                    >
                      <input
                        type="text"
                        className="receivablesTable__inline receivablesTable__inputGrow"
                        placeholder="階段"
                        value={row.phaseLabel}
                        disabled={!canEdit}
                        onChange={(e) =>
                          updateEntry(row.id, { phaseLabel: singleLineReceivableText(e.target.value) })
                        }
                        aria-label="階段"
                      />
                    </td>
                    <td className="num receivablesTable__cellMoney">
                      <PayrollNumberInput
                        className="receivablesTable__num"
                        aria-label="金額（未稅）"
                        value={row.net}
                        onCommit={(nv) =>
                          updateEntry(row.id, {
                            net: nv,
                            tax: row.taxZero ? 0 : taxFromNet(nv),
                          })
                        }
                      />
                    </td>
                    <td className="num receivablesTable__cellMoney receivablesTable__cellMoney--narrow receivablesTable__derived">
                      {fmtMoney(entryTax(row))}
                    </td>
                    <td className="num receivablesTable__cellMoney">{fmtMoney(entryGross(row))}</td>
                    <td
                      className="receivablesTable__cellNote"
                      style={{ minWidth: `${receivableFieldWidthCh(row.note, '備註')}ch` }}
                    >
                      <input
                        type="text"
                        className="receivablesTable__inline receivablesTable__inputGrow"
                        placeholder="備註"
                        value={row.note}
                        disabled={!canEdit}
                        onChange={(e) =>
                          updateEntry(row.id, { note: singleLineReceivableText(e.target.value) })
                        }
                        aria-label="備註"
                      />
                    </td>
                    <td className="receivablesTable__actCol">
                      {canEdit ? (
                        <button
                          type="button"
                          className="btn danger ghost receivablesTable__miniBtn"
                          onClick={() => removeEntry(row.id)}
                        >
                          刪除
                        </button>
                      ) : null}
                    </td>
                    <td className="receivablesTable__taxCheckCell">
                      <label className="receivablesTable__taxCheck">
                        <input
                          type="checkbox"
                          checked={!row.taxZero}
                          disabled={!canEdit}
                          onChange={(e) => {
                            const applyTax = e.target.checked
                            const n = row.net
                            updateEntry(row.id, {
                              taxZero: !applyTax,
                              tax: applyTax ? taxFromNet(n) : 0,
                            })
                          }}
                          aria-label="計算 5% 稅金"
                        />
                        <span className="receivablesTable__taxCheckText">計稅</span>
                      </label>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {visibleRows.length > 0 ? (
              <tfoot>
                <tr className="receivablesTable__footer">
                  <th scope="row" className="receivablesTable__cellDate receivablesTable__footerLead">
                    結算
                  </th>
                  <td className="receivablesTable__cellProject receivablesTable__footerFill" aria-hidden="true">
                    {'\u00a0'}
                  </td>
                  <td className="receivablesTable__cellBuilding receivablesTable__footerFill" aria-hidden="true">
                    {'\u00a0'}
                  </td>
                  <td className="receivablesTable__cellFloor receivablesTable__footerFill" aria-hidden="true">
                    {'\u00a0'}
                  </td>
                  <td className="receivablesTable__cellPhase receivablesTable__footerFill" aria-hidden="true">
                    {'\u00a0'}
                  </td>
                  <td className="num receivablesTable__cellMoney receivablesTable__footerNumCell">
                    <span className="receivablesTable__footerNumIn">{fmtMoney(footTotals.net)}</span>
                  </td>
                  <td className="num receivablesTable__cellMoney receivablesTable__cellMoney--narrow receivablesTable__footerNumCell">
                    <span className="receivablesTable__footerNumIn">{fmtMoney(footTotals.tax)}</span>
                  </td>
                  <td className="num receivablesTable__cellMoney receivablesTable__footerNumCell">
                    <span className="receivablesTable__footerNumIn">{fmtMoney(footTotals.gross)}</span>
                  </td>
                  <td className="receivablesTable__cellNote receivablesTable__footerFill" aria-hidden="true">
                    {'\u00a0'}
                  </td>
                  <td className="receivablesTable__actCol receivablesTable__footerFill" aria-hidden="true">
                    {'\u00a0'}
                  </td>
                  <td className="receivablesTable__taxCheckCell receivablesTable__footerDash muted">—</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </fieldset>

      {addProjectOpen ? (
        <div
          className="receivablesAddProject"
          role="dialog"
          aria-modal="true"
          aria-labelledby="receivablesAddProjectTitle"
          onClick={() => setAddProjectOpen(false)}
        >
          <div
            className="receivablesAddProject__panel card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="receivablesAddProjectTitle" className="receivablesAddProject__title">
              新增案（月表）
            </h3>
            <p className="receivablesAddProject__desc muted">
              將在選定的薪水月表新增一個空案場區塊，與「薪水統計」內新增案場區塊相同。
            </p>
            <label className="receivablesAddProject__field">
              案名
              <input
                type="text"
                className="receivablesAddProject__input"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="與月表區塊名稱一致"
                autoFocus
              />
            </label>
            <label className="receivablesAddProject__field">
              加入月表
              <select
                className="receivablesAddProject__input"
                value={newProjectMonthId}
                onChange={(e) => setNewProjectMonthId(e.target.value)}
              >
                {salaryBook.months.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="receivablesAddProject__actions">
              <button type="button" className="btn secondary" onClick={() => setAddProjectOpen(false)}>
                取消
              </button>
              <button type="button" className="btn primary" onClick={submitAddProject}>
                確認新增
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
