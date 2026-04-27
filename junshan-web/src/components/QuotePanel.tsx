import { useMemo } from 'react'
import {
  buildQuoteRowsFromLayout,
  computeQuote,
  defaultQuoteRows,
  exampleSite,
  m2ToPing,
  TEMPLATE,
  type QuoteRow,
  type QuoteSite,
} from '../domain/quoteEngine'
import { QUOTE_TABLE_COLUMNS } from '../domain/quoteExcelColumns'
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

function intNonNeg(v: string, max: number): number {
  const n = parseInt(v, 10)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(max, n)
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

  function patchLayout(
    p: Partial<{
      basementFloors: number
      hasMezzanine: boolean
      typicalStartFloor: number
      typicalFloors: number
      rfCount: number
    }>,
  ) {
    setSite({ ...site, layout: { ...site.layout, ...p } })
  }

  const typicalRangeHint = useMemo(() => {
    const c = site.layout.typicalFloors
    const s = site.layout.typicalStartFloor
    if (c <= 0) return '標準層數為 0 時不產生「正常樓」區塊'
    const end = s + c - 1
    return `約 ${s}F～${end}F；『正常樓』區塊各列「相同樓層數」(欄 C)＝${c}`
  }, [site.layout.typicalFloors, site.layout.typicalStartFloor])

  function applyLayoutToRows() {
    if (
      !window.confirm(
        '將依「專案樓層」重建成本估算列（區塊／欄 C 與試算表同一套）。目前表格會被覆寫。確定嗎？',
      )
    ) {
      return
    }
    setRows(buildQuoteRowsFromLayout(site.layout))
  }

  return (
    <div className="panel">
      <div className="panelHead">
        <h2>放樣估價</h2>
        <button type="button" className="btn secondary" onClick={loadTemplate}>
          載入範例（對齊試算表結構）
        </button>
      </div>
      <p className="hint" style={{ marginTop: -4, marginBottom: 8 }}>
        單次估價＝一個新案場。請先定<strong>專案樓層</strong>，再依固定工項產生成本表；可再微調欄內單層工數、儀器、雜項。樓層面積表與下表可捲動、表頭與首欄凍結便於對照《估價表》。
      </p>

      <section className="card">
        <div className="panelHead">
          <h3>專案樓層</h3>
          <button type="button" className="btn" onClick={applyLayoutToRows}>
            依專案樓層產生（覆寫）估價列
          </button>
        </div>
        <p className="hint">
          與 Excel《估價表》左區相同順序：<strong>基礎工程</strong> {TEMPLATE.foundation.length} 項 →{' '}
          <strong>地下室(除B1F以外)</strong>（欄 C＝地下層數−1）→ <strong>B1F</strong> →{' '}
          <strong>1F</strong>（{TEMPLATE.firstFloor.length} 細項）→ <strong>夾層／正常樓／RF</strong>
          （標準層與 RF 各 {TEMPLATE.above.length} 細項；『正常樓』整區共用同一「相同樓層數」）。
        </p>
        <div className="grid2" style={{ marginBottom: 12 }}>
          <label>
            地下幾層
            <input
              type="number"
              min={0}
              max={30}
              value={site.layout.basementFloors}
              onChange={(e) =>
                patchLayout({ basementFloors: intNonNeg(e.target.value, 30) })
              }
            />
            <span className="subtleInLabel">0＝無；1＝僅 B1；2＝B1+B2… 非 B1 各層各展開一批 8 項</span>
          </label>
          <div className="checkPair">
            <label className="rowCheck">
              <input
                type="checkbox"
                checked={site.layout.hasMezzanine}
                onChange={(e) => patchLayout({ hasMezzanine: e.target.checked })}
              />
              有夾層
            </label>
          </div>
        </div>
        <div className="grid2">
          <label>
            正常樓自第幾層起
            <input
              type="number"
              min={2}
              max={99}
              value={site.layout.typicalStartFloor}
              onChange={(e) =>
                patchLayout({
                  typicalStartFloor: Math.max(
                    2,
                    Math.min(99, intNonNeg(e.target.value, 99)),
                  ),
                })
              }
            />
            <span className="subtleInLabel">2＝自 2F 起；3＝自 3F 起（1F 已單獨列出）</span>
          </label>
          <label>
            正常樓連續幾層
            <input
              type="number"
              min={0}
              value={site.layout.typicalFloors}
              onChange={(e) =>
                patchLayout({ typicalFloors: intNonNeg(e.target.value, 200) })
              }
            />
            <span className="subtleInLabel">{typicalRangeHint}</span>
          </label>
        </div>
        <div className="grid2">
          <label>
            RF 層數
            <input
              type="number"
              min={0}
              value={site.layout.rfCount}
              onChange={(e) =>
                patchLayout({ rfCount: intNonNeg(e.target.value, 50) })
              }
            />
            <span className="subtleInLabel">『RF』區塊各列欄 C＝此數（整區相同）</span>
          </label>
          <div />
        </div>
      </section>

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
        <div className="tableScroll tableScrollSticky">
          <table className="data quoteFloorTable">
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
        <div className="tableScroll tableScrollSticky">
          <table className="data tight quoteCostTableExcel">
            <thead>
              <tr>
                {QUOTE_TABLE_COLUMNS.map((col) => (
                  <th key={col.key} scope="col" className="quoteExcelTH">
                    <span className="excelLet">{col.letter}</span>
                    <span className="excelLbl">{col.label}</span>
                  </th>
                ))}
                <th scope="col" className="quoteExcelTH quoteExcelTHAct">
                  <span className="excelLet">　</span>
                  <span className="excelLbl">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {result.computed.length === 0 ? (
                <tr>
                  <td colSpan={18} className="emptyTableMsg">
                    尚無列。請於上方「專案樓層」設定後按「依專案樓層產生（覆寫）估價列」，或按「新增列」。
                  </td>
                </tr>
              ) : null}
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
                  <td className="num">{r.baseTotal.toFixed(2)}</td>
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
                  <td className="num">{r.pricingPerFloor.toFixed(2)}</td>
                  <td className="num">{r.pricingTotal.toFixed(2)}</td>
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
                  <td className="num">{Math.round(r.miscModule)}</td>
                  <td className="num">{Math.round(r.instrumentPerFloor)}</td>
                  <td className="num">{Math.round(r.instrumentModule)}</td>
                  <td className="num">{Math.round(r.floorStageQuote)}</td>
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
