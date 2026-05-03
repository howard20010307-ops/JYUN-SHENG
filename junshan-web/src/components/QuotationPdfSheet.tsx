import { COMPANY_CONTRACTOR } from '../domain/companyContact'
import type { QuoteOwnerClient } from '../domain/quoteEngine'
import {
  quotationGrandTotals,
  quotationLineMoney,
  quotationVatRate,
  type QuotationClauseLine,
  type QuotationLine,
  type QuotationMeta,
  type QuotationSupplier,
} from '../domain/quotationWorkspace'

const STAMP_SRC = `${import.meta.env.BASE_URL}company-invoice-stamp.png`

function dashEmpty(v: string): string {
  const t = v.trim()
  return t !== '' ? t : '—'
}

function moneyFmt(n: number): string {
  return Math.round(n).toLocaleString()
}

export type QuotationPdfSheetProps = {
  quoteTitle: string
  meta: QuotationMeta
  supplier: QuotationSupplier
  payer: QuoteOwnerClient
  lines: readonly QuotationLine[]
  vatPercent: number
  clauseLines: readonly QuotationClauseLine[]
}

/** 供 html2pdf 擷取之報價單版面（橘色系、與試算表風格相近） */
export function QuotationPdfSheet(props: QuotationPdfSheetProps) {
  const { quoteTitle, meta, supplier, payer, lines, vatPercent, clauseLines } = props
  const vatRate = quotationVatRate(vatPercent)
  const grand = quotationGrandTotals(lines, vatRate)
  const clausesPdf = clauseLines.map((c) => c.text.trim()).filter((t) => t !== '')

  const bar = {
    background: 'linear-gradient(180deg, #ffe8c8 0%, #ffd49a 55%, #ffc978 100%)',
    border: '1px solid #e8b060',
    borderRadius: 2,
  } as const

  const box = {
    border: '1px solid #deb887',
    borderRadius: 2,
    background: '#fffdf8',
  } as const

  const cell = {
    border: '1px solid #d4b896',
    padding: '5px 6px',
    fontSize: 10,
  } as const

  return (
    <div
      className="quotationPdfRoot"
      style={{
        width: '190mm',
        maxWidth: '100%',
        margin: 0,
        padding: '10mm 12mm 12mm',
        boxSizing: 'border-box',
        fontFamily: '"Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif',
        fontSize: 11,
        lineHeight: 1.45,
        color: '#1a1a1a',
        background: '#fff',
      }}
    >
      <div style={{ ...bar, padding: '12px 14px', textAlign: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.08em' }}>報價單</span>
        <span style={{ marginLeft: 14, fontSize: 14, fontWeight: 600, color: '#333' }}>Quotation</span>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'stretch' }}>
        <div
          style={{
            width: 92,
            minHeight: 92,
            flexShrink: 0,
            ...box,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 4,
            boxSizing: 'border-box',
          }}
        >
          <img
            src={STAMP_SRC}
            alt={`${COMPANY_CONTRACTOR.name} 章`}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        </div>
        <div style={{ flex: 1, ...box, padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              ...bar,
              padding: '6px 10px',
              fontWeight: 700,
              fontSize: 11,
              margin: 0,
              borderLeft: 'none',
              borderRight: 'none',
              borderTop: 'none',
              borderRadius: 0,
            }}
          >
            報價資訊
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
            <tbody>
              <tr>
                <td style={{ padding: '6px 10px', width: '32%', color: '#555', borderBottom: '1px dashed #e0cfa5' }}>
                  報價編號
                </td>
                <td style={{ padding: '6px 10px', borderBottom: '1px dashed #e0cfa5' }}>
                  {dashEmpty(meta.quoteNumber)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '6px 10px', color: '#555', borderBottom: '1px dashed #e0cfa5' }}>
                  報價有效期限（天）
                </td>
                <td style={{ padding: '6px 10px', borderBottom: '1px dashed #e0cfa5' }}>
                  {dashEmpty(meta.validDays)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '6px 10px', color: '#555', borderBottom: '1px dashed #e0cfa5' }}>
                  報價日期
                </td>
                <td style={{ padding: '6px 10px', borderBottom: '1px dashed #e0cfa5' }}>
                  {dashEmpty(meta.quoteDate)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '6px 10px', color: '#555' }}>報價期限</td>
                <td style={{ padding: '6px 10px' }}>{dashEmpty(meta.deadline)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'stretch' }}>
        <div style={{ flex: 1, ...box, padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              ...bar,
              padding: '6px 10px',
              fontWeight: 700,
              fontSize: 11,
              margin: 0,
              borderLeft: 'none',
              borderRight: 'none',
              borderTop: 'none',
              borderRadius: 0,
            }}
          >
            服務供應商
          </div>
          <div style={{ padding: '8px 10px', fontSize: 10.5 }}>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#555' }}>公司名稱：</span>
              {dashEmpty(supplier.companyName)}
            </div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#555' }}>聯絡地址：</span>
              {dashEmpty(supplier.address)}
            </div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#555' }}>電話／Email：</span>
              {dashEmpty(supplier.phoneEmail)}
            </div>
            <div>
              <span style={{ color: '#555' }}>統一編號：</span>
              {dashEmpty(supplier.taxId)}
            </div>
          </div>
        </div>
        <div style={{ flex: 1, ...box, padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              ...bar,
              padding: '6px 10px',
              fontWeight: 700,
              fontSize: 11,
              margin: 0,
              borderLeft: 'none',
              borderRight: 'none',
              borderTop: 'none',
              borderRadius: 0,
            }}
          >
            付款人
          </div>
          <div style={{ padding: '8px 10px', fontSize: 10.5 }}>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#555' }}>客戶公司：</span>
              {dashEmpty(payer.companyName)}
            </div>
            {payer.address.trim() !== '' ? (
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: '#555' }}>聯絡地址：</span>
                {payer.address.trim()}
              </div>
            ) : null}
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#555' }}>聯絡人：</span>
              {dashEmpty(payer.contactName)}
            </div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#555' }}>電話／Email：</span>
              {dashEmpty(payer.phoneEmail)}
            </div>
            <div>
              <span style={{ color: '#555' }}>統一編號：</span>
              {dashEmpty(payer.taxId)}
            </div>
          </div>
        </div>
      </div>

      {quoteTitle.trim() !== '' ? (
        <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 600 }}>主旨：{quoteTitle.trim()}</div>
      ) : null}

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 9.5,
          border: '1px solid #c9a227',
        }}
      >
        <thead>
          <tr style={{ background: '#ffd49a' }}>
            {['項次', '品名', '類別', '數量', '單位', '單價(未稅)', '稅金', '小計(未稅)', '總價(含稅)', '備註'].map(
              (h, hi) => (
                <th
                  key={h}
                  style={{
                    border: '1px solid #c9a227',
                    padding: '6px 3px',
                    fontWeight: 700,
                    textAlign: hi === 3 || hi === 5 || hi === 6 || hi === 7 || hi === 8 ? 'right' : 'left',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td colSpan={10} style={{ ...cell, textAlign: 'center', color: '#888', padding: 14 }}>
                （尚無明細列）
              </td>
            </tr>
          ) : (
            lines.map((ln, i) => {
              const m = quotationLineMoney(ln, vatRate)
              return (
                <tr key={ln.id}>
                  <td style={{ ...cell, textAlign: 'center' }}>{i + 1}</td>
                  <td style={cell}>{ln.item}</td>
                  <td style={cell}>{ln.category}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>{ln.quantity}</td>
                  <td style={cell}>{ln.unit}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>{moneyFmt(ln.unitPriceExTax)}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>{moneyFmt(m.tax)}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>{moneyFmt(m.subEx)}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>{moneyFmt(m.totalInc)}</td>
                  <td style={{ ...cell, fontSize: 9 }}>{ln.remarks}</td>
                </tr>
              )
            })
          )}
        </tbody>
        {lines.length > 0 ? (
          <tfoot>
            <tr style={{ background: '#fff5e4' }}>
              <td
                colSpan={6}
                style={{ ...cell, textAlign: 'right', fontWeight: 700, borderTop: '2px solid #c9a227' }}
              >
                合計
              </td>
              <td
                style={{
                  ...cell,
                  textAlign: 'right',
                  fontWeight: 700,
                  borderTop: '2px solid #c9a227',
                }}
              >
                {moneyFmt(grand.tax)}
              </td>
              <td
                style={{
                  ...cell,
                  textAlign: 'right',
                  fontWeight: 700,
                  borderTop: '2px solid #c9a227',
                }}
              >
                {moneyFmt(grand.subEx)}
              </td>
              <td
                style={{
                  ...cell,
                  textAlign: 'right',
                  fontWeight: 700,
                  borderTop: '2px solid #c9a227',
                }}
              >
                {moneyFmt(grand.totalInc)}
              </td>
              <td style={{ ...cell, borderTop: '2px solid #c9a227', color: '#666', fontSize: 9 }}>
                未稅＋稅
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>

      <div style={{ marginTop: 12, fontSize: 9.5, color: '#555' }}>
        營業稅率：{vatPercent}%（列金額四捨五入至元）
      </div>

      <div style={{ marginTop: 14, ...box, padding: '8px 10px', fontSize: 9.5 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>備註與條款</div>
        <ol style={{ margin: 0, paddingLeft: 18, color: '#333' }}>
          {clausesPdf.length > 0 ? (
            clausesPdf.map((text, i) => (
              <li key={`qc-${i}`} style={{ marginBottom: 4 }}>
                {text}
              </li>
            ))
          ) : (
            <li style={{ color: '#888' }}>（無條款文字）</li>
          )}
        </ol>
      </div>
    </div>
  )
}
