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

/** 與 {@link WorkLogPanel} 表單結構一致，供連動建檔／合併 */
export type LinkedDayDraft = {
  docId: string | null
  logDate: string
  mealCost: string
  miscCost: string
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
        staffLines,
      },
    ],
  }
}

function documentToLinkedDraft(doc: WorkLogDayDocument): LinkedDayDraft {
  const blockSrc = doc.blocks?.length ? doc.blocks : [newSiteBlock()]
  return {
    docId: doc.id,
    logDate: doc.logDate,
    mealCost: doc.mealCost === 0 ? '' : String(doc.mealCost),
    miscCost: doc.miscCost === 0 ? '' : String(doc.miscCost),
    blocks: blockSrc.map((b) => ({
      id: b.id,
      siteName: b.siteName,
      workLines: workLinesDraftFromSiteBlock(b),
      ...linkedInstrumentFieldsFromSiteBlock(b),
      remark: typeof b.remark === 'string' ? b.remark : '',
      staffLines:
        b.staffLines.length > 0
          ? b.staffLines.map((l) => ({
              name: l.name,
              timeStart: l.timeStart,
              timeEnd: l.timeEnd,
            }))
          : [{ name: '', timeStart: DEFAULT_WORK_START, timeEnd: DEFAULT_WORK_END }],
    })),
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
      blocks: skeleton.blocks.map((b) => ({
        ...b,
        workLines: [emptyWorkLineDraft()],
        ...emptyLinkedInstrumentDraftFields(),
        remark: '',
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
      staffLines,
    }
  })

  return {
    docId: overlay.id,
    logDate: skeleton.logDate,
    mealCost: skeleton.mealCost,
    miscCost: overlay.miscCost === 0 ? '' : String(overlay.miscCost),
    blocks: mergedBlocks,
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
    (b) => blockDraftHasWorkText(b) || blockDraftHasInstrument(b) || b.remark.trim(),
  )
  if (
    blocks.length === 0 &&
    (parseMoney(d.mealCost) !== 0 || parseMoney(d.miscCost) !== 0 || hasAnyBlockText)
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
        staffLines: [...nb.staffLines],
      },
    ]
  }
  return {
    id: existing?.id ?? d.docId ?? newWorkLogEntityId(),
    logDate: d.logDate,
    workItem: '',
    equipment: '',
    mealCost: parseMoney(d.mealCost),
    miscCost: parseMoney(d.miscCost),
    remark: '',
    blocks,
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
  }
}

export type QuickApplyTextOverlay = {
  /** 有值時只寫入該案場區塊；空白時寫入第一個區塊 */
  siteName?: string
  workItem?: string
  equipment?: string
  remark?: string
  miscCost?: number
  timeStart?: string
  timeEnd?: string
}

function applyQuickTextOverlay(d: LinkedDayDraft, q: QuickApplyTextOverlay): LinkedDayDraft {
  const target = (q.siteName ?? '').trim()
  const applyIdx =
    target !== ''
      ? d.blocks.findIndex((b) => siteKey(b.siteName) === siteKey(target))
      : -1
  const indices =
    applyIdx >= 0 ? [applyIdx] : d.blocks.length > 0 ? [0] : []

  let out: LinkedDayDraft = {
    ...d,
    miscCost:
      q.miscCost !== undefined ? (q.miscCost === 0 ? '' : String(q.miscCost)) : d.miscCost,
    blocks: d.blocks.map((b, i) => {
      if (!indices.includes(i)) return b
      let next: LinkedDayBlockDraft = {
        ...b,
        workLines:
          q.workItem !== undefined
            ? b.workLines?.length
              ? b.workLines.map((wl, j) =>
                  j === 0 ? { ...wl, label: q.workItem ?? '' } : wl,
                )
              : [{ ...emptyWorkLineDraft(), label: q.workItem ?? '' }]
            : b.workLines,
        remark: q.remark !== undefined ? q.remark : b.remark,
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
    blocks: [
      {
        id: nb.id,
        siteName: nb.siteName,
        workLines: nb.workLines.map((x) => ({ ...x })),
        ...linkedInstrumentFieldsFromSiteBlock(nb),
        remark: nb.remark,
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
    !draft.blocks.some((b) => blockDraftHasWorkText(b) || blockDraftHasInstrument(b) || b.remark.trim()) &&
    parseMoney(draft.miscCost) === 0
  ) {
    return wl
  }
  const doc = linkedDayDraftToDayDocument(draft, existing)
  return replaceDayDocument(wl, doc)
}
