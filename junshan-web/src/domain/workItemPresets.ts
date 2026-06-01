import type { WorkLogState } from './workLogModel'
import { sortWorkItemLabelsList } from './workLogModel'
import {
  appendTombstone,
  applyTombstonesByValue,
  mergeTombstones,
  normalizeTombstones,
  type Tombstone,
} from './tombstones'

/** 預設「工作內容」選項（載入後會再經 {@link sortWorkItemLabelsList} 依字長排序） */
const RAW_WORK_ITEM_PRESET_LABELS: readonly string[] = [
  '點位收測',
  'GL+100高程放樣',
  '連續壁或鋼板樁位置放樣',
  '地改樁放樣',
  '中間樁放樣',
  '開挖深度高程放樣',
  '機械停車位位置放樣',
  'PC高程放樣',
  '基礎放樣',
  'BASE,地梁及水箱蓋灌漿完成面高度放樣',
  '地梁位置放樣',
  '水箱蓋上預留筋放樣(第一次)',
  '二層筋上預留筋放樣(第二次)',
  '標高器放置',
  '樓板放樣',
  'FL+100高度放樣',
  '樓梯放樣',
  '車道放樣',
  '模板上預留筋放樣(第一次)',
  '門窗FL+100高程放樣',
  '外露樑位置及造型放樣',
  '隔間放樣',
  '門窗及室外FL+100高程放樣',
  '柱心線放樣',
]

export function initialSortedWorkItemPresetLabels(): string[] {
  return sortWorkItemLabelsList([...RAW_WORK_ITEM_PRESET_LABELS])
}

/**
 * 舊存檔無 `workItemPresetLabels` 時用預設表，並合併 `workLog.customWorkItemLabels`（去重排序）。
 * 若檔內已有陣列，仍合併舊自訂欄位一次，避免升級後選項消失。
 *
 * 若同時提供墓碑名單（`tombstones` 或 `workLog.deletedCustomWorkItemLabels`），會把已刪選項先濾掉，
 * 避免從舊備份／雲端帶回曾經刪過之項目。
 */
export function migrateWorkItemPresetLabels(
  loaded: unknown,
  workLog: WorkLogState,
  tombstones?: Tombstone[],
): string[] {
  const defaults = initialSortedWorkItemPresetLabels()
  const legacyCustom = workLog.customWorkItemLabels ?? []
  const fromFile = Array.isArray(loaded)
    ? loaded.map((x) => String(x).trim()).filter(Boolean)
    : []
  const deadFromState = workLog.deletedCustomWorkItemLabels ?? []
  const dead = mergeTombstones(deadFromState, tombstones)
  const merged =
    fromFile.length > 0
      ? sortWorkItemLabelsList([...fromFile, ...legacyCustom])
      : sortWorkItemLabelsList([...defaults, ...legacyCustom])
  return applyTombstonesByValue(merged, dead)
}

/** 將任意輸入正規化為 `workItemPresetLabels` 之墓碑陣列（鍵為字串本身）。 */
export function normalizeWorkItemPresetLabelTombstones(raw: unknown): Tombstone[] {
  return normalizeTombstones(raw)
}

/** 在墓碑名單上記下「現在刪除某 label」。 */
export function appendWorkItemPresetLabelTombstone(
  current: Tombstone[] | undefined,
  label: string,
  deletedAt: number = Date.now(),
): Tombstone[] {
  const t = label.trim()
  if (!t) return current ?? []
  return appendTombstone(current, t, deletedAt)
}

/**
 * JSONBin 首載合併：聯集後再依字長排序（與本機／雲端各自新增的項目都保留）。
 * 同時聯集兩邊墓碑、把已刪選項濾掉，避免「刪了又被雲端帶回」。
 */
export function mergeWorkItemPresetLabelsPreferLocal(
  local: readonly string[],
  cloud: readonly string[],
  localTombstones?: Tombstone[],
  cloudTombstones?: Tombstone[],
): { labels: string[]; tombstones: Tombstone[] } {
  const tombstones = mergeTombstones(localTombstones, cloudTombstones)
  const labels = applyTombstonesByValue(
    sortWorkItemLabelsList([...local, ...cloud]),
    tombstones,
  )
  return { labels, tombstones }
}
