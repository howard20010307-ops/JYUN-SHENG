import { useMemo } from 'react'
import {
  computeQuote,
  defaultQuoteRows,
  exampleSite,
  m2ToPing,
  type QuoteRow,
  type QuoteSite,
} from '../domain/quoteEngine'
type JobPick = { id: string; name: string }

type Props = {
  site: QuoteSite
  setSite: (s: QuoteSite) => void
  rows: QuoteRow[]
  setRows: (r: QuoteRow[]) => void
  jobSites: JobPick[]
}

function num(v: string): number {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

export function QuotePanel({ site, setSite, rows, setRows, jobSites }: Props) {
  const result = useMemo(() => computeQuote(site, rows), [site, rows])

  function updateFee<K extends keyof QuoteSite['fees']>(k: K, v: number) {
    setSite({
      ...site,
      fees: { ...site.fees, [k]: v },
    })
  }

  function updateFloor(i: number, patch: Partial<{ name: string; m2: number }>) {
    const floors = site.floors.map((f, j) => (j === i ? { ...f, ...patch } : f))
    setSite({ ...site, floors })
  }

  function addFloor() {
    setSite({
      ...site,
      floors: [...site.floors, { name: '新樓層', m2: 0 }],
    })
  }

  function removeFloor(i: number) {
    setSite({ ...site, floors: site.floors.filter((_, j) => j !== i) })
  }

  function updateRow(i: number, patch: Partial<QuoteRow>) {
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setRows([
      ...rows,
      {
        id: `r${Date.now()}`,
        zone: '新區域',
        item: '新細項',
        sameFloors: 1,
        basePerFloor: 2,
        riskPct: 30,
        useTotalStation: false,
        useRotatingLaser: false,
        useLineLaser: false,
        miscPerFloor: 100,
      },
    ])
  }

  function removeRow(i: number) {
    setRows(rows.filter((_, j) => j !== i))
  }

  function loadTemplate() {
    setSite(exampleSite())
    setRows(defaultQuoteRows())
  }

  return (
    <div className="panel">
      <div className="panelHead">
        <h2>放樣估價</h2>
        <button type="button" className="btn secondary" onClick={loadTemplate}>
          載入範例（對齊試算表結構）
        </button>
      </div>

      <section className="card">
        <h3>案場與費率</h3>
        <div className="grid2">
          <label>
            案名
            <div className="inlinePair">
              <select
                className="sitePick"
                aria-label="從案場帶入案名"
                value={jobSites.find((j) => j.name === site.name)?.id ?? ''}
                onChange={(e) => {
                  const id = e.target.value
                  const j = jobSites.find((x) => x.id === id)
                  setSite({ ...site, name: j?.name ?? '' })
                }}
              >
                <option value="">（手動輸入或選已建案場）</option>
                {jobSites.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </select>
              <input
                value={site.name}
                onChange={(e) => setSite({ ...site, name: e.target.value })}
                placeholder="與案場分頁名稱一致較好對帳"
              />
            </div>
          </label>
          <div className="stat">
            <span>總坪數（由面積加總）</span>
            <strong>{result.ping.toFixed(4)} 坪</strong>
          </div>
        </div>
        <div className="feeGrid">
          {(
            [
              ['laborPerDay', '單工成本（元／天）'],
              ['totalStationPerDay', '全測站（元／天）'],
              ['rotatingLaserPerDay', '旋轉雷射（元／天）'],
              ['lineLaserPerDay', '墨線儀（元／天）'],
              ['drawingPerPing', '作圖（元／坪）'],
            ] as const
          ).map(([k, label]) => (
            <label key={k}>
              {label}
              <input
                type="number"
                value={site.fees[k]}
                onChange={(e) => updateFee(k, num(e.target.value))}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="panelHead">
          <h3>樓層面積（㎡）</h3>
          <button type="button" className="btn secondary" onClick={addFloor}>
            新增樓層
          </button>
        </div>
        <div className="tableScroll">
          <table className="data">
            <thead>
              <tr>
                <th>樓層</th>
                <th>㎡</th>
                <th>坪（換算）</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {site.floors.map((fl, i) => (
                <tr key={i}>
                  <td>
                    <input
                      value={fl.name}
                      onChange={(e) => updateFloor(i, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={fl.m2}
                      onChange={(e) => updateFloor(i, { m2: num(e.target.value) })}
                    />
                  </td>
                  <td className="num">{m2ToPing(fl.m2).toFixed(4)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn danger ghost"
                      onClick={() => removeFloor(i)}
                    >
                      刪
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="panelHead">
          <h3>成本估算列</h3>
          <button type="button" className="btn secondary" onClick={addRow}>
            新增列
          </button>
        </div>
        <p className="hint">
          基礎總工數 = 單層基準 × 相同樓層數；計價工數 = 基礎 ×（1＋風險％）；列金額 =
          計價工數總和 × 單工成本 ＋ 儀器（依樓層數）＋ 雜項（每樓層固定 × 樓層數）。
        </p>
        <div className="tableScroll">
          <table className="data tight">
            <thead>
              <tr>
                <th>區域</th>
                <th>細項</th>
                <th>樓層數</th>
                <th>基準／層</th>
                <th>風險％</th>
                <th>測</th>
                <th>雷</th>
                <th>墨</th>
                <th>雜項／樓</th>
                <th>基礎工數</th>
                <th>計價工數</th>
                <th>列成本</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {result.computed.map((r, i) => (
                <tr key={r.id}>
                  <td>
                    <input
                      value={r.zone}
                      onChange={(e) => updateRow(i, { zone: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      value={r.item}
                      onChange={(e) => updateRow(i, { item: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="narrow"
                      value={r.sameFloors}
                      onChange={(e) =>
                        updateRow(i, { sameFloors: num(e.target.value) })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="narrow"
                      value={r.basePerFloor}
                      onChange={(e) =>
                        updateRow(i, { basePerFloor: num(e.target.value) })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="narrow"
                      value={r.riskPct}
                      onChange={(e) =>
                        updateRow(i, { riskPct: num(e.target.value) })
                      }
                    />
                  </td>
                  <td className="cen">
                    <input
                      type="checkbox"
                      checked={r.useTotalStation}
                      onChange={(e) =>
                        updateRow(i, { useTotalStation: e.target.checked })
                      }
                    />
                  </td>
                  <td className="cen">
                    <input
                      type="checkbox"
                      checked={r.useRotatingLaser}
                      onChange={(e) =>
                        updateRow(i, { useRotatingLaser: e.target.checked })
                      }
                    />
                  </td>
                  <td className="cen">
                    <input
                      type="checkbox"
                      checked={r.useLineLaser}
                      onChange={(e) =>
                        updateRow(i, { useLineLaser: e.target.checked })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="narrow"
                      value={r.miscPerFloor}
                      onChange={(e) =>
                        updateRow(i, { miscPerFloor: num(e.target.value) })
                      }
                    />
                  </td>
                  <td className="num">{r.baseTotal.toFixed(2)}</td>
                  <td className="num">{r.pricingTotal.toFixed(2)}</td>
                  <td className="num">{Math.round(r.regionCost)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn danger ghost"
                      onClick={() => removeRow(i)}
                    >
                      刪
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card summary">
        <h3>總結</h3>
        <dl className="dl">
          <div>
            <dt>基礎總工數加總</dt>
            <dd>{result.totalBase.toFixed(2)}</dd>
          </div>
          <div>
            <dt>計價工數加總</dt>
            <dd>{result.totalPricingDays.toFixed(2)}</dd>
          </div>
          <div>
            <dt>工序＋儀器＋雜項（未含作圖）</dt>
            <dd>{Math.round(result.totalRegion).toLocaleString()} 元</dd>
          </div>
          <div>
            <dt>作圖成本</dt>
            <dd>{Math.round(result.drawingCost).toLocaleString()} 元</dd>
          </div>
          <div>
            <dt>總成本</dt>
            <dd>{Math.round(result.totalCost).toLocaleString()} 元</dd>
          </div>
          <div>
            <dt>每坪成本</dt>
            <dd>{result.costPerPing.toFixed(2)} 元／坪</dd>
          </div>
          <div>
            <dt>每坪（扣除作圖）</dt>
            <dd>{result.costPerPingExDrawing.toFixed(2)} 元／坪</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
