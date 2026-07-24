import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import {
  contractFloorLineSubtotalNet,
  contractFloorPriceTotals,
  createContractFloorPriceLine,
  floorPriceLinesFromQuoteSite,
  formatContractMoney,
  initialContractWorkspace,
  tombstoneContractFloorLineId,
  type ContractFloorPriceLine,
  type ContractParty,
  type ContractWorkspaceState,
} from '../domain/contractWorkspace'
import {
  buildContractPdfFilename,
  downloadContractPdf,
} from '../domain/ownerScopePdfExport'
import type { QuoteOwnerClient, QuoteSite } from '../domain/quoteEngine'
import { ContractPdfSheet } from './ContractPdfSheet'

type Props = {
  workspace: ContractWorkspaceState
  setWorkspace: Dispatch<SetStateAction<ContractWorkspaceState>>
  quoteSite: QuoteSite
  laborOwnerClient?: QuoteOwnerClient
}

function RocFields({
  label,
  y,
  m,
  d,
  onY,
  onM,
  onD,
}: {
  label: string
  y: string
  m: string
  d: string
  onY: (v: string) => void
  onM: (v: string) => void
  onD: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      <span style={{ fontWeight: 600, minWidth: 88 }}>{label}</span>
      <span>民國</span>
      <input type="text" className="quoteStickyItemText" style={{ width: 52 }} value={y} onChange={(e) => onY(e.target.value)} aria-label={`${label}年`} />
      <span>年</span>
      <input type="text" className="quoteStickyItemText" style={{ width: 40 }} value={m} onChange={(e) => onM(e.target.value)} aria-label={`${label}月`} />
      <span>月</span>
      <input type="text" className="quoteStickyItemText" style={{ width: 40 }} value={d} onChange={(e) => onD(e.target.value)} aria-label={`${label}日`} />
      <span>日</span>
    </div>
  )
}

function PartyFields({
  title,
  hint,
  party,
  onChange,
  headerAction,
}: {
  title: string
  hint?: string
  party: ContractParty
  onChange: (patch: Partial<ContractParty>) => void
  headerAction?: ReactNode
}) {
  return (
    <fieldset className="ownerClientFieldset">
      <legend>{title}</legend>
      {hint ? <p className="muted ownerClientFieldset__hint">{hint}</p> : null}
      {headerAction ? <div style={{ marginBottom: 10 }}>{headerAction}</div> : null}
      <div className="ownerClientFieldset__grid">
        <label className="ownerClientFieldset__label">
          公司名稱
          <input type="text" className="ownerClientField" value={party.companyName} onChange={(e) => onChange({ companyName: e.target.value })} />
        </label>
        <label className="ownerClientFieldset__label">
          統一編號
          <input type="text" className="ownerClientField" value={party.taxId} onChange={(e) => onChange({ taxId: e.target.value })} />
        </label>
        <label className="ownerClientFieldset__label">
          負責人
          <input type="text" className="ownerClientField" value={party.responsiblePerson} onChange={(e) => onChange({ responsiblePerson: e.target.value })} />
        </label>
        <label className="ownerClientFieldset__label">
          聯絡人
          <input type="text" className="ownerClientField" value={party.contactName} onChange={(e) => onChange({ contactName: e.target.value })} />
        </label>
        <label className="ownerClientFieldset__label">
          連絡電話
          <input type="text" className="ownerClientField" value={party.phone} onChange={(e) => onChange({ phone: e.target.value })} />
        </label>
        <label className="ownerClientFieldset__label ownerClientFieldset__label--wide">
          地址
          <input type="text" className="ownerClientField" value={party.address} onChange={(e) => onChange({ address: e.target.value })} />
        </label>
      </div>
    </fieldset>
  )
}

export function ContractWorkspacePanel({ workspace, setWorkspace, quoteSite, laborOwnerClient }: Props) {
  const pdfRef = useRef<HTMLDivElement>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)

  const totals = contractFloorPriceTotals(workspace.floorPriceLines, workspace.unitPricePerPing)

  useEffect(() => {
    if (!previewOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewOpen])

  function patch(p: Partial<ContractWorkspaceState>) {
    setWorkspace((w) => ({ ...w, ...p }))
  }

  function setPartyA(p: Partial<ContractParty>) {
    setWorkspace((w) => ({ ...w, partyA: { ...w.partyA, ...p } }))
  }

  function setPartyB(p: Partial<ContractParty>) {
    setWorkspace((w) => ({ ...w, partyB: { ...w.partyB, ...p } }))
  }

  function confirmClear() {
    if (!window.confirm('確定要一鍵清除「工程合約書」全部欄位？')) return
    setPreviewOpen(false)
    setWorkspace(initialContractWorkspace())
  }

  function updateFloorLine(id: string, patchLine: Partial<ContractFloorPriceLine>) {
    setWorkspace((w) => ({
      ...w,
      floorPriceLines: w.floorPriceLines.map((ln) => (ln.id === id ? { ...ln, ...patchLine } : ln)),
    }))
  }

  function addFloorLine() {
    setWorkspace((w) => ({
      ...w,
      floorPriceLines: [...w.floorPriceLines, createContractFloorPriceLine(w)],
    }))
  }

  function removeFloorLine(id: string) {
    setWorkspace((w) => ({
      ...w,
      floorPriceLines: w.floorPriceLines.filter((ln) => ln.id !== id),
      deletedFloorLineIds: tombstoneContractFloorLineId(w, id),
    }))
  }

  function importFromQuote() {
    const lines = floorPriceLinesFromQuoteSite(quoteSite)
    if (lines.length === 0) {
      window.alert('目前放樣估價案場無可帶入的樓層坪數（已排除「基礎工程」且需有面積）。')
      return
    }
    const siteName = quoteSite.name.trim()
    if (!window.confirm(`將以「${siteName || '目前案場'}」樓層面積覆寫明細列（排除基礎工程），確定？`)) return
    setWorkspace((w) => ({
      ...w,
      projectName: w.projectName.trim() || siteName,
      siteLocation: w.siteLocation.trim() || siteName,
      coverWorkLocation: w.coverWorkLocation.trim() || siteName,
      floorPriceLines: lines,
    }))
  }

  return (
    <div className="contractWorkspace">
      <section className="card">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>工程合約書</h3>
          <button type="button" className="btn danger" onClick={confirmClear}>
            一鍵清除
          </button>
        </div>
        <p className="hint">
          位於「對外文件」：填寫後可預覽並下載 PDF。乙方可預設鈞泩放樣工程；可從放樣估價帶入各樓坪數（排除基礎工程）。
        </p>

        <fieldset style={{ marginBottom: 14 }}>
          <legend>封面</legend>
          <div className="ownerClientFieldset__grid">
            <label className="ownerClientFieldset__label">
              承攬地點
              <input type="text" className="ownerClientField" value={workspace.coverWorkLocation} onChange={(e) => patch({ coverWorkLocation: e.target.value })} />
            </label>
            <label className="ownerClientFieldset__label">
              承攬項目
              <input type="text" className="ownerClientField" value={workspace.coverWorkItem} onChange={(e) => patch({ coverWorkItem: e.target.value })} />
            </label>
            <label className="ownerClientFieldset__label">
              承攬人電話
              <input type="text" className="ownerClientField" value={workspace.coverContractorPhone} onChange={(e) => patch({ coverContractorPhone: e.target.value })} />
            </label>
            <label className="ownerClientFieldset__label">
              合約編號
              <input type="text" className="ownerClientField" value={workspace.contractNumber} onChange={(e) => patch({ contractNumber: e.target.value })} />
            </label>
          </div>
        </fieldset>

        <PartyFields
          title="甲方"
          hint="封面抬頭將使用甲方公司名稱。"
          party={workspace.partyA}
          onChange={setPartyA}
          headerAction={
            laborOwnerClient &&
            (laborOwnerClient.companyName.trim() ||
              laborOwnerClient.contactName.trim() ||
              laborOwnerClient.taxId.trim()) ? (
              <button
                type="button"
                className="btn secondary"
                onClick={() =>
                  setPartyA({
                    companyName: laborOwnerClient.companyName,
                    taxId: laborOwnerClient.taxId,
                    responsiblePerson: laborOwnerClient.contactName,
                    contactName: laborOwnerClient.contactName,
                    phone: laborOwnerClient.phoneEmail,
                    address: laborOwnerClient.address,
                  })
                }
              >
                從承攬供述明細帶入甲方
              </button>
            ) : null
          }
        />
        <PartyFields title="乙方（預設鈞泩）" party={workspace.partyB} onChange={setPartyB} />

        <fieldset style={{ marginBottom: 14 }}>
          <legend>工程條款（第一～九條）</legend>
          <label className="ownerClientFieldset__label ownerClientFieldset__label--wide" style={{ display: 'block', marginBottom: 10 }}>
            第一條　工程案名
            <input type="text" className="ownerClientField" value={workspace.projectName} onChange={(e) => patch({ projectName: e.target.value })} />
          </label>
          <label className="ownerClientFieldset__label ownerClientFieldset__label--wide" style={{ display: 'block', marginBottom: 10 }}>
            第二條　工地地點
            <input type="text" className="ownerClientField" value={workspace.siteLocation} onChange={(e) => patch({ siteLocation: e.target.value })} />
          </label>
          <label className="ownerClientFieldset__label ownerClientFieldset__label--wide" style={{ display: 'block', marginBottom: 10 }}>
            第三條　工程範圍
            <textarea className="ownerClientField" rows={4} value={workspace.workScope} onChange={(e) => patch({ workScope: e.target.value })} />
          </label>
          <div className="ownerClientFieldset__grid" style={{ marginBottom: 10 }}>
            <label className="ownerClientFieldset__label">
              第四條　施作單價（元／坪，未稅）
              <input
                type="number"
                className="ownerClientField"
                min={0}
                step={1}
                value={workspace.unitPricePerPing || ''}
                onChange={(e) => patch({ unitPricePerPing: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="ownerClientFieldset__label">
              第九條　每日罰款（元）
              <input type="text" className="ownerClientField" value={workspace.penaltyPerDay} onChange={(e) => patch({ penaltyPerDay: e.target.value })} />
            </label>
            <label className="ownerClientFieldset__label">
              第五條　估驗日（每月）
              <input type="text" className="ownerClientField" value={workspace.paymentAssessDays} onChange={(e) => patch({ paymentAssessDays: e.target.value })} placeholder="例：5、20" />
            </label>
            <label className="ownerClientFieldset__label">
              第五條　付款日（每月）
              <input type="text" className="ownerClientField" value={workspace.paymentPayDays} onChange={(e) => patch({ paymentPayDays: e.target.value })} placeholder="例：11、26" />
            </label>
            <label className="ownerClientFieldset__label">
              第七條　誤差（mm）
              <input type="text" className="ownerClientField" value={workspace.toleranceMm} onChange={(e) => patch({ toleranceMm: e.target.value })} />
            </label>
            <label className="ownerClientFieldset__label">
              第七條　誤差點數
              <input type="text" className="ownerClientField" value={workspace.tolerancePointCount} onChange={(e) => patch({ tolerancePointCount: e.target.value })} />
            </label>
            <label className="ownerClientFieldset__label">
              第八條　終止通知（月）
              <input type="text" className="ownerClientField" value={workspace.terminationNoticeMonths} onChange={(e) => patch({ terminationNoticeMonths: e.target.value })} />
            </label>
          </div>
        </fieldset>

        <fieldset style={{ marginBottom: 14 }}>
          <legend>各樓層坪數及價格明細</legend>
          <p className="muted" style={{ marginTop: 0 }}>
            整案統一單價 <strong>{formatContractMoney(workspace.unitPricePerPing)}</strong> 元／坪；合計{' '}
            <strong>{totals.totalPing.toFixed(2)}</strong> 坪、未稅{' '}
            <strong>{formatContractMoney(totals.totalNet)}</strong> 元。
          </p>
          <div className="btnRow" style={{ marginBottom: 10 }}>
            <button type="button" className="btn secondary" onClick={importFromQuote}>
              從放樣估價帶入樓層坪數
            </button>
            <button type="button" className="btn secondary" onClick={addFloorLine}>
              新增列
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="dataTable">
              <thead>
                <tr>
                  <th>棟</th>
                  <th>樓層</th>
                  <th className="num">坪數</th>
                  <th className="num">單價</th>
                  <th className="num">小計（未稅）</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {workspace.floorPriceLines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 12 }}>
                      尚無明細列；可從放樣估價帶入或手動新增。
                    </td>
                  </tr>
                ) : (
                  workspace.floorPriceLines.map((ln) => (
                    <tr key={ln.id}>
                      <td>
                        <input
                          type="text"
                          className="quoteStickyItemText"
                          value={ln.buildingLabel}
                          onChange={(e) => updateFloorLine(ln.id, { buildingLabel: e.target.value })}
                          aria-label="棟"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="quoteStickyItemText"
                          value={ln.floorLabel}
                          onChange={(e) => updateFloorLine(ln.id, { floorLabel: e.target.value })}
                          aria-label="樓層"
                        />
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          className="quoteStickyItemText"
                          style={{ width: 88, textAlign: 'right' }}
                          min={0}
                          step={0.01}
                          value={ln.ping || ''}
                          onChange={(e) => updateFloorLine(ln.id, { ping: Number(e.target.value) || 0 })}
                          aria-label="坪數"
                        />
                      </td>
                      <td className="num">{formatContractMoney(workspace.unitPricePerPing)}</td>
                      <td className="num">{formatContractMoney(contractFloorLineSubtotalNet(ln, workspace.unitPricePerPing))}</td>
                      <td>
                        <button type="button" className="btn danger small" onClick={() => removeFloorLine(ln.id)}>
                          刪除
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </fieldset>

        <fieldset style={{ marginBottom: 14 }}>
          <legend>簽署日期</legend>
          <RocFields
            label="甲方"
            y={workspace.partyASignRocYear}
            m={workspace.partyASignRocMonth}
            d={workspace.partyASignRocDay}
            onY={(v) => patch({ partyASignRocYear: v })}
            onM={(v) => patch({ partyASignRocMonth: v })}
            onD={(v) => patch({ partyASignRocDay: v })}
          />
          <RocFields
            label="乙方"
            y={workspace.partyBSignRocYear}
            m={workspace.partyBSignRocMonth}
            d={workspace.partyBSignRocDay}
            onY={(v) => patch({ partyBSignRocYear: v })}
            onM={(v) => patch({ partyBSignRocMonth: v })}
            onD={(v) => patch({ partyBSignRocDay: v })}
          />
        </fieldset>

        <div className="btnRow">
          <button type="button" className="btn" onClick={() => setPreviewOpen(true)}>
            預覽 PDF
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={pdfBusy}
            onClick={async () => {
              if (!pdfRef.current) return
              setPdfBusy(true)
              try {
                await downloadContractPdf(pdfRef.current, buildContractPdfFilename(workspace.projectName))
              } finally {
                setPdfBusy(false)
              }
            }}
          >
            {pdfBusy ? '產生中…' : '下載 PDF'}
          </button>
        </div>
      </section>

      <div ref={pdfRef} style={{ position: 'fixed', left: -9999, top: 0, pointerEvents: 'none' }} aria-hidden>
        <ContractPdfSheet data={workspace} />
      </div>

      {previewOpen ? (
        <div
          className="modalBackdrop"
          role="dialog"
          aria-modal="true"
          aria-label="工程合約書 PDF 預覽"
          onClick={() => setPreviewOpen(false)}
        >
          <div className="modalPanel modalPanel--wide" onClick={(e) => e.stopPropagation()}>
            <div className="modalPanel__head">
              <h3 style={{ margin: 0 }}>PDF 預覽</h3>
              <button type="button" className="btn secondary" onClick={() => setPreviewOpen(false)}>
                關閉
              </button>
            </div>
            <div className="modalPanel__body" style={{ overflow: 'auto', maxHeight: '80vh' }}>
              <ContractPdfSheet data={workspace} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
