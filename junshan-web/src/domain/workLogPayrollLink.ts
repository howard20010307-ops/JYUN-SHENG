/**
 * 整日工作日誌與薪水月表連動：案場／人員／餐費以月表為骨架，已存日誌僅覆寫文字與上下班時間等。
 */

import type { SalaryBook } from './salaryExcelModel'
import { QUICK_SITE_JUN_ADJUST, QUICK_SITE_TSAI_ADJUST } from './fieldworkQuickApply'
import {
  buildPayrollDaySnapshot,
  payrollStaffMealForFormSite,
  prefillFromPayrollDaySnapshot,
  type PayrollDaySnapshot,
} from './payrollDayForWorkLog'
import {
  DEFAULT_WORK_END,
  DEFAULT_WORK_START,
  emptyInstrumentQty,
  entriesForDate,
  formatInstrumentQty,
  getDayDocument,
  instrumentExpenseFromSiteBlocks,
  instrumentQtyAnyPositive,
  legacyEntriesToDayDocument,
  newSiteBlock,
  newWorkLogEntityId,
  newWorkLogSiteWorkLine,
  nowIso,
  parseInstrumentQtyFromDraftStrings,
  parseLegacyEquipmentString,
  replaceDayDocument,
  type WorkLogDayDocument,
  type WorkLogDayToolLine,
  type WorkLogSiteBlock,
  type WorkLogSiteInstrumentQty,
  type WorkLogState,
} from './workLogModel'

export type LinkedDayStaffLineDraft = {
  name: string
  timeStart: string
  timeEnd: string
}

export type LinkedDayWorkLineDraft = {
  id: string
  label: string
}

export type LinkedDayBlockDraft = {
  id: string
  siteName: string
  workLines: LinkedDayWorkLineDraft[]
  /** 全站儀台數（空白＝0） */
  instrumentTotalStation: string
  /** 旋轉雷射台數 */
  instrumentRotatingLaser: string
  /** 墨線儀台數 */
  instrumentLineLaser: string
  /** 無法對應三種儀器時之補充（舊自由文字） */
  equipment: string
  remark: string
  /** 棟別 */
  dong: string
  /** 樓層 */
  floorLevel: string
  /** 階段 */
  workPhase: string
  staffLines: LinkedDayStaffLineDraft[]
}

function emptyWorkLineDraft(): LinkedDayWorkLineDraft {
  return { id: newWorkLogEntityId(), label: '' }
}

function workLinesDraftFromSiteBlock(b: WorkLogSiteBlock): LinkedDayWorkLineDraft[] {
  const raw =
    b.workLines && b.workLines.length > 0
      ? b.workLines
      : typeof b.workItem === 'string' && b.workItem.trim()
        ? [{ ...newWorkLogSiteWorkLine(), label: b.workItem.trim() }]
        : []
  if (raw.length === 0) return [emptyWorkLineDraft()]
  return raw.map((wl) => ({
    id: wl.id,
    label: wl.label,
  }))
}

function blockDraftHasWorkText(b: LinkedDayBlockDraft): boolean {
  return (b.workLines ?? []).some((wl) => wl.label.trim())
}

function blockDraftHasInstrument(b: LinkedDayBlockDraft): boolean {
  const q = parseInstrumentQtyFromDraftStrings(
    b.instrumentTotalStation,
    b.instrumentRotatingLaser,
    b.instrumentLineLaser,
  )
  return instrumentQtyAnyPositive(q) || b.equipment.trim().length > 0
}

function blockDraftHasSiteMeta(b: LinkedDayBlockDraft): boolean {
  return (
    (b.dong ?? '').trim().length > 0 ||
    (b.floorLevel ?? '').trim().length > 0 ||
    (b.workPhase ?? '').trim().length > 0
  )
}

function linkedInstrumentFieldsFromSiteBlock(
  b: WorkLogSiteBlock,
): Pick<
  LinkedDayBlockDraft,
  'instrumentTotalStation' | 'instrumentRotatingLaser' | 'instrumentLineLaser' | 'equipment'
> {
  const iq: WorkLogSiteInstrumentQty = b.instrumentQty ?? emptyInstrumentQty()
  const str = (n: number) => (n > 0 ? String(n) : '')
  if (instrumentQtyAnyPositive(iq)) {
    return {
      instrumentTotalStation: str(iq.totalStation),
      instrumentRotatingLaser: str(iq.rotatingLaser),
      instrumentLineLaser: str(iq.lineLaser),
      equipment: '',
    }
  }
  return {
    instrumentTotalStation: '',
    instrumentRotatingLaser: '',
    instrumentLineLaser: '',
    equipment: typeof b.equipment === 'string' ? b.equipment : '',
  }
}

function emptyLinkedInstrumentDraftFields(): Pick<
  LinkedDayBlockDraft,
  'instrumentTotalStation' | 'instrumentRotatingLaser' | 'instrumentLineLaser' | 'equipment'
> {
  return {
    instrumentTotalStation: '',
    instrumentRotatingLaser: '',
    instrumentLineLaser: '',
    equipment: '',
  }
}

export type LinkedDayToolLineDraft = {
  id: string
  name: string
  /** 數量（空白或非正數儲存時視為 1） */
  qty: string
  /** 單位（如：組、個） */
  unit: string
  amount: string
}

/** 與 {@link WorkLogPanel} 表單結構一致，供連動建檔／合併 */
export type LinkedDayDraft = {
  docId: string | null
  logDate: string
  mealCost: string
  miscCost: string
  instrumentCost: string
  /** 整日多筆工具（名稱、數量、單位、金額）；與 {@link WorkLogDayDocument.toolLines} 對應 */
  toolLines: LinkedDayToolLineDraft[]
  blocks: LinkedDayBlockDraft[]
}

function siteKey(s: string): string {
  return s.trim()
}

function orderStaffNamesForLinkedForm(
  staffOptionsOrdered: readonly string[],
  names: readonly string[],
): string[] {
  const set = new Set(names.map((n) => n.trim()).filter(Boolean))
  return [
    ...staffOptionsOrdered.filter((n) => set.has(n)),
    ...[...set]
      .filter((n) => !staffOptionsOrdered.includes(n))
      .sort((a, b) => a.localeCompare(b, 'zh-Hant')),
  ]
}

function skeletonHasSiteKey(blocks: readonly LinkedDayBlockDraft[], site: string): boolean {
  const k = siteKey(site)
  return blocks.some((b) => siteKey(b.siteName) === k)
}

function staffLinesFromOrderedNames(
  names: readonly string[],
  staffOptionsOrdered: readonly string[],
): LinkedDayStaffLineDraft[] {
  const ordered = orderStaffNamesForLinkedForm(staffOptionsOrdered, [...names])
  if (ordered.length === 0)
    return [{ name: '', timeStart: DEFAULT_WORK_START, timeEnd: DEFAULT_WORK_END }]
  return ordered.map((name) => ({
    name,
    timeStart: DEFAULT_WORK_START,
    timeEnd: DEFAULT_WORK_END,
  }))
}

/** 月表「調工支援／蔡董調工」列有資料時，另立區塊（勿併入一般格線案場，以免誤標案場）。 */
function appendAdjustColumnSkeletonBlocks(
  snap: PayrollDaySnapshot,
  blocks: LinkedDayBlockDraft[],
  staffOptionsOrdered: readonly string[],
): void {
  if (!skeletonHasSiteKey(blocks, QUICK_SITE_JUN_ADJUST)) {
    const jun = payrollStaffMealForFormSite(snap, QUICK_SITE_JUN_ADJUST)
    if (jun && jun.staffNames.length > 0) {
      blocks.push({
        id: newWorkLogEntityId(),
        siteName: QUICK_SITE_JUN_ADJUST,
        workLines: [emptyWorkLineDraft()],
        ...emptyLinkedInstrumentDraftFields(),
        remark: '',
        dong: '',
        floorLevel: '',
        workPhase: '',
        staffLines: staffLinesFromOrderedNames(jun.staffNames, staffOptionsOrdered),
      })
    }
  }
  if (!skeletonHasSiteKey(blocks, QUICK_SITE_TSAI_ADJUST)) {
    const tsai = payrollStaffMealForFormSite(snap, QUICK_SITE_TSAI_ADJUST)
    if (tsai && tsai.staffNames.length > 0) {
      blocks.push({
        id: newWorkLogEntityId(),
        siteName: QUICK_SITE_TSAI_ADJUST,
        workLines: [emptyWorkLineDraft()],
        ...emptyLinkedInstrumentDraftFields(),
        remark: '',
        dong: '',
        floorLevel: '',
        workPhase: '',
        staffLines: staffLinesFromOrderedNames(tsai.staffNames, staffOptionsOrdered),
      })
    }
  }
}

function payrollSnapshotToSkeleton(
  snap: PayrollDaySnapshot,
  ymdStr: string,
  staffOptionsOrdered: readonly string[],
): { mealCost: string; blocks: LinkedDayBlockDraft[]; logDate: string } {
  const activeBlocks = snap.blocks.filter(
    (b) => b.workers.length > 0 || (b.mealAmount ?? 0) !== 0,
  )

  if (activeBlocks.length > 0) {
    let mealSum = 0
    const blocks: LinkedDayBlockDraft[] = []
    for (const b of activeBlocks) {
      mealSum += b.mealAmount ?? 0
      const rawNames = b.workers.map((w) => w.name)
      const names = orderStaffNamesForLinkedForm(staffOptionsOrdered, rawNames)
      const staffLines: LinkedDayStaffLineDraft[] =
        names.length > 0
          ? names.map((name) => ({
              name,
              timeStart: DEFAULT_WORK_START,
              timeEnd: DEFAULT_WORK_END,
            }))
          : [{ name: '', timeStart: DEFAULT_WORK_START, timeEnd: DEFAULT_WORK_END }]
      blocks.push({
        id: newWorkLogEntityId(),
        siteName: b.siteName,
        workLines: [emptyWorkLineDraft()],
        ...emptyLinkedInstrumentDraftFields(),
        remark: '',
        dong: '',
        floorLevel: '',
        workPhase: '',
        staffLines,
      })
    }
    appendAdjustColumnSkeletonBlocks(snap, blocks, staffOptionsOrdered)
    return {
      logDate: ymdStr,
      mealCost: mealSum === 0 ? '' : String(mealSum),
      blocks,
    }
  }

  const p = prefillFromPayrollDaySnapshot(snap)
  const hasJunWork = snap.junAdjust.some((x) => x.value !== 0)
  const hasTsaiWork = snap.tsaiAdjust.some((x) => x.value !== 0)
  const junScoped = hasJunWork ? payrollStaffMealForFormSite(snap, QUICK_SITE_JUN_ADJUST) : null
  const tsaiScoped = hasTsaiWork ? payrollStaffMealForFormSite(snap, QUICK_SITE_TSAI_ADJUST) : null
  const adjustOnlyBlocks: LinkedDayBlockDraft[] = []
  if (junScoped && junScoped.staffNames.length > 0) {
    adjustOnlyBlocks.push({
      id: newWorkLogEntityId(),
      siteName: QUICK_SITE_JUN_ADJUST,
      workLines: [emptyWorkLineDraft()],
      ...emptyLinkedInstrumentDraftFields(),
      remark: '',
      dong: '',
      floorLevel: '',
      workPhase: '',
      staffLines: staffLinesFromOrderedNames(junScoped.staffNames, staffOptionsOrdered),
    })
  }
  if (tsaiScoped && tsaiScoped.staffNames.length > 0) {
    adjustOnlyBlocks.push({
      id: newWorkLogEntityId(),
      siteName: QUICK_SITE_TSAI_ADJUST,
      workLines: [emptyWorkLineDraft()],
      ...emptyLinkedInstrumentDraftFields(),
      remark: '',
      dong: '',
      floorLevel: '',
      workPhase: '',
      staffLines: staffLinesFromOrderedNames(tsaiScoped.staffNames, staffOptionsOrdered),
    })
  }
  if (adjustOnlyBlocks.length > 0) {
    return {
      logDate: ymdStr,
      mealCost: p.mealCost === 0 ? '' : String(p.mealCost),
      blocks: adjustOnlyBlocks,
    }
  }

  const names = orderStaffNamesForLinkedForm(staffOptionsOrdered, p.staffNames)
  const staffLines: LinkedDayStaffLineDraft[] =
    names.length > 0
      ? names.map((name) => ({
          name,
          timeStart: DEFAULT_WORK_START,
          timeEnd: DEFAULT_WORK_END,
        }))
      : [{ name: '', timeStart: DEFAULT_WORK_START, timeEnd: DEFAULT_WORK_END }]
  return {
    logDate: ymdStr,
    mealCost: p.mealCost === 0 ? '' : String(p.mealCost),
    blocks: [
      {
        id: newWorkLogEntityId(),
        siteName: p.siteName,
        workLines: [emptyWorkLineDraft()],
        ...emptyLinkedInstrumentDraftFields(),
        remark: '',
        dong: '',
        floorLevel: '',
        workPhase: '',
        staffLines,
      },
    ],
  }
}

function linkedDayBlockDraftFromSiteBlock(b: WorkLogSiteBlock): LinkedDayBlockDraft {
  return {
    id: b.id,
    siteName: b.siteName,
    workLines: workLinesDraftFromSiteBlock(b),
    ...linkedInstrumentFieldsFromSiteBlock(b),
    remark: typeof b.remark === 'string' ? b.remark : '',
    dong: typeof b.dong === 'string' ? b.dong : '',
    floorLevel: typeof b.floorLevel === 'string' ? b.floorLevel : '',
    workPhase: typeof b.workPhase === 'string' ? b.workPhase : '',
    staffLines:
      b.staffLines.length > 0
        ? b.staffLines.map((l) => ({
            name: l.name,
            timeStart: l.timeStart,
            timeEnd: l.timeEnd,
          }))
        : [{ name: '', timeStart: DEFAULT_WORK_START, timeEnd: DEFAULT_WORK_END }],
  }
}

function documentToLinkedDraft(doc: WorkLogDayDocument): LinkedDayDraft {
  const blockSrc = doc.blocks?.length ? doc.blocks : [newSiteBlock()]
  const tl = ensureToolLinesDraftForForm(doc)
  const miscStr =
    Array.isArray(doc.toolLines) && doc.toolLines.length > 0
      ? ''
      : doc.miscCost === 0
        ? ''
        : String(doc.miscCost)
  return {
    docId: doc.id,
    logDate: doc.logDate,
    mealCost: doc.mealCost === 0 ? '' : String(doc.mealCost),
    miscCost: miscStr,
    instrumentCost: doc.instrumentCost === 0 ? '' : String(doc.instrumentCost),
    toolLines: tl,
    blocks: blockSrc.map((b) => linkedDayBlockDraftFromSiteBlock(b)),
  }
}

function mergePayrollSkeletonWithDayDocument(
  skeleton: { mealCost: string; blocks: LinkedDayBlockDraft[]; logDate: string },
  overlay: WorkLogDayDocument | null,
): LinkedDayDraft {
  if (!overlay) {
    return {
      docId: null,
      logDate: skeleton.logDate,
      mealCost: skeleton.mealCost,
      miscCost: '',
      instrumentCost: '',
      toolLines: [oneEmptyToolLineDraft()],
      blocks: skeleton.blocks.map((b) => ({
        ...b,
        workLines: [emptyWorkLineDraft()],
        ...emptyLinkedInstrumentDraftFields(),
        remark: '',
        dong: '',
        floorLevel: '',
        workPhase: '',
      })),
    }
  }

  const docBlocks = overlay.blocks?.length ? overlay.blocks : []
  const mergedBlocks = skeleton.blocks.map((sb) => {
    const ob = docBlocks.find((b) => siteKey(b.siteName) === siteKey(sb.siteName))
    const id = ob?.id ?? sb.id
    const staffLines = sb.staffLines.map((sl) => {
      if (!sl.name.trim()) return sl
      const line = ob?.staffLines.find((l) => l.name.trim() === sl.name.trim())
      if (line) return { name: sl.name, timeStart: line.timeStart, timeEnd: line.timeEnd }
      return sl
    })
    return {
      id,
      siteName: sb.siteName,
      workLines:
        ob && (ob.workLines?.length ?? 0) > 0
          ? ob.workLines.map((wl) => ({ ...wl }))
          : [emptyWorkLineDraft()],
      ...(ob ? linkedInstrumentFieldsFromSiteBlock(ob) : emptyLinkedInstrumentDraftFields()),
      remark: ob ? ob.remark : '',
      dong: ob ? (typeof ob.dong === 'string' ? ob.dong : '') : '',
      floorLevel: ob ? (typeof ob.floorLevel === 'string' ? ob.floorLevel : '') : '',
      workPhase: ob ? (typeof ob.workPhase === 'string' ? ob.workPhase : '') : '',
      staffLines,
    }
  })

  /** 月表骨架當日未列案場，但已存日誌有該區塊時須保留（否則表單重載會憑空消失） */
  const skeletonSiteKeys = new Set(skeleton.blocks.map((b) => siteKey(b.siteName)))
  const orphanBlocks: LinkedDayBlockDraft[] = []
  for (const ob of docBlocks) {
    if (skeletonSiteKeys.has(siteKey(ob.siteName))) continue
    orphanBlocks.push(linkedDayBlockDraftFromSiteBlock(ob))
  }
  const blocksOut = [...mergedBlocks, ...orphanBlocks]

  return {
    docId: overlay.id,
    logDate: skeleton.logDate,
    mealCost: skeleton.mealCost,
    miscCost:
      Array.isArray(overlay.toolLines) && overlay.toolLines.length > 0
        ? ''
        : overlay.miscCost === 0
          ? ''
          : String(overlay.miscCost),
    instrumentCost: overlay.instrumentCost === 0 ? '' : String(overlay.instrumentCost),
    toolLines: ensureToolLinesDraftForForm(overlay),
    blocks: blocksOut,
  }
}

const TIME_RE = /^(\d{1,2}):(\d{2})$/

function toHhmm24(s: string, fallback: string): string {
  const t = (s || fallback).trim()
  const m = TIME_RE.exec(t)
  if (!m) return fallback
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)))
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)))
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function parseMoney(s: string): number {
  const n = parseFloat(s.trim())
  return Number.isFinite(n) ? n : 0
}

function oneEmptyToolLineDraft(): LinkedDayToolLineDraft {
  return { id: newWorkLogEntityId(), name: '', qty: '', unit: '', amount: '' }
}

function parseToolLineQtyString(raw: string): number {
  const t = String(raw ?? '')
    .trim()
    .replace(/,/g, '')
  if (t === '') return 1
  const n = parseFloat(t)
  if (!Number.isFinite(n) || n <= 0) return 1
  return Math.min(1e6, n)
}

function documentToolLinesToDraft(doc: WorkLogDayDocument): LinkedDayToolLineDraft[] {
  const lines = doc.toolLines
  if (Array.isArray(lines) && lines.length > 0) {
    return lines.map((L) => ({
      id: L.id,
      name: typeof L.name === 'string' ? L.name : '',
      qty:
        typeof L.qty === 'number' && Number.isFinite(L.qty) && L.qty > 0 && L.qty !== 1
          ? String(L.qty)
          : '',
      unit: typeof L.unit === 'string' ? L.unit.trim() : '',
      amount: L.amount === 0 ? '' : String(L.amount),
    }))
  }
  if (typeof doc.miscCost === 'number' && Number.isFinite(doc.miscCost) && doc.miscCost !== 0) {
    return [{ id: newWorkLogEntityId(), name: '', qty: '', unit: '', amount: String(doc.miscCost) }]
  }
  return []
}

function ensureToolLinesDraftForForm(doc: WorkLogDayDocument): LinkedDayToolLineDraft[] {
  const t = documentToolLinesToDraft(doc)
  return t.length > 0 ? t : [oneEmptyToolLineDraft()]
}

function draftHasToolExpenseDraft(d: LinkedDayDraft): boolean {
  return (d.toolLines ?? []).some(
    (r) =>
      r.name.trim() ||
      parseMoney(r.amount) !== 0 ||
      (r.qty ?? '').trim() ||
      (r.unit ?? '').trim(),
  )
}

/** 表單 → 整日文件（與 WorkLogPanel 儲存邏輯一致） */
export function linkedDayDraftToDayDocument(
  d: LinkedDayDraft,
  existing?: WorkLogDayDocument | null,
): WorkLogDayDocument {
  const t = nowIso()
  let blocks: WorkLogSiteBlock[] = d.blocks
    .map((b) => {
      let workLines = (b.workLines ?? [])
        .map((wl) => ({
          id: (wl.id ?? '').trim() || newWorkLogEntityId(),
          label: wl.label.trim(),
        }))
        .filter((wl) => wl.label)
      if (workLines.length === 0) workLines = [newWorkLogSiteWorkLine()]
      const iq = parseInstrumentQtyFromDraftStrings(
        b.instrumentTotalStation,
        b.instrumentRotatingLaser,
        b.instrumentLineLaser,
      )
      const equipStr =
        instrumentQtyAnyPositive(iq) ? formatInstrumentQty(iq) : b.equipment.trim()
      return {
        id: b.id,
        siteName: b.siteName,
        workItem: '',
        workLines,
        equipment: equipStr,
        instrumentQty: iq,
        remark: b.remark.trim(),
        dong: (b.dong ?? '').trim(),
        floorLevel: (b.floorLevel ?? '').trim(),
        workPhase: (b.workPhase ?? '').trim(),
        staffLines: b.staffLines
          .filter((ln) => ln.name.trim())
          .map((ln) => ({
            name: ln.name.trim(),
            timeStart: toHhmm24(ln.timeStart, DEFAULT_WORK_START),
            timeEnd: toHhmm24(ln.timeEnd, DEFAULT_WORK_END),
          })),
      }
    })
    .filter((b) => b.staffLines.length > 0)
  const hasAnyBlockText = d.blocks.some(
    (b) =>
      blockDraftHasWorkText(b) ||
      blockDraftHasInstrument(b) ||
      b.remark.trim() ||
      blockDraftHasSiteMeta(b),
  )
  if (
    blocks.length === 0 &&
    (parseMoney(d.mealCost) !== 0 ||
      parseMoney(d.miscCost) !== 0 ||
      draftHasToolExpenseDraft(d) ||
      parseMoney(d.instrumentCost) !== 0 ||
      hasAnyBlockText)
  ) {
    const nb = newSiteBlock()
    blocks = [
      {
        id: nb.id,
        siteName: nb.siteName,
        workItem: '',
        workLines: nb.workLines.map((x) => ({ ...x })),
        equipment: nb.equipment,
        instrumentQty: nb.instrumentQty,
        remark: nb.remark,
        dong: nb.dong,
        floorLevel: nb.floorLevel,
        workPhase: nb.workPhase,
        staffLines: [...nb.staffLines],
      },
    ]
  }
  const parsedToolLines: WorkLogDayToolLine[] = []
  for (const row of d.toolLines ?? []) {
    const name = row.name.trim()
    const amount = parseMoney(row.amount)
    if (!name && amount === 0) continue
    parsedToolLines.push({
      id: (row.id ?? '').trim() || newWorkLogEntityId(),
      name,
      qty: parseToolLineQtyString(row.qty ?? ''),
      unit: (row.unit ?? '').trim(),
      amount,
    })
  }
  const toolSum = parsedToolLines.reduce((a, r) => a + r.amount, 0)
  const miscFromLegacyField = parseMoney(d.miscCost)
  const miscCostOut =
    parsedToolLines.length > 0 ? Math.round(toolSum) : Math.round(miscFromLegacyField)
  const toolLinesOut: WorkLogDayToolLine[] | undefined =
    parsedToolLines.length > 0 ? parsedToolLines : undefined

  const hasStructuredInstrument = blocks.some((b) =>
    instrumentQtyAnyPositive(b.instrumentQty ?? emptyInstrumentQty()),
  )
  const instrumentCostOut = hasStructuredInstrument
    ? instrumentExpenseFromSiteBlocks(blocks)
    : Math.round(parseMoney(d.instrumentCost))

  return {
    id: existing?.id ?? d.docId ?? newWorkLogEntityId(),
    logDate: d.logDate,
    workItem: '',
    equipment: '',
    mealCost: parseMoney(d.mealCost),
    miscCost: miscCostOut,
    toolLines: toolLinesOut,
    instrumentCost: instrumentCostOut,
    remark: '',
    blocks,
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
  }
}

export type QuickApplyTextOverlay = {
  /** 有值時只寫入該案場區塊；空白時寫入第一個區塊 */
  siteName?: string
  /** 單筆工作內容（僅改第一列）；若同時傳 {@link workItems} 則以 workItems 為準 */
  workItem?: string
  /** 多筆工作內容（取代該案場區塊之 workLines，每筆一列） */
  workItems?: string[]
  equipment?: string
  /** 與公司損益表本次餐費加帳一致，加至整日工作日誌「餐費」欄 */
  mealCost?: number
  miscCost?: number
  /** 追加至整日工具列；與 miscCost 二選一以本列為準 */
  toolLines?: { name: string; amount: number; qty?: number; unit?: string }[]
  /** 儀器支出（元）；整日表單與損益表「儀器」連動 */
  instrumentCost?: number
  timeStart?: string
  timeEnd?: string
  /** 寫入目標案場區塊：棟 */
  dong?: string
  /** 樓層 */
  floorLevel?: string
  /** 階段 */
  workPhase?: string
}

function baseToolLinesBeforeQuickApply(d: LinkedDayDraft): LinkedDayToolLineDraft[] {
  const rows = d.toolLines ?? []
  const hasMeaningful = rows.some(
    (r) =>
      r.name.trim() ||
      parseMoney(r.amount) !== 0 ||
      (r.qty ?? '').trim() ||
      (r.unit ?? '').trim(),
  )
  if (hasMeaningful) return [...rows]
  const legacy = parseMoney(d.miscCost)
  if (legacy !== 0) return [{ id: newWorkLogEntityId(), name: '', qty: '', unit: '', amount: String(legacy) }]
  return rows.length > 0 ? [...rows] : [oneEmptyToolLineDraft()]
}

function appendQuickToolLines(
  base: LinkedDayToolLineDraft[],
  q: QuickApplyTextOverlay,
): LinkedDayToolLineDraft[] {
  const out = [...base]
  const incoming =
    q.toolLines?.filter(
      (l) =>
        (typeof l.name === 'string' && l.name.trim()) ||
        (Number.isFinite(l.amount) && l.amount !== 0) ||
        (typeof l.unit === 'string' && l.unit.trim()) ||
        (typeof l.qty === 'number' && Number.isFinite(l.qty) && l.qty > 0 && l.qty !== 1),
    ) ?? []
  if (incoming.length > 0) {
    for (const l of incoming) {
      out.push({
        id: newWorkLogEntityId(),
        name: (l.name ?? '').trim(),
        qty:
          l.qty !== undefined && Number.isFinite(l.qty) && l.qty > 0 && l.qty !== 1
            ? String(l.qty)
            : '',
        unit: typeof l.unit === 'string' ? l.unit.trim() : '',
        amount: l.amount === 0 || !Number.isFinite(l.amount) ? '' : String(l.amount),
      })
    }
    return out
  }
  if (q.miscCost !== undefined && Number.isFinite(q.miscCost) && q.miscCost !== 0) {
    out.push({
      id: newWorkLogEntityId(),
      name: '',
      qty: '',
      unit: '',
      amount: String(q.miscCost),
    })
  }
  return out
}

function applyQuickTextOverlay(d: LinkedDayDraft, q: QuickApplyTextOverlay): LinkedDayDraft {
  const target = (q.siteName ?? '').trim()
  const applyIdx =
    target !== ''
      ? d.blocks.findIndex((b) => siteKey(b.siteName) === siteKey(target))
      : -1
  const indices =
    applyIdx >= 0 ? [applyIdx] : d.blocks.length > 0 ? [0] : []

  const hasQuickToolAppend =
    (Array.isArray(q.toolLines) &&
      q.toolLines.some(
        (l) =>
          (typeof l.name === 'string' && l.name.trim()) ||
          (Number.isFinite(l.amount) && l.amount !== 0) ||
          (typeof l.unit === 'string' && l.unit.trim()) ||
          (typeof l.qty === 'number' && Number.isFinite(l.qty) && l.qty > 0 && l.qty !== 1),
      )) ||
    (q.miscCost !== undefined && Number.isFinite(q.miscCost) && q.miscCost !== 0)

  const toolLinesAfter = hasQuickToolAppend
    ? appendQuickToolLines(baseToolLinesBeforeQuickApply(d), q)
    : d.toolLines?.length
      ? d.toolLines
      : [oneEmptyToolLineDraft()]
  const miscCostAfter = hasQuickToolAppend ? '' : d.miscCost

  const mealAdd =
    q.mealCost !== undefined && Number.isFinite(q.mealCost) ? q.mealCost : 0
  const mealCostStr =
    mealAdd === 0
      ? d.mealCost
      : (() => {
          const t = Math.round(parseMoney(d.mealCost) + mealAdd)
          return t === 0 ? '' : String(t)
        })()

  let out: LinkedDayDraft = {
    ...d,
    mealCost: mealCostStr,
    miscCost: miscCostAfter,
    toolLines: toolLinesAfter,
    instrumentCost:
      q.instrumentCost !== undefined
        ? q.instrumentCost === 0
          ? ''
          : String(q.instrumentCost)
        : d.instrumentCost,
    blocks: d.blocks.map((b, i) => {
      if (!indices.includes(i)) return b
      let next: LinkedDayBlockDraft = {
        ...b,
        workLines: (() => {
          if (q.workItems !== undefined) {
            const labels = q.workItems.map((x) => String(x).trim()).filter(Boolean)
            if (labels.length === 0) return b.workLines
            return labels.map((label) => ({ ...emptyWorkLineDraft(), label }))
          }
          if (q.workItem !== undefined) {
            const single = String(q.workItem).trim()
            return b.workLines?.length
              ? b.workLines.map((wl, j) => (j === 0 ? { ...wl, label: single } : wl))
              : [{ ...emptyWorkLineDraft(), label: single }]
          }
          return b.workLines
        })(),
      }
      if (q.equipment !== undefined) {
        const piq = parseLegacyEquipmentString(q.equipment)
        const has = instrumentQtyAnyPositive(piq)
        next = {
          ...next,
          instrumentTotalStation: has ? String(piq.totalStation) : '',
          instrumentRotatingLaser: has ? String(piq.rotatingLaser) : '',
          instrumentLineLaser: has ? String(piq.lineLaser) : '',
          equipment: has ? '' : q.equipment.trim(),
        }
      }
      if (q.dong !== undefined || q.floorLevel !== undefined || q.workPhase !== undefined) {
        next = {
          ...next,
          dong: q.dong !== undefined ? String(q.dong ?? '').trim() : next.dong,
          floorLevel: q.floorLevel !== undefined ? String(q.floorLevel ?? '').trim() : next.floorLevel,
          workPhase: q.workPhase !== undefined ? String(q.workPhase ?? '').trim() : next.workPhase,
        }
      }
      return next
    }),
  }
  if (q.timeStart && q.timeEnd) {
    const t0 = toHhmm24(q.timeStart, DEFAULT_WORK_START)
    const t1 = toHhmm24(q.timeEnd, DEFAULT_WORK_END)
    out = {
      ...out,
      blocks: out.blocks.map((b) => ({
        ...b,
        staffLines: b.staffLines.map((ln) =>
          ln.name.trim() ? { ...ln, timeStart: t0, timeEnd: t1 } : ln,
        ),
      })),
    }
  }
  return out
}

/**
 * 建整日表單：該日落在某月月表時，案場／人員／餐費一律自月表骨架帶入，並合併已存整日文件（文字、雜項、上下班）。
 * 該日不在任何月表時，維持僅讀已存文件或舊 entries 合併行為。
 */
export function buildLinkedDayDraftFromState(
  ymdStr: string,
  wl: WorkLogState,
  book: SalaryBook,
  staffOptionsOrdered: readonly string[],
): LinkedDayDraft {
  const snap = buildPayrollDaySnapshot(book, ymdStr)
  const existing = getDayDocument(wl, ymdStr)

  if (snap) {
    const skeleton = payrollSnapshotToSkeleton(snap, ymdStr, staffOptionsOrdered)
    if (existing) return mergePayrollSkeletonWithDayDocument(skeleton, existing)
    const legacy = entriesForDate(wl.entries, ymdStr)
    if (legacy.length) {
      const mergedDoc = legacyEntriesToDayDocument(legacy)
      if (mergedDoc) return mergePayrollSkeletonWithDayDocument(skeleton, mergedDoc)
    }
    return mergePayrollSkeletonWithDayDocument(skeleton, null)
  }

  if (existing) return documentToLinkedDraft(existing)
  const legacy = entriesForDate(wl.entries, ymdStr)
  if (legacy.length) {
    const mergedDoc = legacyEntriesToDayDocument(legacy)
    if (mergedDoc) return documentToLinkedDraft(mergedDoc)
  }
  const nb = newSiteBlock()
  return {
    docId: null,
    logDate: ymdStr,
    mealCost: '',
    miscCost: '',
    instrumentCost: '',
    toolLines: [oneEmptyToolLineDraft()],
    blocks: [
      {
        id: nb.id,
        siteName: nb.siteName,
        workLines: nb.workLines.map((x) => ({ ...x })),
        ...linkedInstrumentFieldsFromSiteBlock(nb),
        remark: nb.remark,
        dong: nb.dong,
        floorLevel: nb.floorLevel,
        workPhase: nb.workPhase,
        staffLines: nb.staffLines.map((x) => ({ ...x })),
      },
    ],
  }
}

/**
 * 月表更新後（例如快速登記）：以新月表重組該日整日文件，保留原備註類欄位，必要時併入快速登記表單文字。
 */
export function reconcileDayDocumentWithPayrollBook(
  wl: WorkLogState,
  iso: string,
  book: SalaryBook,
  staffOptionsOrdered: readonly string[],
  quickOverlay?: QuickApplyTextOverlay,
): WorkLogState {
  let draft = buildLinkedDayDraftFromState(iso, wl, book, staffOptionsOrdered)
  if (quickOverlay) draft = applyQuickTextOverlay(draft, quickOverlay)
  const existing = getDayDocument(wl, iso)
  const hasNamedStaff = draft.blocks.some((b) =>
    b.staffLines.some((ln) => ln.name.trim()),
  )
  if (
    !existing &&
    !hasNamedStaff &&
    !draft.blocks.some(
      (b) =>
        blockDraftHasWorkText(b) ||
        blockDraftHasInstrument(b) ||
        b.remark.trim() ||
        blockDraftHasSiteMeta(b),
    ) &&
    parseMoney(draft.mealCost) === 0 &&
    parseMoney(draft.miscCost) === 0 &&
    !draftHasToolExpenseDraft(draft) &&
    parseMoney(draft.instrumentCost) === 0
  ) {
    return wl
  }
  const doc = linkedDayDraftToDayDocument(draft, existing)
  return replaceDayDocument(wl, doc)
}
