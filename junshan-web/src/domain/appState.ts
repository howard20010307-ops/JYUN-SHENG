import {
  buildQuoteRowsFromLayout,
  exampleQuoteLayout,
  migrateQuoteSite,
  normalizeQuoteLayout,
  syncFloorsWithLayout,
  type QuoteLayout,
  type QuoteSite,
  type QuoteRow,
} from './quoteEngine'
import { defaultLedger, normalizeStoredMonthLine, type MonthLine } from './ledgerEngine'
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
import {
  initialReceivablesState,
  migrateReceivablesState,
  type ReceivablesState,
} from './receivablesModel'

/** 與 {@link buildQuoteRowsFromLayout} 結構綁定；變更估價細項或展開規則時遞增，以觸發舊本機／備份資料重建列 */
export const QUOTE_ROWS_SCHEMA_VERSION = 3

function isFlatQuoteLayout(l: QuoteLayout): boolean {
  return (
    l.basementFloors === 0 &&
    !l.hasMezzanine &&
    l.typicalFloors === 0 &&
    l.rfCount === 0
  )
}

export type Tab = 'quote' | 'payroll' | 'ledger' | 'worklog' | 'receivables'

export type AppState = {
  tab: Tab
  salaryBook: SalaryBook
  site: QuoteSite
  quoteRows: QuoteRow[]
  /** 估價列結構版本；低於目前常數時載入會依 site.layout 重建 quoteRows */
  quoteRowsSchemaVersion: number
  months: MonthLine[]
  workLog: WorkLogState
  receivables: ReceivablesState
}

export function initialAppState(): AppState {
  return {
    tab: 'payroll',
    salaryBook: defaultSalaryBook(),
    site: migrateQuoteSite({}),
    quoteRows: [],
    quoteRowsSchemaVersion: QUOTE_ROWS_SCHEMA_VERSION,
    months: defaultLedger(),
    workLog: initialWorkLogState(),
    receivables: initialReceivablesState(),
  }
}

export function migrateAppState(loaded: unknown): AppState {
  const init = initialAppState()
  if (!loaded || typeof loaded !== 'object') return init
  const d = loaded as Partial<AppState>
  const tab: Tab =
    d.tab === 'quote' ||
    d.tab === 'payroll' ||
    d.tab === 'ledger' ||
    d.tab === 'worklog' ||
    d.tab === 'receivables'
      ? d.tab
      : 'payroll'
  const workLog =
    d.workLog && typeof d.workLog === 'object' && d.workLog !== null
      ? migrateWorkLogState(d.workLog)
      : init.workLog
  let siteOut: QuoteSite =
    d.site && typeof d.site === 'object' ? migrateQuoteSite(d.site) : init.site
  const storedSchema =
    typeof d.quoteRowsSchemaVersion === 'number' &&
    Number.isFinite(d.quoteRowsSchemaVersion)
      ? Math.trunc(d.quoteRowsSchemaVersion)
      : 0

  let quoteRows: QuoteRow[] = Array.isArray(d.quoteRows) ? (d.quoteRows as QuoteRow[]) : init.quoteRows
  let quoteRowsSchemaVersion = storedSchema
  if (storedSchema < QUOTE_ROWS_SCHEMA_VERSION) {
    quoteRowsSchemaVersion = QUOTE_ROWS_SCHEMA_VERSION
    const layoutEff = normalizeQuoteLayout(siteOut.layout)
    if (isFlatQuoteLayout(layoutEff)) {
      const nextLayout = exampleQuoteLayout()
      siteOut = {
        ...siteOut,
        layout: nextLayout,
        floors: syncFloorsWithLayout(siteOut.floors, nextLayout),
      }
      quoteRows = buildQuoteRowsFromLayout(nextLayout)
    }
  }

  return {
    ...init,
    ...d,
    tab,
    workLog,
    salaryBook:
      d.salaryBook && Array.isArray(d.salaryBook.months)
        ? normalizeSalaryBook(d.salaryBook as SalaryBook)
        : init.salaryBook,
    site: siteOut,
    quoteRows,
    quoteRowsSchemaVersion,
    months: Array.isArray(d.months)
      ? (d.months as unknown[]).map((raw, i) =>
          normalizeStoredMonthLine(raw, init.months[i] ?? defaultLedger()[i] ?? init.months[0]),
        )
      : init.months,
    receivables:
      d.receivables !== undefined && d.receivables !== null
        ? migrateReceivablesState(d.receivables)
        : init.receivables,
  }
}
