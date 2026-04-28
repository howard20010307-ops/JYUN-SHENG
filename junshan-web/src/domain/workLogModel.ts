/** 營運／施工日誌；與薪水案場、估價細項、快速登記可連動。 */

import type { QuoteRow } from './quoteEngine'
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
  /** 雜項支出（元；可與公司帳工具欄加帳連動） */
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
  /** 結構化日誌本體 */
  entries: WorkLogEntry[]
  /** 工作內容自訂選項（與估價細項合併顯示於選單） */
  customWorkItemLabels: string[]
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
  if (e.siteName.trim()) parts.push(`案場：${e.siteName.trim()}`)
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
  return { entries: [], customWorkItemLabels: [] }
}

export function migrateWorkLogState(raw: unknown): WorkLogState {
  const customWorkItemLabels = migrateCustomLabels(raw)
  if (!raw || typeof raw !== 'object') {
    return { entries: [], customWorkItemLabels }
  }
  const w = raw as { entries?: unknown }
  if (!Array.isArray(w.entries)) {
    return { entries: [], customWorkItemLabels }
  }
  const entries = w.entries
    .map(migrateOne)
    .filter((x): x is WorkLogEntry => x !== null)
  return {
    entries,
    customWorkItemLabels,
  }
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

/** 合併：估價細項 + 自訂選項 */
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
export function entriesForDate(entries: readonly WorkLogEntry[], ymd: string): WorkLogEntry[] {
  return entries.filter((e) => e.logDate === ymd)
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
