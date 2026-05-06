import { allocateWithSuffix, stableHash16 } from './stableIds'
import { collapseSiteDimensionWhitespace } from './siteDimensionLabels'
import { normalizePhasePeriodLabel } from './receivablePhaseRange'

export type ContractContentLine = {
  id: string
  siteName: string
  buildingLabel: string
  floorLabel: string
  phaseLabel: string
  pricingMode: 'fixedQuantity' | 'manualWorkDays'
  unit: string
  contractUnitPrice: number
  contractQuantity: number
  manualWorkDays: number
  note: string
}

export type ContractContentState = {
  lines: ContractContentLine[]
  /** 案場級合約總價（未稅）目標值；key 為 siteName.trim() */
  siteTotalNetBySite: Record<string, number>
}

function safeNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v)
    if (Number.isFinite(n)) return n
  }
  return 0
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function contractLineFingerprintCore(line: Omit<ContractContentLine, 'id'>): string {
  return [
    line.siteName.trim(),
    collapseSiteDimensionWhitespace(line.buildingLabel),
    collapseSiteDimensionWhitespace(line.floorLabel),
    normalizePhasePeriodLabel(collapseSiteDimensionWhitespace(line.phaseLabel)),
    line.pricingMode,
    line.unit.trim(),
    String(line.contractUnitPrice),
    String(line.contractQuantity),
    String(line.manualWorkDays),
    line.note.trim(),
  ].join('\u001f')
}

function normalizeLine(line: ContractContentLine): ContractContentLine {
  return {
    ...line,
    siteName: line.siteName.trim(),
    buildingLabel: collapseSiteDimensionWhitespace(line.buildingLabel),
    floorLabel: collapseSiteDimensionWhitespace(line.floorLabel),
    phaseLabel: normalizePhasePeriodLabel(collapseSiteDimensionWhitespace(line.phaseLabel)),
    pricingMode: line.pricingMode === 'manualWorkDays' ? 'manualWorkDays' : 'fixedQuantity',
    unit: line.unit.trim(),
    note: line.note.trim(),
    contractUnitPrice: safeNum(line.contractUnitPrice),
    contractQuantity: safeNum(line.contractQuantity),
    manualWorkDays: safeNum(line.manualWorkDays),
  }
}

function ensureStableIds(lines: ContractContentLine[]): ContractContentLine[] {
  const used = new Set<string>()
  return lines.map((line, i) => {
    const core = contractLineFingerprintCore({
      siteName: line.siteName,
      buildingLabel: line.buildingLabel,
      floorLabel: line.floorLabel,
      phaseLabel: line.phaseLabel,
      pricingMode: line.pricingMode,
      unit: line.unit,
      contractUnitPrice: line.contractUnitPrice,
      contractQuantity: line.contractQuantity,
      manualWorkDays: line.manualWorkDays,
      note: line.note,
    })
    const base = `ctc-line--${stableHash16(`${i}\u0000${core}`)}`
    const id = line.id.trim() !== '' ? allocateWithSuffix(line.id.trim(), used) : allocateWithSuffix(base, used)
    used.add(id)
    return { ...line, id }
  })
}

export function initialContractContentState(): ContractContentState {
  return { lines: [], siteTotalNetBySite: {} }
}

export function migrateContractContentState(raw: unknown): ContractContentState {
  if (!raw || typeof raw !== 'object') return initialContractContentState()
  const o = raw as { lines?: unknown; siteTotalNetBySite?: unknown }
  if (!Array.isArray(o.lines)) {
    const bySite = migrateSiteTotalNetBySite(o.siteTotalNetBySite)
    return { lines: [], siteTotalNetBySite: bySite }
  }
  const tmp: ContractContentLine[] = []
  for (let i = 0; i < o.lines.length; i++) {
    const r = o.lines[i]
    if (!r || typeof r !== 'object') continue
    const x = r as Record<string, unknown>
    tmp.push(
      normalizeLine({
        id: str(x.id),
        siteName: str(x.siteName),
        buildingLabel: str(x.buildingLabel),
        floorLabel: str(x.floorLabel),
        phaseLabel: str(x.phaseLabel),
        pricingMode: x.pricingMode === 'manualWorkDays' ? 'manualWorkDays' : 'fixedQuantity',
        unit: str(x.unit),
        contractUnitPrice: safeNum(x.contractUnitPrice),
        contractQuantity: safeNum(x.contractQuantity),
        manualWorkDays: safeNum(x.manualWorkDays),
        note: str(x.note),
      }),
    )
  }
  const bySite = migrateSiteTotalNetBySite(o.siteTotalNetBySite)
  return { lines: ensureStableIds(tmp), siteTotalNetBySite: bySite }
}

function migrateSiteTotalNetBySite(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = k.trim()
    if (!key) continue
    out[key] = safeNum(v)
  }
  return out
}

export function createContractContentLine(
  seedSiteName: string,
  existing: readonly ContractContentLine[],
): ContractContentLine {
  const base = `ctc-line--${stableHash16(
    `new\u0000${seedSiteName.trim()}\u0000${existing.map((x) => x.id).join('\n')}`,
  )}`
  const id = allocateWithSuffix(base, new Set(existing.map((x) => x.id)))
  return {
    id,
    siteName: seedSiteName.trim(),
    buildingLabel: '',
    floorLabel: '',
    phaseLabel: '',
    pricingMode: 'fixedQuantity',
    unit: '式',
    contractUnitPrice: 0,
    contractQuantity: 0,
    manualWorkDays: 0,
    note: '',
  }
}

/** 計算合約該列「未稅金額」時使用的數量：固定數量或手填工數。 */
export function contractQuantityForAmount(
  line: Pick<ContractContentLine, 'pricingMode' | 'contractQuantity' | 'manualWorkDays'>,
): number {
  return line.pricingMode === 'manualWorkDays' ? safeNum(line.manualWorkDays) : safeNum(line.contractQuantity)
}

export function contractAmountOf(
  line: Pick<ContractContentLine, 'pricingMode' | 'contractUnitPrice' | 'contractQuantity' | 'manualWorkDays'>,
): number {
  return Math.round(safeNum(line.contractUnitPrice) * contractQuantityForAmount(line))
}

/** 計價常用：總價＝未稅小計加稅金；此處為整數時點 = round(未稅×1.05)，稅＝總價−未稅（合約列含稅總額對應）。 */
export function taiwanGrossInclusiveFivePercentRoundedFromNet(net: number): number {
  const n = Math.round(safeNum(net))
  return Math.round(n * 1.05)
}

/** 對應 `taiwanGrossInclusiveFivePercentRoundedFromNet`，稅 = 總價含稅(整數) − 未稅小計。 */
export function taiwanVatFivePercentTaxFromRoundedGross(net: number): number {
  const n = Math.round(safeNum(net))
  return taiwanGrossInclusiveFivePercentRoundedFromNet(n) - n
}

/** 鍵級聯集：同 id 本機優先，避免手輸合約內容被雲端覆蓋。 */
export function mergeContractContentPreferLocal(
  local: ContractContentState,
  remote: ContractContentState,
): ContractContentState {
  const l = migrateContractContentState(local)
  const r = migrateContractContentState(remote)
  const byId = new Map<string, ContractContentLine>()
  for (const x of r.lines) byId.set(x.id, x)
  for (const x of l.lines) byId.set(x.id, x)
  const siteTotalNetBySite: Record<string, number> = { ...r.siteTotalNetBySite, ...l.siteTotalNetBySite }
  return { lines: ensureStableIds([...byId.values()].map(normalizeLine)), siteTotalNetBySite }
}

