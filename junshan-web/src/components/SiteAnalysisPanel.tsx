import { useMemo, useState } from 'react'
import type { ReceivablesState } from '../domain/receivablesModel'
import type { SalaryBook } from '../domain/salaryExcelModel'
import { buildSiteAnalysis } from '../domain/siteAnalysis'
import type { WorkLogState } from '../domain/workLogModel'

type Props = {
  salaryBook: SalaryBook
  workLog: WorkLogState
  receivables: ReceivablesState
}

function fmtMoney(n: number): string {
  return Math.round(Number.isFinite(n) ? n : 0).toLocaleString()
}

function fmtPct(n: number): string {
  return `${(Number.isFinite(n) ? n * 100 : 0).toFixed(1)}%`
}

export function SiteAnalysisPanel({ salaryBook, workLog, receivables }: Props) {
  const snap = useMemo(
    () => buildSiteAnalysis(salaryBook, workLog, receivables),
    [salaryBook, workLog, receivables],
  )
  const siteOptions = useMemo(() => {
    const withWorkLog = snap.siteNames.filter((name) => {
      const details = snap.bySite[name]?.details ?? []
      return details.some(
        (d) =>
          d.staffCount > 0 ||
          d.workDays > 0 ||
          d.salaryCost !== 0 ||
          d.mealCost !== 0 ||
          d.instrumentCost !== 0 ||
          (d.workItems ?? '').trim() !== '' ||
          (d.note ?? '').trim() !== '',
      )
    })
    // 若目前完全沒有出工明細，才退回原本聯集（避免選單空白）
    return withWorkLog.length > 0 ? withWorkLog : snap.siteNames
  }, [snap])
  const [site, setSite] = useState('')
  const activeSite = site && snap.bySite[site] ? site : siteOptions[0] ?? ''
  const data = activeSite ? snap.bySite[activeSite] : null

  return (
    <div className="panel">
      <h2>案場分析</h2>
      <p className="hint">
        僅供分析，唯讀不回寫。資料來源：工作日誌＋收帳＋薪水月表。收入以收帳掛載；
        棟/樓層/階段以工作日誌分類；薪資與工數依月表同日同案場人員資料計算；儀器成本列入營業費用（儀器）。
      </p>
      <div className="btnRow" style={{ marginBottom: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>案場</span>
          <select value={activeSite} onChange={(e) => setSite(e.target.value)}>
            {siteOptions.length === 0 ? <option value="">（無資料）</option> : null}
            {siteOptions.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!data ? (
        <p className="muted">尚無可分析之案場資料。</p>
      ) : (
        <>
          <div className="tableScroll">
            <table className="data tight">
              <thead>
                <tr>
                  <th>棟</th>
                  <th>樓層</th>
                  <th>階段</th>
                  <th>營收(未稅)</th>
                  <th>薪資</th>
                  <th>餐費</th>
                  <th>直接成本</th>
                  <th>毛利</th>
                  <th>毛利率</th>
                  <th title="儀器成本列入營業費用">營業費用(儀器)</th>
                  <th>淨利</th>
                  <th>淨利率</th>
                  <th>出工天數</th>
                  <th>每工天毛利</th>
                </tr>
              </thead>
              <tbody>
                {data.groups.map((g, idx) => (
                  <tr key={`${g.dong}-${g.floorLevel}-${g.workPhase}-${idx}`}>
                    <td>{g.dong}</td>
                    <td>{g.floorLevel}</td>
                    <td>{g.workPhase}</td>
                    <td className="num">{fmtMoney(g.revenueNet)}</td>
                    <td className="num">{fmtMoney(g.salaryCost)}</td>
                    <td className="num">{fmtMoney(g.mealCost)}</td>
                    <td className="num">{fmtMoney(g.directCost)}</td>
                    <td className="num">{fmtMoney(g.grossProfit)}</td>
                    <td className="num">{fmtPct(g.grossMargin)}</td>
                    <td className="num" title="儀器成本列入營業費用">
                      {fmtMoney(g.operatingExpenseAllocated)}
                    </td>
                    <td className="num">{fmtMoney(g.netProfit)}</td>
                    <td className="num">{fmtPct(g.netMargin)}</td>
                    <td className="num">{g.workDays.toFixed(2)}</td>
                    <td className="num">{fmtMoney(g.grossPerWorkDay)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={3}>案場合計</th>
                  <th className="num">{fmtMoney(data.totals.revenueNet)}</th>
                  <th className="num">{fmtMoney(data.totals.salaryCost)}</th>
                  <th className="num">{fmtMoney(data.totals.mealCost)}</th>
                  <th className="num">{fmtMoney(data.totals.directCost)}</th>
                  <th className="num">{fmtMoney(data.totals.grossProfit)}</th>
                  <th className="num">{fmtPct(data.totals.grossMargin)}</th>
                  <th className="num" title="儀器成本列入營業費用">
                    {fmtMoney(data.totals.operatingExpenseAllocated)}
                  </th>
                  <th className="num">{fmtMoney(data.totals.netProfit)}</th>
                  <th className="num">{fmtPct(data.totals.netMargin)}</th>
                  <th className="num">{data.totals.workDays.toFixed(2)}</th>
                  <th className="num">{fmtMoney(data.totals.grossPerWorkDay)}</th>
                </tr>
              </tfoot>
            </table>
          </div>

          <h3 style={{ marginTop: 16 }}>出工紀錄（日期排序）</h3>
          <div className="tableScroll">
            <table className="data tight">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>棟</th>
                  <th>樓層</th>
                  <th>階段</th>
                  <th>工作內容</th>
                  <th>人數</th>
                  <th>完整施工人員</th>
                  <th>工天</th>
                  <th>薪資</th>
                  <th>餐費</th>
                  <th>儀器</th>
                  <th>備註</th>
                </tr>
              </thead>
              <tbody>
                {data.details.map((d, idx) => (
                  <tr key={`${d.date}-${d.dong}-${d.floorLevel}-${d.workPhase}-${idx}`}>
                    <td>{d.date}</td>
                    <td>{d.dong}</td>
                    <td>{d.floorLevel}</td>
                    <td>{d.workPhase}</td>
                    <td>{d.workItems}</td>
                    <td className="num">{d.staffCount}</td>
                    <td>{d.staffNames}</td>
                    <td className="num">{d.workDays.toFixed(2)}</td>
                    <td className="num">{fmtMoney(d.salaryCost)}</td>
                    <td className="num">{fmtMoney(d.mealCost)}</td>
                    <td className="num">{fmtMoney(d.instrumentCost)}</td>
                    <td>{d.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

