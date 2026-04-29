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
import { addEmptySiteBlockToMonth, pickActiveMonthIdForToday } from '../domain/salaryExcelModel'
import { jobSitesFromSalaryBook } from '../domain/jobSitesFromBook'

type Props = {
  receivables: ReceivablesState
  setReceivables: (fn: (prev: ReceivablesState) => ReceivablesState) => void
  salaryBook: SalaryBook
  setSalaryBook: (fn: (b: SalaryBook) => SalaryBook) => void
  canEdit: boolean
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })
}

function todayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function ReceivablesPanel({
  receivables,
  setReceivables,
  salaryBook,
  setSalaryBook,
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

  const rangeTotalsCaption = useMemo(() => {
    if (rangeMode === 'month') return `本月／${monthFilter}`
    if (rangeMode === 'year') return `${yearFilter.trim()} 年度`
    return '全部期間'
  }, [rangeMode, monthFilter, yearFilter])

  const addRow = useCallback(() => {
    if (!canEdit) return
    const id = newReceivableId()
    const booked = todayYmd()
    setRangeMode('month')
    setMonthFilter(booked.slice(0, 7))
    setYearFilter(booked.slice(0, 4))
    setReceivables((prev) => {
      const p = migrateReceivablesState(prev)
      return {
        entries: sortReceivableEntriesByBookedDate([
          ...p.entries,
          {
            id,
            bookedDate: booked,
            projectName: '',
            phaseLabel: '',
            net: 0,
            taxZero: false,
            tax: 0,
            note: '',
          },
        ]),
      }
    })
  }, [canEdit, setReceivables])

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
          <p className="receivablesPanel__sub muted">
            每列一筆實際入帳。案名與薪水月表連動；列尾勾選「算稅」時依未稅金額計 5% 稅金，取消則為免稅／0 稅。
          </p>
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

      <fieldset className="tabFieldset" disabled={!canEdit}>
        <div className="receivablesTableScroll">
          <table className="data receivablesTable receivablesTable--flat">
            <thead>
              <tr>
                <th scope="col">入帳日</th>
                <th scope="col">案名</th>
                <th scope="col">階段</th>
                <th scope="col" className="num">
                  金額（未稅）
                </th>
                <th scope="col" className="num">
                  稅金
                </th>
                <th scope="col" className="num">
                  金額（含稅）
                </th>
                <th scope="col">備註</th>
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
                  <td colSpan={9} className="receivablesTable__empty muted">
                    此檢視範圍尚無資料。{canEdit ? '請按「新增一列」或切換範圍。' : null}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="date"
                        className="receivablesTable__inline"
                        value={row.bookedDate}
                        disabled={!canEdit}
                        onChange={(e) => updateBookedDate(row.id, e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        className="receivablesTable__select"
                        value={row.projectName}
                        disabled={!canEdit}
                        onChange={(e) => updateEntry(row.id, { projectName: e.target.value })}
                        aria-label="案名"
                      >
                        <option value="">請選擇案名</option>
                        {row.projectName && !siteNameSet.has(row.projectName) ? (
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
                    <td>
                      <input
                        type="text"
                        className="receivablesTable__inline"
                        placeholder="階段"
                        value={row.phaseLabel}
                        disabled={!canEdit}
                        onChange={(e) => updateEntry(row.id, { phaseLabel: e.target.value })}
                      />
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        className="receivablesTable__num"
                        value={row.net}
                        disabled={!canEdit}
                        onChange={(e) => {
                          const n = parseFloat(e.target.value) || 0
                          updateEntry(row.id, {
                            net: n,
                            tax: row.taxZero ? 0 : taxFromNet(n),
                          })
                        }}
                      />
                    </td>
                    <td className="num receivablesTable__derived">{fmtMoney(entryTax(row))}</td>
                    <td className="num">{fmtMoney(entryGross(row))}</td>
                    <td>
                      <input
                        type="text"
                        className="receivablesTable__inline"
                        placeholder="備註"
                        value={row.note}
                        disabled={!canEdit}
                        onChange={(e) => updateEntry(row.id, { note: e.target.value })}
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
                  <th scope="row" colSpan={3}>
                    結算
                  </th>
                  <td className="num">{fmtMoney(footTotals.net)}</td>
                  <td className="num">{fmtMoney(footTotals.tax)}</td>
                  <td className="num">{fmtMoney(footTotals.gross)}</td>
                  <td />
                  <td />
                  <td className="receivablesTable__footerDash muted">—</td>
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
