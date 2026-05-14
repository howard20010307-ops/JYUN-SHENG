import { COMPANY_CONTRACTOR } from '../domain/companyContact'
import type { CustomLaborClauseLine } from '../domain/customLaborWorkspace'
import type {
  CustomLaborReportLine,
  QuoteOwnerClient,
  QuoteSite,
} from '../domain/quoteEngine'
import type { OwnerWorkScopeLaborKind, OwnerWorkScopeSection } from '../domain/quoteOwnerScope'
import { ownerWorkScopeLaborColumnLabel } from '../domain/quoteOwnerScope'

function ownerFieldDisplay(v: string): string {
  const t = v.trim()
  return t !== '' ? t : '_________________________________'
}

export const OWNER_SCOPE_DOC_TITLE = '放樣工程(內外業)承攬供述明細'

/** `public/owner-scope-company-stamp.png`：承攬供述明細 PDF 左上角公司標章／圖示 */
const OWNER_SCOPE_COMPANY_STAMP_SRC = `${import.meta.env.BASE_URL}owner-scope-company-stamp.png`

/** 由估價列產生之業主工作內容，或「工作明細」自填列 */
export type OwnerScopePdfSheetProps =
  | {
      variant?: 'fromQuote'
      site: QuoteSite
      docDateLabel: string
      sections: OwnerWorkScopeSection[]
      modeLabel: string
      laborKind: OwnerWorkScopeLaborKind
    }
  | {
      variant: 'customExplain'
      caseTitle: string
      ownerClient: QuoteOwnerClient
      docDateLabel: string
      customLines: CustomLaborReportLine[]
      /** PDF「備註與條款」逐條文字 */
      clauseLines: readonly CustomLaborClauseLine[]
    }

function sumLaborDays(sections: readonly OwnerWorkScopeSection[]): number {
  let s = 0
  for (const sec of sections) {
    for (const ln of sec.lines) {
      s += ln.laborDays
    }
  }
  return s
}

function sumCustomQuantity(lines: readonly CustomLaborReportLine[]): number {
  let s = 0
  for (const ln of lines) {
    if (Number.isFinite(ln.quantity)) s += ln.quantity
  }
  return s
}

function formatPdfQuantity(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const x = Math.round(n * 100) / 100
  return Number.isInteger(x) ? String(x) : x.toFixed(2)
}

/** 供 PDF 匯出截圖用之離屏版面（橘色系／雙欄聯絡人／主表／簽章），樣式以 inline 為主以利截圖一致 */
export function OwnerScopePdfSheet(props: OwnerScopePdfSheetProps) {
  const isCustom = props.variant === 'customExplain'
  const docDateLabel = props.docDateLabel
  const sections = isCustom ? [] : props.sections
  const customLines = isCustom ? props.customLines : []
  const modeLabel = isCustom ? '工作明細（自填項目）' : props.modeLabel
  const laborKind = isCustom ? ('pricing' as const) : props.laborKind

  const oc = isCustom ? props.ownerClient : props.site.ownerClient
  const caseNameDisplay = isCustom
    ? (props.caseTitle ?? '').trim() || '—'
    : (props.site.name ?? '').trim() || '—'
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

  const laborColLabel = ownerWorkScopeLaborColumnLabel(laborKind)
  const totalLabor = isCustom ? sumCustomQuantity(customLines) : sumLaborDays(sections)
  const laborFootnote = isCustom
    ? '本附件係就表列品項之數量與說明之書面摘要（非完整報價單）；與估價成本表無自動連動。'
    : laborKind === 'pricing'
      ? '本文件為承攬工作內容供述明細（非報價單）；計價工數係內部試算（含風險係數後，與「總結」之計價工數加總語意一致）。'
      : '本文件為承攬工作內容供述明細（非報價單）；基礎工數係內部試算（與「總結」之基礎總工數加總語意一致）。'
  const emptyTableHint = isCustom
    ? '（尚無自填列；請按「新增一列」）'
    : laborKind === 'pricing'
      ? '（無計價工數大於 0 之細項）'
      : '（無基礎工數大於 0 之細項）'
  const termsLaborLineFromQuote =
    laborKind === 'pricing'
      ? '計價工數係依估價表邏輯試算（含風險係數後），與「總結」之計價工數加總一致。'
      : '基礎工數係依估價表邏輯試算（E 欄概念），與「總結」之基礎總工數加總一致。'

  const clauseLinesPdf = isCustom
    ? props.clauseLines.map((c) => c.text.trim()).filter((t) => t !== '')
    : []

  let itemNo = 0
  const bodyRows = isCustom
    ? customLines.map((ln) => {
        itemNo += 1
        const no = itemNo
        return (
          <tr key={ln.id}>
            <td style={{ border: '1px solid #d4b896', padding: '5px 4px', textAlign: 'center' }}>{no}</td>
            <td style={{ border: '1px solid #d4b896', padding: '5px 6px' }}>{ln.item}</td>
            <td style={{ border: '1px solid #d4b896', padding: '5px 6px', fontSize: 10 }}>{ln.category}</td>
            <td style={{ border: '1px solid #d4b896', padding: '5px 6px', textAlign: 'right' }}>
              {formatPdfQuantity(ln.quantity)}
            </td>
            <td style={{ border: '1px solid #d4b896', padding: '5px 6px', fontSize: 10, textAlign: 'center' }}>
              {ln.unit}
            </td>
            <td style={{ border: '1px solid #d4b896', padding: '5px 6px', fontSize: 9.5 }}>{ln.remarks}</td>
          </tr>
        )
      })
    : sections.flatMap((sec) =>
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
                {ln.laborDays.toFixed(2)}
              </td>
              <td style={{ border: '1px solid #d4b896', padding: '5px 6px', textAlign: 'right' }}>
                {ln.ping.toFixed(4)}
              </td>
            </tr>
          )
        }),
      )

  const tableNonEmpty = isCustom ? customLines.length > 0 : sections.length > 0

  return (
    <div
      className="ownerScopePdfRoot"
      style={{
        width: '190mm',
        maxWidth: '100%',
        margin: '0 auto',
        padding: '10mm 12mm 12mm',
        boxSizing: 'border-box',
        fontFamily: '"Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif',
        fontSize: 11,
        lineHeight: 1.45,
        color: '#1a1a1a',
        background: '#fff',
      }}
    >
      <div data-pdf-workspace="head">
      <div style={{ ...orangeBar, padding: '10px 12px', textAlign: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.12em' }}>{OWNER_SCOPE_DOC_TITLE}</div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'stretch' }}>
        <div
          style={{
            width: 88,
            minHeight: 88,
            flexShrink: 0,
            ...boxBorder,
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 4,
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
        >
          <img
            src={OWNER_SCOPE_COMPANY_STAMP_SRC}
            alt={`${COMPANY_CONTRACTOR.name} 公司標章`}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        </div>
        <div style={{ flex: 1, ...boxBorder, padding: '8px 10px', fontSize: 10.5 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ padding: '2px 6px 2px 0', width: '28%', color: '#444' }}>案名</td>
                <td style={{ padding: '2px 0', fontWeight: 600 }}>{caseNameDisplay}</td>
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
                  {laborFootnote}
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
              {COMPANY_CONTRACTOR.name}
            </div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#555' }}>聯絡地址：</span>
              {COMPANY_CONTRACTOR.address}
            </div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#555' }}>電話／Email：</span>
              {COMPANY_CONTRACTOR.phone}
            </div>
            <div>
              <span style={{ color: '#555' }}>統一編號：</span>
              {COMPANY_CONTRACTOR.taxId}
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
              {ownerFieldDisplay(oc.companyName)}
            </div>
            {oc.address.trim() !== '' ? (
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: '#555' }}>聯絡地址：</span>
                {oc.address.trim()}
              </div>
            ) : null}
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#555' }}>聯絡人：</span>
              {ownerFieldDisplay(oc.contactName)}
            </div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#555' }}>電話／Email：</span>
              {ownerFieldDisplay(oc.phoneEmail)}
            </div>
            <div>
              <span style={{ color: '#555' }}>統一編號：</span>
              {ownerFieldDisplay(oc.taxId)}
            </div>
          </div>
        </div>
      </div>
      </div>

      <table
        data-pdf-workspace="lines"
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 10.5,
          border: '1px solid #c9a227',
        }}
      >
        <thead>
          {isCustom ? (
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
                  width: '22%',
                  fontWeight: 700,
                }}
              >
                品名
              </th>
              <th
                style={{
                  border: '1px solid #c9a227',
                  padding: '6px 4px',
                  width: '16%',
                  fontWeight: 700,
                }}
              >
                類別
              </th>
              <th
                style={{
                  border: '1px solid #c9a227',
                  padding: '6px 4px',
                  width: '12%',
                  fontWeight: 700,
                  textAlign: 'right',
                }}
              >
                數量
              </th>
              <th
                style={{
                  border: '1px solid #c9a227',
                  padding: '6px 4px',
                  width: '10%',
                  fontWeight: 700,
                  textAlign: 'center',
                }}
              >
                單位
              </th>
              <th
                style={{
                  border: '1px solid #c9a227',
                  padding: '6px 6px',
                  width: '32%',
                  fontWeight: 700,
                }}
              >
                備註
              </th>
            </tr>
          ) : (
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
                {laborColLabel}
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
          )}
        </thead>
        <tbody>
          {!tableNonEmpty ? (
            <tr>
              <td
                colSpan={isCustom ? 6 : 5}
                style={{ border: '1px solid #c9a227', padding: 12, textAlign: 'center' }}
              >
                {emptyTableHint}
              </td>
            </tr>
          ) : (
            bodyRows
          )}
        </tbody>
        {tableNonEmpty ? (
          <tfoot>
            {isCustom ? (
              <tr style={{ background: '#fff5e4' }}>
                <td
                  colSpan={3}
                  style={{
                    border: '1px solid #c9a227',
                    padding: '6px 8px',
                    fontWeight: 700,
                    textAlign: 'right',
                  }}
                >
                  合計（數量）
                </td>
                <td
                  style={{
                    border: '1px solid #c9a227',
                    padding: '6px 6px',
                    textAlign: 'right',
                    fontWeight: 700,
                  }}
                >
                  {formatPdfQuantity(totalLabor)}
                </td>
                <td
                  style={{
                    border: '1px solid #c9a227',
                    padding: '6px 6px',
                    textAlign: 'center',
                    color: '#666',
                  }}
                >
                  —
                </td>
                <td
                  style={{
                    border: '1px solid #c9a227',
                    padding: '6px 6px',
                    textAlign: 'center',
                    color: '#666',
                  }}
                >
                  —
                </td>
              </tr>
            ) : (
              <tr style={{ background: '#fff5e4' }}>
                <td
                  colSpan={3}
                  style={{
                    border: '1px solid #c9a227',
                    padding: '6px 8px',
                    fontWeight: 700,
                    textAlign: 'right',
                  }}
                >
                  合計（{laborColLabel}）
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
                <td
                  style={{
                    border: '1px solid #c9a227',
                    padding: '6px 6px',
                    textAlign: 'center',
                    color: '#666',
                  }}
                >
                  —
                </td>
              </tr>
            )}
          </tfoot>
        ) : null}
      </table>

      <div style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div data-pdf-workspace="clauses" style={{ flex: 1.1, ...boxBorder, padding: '8px 10px', fontSize: 9.5 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>備註與條款</div>
          {isCustom ? (
            <ol style={{ margin: 0, paddingLeft: 18, color: '#333' }}>
              {clauseLinesPdf.length > 0 ? (
                clauseLinesPdf.map((text, i) => (
                  <li key={`cl-${i}`} style={{ marginBottom: 4 }}>
                    {text}
                  </li>
                ))
              ) : (
                <li style={{ marginBottom: 4, color: '#888' }}>（無條款文字）</li>
              )}
            </ol>
          ) : (
            <ol style={{ margin: 0, paddingLeft: 18, color: '#333' }}>
              <li style={{ marginBottom: 4 }}>
                本明細僅供述工作內容與工數、坪數資訊，不作為契約價金之唯一依據。
              </li>
              <li style={{ marginBottom: 4 }}>實際施作範圍以雙方書面約定或現場簽認為準。</li>
              <li style={{ marginBottom: 4 }}>
                <>
                  坪數為面積表㎡換算；{termsLaborLineFromQuote}
                </>
              </li>
            </ol>
          )}
        </div>
        <div data-pdf-workspace="sign" style={{ flex: 1, ...boxBorder, padding: '8px 10px', fontSize: 9.5 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>確認簽章</div>
          <div style={{ marginTop: 28, borderTop: '1px dashed #999', paddingTop: 6 }}>
            <span style={{ color: '#555' }}>承攬方簽章：</span>
          </div>
          <div style={{ marginTop: 20, borderTop: '1px dashed #999', paddingTop: 6 }}>
            <span style={{ color: '#555' }}>{isCustom ? '客戶簽章：' : '業主簽章：'}</span>
          </div>
          <div style={{ marginTop: 16, borderTop: '1px dashed #999', paddingTop: 6 }}>
            <span style={{ color: '#555' }}>簽章日期：</span>
          </div>
        </div>
      </div>
    </div>
  )
}
