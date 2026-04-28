/**
 * 放樣估價「每層計價工數」「每項工程細項計價」儲存格 hover 拆解（與薪資總表同一 SummaryCellBreakdownLine 形狀）。
 */

import type { SummaryCellBreakdownLine } from './salaryExcelModel'
import {
  computeRow,
  type FloorPricingRow,
  type ItemPricingRow,
  type QuoteRow,
  type QuoteSite,
} from './quoteEngine'

function contributionsForItem(
  item: string,
  rows: QuoteRow[],
  site: QuoteSite,
) {
  return rows.map((r) => computeRow(r, site.fees)).filter((r) => r.item === item)
}

/** 樓層名稱欄：面積與坪 */
export function floorPricingFloorLabelBreakdown(
  row: FloorPricingRow,
  floorM2: number,
): SummaryCellBreakdownLine[] {
  return [
    { label: '面積（㎡）', amount: floorM2 },
    { label: '換算坪數', amount: row.ping },
  ]
}

/** 套用模組欄 */
export function floorPricingModuleBreakdown(
  row: FloorPricingRow,
): SummaryCellBreakdownLine[] {
  const { zone, moduleFloorRowCount } = row.shareMeta
  if (!zone) {
    return [
      {
        label:
          '本列樓層名稱無法對應試算表階段（如基礎、B1、1F、正常樓、RF…），不攤提工序／工數',
        amount: 0,
      },
    ]
  }
  return [
    { label: `對應試算表階段／模組「${zone}」`, amount: 0 },
    {
      label: '同階段於「樓層面積」表之列數（平均攤分母）',
      amount: moduleFloorRowCount,
    },
  ]
}

export type FloorPricingTooltipCol =
  | 'baseTotal'
  | 'pricingTotal'
  | 'ping'
  | 'instrumentCost'
  | 'miscCost'
  | 'drawingCost'
  | 'costExDrawing'
  | 'costTotal'
  | 'costPerPing'

export function floorPricingNumericBreakdown(
  col: FloorPricingTooltipCol,
  row: FloorPricingRow,
  site: QuoteSite,
  floorM2: number,
): SummaryCellBreakdownLine[] {
  const { zone, moduleFloorRowCount: n, agg } = row.shareMeta
  const rate = site.fees.drawingPerPing

  if (col === 'ping') {
    return [
      { label: '面積（㎡）', amount: floorM2 },
      { label: '換算坪（㎡÷3.305785123966941）', amount: row.ping },
    ]
  }

  if (col === 'drawingCost') {
    return [
      { label: '該層坪數', amount: row.ping },
      { label: '作圖費率（元／坪）', amount: rate },
      { label: '作圖成本（坪×費率）', amount: row.drawingCost },
    ]
  }

  if (col === 'costTotal') {
    return [
      {
        label: '該層工序＋儀器＋雜項（已攤，未含作圖）',
        amount: row.costExDrawing,
      },
      { label: '作圖成本', amount: row.drawingCost },
      { label: '該層成本合計', amount: row.costTotal },
    ]
  }

  if (col === 'costPerPing') {
    return [
      { label: '該層成本合計', amount: row.costTotal },
      { label: '該層坪數', amount: row.ping },
      { label: '每坪成本（成本÷坪）', amount: row.costPerPing },
    ]
  }

  if (!zone) {
    return [
      {
        label: '無對應階段，本欄不攤提（作圖另計）',
        amount: 0,
      },
    ]
  }

  if (!agg) {
    return [
      {
        label: `階段「${zone}」於成本估算中尚無列或未計入`,
        amount: 0,
      },
    ]
  }

  if (col === 'baseTotal') {
    return [
      { label: `「${zone}」模組基礎總工數合計`, amount: agg.base },
      { label: `本層攤提（合計÷${n} 列）`, amount: row.baseTotal },
    ]
  }

  if (col === 'pricingTotal') {
    return [
      { label: `「${zone}」模組計價工數合計`, amount: agg.pricing },
      { label: `本層攤提（合計÷${n} 列）`, amount: row.pricingTotal },
    ]
  }

  if (col === 'instrumentCost') {
    return [
      { label: `「${zone}」模組儀器成本合計`, amount: agg.instr },
      { label: `本層攤提（合計÷${n} 列）`, amount: row.instrumentCost },
    ]
  }

  if (col === 'miscCost') {
    return [
      { label: `「${zone}」模組雜項成本合計`, amount: agg.misc },
      { label: `本層攤提（合計÷${n} 列）`, amount: row.miscCost },
    ]
  }

  if (col === 'costExDrawing') {
    return [
      { label: `「${zone}」區域細項合計（攤前）`, amount: agg.region },
      { label: `本層攤提（合計÷${n} 列）`, amount: row.costExDrawing },
    ]
  }

  return [{ label: '本格數值', amount: 0 }]
}

export type ItemPricingTooltipKind = 'itemLabel' | 'base' | 'cost' | 'pct'

export function itemPricingBreakdown(
  kind: ItemPricingTooltipKind,
  item: string,
  row: ItemPricingRow,
  rows: QuoteRow[],
  site: QuoteSite,
  totalProjectCost: number,
): SummaryCellBreakdownLine[] {
  const cs = contributionsForItem(item, rows, site)

  if (kind === 'pct') {
    return [
      { label: '細項計價合計（元）', amount: row.cost },
      { label: '全案總成本（含作圖，元）', amount: totalProjectCost },
      { label: '占總（計價÷總成本×100）', amount: row.pctOfTotal },
    ]
  }

  if (cs.length === 0) {
    return [{ label: '無細項名稱相同之成本估算列', amount: 0 }]
  }

  if (kind === 'itemLabel') {
    return cs.map((c) => ({
      label: `${c.zone}（區域細項合計 Q）`,
      amount: c.regionCost,
    }))
  }

  if (kind === 'base') {
    return cs.map((c) => ({
      label: `${c.zone}（基礎總工數 E）`,
      amount: c.baseTotal,
    }))
  }

  return cs.map((c) => ({
    label: `${c.zone}（區域細項合計 Q）`,
    amount: c.regionCost,
  }))
}
