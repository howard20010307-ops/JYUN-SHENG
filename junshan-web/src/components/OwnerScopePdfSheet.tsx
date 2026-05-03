import type { OwnerWorkScopeSection } from '../domain/quoteOwnerScope'
import type { QuoteSite } from '../domain/quoteEngine'

const CONTRACTOR_COMPANY = '鈞泩放樣工程行'

export const OWNER_SCOPE_DOC_TITLE = '放樣工程(內外業)承攬供述明細'

export type OwnerScopePdfSheetProps = {
  site: QuoteSite
  sections: OwnerWorkScopeSection[]
  /** 例如：模組版、逐層版 */
  modeLabel: string
  /** 產製日期顯示字串，例如 2026/05/03 */
  docDateLabel: string
  /** 與「總結」一致：總坪×作圖單價（總坪不含「基礎工程」列） */
  drawingCost: number
  sumPing: number
  drawingPerPing: number
}

function sumPricingDays(sections: readonly OwnerWorkScopeSection[]): number {
  let s = 0
  for (const sec of sections) {
    for (const ln of sec.lines) {
      s += ln.pricingDays
    }
  }
  return s
}

/** 供 html2pdf 擷取之離屏版面（橘色系／雙欄聯絡人／主表／簽章），樣式以 inline 為主以利截圖一致 */
export function OwnerScopePdfSheet({
  site,
  sections,
  modeLabel,
  docDateLabel,
  drawingCost,
  sumPing,
  drawingPerPing,
}: OwnerScopePdfSheetProps) {
  const orangeBar = {
    background: 'linear-gradient(180deg, #ffe8c8 0%, #ffd49a 55%, #ffc978 100%)',
    border: '1px solid #e8b060',
    borderRadius: 2,
  } as const

  const boxBorder = {
    border: '1px solid #deb887',
    borderRadius: 2,
    background: '#fffdf8',
  } as const

  const totalLabor = sumPricingDays(sections)

  let itemNo = 0
  const bodyRows = sections.flatMap((sec) =>
    sec.lines.map((ln) => {
      itemNo += 1
      const no = itemNo
      const zoneLabel =
        sec.moduleLabel != null && sec.moduleLabel !== '' ? `${sec.title}（${sec.moduleLabel}）` : sec.title
      return (
        <tr key={`${no}-${sec.title}-${ln.item}`}>
          <td style={{ border: '1px solid #d4b896', padding: '5px 4px', textAlign: 'center' }}>{no}</td>
          <td style={{ border: '1px solid #d4b896', padding: '5px 6px' }}>{ln.item}</td>
          <td style={{ border: '1px solid #d4b896', padding: '5px 6px', fontSize: 10 }}>{zoneLabel}</td>
          <td style={{ border: '1px solid #d4b896', padding: '5px 6px', textAlign: 'right' }}>
            {ln.pricingDays.toFixed(2)}
          </td>
          <td style={{ border: '1px solid #d4b896', padding: '5px 6px', textAlign: 'right' }}>
            {ln.ping.toFixed(4)}
          </td>
        </tr>
      )
    }),
  )

  return (
    <div
      className="ownerScopePdfRoot"
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
      <div style={{ ...orangeBar, padding: '10px 12px', textAlign: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.12em' }}>{OWNER_SCOPE_DOC_TITLE}</div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'stretch' }}>
        <div
          style={{
            width: 72,
            minHeight: 72,
            flexShrink: 0,
            ...boxBorder,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            color: '#888',
          }}
        >
          Logo
        </div>
        <div style={{ flex: 1, ...boxBorder, padding: '8px 10px', fontSize: 10.5 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ padding: '2px 6px 2px 0', width: '28%', color: '#444' }}>案名</td>
                <td style={{ padding: '2px 0', fontWeight: 600 }}>
                  {(site.name ?? '').trim() || '—'}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '2px 6px 2px 0', color: '#444' }}>呈現方式</td>
                <td style={{ padding: '2px 0' }}>{modeLabel}</td>
              </tr>
              <tr>
                <td style={{ padding: '2px 6px 2px 0', color: '#444' }}>產製日期</td>
                <td style={{ padding: '2px 0' }}>{docDateLabel}</td>
              </tr>
              <tr>
                <td style={{ padding: '2px 6px 2px 0', color: '#444' }}>備註</td>
                <td style={{ padding: '2px 0', fontSize: 10 }}>
                  本文件為承攬工作內容供述明細（非報價單）；計價工數係內部試算；另列製圖成本試算（元）。
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1, ...boxBorder, padding: '8px 10px' }}>
          <div
            style={{
              ...orangeBar,
              padding: '4px 8px',
              fontWeight: 700,
              fontSize: 11,
              margin: '-8px -10px 8px',
              borderLeft: 'none',
              borderRight: 'none',
              borderTop: 'none',
            }}
          >
            承攬方（乙方）
          </div>
          <div style={{ fontSize: 10.5 }}>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#555' }}>公司名稱：</span>
              {CONTRACTOR_COMPANY}
            </div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#555' }}>聯絡地址：</span>
              _________________________________
            </div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#555' }}>電話／Email：</span>
              _________________________________
            </div>
            <div>
              <span style={{ color: '#555' }}>統一編號：</span>
              _________________________________
            </div>
          </div>
        </div>
        <div style={{ flex: 1, ...boxBorder, padding: '8px 10px' }}>
          <div
            style={{
              ...orangeBar,
              padding: '4px 8px',
              fontWeight: 700,
              fontSize: 11,
              margin: '-8px -10px 8px',
              borderLeft: 'none',
              borderRight: 'none',
              borderTop: 'none',
            }}
          >
            業主／發包方（甲方）
          </div>
          <div style={{ fontSize: 10.5 }}>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#555' }}>公司名稱：</span>
              _________________________________
            </div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#555' }}>聯絡人：</span>
              _________________________________
            </div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#555' }}>電話／Email：</span>
              _________________________________
            </div>
            <div>
              <span style={{ color: '#555' }}>統一編號：</span>
              _________________________________
            </div>
          </div>
        </div>
      </div>

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 10.5,
          border: '1px solid #c9a227',
        }}
      >
        <thead>
          <tr style={{ background: '#ffd49a' }}>
            <th
              style={{
                border: '1px solid #c9a227',
                padding: '6px 4px',
                width: '8%',
                fontWeight: 700,
              }}
            >
              項次
            </th>
            <th
              style={{
                border: '1px solid #c9a227',
                padding: '6px 6px',
                width: '34%',
                fontWeight: 700,
              }}
            >
              細項名稱
            </th>
            <th
              style={{
                border: '1px solid #c9a227',
                padding: '6px 4px',
                width: '32%',
                fontWeight: 700,
              }}
            >
              區位／模組
            </th>
            <th
              style={{
                border: '1px solid #c9a227',
                padding: '6px 4px',
                width: '13%',
                fontWeight: 700,
                textAlign: 'right',
              }}
            >
              計價工數
            </th>
            <th
              style={{
                border: '1px solid #c9a227',
                padding: '6px 4px',
                width: '13%',
                fontWeight: 700,
                textAlign: 'right',
              }}
            >
              坪數
            </th>
          </tr>
        </thead>
        <tbody>
          {sections.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ border: '1px solid #c9a227', padding: 12, textAlign: 'center' }}>
                （無計價工數大於 0 之細項）
              </td>
            </tr>
          ) : (
            bodyRows
          )}
        </tbody>
        {sections.length > 0 ? (
          <tfoot>
            <tr style={{ background: '#fff5e4' }}>
              <td
                colSpan={3}
                style={{ border: '1px solid #c9a227', padding: '6px 8px', fontWeight: 700, textAlign: 'right' }}
              >
                合計（計價工數）
              </td>
              <td
                style={{
                  border: '1px solid #c9a227',
                  padding: '6px 6px',
                  textAlign: 'right',
                  fontWeight: 700,
                }}
              >
                {totalLabor.toFixed(2)}
              </td>
              <td style={{ border: '1px solid #c9a227', padding: '6px 6px', textAlign: 'center', color: '#666' }}>
                —
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>

      <div
        style={{
          marginTop: 10,
          ...boxBorder,
          padding: '10px 12px',
          background: '#fff9ef',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 11 }}>製圖成本（試算）</div>
        <div style={{ fontSize: 11 }}>
          <strong>{Math.round(drawingCost).toLocaleString()}</strong> 元
        </div>
        <div style={{ fontSize: 9.5, color: '#444', marginTop: 4, lineHeight: 1.5 }}>
          總坪 {sumPing.toFixed(4)} 坪 × 作圖 {drawingPerPing.toLocaleString()} 元／坪（總坪不含「基礎工程」列，與估價總結一致）。
        </div>
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1.1, ...boxBorder, padding: '8px 10px', fontSize: 9.5 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>備註與條款（示例）</div>
          <ol style={{ margin: 0, paddingLeft: 18, color: '#333' }}>
            <li style={{ marginBottom: 4 }}>本明細僅供述工作內容與工數、坪數資訊，不作為契約價金之唯一依據。</li>
            <li style={{ marginBottom: 4 }}>實際施作範圍以雙方書面約定或現場簽認為準。</li>
            <li style={{ marginBottom: 4 }}>
              坪數為面積表㎡換算；計價工數係依估價表邏輯試算（含風險係數後）。
            </li>
            <li>製圖成本為總坪×作圖單價之試算，實際以雙方約定為準。</li>
          </ol>
        </div>
        <div style={{ flex: 1, ...boxBorder, padding: '8px 10px', fontSize: 9.5 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>確認簽章</div>
          <div style={{ marginTop: 28, borderTop: '1px dashed #999', paddingTop: 6 }}>
            <span style={{ color: '#555' }}>承攬方簽章：</span>
          </div>
          <div style={{ marginTop: 20, borderTop: '1px dashed #999', paddingTop: 6 }}>
            <span style={{ color: '#555' }}>業主簽章：</span>
          </div>
        </div>
      </div>
    </div>
  )
}
