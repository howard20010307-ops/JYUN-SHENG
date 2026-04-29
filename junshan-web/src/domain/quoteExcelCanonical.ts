/**
 * 與《估價表》細項等用字對齊（畫面成本表已不顯示「樓層／階段」直欄，改以模組橫幅區分）：
 * 基礎／地下室／地上段細項依業務定義完整列出；每層×每細項獨立一列供填寫。
 */

/** 舊版 A 欄表頭（試算表或匯出仍可能使用） */
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
]

/**
 * 地下室 B2、B3… 及 B1F 同一套 8 行（B1 與非 B1 之細項名稱相同，欄 C 各層獨立展開批次）
 */
export const EXCEL_BASEMENT_ITEMS: readonly string[] = [
  '樓板放樣',
  'FL+100高度放樣',
  '樓梯放樣',
  '車道放樣',
  '模板上預留筋放樣(第一次)',
  '二層筋上預留筋放樣(第二次)',
  '標高器放置',
  '門窗FL+100高程放樣',
]

/**
 * 1F、夾層、正常樓、RF 同一套 10 行（與地下室 8 行不同：含外露樑、隔間、室內外門窗高程、柱心線等）
 */
export const EXCEL_ABOVE_STANDARD_ITEMS: readonly string[] = [
  '樓板放樣',
  'FL+100高度放樣',
  '樓梯放樣',
  '外露樑位置及造型放樣',
  '模板上預留筋放樣(第一次)',
  '二層筋上預留筋放樣(第二次)',
  '標高器放置',
  '隔間放樣',
  '門窗及室外FL+100高程放樣',
  '柱心線放樣',
]

/**
 * 「每項工程細項計價」表列序：基礎 → 地下室細項 → 地上段細項，同名細項只出現一次（加總仍含各區）。
 */
export function canonicalQuoteItemOrder(): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of [
    EXCEL_FOUNDATION_ITEMS,
    EXCEL_BASEMENT_ITEMS,
    EXCEL_ABOVE_STANDARD_ITEMS,
  ]) {
    for (const item of list) {
      if (seen.has(item)) continue
      seen.add(item)
      out.push(item)
    }
  }
  return out
}
