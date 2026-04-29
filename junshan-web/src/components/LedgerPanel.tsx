import { useMemo } from 'react'
import {
  computeMonth,
  cumulativeProfit,
  runningCumulative,
  type MonthLine,
} from '../domain/ledgerEngine'
import { PayrollNumberInput } from './PayrollNumberInput'

type Props = {
  months: MonthLine[]
  setMonths: (m: MonthLine[]) => void
}

export function LedgerPanel({ months, setMonths }: Props) {
  const rows = useMemo(() => months.map((m) => computeMonth(m)), [months])
  const run = useMemo(() => runningCumulative(months), [months])
  const total = useMemo(() => cumulativeProfit(months), [months])

  function patch(i: number, p: Partial<MonthLine>) {
    setMonths(months.map((m, j) => (j === i ? { ...m, ...p } : m)))
  }

  return (
    <div className="panel ledgerPanel">
      <h2>公司帳（總成本／損益）</h2>
      <p className="hint">
        結餘（本期）＝（工程款未稅＋稅金）−
        總成本；總成本＝薪水＋加班費＋餐費＋工具＋老闆薪水＋儀器損耗。最右欄為累計盈虧。
      </p>
      <div className="tableScroll">
        <table className="data tight ledgerCompanyTable">
          <thead>
            <tr>
              <th>月</th>
              <th>薪水</th>
              <th>加班費</th>
              <th>餐費</th>
              <th>工具</th>
              <th>老闆薪</th>
              <th>儀器</th>
              <th>工程款</th>
              <th>稅金</th>
              <th>總成本</th>
              <th>本期結餘</th>
              <th>累計盈虧</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.month}>
                <td>{r.month} 月</td>
                <td>
                  <PayrollNumberInput
                    className="narrow"
                    value={r.salary}
                    onCommit={(nv) => patch(i, { salary: nv })}
                  />
                </td>
                <td>
                  <PayrollNumberInput
                    className="narrow"
                    value={r.overtimePay}
                    onCommit={(nv) => patch(i, { overtimePay: nv })}
                  />
                </td>
                <td>
                  <PayrollNumberInput
                    className="narrow"
                    value={r.meals}
                    onCommit={(nv) => patch(i, { meals: nv })}
                  />
                </td>
                <td>
                  <PayrollNumberInput
                    className="narrow"
                    value={r.tools}
                    onCommit={(nv) => patch(i, { tools: nv })}
                  />
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
                <td>
                  <PayrollNumberInput
                    className="narrow"
                    value={r.revenueNet}
                    onCommit={(nv) => patch(i, { revenueNet: nv })}
                  />
                </td>
                <td>
                  <PayrollNumberInput
                    className="narrow"
                    value={r.tax}
                    onCommit={(nv) => patch(i, { tax: nv })}
                  />
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
    </div>
  )
}
