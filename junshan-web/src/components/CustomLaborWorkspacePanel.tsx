import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { buildWorkDetailPdfFilename, downloadOwnerScopePdf } from '../domain/ownerScopePdfExport'
import { createCustomLaborReportLine, type CustomLaborReportLine } from '../domain/quoteCustomLaborReport'
import type { QuoteOwnerClient } from '../domain/quoteEngine'
import {
  createCustomLaborClauseLine,
  initialCustomLaborWorkspace,
  type CustomLaborWorkspaceState,
} from '../domain/customLaborWorkspace'
import { OwnerScopePdfSheet } from './OwnerScopePdfSheet'
import { useLooseNumericDrafts } from '../hooks/useLooseNumericDrafts'

type Props = {
  workspace: CustomLaborWorkspaceState
  setWorkspace: Dispatch<SetStateAction<CustomLaborWorkspaceState>>
}

export function CustomLaborWorkspacePanel({ workspace, setWorkspace }: Props) {
  const { bindDecimal } = useLooseNumericDrafts()
  const pdfRef = useRef<HTMLDivElement>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const docDateLabel = new Date().toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  useEffect(() => {
    if (!previewOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewOpen])

  function setTitle(v: string) {
    setWorkspace((w) => ({ ...w, caseTitle: v }))
  }

  function setOwnerField<K extends keyof QuoteOwnerClient>(k: K, v: string) {
    setWorkspace((w) => ({ ...w, ownerClient: { ...w.ownerClient, [k]: v } }))
  }

  function updateLine(
    id: string,
    patch: Partial<Pick<CustomLaborReportLine, 'item' | 'category' | 'quantity' | 'unit' | 'remarks'>>,
  ) {
    setWorkspace((w) => ({
      ...w,
      lines: w.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }))
  }

  const caseSeed = workspace.caseTitle.trim() !== '' ? workspace.caseTitle : '工作明細'

  function setClauseLine(id: string, text: string) {
    setWorkspace((w) => ({
      ...w,
      clauseLines: w.clauseLines.map((c) => (c.id === id ? { ...c, text } : c)),
    }))
  }

  function addClauseLine() {
    setWorkspace((w) => {
      const seed = w.caseTitle.trim() !== '' ? w.caseTitle : '工作明細'
      return {
        ...w,
        clauseLines: [...w.clauseLines, createCustomLaborClauseLine(seed, w.clauseLines)],
      }
    })
  }

  function removeClauseLine(id: string) {
    setWorkspace((w) => ({
      ...w,
      clauseLines: w.clauseLines.filter((c) => c.id !== id),
    }))
  }

  function confirmClearWorkspace() {
    if (
      !window.confirm(
        '確定要一鍵清除「工作明細」？\n將還原為空白案名、空白甲方與明細，條款恢復為預設文字。',
      )
    ) {
      return
    }
    setPreviewOpen(false)
    setWorkspace(initialCustomLaborWorkspace())
  }

  return (
    <div className="customLaborWorkspace">
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
          <h3 style={{ margin: 0 }}>工作明細</h3>
          <button type="button" className="btn danger" onClick={confirmClearWorkspace}>
            一鍵清除
          </button>
        </div>
        <p className="hint">
          位於「對外文件」：與「放樣估價」<strong>案場、成本列無連動</strong>，供自填品項、數量、甲方與條款後輸出 PDF；案名與甲方僅用於本表，不與估價案場共用。
        </p>
        <div style={{ marginBottom: 16, maxWidth: 520 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
            案名（PDF 抬頭）
            <input
              type="text"
              className="quoteStickyItemText"
              style={{ width: '100%', marginTop: 4 }}
              value={workspace.caseTitle}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：○○社區 B1 樣品屋"
              autoComplete="off"
            />
          </label>
        </div>
        <fieldset className="ownerClientFieldset">
          <legend>業主／發包方（甲方）</legend>
          <p className="muted ownerClientFieldset__hint">
            會印在承攬供述明細 PDF 的甲方區塊；未填欄位在 PDF 以底線占位。聯絡地址選填，有填才多一行。
          </p>
          <div className="ownerClientFieldset__grid">
            <label className="ownerClientFieldset__label">
              公司名稱
              <input
                className="ownerClientField"
                type="text"
                value={workspace.ownerClient.companyName}
                onChange={(e) => setOwnerField('companyName', e.target.value)}
                autoComplete="organization"
              />
            </label>
            <label className="ownerClientFieldset__label">
              聯絡地址（選填）
              <input
                className="ownerClientField"
                type="text"
                value={workspace.ownerClient.address}
                onChange={(e) => setOwnerField('address', e.target.value)}
                autoComplete="street-address"
              />
            </label>
            <label className="ownerClientFieldset__label">
              聯絡人
              <input
                className="ownerClientField"
                type="text"
                value={workspace.ownerClient.contactName}
                onChange={(e) => setOwnerField('contactName', e.target.value)}
                autoComplete="name"
              />
            </label>
            <label className="ownerClientFieldset__label">
              電話／Email
              <input
                className="ownerClientField"
                type="text"
                value={workspace.ownerClient.phoneEmail}
                onChange={(e) => setOwnerField('phoneEmail', e.target.value)}
                autoComplete="tel"
              />
            </label>
            <label className="ownerClientFieldset__label">
              統一編號
              <input
                className="ownerClientField"
                type="text"
                inputMode="numeric"
                value={workspace.ownerClient.taxId}
                onChange={(e) => setOwnerField('taxId', e.target.value)}
                autoComplete="off"
              />
            </label>
          </div>
        </fieldset>
        <fieldset className="ownerClientFieldset" style={{ marginTop: 16 }}>
          <legend>備註與條款（PDF）</legend>
          <p className="muted ownerClientFieldset__hint">
            會印在 PDF 下方「備註與條款」區塊；可增刪條列、修改文字。列印時會略過完全空白的條列。
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {workspace.clauseLines.map((line, i) => (
              <div
                key={line.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                }}
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
          <div className="btnRow" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="btn secondary" onClick={addClauseLine}>
              新增一條
            </button>
          </div>
        </fieldset>
        <div className="btnRow" style={{ margin: '16px 0 12px', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            className="btn"
            onClick={() =>
              setWorkspace((w) => ({
                ...w,
                lines: [...w.lines, createCustomLaborReportLine(caseSeed, w.lines)],
              }))
            }
          >
            新增一列
          </button>
          <button
            type="button"
            className="btn"
            disabled={workspace.lines.length === 0}
            title={workspace.lines.length === 0 ? '請先新增至少一列' : '預覽與下載檔版面相同'}
            onClick={() => setPreviewOpen(true)}
          >
            預覽 PDF
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            下載檔名含「工作明細」與案名、日期
          </span>
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
                <th>備註</th>
                <th className="receivablesTable__actCol" />
              </tr>
            </thead>
            <tbody>
              {workspace.lines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">
                    尚無列；請按「新增一列」。
                  </td>
                </tr>
              ) : (
                workspace.lines.map((ln, rowIdx) => (
                  <tr key={ln.id}>
                    <td className="num muted">{rowIdx + 1}</td>
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
                          `cl-ws-qty-${ln.id}`,
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {previewOpen ? (
        <div
          className="quoteDialogOverlay ownerScopePdfPreviewOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="customLaborWsPdfPreviewTitle"
          onClick={() => setPreviewOpen(false)}
        >
          <div className="quoteDialogPanel ownerScopePdfPreviewPanel" onClick={(e) => e.stopPropagation()}>
            <div className="ownerScopePdfPreviewHead">
              <h2 id="customLaborWsPdfPreviewTitle">工作明細 PDF 預覽</h2>
              <p className="muted" style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.5 }}>
                下方為與下載檔相同版面。按 Esc 或背景可關閉。
              </p>
            </div>
            <div className="ownerScopePdfPreviewScroll">
              <div ref={pdfRef}>
                <OwnerScopePdfSheet
                  variant="customExplain"
                  caseTitle={workspace.caseTitle}
                  ownerClient={workspace.ownerClient}
                  customLines={workspace.lines}
                  clauseLines={workspace.clauseLines}
                  docDateLabel={docDateLabel}
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
                disabled={workspace.lines.length === 0 || pdfBusy}
                onClick={async () => {
                  const el = pdfRef.current
                  if (!el) return
                  setPdfBusy(true)
                  try {
                    await downloadOwnerScopePdf(
                      el,
                      buildWorkDetailPdfFilename(workspace.caseTitle),
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
