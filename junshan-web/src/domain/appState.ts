import { defaultSiteFees, type QuoteSite, type QuoteRow } from './quoteEngine'
import { defaultLedger, type MonthLine } from './ledgerEngine'
import {
  defaultSalaryBook,
  migrateSalaryBookEnsureTwelveMonths,
  type SalaryBook,
} from './salaryExcelModel'

export type Tab = 'quote' | 'payroll' | 'ledger'

export type AppState = {
  tab: Tab
  salaryBook: SalaryBook
  site: QuoteSite
  quoteRows: QuoteRow[]
  months: MonthLine[]
}

export function initialAppState(): AppState {
  return {
    tab: 'payroll',
    salaryBook: defaultSalaryBook(),
    site: { name: '', floors: [], fees: defaultSiteFees() },
    quoteRows: [],
    months: defaultLedger(),
  }
}

export function migrateAppState(loaded: unknown): AppState {
  const init = initialAppState()
  if (!loaded || typeof loaded !== 'object') return init
  const d = loaded as Partial<AppState>
  const tab: Tab =
    d.tab === 'quote' || d.tab === 'payroll' || d.tab === 'ledger'
      ? d.tab
      : 'payroll'
  return {
    ...init,
    ...d,
    tab,
    salaryBook:
      d.salaryBook && Array.isArray(d.salaryBook.months)
        ? migrateSalaryBookEnsureTwelveMonths(d.salaryBook as SalaryBook)
        : init.salaryBook,
    site: d.site && typeof d.site === 'object' ? d.site : init.site,
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
