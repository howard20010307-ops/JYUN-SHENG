import {
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
  startTransition,
  Fragment,
} from 'react'
import {
  type MonthSheetData,
  type SalaryBook,
  padArray,
  blockDayColumnTotals,
  blockGrandPay,
  computeGrandTotalSection,
  staffTotalDays,
  staffTotalPay,
  mealTotalPay,
  emptyBlock,
  buildStaffSummaryRows,
  NET_TAKE_HOME_ROW_PREFIX,
  type SummaryBlockRow,
  staffKeysForMonthDisplay,
  staffKeysAcrossBook,
  renameWorkerInBook,
  addWorkerToBook,
  removeWorkerFromBook,
  reconcileSalaryBookPeriodColumns,
  renameSiteAcrossBook,
  payrollSummaryTooltipFooterTotals,
} from '../domain/salaryExcelModel'
import type { MonthLine } from '../domain/ledgerEngine'
import { importSalaryExcelToBook } from '../domain/salaryExcelImport'
import { FieldworkQuickSection } from './FieldworkQuickSection'
import { PayrollNumberInput } from './PayrollNumberInput'
import { PayrollSummaryPopoverCell } from './PayrollSummaryPopoverCell'
import { usePayrollSummaryShowDailyMoney } from '../hooks/usePayrollSummaryShowDailyMoney'

type Props = {
  salaryBook: SalaryBook
  setSalaryBook: (fn: (b: SalaryBook) => SalaryBook) => void
  months: MonthLine[]
  setMonths: (m: MonthLine[]) => void
}

function sumRowCells(row: number[] | undefined, len: number): number {
  const p = padArray(row, len)
  let s = 0
  for (let j = 0; j < len; j++) {
    const v = p[j] ?? 0
    if (Number.isFinite(v)) s += v
  }
  return s
}

function colSumStaffGrid(
  staffKeys: readonly string[],
  len: number,
  col: number,
  getRow: (name: string) => number[] | undefined,
): number {
  let s = 0
  for (const name of staffKeys) {
    s += padArray(getRow(name), len)[col] ?? 0
  }
  return s
}

function fmtSum(v: number): number {
  return Math.round(v * 100) / 100
}

/** 總表：依「區塊標題·姓名」中 · 前字串分組，每組一個 tbody 方便留白分隔 */
function groupStaffSummaryRows(rows: SummaryBlockRow[]): SummaryBlockRow[][] {
  const out: SummaryBlockRow[][] = []
  let cur: SummaryBlockRow[] = []
  let prevPrefix: string | null = null
  for (const r of rows) {
    const dot = r.label.indexOf('·')
    const prefix = dot >= 0 ? r.label.slice(0, dot) : r.label
    if (prevPrefix !== null && prefix !== prevPrefix) {
      out.push(cur)
      cur = []
    }
    prevPrefix = prefix
    cur.push(r)
  }
  if (cur.length) out.push(cur)
  return out
}

/** 總表列「鈞泩出工數·姓名」→ 區塊名「鈞泩出工數」；無 `·` 則用整行字。 */
function summaryGroupSectionTitle(group: SummaryBlockRow[]): string {
  const l = group[0]?.label ?? ''
  const d = l.indexOf('·')
  return d >= 0 ? l.slice(0, d) : l
}

/** 與案場出工格線一致：數值大於 0 則紅字（預支、調工天數、加班時數等） */
function cellNeedsWorkHighlight(v: number): boolean {
  return Number.isFinite(v) && v > 0
}

function colHasPositiveInGrid(
  staffKeys: readonly string[],
  len: number,
  col: number,
  getRow: (name: string) => number[] | undefined,
): boolean {
  return staffKeys.some((nm) => {
    const v = padArray(getRow(nm), len)[col] ?? 0
    return cellNeedsWorkHighlight(v)
  })
}

/** 月表單一案場：該員此列出工天數合計為 0 則不顯示（人員仍保留於日薪／他案場／新增列等） */
function staffHasBlockWork(
  block: { grid: Record<string, number[]> },
  name: string,
  dateLen: number,
): boolean {
  return staffTotalDays(padArray(block.grid[name], dateLen)) !== 0
}

export function PayrollPanel({ salaryBook, setSalaryBook, months, setMonths }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  /** 案場名 blur 時全書連動更名：記錄焦點當下之舊字串 */
  const siteRenameSnapRef = useRef<{
    monthId: string
    bi: number
    oldTrim: string
    oldRaw: string
  } | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [newStaffName, setNewStaffName] = useState('')
  const [activeMonthId, setActiveMonthId] = useState(
    () => salaryBook.months[0]?.id ?? '',
  )
  const [sub, setSub] = useState<'month' | 'summary'>('month')

  useEffect(() => {
    if (!salaryBook.months.some((m) => m.id === activeMonthId)) {
      setActiveMonthId(salaryBook.months[0]?.id ?? '')
    }
  }, [salaryBook.months, activeMonthId])

  const summaryMonthDatesSig = useMemo(
    () =>
      salaryBook.months
        .map((m) => `${m.label}:${m.dates[0] ?? ''}:${m.dates[m.dates.length - 1] ?? ''}`)
        .join('|'),
    [salaryBook.months],
  )

  /** 總表：切到本分頁或月表日期範圍變動時，自動補齊分期欄與表頭格數 */
  useEffect(() => {
    if (sub !== 'summary') return
    setSalaryBook((prev) => reconcileSalaryBookPeriodColumns(prev))
  }, [sub, summaryMonthDatesSig, setSalaryBook])

  const month = salaryBook.months.find((m) => m.id === activeMonthId)

  const [showDailyMoney, setShowDailyMoney] = usePayrollSummaryShowDailyMoney()

  /** 總表可收合區塊；預設只展開實領列（與 {@link NET_TAKE_HOME_ROW_PREFIX} 同字串） */
  const [openSummarySections, setOpenSummarySections] = useState<Set<string>>(
    () => new Set([NET_TAKE_HOME_ROW_PREFIX]),
  )

  const summaryRows = useMemo(
    () => buildStaffSummaryRows(salaryBook, { showDailyMoney }),
    [salaryBook, showDailyMoney],
  )

  const summaryRowGroups = useMemo(
    () => groupStaffSummaryRows(summaryRows),
    [summaryRows],
  )

  const toggleSummarySection = useCallback((title: string) => {
    setOpenSummarySections((prev) => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }, [])

  const patchMonth = useCallback(
    (monthId: string, fn: (m: MonthSheetData) => MonthSheetData) => {
      setSalaryBook((b) => ({
        ...b,
        months: b.months.map((m) => (m.id === monthId ? fn(m) : m)),
      }))
    },
    [setSalaryBook],
  )

  /** 必須在任一 early return 之前呼叫，否則匯入後月表 id 切換瞬間會觸發「Rendered fewer hooks than expected」 */
  const staffOrder = useMemo(
    () => (month ? staffKeysForMonthDisplay(month) : []),
    [month],
  )
  const staffPickerBookwide = useMemo(
    () => staffKeysAcrossBook(salaryBook),
    [salaryBook],
  )

  function removeMonth(id: string) {
    setSalaryBook((b) => {
      const rest = b.months.filter((x) => x.id !== id)
      return { ...b, months: rest }
    })
  }

  if (!month) {
    return (
      <div className="panel">
        <p>沒有月表資料。請清除本機資料後重開，或聯絡維護人員。</p>
      </div>
    )
  }

  const grand = computeGrandTotalSection(month)

  return (
    <div className="panel">
      <h2>薪水統計（對齊 Excel 結構）</h2>

      <div className="btnRow" style={{ marginBottom: 12 }}>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            setImportBusy(true)
            await new Promise<void>((r) => setTimeout(r, 0))
            try {
              const book = await importSalaryExcelToBook(f)
              startTransition(() => {
                setSalaryBook(() => book)
              })
            } catch (err) {
              alert(err instanceof Error ? err.message : String(err))
            } finally {
              setImportBusy(false)
            }
          }}
        />
        <button
          type="button"
          className="btn"
          disabled={importBusy}
          onClick={() => fileRef.current?.click()}
        >
          {importBusy ? '匯入中…' : '從 Excel 匯入整本薪水（總表＋各月格線）'}
        </button>
        <button
          type="button"
          className={`tab ${sub === 'month' ? 'on' : ''}`}
          onClick={() => setSub('month')}
        >
          月表
        </button>
        <button
          type="button"
          className={`tab ${sub === 'summary' ? 'on' : ''}`}
          onClick={() => setSub('summary')}
        >
          員工總出工及薪水計算
        </button>
      </div>

      {sub === 'month' && (
        <FieldworkQuickSection
          staffPickerKeys={staffPickerBookwide}
          salaryBook={salaryBook}
          months={months}
          setSalaryBook={setSalaryBook}
          setMonths={setMonths}
        />
      )}

      {sub === 'summary' && (
        <section className="card">
          <h3>員工總出工及薪水計算</h3>
          <label className="payrollSummaryOptionRow">
            <input
              type="checkbox"
              checked={showDailyMoney}
              onChange={(e) => setShowDailyMoney(e.target.checked)}
            />
            <span>
              顯示總表明細之「逐日金額」（預支、格線薪水、加班費、調工薪水等；預設關閉，僅列有帳之日期）
            </span>
          </label>
          <div className="tableScroll tableScrollSticky">
            <table className="data tight payrollSummaryTable">
              <thead>
                <tr>
                  <th>項目</th>
                  {salaryBook.periodColumns.map((p, i) => (
                    <th key={`${p.startIso}-${p.endIso}-${i}`}>{p.label}</th>
                  ))}
                </tr>
              </thead>
              {summaryRowGroups.map((group) => {
                const sectionTitle = summaryGroupSectionTitle(group)
                const isOpen = openSummarySections.has(sectionTitle)
                const colCount = 1 + salaryBook.periodColumns.length
                return (
                  <Fragment key={group[0]?.key ?? sectionTitle}>
                    <tbody className="payrollSummarySectionHeader">
                      <tr>
                        <td colSpan={colCount} className="payrollSectionHeadBar">
                          <button
                            type="button"
                            className="payrollSectionHeadBtn"
                            onClick={() => toggleSummarySection(sectionTitle)}
                            aria-expanded={isOpen}
                          >
                            <span className="payrollSectionHeadChev" aria-hidden>
                              {isOpen ? '▼' : '▶'}
                            </span>
                            {sectionTitle}
                          </button>
                        </td>
                      </tr>
                    </tbody>
                    {isOpen && (
                      <tbody className="payrollSummarySection" key={`${group[0]?.key}-body`}>
                        {group.map((r) => (
                          <tr
                            key={r.key}
                            className={
                              r.label.includes('總計') ? 'payrollGrandRow' : undefined
                            }
                          >
                            <PayrollSummaryPopoverCell
                              cellContent={r.label}
                              breakdownLines={salaryBook.periodColumns.map((p, i) => ({
                                label: p.label,
                                amount: r.cols[i] ?? 0,
                              }))}
                              hintTitle={`${r.label}（各分期金額）`}
                              showValueFooter={false}
                            />
                            {r.cols.map((v, i) => {
                              const rounded = Math.round(v * 100) / 100
                              const period = salaryBook.periodColumns[i]
                              return (
                                <PayrollSummaryPopoverCell
                                  key={i}
                                  className="num"
                                  cellContent={rounded}
                                  summaryAmount={rounded}
                                  breakdownLines={r.cellBreakdowns?.[i]}
                                  footerTotalsLines={
                                    r.key.startsWith('net-') && period
                                      ? payrollSummaryTooltipFooterTotals(
                                          salaryBook,
                                          period,
                                          r.key,
                                        )
                                      : undefined
                                  }
                                  hintTitle={`${r.label} — ${period?.label ?? `欄${i + 1}`}`}
                                />
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    )}
                  </Fragment>
                )
              })}
            </table>
          </div>
        </section>
      )}

      {sub === 'month' && (
        <>
          <div className="btnRow" style={{ marginBottom: 12 }}>
            <label>
              目前月表
              <select
                value={activeMonthId}
                onChange={(e) => setActiveMonthId(e.target.value)}
              >
                {salaryBook.months.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn danger ghost"
              disabled={salaryBook.months.length <= 1}
              onClick={() => removeMonth(activeMonthId)}
            >
              刪除此月
            </button>
          </div>

          <section className="card">
            <h3>鈞泩／蔡董日薪（本表）</h3>
            <p className="hint">
              姓名欄可直接修改，游標移開後套用（<strong>全書各月</strong>一併更名）。下方可新增／刪除人員；刪除會清除全書該員日薪與格線等資料。新案場區塊會帶入目前月表所有人員列。
              <strong>蔡董日薪</strong>僅用於<strong>蔡董調工薪水</strong>與<strong>蔡董加班費</strong>換算；案場格線不計蔡董薪水（總表「蔡董薪水(未扣預支)」為 0）。
            </p>
            <div className="tableScroll tableScrollSticky">
              <table className="data">
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>鈞泩薪水</th>
                    <th>蔡董薪水</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {staffOrder.map((name) => (
                    <tr key={name}>
                      <td>
                        <input
                          type="text"
                          className="titleInput"
                          defaultValue={name}
                          aria-label={`${name} 姓名`}
                          onBlur={(e) => {
                            const v = e.target.value.trim()
                            if (!v || v === name) {
                              e.currentTarget.value = name
                              return
                            }
                            const r = renameWorkerInBook(salaryBook, name, v)
                            if (!r.ok) {
                              alert(r.message)
                              e.currentTarget.value = name
                              return
                            }
                            setSalaryBook(() => r.book)
                          }}
                        />
                      </td>
                      <td>
                        <PayrollNumberInput
                          value={month.rateJun[name] ?? 0}
                          onCommit={(nv) =>
                            patchMonth(month.id, (m) => ({
                              ...m,
                              rateJun: {
                                ...m.rateJun,
                                [name]: nv,
                              },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <PayrollNumberInput
                          value={month.rateTsai[name] ?? 0}
                          onCommit={(nv) =>
                            patchMonth(month.id, (m) => ({
                              ...m,
                              rateTsai: {
                                ...m.rateTsai,
                                [name]: nv,
                              },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn danger ghost"
                          onClick={() => {
                            if (
                              !window.confirm(
                                `確定刪除「${name}」？\n將清除全書各月該員之日薪、案場格線、預支、調工、加班等資料。`,
                              )
                            )
                              return
                            const r = removeWorkerFromBook(salaryBook, name)
                            if (!r.ok) {
                              alert(r.message)
                              return
                            }
                            setSalaryBook(() => r.book)
                            alert(r.message)
                          }}
                        >
                          刪除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="btnRow" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
              <input
                type="text"
                placeholder="新姓名"
                value={newStaffName}
                onChange={(e) => setNewStaffName(e.target.value)}
                style={{ maxWidth: 200 }}
              />
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  const r = addWorkerToBook(salaryBook, newStaffName)
                  if (!r.ok) {
                    alert(r.message)
                    return
                  }
                  setSalaryBook(() => r.book)
                  setNewStaffName('')
                  alert(r.message)
                }}
              >
                新增人員（全書各月）
              </button>
            </div>
          </section>

          {month.blocks.map((block, bi) => (
            <section key={block.id} className="card">
              <div className="panelHead">
                <input
                  className="titleInput"
                  value={block.siteName}
                  onFocus={() => {
                    siteRenameSnapRef.current = {
                      monthId: month.id,
                      bi,
                      oldTrim: block.siteName.trim(),
                      oldRaw: block.siteName,
                    }
                  }}
                  onChange={(e) => {
                    const v = e.target.value
                    patchMonth(month.id, (m) => ({
                      ...m,
                      blocks: m.blocks.map((b, j) =>
                        j === bi ? { ...b, siteName: v } : b,
                      ),
                    }))
                  }}
                  onBlur={(e) => {
                    const snap = siteRenameSnapRef.current
                    siteRenameSnapRef.current = null
                    if (!snap || snap.monthId !== month.id || snap.bi !== bi) return
                    const newT = e.target.value.trim()
                    setSalaryBook((prev) => {
                      const r = renameSiteAcrossBook(prev, snap.oldTrim, newT, {
                        monthId: month.id,
                        blockIndex: bi,
                      })
                      if (!r.ok) {
                        queueMicrotask(() => alert(r.message))
                        return {
                          ...prev,
                          months: prev.months.map((m) =>
                            m.id !== snap.monthId
                              ? m
                              : {
                                  ...m,
                                  blocks: m.blocks.map((b, j) =>
                                    j === snap.bi ? { ...b, siteName: snap.oldRaw } : b,
                                  ),
                                },
                          ),
                        }
                      }
                      if (
                        r.message === '名稱相同，無需變更。' ||
                        r.message === '無需變更。'
                      ) {
                        return prev
                      }
                      return r.book
                    })
                  }}
                  placeholder="案場名稱"
                />
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() =>
                    patchMonth(month.id, (m) => ({
                      ...m,
                      blocks: [
                        ...m.blocks,
                        emptyBlock(
                          '新案場',
                          m.dates.length,
                          staffKeysForMonthDisplay(m),
                        ),
                      ],
                    }))
                  }
                >
                  新增案場區塊
                </button>
                <button
                  type="button"
                  className="btn danger ghost"
                  disabled={month.blocks.length <= 1}
                  onClick={() =>
                    patchMonth(month.id, (m) => ({
                      ...m,
                      blocks: m.blocks.filter((_, j) => j !== bi),
                    }))
                  }
                >
                  刪除此案場
                </button>
              </div>
              <p className="hint">
                區塊合計(P)：{Math.round(blockGrandPay(block, staffOrder, month.rateJun))}
                ；數值大於 0 的出工／餐費格與該日欄標頭以紅字標示。
                全月出工天數合計為 0 者，不顯示人員列；可從「快速登記」寫入格線後即出現。
                案場名稱請編輯後按 Tab 或點他處完成輸入，會依<strong>您開始編輯時的案名</strong>同步全書各月所有同名區塊（放樣估價案名選單亦跟著更新）。
              </p>
              <div className="tableScroll tableScrollSticky">
                <table className="data tight">
                  <thead>
                    <tr>
                      <th />
                      {month.dates.map((d, j) => {
                        const colHasStaffWork = staffOrder.some((nm) => {
                          const g = padArray(block.grid[nm], month.dates.length)
                          return (g[j] ?? 0) > 0
                        })
                        return (
                          <th
                            key={d}
                            className={`dtCol${colHasStaffWork ? ' dtCol--hasWork' : ''}`}
                          >
                            {d.slice(5).replace('-', '/')}
                          </th>
                        )
                      })}
                      <th className="payrollGrandHead">總天數</th>
                      <th className="payrollGrandHead">總計(P)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffOrder
                      .filter((name) =>
                        staffHasBlockWork(block, name, month.dates.length),
                      )
                      .map((name) => {
                        const row = padArray(block.grid[name], month.dates.length)
                        const days = staffTotalDays(row)
                        const pay = staffTotalPay(days, month.rateJun[name] ?? 0)
                        return (
                          <tr key={name}>
                            <td>{name}</td>
                            {month.dates.map((_, j) => {
                              const cell = row[j] ?? 0
                              const hasWork = cell > 0 && Number.isFinite(cell)
                              return (
                                <td key={j}>
                                  <PayrollNumberInput
                                    className={`cellIn${hasWork ? ' cellIn--work' : ''}`}
                                    value={row[j] ?? 0}
                                    onCommit={(nv) =>
                                      patchMonth(month.id, (m) => ({
                                        ...m,
                                        blocks: m.blocks.map((b, k) => {
                                          if (k !== bi) return b
                                          const g = { ...b.grid, [name]: [...row] }
                                          g[name][j] = nv
                                          return { ...b, grid: g }
                                        }),
                                      }))
                                    }
                                  />
                                </td>
                              )
                            })}
                            <td className="num payrollGrandCell">{days}</td>
                            <td className="num payrollGrandCell">{Math.round(pay)}</td>
                          </tr>
                        )
                      })}
                    <tr>
                      <td>餐</td>
                      {month.dates.map((_, j) => {
                        const mealCell = padArray(block.meal, month.dates.length)[j] ?? 0
                        const hasMeal = mealCell > 0 && Number.isFinite(mealCell)
                        return (
                          <td key={j}>
                            <PayrollNumberInput
                              className={`cellIn${hasMeal ? ' cellIn--meal' : ''}`}
                              value={padArray(block.meal, month.dates.length)[j] ?? 0}
                              onCommit={(nv) =>
                                patchMonth(month.id, (m) => ({
                                  ...m,
                                  blocks: m.blocks.map((b, k) => {
                                    if (k !== bi) return b
                                    const meal = [...padArray(b.meal, m.dates.length)]
                                    meal[j] = nv
                                    return { ...b, meal }
                                  }),
                                }))
                              }
                            />
                          </td>
                        )
                      })}
                      <td className="num payrollGrandCell">—</td>
                      <td className="num payrollGrandCell">
                        {Math.round(mealTotalPay(block.meal))}
                      </td>
                    </tr>
                    <tr className="payrollGrandRow">
                      <th scope="row">總計©</th>
                      {blockDayColumnTotals(block, staffOrder, month.dates.length).map(
                        (v, j) => (
                          <td
                            key={j}
                            className={`num${v > 0 ? ' num--dayHasWork' : ''}`}
                          >
                            {v}
                          </td>
                        ),
                      )}
                      <td className="num payrollGrandCell">
                        {staffOrder.reduce(
                          (s, n) => s + staffTotalDays(padArray(block.grid[n], month.dates.length)),
                          0,
                        )}
                      </td>
                      <td className="num payrollGrandCell">
                        {Math.round(blockGrandPay(block, staffOrder, month.rateJun))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          <section className="card">
            <h3>總出工數（跨案場加總，與 Excel 同欄對齊）</h3>
            <p className="hint">
              下列每日格為 1、0.5、0 等數字處：數值<strong>大於 0</strong>的欄位與日期標頭以<strong>紅字</strong>標示。
            </p>
            <div className="tableScroll tableScrollSticky">
              <table className="data tight">
                <thead>
                  <tr>
                    <th />
                    {month.dates.map((d, j) => {
                      const colHasWork = staffOrder.some((nm) => {
                        const r = grand.staffRows[nm] ?? []
                        return (r[j] ?? 0) > 0
                      })
                      return (
                        <th
                          key={d}
                          className={`dtCol${colHasWork ? ' dtCol--hasWork' : ''}`}
                        >
                          {d.slice(5)}
                        </th>
                      )
                    })}
                    <th className="payrollGrandHead">總天數</th>
                    <th className="payrollGrandHead">總計(P)</th>
                  </tr>
                </thead>
                <tbody>
                  {staffOrder.map((name) => {
                    const row = grand.staffRows[name] ?? []
                    const days = staffTotalDays(row)
                    const pay = staffTotalPay(days, month.rateJun[name] ?? 0)
                    return (
                      <tr key={name}>
                        <td>{name}</td>
                        {month.dates.map((_, j) => {
                          const cell = row[j] ?? 0
                          const has = cell > 0 && Number.isFinite(cell)
                          return (
                            <td key={j} className={`num${has ? ' num--dayHasWork' : ''}`}>
                              {cell}
                            </td>
                          )
                        })}
                        <td className="num payrollGrandCell">{days}</td>
                        <td className="num payrollGrandCell">{Math.round(pay)}</td>
                      </tr>
                    )
                  })}
                  <tr>
                    <td>餐</td>
                    {month.dates.map((_, j) => {
                      const mealCell = grand.mealRow[j] ?? 0
                      const hasMeal = mealCell > 0 && Number.isFinite(mealCell)
                      return (
                        <td
                          key={j}
                          className={`num${hasMeal ? ' num--mealValue' : ''}`}
                        >
                          {mealCell}
                        </td>
                      )
                    })}
                    <td className="num payrollGrandCell">—</td>
                    <td className="num payrollGrandCell">{Math.round(grand.mealPay)}</td>
                  </tr>
                  <tr className="payrollGrandRow">
                    <th scope="row">總計</th>
                    {month.dates.map((_, j) => {
                      const v = colSumStaffGrid(
                        staffOrder,
                        month.dates.length,
                        j,
                        (n) => grand.staffRows[n],
                      )
                      const has = v > 0 && Number.isFinite(v)
                      return (
                        <td key={j} className={`num${has ? ' num--dayHasWork' : ''}`}>
                          {fmtSum(v)}
                        </td>
                      )
                    })}
                    <td className="num payrollGrandCell">
                      {fmtSum(
                        staffOrder.reduce((s, n) => s + grand.staffTotalsDays[n], 0),
                      )}
                    </td>
                    <td className="num payrollGrandCell">
                      {Math.round(
                        staffOrder.reduce((s, n) => s + grand.staffTotalsPay[n], 0) +
                          grand.mealPay,
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h3>預支（與日期欄同寬，金額）</h3>
            <div className="tableScroll tableScrollSticky">
              <table className="data tight">
                <thead>
                  <tr>
                    <th />
                    {month.dates.map((d, j) => (
                      <th
                        key={d}
                        className={`dtCol${colHasPositiveInGrid(staffOrder, month.dates.length, j, (n) => month.advances[n]) ? ' dtCol--hasWork' : ''}`}
                      >
                        {d.slice(5)}
                      </th>
                    ))}
                    <th className="dtCol payrollGrandHead">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {staffOrder.map((name) => (
                    <tr key={name}>
                      <td>{name}</td>
                      {month.dates.map((_, j) => {
                        const advCell = month.advances[name]?.[j] ?? 0
                        const advHas = cellNeedsWorkHighlight(advCell)
                        return (
                        <td key={j}>
                          <PayrollNumberInput
                            className={`cellIn${advHas ? ' cellIn--work' : ''}`}
                            value={month.advances[name]?.[j] ?? 0}
                            onCommit={(nv) =>
                              patchMonth(month.id, (m) => {
                                const adv = { ...m.advances }
                                const row = [...padArray(adv[name], m.dates.length)]
                                row[j] = nv
                                adv[name] = row
                                return { ...m, advances: adv }
                              })
                            }
                          />
                        </td>
                        )
                      })}
                      <td className="num payrollGrandCell">
                        {fmtSum(sumRowCells(month.advances[name], month.dates.length))}
                      </td>
                    </tr>
                  ))}
                  <tr className="payrollGrandRow">
                    <th scope="row">總計</th>
                    {month.dates.map((_, j) => {
                      const colSum = colSumStaffGrid(
                        staffOrder,
                        month.dates.length,
                        j,
                        (n) => month.advances[n],
                      )
                      return (
                      <td
                        key={j}
                        className={`num${cellNeedsWorkHighlight(colSum) ? ' num--dayHasWork' : ''}`}
                      >
                        {fmtSum(colSum)}
                      </td>
                      )
                    })}
                    <td className="num payrollGrandCell">
                      {fmtSum(
                        staffOrder.reduce(
                          (s, n) => s + sumRowCells(month.advances[n], month.dates.length),
                          0,
                        ),
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h3>調工（天／日期欄，鈞泩日薪）</h3>
            <div className="tableScroll tableScrollSticky">
              <table className="data tight">
                <thead>
                  <tr>
                    <th />
                    {month.dates.map((d, j) => (
                      <th
                        key={d}
                        className={`dtCol${colHasPositiveInGrid(staffOrder, month.dates.length, j, (n) => month.junAdjustDays?.[n]) ? ' dtCol--hasWork' : ''}`}
                      >
                        {d.slice(5)}
                      </th>
                    ))}
                    <th className="dtCol payrollGrandHead">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {staffOrder.map((name) => (
                    <tr key={name}>
                      <td>{name}</td>
                      {month.dates.map((_, j) => {
                        const junAdjCell = month.junAdjustDays?.[name]?.[j] ?? 0
                        const junAdjHas = cellNeedsWorkHighlight(junAdjCell)
                        return (
                        <td key={j}>
                          <PayrollNumberInput
                            className={`cellIn${junAdjHas ? ' cellIn--work' : ''}`}
                            value={month.junAdjustDays?.[name]?.[j] ?? 0}
                            onCommit={(nv) =>
                              patchMonth(month.id, (m) => {
                                const g = { ...m.junAdjustDays }
                                const row = [...padArray(g[name], m.dates.length)]
                                row[j] = nv
                                g[name] = row
                                return { ...m, junAdjustDays: g }
                              })
                            }
                          />
                        </td>
                        )
                      })}
                      <td className="num payrollGrandCell">
                        {fmtSum(sumRowCells(month.junAdjustDays?.[name], month.dates.length))}
                      </td>
                    </tr>
                  ))}
                  <tr className="payrollGrandRow">
                    <th scope="row">總計</th>
                    {month.dates.map((_, j) => {
                      const colSum = colSumStaffGrid(
                        staffOrder,
                        month.dates.length,
                        j,
                        (n) => month.junAdjustDays?.[n],
                      )
                      return (
                      <td
                        key={j}
                        className={`num${cellNeedsWorkHighlight(colSum) ? ' num--dayHasWork' : ''}`}
                      >
                        {fmtSum(colSum)}
                      </td>
                      )
                    })}
                    <td className="num payrollGrandCell">
                      {fmtSum(
                        staffOrder.reduce(
                          (s, n) =>
                            s + sumRowCells(month.junAdjustDays?.[n], month.dates.length),
                          0,
                        ),
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h3>蔡董調工（天／日期欄，蔡董日薪）</h3>
            <div className="tableScroll tableScrollSticky">
              <table className="data tight">
                <thead>
                  <tr>
                    <th />
                    {month.dates.map((d, j) => (
                      <th
                        key={d}
                        className={`dtCol${colHasPositiveInGrid(staffOrder, month.dates.length, j, (n) => month.tsaiAdjustDays?.[n]) ? ' dtCol--hasWork' : ''}`}
                      >
                        {d.slice(5)}
                      </th>
                    ))}
                    <th className="dtCol payrollGrandHead">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {staffOrder.map((name) => (
                    <tr key={name}>
                      <td>{name}</td>
                      {month.dates.map((_, j) => {
                        const tsaiAdjCell = month.tsaiAdjustDays?.[name]?.[j] ?? 0
                        const tsaiAdjHas = cellNeedsWorkHighlight(tsaiAdjCell)
                        return (
                        <td key={j}>
                          <PayrollNumberInput
                            className={`cellIn${tsaiAdjHas ? ' cellIn--work' : ''}`}
                            value={month.tsaiAdjustDays?.[name]?.[j] ?? 0}
                            onCommit={(nv) =>
                              patchMonth(month.id, (m) => {
                                const g = { ...m.tsaiAdjustDays }
                                const row = [...padArray(g[name], m.dates.length)]
                                row[j] = nv
                                g[name] = row
                                return { ...m, tsaiAdjustDays: g }
                              })
                            }
                          />
                        </td>
                        )
                      })}
                      <td className="num payrollGrandCell">
                        {fmtSum(sumRowCells(month.tsaiAdjustDays?.[name], month.dates.length))}
                      </td>
                    </tr>
                  ))}
                  <tr className="payrollGrandRow">
                    <th scope="row">總計</th>
                    {month.dates.map((_, j) => {
                      const colSum = colSumStaffGrid(
                        staffOrder,
                        month.dates.length,
                        j,
                        (n) => month.tsaiAdjustDays?.[n],
                      )
                      return (
                      <td
                        key={j}
                        className={`num${cellNeedsWorkHighlight(colSum) ? ' num--dayHasWork' : ''}`}
                      >
                        {fmtSum(colSum)}
                      </td>
                      )
                    })}
                    <td className="num payrollGrandCell">
                      {fmtSum(
                        staffOrder.reduce(
                          (s, n) =>
                            s + sumRowCells(month.tsaiAdjustDays?.[n], month.dates.length),
                          0,
                        ),
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h3>鈞泩加班（時數／日期欄）</h3>
            <div className="tableScroll tableScrollSticky">
              <table className="data tight">
                <thead>
                  <tr>
                    <th />
                    {month.dates.map((d, j) => (
                      <th
                        key={d}
                        className={`dtCol${colHasPositiveInGrid(staffOrder, month.dates.length, j, (n) => month.junOtHours[n]) ? ' dtCol--hasWork' : ''}`}
                      >
                        {d.slice(5)}
                      </th>
                    ))}
                    <th className="dtCol payrollGrandHead">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {staffOrder.map((name) => (
                    <tr key={name}>
                      <td>{name}</td>
                      {month.dates.map((_, j) => {
                        const junOtCell = month.junOtHours[name]?.[j] ?? 0
                        const junOtHas = cellNeedsWorkHighlight(junOtCell)
                        return (
                        <td key={j}>
                          <PayrollNumberInput
                            className={`cellIn${junOtHas ? ' cellIn--work' : ''}`}
                            value={month.junOtHours[name]?.[j] ?? 0}
                            onCommit={(nv) =>
                              patchMonth(month.id, (m) => {
                                const ot = { ...m.junOtHours }
                                const row = [...padArray(ot[name], m.dates.length)]
                                row[j] = nv
                                ot[name] = row
                                return { ...m, junOtHours: ot }
                              })
                            }
                          />
                        </td>
                        )
                      })}
                      <td className="num payrollGrandCell">
                        {fmtSum(sumRowCells(month.junOtHours[name], month.dates.length))}
                      </td>
                    </tr>
                  ))}
                  <tr className="payrollGrandRow">
                    <th scope="row">總計</th>
                    {month.dates.map((_, j) => {
                      const colSum = colSumStaffGrid(
                        staffOrder,
                        month.dates.length,
                        j,
                        (n) => month.junOtHours[n],
                      )
                      return (
                      <td
                        key={j}
                        className={`num${cellNeedsWorkHighlight(colSum) ? ' num--dayHasWork' : ''}`}
                      >
                        {fmtSum(colSum)}
                      </td>
                      )
                    })}
                    <td className="num payrollGrandCell">
                      {fmtSum(
                        staffOrder.reduce(
                          (s, n) => s + sumRowCells(month.junOtHours[n], month.dates.length),
                          0,
                        ),
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h3>蔡董加班（時數／日期欄）</h3>
            <div className="tableScroll tableScrollSticky">
              <table className="data tight">
                <thead>
                  <tr>
                    <th />
                    {month.dates.map((d, j) => (
                      <th
                        key={d}
                        className={`dtCol${colHasPositiveInGrid(staffOrder, month.dates.length, j, (n) => month.tsaiOtHours[n]) ? ' dtCol--hasWork' : ''}`}
                      >
                        {d.slice(5)}
                      </th>
                    ))}
                    <th className="dtCol payrollGrandHead">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {staffOrder.map((name) => (
                    <tr key={name}>
                      <td>{name}</td>
                      {month.dates.map((_, j) => {
                        const tsaiOtCell = month.tsaiOtHours[name]?.[j] ?? 0
                        const tsaiOtHas = cellNeedsWorkHighlight(tsaiOtCell)
                        return (
                        <td key={j}>
                          <PayrollNumberInput
                            className={`cellIn${tsaiOtHas ? ' cellIn--work' : ''}`}
                            value={month.tsaiOtHours[name]?.[j] ?? 0}
                            onCommit={(nv) =>
                              patchMonth(month.id, (m) => {
                                const ot = { ...m.tsaiOtHours }
                                const row = [...padArray(ot[name], m.dates.length)]
                                row[j] = nv
                                ot[name] = row
                                return { ...m, tsaiOtHours: ot }
                              })
                            }
                          />
                        </td>
                        )
                      })}
                      <td className="num payrollGrandCell">
                        {fmtSum(sumRowCells(month.tsaiOtHours[name], month.dates.length))}
                      </td>
                    </tr>
                  ))}
                  <tr className="payrollGrandRow">
                    <th scope="row">總計</th>
                    {month.dates.map((_, j) => {
                      const colSum = colSumStaffGrid(
                        staffOrder,
                        month.dates.length,
                        j,
                        (n) => month.tsaiOtHours[n],
                      )
                      return (
                      <td
                        key={j}
                        className={`num${cellNeedsWorkHighlight(colSum) ? ' num--dayHasWork' : ''}`}
                      >
                        {fmtSum(colSum)}
                      </td>
                      )
                    })}
                    <td className="num payrollGrandCell">
                      {fmtSum(
                        staffOrder.reduce(
                          (s, n) => s + sumRowCells(month.tsaiOtHours[n], month.dates.length),
                          0,
                        ),
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
