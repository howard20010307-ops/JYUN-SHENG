import type { CSSProperties, ReactNode } from 'react'
import { COMPANY_CONTRACTOR } from '../domain/companyContact'
import {
  CONTRACT_FIXED_PRICE_CLAUSE,
  contractFloorPriceTotals,
  formatContractMoney,
  contractFloorLineSubtotalNet,
  type ContractParty,
  type ContractWorkspaceState,
} from '../domain/contractWorkspace'

const PARTY_B_COMPANY_STAMP_SRC = `${import.meta.env.BASE_URL}debt-confirmation-company-stamp.png`
const PARTY_B_PERSONAL_STAMP_SRC = `${import.meta.env.BASE_URL}debt-confirmation-personal-stamp.png`

type Props = {
  data: ContractWorkspaceState
}

const rootStyle: CSSProperties = {
  width: '210mm',
  boxSizing: 'border-box',
  padding: '14mm 16mm',
  background: '#fff',
  color: '#111',
  fontFamily: '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif',
  fontSize: 11,
  lineHeight: 1.75,
}

function Block({ children }: { children: ReactNode }) {
  return (
    <div data-pdf-block="1" style={{ breakInside: 'avoid' }}>
      {children}
    </div>
  )
}

function U({ children, w = 100 }: { children?: ReactNode; w?: number }) {
  const t = (children ?? '').toString().trim()
  return (
    <span
      style={{
        display: 'inline-block',
        borderBottom: '1px solid #333',
        minWidth: w,
        padding: '0 3px 2px',
        verticalAlign: 'baseline',
        lineHeight: 1.4,
      }}
    >
      {t || '\u00a0'}
    </span>
  )
}

function H2({ children }: { children: ReactNode }) {
  return <h2 style={{ fontSize: 12.5, margin: '12px 0 6px', fontWeight: 700 }}>{children}</h2>
}

function Roc3({ y, m, d }: { y: string; m: string; d: string }) {
  return (
    <span style={{ display: 'inline-block', lineHeight: 2 }}>
      民國<U w={36}>{y}</U>年<U w={28}>{m}</U>月<U w={28}>{d}</U>日
    </span>
  )
}

function PartySignBlock({ title, party }: { title: string; party: ContractParty }) {
  return (
    <Block>
      <p style={{ margin: '0 0 8px', fontWeight: 700 }}>{title}</p>
      <p style={{ margin: '2px 0' }}>
        公司名稱：<U w={220}>{party.companyName}</U>
      </p>
      <p style={{ margin: '2px 0' }}>
        統一編號：<U w={120}>{party.taxId}</U>
      </p>
      <p style={{ margin: '2px 0' }}>
        負責人：<U w={120}>{party.responsiblePerson}</U>
      </p>
      <p style={{ margin: '2px 0' }}>
        地址：<U w={280}>{party.address}</U>
      </p>
      <p style={{ margin: '2px 0' }}>
        聯絡人：<U w={120}>{party.contactName}</U>
      </p>
      <p style={{ margin: '2px 0' }}>
        連絡電話：<U w={140}>{party.phone}</U>
      </p>
      <p style={{ margin: '12px 0 4px' }}>簽名或蓋章：</p>
      <div style={{ height: 56, borderBottom: '1px solid #ccc', marginBottom: 8 }} />
    </Block>
  )
}

function FloorPriceTable({ data }: { data: ContractWorkspaceState }) {
  const unit = data.unitPricePerPing
  const { totalPing, totalNet } = contractFloorPriceTotals(data.floorPriceLines, unit)
  if (data.floorPriceLines.length === 0) return null

  return (
    <Block>
      <p style={{ margin: '10px 0 6px', fontWeight: 700, fontSize: 12 }}>附件：各樓層坪數及價格明細表</p>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 10.5,
          marginBottom: 8,
        }}
      >
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            {['棟', '樓層', '坪數', '單價（元／坪）', '小計（未稅）'].map((h) => (
              <th
                key={h}
                style={{
                  border: '1px solid #333',
                  padding: '4px 6px',
                  fontWeight: 700,
                  textAlign: h === '棟' || h === '樓層' ? 'left' : 'right',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.floorPriceLines.map((line) => (
            <tr key={line.id}>
              <td style={{ border: '1px solid #333', padding: '4px 6px' }}>{line.buildingLabel || '—'}</td>
              <td style={{ border: '1px solid #333', padding: '4px 6px' }}>{line.floorLabel}</td>
              <td style={{ border: '1px solid #333', padding: '4px 6px', textAlign: 'right' }}>
                {line.ping.toFixed(2)}
              </td>
              <td style={{ border: '1px solid #333', padding: '4px 6px', textAlign: 'right' }}>
                {formatContractMoney(unit)}
              </td>
              <td style={{ border: '1px solid #333', padding: '4px 6px', textAlign: 'right' }}>
                {formatContractMoney(contractFloorLineSubtotalNet(line, unit))}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700 }}>
            <td colSpan={2} style={{ border: '1px solid #333', padding: '4px 6px', textAlign: 'right' }}>
              合計
            </td>
            <td style={{ border: '1px solid #333', padding: '4px 6px', textAlign: 'right' }}>
              {totalPing.toFixed(2)}
            </td>
            <td style={{ border: '1px solid #333', padding: '4px 6px' }} />
            <td style={{ border: '1px solid #333', padding: '4px 6px', textAlign: 'right' }}>
              {formatContractMoney(totalNet)}
            </td>
          </tr>
        </tfoot>
      </table>
      <p style={{ margin: '4px 0', fontSize: 10.5 }}>
        契約總價（未稅）新台幣 <strong>{formatContractMoney(totalNet)}</strong> 元整，詳如上表。
      </p>
    </Block>
  )
}

export function ContractPdfSheet({ data }: Props) {
  const partyAName = data.partyA.companyName.trim() || '（甲方）'
  const partyBName = data.partyB.companyName.trim() || COMPANY_CONTRACTOR.name
  const scopeLines = (data.workScope || '').split(/\r?\n/).filter((x) => x.trim() !== '')
  const penalty = data.penaltyPerDay.trim()

  return (
    <div className="contractPdfRoot" style={rootStyle}>
      <Block>
        <div style={{ minHeight: '240mm', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <p
            style={{
              textAlign: 'center',
              margin: '0 0 24px',
              fontSize: 22,
              fontWeight: 700,
              color: '#1a4a8a',
              letterSpacing: 2,
            }}
          >
            {partyAName}
            <br />
            合約書
          </p>
          <div style={{ fontSize: 13, lineHeight: 2.2, maxWidth: 360, margin: '0 auto' }}>
            <p style={{ margin: '8px 0' }}>
              承攬地點：<U w={220}>{data.coverWorkLocation || data.siteLocation}</U>
            </p>
            <p style={{ margin: '8px 0' }}>
              承攬項目：<U w={220}>{data.coverWorkItem}</U>
            </p>
            <p style={{ margin: '8px 0' }}>
              承攬廠商：<U w={220}>{partyBName}</U>
            </p>
            <p style={{ margin: '8px 0' }}>
              承攬人電話：<U w={160}>{data.coverContractorPhone}</U>
            </p>
            <p style={{ margin: '8px 0' }}>
              合約編號：<U w={160}>{data.contractNumber}</U>
            </p>
          </div>
          <p style={{ textAlign: 'right', marginTop: 48, color: '#c00', fontSize: 11 }}>代工正本</p>
        </div>
      </Block>

      <Block>
        <h1 style={{ textAlign: 'center', margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>工程合約書</h1>
        <p style={{ margin: '0 0 10px' }}>
          立合約書人　甲方：<U w={180}>{partyAName}</U>　乙方：<U w={180}>{partyBName}</U>
        </p>
        <p style={{ margin: '0 0 12px' }}>
          茲因乙方同意承攬甲方之放樣工程勞務，雙方本誠實信用原則，訂定本合約條款如下：
        </p>
      </Block>

      <Block>
        <H2>第一條　工程案名</H2>
        <p style={{ margin: '4px 0' }}>
          <U w={320}>{data.projectName}</U>
        </p>
      </Block>

      <Block>
        <H2>第二條　工地地點</H2>
        <p style={{ margin: '4px 0' }}>
          <U w={320}>{data.siteLocation}</U>
        </p>
      </Block>

      <Block>
        <H2>第三條　工程範圍</H2>
        {scopeLines.length > 0 ? (
          scopeLines.map((line, i) => (
            <p key={i} style={{ margin: '4px 0', textIndent: '2em' }}>
              {line}
            </p>
          ))
        ) : (
          <p style={{ margin: '4px 0' }}>
            <U w={320} />
          </p>
        )}
      </Block>

      <Block>
        <H2>第四條　施作單價</H2>
        <p style={{ margin: '4px 0' }}>
          本工程施作單價為新台幣 <strong>{formatContractMoney(data.unitPricePerPing)}</strong> 元／坪（未稅）。
        </p>
        <p style={{ margin: '8px 0', color: '#c00', fontSize: 10.5 }}>{CONTRACT_FIXED_PRICE_CLAUSE}</p>
        <FloorPriceTable data={data} />
      </Block>

      <Block>
        <H2>第五條　付款辦法</H2>
        <p style={{ margin: '4px 0' }}>
          每月 <U w={48}>{data.paymentAssessDays}</U> 日，依各樓層澆置完成進度辦理估驗；甲方應於每月{' '}
          <U w={48}>{data.paymentPayDays}</U> 日以現金或匯款方式支付乙方。
        </p>
      </Block>

      <Block>
        <H2>第六條　工程期限</H2>
        <p style={{ margin: '4px 0' }}>
          乙方應配合工地進度完成各樓層放樣作業。未經甲方事前同意而逾期者，甲方得依工程進度扣減相關費用。
        </p>
      </Block>

      <Block>
        <H2>第七條　責任歸屬</H2>
        <p style={{ margin: '4px 0' }}>
          乙方放樣基準線誤差應在 <U w={28}>{data.toleranceMm}</U> mm 以內。檢驗發現誤差點達{' '}
          <U w={28}>{data.tolerancePointCount}</U> 點以上者，乙方應派員修整至合格。
        </p>
      </Block>

      <Block>
        <H2>第八條　特殊情況</H2>
        <ol style={{ margin: '4px 0 0 1.4em', padding: 0 }}>
          <li>雨天施工時，乙方應確保基準線完成；甲方得提供一至二人協助。</li>
          <li>
            乙方無法完成本工程或品質不符約定者，應於 <U w={28}>{data.terminationNoticeMonths}</U>{' '}
            個月前通知甲方協商處理。
          </li>
        </ol>
      </Block>

      <Block>
        <H2>第九條　罰則</H2>
        <p style={{ margin: '4px 0' }}>
          乙方未能配合工程進度或逾期完工者，甲方得按每日 <U w={60}>{penalty}</U>{' '}
          元向乙方請求違約金，並依工程進度表規定累計扣款。
        </p>
        <p style={{ margin: '8px 0 4px' }}>甲方得逕行解除契約並沒收剩餘工程款或保留款，另委託第三人完成之情形：</p>
        <ol style={{ margin: '0 0 0 1.4em', padding: 0 }}>
          <li>未經同意擅自停工逾三日者。</li>
          <li>不配合工程進度致延誤達三次以上者。</li>
          <li>不聽從甲方工地人員指示，致發生爭執或恐嚇行為者。</li>
          <li>偷工減料、施工品質低劣或竊取材料者。</li>
          <li>乙方負責人避不聯絡或行蹤不明者。</li>
          <li>乙方負責人受破產宣告或受刑罰致無法履約者。</li>
          <li>未依約提供必要證明文件者。</li>
        </ol>
      </Block>

      <Block>
        <H2>第十條　工程圖說</H2>
        <ol style={{ margin: '4px 0 0 1.4em', padding: 0 }}>
          <li>乙方對圖面疑義應於施工前向工地管理單位釐清；擅自施工致損失者由乙方負責。</li>
          <li>設計變更時，數量與價格依原約定單價調整，乙方應配合追趕進度。</li>
        </ol>
      </Block>

      <Block>
        <H2>第十一條　工程監督及管理</H2>
        <ol style={{ margin: '4px 0 0 1.4em', padding: 0 }}>
          <li>乙方應配合其他工種進度；甲方得終止契約並另委他人完成。</li>
          <li>因乙方管理不當、疏忽或事故所致傷亡及法律責任，由乙方全權負責。</li>
          <li>甲方得要求更換不適任人員；施工不符者乙方應拆除重做，費用自負。</li>
          <li>甲方工地人員僅負協調之責；實際執行、管理、監督由乙方負責。</li>
          <li>乙方應遵守職業安全衛生法及相關法規，並依法辦理勞工保險。</li>
          <li>乙方應負工人管理、疾病傷亡及勞安爭議之全責，甲方不負連帶責任。</li>
          <li style={{ color: '#c00' }}>
            嚴禁雇用非法外勞（含大陸籍）、六十五歲以上及十八歲以下人員；違反所致罰款及損害由乙方負責。
          </li>
          <li>乙方人員進場應全程佩戴安全帽；高空作業應使用安全帶。</li>
          <li style={{ color: '#c00' }}>
            勞安或環保相關罰款，不論開立名義，均由乙方負擔。
          </li>
        </ol>
      </Block>

      <Block>
        <H2>第十二條　嚴禁</H2>
        <p style={{ margin: '4px 0', color: '#c00' }}>
          工地內嚴禁鬥毆、飲酒、賭博；違反所致罰款及法律責任由乙方負擔。
        </p>
      </Block>

      <Block>
        <H2>第十三條　附註說明</H2>
        <p style={{ margin: '4px 0' }}>本合約書一式二份，甲乙雙方各執一份為憑，自簽訂日起生效。</p>
      </Block>

      <Block>
        <p style={{ margin: '16px 0 8px', fontWeight: 700 }}>立合約書人</p>
      </Block>

      <PartySignBlock title="甲方" party={data.partyA} />
      <p style={{ margin: '0 0 12px' }}>
        簽署日期：<Roc3 y={data.partyASignRocYear} m={data.partyASignRocMonth} d={data.partyASignRocDay} />
      </p>

      <Block>
        <p style={{ margin: '0 0 8px', fontWeight: 700 }}>乙方</p>
        <p style={{ margin: '2px 0' }}>
          公司名稱：<U w={220}>{data.partyB.companyName}</U>
        </p>
        <p style={{ margin: '2px 0' }}>
          統一編號：<U w={120}>{data.partyB.taxId}</U>
        </p>
        <p style={{ margin: '2px 0' }}>
          負責人：<U w={120}>{data.partyB.responsiblePerson}</U>
        </p>
        <p style={{ margin: '2px 0' }}>
          地址：<U w={280}>{data.partyB.address}</U>
        </p>
        <p style={{ margin: '2px 0' }}>
          聯絡人：<U w={120}>{data.partyB.contactName}</U>
        </p>
        <p style={{ margin: '2px 0' }}>
          連絡電話：<U w={140}>{data.partyB.phone}</U>
        </p>
        <p style={{ margin: '12px 0 4px' }}>簽名或蓋章：</p>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, minHeight: 76, marginBottom: 8 }}>
          <img
            src={PARTY_B_COMPANY_STAMP_SRC}
            alt={`${COMPANY_CONTRACTOR.name} 公司章`}
            style={{ height: 72, width: 'auto', objectFit: 'contain' }}
          />
          <img
            src={PARTY_B_PERSONAL_STAMP_SRC}
            alt={`${COMPANY_CONTRACTOR.responsiblePerson} 負責人章`}
            style={{ height: 56, width: 'auto', objectFit: 'contain' }}
          />
        </div>
        <p style={{ margin: '10px 0 0' }}>
          簽署日期：<Roc3 y={data.partyBSignRocYear} m={data.partyBSignRocMonth} d={data.partyBSignRocDay} />
        </p>
      </Block>
    </div>
  )
}
