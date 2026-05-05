import type { PricingRow } from '../domain/pricingWorkspace'

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
  pricingDate: string
  siteName: string
  rows: PricingRow[]
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

export function PricingPdfSheet({ title, pricingDate, siteName, rows, buildingProgress, overall }: Props) {
  return (
    <div
      style={{
        width: '210mm',
        minHeight: '297mm',
        padding: '12mm 12mm 14mm',
        boxSizing: 'border-box',
        background: '#fff',
        color: '#1a1a1a',
        fontFamily: '"Noto Sans TC", "Microsoft JhengHei", Arial, sans-serif',
      }}
    >
      <h1 style={{ margin: 0, textAlign: 'center', fontSize: '22px', letterSpacing: '0.12em' }}>{title || '計價單'}</h1>
      <div style={{ marginTop: 10, marginBottom: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
        <div>案場：{siteName || '—'}</div>
        <div style={{ textAlign: 'right' }}>開立日期：{pricingDate || '—'}</div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {['棟', '樓層', '階段', '項目', '金額(未稅)', '稅金', '總計'].map((h) => (
              <th key={h} style={{ border: '1px solid #444', padding: '6px 4px', background: '#f2f2f2' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ border: '1px solid #444', padding: 8, textAlign: 'center', color: '#666' }}>
                尚無計價列
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id}>
                <td style={{ border: '1px solid #444', padding: '5px 4px' }}>{r.buildingLabel || '—'}</td>
                <td style={{ border: '1px solid #444', padding: '5px 4px' }}>{r.floorLabel || '—'}</td>
                <td style={{ border: '1px solid #444', padding: '5px 4px' }}>{r.phaseLabel || '—'}</td>
                <td style={{ border: '1px solid #444', padding: '5px 4px' }}>{r.item || '—'}</td>
                <td style={{ border: '1px solid #444', padding: '5px 4px', textAlign: 'right' }}>{money(r.amountNet)}</td>
                <td style={{ border: '1px solid #444', padding: '5px 4px', textAlign: 'right' }}>{money(r.tax)}</td>
                <td style={{ border: '1px solid #444', padding: '5px 4px', textAlign: 'right' }}>{money(r.total)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <h3 style={{ margin: '14px 0 6px', fontSize: 14 }}>棟別進度</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
        <thead>
          <tr>
            {['棟', '已請', '本次', '請後累計', '剩餘金額', '完成度', '未完成'].map((h) => (
              <th key={h} style={{ border: '1px solid #444', padding: '5px 4px', background: '#f7f7f7' }}>
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
                <td style={{ border: '1px solid #444', padding: '5px 4px' }}>{b.building}</td>
                <td style={{ border: '1px solid #444', padding: '5px 4px', textAlign: 'right' }}>{money(b.alreadyRequested)}</td>
                <td style={{ border: '1px solid #444', padding: '5px 4px', textAlign: 'right' }}>{money(b.thisRequest)}</td>
                <td style={{ border: '1px solid #444', padding: '5px 4px', textAlign: 'right' }}>{money(after)}</td>
                <td style={{ border: '1px solid #444', padding: '5px 4px', textAlign: 'right' }}>{money(b.remaining)}</td>
                <td style={{ border: '1px solid #444', padding: '5px 4px', textAlign: 'right' }}>{pct(b.completion)}</td>
                <td style={{ border: '1px solid #444', padding: '5px 4px', textAlign: 'right' }}>{pct(1 - b.completion)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ marginTop: 10, padding: '8px 10px', border: '1px solid #444', fontSize: 12, lineHeight: 1.65 }}>
        全案合計：已請 {money(overall.alreadyRequested)}；本次 {money(overall.thisRequest)}；請後累計{' '}
        {money(overall.alreadyRequested + overall.thisRequest)}；剩餘 {money(overall.remaining)}；完成度 {pct(overall.completion)}；
        未完成 {pct(1 - overall.completion)}
      </div>
    </div>
  )
}

