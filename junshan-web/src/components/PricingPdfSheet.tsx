import type { ContractContentLine } from '../domain/contractContentModel'
import { COMPANY_CONTRACTOR } from '../domain/companyContact'
import { pricingLineSubtotalNet, type PricingRow } from '../domain/pricingWorkspace'
import type { QuoteOwnerClient } from '../domain/quoteEngine'

/** `public/pricing-stamp.png`：計價單 PDF 用「計價專用章」圖檔（白底見腳本 stamp-black-to-white.py） */
const STAMP_SRC = `${import.meta.env.BASE_URL}pricing-stamp.png`

const EMPTY_CONTRACT_LINE_BY_ID = new Map<string, ContractContentLine>()

type BuildingProgress = {
  building: string
  contractTotal: number
  alreadyRequested: number
  thisRequest: number
  remaining: number
  completion: number
}

type Props = {
  title: string
  pricingNumber: string
  pricingDate: string
  siteName: string
  remittance: {
    accountName: string
    receivingAccount: string
  }
  supplier: {
    companyName: string
    address: string
    phoneEmail: string
    taxId: string
  }
  payer: QuoteOwnerClient
  remarkLines: readonly { id: string; text: string }[]
  rows: PricingRow[]
  contractLineById?: ReadonlyMap<string, ContractContentLine>
  buildingProgress: BuildingProgress[]
  overall: {
    contractTotal: number
    alreadyRequested: number
    thisRequest: number
    remaining: number
    completion: number
  }
}

function money(n: number): string {
  return Math.round(Number.isFinite(n) ? n : 0).toLocaleString()
}

function pct(n: number): string {
  return `${((Number.isFinite(n) ? n : 0) * 100).toFixed(1)}%`
}

function dash(v: string): string {
  const t = (v ?? '').trim()
  return t !== '' ? t : '—'
}

export function PricingPdfSheet({
  title,
  pricingNumber,
  pricingDate,
  siteName,
  remittance,
  supplier,
  payer,
  remarkLines,
  rows,
  contractLineById,
  buildingProgress,
  overall,
}: Props) {
  const remarks = remarkLines.map((x) => x.text.trim()).filter(Boolean)
  const lineMap = contractLineById ?? EMPTY_CONTRACT_LINE_BY_ID
  const lineNetTotal = rows.reduce((sum, r) => sum + pricingLineSubtotalNet(r, lineMap), 0)
  const lineTaxTotal = rows.reduce((sum, r) => sum + (Number.isFinite(r.tax) ? r.tax : 0), 0)
  const lineGrossTotal = lineNetTotal + lineTaxTotal
  const thisRequestGross = rows.reduce((sum, r) => {
    const total = Number.isFinite(r.total) ? r.total : r.amountNet + r.tax
    return sum + (Number.isFinite(total) ? total : 0)
  }, 0)
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

  const totalColHeader = {
    border: '1px solid #0f766e',
    padding: '6px 4px',
    fontWeight: 800,
    textAlign: 'right' as const,
    background: 'linear-gradient(180deg, #0d9488 0%, #0f766e 100%)',
    color: '#fff',
  }

  const totalColBody = {
    ...cell,
    textAlign: 'right' as const,
    background: '#ecfdf5',
    color: '#065f46',
    fontWeight: 700,
    border: '1px solid #0f766e',
  }

  const thisReqHeader = {
    border: '1px solid #9a3412',
    padding: '5px 4px',
    fontWeight: 800,
    textAlign: 'right' as const,
    background: 'linear-gradient(180deg, #fdba74 0%, #fb923c 100%)',
    color: '#7c2d12',
  }

  const thisReqBody = {
    ...cell,
    textAlign: 'right' as const,
    background: '#ffedd5',
    color: '#9a3412',
    fontWeight: 800,
    border: '1px solid #fdba74',
  }

  return (
    <div
      className="quotationPdfRoot"
      style={{
        width: '190mm',
        maxWidth: '100%',
        margin: '0 auto',
        padding: '10mm 12mm 12mm',
        boxSizing: 'border-box',
        background: '#fff',
        color: '#1a1a1a',
        fontFamily: '"Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif',
        fontSize: 11,
        lineHeight: 1.45,
      }}
    >
      <div data-pdf-workspace="head" style={{ ...bar, padding: '12px 14px', textAlign: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 19, fontWeight: 900, letterSpacing: '0.08em' }}>計價單</span>
        <span style={{ marginLeft: 14, fontSize: 14, fontWeight: 700, color: '#333' }}>Pricing Sheet</span>
      </div>

      <div data-pdf-workspace="case">
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'stretch' }}>
        <div
          style={{
            width: 92,
            minHeight: 92,
            flexShrink: 0,
            ...box,
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 4,
            boxSizing: 'border-box',
          }}
        >
          <img
            src={STAMP_SRC}
            alt={`${COMPANY_CONTRACTOR.name} 計價專用章`}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        </div>
        <div style={{ flex: 1, ...box, padding: 0, overflow: 'hidden' }}>
          <div style={{ ...bar, padding: '6px 10px', fontWeight: 700, fontSize: 11, margin: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none', borderRadius: 0 }}>
            計價資訊
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
            <tbody>
              <tr>
                <td style={{ padding: '6px 10px', width: '32%', color: '#555', borderBottom: '1px dashed #e0cfa5', fontWeight: 700 }}>計價單名稱</td>
                <td style={{ padding: '6px 10px', borderBottom: '1px dashed #e0cfa5' }}>{dash(title)}</td>
              </tr>
              <tr>
                <td style={{ padding: '6px 10px', color: '#555', borderBottom: '1px dashed #e0cfa5', fontWeight: 800 }}>計價單編號</td>
                <td style={{ padding: '6px 10px', borderBottom: '1px dashed #e0cfa5', fontWeight: 800 }}>{dash(pricingNumber)}</td>
              </tr>
              <tr>
                <td style={{ padding: '6px 10px', color: '#555', borderBottom: '1px dashed #e0cfa5' }}>計價日期</td>
                <td style={{ padding: '6px 10px', borderBottom: '1px dashed #e0cfa5' }}>{dash(pricingDate)}</td>
              </tr>
              <tr>
                <td style={{ padding: '6px 10px', color: '#555' }}>案場</td>
                <td style={{ padding: '6px 10px' }}>{dash(siteName)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'stretch' }}>
        <div style={{ flex: 1, ...box, padding: 0, overflow: 'hidden' }}>
          <div style={{ ...bar, padding: '6px 10px', fontWeight: 700, fontSize: 11, margin: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none', borderRadius: 0 }}>
            乙方資訊
          </div>
          <div style={{ padding: '8px 10px', fontSize: 10.5 }}>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#555' }}>公司名稱：</span>
              {dash(supplier.companyName)}
            </div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#555' }}>聯絡地址：</span>
              {dash(supplier.address)}
            </div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#555' }}>電話／Email：</span>
              {dash(supplier.phoneEmail)}
            </div>
            <div>
              <span style={{ color: '#555' }}>統一編號：</span>
              {dash(supplier.taxId)}
            </div>
          </div>
        </div>
        <div style={{ flex: 1, ...box, padding: 0, overflow: 'hidden' }}>
          <div style={{ ...bar, padding: '6px 10px', fontWeight: 700, fontSize: 11, margin: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none', borderRadius: 0 }}>
            甲方資訊
          </div>
          <div style={{ padding: '8px 10px', fontSize: 10.5 }}>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#555' }}>客戶公司：</span>
              {dash(payer.companyName)}
            </div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#555' }}>聯絡地址：</span>
              {dash(payer.address)}
            </div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#555' }}>聯絡人：</span>
              {dash(payer.contactName)}
            </div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#555' }}>電話／Email：</span>
              {dash(payer.phoneEmail)}
            </div>
            <div>
              <span style={{ color: '#555' }}>統一編號：</span>
              {dash(payer.taxId)}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          marginBottom: 12,
          border: '2px solid #7c2d12',
          borderRadius: 3,
          background: 'linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%)',
          boxShadow: '0 0 0 2px #fed7aa inset',
          overflow: 'hidden',
        }}
      >
          <div
          style={{
            padding: '7px 10px',
            fontWeight: 900,
              fontSize: 12.5,
            letterSpacing: '0.04em',
            margin: 0,
            color: '#ffffff',
            background: 'linear-gradient(180deg, #ea580c 0%, #c2410c 100%)',
            borderBottom: '1px solid #9a3412',
          }}
        >
          匯款資訊
        </div>
        <div style={{ padding: '9px 10px', fontSize: 11 }}>
          <div style={{ marginBottom: 5 }}>
            <span style={{ color: '#7c2d12', fontWeight: 800 }}>帳戶名稱：</span>
            <span style={{ fontWeight: 800 }}>{dash(remittance.accountName)}</span>
          </div>
          <div
            style={{
              border: '1px dashed #ea580c',
              background: '#fff',
              padding: '5px 8px',
            }}
          >
            <span style={{ color: '#7c2d12', fontWeight: 900 }}>收款帳戶：</span>
            <span style={{ fontSize: 12.5, fontWeight: 900, color: '#9a3412', letterSpacing: '0.04em' }}>
              {dash(remittance.receivingAccount)}
            </span>
          </div>
        </div>
      </div>

      </div>

      <table data-pdf-workspace="lines" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 10, border: '1px solid #c9a227' }}>
        <colgroup>
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '9%' }} />
        </colgroup>
        <thead>
          <tr style={{ background: '#ffd49a' }}>
            {['棟', '樓層', '階段', '項目', '單位', '數量', '單價(未稅)', '小計(未稅)', '稅金', '總價'].map((h) => (
              <th
                key={h}
                style={
                  h === '總價'
                    ? totalColHeader
                    : {
                        border: '1px solid #c9a227',
                        padding: '6px 4px',
                        fontWeight: 700,
                        textAlign: h.includes('金額') || h.includes('稅') ? 'right' : 'left',
                      }
                }
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={10} style={{ ...cell, textAlign: 'center', color: '#666', padding: 12 }}>
                尚無計價列
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const subtotal = pricingLineSubtotalNet(r, lineMap)
              return (
                <tr key={r.id}>
                  <td style={cell}>{r.buildingLabel || '—'}</td>
                  <td style={cell}>{r.floorLabel || '—'}</td>
                  <td style={cell}>{r.phaseLabel || '—'}</td>
                  <td style={cell}>{r.item || '—'}</td>
                  <td style={cell}>{r.unit || '—'}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>{money(Number.isFinite(r.quantity) ? r.quantity : 0)}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>{money(Number.isFinite(r.amountNet) ? r.amountNet : 0)}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>{money(subtotal)}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>{money(r.tax)}</td>
                  <td style={totalColBody}>{money(r.total)}</td>
                </tr>
              )
            })
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={7} style={{ ...cell, textAlign: 'right', fontWeight: 800 }}>
              合計
            </td>
            <td style={{ ...cell, textAlign: 'right', fontWeight: 800 }}>{money(lineNetTotal)}</td>
            <td style={{ ...cell, textAlign: 'right', fontWeight: 800 }}>{money(lineTaxTotal)}</td>
            <td style={{ ...totalColBody, fontWeight: 900 }}>{money(lineGrossTotal)}</td>
          </tr>
        </tfoot>
      </table>

      <div data-pdf-workspace="vat">
      <h3 style={{ margin: '14px 0 6px', fontSize: 14 }}>棟別進度（未稅）</h3>
      <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 10.5, border: '1px solid #c9a227' }}>
        <colgroup>
          <col style={{ width: '12%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '14%' }} />
        </colgroup>
        <thead>
          <tr style={{ background: '#ffe8c8' }}>
            {['棟', '已請(未稅)', '本次(未稅)', '請後累計(未稅)', '剩餘金額(未稅)', '完成度', '未完成'].map((h) => (
              <th
                key={h}
                style={
                  h === '本次(未稅)'
                    ? thisReqHeader
                    : { border: '1px solid #c9a227', padding: '5px 4px', fontWeight: 700, textAlign: h === '棟' ? 'left' : 'right' }
                }
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {buildingProgress.map((b) => {
            const after = b.alreadyRequested + b.thisRequest
            return (
              <tr key={b.building}>
                <td style={cell}>{b.building}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{money(b.alreadyRequested)}</td>
                <td style={thisReqBody}>{money(b.thisRequest)}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{money(after)}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{money(b.remaining)}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{pct(b.completion)}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{pct(1 - b.completion)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div
        style={{
          marginTop: 10,
          border: '1px solid #6d28d9',
          background: 'linear-gradient(180deg, #f5f3ff 0%, #ede9fe 100%)',
          padding: '8px 10px',
        }}
      >
        <div style={{ fontSize: 12.5, fontWeight: 900, color: '#4c1d95', marginBottom: 6, letterSpacing: '0.04em' }}>全案合計</div>
        <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 10.5, marginBottom: 6 }}>
          <colgroup>
            <col style={{ width: '48%' }} />
            <col style={{ width: '52%' }} />
          </colgroup>
          <tbody>
            <tr>
              <th style={{ border: '1px solid #c4b5fd', padding: '4px 6px', textAlign: 'left', background: '#ede9fe' }}>指標</th>
              <th style={{ border: '1px solid #c4b5fd', padding: '4px 6px', textAlign: 'right', background: '#ede9fe' }}>數值</th>
            </tr>
            <tr>
              <td style={{ border: '1px solid #ddd6fe', padding: '4px 6px', fontWeight: 800 }}>合約總金額(未稅)</td>
              <td style={{ border: '1px solid #ddd6fe', padding: '4px 6px', textAlign: 'right', fontWeight: 900 }}>{money(overall.contractTotal)}</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #ddd6fe', padding: '4px 6px' }}>已請(未稅)</td>
              <td style={{ border: '1px solid #ddd6fe', padding: '4px 6px', textAlign: 'right' }}>{money(overall.alreadyRequested)}</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #ddd6fe', padding: '4px 6px', color: '#9a3412', fontWeight: 900, fontSize: 11 }}>本次(未稅)</td>
              <td
                style={{
                  border: '1px solid #7c3aed',
                  padding: '4px 6px',
                  textAlign: 'right',
                  color: '#3b0764',
                  fontWeight: 900,
                  fontSize: 11.5,
                  background: 'linear-gradient(180deg, #ede9fe 0%, #ddd6fe 100%)',
                }}
              >
                {money(overall.thisRequest)}
              </td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #ddd6fe', padding: '4px 6px' }}>請後累計(未稅)</td>
              <td style={{ border: '1px solid #ddd6fe', padding: '4px 6px', textAlign: 'right' }}>{money(overall.alreadyRequested + overall.thisRequest)}</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #ddd6fe', padding: '4px 6px', color: '#b91c1c', fontWeight: 700 }}>剩餘(未稅)</td>
              <td style={{ border: '1px solid #ddd6fe', padding: '4px 6px', textAlign: 'right', color: '#b91c1c', fontWeight: 800 }}>{money(overall.remaining)}</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #ddd6fe', padding: '4px 6px' }}>完成度</td>
              <td style={{ border: '1px solid #ddd6fe', padding: '4px 6px', textAlign: 'right' }}>{pct(overall.completion)}</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #ddd6fe', padding: '4px 6px' }}>未完成</td>
              <td style={{ border: '1px solid #ddd6fe', padding: '4px 6px', textAlign: 'right' }}>{pct(1 - overall.completion)}</td>
            </tr>
          </tbody>
        </table>
        <div
          style={{
            marginTop: 6,
            border: '2px solid #0f766e',
            background: 'linear-gradient(180deg, #ecfdf5 0%, #d1fae5 100%)',
            padding: '6px 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span style={{ color: '#065f46', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.02em' }}>本次請款總金額(含稅)</span>
          <span style={{ color: '#065f46', fontWeight: 900, fontSize: 14, letterSpacing: '0.03em' }}>{money(thisRequestGross)}</span>
        </div>
      </div>
      </div>

      <div data-pdf-workspace="clauses" style={{ marginTop: 12, ...box, padding: '8px 10px', fontSize: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>備註</div>
        <ol style={{ margin: 0, paddingLeft: 18, color: '#333' }}>
          {remarks.length > 0 ? (
            remarks.map((text, i) => (
              <li key={`pr-remark-${i}`} style={{ marginBottom: 4 }}>
                {text}
              </li>
            ))
          ) : (
            <li style={{ color: '#888' }}>（無備註）</li>
          )}
        </ol>
      </div>
    </div>
  )
}

