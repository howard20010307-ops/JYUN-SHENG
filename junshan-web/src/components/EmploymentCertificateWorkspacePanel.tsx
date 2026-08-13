import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  initialEmploymentCertificateWorkspace,
  type EmploymentCertificateWorkspaceState,
} from '../domain/employmentCertificateWorkspace'
import {
  buildEmploymentCertificatePdfFilename,
  downloadEmploymentCertificatePdf,
} from '../domain/ownerScopePdfExport'
import { EmploymentCertificatePdfSheet } from './EmploymentCertificatePdfSheet'

type Props = {
  workspace: EmploymentCertificateWorkspaceState
  setWorkspace: Dispatch<SetStateAction<EmploymentCertificateWorkspaceState>>
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

export function EmploymentCertificateWorkspacePanel({ workspace, setWorkspace }: Props) {
  const pdfRef = useRef<HTMLDivElement>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)

  useEffect(() => {
    if (!previewOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewOpen])

  function patch(p: Partial<EmploymentCertificateWorkspaceState>) {
    setWorkspace((w) => ({ ...w, ...p }))
  }

  function confirmClear() {
    if (!window.confirm('確定要一鍵清除「在職證明書」全部欄位？')) return
    setPreviewOpen(false)
    setWorkspace(initialEmploymentCertificateWorkspace())
  }

  return (
    <div className="employmentCertificateWorkspace">
      <section className="card">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>在職證明書</h3>
          <button type="button" className="btn danger" onClick={confirmClear}>
            一鍵清除
          </button>
        </div>
        <p className="hint">
          填寫員工資料與職稱後可預覽並下載 PDF。公司名稱、統編、負責人與地址已預設為鈞泩放樣工程行；PDF 會蓋公司章與負責人章。
        </p>

        <fieldset style={{ marginBottom: 14 }}>
          <legend>員工資料</legend>
          <label style={{ display: 'block', marginBottom: 8 }}>
            姓名
            <input
              type="text"
              className="quoteStickyItemText"
              style={{ width: '100%', maxWidth: 280, marginLeft: 8 }}
              value={workspace.employeeName}
              onChange={(e) => patch({ employeeName: e.target.value })}
            />
          </label>
          <label style={{ display: 'block', marginBottom: 8 }}>
            性別
            <select
              className="quoteStickyItemText"
              style={{ width: 120, marginLeft: 8 }}
              value={workspace.gender}
              onChange={(e) => patch({ gender: e.target.value })}
            >
              <option value="">—</option>
              <option value="男">男</option>
              <option value="女">女</option>
            </select>
          </label>
          <label style={{ display: 'block', marginBottom: 8 }}>
            身份證字號
            <input
              type="text"
              className="quoteStickyItemText"
              style={{ width: '100%', maxWidth: 280, marginLeft: 8 }}
              value={workspace.idNumber}
              onChange={(e) => patch({ idNumber: e.target.value })}
            />
          </label>
          <RocFields
            label="出生年月日"
            y={workspace.birthRocYear}
            m={workspace.birthRocMonth}
            d={workspace.birthRocDay}
            onY={(v) => patch({ birthRocYear: v })}
            onM={(v) => patch({ birthRocMonth: v })}
            onD={(v) => patch({ birthRocDay: v })}
          />
          <label style={{ display: 'block', marginBottom: 8 }}>
            職稱
            <input
              type="text"
              className="quoteStickyItemText"
              style={{ width: '100%', maxWidth: 280, marginLeft: 8 }}
              value={workspace.jobTitle}
              onChange={(e) => patch({ jobTitle: e.target.value })}
              placeholder="例：放樣技術員"
            />
          </label>
          <RocFields
            label="到職日期"
            y={workspace.hireRocYear}
            m={workspace.hireRocMonth}
            d={workspace.hireRocDay}
            onY={(v) => patch({ hireRocYear: v })}
            onM={(v) => patch({ hireRocMonth: v })}
            onD={(v) => patch({ hireRocDay: v })}
          />
          <label style={{ display: 'block', marginTop: 8 }}>
            備註（可多行，會印在 PDF 備註欄）
            <textarea
              className="quoteStickyItemText"
              style={{ width: '100%', maxWidth: 520, minHeight: 72, marginTop: 6 }}
              value={workspace.remarks}
              onChange={(e) => patch({ remarks: e.target.value })}
              placeholder="例：該員目前仍在本公司任職中。"
            />
          </label>
        </fieldset>

        <fieldset className="ownerClientFieldset" style={{ marginBottom: 14 }}>
          <legend>開立單位</legend>
          <div className="ownerClientFieldset__grid">
            <label className="ownerClientFieldset__label">
              公司名稱
              <input type="text" className="ownerClientField" value={workspace.companyName} onChange={(e) => patch({ companyName: e.target.value })} />
            </label>
            <label className="ownerClientFieldset__label">
              統一編號
              <input type="text" className="ownerClientField" value={workspace.taxId} onChange={(e) => patch({ taxId: e.target.value })} />
            </label>
            <label className="ownerClientFieldset__label">
              負責人
              <input type="text" className="ownerClientField" value={workspace.responsiblePerson} onChange={(e) => patch({ responsiblePerson: e.target.value })} />
            </label>
            <label className="ownerClientFieldset__label">
              通訊地址
              <input type="text" className="ownerClientField" value={workspace.address} onChange={(e) => patch({ address: e.target.value })} />
            </label>
          </div>
          <RocFields
            label="開立日期"
            y={workspace.issueRocYear}
            m={workspace.issueRocMonth}
            d={workspace.issueRocDay}
            onY={(v) => patch({ issueRocYear: v })}
            onM={(v) => patch({ issueRocMonth: v })}
            onD={(v) => patch({ issueRocDay: v })}
          />
        </fieldset>

        <div className="btnRow" style={{ marginTop: 12 }}>
          <button type="button" className="btn" onClick={() => setPreviewOpen(true)}>
            預覽 PDF
          </button>
          <span className="muted" style={{ fontSize: 12 }}>下載檔名含員工姓名與日期</span>
        </div>
      </section>

      {previewOpen ? (
        <div
          className="quoteDialogOverlay ownerScopePdfPreviewOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="employmentCertPdfTitle"
          onClick={() => setPreviewOpen(false)}
        >
          <div className="quoteDialogPanel ownerScopePdfPreviewPanel" onClick={(e) => e.stopPropagation()}>
            <div className="ownerScopePdfPreviewHead">
              <h2 id="employmentCertPdfTitle">在職證明書 PDF 預覽</h2>
              <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
                下方為正式版面（含公司章與負責人章）。按 Esc 或背景可關閉。
              </p>
            </div>
            <div className="ownerScopePdfPreviewScroll">
              <div ref={pdfRef}>
                <EmploymentCertificatePdfSheet data={workspace} />
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
                    await downloadEmploymentCertificatePdf(
                      el,
                      buildEmploymentCertificatePdfFilename(workspace.employeeName),
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
