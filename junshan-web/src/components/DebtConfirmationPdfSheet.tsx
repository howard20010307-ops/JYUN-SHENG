import type { CSSProperties, ReactNode } from 'react'
import { COMPANY_CONTRACTOR } from '../domain/companyContact'
import type { DebtConfirmationWorkspaceState } from '../domain/debtConfirmationWorkspace'

/** `public/debt-confirmation-company-logo.png`：PDF 抬頭公司 logo */
const COMPANY_LOGO_SRC = `${import.meta.env.BASE_URL}debt-confirmation-company-logo.png`
/** `public/debt-confirmation-*-stamp.png`：乙方簽章區（見 scripts/debt-confirmation-stamp-process.py） */
const PARTY_B_COMPANY_STAMP_SRC = `${import.meta.env.BASE_URL}debt-confirmation-company-stamp.png`
const PARTY_B_PERSONAL_STAMP_SRC = `${import.meta.env.BASE_URL}debt-confirmation-personal-stamp.png`

type Props = {
  data: DebtConfirmationWorkspaceState
}

/** 全文共用字級／行距；分頁時整份以同一比例縮放，確保各頁字一樣大 */
const rootStyle: CSSProperties = {
  width: '210mm',
  boxSizing: 'border-box',
  padding: '14mm 16mm',
  background: '#fff',
  color: '#111',
  fontFamily: '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif',
  fontSize: 11,
  lineHeight: 1.8,
}

/** 分頁單位：放不下時整塊跳下一頁（不從中間切斷） */
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

function Cb({ on }: { on: boolean }) {
  return <span>{on ? '☑' : '□'}</span>
}

function Roc3({ y, m, d }: { y: string; m: string; d: string }) {
  return (
    <span style={{ display: 'inline-block', lineHeight: 2 }}>
      民國<U w={36}>{y}</U>年<U w={28}>{m}</U>月<U w={28}>{d}</U>日
    </span>
  )
}

function PartyBlock({
  title,
  party,
}: {
  title: string
  party: DebtConfirmationWorkspaceState['partyA']
}) {
  return (
    <Block>
      <div style={{ marginBottom: 10 }}>
        <p style={{ margin: '0 0 6px', fontWeight: 700 }}>{title}</p>
        <p style={{ margin: '2px 0' }}>公司名稱：<U w={220}>{party.companyName}</U></p>
        <p style={{ margin: '2px 0' }}>統一編號：<U w={120}>{party.taxId}</U></p>
        <p style={{ margin: '2px 0' }}>負責人：<U w={120}>{party.responsiblePerson}</U></p>
        <p style={{ margin: '2px 0' }}>聯絡電話：<U w={140}>{party.phone}</U></p>
        <p style={{ margin: '2px 0' }}>地址：<U w={280}>{party.address}</U></p>
      </div>
    </Block>
  )
}

function H2({ children }: { children: ReactNode }) {
  return <h2 style={{ fontSize: 12.5, margin: '0 0 6px', fontWeight: 700 }}>{children}</h2>
}

export function DebtConfirmationPdfSheet({ data }: Props) {
  const workLines = (data.workContent || '').split(/\r?\n/).filter((x) => x.trim() !== '')
  while (workLines.length < 3) workLines.push('')

  return (
    <div className="debtConfirmationPdfRoot" style={rootStyle}>
      <Block>
        <div style={{ position: 'relative', marginBottom: 0 }}>
          <p style={{ textAlign: 'center', margin: '0 0 4px', fontSize: 13, fontWeight: 700 }}>鈞泩放樣工程</p>
          <h1 style={{ textAlign: 'center', margin: '0 0 12px', fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>
            工程款延期付款暨債務確認書
          </h1>
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 88,
              height: 88,
              borderRadius: 2,
              overflow: 'hidden',
              background: '#0a0a0a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src={COMPANY_LOGO_SRC}
              alt={`${COMPANY_CONTRACTOR.name} logo`}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
        </div>
        <p style={{ margin: '0 0 8px' }}>立確認書人：</p>
      </Block>

      <PartyBlock title="甲方（委託方／欠款方）" party={data.partyA} />
      <PartyBlock title="乙方（承攬方／收款方）" party={data.partyB} />

      <Block>
        <H2>第一條　工程基本資料</H2>
        <p style={{ margin: '4px 0' }}>工程名稱：<U w={300}>{data.projectName}</U></p>
        <p style={{ margin: '4px 0' }}>施工地點：<U w={300}>{data.siteLocation}</U></p>
        <p style={{ margin: '4px 0 0' }}>工作內容：</p>
        {workLines.slice(0, 3).map((line, i) => (
          <p key={i} style={{ margin: '2px 0' }}>
            <U w={340}>{line}</U>
          </p>
        ))}
        <p style={{ margin: '8px 0 4px' }}>相關文件編號：</p>
        <p style={{ margin: '2px 0' }}>
          <Cb on={data.refEstimateChecked} /> 估價單編號：<U w={160}>{data.refEstimateNo}</U>
        </p>
        <p style={{ margin: '2px 0' }}>
          <Cb on={data.refQuotationChecked} /> 報價單編號：<U w={160}>{data.refQuotationNo}</U>
        </p>
        <p style={{ margin: '2px 0' }}>
          <Cb on={data.refDispatchChecked} /> 派工單編號：<U w={160}>{data.refDispatchNo}</U>
        </p>
        <p style={{ margin: '2px 0' }}>
          <Cb on={data.refBillingChecked} /> 請款單編號：<U w={160}>{data.refBillingNo}</U>
        </p>
        <p style={{ margin: '2px 0' }}>
          <Cb on={data.refOtherChecked} /> 其他：<U w={200}>{data.refOther}</U>
        </p>
      </Block>

      <Block>
        <H2>第二條　債務確認</H2>
        <p style={{ margin: '4px 0' }}>
          截至
          <Roc3 y={data.debtConfirmRocYear} m={data.debtConfirmRocMonth} d={data.debtConfirmRocDay} />
          止，甲方尚積欠乙方工程款如下：
        </p>
        <p style={{ margin: '8px 0' }}>工程款金額（大寫）：新臺幣<U w={220}>{data.debtAmountUpper}</U>元整</p>
        <p style={{ margin: '8px 0' }}>工程款金額（小寫）：NT$<U w={140}>{data.debtAmountLower}</U></p>
        <p style={{ margin: '8px 0 4px' }}>甲方確認：</p>
        <ol style={{ margin: '0 0 0 1.4em', padding: 0 }}>
          <li>前述債務真實存在。</li>
          <li>欠款金額計算無誤。</li>
          <li>乙方截至本確認書簽署日前已完成之工作內容均已確認。</li>
          <li>甲方對本確認書所載工程款金額及工作內容均無異議。</li>
          <li>本確認書所載債務為確定存在之債務。</li>
          <li>甲方不得以業主未付款、上游廠商未撥款、資金調度困難、驗收程序、第三人爭議或其他事由拒絕付款。</li>
          <li>本確認書所載欠款，以本確認書附件所列文件之金額合計為準。</li>
        </ol>
      </Block>

      <Block>
        <H2>第三條　延期付款約定</H2>
        <p style={{ margin: '4px 0 8px' }}>甲方因資金調度需求，向乙方申請延期付款。經雙方協議後，甲方承諾應於：</p>
        <p style={{ margin: '0 0 8px' }}>
          <Roc3 y={data.paymentDueRocYear} m={data.paymentDueRocMonth} d={data.paymentDueRocDay} />
        </p>
        <p style={{ margin: '0 0 10px' }}>
          <Cb on={data.paymentAmPm === 'am'} /> 上午　<Cb on={data.paymentAmPm === 'pm'} /> 下午　<U w={28}>{data.paymentHour}</U> 時　<U w={28}>{data.paymentMinute}</U> 分前一次付清全部欠款。
        </p>
        <p style={{ margin: '8px 0 4px' }}>付款方式：</p>
        <p style={{ margin: '2px 0' }}>
          <Cb on={data.payCash} /> 現金　<Cb on={data.payTransfer} /> 匯款　<Cb on={data.payCheck} /> 支票　<Cb on={data.payOther} /> 其他：
          <U w={100}>{data.payOtherText}</U>
        </p>
        <p style={{ margin: '8px 0 4px' }}>指定收款帳戶：</p>
        <p style={{ margin: '2px 0' }}>銀行：<U w={160}>{data.bankName}</U></p>
        <p style={{ margin: '2px 0' }}>戶名：<U w={160}>{data.accountName}</U></p>
        <p style={{ margin: '2px 0' }}>帳號：<U w={200}>{data.accountNumber}</U></p>
      </Block>

      <Block>
        <p style={{ margin: '0 0 4px', fontWeight: 600 }}>如採支票付款：</p>
        <ol style={{ margin: '0 0 0 1.4em', padding: 0 }}>
          <li>應以見票後十日內得兌現之支票為限。</li>
          <li>支票應實際兌現完成後始視為清償。</li>
          <li>支票如有退票、拒絕往來、存款不足或其他無法兌現情形，甲方應於三日內改以現金或匯款方式清償。</li>
          <li>支票退票達二次以上者，乙方得拒絕接受支票付款。</li>
        </ol>
        <p style={{ margin: '8px 0' }}>匯款手續費由甲方負擔。</p>
        <p style={{ margin: '4px 0' }}>
          <Cb on={data.amountTaxMode === 'incl'} /> 本工程款為含稅金額　<Cb on={data.amountTaxMode === 'excl'} /> 本工程款為未稅金額
        </p>
      </Block>

      <Block>
        <H2>第四條　逾期付款責任</H2>
        <p style={{ margin: '4px 0' }}>甲方未依第三條約定期限付款者，自到期日次日起：</p>
        <ol style={{ margin: '0 0 0 1.4em', padding: 0 }}>
          <li>按未付款金額年利率百分之十（10％）計算遲延利息至實際清償日止。</li>
          <li>另應給付未付款金額百分之五（5％）之違約金。</li>
          <li>因催收、存證信函、調解、訴訟、強制執行或其他追償程序所生之必要費用，甲方應依法負擔。</li>
        </ol>
      </Block>

      <Block>
        <H2>第五條　後續作業暫停權</H2>
        <p style={{ margin: '4px 0' }}>
          甲方有逾期付款情事時，乙方得以 LINE、簡訊、電子郵件或書面通知方式通知甲方後，暫停後續服務。甲方於通知後仍未完成付款者，乙方得停止後續放樣作業、圖面檢討、BIM
          模型建置、座標計算、技術服務、現場排程及其他相關工作。因甲方付款遲延所衍生之工期調整、施工延誤或相關損失，概由甲方自行負責。
        </p>
      </Block>

      <Block>
        <H2>第六條　成果確認</H2>
        <p style={{ margin: '4px 0' }}>
          甲方確認乙方截至本確認書簽署日前所完成之工作內容均已確認。本確認書所載欠款係就乙方已完成工作所產生之應付款項。除乙方故意或重大過失所致之損害外，甲方不得以驗收、品質、施工進度、第三人意見或其他事由拒絕給付本確認書所載欠款。
        </p>
      </Block>

      <Block>
        <H2>第七條　技術成果與智慧財產權</H2>
        <p style={{ margin: '4px 0' }}>
          乙方因本案所製作之放樣成果、座標資料、CAD 圖檔、圖面檢討成果、BIM 模型、3D 模型、自動化程式、Excel
          計算表及其他技術文件，其智慧財產權及相關技術權利均歸乙方所有。甲方於本案工程款全數結清後，取得該成果於本工程範圍內之使用權。未經乙方書面同意，甲方不得將相關成果轉交第三人、轉售、重製、改作或使用於其他工程。
        </p>
      </Block>

      <Block>
        <H2>第八條　違約追償</H2>
        <p style={{ margin: '4px 0' }}>甲方未依約履行付款義務者，即構成違約。乙方得依法採取：</p>
        <p style={{ margin: '4px 0' }}>
          <Cb on={data.recoveryPaymentOrder} /> 支付命令　<Cb on={data.recoveryMediation} /> 民事調解　<Cb on={data.recoveryLawsuit} /> 民事訴訟
        </p>
        <p style={{ margin: '4px 0' }}>
          <Cb on={data.recoveryProvisionalSeizure} /> 假扣押　<Cb on={data.recoveryEnforcement} /> 強制執行　<Cb on={data.recoveryPromissoryNote} /> 本票裁定（如另有簽發本票）
        </p>
        <p style={{ margin: '4px 0' }}>
          <Cb on={data.recoveryOther} /> 其他合法追償程序：<U w={140}>{data.recoveryOtherText}</U>
        </p>
        <p style={{ margin: '4px 0' }}>本確認書得作為債權存在及欠款金額之證明文件。</p>
      </Block>

      <Block>
        <H2>第九條　管轄法院</H2>
        <p style={{ margin: '4px 0' }}>因本確認書所生之一切爭議，雙方同意以臺灣高雄地方法院為第一審管轄法院。</p>
      </Block>

      <Block>
        <H2>第十條　附件資料</H2>
        <p style={{ margin: '2px 0' }}>
          <Cb on={data.attachEstimate} /> 估價單　<Cb on={data.attachQuotation} /> 報價單　<Cb on={data.attachBilling} /> 請款單　<Cb on={data.attachDispatchSign} /> 派工簽認單
        </p>
        <p style={{ margin: '2px 0' }}>
          <Cb on={data.attachPhotos} /> 工程照片　<Cb on={data.attachLine} /> LINE 對話紀錄　<Cb on={data.attachEmail} /> 電子郵件紀錄　<Cb on={data.attachTransferRecord} /> 匯款紀錄
        </p>
        <p style={{ margin: '2px 0' }}>
          <Cb on={data.attachOther} /> 其他：<U w={200}>{data.attachOtherText}</U>
        </p>
        {data.attachmentFiles.length > 0 ? (
          <>
            <p style={{ margin: '8px 0 4px', fontWeight: 600 }}>上傳附件（接於本 PDF 最後）：</p>
            {data.attachmentFiles.map((f) => (
              <p key={f.id} style={{ margin: '2px 0' }}>
                ．<U w={300}>{f.fileName}</U>
              </p>
            ))}
          </>
        ) : null}
      </Block>

      <Block>
        <H2>第十一條　連帶保證人條款</H2>
        <p style={{ margin: '4px 0' }}>連帶保證人：<U w={140}>{data.guarantorName}</U>（本人親筆填寫）</p>
        <p style={{ margin: '4px 0' }}>同意以個人身分擔任本確認書之連帶保證人，並就本確認書所載全部債務與甲方負連帶清償責任。</p>
        <p style={{ margin: '4px 0' }}>連帶保證人同意拋棄保證人依法所得主張之先訴抗辯權。</p>
        <p style={{ margin: '4px 0' }}>甲方未履行付款義務時，乙方得依法向甲方或連帶保證人請求清償全部債務。</p>
      </Block>

      <Block>
        <H2>第十二條　確認事項</H2>
        <p style={{ margin: '4px 0' }}>本確認書係雙方真意表示。雙方已充分閱讀並了解全部內容後，自願簽署並同意遵守。</p>
        <p style={{ margin: '4px 0' }}>本確認書一式二份，甲乙雙方各執一份為憑。</p>
      </Block>

      <Block>
        <H2>甲方（委託方／欠款方）</H2>
        <p style={{ margin: '4px 0' }}>公司名稱：<U w={200}>{data.partyA.companyName}</U></p>
        <p style={{ margin: '4px 0' }}>統一編號：<U w={120}>{data.partyA.taxId}</U></p>
        <p style={{ margin: '12px 0 4px' }}>公司大小章：</p>
        <div style={{ height: 48, borderBottom: '1px solid #ccc', marginBottom: 12 }} />
        <p style={{ margin: '4px 0' }}>負責人姓名：<U w={140}>{data.partyA.responsiblePerson}</U></p>
        <p style={{ margin: '4px 0' }}>負責人簽名：</p>
        <div style={{ height: 36, borderBottom: '1px solid #ccc', marginBottom: 8 }} />
        <p style={{ margin: '10px 0 4px' }}>
          簽署日期：<Roc3 y={data.partyASignRocYear} m={data.partyASignRocMonth} d={data.partyASignRocDay} />
        </p>
      </Block>

      <Block>
        <H2>甲方連帶保證人（本人親填）</H2>
        <p style={{ margin: '4px 0' }}>姓名：<U w={140}>{data.guarantorName}</U></p>
        <p style={{ margin: '4px 0' }}>身分證字號：<U w={140}>{data.guarantorId}</U></p>
        <p style={{ margin: '4px 0' }}>聯絡電話：<U w={140}>{data.guarantorPhone}</U></p>
        <p style={{ margin: '4px 0' }}>戶籍地址：</p>
        <p style={{ margin: '2px 0' }}>
          <U w={300}>{data.guarantorAddress}</U>
        </p>
        <p style={{ margin: '12px 0 4px' }}>親筆簽名：</p>
        <div style={{ height: 36, borderBottom: '1px solid #ccc', marginBottom: 8 }} />
        <p style={{ margin: '10px 0 4px' }}>
          簽署日期：<Roc3 y={data.guarantorSignRocYear} m={data.guarantorSignRocMonth} d={data.guarantorSignRocDay} />
        </p>
      </Block>

      <Block>
        <H2>乙方（承攬方／收款方）</H2>
        <p style={{ margin: '4px 0', fontWeight: 600 }}>{data.partyB.companyName || '鈞泩放樣工程'}</p>
        <p style={{ margin: '4px 0' }}>統一編號：<U w={120}>{data.partyB.taxId}</U></p>
        <p style={{ margin: '4px 0' }}>負責人：<U w={120}>{data.partyB.responsiblePerson}</U></p>
        <p style={{ margin: '12px 0 4px' }}>簽名或蓋章：</p>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 20,
            minHeight: 76,
            marginBottom: 8,
            paddingBottom: 4,
          }}
        >
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
