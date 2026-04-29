import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReceivablesState } from '../domain/receivablesModel'
import {
  grossOf,
  migrateReceivablesState,
  newReceivableId,
  sumEntriesInMonth,
  sumEntriesNetTaxGross,
  type ReceivableEntry,
} from '../domain/receivablesModel'

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

function compareEntryOrder(a: ReceivableEntry, b: ReceivableEntry): number {
  const da = a.bookedDate || ''
  const db = b.bookedDate || ''
  if (da !== db) return da.localeCompare(db)
  return a.id.localeCompare(b.id)
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
  const [monthFilter, setMonthFilter] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const monthTotals = useMemo(
    () => sumEntriesInMonth(data.entries, monthFilter),
    [data.entries, monthFilter],
  )

  const rowsInMonth = useMemo(() => {
    const prefix = monthFilter.trim()
    if (!/^\d{4}-\d{2}$/.test(prefix)) return []
    return data.entries
      .filter((e) => typeof e.bookedDate === 'string' && e.bookedDate.startsWith(prefix))
      .slice()
      .sort(compareEntryOrder)
  }, [data.entries, monthFilter])

  const footTotals = useMemo(() => sumEntriesNetTaxGross(rowsInMonth), [rowsInMonth])

  const addRow = useCallback(() => {
    if (!canEdit) return
    const id = newReceivableId()
    setReceivables((prev) => {
      const p = migrateReceivablesState(prev)
      return {
        entries: [
          ...p.entries,
          {
            id,
            bookedDate: todayYmd(),
            projectName: '',
            phaseLabel: '',
            net: 0,
            tax: 0,
            note: '',
          },
        ],
      }
    })
  }, [canEdit, setReceivables])

  const updateEntry = useCallback(
    (id: string, patch: Partial<ReceivableEntry>) => {
      if (!canEdit) return
      setReceivables((prev) => {
        const p = migrateReceivablesState(prev)
        return {
          entries: p.entries.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        }
      })
    },
    [canEdit, setReceivables],
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
        return { entries: p.entries.filter((x) => x.id !== id) }
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
            每列一筆實際入帳。案名與薪水月表連動（下拉選單）；「新增案」會在指定月表新增空案場區塊。階段、未稅／稅／含稅請自行填寫。
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
        <label className="receivablesPanel__monthLabel">
          <span>檢視月份（依入帳日）</span>
          <input
            type="month"
            className="receivablesPanel__monthInput"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
          />
        </label>
        <div className="receivablesPanel__monthTotals">
          <span>
            未稅 <strong>{fmtMoney(monthTotals.net)}</strong>
          </span>
          <span>
            稅 <strong>{fmtMoney(monthTotals.tax)}</strong>
          </span>
          <span>
            含稅 <strong>{fmtMoney(monthTotals.gross)}</strong>
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
              </tr>
            </thead>
            <tbody>
              {rowsInMonth.length === 0 ? (
                <tr>
                  <td colSpan={8} className="receivablesTable__empty muted">
                    此月份尚無資料。{canEdit ? '請按「新增一列」。' : null}
                  </td>
                </tr>
              ) : (
                rowsInMonth.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="date"
                        className="receivablesTable__inline"
                        value={row.bookedDate}
                        disabled={!canEdit}
                        onChange={(e) => updateEntry(row.id, { bookedDate: e.target.value })}
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
                        onChange={(e) =>
                          updateEntry(row.id, { net: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        className="receivablesTable__num"
                        value={row.tax}
                        disabled={!canEdit}
                        onChange={(e) =>
                          updateEntry(row.id, { tax: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </td>
                    <td className="num">{fmtMoney(grossOf(row.net, row.tax))}</td>
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
                  </tr>
                ))
              )}
            </tbody>
            {rowsInMonth.length > 0 ? (
              <tfoot>
                <tr className="receivablesTable__footer">
                  <th scope="row" colSpan={3}>
                    結算
                  </th>
                  <td className="num">{fmtMoney(footTotals.net)}</td>
                  <td className="num">{fmtMoney(footTotals.tax)}</td>
                  <td className="num">{fmtMoney(footTotals.gross)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </fieldset>
    </div>
  )
}
