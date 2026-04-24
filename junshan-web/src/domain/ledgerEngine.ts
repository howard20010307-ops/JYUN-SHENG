/** 公司帳：對應《總成本》《收帳》的月度結餘與累計盈虧 */

export type MonthKey =
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | '11'
  | '12'

export type MonthLine = {
  month: MonthKey
  salary: number
  /** 加班費（與月表鈞泩日薪÷8×時數邏輯一致，可手動或快速登記加總） */
  overtimePay: number
  meals: number
  tools: number
  bossSalary: number
  instrument: number
  risk: number
  /** 工程款（未稅入帳合計，手輸或從收帳匯總） */
  revenueNet: number
  tax: number
}

export type MonthComputed = MonthLine & {
  totalCost: number
  revenueGross: number
  surplus: number
}

export function computeMonth(m: MonthLine): MonthComputed {
  const totalCost =
    m.salary +
    (m.overtimePay ?? 0) +
    m.meals +
    m.tools +
    m.bossSalary +
    m.instrument +
    m.risk
  const revenueGross = m.revenueNet + m.tax
  const surplus = revenueGross - totalCost
  return { ...m, totalCost, revenueGross, surplus }
}

export function cumulativeProfit(months: MonthLine[]): number {
  let acc = 0
  for (const m of months) {
    acc += computeMonth(m).surplus
  }
  return acc
}

export function runningCumulative(months: MonthLine[]): number[] {
  const out: number[] = []
  let acc = 0
  for (const m of months) {
    acc += computeMonth(m).surplus
    out.push(acc)
  }
  return out
}

export const MONTH_ORDER: MonthKey[] = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
]

function monthNum(m: MonthKey): number {
  return parseInt(m, 10)
}

export function defaultLedger(): MonthLine[] {
  return MONTH_ORDER.map((month) => ({
    month,
    salary: 0,
    overtimePay: 0,
    meals: 0,
    tools: 0,
    bossSalary: monthNum(month) >= 5 ? 100000 : 0,
    instrument: 20000,
    risk: 20000,
    revenueNet: 0,
    tax: 0,
  }))
}
