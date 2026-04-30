import type { WorkLogState } from './workLogModel'
import { sortWorkItemLabelsList } from './workLogModel'

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
 */
export function migrateWorkItemPresetLabels(
  loaded: unknown,
  workLog: WorkLogState,
): string[] {
  const defaults = initialSortedWorkItemPresetLabels()
  const legacyCustom = workLog.customWorkItemLabels ?? []
  const fromFile = Array.isArray(loaded)
    ? loaded.map((x) => String(x).trim()).filter(Boolean)
    : []
  if (fromFile.length > 0) {
    return sortWorkItemLabelsList([...fromFile, ...legacyCustom])
  }
  return sortWorkItemLabelsList([...defaults, ...legacyCustom])
}

/** JSONBin 首載合併：聯集後再依字長排序（與本機／雲端各自新增的項目都保留） */
export function mergeWorkItemPresetLabelsPreferLocal(
  local: readonly string[],
  cloud: readonly string[],
): string[] {
  return sortWorkItemLabelsList([...local, ...cloud])
}
