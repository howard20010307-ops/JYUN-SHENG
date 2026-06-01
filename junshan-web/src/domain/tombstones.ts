/**
 * 通用「刪除墓碑」資料結構與輔助函式。
 *
 * 為何需要墓碑：JSONBin 同步採「本機 ↔ 雲端兩邊聯集」之合併策略；若本機剛刪掉一筆 id 為 `X` 之
 * 紀錄、尚未 push 至雲端，下一次以雲端為底再合本機便會把 `X` 帶回，使「刪除」不會 stick。
 *
 * 解法：刪除一筆紀錄時同步寫下 `{ id/value, deletedAt }` 之墓碑；
 * `migrate`／`merge` 兩處皆讀墓碑、把仍出現在資料中的死 id 過濾掉，並把雙邊墓碑取聯集（同 id 取較新之刪除時刻）。
 *
 * 為了支援兩種子系統：
 *   - 以「id 字串」為鍵：例如收帳列／合約內容列／工作日誌條目／薪水月表月與案場區塊／計價列
 *   - 以「值字串」為鍵：例如 `workItemPresetLabels` 與 `workLog.customWorkItemLabels`
 * 兩者本質相同（皆為「某字串 → 刪除時刻」），故共用一份結構與函式。
 *
 * 預設墓碑保留期：1 年。1 年後若仍未復活，視為各裝置已吸收，可丟。
 */
export type Tombstone = {
  /** 已刪除之識別字串：list with id 即原本的 `id`；list of strings 即原本的 value 本身。 */
  id: string
  /** 刪除時刻（毫秒，{@link Date.now}）；同 id 合併取較大值。 */
  deletedAt: number
}

/**
 * 預設墓碑保留期：30 天（毫秒）。
 *
 * 取捨：足以 cover 一般「另一台手機／舊筆電擱了一個月才開」之離線情境；
 * 30 天到期未復活之 id 視為各裝置已吸收該刪除事件，可丟。再短（例如 1 分鐘）會讓沒同步過該刪除事件
 * 之裝置一連線就把資料帶回，視同無墓碑；再長則 JSONBin 雲檔徒增無用墓碑體積。
 */
export const DEFAULT_TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * 將任意輸入正規化為墓碑陣列：
 *   - 丟掉非陣列／非物件之雜訊；
 *   - 丟掉空字串／非數字之 `deletedAt`；
 *   - 同 id 多筆取較大之 `deletedAt`；
 *   - `now - deletedAt > ttlMs` 之過期墓碑切除；
 *   - 結果以 id 字典序排序，便於跨裝置雜湊比對。
 */
export function normalizeTombstones(
  list: unknown,
  options: { now?: number; ttlMs?: number } = {},
): Tombstone[] {
  const now = options.now ?? Date.now()
  const ttlMs = options.ttlMs ?? DEFAULT_TOMBSTONE_TTL_MS
  if (!Array.isArray(list)) return []
  const map = new Map<string, number>()
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as { id?: unknown; deletedAt?: unknown }
    const id = typeof r.id === 'string' ? r.id.trim() : ''
    if (!id) continue
    const t =
      typeof r.deletedAt === 'number' && Number.isFinite(r.deletedAt) ? Math.floor(r.deletedAt) : 0
    if (now - t > ttlMs) continue
    const prev = map.get(id)
    if (prev === undefined || t > prev) map.set(id, t)
  }
  return [...map.entries()]
    .map(([id, deletedAt]) => ({ id, deletedAt }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

/** 雙邊墓碑聯集；同 id 取較新之刪除時刻；過期者切除。 */
export function mergeTombstones(
  a: Tombstone[] | undefined,
  b: Tombstone[] | undefined,
  options: { now?: number; ttlMs?: number } = {},
): Tombstone[] {
  return normalizeTombstones([...(a ?? []), ...(b ?? [])], options)
}

/** 把單筆「現在刪除某 id」附加到既有墓碑名單；同 id 自動取較新者。 */
export function appendTombstone(
  current: Tombstone[] | undefined,
  id: string,
  deletedAt: number = Date.now(),
  options: { ttlMs?: number } = {},
): Tombstone[] {
  return mergeTombstones(current, [{ id, deletedAt }], { now: deletedAt, ttlMs: options.ttlMs })
}

/** 一次刪多筆（例：批次清空、整月案場區塊一起刪）。 */
export function appendTombstones(
  current: Tombstone[] | undefined,
  ids: readonly string[],
  deletedAt: number = Date.now(),
  options: { ttlMs?: number } = {},
): Tombstone[] {
  if (ids.length === 0) return normalizeTombstones(current ?? [])
  const adds = ids.map((id) => ({ id, deletedAt }))
  return mergeTombstones(current, adds, { now: deletedAt, ttlMs: options.ttlMs })
}

/** 把墓碑套用到一組「以 id 為鍵」的紀錄：丟掉所有 id 在墓碑名單中之紀錄。 */
export function applyTombstonesById<T extends { id: string }>(
  items: readonly T[],
  tombstones: Tombstone[] | undefined,
): T[] {
  if (!tombstones || tombstones.length === 0) return items.slice()
  const dead = new Set(tombstones.map((t) => t.id))
  return items.filter((x) => !dead.has(x.id))
}

/** 把墓碑套用到一組「值即鍵」之字串清單（例：customWorkItemLabels）。 */
export function applyTombstonesByValue(
  values: readonly string[],
  tombstones: Tombstone[] | undefined,
): string[] {
  if (!tombstones || tombstones.length === 0) return values.slice()
  const dead = new Set(tombstones.map((t) => t.id))
  return values.filter((v) => !dead.has(v))
}
