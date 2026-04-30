/**
 * 整日工作日誌與薪水月表連動：案場／人員／餐費以月表為骨架，已存日誌覆寫文字、上下班時間、**計工數**等。
 */

import type { MonthSheetData, SalaryBook } from './salaryExcelModel'
import {
  staffKeysAcrossBook,
  padArray,
  ensureGridWorker,
  staffKeysForMonthDisplay,
} from './salaryExcelModel'
import {
  LEGACY_QUICK_SITE_JUN_ADJUST,
  normalizeQuickSiteKey,
  QUICK_SITE_JUN_ADJUST,
  QUICK_SITE_TSAI_ADJUST,
} from './fieldworkQuickApply'
import {
  buildPayrollDaySnapshot,
  dayIndexInSheet,
  findMonthSheetContainingDate,
  payrollStaffMealForFormSite,
  prefillFromPayrollDaySnapshot,
  type PayrollDayNameAmount,
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
  newWorkLogSiteWorkLine,
  canonicalWorkLogDayDocIdForDraft,
  normalizeWorkLogDayDocumentNestedIds,
  nowIso,
  parseInstrumentQtyFromDraftStrings,
  parseLegacyEquipmentString,
  replaceDayDocument,
  staffWorkDaysFromDraftString,
  normStaffWorkDays,
  stableWorkLogBlockId,
  stableWorkLogDayDocBaseId,
  stableWorkLogToolLineId,
  stableWorkLogWorkLineId,
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
  /** 計工數（天）；空白表示 1，存檔寫入月表 */
  workDays: string
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

function emptyWorkLineDraftAt(
  logDate: string,
  docIdPreferred: string | null | undefined,
  blockIdx: number,
  lineIdx: number,
): LinkedDayWorkLineDraft {
  const cid = canonicalWorkLogDayDocIdForDraft(logDate, docIdPreferred)
  return { id: stableWorkLogWorkLineId(cid, blockIdx, lineIdx), label: '' }
}

function workLinesDraftFromSiteBlock(
  b: WorkLogSiteBlock,
  docLogDate: string,
  docId: string,
  blockIdx: number,
): LinkedDayWorkLineDraft[] {
  const raw =
    b.workLines && b.workLines.length > 0
      ? b.workLines
      : typeof b.workItem === 'string' && b.workItem.trim()
        ? [{ ...newWorkLogSiteWorkLine(docId, blockIdx, 0), label: b.workItem.trim() }]
        : []
  if (raw.length === 0) return [emptyWorkLineDraftAt(docLogDate, docId, blockIdx, 0)]
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

/** 同日該區塊具名人員（排序後串接），供月表更名後與舊案名區塊對位。 */
function staffSignatureFromLinkedStaffLines(
  staffLines: readonly { name: string }[] | undefined,
): string {
  const names = (staffLines ?? [])
    .map((l) => l.name.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  return names.join('\u0001')
}

function staffSignatureFromSiteBlock(b: WorkLogSiteBlock): string {
  return staffSignatureFromLinkedStaffLines(b.staffLines)
}

/** 合併多個候選日誌區塊時，選工作／備註／儀器等較完整者（避免「新案名空殼」蓋過舊案名有內容）。 */
function siteBlockMergeRichness(b: WorkLogSiteBlock): number {
  let n = 0
  for (const wl of b.workLines ?? []) {
    const t = (wl.label ?? '').trim()
    if (t) n += 20 + Math.min(500, t.length)
  }
  const legacy = typeof b.workItem === 'string' ? b.workItem.trim() : ''
  if (legacy) n += 25 + Math.min(500, legacy.length)
  const rem = (b.remark ?? '').trim()
  if (rem) n += 8 + Math.min(300, rem.length)
  if ((b.equipment ?? '').trim()) n += 5
  const iq = b.instrumentQty
  if (iq && instrumentQtyAnyPositive(iq)) n += 15
  for (const f of [b.dong, b.floorLevel, b.workPhase]) {
    if (f && String(f).trim()) n += 2
  }
  return n
}

function pickRichestSiteBlock(candidates: WorkLogSiteBlock[]): WorkLogSiteBlock {
  return candidates.reduce((best, cur) =>
    siteBlockMergeRichness(cur) > siteBlockMergeRichness(best) ? cur : best,
  candidates[0]!,
  )
}

/** 月表所有具名案場（去重排序）指紋；案場更名或增刪區塊時變，格線數字不變則不變。 */
export function salaryBookNamedSitesFingerprint(book: SalaryBook): string {
  const s = new Set<string>()
  for (const m of book.months) {
    for (const b of m.blocks) {
      const t = b.siteName.trim()
      if (t) s.add(t)
    }
  }
  return [...s].sort((a, b) => a.localeCompare(b, 'zh-Hant')).join('\u0001')
}

function dayDocumentPayrollRepairSignature(doc: WorkLogDayDocument): string {
  const blocks = doc.blocks ?? []
  return JSON.stringify(
    blocks.map((b) => ({
      site: b.siteName.trim(),
      staff: staffSignatureFromSiteBlock(b),
      wl: (b.workLines ?? []).map((w) => w.label.trim()).filter(Boolean).join('|'),
      rem: (b.remark ?? '').trim().slice(0, 240),
    })),
  )
}

/**
 * 依目前月表重算各日「整日文件」與月表骨架的合併結果並寫回（去重更名殘留區塊）。
 * 僅在內容與合併前不同時才替換該日文件，避免無意義抖動。
 */
export function repairWorkLogDayDocumentsAgainstPayroll(
  wl: WorkLogState,
  book: SalaryBook,
): WorkLogState {
  const docs = wl.dayDocuments ?? []
  if (docs.length === 0) return wl
  const staffOrdered = staffKeysAcrossBook(book)
  let changed = false
  const nextDocs = docs.map((doc) => {
    const snap = buildPayrollDaySnapshot(book, doc.logDate)
    if (!snap) return doc
    const skeleton = payrollSnapshotToSkeleton(snap, doc.logDate, staffOrdered)
    const draft = mergePayrollSkeletonWithDayDocument(skeleton, doc)
    const next = linkedDayDraftToDayDocument(draft, doc)
    if (dayDocumentPayrollRepairSignature(next) === dayDocumentPayrollRepairSignature(doc)) {
      return doc
    }
    changed = true
    return next
  })
  if (!changed) return wl
  return { ...wl, dayDocuments: nextDocs }
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
    return [{ name: '', timeStart: DEFAULT_WORK_START, timeEnd: DEFAULT_WORK_END, workDays: '' }]
  return ordered.map((name) => ({
    name,
    timeStart: DEFAULT_WORK_START,
    timeEnd: DEFAULT_WORK_END,
    workDays: '',
  }))
}

function fmtWorkDaysDraftFromPayroll(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return ''
  const n = normStaffWorkDays(v)
  if (n === 1) return ''
  return String(n)
}

/** 調工支援／蔡董調工：依月表當日每人數值帶入計工數 */
function staffLinesFromAdjustNamesAndAmounts(
  staffNames: readonly string[],
  amounts: readonly PayrollDayNameAmount[],
  staffOptionsOrdered: readonly string[],
): LinkedDayStaffLineDraft[] {
  const valBy = new Map(amounts.map((r) => [r.name.trim(), r.value]))
  const ordered = orderStaffNamesForLinkedForm(staffOptionsOrdered, [...staffNames])
  if (ordered.length === 0)
    return [{ name: '', timeStart: DEFAULT_WORK_START, timeEnd: DEFAULT_WORK_END, workDays: '' }]
  return ordered.map((name) => ({
    name,
    timeStart: DEFAULT_WORK_START,
    timeEnd: DEFAULT_WORK_END,
    workDays: fmtWorkDaysDraftFromPayroll(valBy.get(name.trim()) ?? 1),
  }))
}

/** 月表「調工支援／蔡董調工」列有資料時，另立區塊（勿併入一般格線案場，以免誤標案場）。 */
function appendAdjustColumnSkeletonBlocks(
  snap: PayrollDaySnapshot,
  blocks: LinkedDayBlockDraft[],
  staffOptionsOrdered: readonly string[],
  ymdStr: string,
): void {
  const dayDocId = stableWorkLogDayDocBaseId(ymdStr)
  if (!skeletonHasSiteKey(blocks, QUICK_SITE_JUN_ADJUST)) {
    const jun = payrollStaffMealForFormSite(snap, QUICK_SITE_JUN_ADJUST)
    if (jun && jun.staffNames.length > 0) {
      const bi = blocks.length
      blocks.push({
        id: stableWorkLogBlockId(dayDocId, bi),
        siteName: QUICK_SITE_JUN_ADJUST,
        workLines: [emptyWorkLineDraftAt(ymdStr, dayDocId, bi, 0)],
        ...emptyLinkedInstrumentDraftFields(),
        remark: '',
        dong: '',
        floorLevel: '',
        workPhase: '',
        staffLines: staffLinesFromAdjustNamesAndAmounts(
          jun.staffNames,
          snap.junAdjust,
          staffOptionsOrdered,
        ),
      })
    }
  }
  if (!skeletonHasSiteKey(blocks, QUICK_SITE_TSAI_ADJUST)) {
    const tsai = payrollStaffMealForFormSite(snap, QUICK_SITE_TSAI_ADJUST)
    if (tsai && tsai.staffNames.length > 0) {
      const bi = blocks.length
      blocks.push({
        id: stableWorkLogBlockId(dayDocId, bi),
        siteName: QUICK_SITE_TSAI_ADJUST,
        workLines: [emptyWorkLineDraftAt(ymdStr, dayDocId, bi, 0)],
        ...emptyLinkedInstrumentDraftFields(),
        remark: '',
        dong: '',
        floorLevel: '',
        workPhase: '',
        staffLines: staffLinesFromAdjustNamesAndAmounts(
          tsai.staffNames,
          snap.tsaiAdjust,
          staffOptionsOrdered,
        ),
      })
    }
  }
}

function payrollSnapshotToSkeleton(
  snap: PayrollDaySnapshot,
  ymdStr: string,
  staffOptionsOrdered: readonly string[],
): { mealCost: string; blocks: LinkedDayBlockDraft[]; logDate: string } {
  const dayDocId = stableWorkLogDayDocBaseId(ymdStr)
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
      const dayByName = new Map(b.workers.map((w) => [w.name, w.dayValue]))
      const staffLines: LinkedDayStaffLineDraft[] =
        names.length > 0
          ? names.map((name) => ({
              name,
              timeStart: DEFAULT_WORK_START,
              timeEnd: DEFAULT_WORK_END,
              workDays: fmtWorkDaysDraftFromPayroll(dayByName.get(name) ?? 1),
            }))
          : [{ name: '', timeStart: DEFAULT_WORK_START, timeEnd: DEFAULT_WORK_END, workDays: '' }]
      const bi = blocks.length
      blocks.push({
        id: stableWorkLogBlockId(dayDocId, bi),
        siteName: b.siteName,
        workLines: [emptyWorkLineDraftAt(ymdStr, dayDocId, bi, 0)],
        ...emptyLinkedInstrumentDraftFields(),
        remark: '',
        dong: '',
        floorLevel: '',
        workPhase: '',
        staffLines,
      })
    }
    appendAdjustColumnSkeletonBlocks(snap, blocks, staffOptionsOrdered, ymdStr)
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
    const bi = adjustOnlyBlocks.length
    adjustOnlyBlocks.push({
      id: stableWorkLogBlockId(dayDocId, bi),
      siteName: QUICK_SITE_JUN_ADJUST,
      workLines: [emptyWorkLineDraftAt(ymdStr, dayDocId, bi, 0)],
      ...emptyLinkedInstrumentDraftFields(),
      remark: '',
      dong: '',
      floorLevel: '',
      workPhase: '',
      staffLines: staffLinesFromAdjustNamesAndAmounts(
        junScoped.staffNames,
        snap.junAdjust,
        staffOptionsOrdered,
      ),
    })
  }
  if (tsaiScoped && tsaiScoped.staffNames.length > 0) {
    const bi = adjustOnlyBlocks.length
    adjustOnlyBlocks.push({
      id: stableWorkLogBlockId(dayDocId, bi),
      siteName: QUICK_SITE_TSAI_ADJUST,
      workLines: [emptyWorkLineDraftAt(ymdStr, dayDocId, bi, 0)],
      ...emptyLinkedInstrumentDraftFields(),
      remark: '',
      dong: '',
      floorLevel: '',
      workPhase: '',
      staffLines: staffLinesFromAdjustNamesAndAmounts(
        tsaiScoped.staffNames,
        snap.tsaiAdjust,
        staffOptionsOrdered,
      ),
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
          workDays: '',
        }))
      : [{ name: '', timeStart: DEFAULT_WORK_START, timeEnd: DEFAULT_WORK_END, workDays: '' }]
  return {
    logDate: ymdStr,
    mealCost: p.mealCost === 0 ? '' : String(p.mealCost),
    blocks: [
      {
        id: stableWorkLogBlockId(dayDocId, 0),
        siteName: p.siteName,
        workLines: [emptyWorkLineDraftAt(ymdStr, dayDocId, 0, 0)],
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

function linkedDayBlockDraftFromSiteBlock(
  b: WorkLogSiteBlock,
  docLogDate: string,
  docId: string,
  blockIdx: number,
): LinkedDayBlockDraft {
  return {
    id: b.id,
    siteName: b.siteName,
    workLines: workLinesDraftFromSiteBlock(b, docLogDate, docId, blockIdx),
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
            workDays: fmtWorkDaysDraftFromPayroll(l.workDays ?? 1),
          }))
        : [{ name: '', timeStart: DEFAULT_WORK_START, timeEnd: DEFAULT_WORK_END, workDays: '' }],
  }
}

function documentToLinkedDraft(doc: WorkLogDayDocument): LinkedDayDraft {
  const blockSrc = doc.blocks?.length ? doc.blocks : [newSiteBlock(doc.id, 0)]
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
    blocks: blockSrc.map((b, bi) => linkedDayBlockDraftFromSiteBlock(b, doc.logDate, doc.id, bi)),
  }
}

function docMealNum(doc: WorkLogDayDocument | null): number {
  if (!doc) return 0
  const m = doc.mealCost
  return typeof m === 'number' && Number.isFinite(m) ? m : 0
}

function skeletonMealNumFromString(s: string): number {
  const n = parseFloat(String(s ?? '').trim())
  return Number.isFinite(n) ? n : 0
}

/** 整日餐費：已存文件有填寫（非 0）以文件為準；否則用月表骨架加總。 */
function mergedMealCostDraftString(
  overlay: WorkLogDayDocument | null,
  skeletonMealCost: string,
): string {
  if (!overlay) return skeletonMealCost
  const docM = docMealNum(overlay)
  const skM = skeletonMealNumFromString(skeletonMealCost)
  if (docM !== 0) return String(docM)
  if (skM !== 0) return skeletonMealCost
  return ''
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
      toolLines: [oneEmptyToolLineDraftFor(skeleton.logDate, null)],
      blocks: skeleton.blocks.map((b, bi) => ({
        ...b,
        workLines: [emptyWorkLineDraftAt(skeleton.logDate, null, bi, 0)],
        ...emptyLinkedInstrumentDraftFields(),
        remark: '',
        dong: '',
        floorLevel: '',
        workPhase: '',
      })),
    }
  }

  const docBlocks = overlay.blocks?.length ? overlay.blocks : []
  const skeletonSiteKeys = new Set(skeleton.blocks.map((b) => siteKey(b.siteName)))
  const usedDocBlockIds = new Set<string>()

  const mergedBlocks = skeleton.blocks.map((sb, bi) => {
    const sigSb = staffSignatureFromLinkedStaffLines(sb.staffLines)
    const unused = docBlocks.filter((b) => !usedDocBlockIds.has(b.id))
    const candidates = unused.filter((b) => {
      if (siteKey(b.siteName) === siteKey(sb.siteName)) return true
      if (!sigSb) return false
      if (skeletonSiteKeys.has(siteKey(b.siteName))) return false
      return staffSignatureFromSiteBlock(b) === sigSb
    })
    let ob: WorkLogSiteBlock | undefined
    if (candidates.length === 1) ob = candidates[0]
    else if (candidates.length > 1) ob = pickRichestSiteBlock(candidates)
    if (ob) usedDocBlockIds.add(ob.id)
    const id = ob?.id ?? sb.id
    const staffLines = sb.staffLines.map((sl) => {
      if (!sl.name.trim()) return sl
      const line = ob?.staffLines.find((l) => l.name.trim() === sl.name.trim())
      if (line) {
        return {
          name: sl.name,
          timeStart: line.timeStart,
          timeEnd: line.timeEnd,
          workDays:
            line.workDays !== undefined && Number.isFinite(line.workDays)
              ? fmtWorkDaysDraftFromPayroll(normStaffWorkDays(line.workDays))
              : sl.workDays,
        }
      }
      return sl
    })
    return {
      id,
      siteName: sb.siteName,
      workLines:
        ob && (ob.workLines?.length ?? 0) > 0
          ? ob.workLines.map((wl) => ({ ...wl }))
          : [emptyWorkLineDraftAt(skeleton.logDate, overlay.id, bi, 0)],
      ...(ob ? linkedInstrumentFieldsFromSiteBlock(ob) : emptyLinkedInstrumentDraftFields()),
      remark: ob ? ob.remark : '',
      dong: ob ? (typeof ob.dong === 'string' ? ob.dong : '') : '',
      floorLevel: ob ? (typeof ob.floorLevel === 'string' ? ob.floorLevel : '') : '',
      workPhase: ob ? (typeof ob.workPhase === 'string' ? ob.workPhase : '') : '',
      staffLines,
    }
  })

  /** 月表骨架當日未列案場，但已存日誌有該區塊時須保留（否則表單重載會憑空消失） */
  const orphanBlocks: LinkedDayBlockDraft[] = []
  let orphanBi = mergedBlocks.length
  for (const ob of docBlocks) {
    if (usedDocBlockIds.has(ob.id)) continue
    if (skeletonSiteKeys.has(siteKey(ob.siteName))) continue
    orphanBlocks.push(linkedDayBlockDraftFromSiteBlock(ob, overlay.logDate, overlay.id, orphanBi))
    orphanBi += 1
  }
  const blocksOut = [...mergedBlocks, ...orphanBlocks]

  return {
    docId: overlay.id,
    logDate: skeleton.logDate,
    mealCost: mergedMealCostDraftString(overlay, skeleton.mealCost),
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

function oneEmptyToolLineDraftFor(
  logDate: string,
  docIdPreferred: string | null | undefined,
): LinkedDayToolLineDraft {
  const cid = canonicalWorkLogDayDocIdForDraft(logDate, docIdPreferred)
  return { id: stableWorkLogToolLineId(cid, 0), name: '', qty: '', unit: '', amount: '' }
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
    return [{ id: stableWorkLogToolLineId(doc.id, 0), name: '', qty: '', unit: '', amount: String(doc.miscCost) }]
  }
  return []
}

function ensureToolLinesDraftForForm(doc: WorkLogDayDocument): LinkedDayToolLineDraft[] {
  const t = documentToolLinesToDraft(doc)
  return t.length > 0 ? t : [oneEmptyToolLineDraftFor(doc.logDate, doc.id)]
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
  const docId =
    (existing?.id && existing.id.trim()) ||
    (d.docId && d.docId.trim()) ||
    stableWorkLogDayDocBaseId(d.logDate)
  let blocks: WorkLogSiteBlock[] = d.blocks
    .map((b, bi) => {
      let workLines = (b.workLines ?? [])
        .map((wl) => ({
          id: (wl.id ?? '').trim(),
          label: wl.label.trim(),
        }))
        .filter((wl) => wl.label)
      workLines = workLines.map((wl, li) => ({
        ...wl,
        id: wl.id || stableWorkLogWorkLineId(docId, bi, li),
      }))
      if (workLines.length === 0) workLines = [newWorkLogSiteWorkLine(docId, bi, 0)]
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
            workDays: staffWorkDaysFromDraftString(ln.workDays),
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
    const nb = newSiteBlock(docId, 0)
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
      id: (row.id ?? '').trim() || stableWorkLogToolLineId(docId, parsedToolLines.length),
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

  return normalizeWorkLogDayDocumentNestedIds({
    id: docId,
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
  })
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
  const cid = canonicalWorkLogDayDocIdForDraft(d.logDate, d.docId)
  const hasMeaningful = rows.some(
    (r) =>
      r.name.trim() ||
      parseMoney(r.amount) !== 0 ||
      (r.qty ?? '').trim() ||
      (r.unit ?? '').trim(),
  )
  if (hasMeaningful) return [...rows]
  const legacy = parseMoney(d.miscCost)
  if (legacy !== 0)
    return [{ id: stableWorkLogToolLineId(cid, 0), name: '', qty: '', unit: '', amount: String(legacy) }]
  return rows.length > 0 ? [...rows] : [oneEmptyToolLineDraftFor(d.logDate, d.docId)]
}

function appendQuickToolLines(
  base: LinkedDayToolLineDraft[],
  q: QuickApplyTextOverlay,
  logDate: string,
  docIdPreferred: string | null | undefined,
): LinkedDayToolLineDraft[] {
  const cid = canonicalWorkLogDayDocIdForDraft(logDate, docIdPreferred)
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
        id: stableWorkLogToolLineId(cid, out.length),
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
      id: stableWorkLogToolLineId(cid, out.length),
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
    ? appendQuickToolLines(baseToolLinesBeforeQuickApply(d), q, d.logDate, d.docId)
    : d.toolLines?.length
      ? d.toolLines
      : [oneEmptyToolLineDraftFor(d.logDate, d.docId)]
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
            return labels.map((label, li) => ({
              ...emptyWorkLineDraftAt(d.logDate, d.docId, i, li),
              label,
            }))
          }
          if (q.workItem !== undefined) {
            const single = String(q.workItem).trim()
            return b.workLines?.length
              ? b.workLines.map((wl, j) => (j === 0 ? { ...wl, label: single } : wl))
              : [{ ...emptyWorkLineDraftAt(d.logDate, d.docId, i, 0), label: single }]
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

/** 與月表／快速登記鍵一致之案場字串（含舊「鈞泩調工」→「調工支援」） */
function normDocPayrollSiteKey(raw: string): string {
  const t = (raw ?? '').trim()
  const u = t === LEGACY_QUICK_SITE_JUN_ADJUST ? QUICK_SITE_JUN_ADJUST : t
  return normalizeQuickSiteKey(u)
}

/**
 * 整日工作日誌僅保留「該日月表上存在」之案場與人員（月表沒有的，日誌也不能存）。
 * 該日不在任何月表時回傳原文件不變。
 */
export function pruneDayDocumentToPayroll(
  book: SalaryBook,
  iso: string,
  doc: WorkLogDayDocument,
): WorkLogDayDocument {
  const sheet = findMonthSheetContainingDate(book, iso)
  if (!sheet) return doc

  const allowedStaff = new Set(staffKeysForMonthDisplay(sheet))
  const nextBlocks: WorkLogSiteBlock[] = []

  for (const b of doc.blocks ?? []) {
    const sn = normDocPayrollSiteKey(b.siteName ?? '')

    if (sn === QUICK_SITE_JUN_ADJUST || sn === QUICK_SITE_TSAI_ADJUST) {
      const canonSite = sn === QUICK_SITE_JUN_ADJUST ? QUICK_SITE_JUN_ADJUST : QUICK_SITE_TSAI_ADJUST
      const staffLines = (b.staffLines ?? [])
        .map((ln) => {
          const name = (ln.name ?? '').trim()
          if (!name || !allowedStaff.has(name)) {
            return { ...ln, name: '' }
          }
          return { ...ln, name }
        })
        .filter((ln) => ln.name.trim())
      if (staffLines.length === 0) continue
      nextBlocks.push({ ...b, siteName: canonSite, staffLines })
      continue
    }

    const bi = sheet.blocks.findIndex((sb) => normDocPayrollSiteKey(sb.siteName) === sn)
    if (bi < 0) continue
    const sheetSiteName = sheet.blocks[bi]!.siteName
    const staffLines = (b.staffLines ?? [])
      .map((ln) => {
        const name = (ln.name ?? '').trim()
        if (!name || !allowedStaff.has(name)) {
          return { ...ln, name: '' }
        }
        return { ...ln, name }
      })
      .filter((ln) => ln.name.trim())
    if (staffLines.length === 0) continue
    nextBlocks.push({ ...b, siteName: sheetSiteName, staffLines })
  }

  return { ...doc, blocks: nextBlocks }
}

/**
 * 清空該日在月表之「出工格線、各案場餐、鈞泩／蔡董調工天數欄」；不動預支與加班時數欄。
 * 若 `iso` 不在任何月表，`book` 不變。
 */
export function clearPayrollBookWorkGridMealAndAdjustForDate(book: SalaryBook, iso: string): SalaryBook {
  const sheet = findMonthSheetContainingDate(book, iso)
  if (!sheet) return book
  const j = dayIndexInSheet(sheet, iso)
  if (j < 0) return book
  const len = sheet.dates.length
  if (len === 0) return book

  const blocks = sheet.blocks.map((b) => {
    const mealRow = [...padArray(b.meal, len)]
    if (j < mealRow.length) mealRow[j] = 0
    const grid: Record<string, number[]> = {}
    for (const [name, arr] of Object.entries(b.grid)) {
      const row = [...padArray(arr, len)]
      if (j < row.length) row[j] = 0
      grid[name] = row
    }
    return { ...b, meal: mealRow, grid }
  })

  const clearAdjustCol = (rec: Record<string, number[]>): Record<string, number[]> => {
    const out: Record<string, number[]> = {}
    for (const [name, arr] of Object.entries(rec)) {
      const row = [...padArray(arr, len)]
      if (j < row.length) row[j] = 0
      out[name] = row
    }
    return out
  }

  const nextSheet: MonthSheetData = {
    ...sheet,
    blocks,
    junAdjustDays: clearAdjustCol(sheet.junAdjustDays),
    tsaiAdjustDays: clearAdjustCol(sheet.tsaiAdjustDays),
  }

  const mi = book.months.findIndex((m) => m.id === sheet.id)
  if (mi < 0) return book
  return {
    ...book,
    months: book.months.map((m, i) => (i === mi ? nextSheet : m)),
  }
}

/**
 * 依整日工作日誌（須已與月表修剪一致）覆寫該日：案場格線、調工支援／蔡董調工天數、整日餐費。
 * 日誌沒有的出工／調工／餐費欄位會先歸零再依文件寫入；**每人每案場之計工數**取自日誌該列 `workDays`（與月表 1、0.5 等一致）。
 */
export function syncPayrollBookFromDayDocument(
  book: SalaryBook,
  iso: string,
  doc: WorkLogDayDocument,
): SalaryBook {
  const sheet0 = findMonthSheetContainingDate(book, iso)
  if (!sheet0) return book

  let book1 = clearPayrollBookWorkGridMealAndAdjustForDate(book, iso)
  const sheet = findMonthSheetContainingDate(book1, iso)
  if (!sheet) return book1
  const j = dayIndexInSheet(sheet, iso)
  if (j < 0) return book1
  const len = sheet.dates.length
  const mi = book1.months.findIndex((m) => m.id === sheet.id)
  if (mi < 0) return book1

  let blocks = sheet.blocks.map((b) => ({ ...b }))
  let junAdjustDays = { ...sheet.junAdjustDays }
  let tsaiAdjustDays = { ...sheet.tsaiAdjustDays }

  for (const db of doc.blocks ?? []) {
    const sn = normDocPayrollSiteKey(db.siteName ?? '')
    const staffRows = (db.staffLines ?? [])
      .map((ln) => ({
        name: (ln.name ?? '').trim(),
        days: normStaffWorkDays(ln.workDays),
      }))
      .filter((x) => x.name)

    if (sn === QUICK_SITE_JUN_ADJUST) {
      for (const { name, days } of staffRows) {
        const row = [...padArray(junAdjustDays[name], len)]
        if (j < row.length) row[j] = days
        junAdjustDays = { ...junAdjustDays, [name]: row }
      }
      continue
    }
    if (sn === QUICK_SITE_TSAI_ADJUST) {
      for (const { name, days } of staffRows) {
        const row = [...padArray(tsaiAdjustDays[name], len)]
        if (j < row.length) row[j] = days
        tsaiAdjustDays = { ...tsaiAdjustDays, [name]: row }
      }
      continue
    }

    const bi = blocks.findIndex((b) => normDocPayrollSiteKey(b.siteName) === sn)
    if (bi < 0) continue
    let bl = blocks[bi]!
    for (const { name, days } of staffRows) {
      bl = ensureGridWorker(bl, name, len)
      const row = [...padArray(bl.grid[name], len)]
      if (j < row.length) row[j] = days
      bl = { ...bl, grid: { ...bl.grid, [name]: row } }
    }
    blocks = blocks.map((x, i) => (i === bi ? bl : x))
  }

  const nextSheet: MonthSheetData = {
    ...sheet,
    blocks,
    junAdjustDays,
    tsaiAdjustDays,
  }
  const book2: SalaryBook = {
    ...book1,
    months: book1.months.map((m, i) => (i === mi ? nextSheet : m)),
  }

  const mealTotal = Math.round(
    typeof doc.mealCost === 'number' && Number.isFinite(doc.mealCost) ? doc.mealCost : 0,
  )
  const primarySite =
    doc.blocks?.find((bb) => bb.staffLines?.some((ln) => (ln.name ?? '').trim()))?.siteName?.trim() ??
    ''
  return syncPayrollBookMealTotalFromWorkLogDay(book2, iso, mealTotal, primarySite)
}

/**
 * 依工作日誌「整日餐費」寫回薪月表：該日各案場餐列僅保留一筆為 `mealTotal`（其餘案場該日餐欄歸 0），與全日單一餐費欄一致。
 */
export function syncPayrollBookMealTotalFromWorkLogDay(
  book: SalaryBook,
  iso: string,
  mealTotal: number,
  preferredSiteName?: string,
): SalaryBook {
  const sheet = findMonthSheetContainingDate(book, iso)
  if (!sheet) return book
  const j = dayIndexInSheet(sheet, iso)
  if (j < 0) return book
  const len = sheet.dates.length
  const target = Number.isFinite(mealTotal) ? Math.round(mealTotal) : 0
  const snap = buildPayrollDaySnapshot(book, iso)
  const bi = pickPayrollBlockIndexForDayMeal(sheet, snap, j, preferredSiteName)
  const blocks = sheet.blocks.map((b, blockIdx) => {
    const mealRow = [...padArray(b.meal, len)]
    mealRow[j] = blockIdx === bi ? target : 0
    return { ...b, meal: mealRow }
  })
  const mi = book.months.findIndex((m) => m.id === sheet.id)
  if (mi < 0) return book
  return {
    ...book,
    months: book.months.map((m, i) => (i === mi ? { ...m, blocks } : m)),
  }
}

/**
 * 清空該日在月表之出工格線、各案場餐列、預支／調工／加班等「當日欄」（與刪除整日工作日誌連動）。
 * 若 `iso` 不在任何月表，`book` 不變。
 */
export function clearPayrollBookDayDataForDate(book: SalaryBook, iso: string): SalaryBook {
  const sheet = findMonthSheetContainingDate(book, iso)
  if (!sheet) return book
  const j = dayIndexInSheet(sheet, iso)
  if (j < 0) return book
  const len = sheet.dates.length
  if (len === 0) return book

  const clearStaffDayColumn = (rec: Record<string, number[]>): Record<string, number[]> => {
    const out: Record<string, number[]> = {}
    for (const [name, arr] of Object.entries(rec)) {
      const row = [...padArray(arr, len)]
      if (j < row.length) row[j] = 0
      out[name] = row
    }
    return out
  }

  const blocks = sheet.blocks.map((b) => {
    const mealRow = [...padArray(b.meal, len)]
    if (j < mealRow.length) mealRow[j] = 0
    const grid: Record<string, number[]> = {}
    for (const [name, arr] of Object.entries(b.grid)) {
      const row = [...padArray(arr, len)]
      if (j < row.length) row[j] = 0
      grid[name] = row
    }
    return { ...b, meal: mealRow, grid }
  })

  const nextSheet: MonthSheetData = {
    ...sheet,
    blocks,
    advances: clearStaffDayColumn(sheet.advances),
    junAdjustDays: clearStaffDayColumn(sheet.junAdjustDays),
    tsaiAdjustDays: clearStaffDayColumn(sheet.tsaiAdjustDays),
    junOtHours: clearStaffDayColumn(sheet.junOtHours),
    tsaiOtHours: clearStaffDayColumn(sheet.tsaiOtHours),
  }

  const mi = book.months.findIndex((m) => m.id === sheet.id)
  if (mi < 0) return book
  return {
    ...book,
    months: book.months.map((m, i) => (i === mi ? nextSheet : m)),
  }
}

function pickPayrollBlockIndexForDayMeal(
  sheet: MonthSheetData,
  snap: PayrollDaySnapshot | null,
  dayIdx: number,
  preferredSite?: string,
): number {
  const len = sheet.dates.length
  const p = preferredSite?.trim()
  if (p) {
    const i = sheet.blocks.findIndex((b) => b.siteName.trim() === p)
    if (i >= 0) return i
  }
  if (snap) {
    for (const sb of snap.blocks) {
      if (sb.workers.length === 0 && (sb.mealAmount ?? 0) === 0) continue
      const i = sheet.blocks.findIndex((b) => b.siteName.trim() === sb.siteName.trim())
      if (i >= 0) return i
    }
  }
  for (let i = 0; i < sheet.blocks.length; i++) {
    const b = sheet.blocks[i]!
    for (const arr of Object.values(b.grid)) {
      if ((padArray(arr, len)[dayIdx] ?? 0) !== 0) return i
    }
    if ((padArray(b.meal, len)[dayIdx] ?? 0) !== 0) return i
  }
  return 0
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
  const cid = stableWorkLogDayDocBaseId(ymdStr)
  const nb = newSiteBlock(cid, 0)
  return {
    docId: null,
    logDate: ymdStr,
    mealCost: '',
    miscCost: '',
    instrumentCost: '',
    toolLines: [oneEmptyToolLineDraftFor(ymdStr, cid)],
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
        staffLines: nb.staffLines.map((x) => ({
          name: x.name,
          timeStart: x.timeStart,
          timeEnd: x.timeEnd,
          workDays:
            x.workDays !== undefined &&
            Number.isFinite(x.workDays) &&
            normStaffWorkDays(x.workDays) !== 1
              ? String(normStaffWorkDays(x.workDays))
              : '',
        })),
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
