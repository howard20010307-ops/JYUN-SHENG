import { allocateWithSuffix, stableHash16 } from './stableIds'

export type PricingRow = {
  id: string
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
  pricingDate: string
  siteName: string
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
  return {
    sheetTitle: '計價單',
    pricingDate: '',
    siteName: '',
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
  return {
    sheetTitle: str(o.sheetTitle).trim() || init.sheetTitle,
    pricingDate: str(o.pricingDate).trim(),
    siteName: str(o.siteName).trim(),
    rows: ensureStableRowIds(rows),
  }
}

export function createPricingRow(seedSite: string, existing: readonly PricingRow[]): PricingRow {
  const base = `prc-row--${stableHash16(`new\u0000${seedSite.trim()}\u0000${existing.map((x) => x.id).join('\n')}`)}`
  const id = allocateWithSuffix(base, new Set(existing.map((x) => x.id)))
  return {
    id,
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
    pricingDate: l.pricingDate || r.pricingDate,
    siteName: l.siteName || r.siteName,
    rows: ensureStableRowIds([...byId.values()].map(normalizeRow)),
  }
}

