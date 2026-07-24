/**
 * 工程合約書（對外文件之一）
 */
import { COMPANY_CONTRACTOR } from './companyContact'
import { EXCEL_STAGE } from './quoteExcelCanonical'
import { m2ToPing, type QuoteSite } from './quoteEngine'
import { allocateWithSuffix, stableHash16 } from './stableIds'
import {
  appendTombstone,
  applyTombstonesById,
  mergeTombstones,
  normalizeTombstones,
  type Tombstone,
} from './tombstones'

export type ContractParty = {
  companyName: string
  taxId: string
  responsiblePerson: string
  contactName: string
  phone: string
  address: string
}

export type ContractFloorPriceLine = {
  id: string
  buildingLabel: string
  floorLabel: string
  ping: number
}

export type ContractWorkspaceState = {
  contractNumber: string
  coverWorkLocation: string
  coverWorkItem: string
  coverContractorPhone: string
  projectName: string
  siteLocation: string
  workScope: string
  unitPricePerPing: number
  paymentAssessDays: string
  paymentPayDays: string
  penaltyPerDay: string
  toleranceMm: string
  tolerancePointCount: string
  terminationNoticeMonths: string
  partyA: ContractParty
  partyB: ContractParty
  partyASignRocYear: string
  partyASignRocMonth: string
  partyASignRocDay: string
  partyBSignRocYear: string
  partyBSignRocMonth: string
  partyBSignRocDay: string
  floorPriceLines: ContractFloorPriceLine[]
  deletedFloorLineIds?: Tombstone[]
}

export const DEFAULT_CONTRACT_WORK_SCOPE = `本工程為澆置樓版後放樣工程，工作內容包括基準線、柱位、梁位、牆位及門窗開口之放樣作業。乙方應於各樓層澆置前七日提供放樣圖面予甲方。`

export const CONTRACT_FIXED_PRICE_CLAUSE =
  '本合約單價為固定價格，不因匯率、通膨、原物料價格上漲或人工費用波動等因素而調整。前述單價已包含乙方為完成本工程所需之人工、材料、機具設備、運輸、管理及相關費用。'

function safeNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v)
    if (Number.isFinite(n)) return n
  }
  return 0
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function emptyParty(): ContractParty {
  return {
    companyName: '',
    taxId: '',
    responsiblePerson: '',
    contactName: '',
    phone: '',
    address: '',
  }
}

function defaultPartyB(): ContractParty {
  return {
    companyName: COMPANY_CONTRACTOR.name,
    taxId: COMPANY_CONTRACTOR.taxId,
    responsiblePerson: COMPANY_CONTRACTOR.responsiblePerson,
    contactName: COMPANY_CONTRACTOR.name,
    phone: COMPANY_CONTRACTOR.phone,
    address: COMPANY_CONTRACTOR.address,
  }
}

export function contractFloorLineSubtotalNet(
  line: Pick<ContractFloorPriceLine, 'ping'>,
  unitPricePerPing: number,
): number {
  return Math.round(line.ping * unitPricePerPing)
}

export function contractFloorPriceTotals(
  lines: readonly ContractFloorPriceLine[],
  unitPricePerPing: number,
): { totalPing: number; totalNet: number } {
  let totalPing = 0
  let totalNet = 0
  for (const line of lines) {
    totalPing += line.ping
    totalNet += contractFloorLineSubtotalNet(line, unitPricePerPing)
  }
  return { totalPing, totalNet }
}

export function formatContractMoney(n: number): string {
  return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })
}

function floorLineFingerprint(line: Omit<ContractFloorPriceLine, 'id'>): string {
  return [line.buildingLabel.trim(), line.floorLabel.trim(), String(line.ping)].join('\u001f')
}

function normalizeFloorLine(line: ContractFloorPriceLine): ContractFloorPriceLine {
  return {
    ...line,
    buildingLabel: line.buildingLabel.trim(),
    floorLabel: line.floorLabel.trim(),
    ping: safeNum(line.ping),
  }
}

function ensureStableFloorLineIds(lines: ContractFloorPriceLine[]): ContractFloorPriceLine[] {
  const seen = new Set<string>()
  return lines.map((line, i) => {
    const norm = normalizeFloorLine(line)
    let id = norm.id.trim()
    if (!id) {
      id = `cws-fl--${stableHash16(`${i}\u0000${floorLineFingerprint(norm)}`)}`
    }
    id = allocateWithSuffix(id, seen)
    seen.add(id)
    return { ...norm, id }
  })
}

function migrateFloorLines(raw: unknown): ContractFloorPriceLine[] {
  if (!Array.isArray(raw)) return []
  const tmp: ContractFloorPriceLine[] = []
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i]
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const floorLabel = str(o.floorLabel)
    if (!floorLabel) continue
    tmp.push({
      id: str(o.id),
      buildingLabel: str(o.buildingLabel),
      floorLabel,
      ping: safeNum(o.ping),
    })
  }
  return ensureStableFloorLineIds(tmp)
}

function party(raw: unknown): ContractParty {
  if (!raw || typeof raw !== 'object') return emptyParty()
  const o = raw as Record<string, unknown>
  const responsiblePerson = str(o.responsiblePerson)
  return {
    companyName: str(o.companyName),
    taxId: str(o.taxId),
    responsiblePerson,
    contactName: str(o.contactName) || responsiblePerson,
    phone: str(o.phone),
    address: str(o.address),
  }
}

export function initialContractWorkspace(): ContractWorkspaceState {
  return {
    contractNumber: '',
    coverWorkLocation: '',
    coverWorkItem: '放樣工程',
    coverContractorPhone: COMPANY_CONTRACTOR.phone,
    projectName: '',
    siteLocation: '',
    workScope: DEFAULT_CONTRACT_WORK_SCOPE,
    unitPricePerPing: 125,
    paymentAssessDays: '5、20',
    paymentPayDays: '11、26',
    penaltyPerDay: '',
    toleranceMm: '3',
    tolerancePointCount: '10',
    terminationNoticeMonths: '1.5',
    partyA: emptyParty(),
    partyB: defaultPartyB(),
    partyASignRocYear: '',
    partyASignRocMonth: '',
    partyASignRocDay: '',
    partyBSignRocYear: '',
    partyBSignRocMonth: '',
    partyBSignRocDay: '',
    floorPriceLines: [],
    deletedFloorLineIds: [],
  }
}

export function migrateContractWorkspace(raw: unknown): ContractWorkspaceState {
  const init = initialContractWorkspace()
  if (!raw || typeof raw !== 'object') return init
  const o = raw as Record<string, unknown>
  const pb = party(o.partyB)
  const deletedFloorLineIds = normalizeTombstones(o.deletedFloorLineIds)
  const floorPriceLines = applyTombstonesById(
    migrateFloorLines(o.floorPriceLines),
    deletedFloorLineIds,
  )
  return {
    ...init,
    contractNumber: str(o.contractNumber),
    coverWorkLocation: str(o.coverWorkLocation),
    coverWorkItem: str(o.coverWorkItem) || init.coverWorkItem,
    coverContractorPhone: str(o.coverContractorPhone) || init.coverContractorPhone,
    projectName: str(o.projectName),
    siteLocation: str(o.siteLocation),
    workScope: str(o.workScope) || init.workScope,
    unitPricePerPing: safeNum(o.unitPricePerPing) || init.unitPricePerPing,
    paymentAssessDays: str(o.paymentAssessDays) || init.paymentAssessDays,
    paymentPayDays: str(o.paymentPayDays) || init.paymentPayDays,
    penaltyPerDay: str(o.penaltyPerDay),
    toleranceMm: str(o.toleranceMm) || init.toleranceMm,
    tolerancePointCount: str(o.tolerancePointCount) || init.tolerancePointCount,
    terminationNoticeMonths: str(o.terminationNoticeMonths) || init.terminationNoticeMonths,
    partyA: party(o.partyA),
    partyB: (() => {
      const base = pb.companyName.trim() !== '' ? pb : init.partyB
      return {
        ...base,
        responsiblePerson: base.responsiblePerson.trim() || COMPANY_CONTRACTOR.responsiblePerson,
        contactName: base.contactName.trim() || base.companyName || COMPANY_CONTRACTOR.name,
      }
    })(),
    partyASignRocYear: str(o.partyASignRocYear),
    partyASignRocMonth: str(o.partyASignRocMonth),
    partyASignRocDay: str(o.partyASignRocDay),
    partyBSignRocYear: str(o.partyBSignRocYear),
    partyBSignRocMonth: str(o.partyBSignRocMonth),
    partyBSignRocDay: str(o.partyBSignRocDay),
    floorPriceLines,
    deletedFloorLineIds: deletedFloorLineIds.length > 0 ? deletedFloorLineIds : [],
  }
}

export function mergeContractWorkspacePreferLocal(
  local: ContractWorkspaceState,
  remote: ContractWorkspaceState,
): ContractWorkspaceState {
  const l = migrateContractWorkspace(local)
  const r = migrateContractWorkspace(remote)
  const deletedFloorLineIds = mergeTombstones(l.deletedFloorLineIds, r.deletedFloorLineIds)
  const dead = new Set(deletedFloorLineIds.map((t) => t.id))
  const byId = new Map<string, ContractFloorPriceLine>()
  for (const x of r.floorPriceLines) if (!dead.has(x.id)) byId.set(x.id, x)
  for (const x of l.floorPriceLines) if (!dead.has(x.id)) byId.set(x.id, x)
  return migrateContractWorkspace({
    ...r,
    ...l,
    partyA: { ...r.partyA, ...l.partyA },
    partyB: { ...r.partyB, ...l.partyB },
    floorPriceLines: ensureStableFloorLineIds([...byId.values()]),
    deletedFloorLineIds,
  })
}

export function tombstoneContractFloorLineId(
  state: ContractWorkspaceState,
  id: string,
  deletedAt: number = Date.now(),
): Tombstone[] {
  const t = id.trim()
  if (!t) return state.deletedFloorLineIds ?? []
  return appendTombstone(state.deletedFloorLineIds, t, deletedAt)
}

export function createContractFloorPriceLine(
  state: ContractWorkspaceState,
  partial?: Partial<Omit<ContractFloorPriceLine, 'id'>>,
): ContractFloorPriceLine {
  const buildingLabel = partial?.buildingLabel ?? ''
  const floorLabel = partial?.floorLabel ?? ''
  const ping = partial?.ping ?? 0
  const seed = `new\0${state.projectName}\0${state.floorPriceLines.map((x) => x.id).join('\n')}\0${buildingLabel}\0${floorLabel}\0${ping}`
  const base = `cws-fl--${stableHash16(seed)}`
  const id = allocateWithSuffix(base, new Set(state.floorPriceLines.map((x) => x.id)))
  return { id, buildingLabel, floorLabel, ping }
}

/** 自放樣估價案場樓層面積帶入坪數（排除「基礎工程」）。 */
export function floorPriceLinesFromQuoteSite(site: QuoteSite): ContractFloorPriceLine[] {
  const seen = new Set<string>()
  const lines: ContractFloorPriceLine[] = []
  for (const floor of site.floors) {
    if (floor.name.trim() === EXCEL_STAGE.foundation) continue
    if (safeNum(floor.m2) <= 0) continue
    const floorLabel = floor.name.trim()
    const ping = Math.round(m2ToPing(floor.m2) * 10000) / 10000
    const fp = floorLineFingerprint({ buildingLabel: '', floorLabel, ping })
    const base = `cws-fl--${stableHash16(`quote\0${site.name}\0${fp}`)}`
    const id = allocateWithSuffix(base, seen)
    seen.add(id)
    lines.push({ id, buildingLabel: '', floorLabel, ping })
  }
  return lines
}
