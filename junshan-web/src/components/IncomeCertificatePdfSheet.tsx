import type { CSSProperties, ReactNode } from 'react'
import { COMPANY_CONTRACTOR } from '../domain/companyContact'
import {
  formatNetPayNt,
  netPayChinesePlaces,
  parseNetPayAmount,
  payCycleRangeFromRocMonth,
  type IncomeCertificateWorkspaceState,
} from '../domain/incomeCertificateWorkspace'
import { PdfPageWatermark } from './PdfPageWatermark'

/** `public/company-invoice-stamp.png`：統一發票專用章（去背） */
const INVOICE_STAMP_SRC = `${import.meta.env.BASE_URL}company-invoice-stamp.png`

type Props = {
  data: IncomeCertificateWorkspaceState
}

const rootStyle: CSSProperties = {
  width: '210mm',
  boxSizing: 'border-box',
  padding: '16mm 18mm 14mm',
  background: '#fff',
  color: '#111',
  fontFamily: '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif',
  fontSize: 12.5,
  lineHeight: 1.75,
  position: 'relative',
  overflow: 'hidden',
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
        padding: '0 4px 1px',
        verticalAlign: 'baseline',
        lineHeight: 1.4,
        textAlign: 'center',
      }}
    >
      {t || '\u00a0'}
    </span>
  )
}

function H2({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: '0 0 8px', fontWeight: 700, letterSpacing: 1 }}>
      {children}
    </p>
  )
}

function P({ children }: { children: ReactNode }) {
  return <p style={{ margin: '4px 0', textIndent: 0 }}>{children}</p>
}

function LegalStatementBody({ text, landlordName }: { text: string; landlordName: string }) {
  const lines = (text || '').split(/\r?\n/)
  const nonempty = lines.length === 0 ? [''] : lines
  return (
    <>
      {nonempty.map((line, i) => {
        const parts = line.split('{房東}')
        return (
          <p key={i} style={{ margin: '4px 0 4px 1.5em', whiteSpace: 'pre-wrap' }}>
            {parts.map((part, j) => (
              <span key={j}>
                {j > 0 ? <U w={120}>{landlordName}</U> : null}
                {part}
              </span>
            ))}
            {line.trim() ? null : '\u00a0'}
          </p>
        )
      })}
    </>
  )
}

export function IncomeCertificatePdfSheet({ data }: Props) {
  const range = payCycleRangeFromRocMonth(data.payRocYear, data.payRocMonth)
  const amount = parseNetPayAmount(data.netPayAmount)
  const cn = netPayChinesePlaces(amount)
  const nt = formatNetPayNt(amount)

  return (
    <div className="incomeCertPdfRoot" style={rootStyle}>
      <PdfPageWatermark />
      <Block>
        <h1
          style={{
            textAlign: 'center',
            margin: '0 0 8px',
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 8,
          }}
        >
          服務與收入證明書
        </h1>
        <div style={{ borderTop: '2px solid #111', marginBottom: 18 }} />

        <H2>一、 基本資料</H2>
        <P>
          服務人員姓名：<U w={160}>{data.employeeName}</U>
        </P>
        <P>
          身分證字號／統一證號：<U w={180}>{data.idNumber}</U>
        </P>
        <P>
          任職／服務部門：<U w={180}>{data.department}</U>
        </P>
        <P>
          到職／服務日期：民國 <U w={40}>{data.hireRocYear}</U> 年{' '}
          <U w={32}>{data.hireRocMonth}</U> 月 <U w={32}>{data.hireRocDay}</U> 日
        </P>
      </Block>

      <Block>
        <H2>二、 薪資與給付明細</H2>
        <P>
          茲證明 <U w={100}>{data.employeeName}</U> 君在本單位服務期間，表現良好。
        </P>
        <P>
          本單位薪資計算週期為【每月 11 日至次月 10 日】，其薪資給付狀況如下：
        </P>
        <P>
          申報／採計月份：民國 <U w={40}>{data.payRocYear}</U> 年{' '}
          <U w={32}>{data.payRocMonth}</U> 月份
        </P>
        <P>
          計薪起迄區間：民國 <U w={40}>{range?.startRocYear ?? ''}</U> 年{' '}
          <U w={32}>{range?.startRocMonth ?? ''}</U> 月 11 日 至{' '}
          <U w={40}>{range?.endRocYear ?? ''}</U> 年 <U w={32}>{range?.endRocMonth ?? ''}</U> 月
          10 日
        </P>
        <P>實領薪資金額：</P>
        <P>
          新臺幣（大寫）：<U w={36}>{cn.wan}</U> 萬 <U w={28}>{cn.qian}</U> 仟{' '}
          <U w={28}>{cn.bai}</U> 佰 <U w={28}>{cn.shi}</U> 拾
          {cn.ge ? (
            <>
              {' '}
              <U w={28}>{cn.ge}</U>
            </>
          ) : null}{' '}
          元整（NT$ <U w={88}>{nt}</U> 元）
        </P>
      </Block>

      <Block>
        <H2>三、 證明用途與法律聲明</H2>
        <LegalStatementBody text={data.legalStatement} landlordName={data.landlordName} />
        <p
          style={{
            textAlign: 'center',
            margin: '22px 0 8px',
            fontWeight: 700,
            letterSpacing: 10,
            fontSize: 15,
          }}
        >
          特 此 證 明
        </p>
        <div style={{ borderTop: '2px solid #111', margin: '0 0 16px' }} />
      </Block>

      <Block>
        <div
          style={{
            position: 'relative',
            marginLeft: '8%',
            minHeight: 168,
            paddingRight: 150,
          }}
        >
          <P>
            開立單位名稱：<U w={220}>{data.companyName}</U>
          </P>
          <P>
            統一編號：<U w={120}>{data.taxId}</U>
          </P>
          <P>
            聯絡地址：<U w={280}>{data.address}</U>
          </P>
          <P>
            聯絡電話：<U w={140}>{data.phone}</U>
          </P>
          <P>
            負責人／主管：<U w={120}>{data.responsiblePerson}</U>
            <span style={{ marginLeft: 8 }}>（簽章）</span>
          </P>
          <img
            src={INVOICE_STAMP_SRC}
            alt={`${COMPANY_CONTRACTOR.name} 統一發票專用章`}
            style={{
              position: 'absolute',
              right: 0,
              bottom: 8,
              width: 148,
              height: 'auto',
              objectFit: 'contain',
              pointerEvents: 'none',
            }}
          />
        </div>
        <p style={{ textAlign: 'center', margin: '20px 0 0', letterSpacing: 2 }}>
          開立日期：中華民國 <U w={40}>{data.issueRocYear}</U> 年{' '}
          <U w={32}>{data.issueRocMonth}</U> 月 <U w={32}>{data.issueRocDay}</U> 日
        </p>
      </Block>
    </div>
  )
}
