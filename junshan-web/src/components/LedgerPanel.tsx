import { useMemo } from 'react'
import {
  computeMonth,
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
  const runningGross = useMemo(() => {
    const out: number[] = []
    let acc = 0
    for (const r of rows) {
      acc += r.grossProfit
      out.push(acc)
    }
    return out
  }, [rows])
  const run = useMemo(() => runningCumulative(months), [months])
  const averages = useMemo(() => {
    const divisor = 12
    const grossSum = rows.reduce((sum, r) => sum + r.grossProfit, 0)
    const grossRunningSum = runningGross.reduce((sum, v) => sum + v, 0)
    const grossMarginSum = rows.reduce(
      (sum, r) => sum + (r.revenueNet !== 0 ? r.grossProfit / r.revenueNet : 0),
      0,
    )
    const netSum = rows.reduce((sum, r) => sum + r.operatingIncome, 0)
    const netRunningSum = run.reduce((sum, v) => sum + v, 0)
    const netMarginSum = rows.reduce(
      (sum, r) => sum + (r.revenueNet !== 0 ? r.operatingIncome / r.revenueNet : 0),
      0,
    )
    return {
      gross: grossSum / divisor,
      grossRunning: grossRunningSum / divisor,
      grossMargin: grossMarginSum / divisor,
      net: netSum / divisor,
      netRunning: netRunningSum / divisor,
      netMargin: netMarginSum / divisor,
    }
  }, [rows, run, runningGross])
  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => {
          acc.revenueNet += r.revenueNet
          acc.tax += r.tax
          acc.junLaborWithOt += r.junLaborWithOt
          acc.meals += r.meals
          acc.tools += r.tools
          acc.costOfGoodsSold += r.costOfGoodsSold
          acc.bossSalary += r.bossSalary
          acc.accountingFee += r.accountingFee
          acc.registeredAddressRent += r.registeredAddressRent
          acc.instrument += r.instrument
          acc.operatingExpenses += r.operatingExpenses
          return acc
        },
        {
          revenueNet: 0,
          tax: 0,
          junLaborWithOt: 0,
          meals: 0,
          tools: 0,
          costOfGoodsSold: 0,
          bossSalary: 0,
          accountingFee: 0,
          registeredAddressRent: 0,
          instrument: 0,
          operatingExpenses: 0,
        },
      ),
    [rows],
  )

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
        <strong>營業收入</strong>以<strong>未稅</strong>為準；<strong>稅金</strong>為業主吸收、稅外加之<strong>記錄</strong>，不列入收入與<strong>淨利</strong>。
        <strong>鈞泩薪水(含加班)</strong>＝格線薪＋鈞泩加班費（損益表單列口徑）。
        <strong>銷貨成本</strong>＝鈞泩薪水(含加班)＋餐費＋工具；<strong>毛利</strong>＝營業收入−銷貨成本；<strong>營業費用</strong>＝老闆薪＋會計費＋營登租金＋儀器；<strong>淨利</strong>＝毛利−營業費用（即營業利益）。
        除老闆薪、會計費、營登租金外，其餘由月表／收帳／工作日誌自動帶入（工具＝日誌工具支出加總、儀器＝日誌儀器支出；本表口徑列入營業費用）。
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
                <th colSpan={4} scope="colgroup">
                  銷貨成本
                </th>
                <th
                  rowSpan={2}
                  scope="col"
                  className="ledgerKpiGrossHead"
                  title="營業收入(未稅)−銷貨成本"
                >
                  毛利
                </th>
                <th
                  rowSpan={2}
                  scope="col"
                  className="ledgerKpiGrossHead"
                  title="各月毛利之累計"
                >
                  毛利累積
                </th>
                <th
                  rowSpan={2}
                  scope="col"
                  className="ledgerKpiGrossHead"
                  title="毛利率＝毛利／營業收入(未稅)"
                >
                  毛利率
                </th>
                <th colSpan={5} scope="colgroup" title="老闆薪＋會計費＋營登租金＋儀器">
                  營業費用
                </th>
                <th
                  rowSpan={2}
                  scope="col"
                  className="ledgerKpiNetHead"
                  title="毛利−營業費用（即營業利益）"
                >
                  淨利
                </th>
                <th
                  rowSpan={2}
                  scope="col"
                  className="ledgerKpiNetHead"
                  title="各月淨利之累計"
                >
                  累計淨利
                </th>
                <th
                  rowSpan={2}
                  scope="col"
                  className="ledgerKpiNetHead"
                  title="淨利率＝淨利／營業收入(未稅)"
                >
                  淨利率
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
                <th scope="col" title="上列銷貨成本加總">
                  小計
                </th>
                <th scope="col">老闆薪</th>
                <th scope="col">會計費</th>
                <th scope="col" title="營業登記地址租金">
                  營登租金
                </th>
                <th scope="col" title="工作日誌儀器支出加總（列入營業費用）">
                  儀器
                </th>
                <th scope="col" title="老闆薪＋會計費＋營登租金＋儀器">
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
                  <td className="num" title="業主吸收、稅外加；不列入淨利">
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
                  <td className="num" title="工作日誌工具支出加總">
                    {Math.round(r.tools).toLocaleString()}
                  </td>
                  <td className="num" title="銷貨成本合計">
                    {Math.round(r.costOfGoodsSold).toLocaleString()}
                  </td>
                  <td className="num ledgerKpiGrossCell">{Math.round(r.grossProfit).toLocaleString()}</td>
                  <td className="num ledgerKpiGrossCell" title="截至該月之毛利累計">
                    {Math.round(runningGross[i] ?? 0).toLocaleString()}
                  </td>
                  <td className="num ledgerKpiGrossCell" title="毛利率＝毛利／營業收入(未稅)">
                    {r.revenueNet !== 0 ? `${((r.grossProfit / r.revenueNet) * 100).toFixed(1)}%` : '0.0%'}
                  </td>
                  <td>
                    <PayrollNumberInput
                      className="narrow"
                      value={r.bossSalary}
                      onCommit={(nv) => patch(i, { bossSalary: nv })}
                      aria-label={`${r.month} 月老闆薪`}
                    />
                  </td>
                  <td>
                    <PayrollNumberInput
                      className="narrow"
                      value={r.accountingFee}
                      onCommit={(nv) => patch(i, { accountingFee: nv })}
                      aria-label={`${r.month} 月會計費`}
                    />
                  </td>
                  <td>
                    <PayrollNumberInput
                      className="narrow"
                      value={r.registeredAddressRent}
                      onCommit={(nv) => patch(i, { registeredAddressRent: nv })}
                      aria-label={`${r.month} 月營登租金`}
                    />
                  </td>
                  <td className="num" title="工作日誌儀器支出加總（列入營業費用）">
                    {Math.round(r.instrument).toLocaleString()}
                  </td>
                  <td className="num" title="營業費用合計">
                    {Math.round(r.operatingExpenses).toLocaleString()}
                  </td>
                  <td className="num ledgerKpiNetCell" title="毛利−營業費用（營業利益）">
                    {Math.round(r.operatingIncome).toLocaleString()}
                  </td>
                  <td className="num ledgerKpiNetCell" title="截至該月之淨利累計">
                    {Math.round(run[i] ?? 0).toLocaleString()}
                  </td>
                  <td className="num ledgerKpiNetCell" title="淨利率＝淨利／營業收入(未稅)">
                    {r.revenueNet !== 0 ? `${((r.operatingIncome / r.revenueNet) * 100).toFixed(1)}%` : '0.0%'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th title="所有項目年度總結">總計項目</th>
                <th className="num">{Math.round(totals.revenueNet).toLocaleString()}</th>
                <th className="num">{Math.round(totals.tax).toLocaleString()}</th>
                <th className="num">{Math.round(totals.junLaborWithOt).toLocaleString()}</th>
                <th className="num">{Math.round(totals.meals).toLocaleString()}</th>
                <th className="num">{Math.round(totals.tools).toLocaleString()}</th>
                <th className="num">{Math.round(totals.costOfGoodsSold).toLocaleString()}</th>
                <th className="num">—</th>
                <th className="num">—</th>
                <th className="num">—</th>
                <th className="num">{Math.round(totals.bossSalary).toLocaleString()}</th>
                <th className="num">{Math.round(totals.accountingFee).toLocaleString()}</th>
                <th className="num">{Math.round(totals.registeredAddressRent).toLocaleString()}</th>
                <th className="num">{Math.round(totals.instrument).toLocaleString()}</th>
                <th className="num">{Math.round(totals.operatingExpenses).toLocaleString()}</th>
                <th className="num">—</th>
                <th className="num">—</th>
                <th className="num">—</th>
              </tr>
              <tr>
                <th title="年度平均（固定除以 12 個月份）">平均（12月）</th>
                <th className="num">—</th>
                <th className="num">—</th>
                <th className="num">—</th>
                <th className="num">—</th>
                <th className="num">—</th>
                <th className="num">—</th>
                <th className="num ledgerKpiGrossCell">{Math.round(averages.gross).toLocaleString()}</th>
                <th className="num ledgerKpiGrossCell">—</th>
                <th className="num ledgerKpiGrossCell">{(averages.grossMargin * 100).toFixed(1)}%</th>
                <th className="num">—</th>
                <th className="num">—</th>
                <th className="num">—</th>
                <th className="num">—</th>
                <th className="num">—</th>
                <th className="num ledgerKpiNetCell">{Math.round(averages.net).toLocaleString()}</th>
                <th className="num ledgerKpiNetCell">—</th>
                <th className="num ledgerKpiNetCell">{(averages.netMargin * 100).toFixed(1)}%</th>
              </tr>
            </tfoot>
          </table>
        </div>
      </fieldset>
    </div>
  )
}
