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
import { defaultLedger, mergeStoredMonthLines, type MonthLine } from './ledgerEngine'
import {
  defaultSalaryBook,
  inferPayrollYearFromBook,
  finalizeSalaryBookPayroll,
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
  remapReceivablePayrollBindings,
  type ReceivablesState,
} from './receivablesModel'
import {
  initialSortedWorkItemPresetLabels,
  migrateWorkItemPresetLabels,
} from './workItemPresets'
import { migrateCustomLaborReportLines } from './quoteCustomLaborReport'
import { migrateQuoteOwnerClient } from './quoteEngine'
import {
  initialCustomLaborWorkspace,
  migrateCustomLaborWorkspace,
  type CustomLaborWorkspaceState,
} from './customLaborWorkspace'
import {
  initialQuotationWorkspace,
  migrateQuotationWorkspace,
  type QuotationWorkspaceState,
} from './quotationWorkspace'

export type { CustomLaborWorkspaceState } from './customLaborWorkspace'
export type { QuotationWorkspaceState } from './quotationWorkspace'

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

export type Tab = 'quote' | 'payroll' | 'ledger' | 'worklog' | 'receivables' | 'clientDocs'

/** 「對外文件」內子畫面：工作明細（原自填明細）或報價單 */
export type ClientDocsSheet = 'workDetail' | 'quotation'

export type AppState = {
  tab: Tab
  /** 僅當 tab === 'clientDocs' 時有效 */
  clientDocsSheet: ClientDocsSheet
  salaryBook: SalaryBook
  site: QuoteSite
  quoteRows: QuoteRow[]
  /** 估價列結構版本；低於目前常數時載入會依 site.layout 重建 quoteRows */
  quoteRowsSchemaVersion: number
  months: MonthLine[]
  /** 公司損益表：月列資料；收帳／月表／日誌自動帶入所依西元年（畫面上可切換） */
  ledgerYear: number
  /** 工作日誌／快速登記「工作內容」datalist 預設項（與放樣估價分開；依字長排序） */
  workItemPresetLabels: string[]
  workLog: WorkLogState
  receivables: ReceivablesState
  /** 工作明細：獨立於放樣估價案場（對外文件之一） */
  customLaborWorkspace: CustomLaborWorkspaceState
  /** 報價單：獨立於放樣估價案場（對外文件之一） */
  quotationWorkspace: QuotationWorkspaceState
}

export function initialAppState(): AppState {
  const salaryBook = defaultSalaryBook()
  return {
    tab: 'payroll',
    clientDocsSheet: 'workDetail',
    salaryBook,
    site: migrateQuoteSite({}),
    quoteRows: [],
    quoteRowsSchemaVersion: QUOTE_ROWS_SCHEMA_VERSION,
    months: defaultLedger(),
    ledgerYear: inferPayrollYearFromBook(salaryBook),
    workItemPresetLabels: initialSortedWorkItemPresetLabels(),
    workLog: initialWorkLogState(),
    receivables: initialReceivablesState(),
    customLaborWorkspace: initialCustomLaborWorkspace(),
    quotationWorkspace: initialQuotationWorkspace(),
  }
}

export function migrateAppState(loaded: unknown): AppState {
  const init = initialAppState()
  if (!loaded || typeof loaded !== 'object') return init
  const d = loaded as Partial<AppState>
  const tabRaw = (d as Record<string, unknown>).tab
  const tabStr = typeof tabRaw === 'string' ? tabRaw : ''

  let tab: Tab = 'payroll'
  if (
    tabStr === 'quote' ||
    tabStr === 'payroll' ||
    tabStr === 'ledger' ||
    tabStr === 'worklog' ||
    tabStr === 'receivables' ||
    tabStr === 'clientDocs'
  ) {
    tab = tabStr as Tab
  } else if (tabStr === 'laborExplain' || tabStr === 'quotation') {
    tab = 'clientDocs'
  }

  let clientDocsSheet: ClientDocsSheet = init.clientDocsSheet
  if (tab === 'clientDocs') {
    if (tabStr === 'quotation') clientDocsSheet = 'quotation'
    else if (tabStr === 'laborExplain') clientDocsSheet = 'workDetail'
    else if (d.clientDocsSheet === 'quotation' || d.clientDocsSheet === 'workDetail') {
      clientDocsSheet = d.clientDocsSheet
    }
  }
  const workLog =
    d.workLog && typeof d.workLog === 'object' && d.workLog !== null
      ? migrateWorkLogState(d.workLog)
      : init.workLog
  const workItemPresetLabels = migrateWorkItemPresetLabels(d.workItemPresetLabels, workLog)
  let siteOut: QuoteSite =
    d.site && typeof d.site === 'object' ? migrateQuoteSite(d.site) : init.site

  const rawSiteLegacy =
    d.site && typeof d.site === 'object' ? (d.site as Record<string, unknown>) : null
  const legacyCustomLaborFromQuoteSite =
    rawSiteLegacy && Array.isArray(rawSiteLegacy.customLaborReportLines)
      ? {
          caseTitle: typeof rawSiteLegacy.name === 'string' ? rawSiteLegacy.name : '',
          ownerClient: migrateQuoteOwnerClient(rawSiteLegacy.ownerClient),
          lines: migrateCustomLaborReportLines(rawSiteLegacy.customLaborReportLines),
        }
      : undefined

  const customLaborWorkspace = migrateCustomLaborWorkspace(
    d.customLaborWorkspace,
    legacyCustomLaborFromQuoteSite,
  )
  const quotationWorkspace = migrateQuotationWorkspace(d.quotationWorkspace)
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

  let salaryBook = init.salaryBook
  let payrollIdRemap = { monthByOldId: {} as Record<string, string>, blockByOldId: {} as Record<string, string> }
  if (d.salaryBook && Array.isArray(d.salaryBook.months)) {
    const fin = finalizeSalaryBookPayroll(d.salaryBook as SalaryBook)
    salaryBook = fin.book
    payrollIdRemap = fin.remap
  }

  const ledgerYear =
    typeof d.ledgerYear === 'number' &&
    Number.isFinite(d.ledgerYear) &&
    d.ledgerYear >= 2000 &&
    d.ledgerYear <= 2100
      ? Math.trunc(d.ledgerYear)
      : inferPayrollYearFromBook(salaryBook)

  const merged = {
    ...init,
    ...d,
    tab,
    clientDocsSheet,
    workLog,
    salaryBook,
    site: siteOut,
    quoteRows,
    quoteRowsSchemaVersion,
    ledgerYear,
    workItemPresetLabels,
    customLaborWorkspace,
    quotationWorkspace,
    months: Array.isArray(d.months) ? mergeStoredMonthLines(d.months as unknown[]) : init.months,
    receivables:
      d.receivables !== undefined && d.receivables !== null
        ? remapReceivablePayrollBindings(
            migrateReceivablesState(d.receivables),
            payrollIdRemap.monthByOldId,
            payrollIdRemap.blockByOldId,
          )
        : init.receivables,
  }
  const { billingProgress: _legacyBillingProgress, ...out } = merged as typeof merged & {
    billingProgress?: unknown
  }
  return out
}
