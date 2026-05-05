import { useState } from 'react'
import type { ContractContentState } from '../domain/contractContentModel'
import type { ReceivablesState } from '../domain/receivablesModel'
import type { MonthLine } from '../domain/ledgerEngine'
import type { SalaryBook } from '../domain/salaryExcelModel'
import type { WorkLogState } from '../domain/workLogModel'
import { LedgerPanel } from './LedgerPanel'
import { SiteAnalysisPanel } from './SiteAnalysisPanel'

type Props = {
  months: MonthLine[]
  setMonths: (m: MonthLine[]) => void
  ledgerYear: number
  setLedgerYear: (y: number) => void
  salaryBook: SalaryBook
  receivables: ReceivablesState
  workLog: WorkLogState
  contractContents: ContractContentState
  setContractContents: (fn: (prev: ContractContentState) => ContractContentState) => void
  canEdit: boolean
}

type SubTab = 'summary' | 'siteAnalysis'

export function CompanyAccountPanel(props: Props) {
  const [subTab, setSubTab] = useState<SubTab>('summary')
  return (
    <div className="companyAccountPanel">
      <nav className="tabs" aria-label="公司帳子選單" style={{ marginBottom: 10 }}>
        <button
          type="button"
          className={`tab ${subTab === 'summary' ? 'on' : ''}`}
          onClick={() => setSubTab('summary')}
        >
          公司帳總覽
        </button>
        <button
          type="button"
          className={`tab ${subTab === 'siteAnalysis' ? 'on' : ''}`}
          onClick={() => setSubTab('siteAnalysis')}
        >
          案場分析
        </button>
      </nav>

      {subTab === 'summary' ? (
        <LedgerPanel
          months={props.months}
          setMonths={props.setMonths}
          ledgerYear={props.ledgerYear}
          setLedgerYear={props.setLedgerYear}
          salaryBook={props.salaryBook}
          receivables={props.receivables}
          workLog={props.workLog}
          canEdit={props.canEdit}
        />
      ) : (
        <SiteAnalysisPanel
          salaryBook={props.salaryBook}
          workLog={props.workLog}
          receivables={props.receivables}
          contractContents={props.contractContents}
          setContractContents={props.setContractContents}
          canEdit={props.canEdit}
        />
      )}
    </div>
  )
}

