import { useMemo } from 'react'
import type {
  MonthSheetData,
  SalaryBook,
  SiteBlock,
  SummaryCellBreakdownLine,
} from '../domain/salaryExcelModel'
import { padArray, staffKeysForMonthDisplay, staffTotalDays } from '../domain/salaryExcelModel'
import { QUICK_SITE_TSAI_ADJUST } from '../domain/fieldworkQuickApply'
import { PayrollSummaryPopoverCell } from './PayrollSummaryPopoverCell'

function fmtCell(v: number): number {
  return Math.round(v * 100) / 100
}

/** 該案場區塊內，所有人員出工天數加總（與月表格線逐格加總一致，不含餐） */
function siteBlockTotalWorkDays(
  block: SiteBlock,
  staffList: readonly string[],
  dateLen: number,
): number {
  let s = 0
  for (const name of staffList) {
    s += staffTotalDays(padArray(block.grid[name], dateLen))
  }
  return s
}

/** 該月「蔡董調工」列：各人蔡董調工天數加總（與月表蔡董調工區塊一致） */
function tsaiAdjustTotalWorkDaysInMonth(month: MonthSheetData): number {
  const staffOrder = staffKeysForMonthDisplay(month)
  const n = month.dates.length
  let s = 0
  for (const name of staffOrder) {
    s += staffTotalDays(padArray(month.tsaiAdjustDays[name], n))
  }
  return s
}

/** 該月內所有同名案場區塊之出工天數合計；列名為「蔡董調工」時改計月表蔡董調工列（不計案場格線） */
function totalWorkDaysForSiteInMonth(
  month: MonthSheetData,
  siteKey: string,
  unnamed: boolean,
): number {
  if (!unnamed && siteKey === QUICK_SITE_TSAI_ADJUST) {
    return tsaiAdjustTotalWorkDaysInMonth(month)
  }
  const staffOrder = staffKeysForMonthDisplay(month)
  const n = month.dates.length
  let total = 0
  for (const b of month.blocks) {
    const isUnnamed = b.siteName.trim() === ''
    if (unnamed !== isUnnamed) continue
    if (!unnamed && b.siteName !== siteKey) continue
    total += siteBlockTotalWorkDays(b, staffOrder, n)
  }
  return total
}

/** Hover：該案場該月各人出工天數（同名多區塊時已加總到人） */
function siteMonthStaffBreakdown(
  month: MonthSheetData,
  siteKey: string,
  unnamed: boolean,
): SummaryCellBreakdownLine[] {
  const staffOrder = staffKeysForMonthDisplay(month)
  const n = month.dates.length
  if (!unnamed && siteKey === QUICK_SITE_TSAI_ADJUST) {
    const lines: SummaryCellBreakdownLine[] = staffOrder
      .map((name) => ({
        label: `${name}（蔡董調工·天）`,
        amount: staffTotalDays(padArray(month.tsaiAdjustDays[name], n)),
      }))
      .filter((ln) => ln.amount > 0)
    return lines.length > 0 ? lines : [{ label: '（無蔡董調工）', amount: 0 }]
  }
  const byStaff: Record<string, number> = Object.fromEntries(staffOrder.map((x) => [x, 0]))
  for (const b of month.blocks) {
    const isUnnamed = b.siteName.trim() === ''
    if (unnamed !== isUnnamed) continue
    if (!unnamed && b.siteName !== siteKey) continue
    for (const name of staffOrder) {
      byStaff[name] += staffTotalDays(padArray(b.grid[name], n))
    }
  }
  const lines: SummaryCellBreakdownLine[] = staffOrder
    .filter((name) => byStaff[name] > 0)
    .map((name) => ({ label: `${name}（天）`, amount: byStaff[name] }))
  return lines.length > 0 ? lines : [{ label: '（無出工）', amount: 0 }]
}

type SitePivotRow = { key: string; label: string; unnamed: boolean }

function collectSiteRows(book: SalaryBook): SitePivotRow[] {
  /** 案名列鍵為區塊 {@link SiteBlock.siteName} 逐字串（不以 trim 合併）；「蔡董調工」為虛擬列（資料來自月表該列） */
  const named = new Set<string>([QUICK_SITE_TSAI_ADJUST])
  let anyUnnamed = false
  for (const m of book.months) {
    for (const b of m.blocks) {
      if (b.siteName.trim() === '') anyUnnamed = true
      else named.add(b.siteName)
    }
  }
  const rows: SitePivotRow[] = [...named]
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'))
    .map((key) => ({ key, label: key, unnamed: false }))
  if (anyUnnamed) {
    rows.push({ key: '__unnamed__', label: '（未命名案場）', unnamed: true })
  }
  return rows
}

type Props = {
  salaryBook: SalaryBook
}

/**
 * 以案場為列、月份為欄：儲存格為該案場在該月「出工天數」合計（全員格線加總，不含餐），唯讀。
 */
export function PayrollSitesByMonthReadonly({ salaryBook }: Props) {
  const siteRows = useMemo(() => collectSiteRows(salaryBook), [salaryBook])
  const months = salaryBook.months

  const colTotals = useMemo(
    () =>
      months.map((m) =>
        siteRows.reduce(
          (s, row) => s + totalWorkDaysForSiteInMonth(m, row.key, row.unnamed),
          0,
        ),
      ),
    [months, siteRows],
  )

  const grandTotal = colTotals.reduce((a, b) => a + b, 0)

  if (siteRows.length === 0) {
    return (
      <section className="card">
        <h3>案場出工明細（唯讀）</h3>
        <p className="hint">尚無案場資料；請至「月表」新增案場區塊。</p>
      </section>
    )
  }

  return (
    <section className="card">
      <h3>案場出工明細（唯讀）</h3>
      <p className="hint">
        <strong>列</strong>為案場，<strong>欄</strong>為月份；數字為該案場該月<strong>出工天數合計</strong>（一般案場為格線加總；列「
        {QUICK_SITE_TSAI_ADJUST}
        」為月表<strong>蔡董調工</strong>列加總，不含餐費）。游標移至數字格可查看<strong>各人明細</strong>；與總表相同可<strong>點一下鎖定</strong>浮窗。請至「月表」編輯。
      </p>
      <div className="tableScroll tableScrollSticky">
        <table className="data tight payrollSitesPivotTable">
          <thead>
            <tr>
              <th className="payrollSitesPivotStickyCol">案場</th>
              {months.map((m) => (
                <th key={m.id} className="num dtCol">
                  {m.label}
                </th>
              ))}
              <th className="payrollGrandHead num">合計</th>
            </tr>
          </thead>
          <tbody>
            {siteRows.map((row) => {
              const rowVals = months.map((m) =>
                totalWorkDaysForSiteInMonth(m, row.key, row.unnamed),
              )
              const rowSum = rowVals.reduce((a, b) => a + b, 0)
              return (
                <tr key={row.key}>
                  <th scope="row" className="payrollSitesPivotStickyCol">
                    {row.label}
                  </th>
                  {rowVals.map((v, mi) => {
                    const m = months[mi]
                    const has = v > 0 && Number.isFinite(v)
                    return (
                      <PayrollSummaryPopoverCell
                        key={m?.id ?? mi}
                        className={`num${has ? ' num--dayHasWork' : ''}`}
                        cellContent={fmtCell(v)}
                        summaryAmount={v}
                        breakdownLines={siteMonthStaffBreakdown(m, row.key, row.unnamed)}
                        hintTitle={`${row.label} — ${m?.label ?? ''} · 各人出工天數`}
                      />
                    )
                  })}
                  <PayrollSummaryPopoverCell
                    className="num payrollGrandCell"
                    cellContent={fmtCell(rowSum)}
                    summaryAmount={rowSum}
                    breakdownLines={months.map((m, i) => ({
                      label: m.label,
                      amount: rowVals[i] ?? 0,
                    }))}
                    hintTitle={`${row.label} — 各月合計`}
                  />
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="payrollGrandRow">
              <th scope="row" className="payrollSitesPivotStickyCol">
                總計
              </th>
              {colTotals.map((v, mi) => {
                const m = months[mi]
                const has = v > 0 && Number.isFinite(v)
                return (
                  <PayrollSummaryPopoverCell
                    key={m?.id ?? mi}
                    className={`num${has ? ' num--dayHasWork' : ''}`}
                    cellContent={fmtCell(v)}
                    summaryAmount={v}
                    breakdownLines={siteRows.map((r) => ({
                      label: r.label,
                      amount: totalWorkDaysForSiteInMonth(m, r.key, r.unnamed),
                    }))}
                    hintTitle={`${m?.label ?? ''} — 各案場出工天數`}
                  />
                )
              })}
              <PayrollSummaryPopoverCell
                className="num payrollGrandCell"
                cellContent={fmtCell(grandTotal)}
                summaryAmount={grandTotal}
                breakdownLines={months.map((m, i) => ({
                  label: `${m.label}（當月全案場合計）`,
                  amount: colTotals[i] ?? 0,
                }))}
                footerTotalsLines={siteRows.map((r) => {
                  const sum = months.reduce(
                    (s, mo) => s + totalWorkDaysForSiteInMonth(mo, r.key, r.unnamed),
                    0,
                  )
                  return { label: `${r.label}（全期合計）`, amount: sum }
                })}
                hintTitle="全表總覽"
              />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}
