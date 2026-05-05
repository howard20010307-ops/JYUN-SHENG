import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { buildPricingPdfFilename, downloadOwnerScopePdf } from '../domain/ownerScopePdfExport'
import { contractAmountOf, type ContractContentState } from '../domain/contractContentModel'
import { compareFloorLevelAsc } from '../domain/siteAnalysis'
import {
  createPricingRemarkLine,
  createPricingRow,
  initialPricingWorkspace,
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

function normPart(v: string): string {
  const t = (v ?? '').trim()
  return t === '' ? '未填' : t
}

function money(n: number): string {
  return Math.round(Number.isFinite(n) ? n : 0).toLocaleString()
}

function pct(n: number): string {
  return `${((Number.isFinite(n) ? n : 0) * 100).toFixed(1)}%`
}

function pricingTaxFromNet(n: number): number {
  const net = Number.isFinite(n) ? n : 0
  return Math.round(net * 0.05)
}

function pricingRowTotalAuto(row: Pick<PricingRow, 'amountNet'>): number {
  const net = Number.isFinite(row.amountNet) ? row.amountNet : 0
  return net + pricingTaxFromNet(net)
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
    const uniqueContractIdByKey = new Map<string, string>()
    const duplicateKeys = new Set<string>()
    for (const line of contractLinesForSite) {
      const key = `${activeSiteKey}\u0001${normPart(line.buildingLabel)}\u0001${normPart(line.floorLabel)}\u0001${normPart(line.phaseLabel)}`
      const got = uniqueContractIdByKey.get(key)
      if (!got) {
        uniqueContractIdByKey.set(key, line.id)
      } else if (got !== line.id) {
        duplicateKeys.add(key)
        uniqueContractIdByKey.delete(key)
      }
    }

    const m = new Map<string, number>()
    for (const r of receivables.entries) {
      const boundCid = (r.contractLineId ?? '').trim()
      let line = boundCid ? contractLineById.get(boundCid) : undefined
      if (!line) {
        const recvSiteKey = normSite((r.projectName ?? '').trim() || (r.siteBlockId ?? '').trim())
        if (recvSiteKey !== activeSiteKey) continue
        const key = `${activeSiteKey}\u0001${normPart(r.buildingLabel)}\u0001${normPart(r.floorLabel)}\u0001${normPart(r.phaseLabel)}`
        if (duplicateKeys.has(key)) continue
        const autoCid = uniqueContractIdByKey.get(key)
        if (!autoCid) continue
        line = contractLineById.get(autoCid)
      }
      if (!line) continue
      const key = line.buildingLabel.trim() || '未填'
      m.set(key, (m.get(key) ?? 0) + (Number.isFinite(r.net) ? r.net : 0))
    }
    return m
  }, [receivables.entries, contractLineById, contractLinesForSite, activeSiteKey])
  const receivableNetByContractLineId = useMemo(() => {
    const uniqueContractIdByKey = new Map<string, string>()
    const duplicateKeys = new Set<string>()
    for (const line of contractLinesForSite) {
      const key = `${activeSiteKey}\u0001${normPart(line.buildingLabel)}\u0001${normPart(line.floorLabel)}\u0001${normPart(line.phaseLabel)}`
      const got = uniqueContractIdByKey.get(key)
      if (!got) {
        uniqueContractIdByKey.set(key, line.id)
      } else if (got !== line.id) {
        duplicateKeys.add(key)
        uniqueContractIdByKey.delete(key)
      }
    }

    const m = new Map<string, number>()
    for (const r of receivables.entries) {
      const net = Number.isFinite(r.net) ? r.net : 0
      const boundCid = (r.contractLineId ?? '').trim()
      if (boundCid && contractLineById.has(boundCid)) {
        m.set(boundCid, (m.get(boundCid) ?? 0) + net)
        continue
      }
      const recvSiteKey = normSite((r.projectName ?? '').trim() || (r.siteBlockId ?? '').trim())
      if (recvSiteKey !== activeSiteKey) continue
      const key = `${activeSiteKey}\u0001${normPart(r.buildingLabel)}\u0001${normPart(r.floorLabel)}\u0001${normPart(r.phaseLabel)}`
      if (duplicateKeys.has(key)) continue
      const autoCid = uniqueContractIdByKey.get(key)
      if (!autoCid) continue
      m.set(autoCid, (m.get(autoCid) ?? 0) + net)
    }
    return m
  }, [receivables.entries, contractLineById, contractLinesForSite, activeSiteKey])

  const thisByBuilding = useMemo(() => {
    const m = new Map<string, number>()
    for (const row of workspace.rows) {
      const linked = contractLineById.get((row.contractLineId ?? '').trim())
      const key = (linked?.buildingLabel ?? row.buildingLabel).trim() || '未填'
      m.set(key, (m.get(key) ?? 0) + pricingRowTotalAuto(row))
    }
    return m
  }, [workspace.rows, contractLineById])

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
    return out
      .filter((x) => x.contractTotal !== 0 || x.alreadyRequested !== 0 || x.thisRequest !== 0)
      .sort((a, b) => buildingSort(a.building, b.building))
  }, [contractTotalByBuilding, alreadyByBuilding, thisByBuilding])

  const overall = useMemo(() => {
    const contractTotal = [...contractTotalByBuilding.values()].reduce((a, b) => a + b, 0)
    const alreadyRequested = [...alreadyByBuilding.values()].reduce((a, b) => a + b, 0)
    const thisRequest = workspace.rows.reduce((sum, row) => sum + pricingRowTotalAuto(row), 0)
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

  const previewRows = useMemo(
    () =>
      sortedRows.map((r) => ({
        ...r,
        tax: pricingTaxFromNet(r.amountNet),
        total: pricingRowTotalAuto(r),
      })),
    [sortedRows],
  )
  function updateRow(id: string, patch: Partial<Omit<PricingRow, 'id'>>) {
    setWorkspace((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => {
        if (row.id !== id) return row
        const next = { ...row, ...patch }
        if ('amountNet' in patch) {
          next.tax = pricingTaxFromNet(next.amountNet)
          next.total = next.amountNet + next.tax
        } else if ('tax' in patch) {
          next.total = next.amountNet + next.tax
        }
        return next
      }),
    }))
  }

  function patchSupplier(
    key: keyof PricingWorkspaceState['supplier'],
    value: string,
  ) {
    setWorkspace((w) => ({ ...w, supplier: { ...w.supplier, [key]: value } }))
  }

  function patchPayer(
    key: keyof PricingWorkspaceState['payer'],
    value: string,
  ) {
    setWorkspace((w) => ({ ...w, payer: { ...w.payer, [key]: value } }))
  }

  function patchRemittance(
    key: keyof PricingWorkspaceState['remittance'],
    value: string,
  ) {
    setWorkspace((w) => ({ ...w, remittance: { ...w.remittance, [key]: value } }))
  }

  function confirmClearPricingSheet() {
    if (
      !window.confirm(
        '確定要一鍵清除「計價單」？\n將還原為預設標題、清空案場與所有計價列，甲乙方資訊與備註恢復預設值。',
      )
    ) {
      return
    }
    setPreviewOpen(false)
    setWorkspace(initialPricingWorkspace())
  }

  return (
    <div className="quotationWorkspace">
      <section className="card">
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginBottom: 8,
          }}
        >
          <h3 style={{ margin: 0 }}>計價單</h3>
          <button type="button" className="btn danger" onClick={confirmClearPricingSheet}>
            一鍵清除
          </button>
        </div>
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
            計價單編號
            <input
              type="text"
              className="titleInput"
              placeholder="例如：PR-2026-001"
              value={workspace.pricingNumber}
              onChange={(e) => setWorkspace((w) => ({ ...w, pricingNumber: e.target.value }))}
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
        </div>

        <fieldset className="ownerClientFieldset" style={{ marginBottom: 12 }}>
          <legend>乙方資訊（PDF）</legend>
          <div className="ownerClientFieldset__grid">
            <label className="ownerClientFieldset__label">
              公司名稱
              <input className="ownerClientField" type="text" value={workspace.supplier.companyName} onChange={(e) => patchSupplier('companyName', e.target.value)} />
            </label>
            <label className="ownerClientFieldset__label">
              聯絡地址
              <input className="ownerClientField" type="text" value={workspace.supplier.address} onChange={(e) => patchSupplier('address', e.target.value)} />
            </label>
            <label className="ownerClientFieldset__label">
              電話／Email
              <input className="ownerClientField" type="text" value={workspace.supplier.phoneEmail} onChange={(e) => patchSupplier('phoneEmail', e.target.value)} />
            </label>
            <label className="ownerClientFieldset__label">
              統一編號
              <input className="ownerClientField" type="text" value={workspace.supplier.taxId} onChange={(e) => patchSupplier('taxId', e.target.value)} />
            </label>
          </div>
        </fieldset>

        <fieldset className="ownerClientFieldset" style={{ marginBottom: 12 }}>
          <legend>甲方資訊（PDF）</legend>
          <div className="ownerClientFieldset__grid">
            <label className="ownerClientFieldset__label">
              客戶公司
              <input className="ownerClientField" type="text" value={workspace.payer.companyName} onChange={(e) => patchPayer('companyName', e.target.value)} />
            </label>
            <label className="ownerClientFieldset__label">
              聯絡地址
              <input className="ownerClientField" type="text" value={workspace.payer.address} onChange={(e) => patchPayer('address', e.target.value)} />
            </label>
            <label className="ownerClientFieldset__label">
              聯絡人
              <input className="ownerClientField" type="text" value={workspace.payer.contactName} onChange={(e) => patchPayer('contactName', e.target.value)} />
            </label>
            <label className="ownerClientFieldset__label">
              電話／Email
              <input className="ownerClientField" type="text" value={workspace.payer.phoneEmail} onChange={(e) => patchPayer('phoneEmail', e.target.value)} />
            </label>
            <label className="ownerClientFieldset__label">
              統一編號
              <input className="ownerClientField" type="text" value={workspace.payer.taxId} onChange={(e) => patchPayer('taxId', e.target.value)} />
            </label>
          </div>
        </fieldset>

        <fieldset className="ownerClientFieldset" style={{ marginBottom: 12 }}>
          <legend>匯款資訊（PDF）</legend>
          <div className="ownerClientFieldset__grid">
            <label className="ownerClientFieldset__label">
              帳戶名稱
              <input className="ownerClientField" type="text" value={workspace.remittance.accountName} onChange={(e) => patchRemittance('accountName', e.target.value)} />
            </label>
            <label className="ownerClientFieldset__label">
              收款帳戶
              <input className="ownerClientField" type="text" value={workspace.remittance.receivingAccount} onChange={(e) => patchRemittance('receivingAccount', e.target.value)} />
            </label>
          </div>
        </fieldset>

        <div className="tableScroll">
          <table className="data tight pricingSheetTable">
            <thead>
              <tr>
                <th>對照合約</th>
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
                  <td colSpan={10} className="muted">
                    尚無列，請按「新增列」。
                  </td>
                </tr>
              ) : (
                sortedRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <select
                        className="titleInput"
                        value={(row.contractLineId ?? '').trim()}
                        onChange={(e) => {
                          const nextId = e.target.value
                          const linked = contractLineById.get(nextId)
                          updateRow(row.id, {
                            contractLineId: nextId,
                            buildingLabel: linked?.buildingLabel ?? row.buildingLabel,
                            floorLabel: linked?.floorLabel ?? row.floorLabel,
                            phaseLabel: linked?.phaseLabel ?? row.phaseLabel,
                          })
                        }}
                      >
                        <option value="">（不對照）</option>
                        {contractLinesForSite.map((line) => {
                          const paid = (receivableNetByContractLineId.get(line.id) ?? 0) > 0
                          return (
                            <option key={line.id} value={line.id}>
                              {(line.buildingLabel || '未填')} / {(line.floorLabel || '未填')} / {(line.phaseLabel || '未填')}
                              {paid ? '（已請款）' : ''}
                            </option>
                          )
                        })}
                      </select>
                    </td>
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
                    <td className="num">{money(pricingTaxFromNet(row.amountNet))}</td>
                    <td className="num pricingSheetTable__totalCell">{money(pricingRowTotalAuto(row))}</td>
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
        <div className="btnRow" style={{ marginTop: 8, marginBottom: 6, gap: 8, justifyContent: 'flex-end' }}>
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
                      <td className="num pricingSheetProgress__thisReq">{money(b.thisRequest)}</td>
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
            全案：合約總金額 <strong>{money(overall.contractTotal)}</strong>；已請 <strong>{money(overall.alreadyRequested)}</strong>；本次 <strong className="pricingSheetProgress__thisReqStrong">{money(overall.thisRequest)}</strong>；請後累計{' '}
            <strong>{money(overall.alreadyRequested + overall.thisRequest)}</strong>；剩餘 <strong>{money(overall.remaining)}</strong>；完成度{' '}
            <strong>{pct(overall.completion)}</strong>；未完成 <strong>{pct(1 - overall.completion)}</strong>
          </p>
        </section>

        <fieldset className="ownerClientFieldset" style={{ marginTop: 12 }}>
          <legend>備註（PDF）</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {workspace.remarkLines.map((line, i) => (
              <div key={line.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span className="muted" style={{ minWidth: 20, paddingTop: 8 }}>
                  {i + 1}.
                </span>
                <textarea
                  className="quoteStickyItemText"
                  rows={2}
                  style={{ flex: 1, minHeight: 50, resize: 'vertical' }}
                  value={line.text}
                  onChange={(e) =>
                    setWorkspace((w) => ({
                      ...w,
                      remarkLines: w.remarkLines.map((x) => (x.id === line.id ? { ...x, text: e.target.value } : x)),
                    }))
                  }
                />
                <button
                  type="button"
                  className="btn secondary receivablesTable__miniBtn"
                  onClick={() =>
                    setWorkspace((w) => ({
                      ...w,
                      remarkLines: w.remarkLines.filter((x) => x.id !== line.id),
                    }))
                  }
                >
                  刪除
                </button>
              </div>
            ))}
          </div>
          <div className="btnRow" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn secondary"
              onClick={() =>
                setWorkspace((w) => ({
                  ...w,
                  remarkLines: [...w.remarkLines, createPricingRemarkLine(w.siteName, w.remarkLines)],
                }))
              }
            >
              新增備註
            </button>
          </div>
        </fieldset>
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
                  pricingNumber={workspace.pricingNumber}
                  pricingDate={workspace.pricingDate}
                  siteName={workspace.siteName}
                  remittance={workspace.remittance}
                  supplier={workspace.supplier}
                  payer={workspace.payer}
                  remarkLines={workspace.remarkLines}
                  rows={previewRows}
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
                    await downloadOwnerScopePdf(el, buildPricingPdfFilename(workspace.siteName, workspace.pricingDate))
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

