/**
 * 獨立報價單工作區（與放樣估價案場無連動）；供自填明細與 PDF 匯出。
 */
import { allocateWithSuffix, stableHash16 } from './stableIds'
import { COMPANY_CONTRACTOR } from './companyContact'
import { migrateQuoteOwnerClient, type QuoteOwnerClient } from './quoteEngine'

export type QuotationSupplier = {
  companyName: string
  address: string
  phoneEmail: string
  taxId: string
}

export type QuotationMeta = {
  quoteNumber: string
  /** 報價有效期限（天數，自填文字） */
  validDays: string
  quoteDate: string
  /** 報價期限（截止日等） */
  deadline: string
}

export type QuotationLine = {
  id: string
  item: string
  category: string
  quantity: number
  unit: string
  /** 單價（未稅） */
  unitPriceExTax: number
  remarks: string
}

export type QuotationClauseLine = {
  id: string
  text: string
}

function defaultSupplier(): QuotationSupplier {
  return {
    companyName: COMPANY_CONTRACTOR.name,
    address: COMPANY_CONTRACTOR.address,
    phoneEmail: COMPANY_CONTRACTOR.phone,
    taxId: COMPANY_CONTRACTOR.taxId,
  }
}

function defaultClauseTexts(): readonly string[] {
  return [
    '本報價單僅供參考，實際成交條件以雙方書面約定為準。',
    '報價有效期限、付款條件等未載明事項，以雙方另行約定為準。',
    '表列金額之稅額依適用稅率試算，實際以開立憑證為準。',
  ]
}

function clauseDefaults(): QuotationClauseLine[] {
  const texts = defaultClauseTexts()
  const seen = new Set<string>()
  return texts.map((text, i) => {
    const base = `qws-clause--${stableHash16(`default\0${i}\0${text}`)}`
    const id = allocateWithSuffix(base, seen)
    seen.add(id)
    return { id, text }
  })
}

function migrateSupplier(raw: unknown): QuotationSupplier {
  const d = defaultSupplier()
  if (!raw || typeof raw !== 'object') return d
  const o = raw as Record<string, unknown>
  const s = (k: keyof QuotationSupplier): string =>
    typeof o[k] === 'string' ? (o[k] as string) : d[k]
  return {
    companyName: s('companyName'),
    address: s('address'),
    phoneEmail: s('phoneEmail'),
    taxId: s('taxId'),
  }
}

function migrateMeta(raw: unknown): QuotationMeta {
  const empty: QuotationMeta = {
    quoteNumber: '',
    validDays: '',
    quoteDate: '',
    deadline: '',
  }
  if (!raw || typeof raw !== 'object') return empty
  const o = raw as Record<string, unknown>
  const s = (k: keyof QuotationMeta): string =>
    typeof o[k] === 'string' ? (o[k] as string) : empty[k]
  return {
    quoteNumber: s('quoteNumber'),
    validDays: s('validDays'),
    quoteDate: s('quoteDate'),
    deadline: s('deadline'),
  }
}

function safeNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v)
    if (Number.isFinite(n)) return n
  }
  return 0
}

function syncQuotationLine(raw: Record<string, unknown>): QuotationLine {
  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    item: typeof raw.item === 'string' ? raw.item : '',
    category: typeof raw.category === 'string' ? raw.category : '',
    quantity: safeNum(raw.quantity),
    unit: typeof raw.unit === 'string' ? raw.unit : '',
    unitPriceExTax: safeNum(raw.unitPriceExTax),
    remarks: typeof raw.remarks === 'string' ? raw.remarks : '',
  }
}

export function migrateQuotationLines(raw: unknown): QuotationLine[] {
  if (!Array.isArray(raw)) return []
  const tmp: QuotationLine[] = []
  for (let i = 0; i < raw.length; i++) {
    const e = raw[i]
    if (!e || typeof e !== 'object') continue
    const o = e as Record<string, unknown>
    const item = typeof o.item === 'string' ? o.item : ''
    const id =
      typeof o.id === 'string' && o.id.trim() !== ''
        ? o.id
        : `qws-line--${stableHash16(`migrate\0${i}\0${item}`)}`
    tmp.push(syncQuotationLine({ ...(o as Record<string, unknown>), id }))
  }
  const seen = new Set<string>()
  return tmp.map((l, i) => {
    if (!seen.has(l.id)) {
      seen.add(l.id)
      return l
    }
    const base = `qws-line--${stableHash16(`dedupe\0${i}\0${l.id}\0${l.item}`)}`
    const id = allocateWithSuffix(base, seen)
    seen.add(id)
    return { ...l, id }
  })
}

export function newQuotationLineId(seedTitle: string, existing: readonly QuotationLine[]): string {
  const base = `qws-line--${stableHash16(`new\0${seedTitle}\0${existing.map((l) => l.id).join('\n')}`)}`
  return allocateWithSuffix(base, new Set(existing.map((l) => l.id)))
}

export function createQuotationLine(seedTitle: string, existing: readonly QuotationLine[]): QuotationLine {
  return {
    id: newQuotationLineId(seedTitle, existing),
    item: '',
    category: '',
    quantity: 0,
    unit: '',
    unitPriceExTax: 0,
    remarks: '',
  }
}

function migrateQuotationClauseLines(raw: unknown): QuotationClauseLine[] {
  if (raw === undefined || raw === null) return clauseDefaults()
  if (!Array.isArray(raw)) return clauseDefaults()
  if (raw.length === 0) return []
  const first = raw[0]
  if (typeof first === 'string') {
    const seen = new Set<string>()
    return (raw as unknown[]).map((x, i) => {
      const text = typeof x === 'string' ? x : ''
      const base = `qws-clause--${stableHash16(`migrateStr\0${i}\0${text}`)}`
      const id = allocateWithSuffix(base, seen)
      seen.add(id)
      return { id, text }
    })
  }
  const tmp: QuotationClauseLine[] = []
  for (let i = 0; i < raw.length; i++) {
    const e = raw[i]
    if (!e || typeof e !== 'object') continue
    const o = e as Record<string, unknown>
    const text = typeof o.text === 'string' ? o.text : ''
    const id =
      typeof o.id === 'string' && o.id.trim() !== ''
        ? o.id
        : `qws-clause--${stableHash16(`migrateObj\0${i}\0${text}`)}`
    tmp.push({ id, text })
  }
  const seen = new Set<string>()
  return tmp.map((l, i) => {
    if (!seen.has(l.id)) {
      seen.add(l.id)
      return l
    }
    const base = `qws-clause--${stableHash16(`dedupe\0${i}\0${l.id}\0${l.text}`)}`
    const id = allocateWithSuffix(base, seen)
    seen.add(id)
    return { ...l, id }
  })
}

export function createQuotationClauseLine(
  seedTitle: string,
  existing: readonly QuotationClauseLine[],
): QuotationClauseLine {
  const base = `qws-clause--${stableHash16(`new\0${seedTitle}\0${existing.map((c) => c.id).join('\n')}`)}`
  const id = allocateWithSuffix(base, new Set(existing.map((c) => c.id)))
  return { id, text: '' }
}

/** 單列：未稅小計、稅額、含稅總計（元，整數四捨五入） */
export function quotationLineMoney(
  line: Pick<QuotationLine, 'quantity' | 'unitPriceExTax'>,
  vatRate: number,
): { subEx: number; tax: number; totalInc: number } {
  const rate = Number.isFinite(vatRate) && vatRate >= 0 ? vatRate : 0
  const subEx = Math.round(line.quantity * line.unitPriceExTax)
  const tax = Math.round(subEx * rate)
  const totalInc = subEx + tax
  return { subEx, tax, totalInc }
}

export function quotationGrandTotals(
  lines: readonly QuotationLine[],
  vatRate: number,
): { subEx: number; tax: number; totalInc: number } {
  let subEx = 0
  let tax = 0
  let totalInc = 0
  for (const ln of lines) {
    const m = quotationLineMoney(ln, vatRate)
    subEx += m.subEx
    tax += m.tax
    totalInc += m.totalInc
  }
  return { subEx, tax, totalInc }
}

export type QuotationWorkspaceState = {
  /** 檔名與抬頭用（例如專案名） */
  quoteTitle: string
  meta: QuotationMeta
  supplier: QuotationSupplier
  /** 付款人（客戶） */
  payer: QuoteOwnerClient
  lines: QuotationLine[]
  /** 營業稅率百分比，例如 5 表示 5% */
  vatPercent: number
  clauseLines: QuotationClauseLine[]
}

export function quotationVatRate(vatPercent: number): number {
  const p = Number.isFinite(vatPercent) && vatPercent >= 0 ? vatPercent : 0
  return p / 100
}

export function initialQuotationWorkspace(): QuotationWorkspaceState {
  return {
    quoteTitle: '',
    meta: {
      quoteNumber: '',
      validDays: '',
      quoteDate: '',
      deadline: '',
    },
    supplier: defaultSupplier(),
    payer: migrateQuoteOwnerClient(undefined),
    lines: [],
    vatPercent: 5,
    clauseLines: clauseDefaults(),
  }
}

export function migrateQuotationWorkspace(raw: unknown): QuotationWorkspaceState {
  const init = initialQuotationWorkspace()
  if (!raw || typeof raw !== 'object') return init
  const o = raw as Record<string, unknown>
  let vatPercent = init.vatPercent
  if (typeof o.vatPercent === 'number' && Number.isFinite(o.vatPercent) && o.vatPercent >= 0 && o.vatPercent <= 100) {
    vatPercent = o.vatPercent
  } else if (typeof o.vatRate === 'number' && Number.isFinite(o.vatRate) && o.vatRate >= 0 && o.vatRate <= 1) {
    vatPercent = Math.round(o.vatRate * 10000) / 100
  }
  return {
    quoteTitle: typeof o.quoteTitle === 'string' ? o.quoteTitle : '',
    meta: migrateMeta(o.meta),
    supplier: migrateSupplier(o.supplier),
    payer: migrateQuoteOwnerClient(o.payer),
    lines: migrateQuotationLines(o.lines),
    vatPercent,
    clauseLines: migrateQuotationClauseLines(o.clauseLines),
  }
}
