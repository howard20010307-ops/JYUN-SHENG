import { allocateWithSuffix, stableHash16 } from './stableIds'
import { COMPANY_CONTRACTOR } from './companyContact'
import { migrateQuoteOwnerClient, type QuoteOwnerClient } from './quoteEngine'

export type PricingRow = {
  id: string
  contractLineId?: string
  buildingLabel: string
  floorLabel: string
  phaseLabel: string
  item: string
  amountNet: number
  tax: number
  total: number
  note: string
}

export type PricingWorkspaceState = {
  sheetTitle: string
  pricingNumber: string
  pricingDate: string
  siteName: string
  remittance: {
    accountName: string
    receivingAccount: string
  }
  supplier: {
    companyName: string
    address: string
    phoneEmail: string
    taxId: string
  }
  payer: QuoteOwnerClient
  remarkLines: { id: string; text: string }[]
  rows: PricingRow[]
}

function safeNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return 0
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function normalizeRow(row: PricingRow): PricingRow {
  const amountNet = safeNum(row.amountNet)
  const tax = safeNum(row.tax)
  const totalRaw = safeNum(row.total)
  const total = totalRaw !== 0 ? totalRaw : amountNet + tax
  return {
    ...row,
    contractLineId: (row.contractLineId ?? '').trim(),
    buildingLabel: row.buildingLabel.trim(),
    floorLabel: row.floorLabel.trim(),
    phaseLabel: row.phaseLabel.trim(),
    item: row.item.trim(),
    note: row.note.trim(),
    amountNet,
    tax,
    total,
  }
}

function ensureStableRowIds(rows: PricingRow[]): PricingRow[] {
  const used = new Set<string>()
  return rows.map((row, i) => {
    const core = [
      row.buildingLabel,
      row.floorLabel,
      row.phaseLabel,
      row.item,
      String(row.amountNet),
      String(row.tax),
      String(row.total),
      row.note,
    ].join('\u001f')
    const base = `prc-row--${stableHash16(`${i}\u0000${core}`)}`
    const id = row.id.trim() !== '' ? allocateWithSuffix(row.id.trim(), used) : allocateWithSuffix(base, used)
    used.add(id)
    return { ...row, id }
  })
}

export function initialPricingWorkspace(): PricingWorkspaceState {
  const remark = '本計價單為階段請款依據，金額與進度請雙方確認後辦理。'
  const remarkId = `prc-rmk--${stableHash16(`default\0${remark}`)}`
  return {
    sheetTitle: '計價單 Pricing Sheet',
    pricingNumber: '',
    pricingDate: '',
    siteName: '',
    remittance: {
      accountName: '鈞泩放樣工程行楊皓鈞',
      receivingAccount: '700-700001042376071',
    },
    supplier: {
      companyName: COMPANY_CONTRACTOR.name,
      address: COMPANY_CONTRACTOR.address,
      phoneEmail: COMPANY_CONTRACTOR.phone,
      taxId: COMPANY_CONTRACTOR.taxId,
    },
    payer: migrateQuoteOwnerClient(undefined),
    remarkLines: [{ id: remarkId, text: remark }],
    rows: [],
  }
}

export function migratePricingWorkspace(raw: unknown): PricingWorkspaceState {
  const init = initialPricingWorkspace()
  if (!raw || typeof raw !== 'object') return init
  const o = raw as Record<string, unknown>
  const rowsRaw = Array.isArray(o.rows) ? o.rows : []
  const rows: PricingRow[] = []
  for (let i = 0; i < rowsRaw.length; i++) {
    const r = rowsRaw[i]
    if (!r || typeof r !== 'object') continue
    const x = r as Record<string, unknown>
    rows.push(
      normalizeRow({
        id: str(x.id),
        contractLineId: str(x.contractLineId),
        buildingLabel: str(x.buildingLabel),
        floorLabel: str(x.floorLabel),
        phaseLabel: str(x.phaseLabel),
        item: str(x.item),
        amountNet: safeNum(x.amountNet),
        tax: safeNum(x.tax),
        total: safeNum(x.total),
        note: str(x.note),
      }),
    )
  }
  const sheetTitleRaw = str(o.sheetTitle).trim()
  const sheetTitle =
    sheetTitleRaw === '' || sheetTitleRaw === '計價單' ? init.sheetTitle : sheetTitleRaw
  return {
    sheetTitle,
    pricingNumber: str(o.pricingNumber).trim(),
    pricingDate: str(o.pricingDate).trim(),
    siteName: str(o.siteName).trim(),
    remittance: {
      accountName: str((o.remittance as Record<string, unknown> | undefined)?.accountName) || init.remittance.accountName,
      receivingAccount: str((o.remittance as Record<string, unknown> | undefined)?.receivingAccount) || init.remittance.receivingAccount,
    },
    supplier: {
      companyName: str((o.supplier as Record<string, unknown> | undefined)?.companyName) || init.supplier.companyName,
      address: str((o.supplier as Record<string, unknown> | undefined)?.address) || init.supplier.address,
      phoneEmail: str((o.supplier as Record<string, unknown> | undefined)?.phoneEmail) || init.supplier.phoneEmail,
      taxId: str((o.supplier as Record<string, unknown> | undefined)?.taxId) || init.supplier.taxId,
    },
    payer: migrateQuoteOwnerClient(o.payer),
    remarkLines: migrateRemarkLines(o.remarkLines),
    rows: ensureStableRowIds(rows),
  }
}

function migrateRemarkLines(raw: unknown): { id: string; text: string }[] {
  if (!Array.isArray(raw)) return initialPricingWorkspace().remarkLines
  const tmp: { id: string; text: string }[] = []
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i]
    if (!r || typeof r !== 'object') continue
    const x = r as Record<string, unknown>
    const text = str(x.text)
    const idRaw = str(x.id).trim()
    const base = `prc-rmk--${stableHash16(`migrate\0${i}\0${text}`)}`
    tmp.push({ id: idRaw || base, text })
  }
  const used = new Set<string>()
  return tmp.map((x) => {
    const id = allocateWithSuffix(x.id, used)
    used.add(id)
    return { ...x, id }
  })
}

export function createPricingRow(seedSite: string, existing: readonly PricingRow[]): PricingRow {
  const base = `prc-row--${stableHash16(`new\u0000${seedSite.trim()}\u0000${existing.map((x) => x.id).join('\n')}`)}`
  const id = allocateWithSuffix(base, new Set(existing.map((x) => x.id)))
  return {
    id,
    contractLineId: '',
    buildingLabel: '',
    floorLabel: '',
    phaseLabel: '',
    item: '',
    amountNet: 0,
    tax: 0,
    total: 0,
    note: '',
  }
}

export function createPricingRemarkLine(
  seedSite: string,
  existing: readonly { id: string }[],
): { id: string; text: string } {
  const base = `prc-rmk--${stableHash16(`new\0${seedSite.trim()}\0${existing.map((x) => x.id).join('\n')}`)}`
  const id = allocateWithSuffix(base, new Set(existing.map((x) => x.id)))
  return { id, text: '' }
}

export function pricingRowNormalizedTotal(row: Pick<PricingRow, 'amountNet' | 'tax' | 'total'>): number {
  const total = safeNum(row.total)
  if (total !== 0) return total
  return safeNum(row.amountNet) + safeNum(row.tax)
}

export function mergePricingWorkspacePreferLocal(
  local: PricingWorkspaceState,
  remote: PricingWorkspaceState,
): PricingWorkspaceState {
  const l = migratePricingWorkspace(local)
  const r = migratePricingWorkspace(remote)
  const byId = new Map<string, PricingRow>()
  for (const x of r.rows) byId.set(x.id, x)
  for (const x of l.rows) byId.set(x.id, x)
  return {
    sheetTitle: l.sheetTitle || r.sheetTitle,
    pricingNumber: l.pricingNumber || r.pricingNumber,
    pricingDate: l.pricingDate || r.pricingDate,
    siteName: l.siteName || r.siteName,
    remittance: { ...r.remittance, ...l.remittance },
    supplier: { ...r.supplier, ...l.supplier },
    payer: { ...r.payer, ...l.payer },
    remarkLines: (() => {
      const byId = new Map<string, { id: string; text: string }>()
      for (const x of r.remarkLines) byId.set(x.id, x)
      for (const x of l.remarkLines) byId.set(x.id, x)
      return [...byId.values()]
    })(),
    rows: ensureStableRowIds([...byId.values()].map(normalizeRow)),
  }
}

