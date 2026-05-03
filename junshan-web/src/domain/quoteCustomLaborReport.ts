/**
 * 工作明細（對外文件）自填列：與成本估算列無連動，供逐項說明品項與數量等。
 * 欄位對齊常用估價表格（項次／品名／類別／數量／單位／備註），不含單價與稅額等金額欄。
 */
import { allocateWithSuffix, stableHash16 } from './stableIds'

export type CustomLaborReportLineId = string

export type CustomLaborReportLine = {
  id: CustomLaborReportLineId
  /** 品名 */
  item: string
  /** 類別 */
  category: string
  /** 數量 */
  quantity: number
  /** 單位 */
  unit: string
  /** 備註 */
  remarks: string
}

function safeNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v)
    if (Number.isFinite(n)) return n
  }
  return 0
}

function syncLine(raw: Record<string, unknown>): CustomLaborReportLine {
  const id = typeof raw.id === 'string' ? raw.id : ''
  const item = typeof raw.item === 'string' ? raw.item : ''
  const category =
    typeof raw.category === 'string'
      ? raw.category
      : typeof raw.zoneLabel === 'string'
        ? raw.zoneLabel
        : ''
  const quantity =
    typeof raw.quantity === 'number' ||
    (typeof raw.quantity === 'string' && raw.quantity.trim() !== '')
      ? safeNum(raw.quantity)
      : safeNum(raw.laborDays)
  const unit = typeof raw.unit === 'string' ? raw.unit : ''
  const remarks = typeof raw.remarks === 'string' ? raw.remarks : ''
  return {
    id,
    item,
    category,
    quantity,
    unit,
    remarks,
  }
}

/** 載入舊存檔時補齊 id、去重 */
export function migrateCustomLaborReportLines(raw: unknown): CustomLaborReportLine[] {
  if (!Array.isArray(raw)) return []
  const tmp: CustomLaborReportLine[] = []
  for (let i = 0; i < raw.length; i++) {
    const e = raw[i]
    if (!e || typeof e !== 'object') continue
    const o = e as Record<string, unknown>
    const item = typeof o.item === 'string' ? o.item : ''
    const zoneOrCat =
      typeof o.category === 'string'
        ? o.category
        : typeof o.zoneLabel === 'string'
          ? o.zoneLabel
          : ''
    const id =
      typeof o.id === 'string' && o.id.trim() !== ''
        ? o.id
        : `clr--${stableHash16(`migrate\0customLabor\0${i}\0${zoneOrCat}\0${item}`)}`
    tmp.push(
      syncLine({
        ...(o as Record<string, unknown>),
        id,
        item,
      }),
    )
  }
  const seen = new Set<string>()
  return tmp.map((l, i) => {
    if (!seen.has(l.id)) {
      seen.add(l.id)
      return l
    }
    const base = `clr--${stableHash16(`dedupe\0${i}\0${l.id}\0${l.item}`)}`
    const id = allocateWithSuffix(base, seen)
    seen.add(id)
    return { ...l, id }
  })
}

export function newCustomLaborReportLineId(
  siteName: string,
  existing: readonly CustomLaborReportLine[],
): string {
  const seed = `customLabor\0${siteName}\0${existing.map((l) => l.id).join('\n')}\0new`
  const base = `clr--${stableHash16(seed)}`
  return allocateWithSuffix(base, new Set(existing.map((l) => l.id)))
}

export function createCustomLaborReportLine(
  siteName: string,
  existing: readonly CustomLaborReportLine[],
): CustomLaborReportLine {
  return {
    id: newCustomLaborReportLineId(siteName, existing),
    item: '',
    category: '',
    quantity: 0,
    unit: '',
    remarks: '',
  }
}
