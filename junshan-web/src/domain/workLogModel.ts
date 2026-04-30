/** 營運／施工日誌；與薪水案場、全站工作內容預設清單、快速登記可連動。 */

import type { QuoteRow } from './quoteEngine'
import {
  isPlaceholderMonthBlockSiteName,
  siteBlockLabelForSummary,
} from './salaryExcelModel'
import {
  LEGACY_QUICK_SITE_JUN_ADJUST,
  normalizeQuickSiteKey,
  QUICK_SITE_JUN_ADJUST,
} from './fieldworkQuickApply'
import { allocateWithSuffix, stableHash16 } from './stableIds'

/** 整日文件根 id（同_finalize_首段；重複同日由 {@link finalizeWorkLogStableIds} 加 `~2`）。 */
export function stableWorkLogDayDocBaseId(logDate: string): string {
  return `wldoc--${logDate}`
}

/** 與 {@link finalizeWorkLogStableIds} 一致之區塊／列 id，供新建與表單即時使用。 */
export function stableWorkLogBlockId(docId: string, blockIndex: number): string {
  return `wlblk--${docId}--b--${blockIndex}`
}

export function stableWorkLogWorkLineId(
  docId: string,
  blockIndex: number,
  lineIndex: number,
): string {
  return `wlln--${docId}--${blockIndex}--${lineIndex}`
}

export function stableWorkLogToolLineId(docId: string, toolIndex: number): string {
  return `wltl--${docId}--${toolIndex}`
}

/**
 * 表單／草稿：有已存 `docId` 時沿用，否則以日期得 canonical id（與新文件預設相同）。
 */
export function canonicalWorkLogDayDocIdForDraft(
  logDate: string,
  docId: string | null | undefined,
): string {
  const t = (docId ?? '').trim()
  if (t) return t
  return stableWorkLogDayDocBaseId(logDate)
}

const TIME_RE = /^\d{1,2}:\d{2}$/

export const DEFAULT_WORK_START = '07:30'
export const DEFAULT_WORK_END = '16:30'

/** 整日層級：單筆工具支出；多筆加總入公司損益表「工具」（以 {@link WorkLogDayToolLine.amount} 為準） */
export type WorkLogDayToolLine = {
  id: string
  /** 工具／項目名稱 */
  name: string
  /** 數量（未存檔之舊資料視為 1） */
  qty: number
  /** 單位（如：組、個、支） */
  unit: string
  /** 金額（元，該列小計） */
  amount: number
}

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
  /** 工作內容（預設清單或自填文字） */
  workItem: string
  /** 使用儀器 */
  equipment: string
  /** 餐費（元；與登記金額一致之紀錄） */
  mealCost: number
  /** 雜項支出（元；可與公司損益表「工具」欄加帳連動） */
  miscCost: number
  /** 儀器支出（元）；公司損益表「儀器」欄由日誌加總帶入 */
  instrumentCost: number
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
  /** 舊版自訂字串；升級時會併入全站 `workItemPresetLabels`，保留欄位以相容舊檔 */
  customWorkItemLabels: string[]
}

/** 單一施工人員於某案場之上下班 */
export type WorkLogStaffLine = {
  name: string
  /** HH:mm */
  timeStart: string
  /** HH:mm */
  timeEnd: string
  /**
   * 計工數（天），與薪水月表該案場該日格一致；存檔後寫回月表。
   * 缺省或無效值視為 1；0 表示該列不計出工（仍保留姓名列時寫回 0）。
   */
  workDays: number
}

/**
 * 案場區塊內一筆工作（僅存文字）。
 * 輸入選項來自全站「工作內容預設清單」與舊版自訂字串，僅供挑選文字。
 */
export type WorkLogSiteWorkLine = {
  id: string
  /** 工作描述（與預設清單項同名時也只是同一串字） */
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

/** 工作日誌儀器支出單價（元／台），依當日各案場區塊台數加總後寫入「儀器支出」 */
export const WORK_LOG_INSTRUMENT_UNIT_PRICE_TOTAL_STATION = 2000
export const WORK_LOG_INSTRUMENT_UNIT_PRICE_ROTATING_LASER = 500
export const WORK_LOG_INSTRUMENT_UNIT_PRICE_LINE_LASER = 100

/** 依三種儀器台數計算支出（元）；台數以 0～999 計 */
export function instrumentExpenseFromQty(q: WorkLogSiteInstrumentQty): number {
  const cap = (n: unknown) => {
    const v = typeof n === 'number' ? n : parseInt(String(n).trim(), 10)
    if (!Number.isFinite(v) || v < 0) return 0
    return Math.min(999, Math.floor(v))
  }
  return Math.round(
    cap(q.totalStation) * WORK_LOG_INSTRUMENT_UNIT_PRICE_TOTAL_STATION +
    cap(q.rotatingLaser) * WORK_LOG_INSTRUMENT_UNIT_PRICE_ROTATING_LASER +
    cap(q.lineLaser) * WORK_LOG_INSTRUMENT_UNIT_PRICE_LINE_LASER,
  )
}

/** 加總各案場區塊之儀器台數（整日） */
export function aggregateInstrumentQtyFromSiteBlocks(
  blocks: readonly { instrumentQty?: WorkLogSiteInstrumentQty }[],
): WorkLogSiteInstrumentQty {
  const o = emptyInstrumentQty()
  for (const b of blocks) {
    const q = b.instrumentQty ?? emptyInstrumentQty()
    o.totalStation += q.totalStation
    o.rotatingLaser += q.rotatingLaser
    o.lineLaser += q.lineLaser
  }
  return {
    totalStation: Math.min(9999, o.totalStation),
    rotatingLaser: Math.min(9999, o.rotatingLaser),
    lineLaser: Math.min(9999, o.lineLaser),
  }
}

/** 整日儀器支出：各區塊台數加總後乘單價 */
export function instrumentExpenseFromSiteBlocks(
  blocks: readonly { instrumentQty?: WorkLogSiteInstrumentQty }[],
): number {
  return instrumentExpenseFromQty(aggregateInstrumentQtyFromSiteBlocks(blocks))
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
  /** 棟別（例：A棟） */
  dong: string
  /** 樓層 */
  floorLevel: string
  /** 階段（例：結構、粗裝） */
  workPhase: string
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
  /**
   * 舊版單欄「雜項／工具」金額；若 {@link WorkLogDayDocument.toolLines} 有資料，損益表以 toolLines 加總為準，此欄仍寫入與加總一致。
   */
  miscCost: number
  /** 當日多筆具名工具支出；有資料時損益「工具」以加總本列為準 */
  toolLines?: WorkLogDayToolLine[]
  /** 儀器支出（元）；與 {@link WorkLogEntry.instrumentCost} 同義，整日一筆 */
  instrumentCost: number
  /** @deprecated 請用各 block 的 remark */
  remark: string
  blocks: WorkLogSiteBlock[]
  createdAt: string
  updatedAt: string
}

/** 依目前 `doc.id` 重排巢狀 id（列／工具列索引）；不改變整日業務欄位。 */
export function normalizeWorkLogDayDocumentNestedIds(doc: WorkLogDayDocument): WorkLogDayDocument {
  const docId = doc.id
  const blocks = (doc.blocks ?? []).map((b, bi) => ({
    ...b,
    id: stableWorkLogBlockId(docId, bi),
    workLines: (b.workLines ?? []).map((wl, li) => ({
      ...wl,
      id: stableWorkLogWorkLineId(docId, bi, li),
    })),
  }))
  const tls = doc.toolLines
  const toolLines =
    Array.isArray(tls) && tls.length > 0
      ? tls.map((tl, ti) => ({
          ...tl,
          id: stableWorkLogToolLineId(docId, ti),
        }))
      : tls
  return { ...doc, blocks, toolLines }
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

export const DEFAULT_STAFF_WORK_DAYS = 1

/** 計工數（天）：與月表格線相同語意；負數或非有限數改為 1；上限 99 */
export function normStaffWorkDays(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').trim().replace(/,/g, ''))
  if (!Number.isFinite(n) || n < 0) return DEFAULT_STAFF_WORK_DAYS
  if (n === 0) return 0
  return Math.min(99, Math.round(n * 1000) / 1000)
}

/** 整日表單「計工數」欄：空白視為 1 */
export function staffWorkDaysFromDraftString(raw: string | undefined): number {
  const t = String(raw ?? '').trim().replace(/,/g, '')
  if (t === '') return DEFAULT_STAFF_WORK_DAYS
  return normStaffWorkDays(t)
}

function staffListFromUnknown(o: Record<string, unknown>): string[] {
  if (Array.isArray(o.staffNames)) {
    return o.staffNames
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter(Boolean)
  }
  return []
}

/** 整日文件：所有具名施工列之計工數加總（天） */
export function sumStaffWorkDaysInDayDocument(doc: WorkLogDayDocument): number {
  let sum = 0
  for (const b of doc.blocks ?? []) {
    for (const ln of b.staffLines ?? []) {
      if (!ln.name.trim()) continue
      sum += normStaffWorkDays(ln.workDays)
    }
  }
  return Math.round(sum * 1000) / 1000
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
    num(o.instrumentCost) !== 0 ||
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
    id: '',
    logDate,
    siteName,
    staffNames: staffNames.length ? staffNames : [],
    timeStart: normTime(o.timeStart, DEFAULT_WORK_START),
    timeEnd: normTime(o.timeEnd, DEFAULT_WORK_END),
    workItem: typeof o.workItem === 'string' ? o.workItem : '',
    equipment: typeof o.equipment === 'string' ? o.equipment : '',
    mealCost: num(o.mealCost),
    miscCost: num(o.miscCost),
    instrumentCost: num(o.instrumentCost),
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
  const fromFile = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : ''
  entry.id = fromFile || `wle--${stableHash16(workLogEntryCloudMergeFingerprint(entry))}`
  return entry
}

function migrateCustomLabels(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return []
  const w = raw as { customWorkItemLabels?: unknown }
  if (!Array.isArray(w.customWorkItemLabels)) return []
  return sortWorkItemLabelsList(w.customWorkItemLabels.map((x) => String(x)))
}

export function initialWorkLogState(): WorkLogState {
  return { entries: [], dayDocuments: [], customWorkItemLabels: [] }
}

export function migrateWorkLogState(raw: unknown): WorkLogState {
  const customWorkItemLabels = migrateCustomLabels(raw)
  if (!raw || typeof raw !== 'object') {
    return finalizeWorkLogStableIds({
      entries: [],
      dayDocuments: [],
      customWorkItemLabels,
    })
  }
  const w = raw as { entries?: unknown; dayDocuments?: unknown }
  if (!Array.isArray(w.entries)) {
    return finalizeWorkLogStableIds({
      entries: [],
      dayDocuments: migrateDayDocuments(w.dayDocuments),
      customWorkItemLabels,
    })
  }
  const entries = w.entries
    .map(migrateOne)
    .filter((x): x is WorkLogEntry => x !== null)
  return finalizeWorkLogStableIds({
    entries,
    dayDocuments: migrateDayDocuments(w.dayDocuments),
    customWorkItemLabels,
  })
}

function compareWorkLogEntryByDateId(a: WorkLogEntry, b: WorkLogEntry): number {
  const c = a.logDate.localeCompare(b.logDate)
  if (c !== 0) return c
  return a.id.localeCompare(b.id)
}

const WL_MERGE_FP_SEP = '\u001f'

/** JSONBin 合併後、同內容不同 id 之舊式 entries 去重指紋 */
function workLogEntryCloudMergeFingerprint(e: WorkLogEntry): string {
  const site = normalizeQuickSiteKey((e.siteName ?? '').trim())
  const staffSorted = [...new Set((e.staffNames ?? []).map((s) => s.trim()).filter(Boolean))].sort()
  const parts = [
    (e.logDate ?? '').trim(),
    site,
    staffSorted.join(WL_MERGE_FP_SEP),
    (e.timeStart ?? '').trim(),
    (e.timeEnd ?? '').trim(),
    (e.workItem ?? '').trim(),
    (e.equipment ?? '').trim(),
    String(typeof e.mealCost === 'number' && Number.isFinite(e.mealCost) ? e.mealCost : 0),
    String(typeof e.miscCost === 'number' && Number.isFinite(e.miscCost) ? e.miscCost : 0),
    String(
      typeof e.instrumentCost === 'number' && Number.isFinite(e.instrumentCost)
        ? e.instrumentCost
        : 0,
    ),
    (e.remark ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim(),
    (e.content ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim(),
  ]
  return parts.join(WL_MERGE_FP_SEP)
}

/** 載入／同步後：日誌條目與整日文件內巢狀 id 改為可重現鍵，與本機／雲端一致。 */
export function finalizeWorkLogStableIds(state: WorkLogState): WorkLogState {
  const usedEntry = new Set<string>()
  const entries = [...state.entries]
    .sort(compareWorkLogEntryByDateId)
    .map((e) => {
      const base = `wle--${stableHash16(workLogEntryCloudMergeFingerprint(e))}`
      const id = allocateWithSuffix(base, usedEntry)
      usedEntry.add(id)
      return { ...e, id }
    })

  const usedDoc = new Set<string>()
  const dayDocuments = (state.dayDocuments ?? [])
    .map((doc) => {
      const ld = doc.logDate
      const docId = allocateWithSuffix(`wldoc--${ld}`, usedDoc)
      usedDoc.add(docId)
      const blocks = (doc.blocks ?? []).map((b, bi) => {
        const bid = stableWorkLogBlockId(docId, bi)
        const workLines = (b.workLines ?? []).map((wl, li) => ({
          ...wl,
          id: stableWorkLogWorkLineId(docId, bi, li),
        }))
        return { ...b, id: bid, workLines }
      })
      const tls = doc.toolLines
      const toolLines =
        Array.isArray(tls) && tls.length > 0
          ? tls.map((tl, ti) => ({
              ...tl,
              id: stableWorkLogToolLineId(docId, ti),
            }))
          : tls
      return {
        ...doc,
        id: docId,
        blocks,
        toolLines,
      }
    })
    .sort((a, b) => a.logDate.localeCompare(b.logDate))

  return { ...state, entries, dayDocuments }
}

function dedupeWorkLogEntriesAfterIdMerge(
  entries: WorkLogEntry[],
  localIds: Set<string>,
): WorkLogEntry[] {
  const byFp = new Map<string, WorkLogEntry[]>()
  for (const e of entries) {
    const fp = workLogEntryCloudMergeFingerprint(e)
    const arr = byFp.get(fp)
    if (arr) arr.push(e)
    else byFp.set(fp, [e])
  }
  const out: WorkLogEntry[] = []
  for (const group of byFp.values()) {
    if (group.length === 1) {
      out.push(group[0])
      continue
    }
    const fromLocal = group.filter((e) => localIds.has(e.id))
    const pick =
      fromLocal.length > 0
        ? fromLocal.slice().sort(compareWorkLogEntryByDateId)[0]
        : group.slice().sort((a, b) => a.id.localeCompare(b.id))[0]
    out.push(pick)
  }
  return out.sort(compareWorkLogEntryByDateId)
}

/**
 * 與收帳 `mergeReceivablesPreferLocal` 同策略：`entries` 以 `id`、整日文件以 `logDate` 聯集，同鍵本機優先；
 * `entries` 再依**業務指紋**去重（同內容不同 id 只留一筆，優先本機 id）。
 * 供 JSONBin 首載等，避免整包覆寫抹掉本機手輸之日誌。
 */
export function mergeWorkLogPreferLocal(
  local: WorkLogState,
  remote: WorkLogState,
): WorkLogState {
  const l = migrateWorkLogState(local)
  const r = migrateWorkLogState(remote)

  const localEntryIds = new Set(l.entries.map((e) => e.id))

  const byEntryId = new Map<string, WorkLogEntry>()
  for (const e of r.entries) byEntryId.set(e.id, e)
  for (const e of l.entries) byEntryId.set(e.id, e)
  const entries = dedupeWorkLogEntriesAfterIdMerge([...byEntryId.values()], localEntryIds)

  const byLogDate = new Map<string, WorkLogDayDocument>()
  for (const d of r.dayDocuments ?? []) byLogDate.set(d.logDate, d)
  for (const d of l.dayDocuments ?? []) byLogDate.set(d.logDate, d)
  const dayDocuments = [...byLogDate.values()].sort((a, b) => a.logDate.localeCompare(b.logDate))

  const mergedLabels = sortWorkItemLabelsList(
    [...new Set([...(r.customWorkItemLabels ?? []), ...(l.customWorkItemLabels ?? [])])].map((x) =>
      String(x),
    ),
  )

  return finalizeWorkLogStableIds({
    entries,
    dayDocuments,
    customWorkItemLabels: mergedLabels,
  })
}

function migrateWorkLine(
  o: unknown,
  docId: string,
  blockIndex: number,
  lineIndex: number,
): WorkLogSiteWorkLine {
  if (!o || typeof o !== 'object') {
    return { id: stableWorkLogWorkLineId(docId, blockIndex, lineIndex), label: '' }
  }
  const r = o as Record<string, unknown>
  const id =
    typeof r.id === 'string' && r.id.trim()
      ? r.id.trim()
      : stableWorkLogWorkLineId(docId, blockIndex, lineIndex)
  const label = typeof r.label === 'string' ? r.label : ''
  return { id, label: label.trim() }
}

export function newWorkLogSiteWorkLine(
  docId: string,
  blockIndex: number,
  lineIndex: number,
): WorkLogSiteWorkLine {
  return { id: stableWorkLogWorkLineId(docId, blockIndex, lineIndex), label: '' }
}

/** 區塊內各列非空之工作文字 */
export function blockWorkLineLabels(block: WorkLogSiteBlock): string[] {
  const lines = block.workLines ?? []
  const fromLines = lines.map((wl) => wl.label.trim()).filter(Boolean)
  if (fromLines.length > 0) return fromLines
  const legacy = typeof block.workItem === 'string' ? block.workItem.trim() : ''
  return legacy ? [legacy] : []
}

/** 棟／樓層／階段一行摘要（攤平 entries、備註合併等用；月曆「工作」欄請用 {@link blockWorkSummaryCompact}） */
export function formatSiteBlockMetaLine(
  b: Pick<WorkLogSiteBlock, 'dong' | 'floorLevel' | 'workPhase'>,
): string {
  const parts: string[] = []
  const d = (b.dong ?? '').trim()
  const f = (b.floorLevel ?? '').trim()
  const p = (b.workPhase ?? '').trim()
  if (d) parts.push(`棟 ${d}`)
  if (f) parts.push(`樓層 ${f}`)
  if (p) parts.push(`階段 ${p}`)
  return parts.join('；')
}

/** 月曆／摘要：多筆時「第一筆（+N）」（不含棟／樓層／階段，與月曆格「工作」欄一致） */
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
    workDays: normStaffWorkDays(r.workDays),
  }
}

function migrateSiteBlock(o: unknown, docId: string, blockIndex: number): WorkLogSiteBlock | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  const id =
    typeof r.id === 'string' && r.id.trim()
      ? r.id.trim()
      : stableWorkLogBlockId(docId, blockIndex)
  const siteName = typeof r.siteName === 'string' ? r.siteName : ''
  const workItem = typeof r.workItem === 'string' ? r.workItem : ''
  const equipmentField = typeof r.equipment === 'string' ? r.equipment : ''
  const remark = typeof r.remark === 'string' ? r.remark : ''
  const wlRaw = r.workLines
  let workLines: WorkLogSiteWorkLine[] = Array.isArray(wlRaw)
    ? wlRaw.map((x, li) => migrateWorkLine(x, docId, blockIndex, li))
    : []
  if (workLines.length === 0) {
    workLines = workItem.trim()
      ? [{ id: stableWorkLogWorkLineId(docId, blockIndex, 0), label: workItem.trim() }]
      : [newWorkLogSiteWorkLine(docId, blockIndex, 0)]
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
          workDays: normStaffWorkDays(r2.workDays),
        })
      }
    }
  }
  if (staffLines.length === 0) {
    staffLines.push({
      name: '',
      timeStart: DEFAULT_WORK_START,
      timeEnd: DEFAULT_WORK_END,
      workDays: DEFAULT_STAFF_WORK_DAYS,
    })
  }
  const instrumentQty = migrateInstrumentQtyFromRaw(r.instrumentQty, equipmentField)
  let equipmentOut = equipmentField.trim()
  if (instrumentQtyAnyPositive(instrumentQty)) {
    equipmentOut = formatInstrumentQty(instrumentQty)
  }
  const dong = typeof r.dong === 'string' ? r.dong : ''
  const floorLevel = typeof r.floorLevel === 'string' ? r.floorLevel : ''
  const workPhase = typeof r.workPhase === 'string' ? r.workPhase : ''
  return {
    id,
    siteName,
    workItem: '',
    equipment: equipmentOut,
    instrumentQty,
    remark,
    workLines,
    dong,
    floorLevel,
    workPhase,
    staffLines,
  }
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
  const blockHasSiteMeta = (b: WorkLogSiteBlock) =>
    (b.dong ?? '').trim() || (b.floorLevel ?? '').trim() || (b.workPhase ?? '').trim()
  const anyBlockHas = blocks.some(
    (b) => blockHasAnyWorkText(b) || blockHasEquip(b) || b.remark.trim() || blockHasSiteMeta(b),
  )
  if (!anyBlockHas) {
    for (let bi = 0; bi < blocks.length; bi++) {
      const b = blocks[bi]!
      if (legacyW) {
        const lines = b.workLines?.length
          ? [...b.workLines]
          : [newWorkLogSiteWorkLine(doc.id, bi, 0)]
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
    for (let bi = 0; bi < blocks.length; bi++) {
      const b = blocks[bi]!
      if (!blockHasAnyWorkText(b) && legacyW) {
        const lines = b.workLines?.length
          ? [...b.workLines]
          : [newWorkLogSiteWorkLine(doc.id, bi, 0)]
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

function migrateToolLineOne(o: unknown, docId: string, toolIndex: number): WorkLogDayToolLine | null {
  if (!o || typeof o !== 'object') return null
  const x = o as Record<string, unknown>
  const id =
    typeof x.id === 'string' && x.id.trim()
      ? x.id.trim()
      : stableWorkLogToolLineId(docId, toolIndex)
  const name = typeof x.name === 'string' ? x.name : ''
  const amount = num(x.amount)
  let qty = 1
  const qRaw = x.qty
  if (typeof qRaw === 'number' && Number.isFinite(qRaw) && qRaw > 0) qty = Math.min(1e6, qRaw)
  else if (typeof qRaw === 'string' && qRaw.trim()) {
    const qn = parseFloat(qRaw.trim().replace(/,/g, ''))
    if (Number.isFinite(qn) && qn > 0) qty = Math.min(1e6, qn)
  }
  const unit = typeof x.unit === 'string' ? x.unit.trim() : ''
  return { id, name, qty, unit, amount }
}

function migrateToolLinesArray(raw: unknown, docId: string): WorkLogDayToolLine[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: WorkLogDayToolLine[] = []
  for (const it of raw) {
    const t = migrateToolLineOne(it, docId, out.length)
    if (t && (t.name.trim() || t.amount !== 0 || t.unit.trim() || t.qty !== 1)) out.push(t)
  }
  return out.length ? out : undefined
}

function migrateDayDocumentOne(o: unknown): WorkLogDayDocument | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  const logDate =
    typeof r.logDate === 'string' && DATE_RE.test(r.logDate) ? r.logDate : todayYmdLocal()
  const docIdForNested =
    typeof r.id === 'string' && r.id.trim()
      ? r.id.trim()
      : stableWorkLogDayDocBaseId(logDate)
  const blocksRaw = r.blocks
  const blocks: WorkLogSiteBlock[] = []
  if (Array.isArray(blocksRaw)) {
    for (let bi = 0; bi < blocksRaw.length; bi++) {
      const blk = migrateSiteBlock(blocksRaw[bi], docIdForNested, bi)
      if (blk) blocks.push(blk)
    }
  }
  const t0 = typeof r.createdAt === 'string' ? r.createdAt : nowIso()
  const t1 = typeof r.updatedAt === 'string' ? r.updatedAt : nowIso()
  if (blocks.length === 0) blocks.push(newSiteBlock(docIdForNested, 0))
  const doc: WorkLogDayDocument = {
    id: docIdForNested,
    logDate,
    workItem: typeof r.workItem === 'string' ? r.workItem : '',
    equipment: typeof r.equipment === 'string' ? r.equipment : '',
    mealCost: num(r.mealCost),
    miscCost: num(r.miscCost),
    toolLines: migrateToolLinesArray(r.toolLines, docIdForNested),
    instrumentCost: num(r.instrumentCost),
    remark: typeof r.remark === 'string' ? r.remark : '',
    blocks,
    createdAt: t0,
    updatedAt: t1,
  }
  hoistLegacyDayLevelFieldsIntoBlocks(doc)
  if (doc.toolLines?.length) {
    let s = 0
    for (const L of doc.toolLines) {
      s += typeof L.amount === 'number' && Number.isFinite(L.amount) ? L.amount : 0
    }
    doc.miscCost = Math.round(s)
  }
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

/**
 * 刪除某日整日文件，並一併移除該日 {@link WorkLogEntry}。
 * 用於「整日改存到其他日」後清掉舊日，避免月曆仍顯示舊日有紀錄。
 */
export function removeDayDocumentAndEntries(state: WorkLogState, logDate: string): WorkLogState {
  return {
    ...state,
    dayDocuments: (state.dayDocuments ?? []).filter((d) => d.logDate !== logDate),
    entries: (state.entries ?? []).filter((e) => e.logDate !== logDate),
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
 * 整日文件「工具」金額：有 {@link WorkLogDayDocument.toolLines} 時為各列加總，否則為 {@link WorkLogDayDocument.miscCost}。
 */
export function dayDocumentToolExpenseSum(doc: WorkLogDayDocument): number {
  const lines = doc.toolLines
  if (Array.isArray(lines) && lines.length > 0) {
    let s = 0
    for (const L of lines) {
      const a = typeof L?.amount === 'number' && Number.isFinite(L.amount) ? L.amount : 0
      s += a
    }
    return Math.round(s)
  }
  const v = doc.miscCost
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0
}

/**
 * 公司損益表「工具」帶入：該曆月工作日誌工具支出加總（整日文件同日僅計一次；有整日文件之日不計 `entries`）。
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
    sum += dayDocumentToolExpenseSum(d)
  }
  for (const e of workLog.entries ?? []) {
    if (!e.logDate.startsWith(prefix)) continue
    if (docDates.has(e.logDate)) continue
    const v = e.miscCost
    sum += typeof v === 'number' && Number.isFinite(v) ? v : 0
  }
  return Math.round(sum)
}

/**
 * 公司損益表「儀器」帶入：該曆月工作日誌儀器支出加總（整日文件同日僅計一次；有整日文件之日不計 `entries`）。
 */
export function sumWorkLogInstrumentCostInCalendarMonth(
  workLog: WorkLogState,
  year: number,
  month1to12: number,
): number {
  const prefix = `${year}-${String(month1to12).padStart(2, '0')}-`
  let sum = 0
  const docDates = new Set((workLog.dayDocuments ?? []).map((d) => d.logDate))
  for (const d of workLog.dayDocuments ?? []) {
    if (!d.logDate.startsWith(prefix)) continue
    const v = d.instrumentCost
    sum += typeof v === 'number' && Number.isFinite(v) ? v : 0
  }
  for (const e of workLog.entries ?? []) {
    if (!e.logDate.startsWith(prefix)) continue
    if (docDates.has(e.logDate)) continue
    const v = e.instrumentCost
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
  const docId = stableWorkLogDayDocBaseId(logDate)
  const doc: WorkLogDayDocument = {
    id: docId,
    logDate,
    workItem: '',
    equipment: '',
    mealCost: 0,
    miscCost: 0,
    instrumentCost: 0,
    remark: '',
    blocks: [],
    createdAt: t,
    updatedAt: t,
  }
  for (const e of entries) {
    if (e.mealCost !== 0) doc.mealCost = e.mealCost
    if (e.miscCost !== 0) doc.miscCost = e.miscCost
    if (e.instrumentCost !== 0) doc.instrumentCost = e.instrumentCost
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
          id: '',
          siteName: e.siteName,
          workItem: '',
          workLines: [],
          equipment: '',
          instrumentQty: emptyInstrumentQty(),
          remark: '',
          dong: '',
          floorLevel: '',
          workPhase: '',
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
        workDays: DEFAULT_STAFF_WORK_DAYS,
        name,
        timeStart: e.timeStart,
        timeEnd: e.timeEnd,
      })
    }
  }
  const ordered = [...bySite.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh-Hant'))
  doc.blocks = ordered.map(([_, agg], bi) => {
    const w = [...agg.works].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
    const workLines =
      w.length === 0
        ? [newWorkLogSiteWorkLine(docId, bi, 0)]
        : w.map((label, li) => ({ id: stableWorkLogWorkLineId(docId, bi, li), label }))
    const eq = [...agg.equipments].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
    const equipmentJoined = eq.join('、') || ''
    const instrumentQty = parseLegacyEquipmentString(equipmentJoined)
    let equipmentOut = equipmentJoined
    if (instrumentQtyAnyPositive(instrumentQty)) {
      equipmentOut = formatInstrumentQty(instrumentQty)
    }
    return {
      ...agg.block,
      id: stableWorkLogBlockId(docId, bi),
      workLines,
      workItem: '',
      equipment: equipmentOut,
      instrumentQty,
      remark: agg.remarks.join('\n'),
    }
  })
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
 * 各案場區塊第一列帶該區塊工作（多列以分號串）／equipment／remark；餐費／雜項／儀器支出僅全日第一列，避免加總重複。
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
      const metaLine = formatSiteBlockMetaLine(b)
      const remarkBlock = [metaLine, (b.remark ?? '').trim()].filter(Boolean).join('\n')
      const entry: WorkLogEntry = {
        id: `wlflat--${doc.id}--${String(idx).padStart(6, '0')}`,
        logDate: doc.logDate,
        siteName: b.siteName,
        staffNames: [line.name.trim()],
        timeStart: normTime(line.timeStart, DEFAULT_WORK_START),
        timeEnd: normTime(line.timeEnd, DEFAULT_WORK_END),
        workItem: firstInBlock ? workJoined : '',
        equipment: firstInBlock ? blockEquipmentSummary(b) : '',
        mealCost: isFirstGlobal ? doc.mealCost : 0,
        miscCost: isFirstGlobal ? doc.miscCost : 0,
        instrumentCost: isFirstGlobal ? doc.instrumentCost : 0,
        remark: firstInBlock ? remarkBlock : '',
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

/** 工作內容選項排序：先依字元數（字長），相同再依繁中比對 */
export function compareWorkItemLabels(a: string, b: string): number {
  const la = [...a].length
  const lb = [...b].length
  if (la !== lb) return la - lb
  return a.localeCompare(b, 'zh-Hant')
}

/** 去空白、去重後依字長＋筆畫排序（供 datalist 與自訂標籤儲存） */
export function sortWorkItemLabelsList(labels: readonly string[]): string[] {
  return [...new Set(labels.map((x) => String(x).trim()).filter(Boolean))].sort(compareWorkItemLabels)
}

/** 估價「細項」欄不重複集合（估價頁自用；工作日誌選項已改為獨立預設清單） */
export function uniqueQuoteWorkItemLabels(rows: readonly QuoteRow[]): string[] {
  const s = new Set<string>()
  for (const r of rows) {
    const t = typeof r.item === 'string' ? r.item.trim() : ''
    if (t) s.add(t)
  }
  return [...s].sort(compareWorkItemLabels)
}

/** 合併：全站預設清單 + `workLog.customWorkItemLabels`（舊資料），供日誌 datalist */
export function mergedWorkItemOptions(
  presetLabels: readonly string[],
  legacyCustom: readonly string[],
): string[] {
  return sortWorkItemLabelsList([...presetLabels, ...legacyCustom])
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
      | 'instrumentCost'
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
    id: '',
    logDate,
    siteName: typeof over.siteName === 'string' ? over.siteName : '',
    staffNames,
    timeStart: normTime(over.timeStart, DEFAULT_WORK_START),
    timeEnd: normTime(over.timeEnd, DEFAULT_WORK_END),
    workItem: typeof over.workItem === 'string' ? over.workItem : '',
    equipment: typeof over.equipment === 'string' ? over.equipment : '',
    mealCost: num(over.mealCost),
    miscCost: num(over.miscCost),
    instrumentCost: num(over.instrumentCost),
    remark: typeof over.remark === 'string' ? over.remark : '',
    content: typeof over.content === 'string' ? over.content : '',
    createdAt: t,
    updatedAt: t,
  }
  if (!entry.content) entry.content = buildWorkLogContentSummary(entry)
  entry.id = `wle--${stableHash16(workLogEntryCloudMergeFingerprint(entry))}`
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

export function newSiteBlock(docId: string, blockIndex: number): WorkLogSiteBlock {
  return {
    id: stableWorkLogBlockId(docId, blockIndex),
    siteName: '',
    workItem: '',
    workLines: [newWorkLogSiteWorkLine(docId, blockIndex, 0)],
    equipment: '',
    instrumentQty: emptyInstrumentQty(),
    remark: '',
    dong: '',
    floorLevel: '',
    workPhase: '',
    staffLines: [
      {
        name: '',
        timeStart: DEFAULT_WORK_START,
        timeEnd: DEFAULT_WORK_END,
        workDays: DEFAULT_STAFF_WORK_DAYS,
      },
    ],
  }
}

export function newWorkLogDayDocument(logDate: string, blocks?: WorkLogSiteBlock[]): WorkLogDayDocument {
  const t = nowIso()
  const docId = stableWorkLogDayDocBaseId(logDate)
  const bs = blocks?.length ? blocks : [newSiteBlock(docId, 0)]
  return normalizeWorkLogDayDocumentNestedIds({
    id: docId,
    logDate,
    workItem: '',
    equipment: '',
    mealCost: 0,
    miscCost: 0,
    instrumentCost: 0,
    remark: '',
    blocks: bs,
    createdAt: t,
    updatedAt: t,
  })
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
