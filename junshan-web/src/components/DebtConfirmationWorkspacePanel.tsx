import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import {
  createDebtConfirmationAttachmentFromFile,
  DEBT_CONFIRMATION_ATTACHMENT_ACCEPT,
  DEBT_CONFIRMATION_MAX_ATTACHMENTS,
  initialDebtConfirmationWorkspace,
  type DebtConfirmationParty,
  type DebtConfirmationWorkspaceState,
} from '../domain/debtConfirmationWorkspace'
import {
  buildDebtConfirmationPdfFilename,
  downloadDebtConfirmationPdf,
} from '../domain/ownerScopePdfExport'
import type { QuoteOwnerClient } from '../domain/quoteEngine'
import { DebtConfirmationPdfSheet } from './DebtConfirmationPdfSheet'

type Props = {
  workspace: DebtConfirmationWorkspaceState
  setWorkspace: Dispatch<SetStateAction<DebtConfirmationWorkspaceState>>
  /** 承攬供述明細的甲方，可一鍵帶入本表甲方 */
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
  party: DebtConfirmationParty
  onChange: (patch: Partial<DebtConfirmationParty>) => void
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
          聯絡電話
          <input type="text" className="ownerClientField" value={party.phone} onChange={(e) => onChange({ phone: e.target.value })} />
        </label>
        <label className="ownerClientFieldset__label">
          地址
          <input type="text" className="ownerClientField" value={party.address} onChange={(e) => onChange({ address: e.target.value })} />
        </label>
      </div>
    </fieldset>
  )
}

export function DebtConfirmationWorkspacePanel({ workspace, setWorkspace, laborOwnerClient }: Props) {
  const pdfRef = useRef<HTMLDivElement>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [attachmentBusy, setAttachmentBusy] = useState(false)

  useEffect(() => {
    if (!previewOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewOpen])

  function patch(p: Partial<DebtConfirmationWorkspaceState>) {
    setWorkspace((w) => ({ ...w, ...p }))
  }

  function setPartyA(p: Partial<DebtConfirmationParty>) {
    setWorkspace((w) => ({ ...w, partyA: { ...w.partyA, ...p } }))
  }

  function setPartyB(p: Partial<DebtConfirmationParty>) {
    setWorkspace((w) => ({ ...w, partyB: { ...w.partyB, ...p } }))
  }

  function confirmClear() {
    if (!window.confirm('確定要一鍵清除「工程款延期付款暨債務確認書」全部欄位？')) return
    setPreviewOpen(false)
    setWorkspace(initialDebtConfirmationWorkspace())
  }

  async function onAttachmentFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    setAttachmentBusy(true)
    const errors: string[] = []
    const added: typeof workspace.attachmentFiles = []
    let base = workspace.attachmentFiles
    try {
      for (const file of [...fileList]) {
        const result = await createDebtConfirmationAttachmentFromFile(file, [...base, ...added])
        if ('error' in result) {
          errors.push(`${file.name}：${result.error}`)
        } else {
          added.push(result)
        }
      }
      if (added.length > 0) {
        setWorkspace((w) => ({ ...w, attachmentFiles: [...w.attachmentFiles, ...added] }))
      }
      if (errors.length > 0) window.alert(errors.join('\n'))
    } finally {
      setAttachmentBusy(false)
      if (attachmentInputRef.current) attachmentInputRef.current.value = ''
    }
  }

  function removeAttachment(id: string) {
    setWorkspace((w) => ({
      ...w,
      attachmentFiles: w.attachmentFiles.filter((f) => f.id !== id),
    }))
  }

  return (
    <div className="debtConfirmationWorkspace">
      <section className="card">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>工程款延期付款暨債務確認書</h3>
          <button type="button" className="btn danger" onClick={confirmClear}>
            一鍵清除
          </button>
        </div>
        <p className="hint">
          位於「對外文件」：填寫後可預覽並下載 PDF。請先填「立確認書人」甲乙雙方；乙方已預設鈞泩放樣工程、負責人楊皓鈞。
        </p>

        <h4 style={{ margin: '0 0 10px', fontSize: '1rem' }}>立確認書人</h4>
        <PartyFields
          title="甲方（委託方／欠款方）"
          hint="欠款方資料，會印在 PDF 開頭與文末簽署區。個人戶可填姓名於公司名稱。"
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
        <PartyFields
          title="乙方（承攬方／收款方）"
          hint="預設為鈞泩；確認無誤即可，亦可手動修改。"
          party={workspace.partyB}
          onChange={setPartyB}
        />

        <fieldset style={{ marginBottom: 14 }}>
          <legend>第一條　工程基本資料</legend>
          <label style={{ display: 'block', marginBottom: 8 }}>
            工程名稱
            <input type="text" className="quoteStickyItemText" style={{ width: '100%', maxWidth: 480 }} value={workspace.projectName} onChange={(e) => patch({ projectName: e.target.value })} />
          </label>
          <label style={{ display: 'block', marginBottom: 8 }}>
            施工地點
            <input type="text" className="quoteStickyItemText" style={{ width: '100%', maxWidth: 480 }} value={workspace.siteLocation} onChange={(e) => patch({ siteLocation: e.target.value })} />
          </label>
          <label style={{ display: 'block', marginBottom: 8 }}>
            工作內容（可多行）
            <textarea className="quoteStickyItemText" rows={3} style={{ width: '100%', maxWidth: 480 }} value={workspace.workContent} onChange={(e) => patch({ workContent: e.target.value })} />
          </label>
          <p style={{ margin: '0 0 6px', fontWeight: 600 }}>相關文件編號</p>
          {(
            [
              ['refEstimateChecked', 'refEstimateNo', '估價單編號'],
              ['refQuotationChecked', 'refQuotationNo', '報價單編號'],
              ['refDispatchChecked', 'refDispatchNo', '派工單編號'],
              ['refBillingChecked', 'refBillingNo', '請款單編號'],
              ['refOtherChecked', 'refOther', '其他'],
            ] as const
          ).map(([ck, fk, label]) => (
            <label key={ck} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <input type="checkbox" checked={workspace[ck]} onChange={(e) => patch({ [ck]: e.target.checked })} />
              <span style={{ minWidth: 88 }}>{label}</span>
              <input type="text" className="quoteStickyItemText" style={{ width: 200 }} value={workspace[fk]} onChange={(e) => patch({ [fk]: e.target.value })} />
            </label>
          ))}
        </fieldset>

        <fieldset style={{ marginBottom: 14 }}>
          <legend>第二條　債務確認</legend>
          <RocFields
            label="截至"
            y={workspace.debtConfirmRocYear}
            m={workspace.debtConfirmRocMonth}
            d={workspace.debtConfirmRocDay}
            onY={(v) => patch({ debtConfirmRocYear: v })}
            onM={(v) => patch({ debtConfirmRocMonth: v })}
            onD={(v) => patch({ debtConfirmRocDay: v })}
          />
          <label style={{ display: 'block', marginBottom: 8 }}>
            工程款金額（大寫）
            <input type="text" className="quoteStickyItemText" style={{ width: '100%', maxWidth: 360 }} value={workspace.debtAmountUpper} onChange={(e) => patch({ debtAmountUpper: e.target.value })} placeholder="例：柒拾貳萬" />
          </label>
          <label style={{ display: 'block', marginBottom: 0 }}>
            工程款金額（小寫）NT$
            <input type="text" className="quoteStickyItemText" style={{ width: 200 }} value={workspace.debtAmountLower} onChange={(e) => patch({ debtAmountLower: e.target.value })} />
          </label>
        </fieldset>

        <fieldset style={{ marginBottom: 14 }}>
          <legend>第三條　延期付款約定</legend>
          <RocFields
            label="付款期限"
            y={workspace.paymentDueRocYear}
            m={workspace.paymentDueRocMonth}
            d={workspace.paymentDueRocDay}
            onY={(v) => patch({ paymentDueRocYear: v })}
            onM={(v) => patch({ paymentDueRocMonth: v })}
            onD={(v) => patch({ paymentDueRocDay: v })}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <label><input type="radio" name="payAmPm" checked={workspace.paymentAmPm === 'am'} onChange={() => patch({ paymentAmPm: 'am' })} /> 上午</label>
            <label><input type="radio" name="payAmPm" checked={workspace.paymentAmPm === 'pm'} onChange={() => patch({ paymentAmPm: 'pm' })} /> 下午</label>
            <input type="text" className="quoteStickyItemText" style={{ width: 40 }} value={workspace.paymentHour} onChange={(e) => patch({ paymentHour: e.target.value })} aria-label="時" />
            <span>時</span>
            <input type="text" className="quoteStickyItemText" style={{ width: 40 }} value={workspace.paymentMinute} onChange={(e) => patch({ paymentMinute: e.target.value })} aria-label="分" />
            <span>分前</span>
          </div>
          <p style={{ margin: '0 0 6px', fontWeight: 600 }}>付款方式</p>
          <label style={{ marginRight: 12 }}><input type="checkbox" checked={workspace.payCash} onChange={(e) => patch({ payCash: e.target.checked })} /> 現金</label>
          <label style={{ marginRight: 12 }}><input type="checkbox" checked={workspace.payTransfer} onChange={(e) => patch({ payTransfer: e.target.checked })} /> 匯款</label>
          <label style={{ marginRight: 12 }}><input type="checkbox" checked={workspace.payCheck} onChange={(e) => patch({ payCheck: e.target.checked })} /> 支票</label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={workspace.payOther} onChange={(e) => patch({ payOther: e.target.checked })} /> 其他
            <input type="text" className="quoteStickyItemText" style={{ width: 120 }} value={workspace.payOtherText} onChange={(e) => patch({ payOtherText: e.target.value })} />
          </label>
          <p style={{ margin: '10px 0 6px', fontWeight: 600 }}>指定收款帳戶</p>
          <label style={{ display: 'block', marginBottom: 6 }}>銀行 <input type="text" className="quoteStickyItemText" style={{ width: 200, marginLeft: 8 }} value={workspace.bankName} onChange={(e) => patch({ bankName: e.target.value })} /></label>
          <label style={{ display: 'block', marginBottom: 6 }}>戶名 <input type="text" className="quoteStickyItemText" style={{ width: 200, marginLeft: 8 }} value={workspace.accountName} onChange={(e) => patch({ accountName: e.target.value })} /></label>
          <label style={{ display: 'block', marginBottom: 8 }}>帳號 <input type="text" className="quoteStickyItemText" style={{ width: 240, marginLeft: 8 }} value={workspace.accountNumber} onChange={(e) => patch({ accountNumber: e.target.value })} /></label>
          <label style={{ marginRight: 14 }}><input type="radio" name="taxMode" checked={workspace.amountTaxMode === 'incl'} onChange={() => patch({ amountTaxMode: 'incl' })} /> 含稅金額</label>
          <label><input type="radio" name="taxMode" checked={workspace.amountTaxMode === 'excl'} onChange={() => patch({ amountTaxMode: 'excl' })} /> 未稅金額</label>
        </fieldset>

        <fieldset style={{ marginBottom: 14 }}>
          <legend>第八條　違約追償（勾選）</legend>
          <label style={{ marginRight: 12 }}><input type="checkbox" checked={workspace.recoveryPaymentOrder} onChange={(e) => patch({ recoveryPaymentOrder: e.target.checked })} /> 支付命令</label>
          <label style={{ marginRight: 12 }}><input type="checkbox" checked={workspace.recoveryMediation} onChange={(e) => patch({ recoveryMediation: e.target.checked })} /> 民事調解</label>
          <label style={{ marginRight: 12 }}><input type="checkbox" checked={workspace.recoveryLawsuit} onChange={(e) => patch({ recoveryLawsuit: e.target.checked })} /> 民事訴訟</label>
          <label style={{ marginRight: 12 }}><input type="checkbox" checked={workspace.recoveryProvisionalSeizure} onChange={(e) => patch({ recoveryProvisionalSeizure: e.target.checked })} /> 假扣押</label>
          <label style={{ marginRight: 12 }}><input type="checkbox" checked={workspace.recoveryEnforcement} onChange={(e) => patch({ recoveryEnforcement: e.target.checked })} /> 強制執行</label>
          <label style={{ marginRight: 12 }}><input type="checkbox" checked={workspace.recoveryPromissoryNote} onChange={(e) => patch({ recoveryPromissoryNote: e.target.checked })} /> 本票裁定</label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <input type="checkbox" checked={workspace.recoveryOther} onChange={(e) => patch({ recoveryOther: e.target.checked })} /> 其他
            <input type="text" className="quoteStickyItemText" style={{ width: 160 }} value={workspace.recoveryOtherText} onChange={(e) => patch({ recoveryOtherText: e.target.value })} />
          </label>
        </fieldset>

        <fieldset style={{ marginBottom: 14 }}>
          <legend>第十條　附件資料</legend>
          {(
            [
              ['attachEstimate', '估價單'],
              ['attachQuotation', '報價單'],
              ['attachBilling', '請款單'],
              ['attachDispatchSign', '派工簽認單'],
              ['attachPhotos', '工程照片'],
              ['attachLine', 'LINE 對話紀錄'],
              ['attachEmail', '電子郵件紀錄'],
              ['attachTransferRecord', '匯款紀錄'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} style={{ marginRight: 14, display: 'inline-block', marginBottom: 4 }}>
              <input type="checkbox" checked={workspace[k]} onChange={(e) => patch({ [k]: e.target.checked })} /> {label}
            </label>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <input type="checkbox" checked={workspace.attachOther} onChange={(e) => patch({ attachOther: e.target.checked })} /> 其他
            <input type="text" className="quoteStickyItemText" style={{ width: 200 }} value={workspace.attachOtherText} onChange={(e) => patch({ attachOtherText: e.target.value })} />
          </label>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border, #243041)' }}>
            <p style={{ margin: '0 0 8px', fontWeight: 600 }}>上傳附件檔案</p>
            <p className="muted" style={{ margin: '0 0 10px', fontSize: 12, lineHeight: 1.55 }}>
              支援 PDF、JPG、PNG；單檔 10MB 以內，最多 {DEBT_CONFIRMATION_MAX_ATTACHMENTS} 個。下載 PDF 時會接在本文最後（預覽僅顯示本文）。
            </p>
            <div className="btnRow" style={{ marginBottom: 10 }}>
              <input
                ref={attachmentInputRef}
                type="file"
                accept={DEBT_CONFIRMATION_ATTACHMENT_ACCEPT}
                multiple
                style={{ display: 'none' }}
                onChange={(e) => void onAttachmentFilesSelected(e.target.files)}
              />
              <button
                type="button"
                className="btn secondary"
                disabled={attachmentBusy || workspace.attachmentFiles.length >= DEBT_CONFIRMATION_MAX_ATTACHMENTS}
                onClick={() => attachmentInputRef.current?.click()}
              >
                {attachmentBusy ? '讀取中…' : '選擇檔案上傳'}
              </button>
            </div>
            {workspace.attachmentFiles.length > 0 ? (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {workspace.attachmentFiles.map((f) => (
                  <li
                    key={f.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      marginBottom: 6,
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border, #243041)',
                      background: 'rgba(0,0,0,0.15)',
                    }}
                  >
                    <span style={{ fontSize: 13, wordBreak: 'break-all' }}>{f.fileName}</span>
                    <button type="button" className="btn danger" style={{ flexShrink: 0 }} onClick={() => removeAttachment(f.id)}>
                      移除
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted" style={{ margin: 0, fontSize: 12 }}>尚未上傳附件</p>
            )}
          </div>
        </fieldset>

        <fieldset style={{ marginBottom: 14 }}>
          <legend>連帶保證人與簽署日期</legend>
          <label style={{ display: 'block', marginBottom: 6 }}>姓名 <input type="text" className="quoteStickyItemText" style={{ width: 180, marginLeft: 8 }} value={workspace.guarantorName} onChange={(e) => patch({ guarantorName: e.target.value })} /></label>
          <label style={{ display: 'block', marginBottom: 6 }}>身分證字號 <input type="text" className="quoteStickyItemText" style={{ width: 180, marginLeft: 8 }} value={workspace.guarantorId} onChange={(e) => patch({ guarantorId: e.target.value })} /></label>
          <label style={{ display: 'block', marginBottom: 6 }}>聯絡電話 <input type="text" className="quoteStickyItemText" style={{ width: 180, marginLeft: 8 }} value={workspace.guarantorPhone} onChange={(e) => patch({ guarantorPhone: e.target.value })} /></label>
          <label style={{ display: 'block', marginBottom: 8 }}>戶籍地址 <input type="text" className="quoteStickyItemText" style={{ width: '100%', maxWidth: 400, marginLeft: 8 }} value={workspace.guarantorAddress} onChange={(e) => patch({ guarantorAddress: e.target.value })} /></label>
          <RocFields label="保證人簽署" y={workspace.guarantorSignRocYear} m={workspace.guarantorSignRocMonth} d={workspace.guarantorSignRocDay} onY={(v) => patch({ guarantorSignRocYear: v })} onM={(v) => patch({ guarantorSignRocMonth: v })} onD={(v) => patch({ guarantorSignRocDay: v })} />
          <RocFields label="甲方簽署" y={workspace.partyASignRocYear} m={workspace.partyASignRocMonth} d={workspace.partyASignRocDay} onY={(v) => patch({ partyASignRocYear: v })} onM={(v) => patch({ partyASignRocMonth: v })} onD={(v) => patch({ partyASignRocDay: v })} />
          <RocFields label="乙方簽署" y={workspace.partyBSignRocYear} m={workspace.partyBSignRocMonth} d={workspace.partyBSignRocDay} onY={(v) => patch({ partyBSignRocYear: v })} onM={(v) => patch({ partyBSignRocMonth: v })} onD={(v) => patch({ partyBSignRocDay: v })} />
        </fieldset>

        <div className="btnRow" style={{ marginTop: 12 }}>
          <button type="button" className="btn" onClick={() => setPreviewOpen(true)}>
            預覽 PDF
          </button>
          <span className="muted" style={{ fontSize: 12 }}>下載檔名含工程名稱與日期</span>
        </div>
      </section>

      {previewOpen ? (
        <div className="quoteDialogOverlay ownerScopePdfPreviewOverlay" role="dialog" aria-modal="true" aria-labelledby="debtConfirmPdfTitle" onClick={() => setPreviewOpen(false)}>
          <div className="quoteDialogPanel ownerScopePdfPreviewPanel" onClick={(e) => e.stopPropagation()}>
            <div className="ownerScopePdfPreviewHead">
              <h2 id="debtConfirmPdfTitle">工程款延期付款暨債務確認書 PDF 預覽</h2>
              <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
                下方為本文版面；{workspace.attachmentFiles.length > 0 ? `另有 ${workspace.attachmentFiles.length} 個上傳附件會接在下載 PDF 最後。` : ''}按 Esc 或背景可關閉。
              </p>
            </div>
            <div className="ownerScopePdfPreviewScroll">
              <div ref={pdfRef}>
                <DebtConfirmationPdfSheet data={workspace} />
              </div>
            </div>
            <div className="quoteDialogActions">
              <button type="button" className="btn secondary" onClick={() => setPreviewOpen(false)}>關閉</button>
              <button
                type="button"
                className="btn"
                disabled={pdfBusy}
                onClick={async () => {
                  const el = pdfRef.current
                  if (!el) return
                  setPdfBusy(true)
                  try {
                    await downloadDebtConfirmationPdf(
                      el,
                      buildDebtConfirmationPdfFilename(workspace.projectName),
                      workspace.attachmentFiles,
                    )
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
