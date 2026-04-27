/**
 * Excel《估價表》成本區欄位（A～Q）；A、B 表頭與試算表欄名同文，見 quoteExcelCanonical。
 */
import { QUOTE_HEAD_ITEM, QUOTE_HEAD_STAGE } from './quoteExcelCanonical'

export const QUOTE_TABLE_COLUMNS = [
  { letter: 'A', label: QUOTE_HEAD_STAGE, key: 'stage' },
  { letter: 'B', label: QUOTE_HEAD_ITEM, key: 'item' },
  { letter: 'C', label: '相同樓層數', key: 'sameFloors' },
  { letter: 'D', label: '單層基準工數', key: 'basePerFloor' },
  { letter: 'E', label: '基礎總工數', key: 'baseTotal', computed: true },
  { letter: 'F', label: '風險係數(%)', key: 'riskPct' },
  { letter: 'G', label: '單趟計價工數', key: 'pricingPerTrip', computed: true },
  { letter: 'H', label: '總計價工數', key: 'pricingTotal', computed: true },
  { letter: 'I', label: '全測站', key: 'totalStation' },
  { letter: 'J', label: '旋轉雷射', key: 'rotLaser' },
  { letter: 'K', label: '墨線儀', key: 'lineLaser' },
  { letter: 'L', label: '單層細項單項成本', key: 'miscPerFloor' },
  { letter: 'M', label: '模組細項單項成本', key: 'miscModule', computed: true },
  { letter: 'N', label: '單趟儀器成本', key: 'instrumentTrip', computed: true },
  { letter: 'O', label: '模組儀器成本', key: 'instrumentModule', computed: true },
  { letter: 'P', label: '單層細項計價', key: 'floorQuote', computed: true },
  { letter: 'Q', label: '區域細項合計計價', key: 'regionQuote', computed: true },
] as const
