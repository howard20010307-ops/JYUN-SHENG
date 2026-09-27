import type { CSSProperties, ReactNode } from 'react'
import { COMPANY_CONTRACTOR } from '../domain/companyContact'
import type { EmploymentCertificateWorkspaceState } from '../domain/employmentCertificateWorkspace'
import { PdfPageWatermark } from './PdfPageWatermark'

const COMPANY_STAMP_SRC = `${import.meta.env.BASE_URL}debt-confirmation-company-stamp.png`
const PERSONAL_STAMP_SRC = `${import.meta.env.BASE_URL}debt-confirmation-personal-stamp.png`

type Props = {
  data: EmploymentCertificateWorkspaceState
}

const rootStyle: CSSProperties = {
  width: '210mm',
  boxSizing: 'border-box',
  padding: '18mm 20mm 16mm',
  background: '#fff',
  color: '#111',
  fontFamily: '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif',
  fontSize: 12,
  lineHeight: 1.6,
  position: 'relative',
  overflow: 'hidden',
}

const cellStyle: CSSProperties = {
  border: '1.5px solid #111',
  padding: '10px 12px',
  verticalAlign: 'middle',
}

const labelCellStyle: CSSProperties = {
  ...cellStyle,
  width: '18%',
  textAlign: 'center',
  fontWeight: 600,
  background: '#fff',
}

const valueCellStyle: CSSProperties = {
  ...cellStyle,
  width: '32%',
}

function Block({ children }: { children: ReactNode }) {
  return (
    <div data-pdf-block="1" style={{ breakInside: 'avoid' }}>
      {children}
    </div>
  )
}

function CellValue({ children }: { children?: ReactNode }) {
  const t = (children ?? '').toString().trim()
  return <span>{t || '\u00a0'}</span>
}

function RocInline({ y, m, d }: { y: string; m: string; d: string }) {
  return (
    <span>
      民國 <CellValue>{y}</CellValue> 年 <CellValue>{m}</CellValue> 月 <CellValue>{d}</CellValue> 日
    </span>
  )
}

export function EmploymentCertificatePdfSheet({ data }: Props) {
  const remarkLines = (data.remarks || '').split(/\r?\n/)
  while (remarkLines.length < 2) remarkLines.push('')

  return (
    <div className="employmentCertPdfRoot" style={rootStyle}>
      <PdfPageWatermark />
      <Block>
        <h1
          style={{
            textAlign: 'center',
            margin: '0 0 28px',
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 4,
          }}
        >
          在職證明書
        </h1>

        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            border: '1.5px solid #111',
            marginBottom: 28,
          }}
        >
          <tbody>
            <tr>
              <td style={labelCellStyle}>姓名</td>
              <td style={valueCellStyle}><CellValue>{data.employeeName}</CellValue></td>
              <td style={labelCellStyle}>性別</td>
              <td style={valueCellStyle}><CellValue>{data.gender}</CellValue></td>
            </tr>
            <tr>
              <td style={labelCellStyle}>身份證字號</td>
              <td style={valueCellStyle}><CellValue>{data.idNumber}</CellValue></td>
              <td style={labelCellStyle}>出生年月日</td>
              <td style={valueCellStyle}>
                <RocInline y={data.birthRocYear} m={data.birthRocMonth} d={data.birthRocDay} />
              </td>
            </tr>
            <tr>
              <td style={labelCellStyle}>職稱</td>
              <td style={valueCellStyle}><CellValue>{data.jobTitle}</CellValue></td>
              <td style={labelCellStyle}>到職日期</td>
              <td style={valueCellStyle}>
                <RocInline y={data.hireRocYear} m={data.hireRocMonth} d={data.hireRocDay} />
              </td>
            </tr>
            <tr>
              <td style={labelCellStyle}>備註</td>
              <td style={{ ...cellStyle, lineHeight: 1.7 }} colSpan={3}>
                {remarkLines.map((line, i) => (
                  <div key={i} style={{ minHeight: 22 }}>
                    <CellValue>{line}</CellValue>
                  </div>
                ))}
              </td>
            </tr>
            <tr>
              <td
                style={{
                  ...cellStyle,
                  textAlign: 'center',
                  fontWeight: 600,
                  padding: '14px 12px',
                }}
                colSpan={4}
              >
                上列各項確實。特此證明。
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginLeft: '12%', marginBottom: 20 }}>
          <p style={{ margin: '6px 0' }}>
            公司名稱：<CellValue>{data.companyName}</CellValue>
          </p>
          <p style={{ margin: '6px 0' }}>
            統一編號：<CellValue>{data.taxId}</CellValue>
          </p>
          <p style={{ margin: '6px 0' }}>
            負責人：<CellValue>{data.responsiblePerson}</CellValue>
          </p>
          <p style={{ margin: '6px 0' }}>
            通訊地址：<CellValue>{data.address}</CellValue>
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 24,
            marginLeft: '12%',
            marginBottom: 36,
            minHeight: 80,
          }}
        >
          <img
            src={COMPANY_STAMP_SRC}
            alt={`${COMPANY_CONTRACTOR.name} 公司章`}
            style={{ height: 76, width: 'auto', objectFit: 'contain' }}
          />
          <img
            src={PERSONAL_STAMP_SRC}
            alt={`${COMPANY_CONTRACTOR.responsiblePerson} 負責人章`}
            style={{ height: 60, width: 'auto', objectFit: 'contain' }}
          />
        </div>

        <p style={{ textAlign: 'center', margin: '0', fontSize: 13, letterSpacing: 2 }}>
          中華民國 <CellValue>{data.issueRocYear}</CellValue> 年 <CellValue>{data.issueRocMonth}</CellValue> 月 <CellValue>{data.issueRocDay}</CellValue> 日
        </p>
      </Block>
    </div>
  )
}
