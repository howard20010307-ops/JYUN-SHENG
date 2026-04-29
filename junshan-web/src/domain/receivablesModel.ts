/** 收帳：每列一筆實際入帳（案名、階段、未稅／稅／含稅） */

export type ReceivableEntryId = string

export type ReceivableEntry = {
  id: ReceivableEntryId
  /** 入帳日 YYYY-MM-DD */
  bookedDate: string
  /** 案名 */
  projectName: string
  /** 階段 */
  phaseLabel: string
  net: number
  tax: number
  note: string
}

export type ReceivablesState = {
  entries: ReceivableEntry[]
}

export function grossOf(net: number, tax: number): number {
  const n = typeof net === 'number' && Number.isFinite(net) ? net : 0
  const t = typeof tax === 'number' && Number.isFinite(tax) ? tax : 0
  return n + t
}

export function initialReceivablesState(): ReceivablesState {
  return { entries: [] }
}

/** 與月表「全書案場更名」同步：僅 `projectName` 字元完全等於 `oldExact` 者更新 */
export function renameReceivableProjectNames(
  state: ReceivablesState,
  oldExact: string,
  newNameTrimmed: string,
): ReceivablesState {
  const newT = newNameTrimmed.trim()
  return {
    entries: state.entries.map((e) =>
      e.projectName === oldExact ? { ...e, projectName: newT } : e,
    ),
  }
}

function num(v: unknown, d = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d
}

function str(v: unknown, d = ''): string {
  return typeof v === 'string' ? v : d
}

function migrateEntriesArray(raw: unknown[]): ReceivableEntry[] {
  const out: ReceivableEntry[] = []
  const seen = new Set<string>()
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const id = str(r.id, '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    const bookedDate = str(r.bookedDate, str(r.receivedDate, ''))
    out.push({
      id,
      bookedDate,
      projectName: str(r.projectName, ''),
      phaseLabel: str(r.phaseLabel, ''),
      net: num(r.net, 0),
      tax: num(r.tax, 0),
      note: str(r.note, ''),
    })
  }
  return out
}

/** 舊版：projects / phases / receipts → 只遷移實收列 */
function migrateLegacyNested(o: Record<string, unknown>): ReceivablesState {
  const projectsRaw = Array.isArray(o.projects) ? o.projects : []
  const projectNameById = new Map<string, string>()
  for (const row of projectsRaw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const id = str(r.id, '').trim()
    if (!id) continue
    projectNameById.set(id, str(r.name, '未命名'))
  }

  const phasesRaw = Array.isArray(o.phases) ? o.phases : []
  const phaseInfo = new Map<string, { projectName: string; label: string }>()
  for (const row of phasesRaw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const id = str(r.id, '').trim()
    const pid = str(r.projectId, '').trim()
    if (!id) continue
    phaseInfo.set(id, {
      projectName: projectNameById.get(pid) ?? '',
      label: str(r.label, ''),
    })
  }

  const receiptsRaw = Array.isArray(o.receipts) ? o.receipts : []
  const entries: ReceivableEntry[] = []
  const seen = new Set<string>()
  for (const row of receiptsRaw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const id = str(r.id, '').trim()
    const phaseId = str(r.phaseId, '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    const info = phaseInfo.get(phaseId)
    entries.push({
      id,
      bookedDate: str(r.receivedDate, ''),
      projectName: info?.projectName ?? '',
      phaseLabel: info?.label ?? '',
      net: num(r.net, 0),
      tax: num(r.tax, 0),
      note: str(r.note, ''),
    })
  }
  return { entries }
}

export function migrateReceivablesState(loaded: unknown): ReceivablesState {
  const init = initialReceivablesState()
  if (!loaded || typeof loaded !== 'object') return init
  const o = loaded as Record<string, unknown>

  if (Array.isArray(o.entries)) {
    return { entries: migrateEntriesArray(o.entries) }
  }

  if (Array.isArray(o.receipts) && (o.receipts as unknown[]).length > 0) {
    return migrateLegacyNested(o)
  }

  return init
}

export function sumEntriesNetTaxGross(entries: ReceivableEntry[]): {
  net: number
  tax: number
  gross: number
} {
  let net = 0
  let tax = 0
  for (const e of entries) {
    net += typeof e.net === 'number' && Number.isFinite(e.net) ? e.net : 0
    tax += typeof e.tax === 'number' && Number.isFinite(e.tax) ? e.tax : 0
  }
  return { net, tax, gross: net + tax }
}

/** 依入帳日年月（YYYY-MM）加總，供日後帶入公司帳 */
export function sumEntriesInMonth(
  entries: ReceivableEntry[],
  yearMonth: string,
): { net: number; tax: number; gross: number } {
  const prefix = yearMonth.trim()
  if (!/^\d{4}-\d{2}$/.test(prefix)) {
    return { net: 0, tax: 0, gross: 0 }
  }
  const inMonth = entries.filter(
    (e) => typeof e.bookedDate === 'string' && e.bookedDate.startsWith(prefix),
  )
  return sumEntriesNetTaxGross(inMonth)
}

export function newReceivableId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `rcv-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}
