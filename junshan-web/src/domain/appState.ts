import { migrateQuoteSite, type QuoteSite, type QuoteRow } from './quoteEngine'
import { defaultLedger, type MonthLine } from './ledgerEngine'
import {
  defaultSalaryBook,
  normalizeSalaryBook,
  type SalaryBook,
} from './salaryExcelModel'
import {
  initialWorkLogState,
  migrateWorkLogState,
  type WorkLogState,
} from './workLogModel'

export type Tab = 'quote' | 'payroll' | 'ledger' | 'worklog'

export type AppState = {
  tab: Tab
  salaryBook: SalaryBook
  site: QuoteSite
  quoteRows: QuoteRow[]
  months: MonthLine[]
  workLog: WorkLogState
}

export function initialAppState(): AppState {
  return {
    tab: 'payroll',
    salaryBook: defaultSalaryBook(),
    site: migrateQuoteSite({}),
    quoteRows: [],
    months: defaultLedger(),
    workLog: initialWorkLogState(),
  }
}

export function migrateAppState(loaded: unknown): AppState {
  const init = initialAppState()
  if (!loaded || typeof loaded !== 'object') return init
  const d = loaded as Partial<AppState>
  const tab: Tab =
    d.tab === 'quote' || d.tab === 'payroll' || d.tab === 'ledger' || d.tab === 'worklog'
      ? d.tab
      : 'payroll'
  const workLog =
    d.workLog && typeof d.workLog === 'object' && d.workLog !== null
      ? migrateWorkLogState(d.workLog)
      : init.workLog
  return {
    ...init,
    ...d,
    tab,
    workLog,
    salaryBook:
      d.salaryBook && Array.isArray(d.salaryBook.months)
        ? normalizeSalaryBook(d.salaryBook as SalaryBook)
        : init.salaryBook,
    site: d.site && typeof d.site === 'object' ? migrateQuoteSite(d.site) : init.site,
    quoteRows: Array.isArray(d.quoteRows) ? d.quoteRows : init.quoteRows,
    months: Array.isArray(d.months)
      ? (d.months as MonthLine[]).map((m) => ({
          ...m,
          overtimePay:
            typeof m.overtimePay === 'number' && Number.isFinite(m.overtimePay)
              ? m.overtimePay
              : 0,
        }))
      : init.months,
  }
}
