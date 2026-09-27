import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  DEFAULT_INCOME_CERT_LEGAL_STATEMENT,
  formatNetPayNt,
  initialIncomeCertificateWorkspace,
  netTakeHomeBeforeAdvanceForPayCycle,
  payCycleRangeFromRocMonth,
  type IncomeCertificateWorkspaceState,
} from '../domain/incomeCertificateWorkspace'
import { staffKeysAcrossBook, type SalaryBook } from '../domain/salaryExcelModel'
import {
  buildIncomeCertificatePdfFilename,
  downloadIncomeCertificatePdf,
} from '../domain/ownerScopePdfExport'
import { IncomeCertificatePdfSheet } from './IncomeCertificatePdfSheet'

type Props = {
  workspace: IncomeCertificateWorkspaceState
  setWorkspace: Dispatch<SetStateAction<IncomeCertificateWorkspaceState>>
  salaryBook: SalaryBook
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

export function IncomeCertificateWorkspacePanel({ workspace, setWorkspace, salaryBook }: Props) {
  const pdfRef = useRef<HTMLDivElement>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const staffNames = useMemo(() => staffKeysAcrossBook(salaryBook), [salaryBook])
  const payrollAmount = useMemo(
    () =>
      netTakeHomeBeforeAdvanceForPayCycle(
        salaryBook,
        workspace.employeeName,
        workspace.payRocYear,
        workspace.payRocMonth,
      ),
    [salaryBook, workspace.employeeName, workspace.payRocYear, workspace.payRocMonth],
  )
  const cycle = payCycleRangeFromRocMonth(workspace.payRocYear, workspace.payRocMonth)

  useEffect(() => {
    if (!previewOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewOpen])

  useEffect(() => {
    if (!workspace.netPayFromPayroll) return
    const next = payrollAmount > 0 ? String(Math.round(payrollAmount)) : ''
    if (next === workspace.netPayAmount) return
    setWorkspace((w) => (w.netPayFromPayroll ? { ...w, netPayAmount: next } : w))
  }, [payrollAmount, setWorkspace, workspace.netPayAmount, workspace.netPayFromPayroll])

  function patch(p: Partial<IncomeCertificateWorkspaceState>) {
    setWorkspace((w) => ({ ...w, ...p }))
  }

  function confirmClear() {
    if (!window.confirm('確定要一鍵清除「服務與收入證明書」全部欄位？')) return
    setPreviewOpen(false)
    setWorkspace(initialIncomeCertificateWorkspace())
  }

  return (
    <div className="incomeCertificateWorkspace">
      <section className="card">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>服務與收入證明書</h3>
          <button type="button" className="btn danger" onClick={confirmClear}>
            一鍵清除
          </button>
        </div>
        <p className="hint">
          與「在職證明」分開。實領預設帶入該計薪月（每月 11 日至次月 10 日）薪水總表「實領薪水（未扣預支）」；可改手填。PDF 會直接蓋公司發票章，不必再蓋實體章。
        </p>

        <fieldset style={{ marginBottom: 14 }}>
          <legend>基本資料</legend>
          <label style={{ display: 'block', marginBottom: 8 }}>
            服務人員姓名
            <input
              type="text"
              className="quoteStickyItemText"
              list="incomeCertStaffNames"
              style={{ width: '100%', maxWidth: 280, marginLeft: 8 }}
              value={workspace.employeeName}
              onChange={(e) =>
                patch({ employeeName: e.target.value, netPayFromPayroll: true })
              }
            />
            <datalist id="incomeCertStaffNames">
              {staffNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
          <label style={{ display: 'block', marginBottom: 8 }}>
            身分證字號／統一證號
            <input
              type="text"
              className="quoteStickyItemText"
              style={{ width: '100%', maxWidth: 280, marginLeft: 8 }}
              value={workspace.idNumber}
              onChange={(e) => patch({ idNumber: e.target.value })}
            />
          </label>
          <label style={{ display: 'block', marginBottom: 8 }}>
            任職／服務部門
            <input
              type="text"
              className="quoteStickyItemText"
              style={{ width: '100%', maxWidth: 280, marginLeft: 8 }}
              value={workspace.department}
              onChange={(e) => patch({ department: e.target.value })}
              placeholder="例：放樣工程"
            />
          </label>
          <RocFields
            label="到職／服務日期"
            y={workspace.hireRocYear}
            m={workspace.hireRocMonth}
            d={workspace.hireRocDay}
            onY={(v) => patch({ hireRocYear: v })}
            onM={(v) => patch({ hireRocMonth: v })}
            onD={(v) => patch({ hireRocDay: v })}
          />
        </fieldset>

        <fieldset style={{ marginBottom: 14 }}>
          <legend>薪資與給付</legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ fontWeight: 600, minWidth: 88 }}>採計月份</span>
            <span>民國</span>
            <input
              type="text"
              className="quoteStickyItemText"
              style={{ width: 52 }}
              value={workspace.payRocYear}
              onChange={(e) => patch({ payRocYear: e.target.value, netPayFromPayroll: true })}
              aria-label="採計年"
            />
            <span>年</span>
            <input
              type="text"
              className="quoteStickyItemText"
              style={{ width: 40 }}
              value={workspace.payRocMonth}
              onChange={(e) => patch({ payRocMonth: e.target.value, netPayFromPayroll: true })}
              aria-label="採計月"
            />
            <span>月份</span>
          </div>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: 13 }}>
            {cycle
              ? `計薪區間：民國 ${cycle.startRocYear} 年 ${cycle.startRocMonth} 月 11 日 至 ${cycle.endRocYear} 年 ${cycle.endRocMonth} 月 10 日`
              : '請填完整的民國年、月，才會算出 11 日至次月 10 日。'}
          </p>
          <label style={{ display: 'block', marginBottom: 8 }}>
            實領薪資（元）
            <input
              type="text"
              inputMode="numeric"
              className="quoteStickyItemText"
              style={{ width: 160, marginLeft: 8 }}
              value={workspace.netPayAmount}
              onChange={(e) => patch({ netPayAmount: e.target.value, netPayFromPayroll: false })}
            />
            <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
              {workspace.netPayFromPayroll
                ? payrollAmount > 0
                  ? `已從薪水讀取（未扣預支 ${formatNetPayNt(payrollAmount)} 元）`
                  : '已設為從薪水讀取（此月尚無金額）'
                : '目前為手填'}
            </span>
          </label>
          {!workspace.netPayFromPayroll ? (
            <button
              type="button"
              className="btn secondary"
              style={{ marginBottom: 10 }}
              onClick={() =>
                patch({
                  netPayFromPayroll: true,
                  netPayAmount: payrollAmount > 0 ? String(Math.round(payrollAmount)) : '',
                })
              }
            >
              改回從薪水讀取
            </button>
          ) : null}
          <label style={{ display: 'block', marginBottom: 8 }}>
            房屋出租人（房東）姓名
            <input
              type="text"
              className="quoteStickyItemText"
              style={{ width: '100%', maxWidth: 280, marginLeft: 8 }}
              value={workspace.landlordName}
              onChange={(e) => patch({ landlordName: e.target.value })}
            />
          </label>
        </fieldset>

        <fieldset style={{ marginBottom: 14 }}>
          <legend>證明用途與法律聲明</legend>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
            可自由改寫；文中的 <code>{'{房東}'}</code> 會帶入上方房東姓名。
          </p>
          <textarea
            className="quoteStickyItemText"
            style={{ width: '100%', maxWidth: 720, minHeight: 140 }}
            value={workspace.legalStatement}
            onChange={(e) => patch({ legalStatement: e.target.value })}
          />
          <div className="btnRow" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn secondary"
              onClick={() => patch({ legalStatement: DEFAULT_INCOME_CERT_LEGAL_STATEMENT })}
            >
              還原預設聲明
            </button>
          </div>
        </fieldset>

        <fieldset className="ownerClientFieldset" style={{ marginBottom: 14 }}>
          <legend>開立單位</legend>
          <div className="ownerClientFieldset__grid">
            <label className="ownerClientFieldset__label">
              開立單位名稱
              <input type="text" className="ownerClientField" value={workspace.companyName} onChange={(e) => patch({ companyName: e.target.value })} />
            </label>
            <label className="ownerClientFieldset__label">
              統一編號
              <input type="text" className="ownerClientField" value={workspace.taxId} onChange={(e) => patch({ taxId: e.target.value })} />
            </label>
            <label className="ownerClientFieldset__label">
              聯絡地址
              <input type="text" className="ownerClientField" value={workspace.address} onChange={(e) => patch({ address: e.target.value })} />
            </label>
            <label className="ownerClientFieldset__label">
              聯絡電話
              <input type="text" className="ownerClientField" value={workspace.phone} onChange={(e) => patch({ phone: e.target.value })} />
            </label>
            <label className="ownerClientFieldset__label">
              負責人／主管
              <input type="text" className="ownerClientField" value={workspace.responsiblePerson} onChange={(e) => patch({ responsiblePerson: e.target.value })} />
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
          aria-labelledby="incomeCertPdfTitle"
          onClick={() => setPreviewOpen(false)}
        >
          <div className="quoteDialogPanel ownerScopePdfPreviewPanel" onClick={(e) => e.stopPropagation()}>
            <div className="ownerScopePdfPreviewHead">
              <h2 id="incomeCertPdfTitle">服務與收入證明書 PDF 預覽</h2>
              <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
                下方為正式版面（含公司發票章）。按 Esc 或背景可關閉。
              </p>
            </div>
            <div className="ownerScopePdfPreviewScroll">
              <div ref={pdfRef}>
                <IncomeCertificatePdfSheet data={workspace} />
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
                    await downloadIncomeCertificatePdf(
                      el,
                      buildIncomeCertificatePdfFilename(
                        workspace.employeeName,
                        workspace.payRocYear,
                        workspace.payRocMonth,
                      ),
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
