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
import {
  initialContractContentState,
  migrateContractContentState,
  type ContractContentState,
} from './contractContentModel'
import {
  initialPricingWorkspace,
  migratePricingWorkspace,
  type PricingWorkspaceState,
} from './pricingWorkspace'

export type { CustomLaborWorkspaceState } from './customLaborWorkspace'
export type { QuotationWorkspaceState } from './quotationWorkspace'
export type { ContractContentState } from './contractContentModel'
export type { PricingWorkspaceState } from './pricingWorkspace'

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
export type ClientDocsSheet = 'workDetail' | 'quotation' | 'pricing'

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
  /** 合約內容：案場分析用（可連接收帳） */
  contractContents: ContractContentState
  /** 計價單：對外文件（可連接合約與收帳進度） */
  pricingWorkspace: PricingWorkspaceState
}

/**
 * 遷移白名單防呆：新增／刪除 AppState 欄位時，這裡會在編譯期報錯，
 * 逼迫我們同步檢查 initial/migrate/雲端合併路徑是否完整。
 */
const APP_STATE_FIELD_GUARD: Record<keyof AppState, true> = {
  tab: true,
  clientDocsSheet: true,
  salaryBook: true,
  site: true,
  quoteRows: true,
  quoteRowsSchemaVersion: true,
  months: true,
  ledgerYear: true,
  workItemPresetLabels: true,
  workLog: true,
  receivables: true,
  customLaborWorkspace: true,
  quotationWorkspace: true,
  contractContents: true,
  pricingWorkspace: true,
}
void APP_STATE_FIELD_GUARD

/** 放樣估價持久化切片（案場＋估價列＋列結構版本） */
export type QuotePersistSlice = {
  site: QuoteSite
  quoteRows: QuoteRow[]
  quoteRowsSchemaVersion: number
}

export function defaultQuotePersistSlice(): QuotePersistSlice {
  return {
    site: migrateQuoteSite({}),
    quoteRows: [],
    quoteRowsSchemaVersion: QUOTE_ROWS_SCHEMA_VERSION,
  }
}

/**
 * 與 {@link migrateAppState} 內估價區塊相同：遷移 site／quoteRows，必要時依 layout 重建列。
 * 專案庫、專案 JSON 匯入亦應經此函式。
 */
export function migrateQuotePersistSlice(
  d: Partial<{ site: unknown; quoteRows: unknown; quoteRowsSchemaVersion: unknown }> | null | undefined,
): QuotePersistSlice {
  const base = defaultQuotePersistSlice()
  if (!d || typeof d !== 'object') return base

  let siteOut: QuoteSite =
    d.site && typeof d.site === 'object' ? migrateQuoteSite(d.site) : base.site

  const storedSchema =
    typeof d.quoteRowsSchemaVersion === 'number' &&
    Number.isFinite(d.quoteRowsSchemaVersion)
      ? Math.trunc(d.quoteRowsSchemaVersion)
      : 0

  let quoteRows: QuoteRow[] = Array.isArray(d.quoteRows) ? (d.quoteRows as QuoteRow[]) : base.quoteRows
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

  return { site: siteOut, quoteRows, quoteRowsSchemaVersion }
}

export function initialAppState(): AppState {
  const salaryBook = defaultSalaryBook()
  const q0 = defaultQuotePersistSlice()
  return {
    tab: 'payroll',
    clientDocsSheet: 'workDetail',
    salaryBook,
    site: q0.site,
    quoteRows: q0.quoteRows,
    quoteRowsSchemaVersion: q0.quoteRowsSchemaVersion,
    months: defaultLedger(),
    ledgerYear: inferPayrollYearFromBook(salaryBook),
    workItemPresetLabels: initialSortedWorkItemPresetLabels(),
    workLog: initialWorkLogState(),
    receivables: initialReceivablesState(),
    customLaborWorkspace: initialCustomLaborWorkspace(),
    quotationWorkspace: initialQuotationWorkspace(),
    contractContents: initialContractContentState(),
    pricingWorkspace: initialPricingWorkspace(),
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
    else if (tabStr === 'pricing') clientDocsSheet = 'pricing'
    else if (tabStr === 'laborExplain') clientDocsSheet = 'workDetail'
    else if (
      d.clientDocsSheet === 'quotation' ||
      d.clientDocsSheet === 'workDetail' ||
      d.clientDocsSheet === 'pricing'
    ) {
      clientDocsSheet = d.clientDocsSheet
    }
  }
  const workLog =
    d.workLog && typeof d.workLog === 'object' && d.workLog !== null
      ? migrateWorkLogState(d.workLog)
      : init.workLog
  const workItemPresetLabels = migrateWorkItemPresetLabels(d.workItemPresetLabels, workLog)

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
  const contractContents = migrateContractContentState(d.contractContents)
  const pricingWorkspace = migratePricingWorkspace(d.pricingWorkspace)

  const quoteM = migrateQuotePersistSlice({
    site: d.site,
    quoteRows: d.quoteRows,
    quoteRowsSchemaVersion: d.quoteRowsSchemaVersion,
  })
  const siteOut = quoteM.site
  const quoteRows = quoteM.quoteRows
  const quoteRowsSchemaVersion = quoteM.quoteRowsSchemaVersion

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

  const out: AppState = {
    tab,
    clientDocsSheet,
    salaryBook,
    site: siteOut,
    quoteRows,
    quoteRowsSchemaVersion,
    months: Array.isArray(d.months) ? mergeStoredMonthLines(d.months as unknown[]) : init.months,
    ledgerYear,
    workItemPresetLabels,
    workLog,
    receivables:
      d.receivables !== undefined && d.receivables !== null
        ? remapReceivablePayrollBindings(
            migrateReceivablesState(d.receivables),
            payrollIdRemap.monthByOldId,
            payrollIdRemap.blockByOldId,
          )
        : init.receivables,
    customLaborWorkspace,
    quotationWorkspace,
    contractContents,
    pricingWorkspace,
  }
  return out
}
