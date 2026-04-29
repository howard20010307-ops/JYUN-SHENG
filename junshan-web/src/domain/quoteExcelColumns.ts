/**
 * Excel《估價表》成本區欄位（畫面為 A～P＋操作）；首欄「細項」見 quoteExcelCanonical。
 */
import { QUOTE_HEAD_ITEM } from './quoteExcelCanonical'

export const QUOTE_TABLE_COLUMNS = [
  { letter: 'A', label: QUOTE_HEAD_ITEM, key: 'item' },
  { letter: 'B', label: '相同樓層數', key: 'sameFloors' },
  { letter: 'C', label: '單層基準工數', key: 'basePerFloor' },
  { letter: 'D', label: '基礎總工數', key: 'baseTotal', computed: true },
  { letter: 'E', label: '風險係數(%)', key: 'riskPct' },
  { letter: 'F', label: '單趟計價工數', key: 'pricingPerTrip', computed: true },
  { letter: 'G', label: '總計價工數', key: 'pricingTotal', computed: true },
  { letter: 'H', label: '全測站', key: 'totalStation' },
  { letter: 'I', label: '旋轉雷射', key: 'rotLaser' },
  { letter: 'J', label: '墨線儀', key: 'lineLaser' },
  { letter: 'K', label: '單層細項單項成本', key: 'miscPerFloor' },
  { letter: 'L', label: '模組細項單項成本', key: 'miscModule', computed: true },
  { letter: 'M', label: '單趟儀器成本', key: 'instrumentTrip', computed: true },
  { letter: 'N', label: '模組儀器成本', key: 'instrumentModule', computed: true },
  { letter: 'O', label: '單層細項計價', key: 'floorQuote', computed: true },
  { letter: 'P', label: '區域細項合計計價', key: 'regionQuote', computed: true },
] as const
