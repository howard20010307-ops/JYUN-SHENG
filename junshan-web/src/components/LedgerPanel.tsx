import { useMemo } from 'react'
import {
  computeMonth,
  cumulativeProfit,
  runningCumulative,
  type MonthLine,
} from '../domain/ledgerEngine'
import type { ReceivablesState } from '../domain/receivablesModel'
import type { SalaryBook } from '../domain/salaryExcelModel'
import {
  inferPayrollYearFromBook,
  inferYearFromMonthSheet,
} from '../domain/salaryExcelModel'
import type { WorkLogState } from '../domain/workLogModel'
import { PayrollNumberInput } from './PayrollNumberInput'

type Props = {
  months: MonthLine[]
  setMonths: (m: MonthLine[]) => void
  ledgerYear: number
  setLedgerYear: (y: number) => void
  salaryBook: SalaryBook
  receivables: ReceivablesState
  workLog: WorkLogState
  canEdit: boolean
}

export function LedgerPanel({
  months,
  setMonths,
  ledgerYear,
  setLedgerYear,
  salaryBook,
  receivables,
  workLog,
  canEdit,
}: Props) {
  const rows = useMemo(() => months.map((m) => computeMonth(m)), [months])
  const run = useMemo(() => runningCumulative(months), [months])
  const total = useMemo(() => cumulativeProfit(months), [months])

  const yearOptions = useMemo(() => {
    const s = new Set<number>()
    s.add(ledgerYear)
    s.add(inferPayrollYearFromBook(salaryBook))
    s.add(new Date().getFullYear())
    for (const m of salaryBook.months) s.add(inferYearFromMonthSheet(m))
    for (const e of receivables.entries) {
      const d = e.bookedDate
      if (typeof d === 'string' && /^\d{4}/.test(d)) {
        const y = Number.parseInt(d.slice(0, 4), 10)
        if (Number.isFinite(y)) s.add(y)
      }
    }
    for (const d of workLog.dayDocuments ?? []) {
      const t = d.logDate
      if (typeof t === 'string' && /^\d{4}/.test(t)) {
        const y = Number.parseInt(t.slice(0, 4), 10)
        if (Number.isFinite(y)) s.add(y)
      }
    }
    for (const e of workLog.entries ?? []) {
      const t = e.logDate
      if (typeof t === 'string' && /^\d{4}/.test(t)) {
        const y = Number.parseInt(t.slice(0, 4), 10)
        if (Number.isFinite(y)) s.add(y)
      }
    }
    const list = [...s].filter((y) => y >= 2000 && y <= 2100).sort((a, b) => a - b)
    if (!list.includes(ledgerYear) && ledgerYear >= 2000 && ledgerYear <= 2100) {
      list.push(ledgerYear)
      list.sort((a, b) => a - b)
    }
    return list
  }, [ledgerYear, salaryBook, receivables.entries, workLog])

  function patch(i: number, p: Partial<MonthLine>) {
    setMonths(months.map((m, j) => (j === i ? { ...m, ...p } : m)))
  }

  return (
    <div className="panel ledgerPanel">
      <h2>公司帳（總成本／損益）</h2>
      <div className="btnRow" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>檢視年度</span>
          <select
            value={ledgerYear}
            onChange={(e) => setLedgerYear(Number.parseInt(e.target.value, 10))}
            title="切換後，鈞泩薪水／加班費（鈞泩）／餐費／工具（日誌雜項）／工程款／稅金會依該西元年重算帶入"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y} 年
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint">
        結餘（本期）＝（工程款未稅＋稅金）−
        總成本；總成本＝<strong>鈞泩薪水(未扣預支)</strong>＋加班費＋餐費＋工具＋老闆薪水＋儀器損耗（
        <strong>鈞泩薪水、鈞泩加班費、餐費</strong>由薪水月表依上列年度與曆月自動加總；<strong>工具</strong>為工作日誌該月雜項加總；<strong>工程款、稅金</strong>由收帳依入帳日加總至該年同曆月；皆無需手填）。最右欄為累計盈虧。
      </p>
      <fieldset className="tabFieldset" disabled={!canEdit}>
        <div className="tableScroll">
          <table className="data tight ledgerCompanyTable">
            <thead>
              <tr>
                <th>月</th>
                <th scope="col" title="與總表「鈞泩薪水(未扣預支)」同義：格線×日薪加總，不含調工、未扣預支">
                  鈞泩薪水(未扣預支)
                </th>
                <th scope="col" title="月表鈞泩加班時數×鈞泩日薪÷8 加總（不含蔡董加班）">
                  加班費
                </th>
                <th scope="col" title="月表各案場餐列金額加總">
                  餐費
                </th>
                <th scope="col" title="工作日誌該月雜項支出加總">
                  工具
                </th>
                <th>老闆薪</th>
                <th>儀器</th>
                <th scope="col" title="收帳該月入帳未稅加總">
                  工程款
                </th>
                <th scope="col" title="收帳該月入帳稅金加總">
                  稅金
                </th>
                <th>總成本</th>
                <th>本期結餘</th>
                <th>累計盈虧</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.month}>
                  <td>{r.month} 月</td>
                  <td
                    className="num"
                    title={`依薪水月表 ${ledgerYear} 年該曆月自動加總（與總表「鈞泩薪水(未扣預支)」同義）`}
                  >
                    {Math.round(r.salary).toLocaleString()}
                  </td>
                  <td
                    className="num"
                    title={`月表鈞泩加班費加總（${ledgerYear} 年該月；不含蔡董）`}
                  >
                    {Math.round(r.overtimePay).toLocaleString()}
                  </td>
                  <td
                    className="num"
                    title={`月表餐列金額加總（${ledgerYear} 年該月）`}
                  >
                    {Math.round(r.meals).toLocaleString()}
                  </td>
                  <td
                    className="num"
                    title={`工作日誌雜項加總（${ledgerYear} 年該月）`}
                  >
                    {Math.round(r.tools).toLocaleString()}
                  </td>
                  <td>
                    <PayrollNumberInput
                      className="narrow"
                      value={r.bossSalary}
                      onCommit={(nv) => patch(i, { bossSalary: nv })}
                    />
                  </td>
                  <td>
                    <PayrollNumberInput
                      className="narrow"
                      value={r.instrument}
                      onCommit={(nv) => patch(i, { instrument: nv })}
                    />
                  </td>
                  <td
                    className="num"
                    title={`依收帳 ${ledgerYear} 年該月入帳未稅加總`}
                  >
                    {Math.round(r.revenueNet).toLocaleString()}
                  </td>
                  <td className="num" title={`依收帳 ${ledgerYear} 年該月入帳稅金加總`}>
                    {Math.round(r.tax).toLocaleString()}
                  </td>
                  <td className="num">{Math.round(r.totalCost).toLocaleString()}</td>
                  <td className="num">{Math.round(r.surplus).toLocaleString()}</td>
                  <td className="num">{Math.round(run[i] ?? 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={9}>全年累計盈虧</th>
                <th className="num" colSpan={3}>
                  {Math.round(total).toLocaleString()}
                </th>
              </tr>
            </tfoot>
          </table>
        </div>
      </fieldset>
    </div>
  )
}
