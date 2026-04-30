/** 營運／施工日誌；與薪水案場、估價細項、快速登記可連動。 */

import type { QuoteRow } from './quoteEngine'
import {
  isPlaceholderMonthBlockSiteName,
  siteBlockLabelForSummary,
} from './salaryExcelModel'
import {
  LEGACY_QUICK_SITE_JUN_ADJUST,
  QUICK_SITE_JUN_ADJUST,
} from './fieldworkQuickApply'

const TIME_RE = /^\d{1,2}:\d{2}$/

export const DEFAULT_WORK_START = '07:30'
export const DEFAULT_WORK_END = '16:30'

export type WorkLogEntry = {
  id: string
  /** YYYY-MM-DD */
  logDate: string
  /** 案場地點（一般案場或「調工支援」「蔡董調工」；與月表／快速登記鍵名一致） */
  siteName: string
  /** 施工人員姓名 */
  staffNames: string[]
  /** HH:mm */
  timeStart: string
  /** HH:mm */
  timeEnd: string
  /** 工作內容（估價細項或自訂選項） */
  workItem: string
  /** 使用儀器 */
  equipment: string
  /** 餐費（元；與登記金額一致之紀錄） */
  mealCost: number
  /** 雜項支出（元；可與公司損益表「工具」欄加帳連動） */
  miscCost: number
  /** 備註（詳述） */
  remark: string
  /**
   * 彙總文字（備份相容、舊資料）；新存檔時會與結構化欄位同步產生。
   */
  content: string
  createdAt: string
  updatedAt: string
}

export type WorkLogState = {
  /** 結構化日誌本體（舊筆或無整日文件之單筆） */
  entries: WorkLogEntry[]
  /**
   * 整日工地日誌：餐費／雜項為同日一筆；工作內容／儀器／備註依案場區塊；人員與各人上下班在區塊內。
   * 有 dayDocument 的日期，entries 不應再含同日資料（儲存整日時會清除）。
   */
  dayDocuments?: WorkLogDayDocument[]
  /** 工作內容自訂字串；與估價「細項」字串合併為 datalist 選項（僅選項，不綁估價列） */
  customWorkItemLabels: string[]
}

/** 單一施工人員於某案場之上下班 */
export type WorkLogStaffLine = {
  name: string
  /** HH:mm */
  timeStart: string
  /** HH:mm */
  timeEnd: string
}

/**
 * 案場區塊內一筆工作（僅存文字）。
 * 輸入選項來自「放樣估價」各列細項字串與自訂選項，僅供挑選，不與估價列 id 綁定。
 */
export type WorkLogSiteWorkLine = {
  id: string
  /** 工作描述（與估價細項同名時也只是同一串字，非連動） */
  label: string
}

/** 案場區塊內三種儀器台數（0 表示未使用該項） */
export type WorkLogSiteInstrumentQty = {
  totalStation: number
  rotatingLaser: number
  lineLaser: number
}

/** 與放樣估價之儀器欄位對應之顯示名稱 */
export const WORK_LOG_INSTRUMENT_OPTIONS: readonly {
  key: keyof WorkLogSiteInstrumentQty
  label: string
}[] = [
  { key: 'totalStation', label: '全站儀' },
  { key: 'rotatingLaser', label: '旋轉雷射' },
  { key: 'lineLaser', label: '墨線儀' },
]

export function emptyInstrumentQty(): WorkLogSiteInstrumentQty {
  return { totalStation: 0, rotatingLaser: 0, lineLaser: 0 }
}

function normInstrumentQtyInt(v: unknown): number {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(999, Math.floor(n))
}

export function instrumentQtyAnyPositive(q: WorkLogSiteInstrumentQty): boolean {
  return q.totalStation > 0 || q.rotatingLaser > 0 || q.lineLaser > 0
}

/** 摘要字串，例如「全站儀×2、墨線儀×1」 */
export function formatInstrumentQty(q: WorkLogSiteInstrumentQty): string {
  const parts: string[] = []
  for (const { key, label } of WORK_LOG_INSTRUMENT_OPTIONS) {
    const n = q[key]
    if (n > 0) parts.push(`${label}×${n}`)
  }
  return parts.join('、')
}

/** 由表單三欄字串解析數量（空白或非數字視為 0） */
export function parseInstrumentQtyFromDraftStrings(
  totalStation: string,
  rotatingLaser: string,
  lineLaser: string,
): WorkLogSiteInstrumentQty {
  return {
    totalStation: normInstrumentQtyInt(parseInt(String(totalStation).trim(), 10)),
    rotatingLaser: normInstrumentQtyInt(parseInt(String(rotatingLaser).trim(), 10)),
    lineLaser: normInstrumentQtyInt(parseInt(String(lineLaser).trim(), 10)),
  }
}

/** 舊自由文字盡量轉成三種儀器數量；無法辨識則全 0 */
export function parseLegacyEquipmentString(s: string): WorkLogSiteInstrumentQty {
  const out = emptyInstrumentQty()
  const t = (s ?? '').trim()
  if (!t) return out
  for (const { key, label } of WORK_LOG_INSTRUMENT_OPTIONS) {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const reQty = new RegExp(`${esc}\\s*[×x*＊]\\s*(\\d+)`, 'i')
    const m = reQty.exec(t)
    if (m) {
      out[key] = normInstrumentQtyInt(parseInt(m[1], 10))
      continue
    }
    if (t.includes(label)) out[key] = Math.max(out[key], 1)
  }
  return out
}

function migrateInstrumentQtyFromRaw(
  raw: unknown,
  legacyEquipment: string,
): WorkLogSiteInstrumentQty {
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    const q: WorkLogSiteInstrumentQty = {
      totalStation: normInstrumentQtyInt(o.totalStation),
      rotatingLaser: normInstrumentQtyInt(o.rotatingLaser),
      lineLaser: normInstrumentQtyInt(o.lineLaser),
    }
    if (instrumentQtyAnyPositive(q)) return q
  }
  return parseLegacyEquipmentString(legacyEquipment)
}

/** 整日誌內一案場區塊 */
export type WorkLogSiteBlock = {
  id: string
  siteName: string
  /** @deprecated 請用 workLines；讀舊檔時會轉成 workLines */
  workItem: string
  /** 該案場多筆工作（至少一列） */
  workLines: WorkLogSiteWorkLine[]
  /**
   * 儀器摘要（舊版自由文字或與 instrumentQty 對應之「全站儀×2」等）。
   * 新存檔：有 instrumentQty 時與 {@link formatInstrumentQty} 同步。
   */
  equipment: string
  /** 三種儀器台數；皆 0 且 equipment 有字時可能為舊資料無法解析 */
  instrumentQty: WorkLogSiteInstrumentQty
  remark: string
  staffLines: WorkLogStaffLine[]
}

/** 攤平／摘要用：有結構化數量則格式化，否則用舊 equipment 字串 */
export function blockEquipmentSummary(block: WorkLogSiteBlock): string {
  const q = block.instrumentQty ?? emptyInstrumentQty()
  if (instrumentQtyAnyPositive(q)) return formatInstrumentQty(q)
  return typeof block.equipment === 'string' ? block.equipment.trim() : ''
}

/** 整日一筆（備份／雲端 JSON 可完整還原） */
export type WorkLogDayDocument = {
  id: string
  logDate: string
  /** @deprecated 請用各 block 的 workItem；讀檔時會併入區塊後清空 */
  workItem: string
  /** @deprecated 請用各 block 的 equipment */
  equipment: string
  mealCost: number
  miscCost: number
  /** @deprecated 請用各 block 的 remark */
  remark: string
  blocks: WorkLogSiteBlock[]
  createdAt: string
  updatedAt: string
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `wl-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function todayYmdLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function normTime(s: unknown, fallback: string): string {
  if (typeof s === 'string' && TIME_RE.test(s.trim())) return s.trim()
  return fallback
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : 0
}

function staffListFromUnknown(o: Record<string, unknown>): string[] {
  if (Array.isArray(o.staffNames)) {
    return o.staffNames
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter(Boolean)
  }
  return []
}

/** 由結構化欄位產生一行式摘要（寫入 content 利於搜尋／舊版相容） */
export function buildWorkLogContentSummary(e: Pick<WorkLogEntry, 'staffNames' | 'siteName' | 'workItem' | 'remark'>): string {
  const parts: string[] = []
  if (e.staffNames.length)
    parts.push(`人員${e.staffNames.length}人：${e.staffNames.join('、')}`)
  if (e.siteName.trim()) parts.push(`案場：${siteBlockLabelForSummary(e.siteName)}`)
  if (e.workItem.trim()) parts.push(`內容：${e.workItem.trim()}`)
  if (e.remark.trim()) parts.push(e.remark.trim())
  return parts.join('｜') || '（無摘要）'
}

function migrateOne(e: unknown): WorkLogEntry | null {
  if (!e || typeof e !== 'object') return null
  const o = e as Record<string, unknown>
  const logDate =
    typeof o.logDate === 'string' && DATE_RE.test(o.logDate) ? o.logDate : todayYmdLocal()
  let siteName = typeof o.siteName === 'string' ? o.siteName : ''
  if (siteName === LEGACY_QUICK_SITE_JUN_ADJUST) siteName = QUICK_SITE_JUN_ADJUST
  const legacyContent = typeof o.content === 'string' ? o.content : ''
  const staffNames = staffListFromUnknown(o)
  const hasStruct =
    staffNames.length > 0 ||
    (typeof o.workItem === 'string' && o.workItem.trim()) ||
    (typeof o.equipment === 'string' && o.equipment.trim()) ||
    num(o.mealCost) !== 0 ||
    num(o.miscCost) !== 0 ||
    (typeof o.remark === 'string' && o.remark.trim()) ||
    (typeof o.timeStart === 'string' && o.timeStart) ||
    (typeof o.timeEnd === 'string' && o.timeEnd)

  const remark =
    typeof o.remark === 'string'
      ? o.remark
      : !hasStruct && legacyContent
        ? legacyContent
        : ''

  const entry: WorkLogEntry = {
    id: typeof o.id === 'string' && o.id.trim() ? o.id : newId(),
    logDate,
    siteName,
    staffNames: staffNames.length ? staffNames : [],
    timeStart: normTime(o.timeStart, DEFAULT_WORK_START),
    timeEnd: normTime(o.timeEnd, DEFAULT_WORK_END),
    workItem: typeof o.workItem === 'string' ? o.workItem : '',
    equipment: typeof o.equipment === 'string' ? o.equipment : '',
    mealCost: num(o.mealCost),
    miscCost: num(o.miscCost),
    remark,
    content: '',
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : nowIso(),
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : nowIso(),
  }
  entry.content = buildWorkLogContentSummary(entry)
  if (entry.content === '（無摘要）' && legacyContent.trim()) {
    entry.remark = entry.remark || legacyContent.trim()
    entry.content = legacyContent.trim()
  }
  return entry
}

function migrateCustomLabels(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return []
  const w = raw as { customWorkItemLabels?: unknown }
  if (!Array.isArray(w.customWorkItemLabels)) return []
  return [...new Set(w.customWorkItemLabels.map((x) => String(x).trim()).filter(Boolean))]
}

export function initialWorkLogState(): WorkLogState {
  return { entries: [], dayDocuments: [], customWorkItemLabels: [] }
}

export function migrateWorkLogState(raw: unknown): WorkLogState {
  const customWorkItemLabels = migrateCustomLabels(raw)
  if (!raw || typeof raw !== 'object') {
    return { entries: [], dayDocuments: [], customWorkItemLabels }
  }
  const w = raw as { entries?: unknown; dayDocuments?: unknown }
  if (!Array.isArray(w.entries)) {
    return { entries: [], dayDocuments: migrateDayDocuments(w.dayDocuments), customWorkItemLabels }
  }
  const entries = w.entries
    .map(migrateOne)
    .filter((x): x is WorkLogEntry => x !== null)
  return {
    entries,
    dayDocuments: migrateDayDocuments(w.dayDocuments),
    customWorkItemLabels,
  }
}

function migrateWorkLine(o: unknown): WorkLogSiteWorkLine {
  if (!o || typeof o !== 'object') {
    return { id: newId(), label: '' }
  }
  const r = o as Record<string, unknown>
  const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : newId()
  const label = typeof r.label === 'string' ? r.label : ''
  return { id, label: label.trim() }
}

export function newWorkLogSiteWorkLine(): WorkLogSiteWorkLine {
  return { id: newId(), label: '' }
}

/** 區塊內各列非空之工作文字 */
export function blockWorkLineLabels(block: WorkLogSiteBlock): string[] {
  const lines = block.workLines ?? []
  const fromLines = lines.map((wl) => wl.label.trim()).filter(Boolean)
  if (fromLines.length > 0) return fromLines
  const legacy = typeof block.workItem === 'string' ? block.workItem.trim() : ''
  return legacy ? [legacy] : []
}

/** 月曆／摘要：多筆時「第一筆（+N）」 */
export function blockWorkSummaryCompact(block: WorkLogSiteBlock): string {
  const parts = blockWorkLineLabels(block)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]!
  return `${parts[0]}（+${parts.length - 1}）`
}

/** 攤平 legacy entry 等：全部以分號串接 */
export function blockWorkSummaryJoined(block: WorkLogSiteBlock): string {
  return blockWorkLineLabels(block).join('；')
}

function migrateStaffLine(o: unknown): WorkLogStaffLine | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  const name = typeof r.name === 'string' ? r.name.trim() : ''
  if (!name) return null
  return {
    name,
    timeStart: normTime(r.timeStart, DEFAULT_WORK_START),
    timeEnd: normTime(r.timeEnd, DEFAULT_WORK_END),
  }
}

function migrateSiteBlock(o: unknown): WorkLogSiteBlock | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  const id = typeof r.id === 'string' && r.id.trim() ? r.id : newId()
  const siteName = typeof r.siteName === 'string' ? r.siteName : ''
  const workItem = typeof r.workItem === 'string' ? r.workItem : ''
  const equipmentField = typeof r.equipment === 'string' ? r.equipment : ''
  const remark = typeof r.remark === 'string' ? r.remark : ''
  const wlRaw = r.workLines
  let workLines: WorkLogSiteWorkLine[] = Array.isArray(wlRaw)
    ? wlRaw.map(migrateWorkLine)
    : []
  if (workLines.length === 0) {
    workLines = workItem.trim()
      ? [{ id: newId(), label: workItem.trim() }]
      : [newWorkLogSiteWorkLine()]
  } else if (
    workItem.trim() &&
    !workLines.some((wl) => wl.label.trim())
  ) {
    workLines = workLines.map((wl, i) => (i === 0 ? { ...wl, label: workItem.trim() } : wl))
  }
  const linesRaw = r.staffLines
  const staffLines: WorkLogStaffLine[] = []
  if (Array.isArray(linesRaw)) {
    for (const x of linesRaw) {
      const ln = migrateStaffLine(x)
      if (ln) staffLines.push(ln)
    }
    if (staffLines.length === 0) {
      for (const x of linesRaw) {
        if (!x || typeof x !== 'object') continue
        const r2 = x as Record<string, unknown>
        const name = typeof r2.name === 'string' ? r2.name : ''
        staffLines.push({
          name,
          timeStart: normTime(r2.timeStart, DEFAULT_WORK_START),
          timeEnd: normTime(r2.timeEnd, DEFAULT_WORK_END),
        })
      }
    }
  }
  if (staffLines.length === 0) {
    staffLines.push({
      name: '',
      timeStart: DEFAULT_WORK_START,
      timeEnd: DEFAULT_WORK_END,
    })
  }
  const instrumentQty = migrateInstrumentQtyFromRaw(r.instrumentQty, equipmentField)
  let equipmentOut = equipmentField.trim()
  if (instrumentQtyAnyPositive(instrumentQty)) {
    equipmentOut = formatInstrumentQty(instrumentQty)
  }
  return { id, siteName, workItem: '', equipment: equipmentOut, instrumentQty, remark, workLines, staffLines }
}

/** 舊版整日層 workItem／equipment／remark 併入各 block 後清空（新存檔僅用 block） */
function hoistLegacyDayLevelFieldsIntoBlocks(doc: WorkLogDayDocument): void {
  const legacyW = doc.workItem.trim()
  const legacyE = doc.equipment.trim()
  const legacyR = doc.remark.trim()
  if (!legacyW && !legacyE && !legacyR) return

  const blocks = doc.blocks ?? []
  const blockHasAnyWorkText = (b: WorkLogSiteBlock) =>
    (b.workLines ?? []).some((wl) => wl.label.trim()) || b.workItem.trim()
  const blockHasEquip = (b: WorkLogSiteBlock) =>
    instrumentQtyAnyPositive(b.instrumentQty ?? emptyInstrumentQty()) || b.equipment.trim()
  const anyBlockHas = blocks.some(
    (b) => blockHasAnyWorkText(b) || blockHasEquip(b) || b.remark.trim(),
  )
  if (!anyBlockHas) {
    for (const b of blocks) {
      if (legacyW) {
        const lines = b.workLines?.length ? [...b.workLines] : [newWorkLogSiteWorkLine()]
        lines[0] = { ...lines[0], label: lines[0].label.trim() || legacyW }
        b.workLines = lines
      }
      if (legacyE) {
        b.equipment = legacyE
        b.instrumentQty = parseLegacyEquipmentString(legacyE)
        if (instrumentQtyAnyPositive(b.instrumentQty)) b.equipment = formatInstrumentQty(b.instrumentQty)
      }
      if (legacyR) b.remark = legacyR
    }
  } else {
    for (const b of blocks) {
      if (!blockHasAnyWorkText(b) && legacyW) {
        const lines = b.workLines?.length ? [...b.workLines] : [newWorkLogSiteWorkLine()]
        lines[0] = { ...lines[0], label: lines[0].label.trim() || legacyW }
        b.workLines = lines
      }
      if (!blockHasEquip(b) && legacyE) {
        b.equipment = legacyE
        b.instrumentQty = parseLegacyEquipmentString(legacyE)
        if (instrumentQtyAnyPositive(b.instrumentQty)) b.equipment = formatInstrumentQty(b.instrumentQty)
      }
      if (!b.remark.trim() && legacyR) b.remark = legacyR
    }
  }
  doc.workItem = ''
  doc.equipment = ''
  doc.remark = ''
}

function migrateDayDocumentOne(o: unknown): WorkLogDayDocument | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  const logDate =
    typeof r.logDate === 'string' && DATE_RE.test(r.logDate) ? r.logDate : todayYmdLocal()
  const blocksRaw = r.blocks
  const blocks: WorkLogSiteBlock[] = []
  if (Array.isArray(blocksRaw)) {
    for (const b of blocksRaw) {
      const blk = migrateSiteBlock(b)
      if (blk) blocks.push(blk)
    }
  }
  const t0 = typeof r.createdAt === 'string' ? r.createdAt : nowIso()
  const t1 = typeof r.updatedAt === 'string' ? r.updatedAt : nowIso()
  if (blocks.length === 0) blocks.push(newSiteBlock())
  const doc: WorkLogDayDocument = {
    id: typeof r.id === 'string' && r.id.trim() ? r.id : newId(),
    logDate,
    workItem: typeof r.workItem === 'string' ? r.workItem : '',
    equipment: typeof r.equipment === 'string' ? r.equipment : '',
    mealCost: num(r.mealCost),
    miscCost: num(r.miscCost),
    remark: typeof r.remark === 'string' ? r.remark : '',
    blocks,
    createdAt: t0,
    updatedAt: t1,
  }
  hoistLegacyDayLevelFieldsIntoBlocks(doc)
  return doc
}

function migrateDayDocuments(raw: unknown): WorkLogDayDocument[] {
  if (!raw || !Array.isArray(raw)) return []
  return raw.map(migrateDayDocumentOne).filter((x): x is WorkLogDayDocument => x !== null)
}

/** 取得某日之整日文件（若無則 null） */
export function getDayDocument(
  state: Pick<WorkLogState, 'dayDocuments'>,
  logDate: string,
): WorkLogDayDocument | null {
  return (state.dayDocuments ?? []).find((d) => d.logDate === logDate) ?? null
}

/** 寫入或更新整日文件，並移除該日之 entries 舊筆 */
export function replaceDayDocument(state: WorkLogState, doc: WorkLogDayDocument): WorkLogState {
  const others = (state.dayDocuments ?? []).filter((d) => d.logDate !== doc.logDate)
  const entries = (state.entries ?? []).filter((e) => e.logDate !== doc.logDate)
  return {
    ...state,
    dayDocuments: [...others, doc],
    entries,
  }
}

/** 刪除某日整日文件（不動 entries；若需清空同日舊筆請另處理） */
export function removeDayDocument(state: WorkLogState, logDate: string): WorkLogState {
  return {
    ...state,
    dayDocuments: (state.dayDocuments ?? []).filter((d) => d.logDate !== logDate),
  }
}

/** 有整日文件之日期集合 */
export function datesWithDayDocumentsInMonth(
  dayDocuments: readonly WorkLogDayDocument[] | undefined,
  year: number,
  month1to12: number,
): Set<string> {
  const p = `${year}-${String(month1to12).padStart(2, '0')}-`
  const set = new Set<string>()
  for (const d of dayDocuments ?? []) {
    if (d.logDate.startsWith(p)) set.add(d.logDate)
  }
  return set
}

/** 月內任一有日誌或整日文件之日期 */
export function datesWithAnyLogInMonth(state: WorkLogState, year: number, month1to12: number): Set<string> {
  const set = datesWithEntriesInMonth(state.entries ?? [], year, month1to12)
  for (const d of datesWithDayDocumentsInMonth(state.dayDocuments, year, month1to12)) {
    set.add(d)
  }
  return set
}

/**
 * 公司損益表「工具」帶入：該曆月工作日誌雜項加總（整日文件同日僅計一次；有整日文件之日不計 `entries`）。
 */
export function sumWorkLogMiscCostInCalendarMonth(
  workLog: WorkLogState,
  year: number,
  month1to12: number,
): number {
  const prefix = `${year}-${String(month1to12).padStart(2, '0')}-`
  let sum = 0
  const docDates = new Set((workLog.dayDocuments ?? []).map((d) => d.logDate))
  for (const d of workLog.dayDocuments ?? []) {
    if (!d.logDate.startsWith(prefix)) continue
    const v = d.miscCost
    sum += typeof v === 'number' && Number.isFinite(v) ? v : 0
  }
  for (const e of workLog.entries ?? []) {
    if (!e.logDate.startsWith(prefix)) continue
    if (docDates.has(e.logDate)) continue
    const v = e.miscCost
    sum += typeof v === 'number' && Number.isFinite(v) ? v : 0
  }
  return Math.round(sum)
}

/** 同日多筆舊 entries 合併為整日文件（供首次開啟編輯） */
export function legacyEntriesToDayDocument(entries: readonly WorkLogEntry[]): WorkLogDayDocument | null {
  if (entries.length === 0) return null
  const logDate = entries[0].logDate
  if (entries.some((e) => e.logDate !== logDate)) return null
  const t = nowIso()
  const doc: WorkLogDayDocument = {
    id: newId(),
    logDate,
    workItem: '',
    equipment: '',
    mealCost: 0,
    miscCost: 0,
    remark: '',
    blocks: [],
    createdAt: t,
    updatedAt: t,
  }
  for (const e of entries) {
    if (e.mealCost !== 0) doc.mealCost = e.mealCost
    if (e.miscCost !== 0) doc.miscCost = e.miscCost
  }
  type SiteAgg = {
    block: WorkLogSiteBlock
    works: Set<string>
    equipments: Set<string>
    remarks: string[]
  }
  const bySite = new Map<string, SiteAgg>()
  for (const e of entries) {
    const siteKey = e.siteName.trim() || '__empty__'
    let agg = bySite.get(siteKey)
    if (!agg) {
      agg = {
        block: {
          id: newId(),
          siteName: e.siteName,
          workItem: '',
          workLines: [newWorkLogSiteWorkLine()],
          equipment: '',
          instrumentQty: emptyInstrumentQty(),
          remark: '',
          staffLines: [],
        },
        works: new Set(),
        equipments: new Set(),
        remarks: [],
      }
      bySite.set(siteKey, agg)
    }
    if (e.workItem.trim()) agg.works.add(e.workItem.trim())
    if (e.equipment.trim()) agg.equipments.add(e.equipment.trim())
    if (e.remark.trim()) agg.remarks.push(e.remark.trim())
    const seen = new Set(agg.block.staffLines.map((l) => l.name))
    for (const rawName of e.staffNames) {
      const name = rawName.trim()
      if (!name) continue
      if (seen.has(name)) continue
      seen.add(name)
      agg.block.staffLines.push({
        name,
        timeStart: e.timeStart,
        timeEnd: e.timeEnd,
      })
    }
  }
  for (const agg of bySite.values()) {
    const w = [...agg.works].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
    if (w.length === 0) {
      agg.block.workLines = [newWorkLogSiteWorkLine()]
    } else if (w.length === 1) {
      agg.block.workLines = [{ id: newId(), label: w[0]! }]
    } else {
      agg.block.workLines = w.map((label) => ({ id: newId(), label }))
    }
    agg.block.workItem = ''
    const eq = [...agg.equipments].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
    agg.block.equipment = eq.join('、') || ''
    agg.block.instrumentQty = parseLegacyEquipmentString(agg.block.equipment)
    if (instrumentQtyAnyPositive(agg.block.instrumentQty)) {
      agg.block.equipment = formatInstrumentQty(agg.block.instrumentQty)
    }
    agg.block.remark = agg.remarks.join('\n')
  }
  doc.blocks = [...bySite.values()].map((a) => a.block)
  return doc
}

/** 月曆／列表用：由整日文件產生精簡摘要（非儲存欄位） */
export function summarizeWorkLogDayDocument(doc: WorkLogDayDocument): {
  siteLabel: string
  staffCount: number
  staffLabel: string
  workLabel: string
} {
  const blocks = doc.blocks ?? []
  const siteKeyForAgg = (raw: string) => {
    const t = raw.trim()
    if (!t) return '（無案場）'
    if (isPlaceholderMonthBlockSiteName(t)) return '（草稿案場）'
    return t
  }
  const sites = [
    ...new Set(
      blocks
        .map((b) => b.siteName.trim())
        .filter((t) => t && !isPlaceholderMonthBlockSiteName(t)),
    ),
  ].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  const hasFormalSiteName = blocks.some(
    (b) => b.siteName.trim() && !isPlaceholderMonthBlockSiteName(b.siteName),
  )
  const hasDraftPlaceholderOnly =
    !hasFormalSiteName &&
    blocks.some((b) => isPlaceholderMonthBlockSiteName(b.siteName))
  const sitesForLabel =
    sites.length > 0 ? sites : hasDraftPlaceholderOnly ? ['（草稿案場）'] : []
  const uniq = new Set<string>()
  const bySite = new Map<string, Set<string>>()
  for (const b of blocks) {
    const key = siteKeyForAgg(b.siteName)
    let s = bySite.get(key)
    if (!s) {
      s = new Set()
      bySite.set(key, s)
    }
    for (const ln of b.staffLines ?? []) {
      const n = ln.name.trim()
      if (!n) continue
      uniq.add(n)
      s.add(n)
    }
  }
  const siteKeys = [...bySite.keys()].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  let staffLabel: string
  if (siteKeys.length > 1) {
    staffLabel = siteKeys
      .map((site) => {
        const names = [...(bySite.get(site) ?? [])].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
        return `${site}：\n${names.length ? names.join('\n') : '—'}`
      })
      .join('\n')
  } else {
    const sk = siteKeys[0] ?? ''
    const nameLines = [...uniq].sort((a, b) => a.localeCompare(b, 'zh-Hant')).join('\n')
    if (sk && uniq.size > 0) {
      staffLabel = `${sk}：\n${nameLines}`
    } else {
      staffLabel = nameLines || '—'
    }
  }
  const singleSiteForCalendar = siteKeys.length <= 1
  const workParts: string[] = []
  if (singleSiteForCalendar) {
    for (const b of blocks) {
      const w = blockWorkSummaryCompact(b)
      if (w) workParts.push(w)
    }
  } else {
    for (const b of blocks) {
      const w = blockWorkSummaryCompact(b)
      if (!w) continue
      const label = siteKeyForAgg(b.siteName)
      workParts.push(`${label}：\n${w}`)
    }
  }
  const workLabel =
    workParts.length > 0 ? workParts.join('\n') : doc.workItem.trim() || '—'
  return {
    siteLabel: sitesForLabel.join('\n') || '—',
    staffCount: uniq.size,
    staffLabel,
    workLabel,
  }
}

/**
 * 供相容舊邏輯：將整日文件攤成「虛擬」WorkLogEntry 列（不寫回 state.entries）。
 * 各案場區塊第一列帶該區塊工作（多列以分號串）／equipment／remark；餐費／雜項僅全日第一列，避免加總重複。
 */
export function flattenDayDocumentToLegacyEntries(doc: WorkLogDayDocument): WorkLogEntry[] {
  const t = doc.updatedAt
  let idx = 0
  const out: WorkLogEntry[] = []
  for (const b of doc.blocks ?? []) {
    let firstInBlock = true
    const workJoined = blockWorkSummaryJoined(b)
    for (const line of b.staffLines ?? []) {
      if (!line.name.trim()) continue
      const isFirstGlobal = idx === 0
      const entry: WorkLogEntry = {
        id: `d-${doc.id}-${idx}`,
        logDate: doc.logDate,
        siteName: b.siteName,
        staffNames: [line.name.trim()],
        timeStart: normTime(line.timeStart, DEFAULT_WORK_START),
        timeEnd: normTime(line.timeEnd, DEFAULT_WORK_END),
        workItem: firstInBlock ? workJoined : '',
        equipment: firstInBlock ? blockEquipmentSummary(b) : '',
        mealCost: isFirstGlobal ? doc.mealCost : 0,
        miscCost: isFirstGlobal ? doc.miscCost : 0,
        remark: firstInBlock ? b.remark : '',
        content: '',
        createdAt: t,
        updatedAt: t,
      }
      entry.content = buildWorkLogContentSummary(entry)
      out.push(entry)
      idx += 1
      firstInBlock = false
    }
  }
  return out
}

/** 有整日文件之日期不讀取 entries 同日資料，其餘用 entries */
export function effectiveEntriesForCalendar(state: WorkLogState): WorkLogEntry[] {
  const docDates = new Set((state.dayDocuments ?? []).map((d) => d.logDate))
  const legacy = (state.entries ?? []).filter((e) => !docDates.has(e.logDate))
  const synthetic = (state.dayDocuments ?? []).flatMap(flattenDayDocumentToLegacyEntries)
  return [...legacy, ...synthetic]
}

/** 估價「細項」欄不重複集合，供工作內容下拉使用 */
export function uniqueQuoteWorkItemLabels(rows: readonly QuoteRow[]): string[] {
  const s = new Set<string>()
  for (const r of rows) {
    const t = typeof r.item === 'string' ? r.item.trim() : ''
    if (t) s.add(t)
  }
  return [...s].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
}

/** 合併：估價各列「細項」字串 + 自訂字串，供日誌工作內容 datalist（不存估價 id） */
export function mergedWorkItemOptions(
  quoteRows: readonly QuoteRow[],
  custom: readonly string[],
): string[] {
  const set = new Set<string>([...uniqueQuoteWorkItemLabels(quoteRows), ...custom])
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
}

export function newWorkLogEntry(
  over: Partial<
    Pick<
      WorkLogEntry,
      | 'logDate'
      | 'siteName'
      | 'staffNames'
      | 'timeStart'
      | 'timeEnd'
      | 'workItem'
      | 'equipment'
      | 'mealCost'
      | 'miscCost'
      | 'remark'
      | 'content'
    >
  >,
): WorkLogEntry {
  const t = nowIso()
  const logDate =
    over.logDate && DATE_RE.test(over.logDate) ? over.logDate : todayYmdLocal()
  const staffNames = Array.isArray(over.staffNames)
    ? over.staffNames.map((x) => x.trim()).filter(Boolean)
    : []
  const entry: WorkLogEntry = {
    id: newId(),
    logDate,
    siteName: typeof over.siteName === 'string' ? over.siteName : '',
    staffNames,
    timeStart: normTime(over.timeStart, DEFAULT_WORK_START),
    timeEnd: normTime(over.timeEnd, DEFAULT_WORK_END),
    workItem: typeof over.workItem === 'string' ? over.workItem : '',
    equipment: typeof over.equipment === 'string' ? over.equipment : '',
    mealCost: num(over.mealCost),
    miscCost: num(over.miscCost),
    remark: typeof over.remark === 'string' ? over.remark : '',
    content: typeof over.content === 'string' ? over.content : '',
    createdAt: t,
    updatedAt: t,
  }
  if (!entry.content) entry.content = buildWorkLogContentSummary(entry)
  return entry
}

/** 依日期新→舊，同日依更新時間。 */
export function sortWorkLogEntries(e: WorkLogEntry[]): WorkLogEntry[] {
  return [...e].sort((a, b) => {
    const c = b.logDate.localeCompare(a.logDate)
    if (c !== 0) return c
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

/** 某日所有日誌（日期字串 YYYY-MM-DD） */
export function entriesForDate(
  entries: readonly WorkLogEntry[] | undefined,
  ymd: string,
): WorkLogEntry[] {
  return (entries ?? []).filter((e) => e.logDate === ymd)
}

/** 某年某月有日誌的日期集合 */
export function datesWithEntriesInMonth(
  entries: readonly WorkLogEntry[],
  year: number,
  month1to12: number,
): Set<string> {
  const p = `${year}-${String(month1to12).padStart(2, '0')}-`
  const set = new Set<string>()
  for (const e of entries) {
    if (e.logDate.startsWith(p)) set.add(e.logDate)
  }
  return set
}

export function newSiteBlock(): WorkLogSiteBlock {
  return {
    id: newId(),
    siteName: '',
    workItem: '',
    workLines: [newWorkLogSiteWorkLine()],
    equipment: '',
    instrumentQty: emptyInstrumentQty(),
    remark: '',
    staffLines: [
      {
        name: '',
        timeStart: DEFAULT_WORK_START,
        timeEnd: DEFAULT_WORK_END,
      },
    ],
  }
}

export function newWorkLogDayDocument(logDate: string, blocks?: WorkLogSiteBlock[]): WorkLogDayDocument {
  const t = nowIso()
  const bs = blocks?.length ? blocks : [newSiteBlock()]
  return {
    id: newId(),
    logDate,
    workItem: '',
    equipment: '',
    mealCost: 0,
    miscCost: 0,
    remark: '',
    blocks: bs,
    createdAt: t,
    updatedAt: t,
  }
}

function workLogSiteRenameMatch(siteName: string, oldExact: string): boolean {
  const oldTrim = oldExact.trim()
  const p = siteName
  return p === oldExact || (oldTrim !== '' && p.trim() === oldTrim)
}

/**
 * 與月表「全書案場更名」同步：單筆 `entries` 與整日 `dayDocuments` 區塊之案名相符者改為新名，並重算單筆 `content`。
 */
export function renameWorkLogSiteNames(
  state: WorkLogState,
  oldExact: string,
  newNameTrimmed: string,
): WorkLogState {
  const newT = newNameTrimmed.trim()
  const entries = state.entries.map((e) => {
    if (!workLogSiteRenameMatch(e.siteName, oldExact)) return e
    const next = { ...e, siteName: newT }
    return { ...next, content: buildWorkLogContentSummary(next) }
  })
  const dayDocuments = (state.dayDocuments ?? []).map((doc) => ({
    ...doc,
    blocks: doc.blocks.map((b) =>
      workLogSiteRenameMatch(b.siteName, oldExact) ? { ...b, siteName: newT } : b,
    ),
  }))
  return { ...state, entries, dayDocuments }
}

/** 多案場 UI：具名案場種類數（去重） */
export function countDistinctNamedSites(blocks: readonly { siteName: string }[]): number {
  return new Set(
    blocks
      .map((b) => b.siteName.trim())
      .filter((t) => t && !isPlaceholderMonthBlockSiteName(t)),
  ).size
}

export function newWorkLogEntityId(): string {
  return newId()
}
