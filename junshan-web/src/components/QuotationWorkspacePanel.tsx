import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { buildQuotationPdfFilename, downloadOwnerScopePdf } from '../domain/ownerScopePdfExport'
import type { QuoteOwnerClient } from '../domain/quoteEngine'
import {
  addCalendarDays,
  diffCalendarDays,
  formatQuotationCalendarDate,
  parseDayCount,
  parseQuotationCalendarDate,
  quotationIsoInputToMetaDate,
  quotationMetaDateToIsoInput,
} from '../domain/quotationQuoteDates'
import {
  createPaymentTermLine,
  createQuotationClauseLine,
  createQuotationLine,
  initialQuotationWorkspace,
  quotationGrandTotals,
  quotationLineMoney,
  quotationVatRate,
  type QuotationLine,
  type QuotationWorkspaceState,
} from '../domain/quotationWorkspace'
import { QuotationPdfSheet } from './QuotationPdfSheet'
import { useLooseNumericDrafts } from '../hooks/useLooseNumericDrafts'

type Props = {
  workspace: QuotationWorkspaceState
  setWorkspace: Dispatch<SetStateAction<QuotationWorkspaceState>>
}

function moneyFmt(n: number): string {
  return Math.round(n).toLocaleString()
}

export function QuotationWorkspacePanel({ workspace, setWorkspace }: Props) {
  const { bindDecimal } = useLooseNumericDrafts()
  const pdfRef = useRef<HTMLDivElement>(null)
  const quoteDateInputRef = useRef<HTMLInputElement>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)

  const vatRate = quotationVatRate(workspace.vatPercent)
  const grand = quotationGrandTotals(workspace.lines, vatRate)

  useEffect(() => {
    if (!previewOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewOpen])

  function patchMeta<K extends keyof QuotationWorkspaceState['meta']>(k: K, v: string) {
    setWorkspace((w) => ({ ...w, meta: { ...w.meta, [k]: v } }))
  }

  function onQuoteDateChange(v: string) {
    setWorkspace((w) => {
      const m = { ...w.meta, quoteDate: v }
      const q = parseQuotationCalendarDate(m.quoteDate)
      const n = parseDayCount(m.validDays)
      if (q && n != null) {
        m.deadline = formatQuotationCalendarDate(addCalendarDays(q, n))
      } else if (q) {
        const d = parseQuotationCalendarDate(m.deadline)
        if (d) m.validDays = String(Math.max(0, diffCalendarDays(q, d)))
      }
      return { ...w, meta: m }
    })
  }

  function onValidDaysChange(v: string) {
    setWorkspace((w) => {
      const m = { ...w.meta, validDays: v }
      const q = parseQuotationCalendarDate(m.quoteDate)
      const n = parseDayCount(m.validDays)
      if (q && n != null) m.deadline = formatQuotationCalendarDate(addCalendarDays(q, n))
      return { ...w, meta: m }
    })
  }

  function onDeadlineChange(v: string) {
    setWorkspace((w) => {
      const m = { ...w.meta, deadline: v }
      const q = parseQuotationCalendarDate(m.quoteDate)
      const d = parseQuotationCalendarDate(m.deadline)
      if (q && d) m.validDays = String(Math.max(0, diffCalendarDays(q, d)))
      return { ...w, meta: m }
    })
  }

  function openQuoteDatePicker() {
    const el = quoteDateInputRef.current
    if (!el) return
    try {
      el.showPicker?.()
    } catch {
      el.focus()
    }
  }

  function patchSupplier<K extends keyof QuotationWorkspaceState['supplier']>(k: K, v: string) {
    setWorkspace((w) => ({ ...w, supplier: { ...w.supplier, [k]: v } }))
  }

  function patchPayer<K extends keyof QuoteOwnerClient>(k: K, v: string) {
    setWorkspace((w) => ({ ...w, payer: { ...w.payer, [k]: v } }))
  }

  function updateLine(id: string, patch: Partial<Omit<QuotationLine, 'id'>>) {
    setWorkspace((w) => ({
      ...w,
      lines: w.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }))
  }

  function setClauseLine(id: string, text: string) {
    setWorkspace((w) => ({
      ...w,
      clauseLines: w.clauseLines.map((c) => (c.id === id ? { ...c, text } : c)),
    }))
  }

  function addClauseLine() {
    setWorkspace((w) => {
      const s = w.quoteTitle.trim() !== '' ? w.quoteTitle : '報價單'
      return {
        ...w,
        clauseLines: [...w.clauseLines, createQuotationClauseLine(s, w.clauseLines)],
      }
    })
  }

  function removeClauseLine(id: string) {
    setWorkspace((w) => ({
      ...w,
      clauseLines: w.clauseLines.filter((c) => c.id !== id),
    }))
  }

  function setPaymentTermLine(id: string, text: string) {
    setWorkspace((w) => ({
      ...w,
      paymentTermsLines: w.paymentTermsLines.map((c) => (c.id === id ? { ...c, text } : c)),
    }))
  }

  function addPaymentTermLine() {
    setWorkspace((w) => {
      const s = w.quoteTitle.trim() !== '' ? w.quoteTitle : '報價單'
      return {
        ...w,
        paymentTermsLines: [...w.paymentTermsLines, createPaymentTermLine(s, w.paymentTermsLines)],
      }
    })
  }

  function removePaymentTermLine(id: string) {
    setWorkspace((w) => ({
      ...w,
      paymentTermsLines: w.paymentTermsLines.filter((c) => c.id !== id),
    }))
  }

  function confirmClearQuotation() {
    if (
      !window.confirm(
        '確定要一鍵清除「報價單」？\n將還原為空白案名、預設報價資訊與供應商、空白明細與付款人，付款條件與條款恢復預設。',
      )
    ) {
      return
    }
    setPreviewOpen(false)
    setWorkspace(initialQuotationWorkspace())
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
          <h3 style={{ margin: 0 }}>報價單</h3>
          <button type="button" className="btn danger" onClick={confirmClearQuotation}>
            一鍵清除
          </button>
        </div>
        <p className="hint">
          位於「對外文件」：本區為<strong>獨立報價單</strong>，與「放樣估價」案場無連動；可自填報價資訊、供應商／付款人、明細、<strong>付款條件</strong>與備註條款，並預覽或匯出 PDF。
        </p>

        <div
          style={{
            marginBottom: 16,
            maxWidth: 560,
            padding: '12px 14px',
            borderRadius: 'var(--ui-radius-sm)',
            border: '2px solid rgba(180, 83, 9, 0.55)',
            background: 'linear-gradient(135deg, rgba(255, 247, 237, 0.35) 0%, rgba(254, 243, 199, 0.2) 100%)',
          }}
        >
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 800, color: 'var(--head)', letterSpacing: '0.06em' }}>
            案名（檔名與 PDF 抬頭）
            <input
              type="text"
              className="quoteStickyItemText"
              style={{ width: '100%', marginTop: 6 }}
              value={workspace.quoteTitle}
              onChange={(e) => setWorkspace((w) => ({ ...w, quoteTitle: e.target.value }))}
              placeholder="○○案場放樣與製圖"
              autoComplete="off"
            />
          </label>
        </div>

        <fieldset className="ownerClientFieldset">
          <legend>報價資訊</legend>
          <p className="muted ownerClientFieldset__hint" style={{ marginTop: 0, marginBottom: 10 }}>
            報價有效期限（天）與報價期限綁定：當<strong>報價日期</strong>為有效西元年月日時，修改任一方會自動換算另一方。
          </p>
          <div className="ownerClientFieldset__grid">
            <label className="ownerClientFieldset__label">
              報價編號
              <input
                className="ownerClientField"
                type="text"
                value={workspace.meta.quoteNumber}
                onChange={(e) => patchMeta('quoteNumber', e.target.value)}
              />
            </label>
            <label className="ownerClientFieldset__label">
              報價日期
              <div className="ownerClientFieldDateRow">
                <input
                  ref={quoteDateInputRef}
                  className="ownerClientField ownerClientField--date"
                  type="date"
                  value={quotationMetaDateToIsoInput(workspace.meta.quoteDate)}
                  onChange={(e) => onQuoteDateChange(quotationIsoInputToMetaDate(e.target.value))}
                />
                <button
                  type="button"
                  className="ownerClientDatePickerBtn"
                  aria-label="開啟日曆選擇報價日期"
                  title="開啟日曆"
                  onClick={openQuoteDatePicker}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                </button>
              </div>
            </label>
            <label className="ownerClientFieldset__label">
              報價有效期限（天）
              <input
                className="ownerClientField"
                type="text"
                inputMode="numeric"
                value={workspace.meta.validDays}
                onChange={(e) => onValidDaysChange(e.target.value)}
                placeholder="與下方期限連動"
              />
            </label>
            <label className="ownerClientFieldset__label">
              報價期限
              <input
                className="ownerClientField"
                type="text"
                value={workspace.meta.deadline}
                onChange={(e) => onDeadlineChange(e.target.value)}
                placeholder="2026/05/16"
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="ownerClientFieldset" style={{ marginTop: 16 }}>
          <legend>服務供應商</legend>
          <p className="muted ownerClientFieldset__hint">預設帶入公司資料，可自行修改；會印在 PDF。</p>
          <div className="ownerClientFieldset__grid">
            <label className="ownerClientFieldset__label">
              公司名稱
              <input
                className="ownerClientField"
                type="text"
                value={workspace.supplier.companyName}
                onChange={(e) => patchSupplier('companyName', e.target.value)}
              />
            </label>
            <label className="ownerClientFieldset__label">
              聯絡地址
              <input
                className="ownerClientField"
                type="text"
                value={workspace.supplier.address}
                onChange={(e) => patchSupplier('address', e.target.value)}
              />
            </label>
            <label className="ownerClientFieldset__label">
              電話／Email
              <input
                className="ownerClientField"
                type="text"
                value={workspace.supplier.phoneEmail}
                onChange={(e) => patchSupplier('phoneEmail', e.target.value)}
              />
            </label>
            <label className="ownerClientFieldset__label">
              統一編號
              <input
                className="ownerClientField"
                type="text"
                value={workspace.supplier.taxId}
                onChange={(e) => patchSupplier('taxId', e.target.value)}
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="ownerClientFieldset" style={{ marginTop: 16 }}>
          <legend>付款人（客戶）</legend>
          <div className="ownerClientFieldset__grid">
            <label className="ownerClientFieldset__label">
              客戶公司
              <input
                className="ownerClientField"
                type="text"
                value={workspace.payer.companyName}
                onChange={(e) => patchPayer('companyName', e.target.value)}
              />
            </label>
            <label className="ownerClientFieldset__label">
              聯絡地址（選填）
              <input
                className="ownerClientField"
                type="text"
                value={workspace.payer.address}
                onChange={(e) => patchPayer('address', e.target.value)}
              />
            </label>
            <label className="ownerClientFieldset__label">
              聯絡人
              <input
                className="ownerClientField"
                type="text"
                value={workspace.payer.contactName}
                onChange={(e) => patchPayer('contactName', e.target.value)}
              />
            </label>
            <label className="ownerClientFieldset__label">
              電話／Email
              <input
                className="ownerClientField"
                type="text"
                value={workspace.payer.phoneEmail}
                onChange={(e) => patchPayer('phoneEmail', e.target.value)}
              />
            </label>
            <label className="ownerClientFieldset__label">
              統一編號
              <input
                className="ownerClientField"
                type="text"
                value={workspace.payer.taxId}
                onChange={(e) => patchPayer('taxId', e.target.value)}
              />
            </label>
          </div>
        </fieldset>

        <div className="btnRow" style={{ margin: '16px 0 10px', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            營業稅率（%）
            <input
              {...bindDecimal(
                'qws-vat-pct',
                workspace.vatPercent,
                (n) =>
                  setWorkspace((w) => ({
                    ...w,
                    vatPercent: Math.min(100, Math.max(0, n)),
                  })),
                'quoteStickyItemText',
              )}
              style={{ width: 72 }}
              aria-label="營業稅率百分比"
            />
          </label>
          <span className="muted" style={{ fontSize: 12 }}>
            小計＝數量×單價(未稅) 四捨五入；稅金＝小計×稅率 四捨五入；含稅＝小計＋稅金
          </span>
        </div>

        <div className="btnRow" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            className="btn"
            onClick={() =>
              setWorkspace((w) => {
                const s = w.quoteTitle.trim() !== '' ? w.quoteTitle : '報價單'
                return { ...w, lines: [...w.lines, createQuotationLine(s, w.lines)] }
              })
            }
          >
            新增明細列
          </button>
          <button type="button" className="btn" onClick={() => setPreviewOpen(true)}>
            預覽 PDF
          </button>
        </div>

        <div className="tableScroll">
          <table className="data tight">
            <thead>
              <tr>
                <th className="num">項次</th>
                <th>品名</th>
                <th>類別</th>
                <th className="num">數量</th>
                <th>單位</th>
                <th className="num">單價(未稅)</th>
                <th className="num">稅金</th>
                <th className="num">小計(未稅)</th>
                <th className="num">總價(含稅)</th>
                <th>備註</th>
                <th className="receivablesTable__actCol" />
              </tr>
            </thead>
            <tbody>
              {workspace.lines.length === 0 ? (
                <tr>
                  <td colSpan={11} className="muted">
                    尚無列；請按「新增明細列」。
                  </td>
                </tr>
              ) : (
                workspace.lines.map((ln, i) => {
                  const m = quotationLineMoney(ln, vatRate)
                  return (
                    <tr key={ln.id}>
                      <td className="num muted">{i + 1}</td>
                      <td>
                        <input
                          type="text"
                          className="quoteStickyItemText"
                          value={ln.item}
                          onChange={(e) => updateLine(ln.id, { item: e.target.value })}
                          aria-label="品名"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="quoteStickyItemText"
                          value={ln.category}
                          onChange={(e) => updateLine(ln.id, { category: e.target.value })}
                          aria-label="類別"
                        />
                      </td>
                      <td className="num">
                        <input
                          {...bindDecimal(
                            `qws-qty-${ln.id}`,
                            ln.quantity,
                            (n) => updateLine(ln.id, { quantity: n }),
                            'quoteStickyItemText',
                          )}
                          aria-label="數量"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="quoteStickyItemText"
                          value={ln.unit}
                          onChange={(e) => updateLine(ln.id, { unit: e.target.value })}
                          aria-label="單位"
                        />
                      </td>
                      <td className="num">
                        <input
                          {...bindDecimal(
                            `qws-price-${ln.id}`,
                            ln.unitPriceExTax,
                            (n) => updateLine(ln.id, { unitPriceExTax: n }),
                            'quoteStickyItemText',
                          )}
                          aria-label="單價未稅"
                        />
                      </td>
                      <td className="num muted">{moneyFmt(m.tax)}</td>
                      <td className="num muted">{moneyFmt(m.subEx)}</td>
                      <td className="num muted">{moneyFmt(m.totalInc)}</td>
                      <td>
                        <input
                          type="text"
                          className="quoteStickyItemText"
                          value={ln.remarks}
                          onChange={(e) => updateLine(ln.id, { remarks: e.target.value })}
                          aria-label="備註"
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn secondary receivablesTable__miniBtn"
                          onClick={() =>
                            setWorkspace((w) => ({
                              ...w,
                              lines: w.lines.filter((x) => x.id !== ln.id),
                            }))
                          }
                        >
                          刪除
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
            {workspace.lines.length > 0 ? (
              <tfoot>
                <tr>
                  <td colSpan={6} className="num" style={{ textAlign: 'right', fontWeight: 700 }}>
                    合計
                  </td>
                  <td className="num" style={{ fontWeight: 700 }}>
                    {moneyFmt(grand.tax)}
                  </td>
                  <td className="num" style={{ fontWeight: 700 }}>
                    {moneyFmt(grand.subEx)}
                  </td>
                  <td className="num" style={{ fontWeight: 700 }}>
                    {moneyFmt(grand.totalInc)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        <fieldset className="ownerClientFieldset" style={{ marginTop: 16 }}>
          <legend>付款條件（PDF）</legend>
          <p className="muted ownerClientFieldset__hint">
            預設為依合約完工後一次繳納；可改寫、增刪條列。完全空白的條列印時會略過。
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {workspace.paymentTermsLines.map((line, i) => (
              <div
                key={line.id}
                style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}
              >
                <span className="muted" style={{ minWidth: 28, paddingTop: 8 }}>
                  {i + 1}.
                </span>
                <textarea
                  className="quoteStickyItemText"
                  style={{ flex: '1 1 280px', minHeight: 52, resize: 'vertical' }}
                  rows={2}
                  value={line.text}
                  onChange={(e) => setPaymentTermLine(line.id, e.target.value)}
                  aria-label={`付款條件第 ${i + 1} 條`}
                />
                <button
                  type="button"
                  className="btn secondary receivablesTable__miniBtn"
                  style={{ marginTop: 4 }}
                  onClick={() => removePaymentTermLine(line.id)}
                >
                  刪除
                </button>
              </div>
            ))}
          </div>
          <div className="btnRow" style={{ marginTop: 12 }}>
            <button type="button" className="btn secondary" onClick={addPaymentTermLine}>
              新增一條
            </button>
          </div>
        </fieldset>

        <fieldset className="ownerClientFieldset" style={{ marginTop: 16 }}>
          <legend>備註與條款（PDF）</legend>
          <p className="muted ownerClientFieldset__hint">
            會印在 PDF 下方；可增刪條列。完全空白的條列印時會略過。
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {workspace.clauseLines.map((line, i) => (
              <div
                key={line.id}
                style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}
              >
                <span className="muted" style={{ minWidth: 28, paddingTop: 8 }}>
                  {i + 1}.
                </span>
                <textarea
                  className="quoteStickyItemText"
                  style={{ flex: '1 1 280px', minHeight: 52, resize: 'vertical' }}
                  rows={2}
                  value={line.text}
                  onChange={(e) => setClauseLine(line.id, e.target.value)}
                  aria-label={`條款第 ${i + 1} 條`}
                />
                <button
                  type="button"
                  className="btn secondary receivablesTable__miniBtn"
                  style={{ marginTop: 4 }}
                  onClick={() => removeClauseLine(line.id)}
                >
                  刪除
                </button>
              </div>
            ))}
          </div>
          <div className="btnRow" style={{ marginTop: 12 }}>
            <button type="button" className="btn secondary" onClick={addClauseLine}>
              新增一條
            </button>
          </div>
        </fieldset>
      </section>

      {previewOpen ? (
        <div
          className="quoteDialogOverlay ownerScopePdfPreviewOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quotationPdfPreviewTitle"
          onClick={() => setPreviewOpen(false)}
        >
          <div className="quoteDialogPanel ownerScopePdfPreviewPanel" onClick={(e) => e.stopPropagation()}>
            <div className="ownerScopePdfPreviewHead">
              <h2 id="quotationPdfPreviewTitle">報價單 PDF 預覽</h2>
              <p className="muted" style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.5 }}>
                下方版面與下載檔相同。按 Esc 或背景可關閉。
              </p>
            </div>
            <div className="ownerScopePdfPreviewScroll">
              <div ref={pdfRef}>
                <QuotationPdfSheet
                  quoteTitle={workspace.quoteTitle}
                  meta={workspace.meta}
                  supplier={workspace.supplier}
                  payer={workspace.payer}
                  lines={workspace.lines}
                  vatPercent={workspace.vatPercent}
                  paymentTermsLines={workspace.paymentTermsLines}
                  clauseLines={workspace.clauseLines}
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
                    await downloadOwnerScopePdf(el, buildQuotationPdfFilename(workspace.quoteTitle))
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
