/**
 * 與手邊《鈞泩估價表》Excel 左兩欄（A 樓層／階段、B 細項）用字對齊：
 * 全形標點、空白與區段名集中於此，勿在多處複製貼上。
 */

/** A 欄表頭（Excel 常為全形斜線） */
export const QUOTE_HEAD_STAGE = '樓層／階段'

/** B 欄表頭 */
export const QUOTE_HEAD_ITEM = '細項'

/** A 欄區段名（與試算表欄 A 合併區文字一致） */
export const EXCEL_STAGE = {
  /** 基礎工程 */
  foundation: '基礎工程',
  /** 地下室(除B1F以外) */
  basementExceptB1F: '地下室(除B1F以外)',
  b1f: 'B1F',
  f1: '1F',
  mezzanine: '夾層',
  typical: '正常樓',
  rf: 'RF',
} as const

/** 基礎工程 B 欄 14 行（列序＝表內由上而下） */
export const EXCEL_FOUNDATION_ITEMS: readonly string[] = [
  '點位收測',
  'GL+100 高程放樣',
  '連續壁或鋼板樁位置放樣',
  '挖改樁放樣',
  '中間樁放樣',
  '開挖深度高程放樣',
  '機械停車位位置放樣',
  'PC 高程放樣',
  '基礎放樣',
  'BASE，地梁及水箱蓋湧築完成面高程放樣',
  '點位位置放樣',
  '水箱蓋上預留筋放樣（第一次）',
  '二層筋上預留筋放樣（第二次）',
  '地梁、承台與圖面位置覆測（必要時）',
]

/** 地下室區（除 B1／B1F）B 欄 8 行 */
export const EXCEL_BASEMENT_ITEMS: readonly string[] = [
  '模板放樣',
  'FL+100 高程放樣',
  '樓梯放樣',
  '車道放樣',
  '樓板上預留筋放樣（第一次）',
  '二層筋上預留筋放樣（第二次）',
  '標高器放置',
  '門窗FL+100 高程放樣',
]

/** 地上標準套組（夾層／正常樓／RF）B 欄 10 行 */
export const EXCEL_ABOVE_STANDARD_ITEMS: readonly string[] = [
  '樓板放樣',
  'FL+100高度放樣',
  '轉軸放樣',
  '外露樑位置及造型放樣',
  '模板上預留筋放樣（第一次）',
  '二層筋上預留筋放樣（第二次）',
  '標高器放置',
  '隔間放樣',
  '門窗及室外FL+100高程放樣',
  '柱心線放樣',
]

/** 1F 專用 B 欄 2 行 */
export const EXCEL_FIRST_FLOOR_ITEMS: readonly string[] = [
  '門窗及室外FL+100高程放樣',
  '柱心線放樣',
]
