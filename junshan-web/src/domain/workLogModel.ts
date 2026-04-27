/** 一則營運／施工日誌；與薪水案場可關聯。 */

export type WorkLogEntry = {
  id: string
  /** YYYY-MM-DD */
  logDate: string
  /** 從薪水簿帶出之案名；空字串＝不指定 */
  siteName: string
  content: string
  createdAt: string
  updatedAt: string
}

export type WorkLogState = {
  entries: WorkLogEntry[]
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
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function migrateOne(e: unknown): WorkLogEntry | null {
  if (!e || typeof e !== 'object') return null
  const o = e as Record<string, unknown>
  const logDate =
    typeof o.logDate === 'string' && DATE_RE.test(o.logDate) ? o.logDate : todayYmdLocal()
  return {
    id: typeof o.id === 'string' && o.id.trim() ? o.id : newId(),
    logDate,
    siteName: typeof o.siteName === 'string' ? o.siteName : '',
    content: typeof o.content === 'string' ? o.content : '',
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : nowIso(),
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : nowIso(),
  }
}

export function initialWorkLogState(): WorkLogState {
  return { entries: [] }
}

export function migrateWorkLogState(raw: unknown): WorkLogState {
  if (!raw || typeof raw !== 'object') return initialWorkLogState()
  const w = raw as { entries?: unknown }
  if (!Array.isArray(w.entries)) return initialWorkLogState()
  const entries = w.entries
    .map(migrateOne)
    .filter((x): x is WorkLogEntry => x !== null)
  return { entries }
}

/** 新日誌，預設當天、內文空白。 */
export function newWorkLogEntry(over: Partial<Pick<WorkLogEntry, 'logDate' | 'siteName' | 'content'>>): WorkLogEntry {
  const t = nowIso()
  return {
    id: newId(),
    logDate: over.logDate && DATE_RE.test(over.logDate) ? over.logDate : todayYmdLocal(),
    siteName: typeof over.siteName === 'string' ? over.siteName : '',
    content: typeof over.content === 'string' ? over.content : '',
    createdAt: t,
    updatedAt: t,
  }
}

/** 依日期新→舊，同日依更新時間。 */
export function sortWorkLogEntries(e: WorkLogEntry[]): WorkLogEntry[] {
  return [...e].sort((a, b) => {
    const c = b.logDate.localeCompare(a.logDate)
    if (c !== 0) return c
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}
