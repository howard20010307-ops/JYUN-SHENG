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
      <h2>公司損益表</h2>
      <div className="btnRow" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>檢視年度</span>
          <select
            value={ledgerYear}
            onChange={(e) => setLedgerYear(Number.parseInt(e.target.value, 10))}
            title="切換後，月表與收帳、日誌帶入之數字會依該西元年重算"
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
        <strong>營業收入</strong>以<strong>未稅</strong>為準；<strong>稅金</strong>為業主吸收、稅外加之<strong>記錄</strong>，不列入收入與營業利益。
        <strong>鈞泩薪水(含加班)</strong>＝格線薪＋鈞泩加班費（損益表單列口徑）。
        <strong>銷貨成本</strong>＝鈞泩薪水(含加班)＋餐費＋工具＋儀器；<strong>毛利</strong>＝營業收入−銷貨成本；<strong>營業費用</strong>＝老闆薪；<strong>營業利益</strong>＝毛利−營業費用。
        除老闆薪、儀器外，其餘由月表／收帳／日誌自動帶入。
      </p>
      <fieldset className="tabFieldset" disabled={!canEdit}>
        <div className="tableScroll">
          <table className="data tight ledgerCompanyTable">
            <thead>
              <tr>
                <th rowSpan={2}>月</th>
                <th colSpan={2} scope="colgroup">
                  收入
                </th>
                <th colSpan={5} scope="colgroup">
                  銷貨成本
                </th>
                <th rowSpan={2} scope="col" title="營業收入(未稅)−銷貨成本">
                  毛利
                </th>
                <th rowSpan={2} scope="col" title="現為老闆薪">
                  營業費用
                </th>
                <th rowSpan={2} scope="col" title="毛利−營業費用">
                  營業利益
                </th>
                <th rowSpan={2} scope="col">
                  累計營業利益
                </th>
              </tr>
              <tr>
                <th scope="col" title="收帳入帳未稅">
                  營業收入(未稅)
                </th>
                <th scope="col" title="外加稅金，僅記錄">
                  稅金(記錄)
                </th>
                <th scope="col" title="格線薪＋鈞泩加班費">
                  鈞泩薪水(含加班)
                </th>
                <th scope="col">餐費</th>
                <th scope="col">工具</th>
                <th scope="col">儀器</th>
                <th scope="col" title="上列銷貨成本加總">
                  小計
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.month}>
                  <td>{r.month} 月</td>
                  <td className="num" title={`收帳 ${ledgerYear} 年該月未稅`}>
                    {Math.round(r.revenueNet).toLocaleString()}
                  </td>
                  <td className="num" title="業主吸收、稅外加；不列入營業利益">
                    {Math.round(r.tax).toLocaleString()}
                  </td>
                  <td
                    className="num"
                    title={`格線薪＋鈞泩加班（${ledgerYear} 年該月）`}
                  >
                    {Math.round(r.junLaborWithOt).toLocaleString()}
                  </td>
                  <td className="num" title={`月表餐列（${ledgerYear} 年該月）`}>
                    {Math.round(r.meals).toLocaleString()}
                  </td>
                  <td className="num" title="工作日誌雜項">
                    {Math.round(r.tools).toLocaleString()}
                  </td>
                  <td>
                    <PayrollNumberInput
                      className="narrow"
                      value={r.instrument}
                      onCommit={(nv) => patch(i, { instrument: nv })}
                      aria-label={`${r.month} 月儀器使用成本`}
                    />
                  </td>
                  <td className="num" title="銷貨成本合計">
                    {Math.round(r.costOfGoodsSold).toLocaleString()}
                  </td>
                  <td className="num">{Math.round(r.grossProfit).toLocaleString()}</td>
                  <td>
                    <PayrollNumberInput
                      className="narrow"
                      value={r.bossSalary}
                      onCommit={(nv) => patch(i, { bossSalary: nv })}
                      aria-label={`${r.month} 月營業費用（老闆薪）`}
                    />
                  </td>
                  <td className="num">{Math.round(r.operatingIncome).toLocaleString()}</td>
                  <td className="num">{Math.round(run[i] ?? 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={11}>全年累計營業利益</th>
                <th className="num">{Math.round(total).toLocaleString()}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      </fieldset>
    </div>
  )
}
