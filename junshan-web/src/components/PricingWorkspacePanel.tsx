import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { buildPricingPdfFilename, downloadOwnerScopePdf } from '../domain/ownerScopePdfExport'
import { contractAmountOf, type ContractContentState } from '../domain/contractContentModel'
import { compareFloorLevelAsc } from '../domain/siteAnalysis'
import {
  createPricingRow,
  pricingRowNormalizedTotal,
  type PricingRow,
  type PricingWorkspaceState,
} from '../domain/pricingWorkspace'
import type { ReceivablesState } from '../domain/receivablesModel'
import { PayrollNumberInput } from './PayrollNumberInput'
import { PricingPdfSheet } from './PricingPdfSheet'

type Props = {
  workspace: PricingWorkspaceState
  setWorkspace: Dispatch<SetStateAction<PricingWorkspaceState>>
  contractContents: ContractContentState
  receivables: ReceivablesState
}

function normSite(v: string): string {
  return (v ?? '').replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

function money(n: number): string {
  return Math.round(Number.isFinite(n) ? n : 0).toLocaleString()
}

function pct(n: number): string {
  return `${((Number.isFinite(n) ? n : 0) * 100).toFixed(1)}%`
}

function buildingSort(a: string, b: string): number {
  const rx = /^([A-Za-z]+)\s*(\d+)?$/
  const ma = rx.exec(a.trim())
  const mb = rx.exec(b.trim())
  if (ma && mb) {
    const c1 = (ma[1] ?? '').localeCompare(mb[1] ?? '', 'en')
    if (c1 !== 0) return c1
    const n1 = Number(ma[2] ?? 0)
    const n2 = Number(mb[2] ?? 0)
    if (n1 !== n2) return n1 - n2
  }
  return a.localeCompare(b, 'zh-Hant')
}

export function PricingWorkspacePanel({ workspace, setWorkspace, contractContents, receivables }: Props) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const pdfRef = useRef<HTMLDivElement>(null)

  const siteOptions = useMemo(() => {
    const s = new Set<string>()
    for (const line of contractContents.lines) {
      const t = line.siteName.trim()
      if (t) s.add(t)
    }
    for (const r of receivables.entries) {
      const t = (r.projectName ?? '').trim()
      if (t) s.add(t)
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  }, [contractContents.lines, receivables.entries])

  const activeSiteKey = normSite(workspace.siteName)
  const contractLinesForSite = useMemo(
    () => contractContents.lines.filter((x) => normSite(x.siteName) === activeSiteKey),
    [contractContents.lines, activeSiteKey],
  )
  const contractLineById = useMemo(() => {
    const m = new Map<string, (typeof contractLinesForSite)[number]>()
    for (const x of contractLinesForSite) m.set(x.id, x)
    return m
  }, [contractLinesForSite])

  const contractTotalByBuilding = useMemo(() => {
    const m = new Map<string, number>()
    for (const line of contractLinesForSite) {
      const key = line.buildingLabel.trim() || '未填'
      m.set(key, (m.get(key) ?? 0) + contractAmountOf(line))
    }
    return m
  }, [contractLinesForSite])

  const alreadyByBuilding = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of receivables.entries) {
      const cid = (r.contractLineId ?? '').trim()
      if (!cid) continue
      const line = contractLineById.get(cid)
      if (!line) continue
      const key = line.buildingLabel.trim() || '未填'
      m.set(key, (m.get(key) ?? 0) + (Number.isFinite(r.net) ? r.net : 0))
    }
    return m
  }, [receivables.entries, contractLineById])

  const thisByBuilding = useMemo(() => {
    const m = new Map<string, number>()
    for (const row of workspace.rows) {
      const key = row.buildingLabel.trim() || '未填'
      m.set(key, (m.get(key) ?? 0) + pricingRowNormalizedTotal(row))
    }
    return m
  }, [workspace.rows])

  const buildingProgress = useMemo(() => {
    const keys = new Set<string>([
      ...contractTotalByBuilding.keys(),
      ...alreadyByBuilding.keys(),
      ...thisByBuilding.keys(),
    ])
    const out = [...keys].map((building) => {
      const contractTotal = contractTotalByBuilding.get(building) ?? 0
      const alreadyRequested = alreadyByBuilding.get(building) ?? 0
      const thisRequest = thisByBuilding.get(building) ?? 0
      const after = alreadyRequested + thisRequest
      const remaining = contractTotal - after
      const completion = contractTotal > 0 ? after / contractTotal : 0
      return { building, contractTotal, alreadyRequested, thisRequest, remaining, completion }
    })
    return out.sort((a, b) => buildingSort(a.building, b.building))
  }, [contractTotalByBuilding, alreadyByBuilding, thisByBuilding])

  const overall = useMemo(() => {
    const contractTotal = [...contractTotalByBuilding.values()].reduce((a, b) => a + b, 0)
    const alreadyRequested = [...alreadyByBuilding.values()].reduce((a, b) => a + b, 0)
    const thisRequest = workspace.rows.reduce((sum, row) => sum + pricingRowNormalizedTotal(row), 0)
    const after = alreadyRequested + thisRequest
    const remaining = contractTotal - after
    const completion = contractTotal > 0 ? after / contractTotal : 0
    return { contractTotal, alreadyRequested, thisRequest, remaining, completion }
  }, [contractTotalByBuilding, alreadyByBuilding, workspace.rows])

  const sortedRows = useMemo(
    () =>
      workspace.rows.slice().sort((a, b) => {
        const d = buildingSort(a.buildingLabel || '未填', b.buildingLabel || '未填')
        if (d !== 0) return d
        const f = compareFloorLevelAsc(a.floorLabel || '未填', b.floorLabel || '未填')
        if (f !== 0) return f
        return a.phaseLabel.localeCompare(b.phaseLabel, 'zh-Hant')
      }),
    [workspace.rows],
  )

  function updateRow(id: string, patch: Partial<Omit<PricingRow, 'id'>>) {
    setWorkspace((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => {
        if (row.id !== id) return row
        const next = { ...row, ...patch }
        if ('amountNet' in patch || 'tax' in patch) next.total = next.amountNet + next.tax
        return next
      }),
    }))
  }

  return (
    <div className="quotationWorkspace">
      <section className="card">
        <h3 style={{ marginTop: 0 }}>計價單</h3>
        <p className="hint">可選案場帶入合約對照，並自填本次請款列；可預覽與下載 PDF。</p>
        <div className="btnRow" style={{ marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            標題
            <input
              type="text"
              className="titleInput"
              value={workspace.sheetTitle}
              onChange={(e) => setWorkspace((w) => ({ ...w, sheetTitle: e.target.value }))}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            開立日期
            <input
              type="text"
              className="titleInput"
              placeholder="2026/05/06"
              value={workspace.pricingDate}
              onChange={(e) => setWorkspace((w) => ({ ...w, pricingDate: e.target.value }))}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            案場
            <select
              className="titleInput"
              value={workspace.siteName}
              onChange={(e) => setWorkspace((w) => ({ ...w, siteName: e.target.value }))}
            >
              <option value="">（請選擇案場）</option>
              {siteOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn"
            onClick={() =>
              setWorkspace((w) => ({
                ...w,
                rows: [...w.rows, createPricingRow(w.siteName, w.rows)],
              }))
            }
          >
            新增列
          </button>
          <button type="button" className="btn secondary" onClick={() => setPreviewOpen(true)}>
            預覽 PDF
          </button>
        </div>

        <div className="tableScroll">
          <table className="data tight siteAnalysisContractTable">
            <thead>
              <tr>
                <th>棟</th>
                <th>樓層</th>
                <th>階段</th>
                <th>項目</th>
                <th className="num">金額(未稅)</th>
                <th className="num">稅金</th>
                <th className="num">總計</th>
                <th>備註</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="muted">
                    尚無列，請按「新增列」。
                  </td>
                </tr>
              ) : (
                sortedRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input type="text" className="titleInput" value={row.buildingLabel} onChange={(e) => updateRow(row.id, { buildingLabel: e.target.value })} />
                    </td>
                    <td>
                      <input type="text" className="titleInput" value={row.floorLabel} onChange={(e) => updateRow(row.id, { floorLabel: e.target.value })} />
                    </td>
                    <td>
                      <input type="text" className="titleInput" value={row.phaseLabel} onChange={(e) => updateRow(row.id, { phaseLabel: e.target.value })} />
                    </td>
                    <td>
                      <input type="text" className="titleInput" value={row.item} onChange={(e) => updateRow(row.id, { item: e.target.value })} />
                    </td>
                    <td className="num">
                      <PayrollNumberInput className="titleInput" value={row.amountNet} onCommit={(n) => updateRow(row.id, { amountNet: n })} />
                    </td>
                    <td className="num">
                      <PayrollNumberInput className="titleInput" value={row.tax} onCommit={(n) => updateRow(row.id, { tax: n })} />
                    </td>
                    <td className="num">{money(pricingRowNormalizedTotal(row))}</td>
                    <td>
                      <input type="text" className="titleInput" value={row.note} onChange={(e) => updateRow(row.id, { note: e.target.value })} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn secondary receivablesTable__miniBtn"
                        onClick={() =>
                          setWorkspace((w) => ({
                            ...w,
                            rows: w.rows.filter((x) => x.id !== row.id),
                          }))
                        }
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <section className="siteAnalysisBlock siteAnalysisBlock--contractSubtotal">
          <h3 style={{ marginTop: 0 }}>棟別請款進度（本次＋既有）</h3>
          <div className="tableScroll">
            <table className="data tight siteAnalysisContractSummaryTable">
              <thead>
                <tr>
                  <th>棟</th>
                  <th className="num">已請</th>
                  <th className="num">本次</th>
                  <th className="num">請後累計</th>
                  <th className="num">剩餘金額</th>
                  <th className="num">完成度</th>
                  <th className="num">未完成</th>
                </tr>
              </thead>
              <tbody>
                {buildingProgress.map((b) => {
                  const after = b.alreadyRequested + b.thisRequest
                  return (
                    <tr key={b.building}>
                      <td>{b.building}</td>
                      <td className="num">{money(b.alreadyRequested)}</td>
                      <td className="num">{money(b.thisRequest)}</td>
                      <td className="num">{money(after)}</td>
                      <td className="num">{money(b.remaining)}</td>
                      <td className="num">{pct(b.completion)}</td>
                      <td className="num">{pct(1 - b.completion)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="hint siteAnalysisContractGrandSummary">
            全案：已請 <strong>{money(overall.alreadyRequested)}</strong>；本次 <strong>{money(overall.thisRequest)}</strong>；請後累計{' '}
            <strong>{money(overall.alreadyRequested + overall.thisRequest)}</strong>；剩餘 <strong>{money(overall.remaining)}</strong>；完成度{' '}
            <strong>{pct(overall.completion)}</strong>；未完成 <strong>{pct(1 - overall.completion)}</strong>
          </p>
        </section>
      </section>

      {previewOpen ? (
        <div
          className="quoteDialogOverlay ownerScopePdfPreviewOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pricingPdfPreviewTitle"
          onClick={() => setPreviewOpen(false)}
        >
          <div className="quoteDialogPanel ownerScopePdfPreviewPanel" onClick={(e) => e.stopPropagation()}>
            <div className="ownerScopePdfPreviewHead">
              <h2 id="pricingPdfPreviewTitle">計價單 PDF 預覽</h2>
            </div>
            <div className="ownerScopePdfPreviewScroll">
              <div ref={pdfRef}>
                <PricingPdfSheet
                  title={workspace.sheetTitle}
                  pricingDate={workspace.pricingDate}
                  siteName={workspace.siteName}
                  rows={sortedRows.map((r) => ({ ...r, total: pricingRowNormalizedTotal(r) }))}
                  buildingProgress={buildingProgress}
                  overall={overall}
                />
              </div>
            </div>
            <div className="quoteDialogActions">
              <button type="button" className="btn secondary" onClick={() => setPreviewOpen(false)}>
                關閉
              </button>
              <button
                type="button"
                className="btn"
                disabled={pdfBusy}
                onClick={async () => {
                  const el = pdfRef.current
                  if (!el) return
                  setPdfBusy(true)
                  try {
                    await downloadOwnerScopePdf(el, buildPricingPdfFilename(workspace.sheetTitle))
                  } catch (e) {
                    window.alert(e instanceof Error ? e.message : String(e))
                  } finally {
                    setPdfBusy(false)
                  }
                }}
              >
                {pdfBusy ? '產生 PDF 中…' : '下載 PDF'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

