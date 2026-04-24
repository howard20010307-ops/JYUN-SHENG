/** 薪水／出工：對應《2026鈞泩薪水統計》彙總邏輯（日薪、加班時數→金額、預支、蔡董線） */

export type Worker = {
  id: string
  name: string
  junDaily: number
  tsaiDaily: number
}

export type PeriodEntry = {
  workerId: string
  /** 鈞泩一般出工「天」可含小數 */
  junDays: number
  /** 鈞泩調工（天），與總表「調工」列一致 */
  junAdjustDays: number
  /** 加班時數；加班費 = 時薪 × 時數，時薪 = 鈞泩日薪 / 8 */
  junOtHours: number
  advance: number
  /** 蔡董線：出工天（日薪用 tsaiDaily） */
  tsaiDays: number
  /** 蔡董調工（天） */
  tsaiAdjustDays: number
  tsaiOtHours: number
}

export type Period = {
  id: string
  label: string
  entries: PeriodEntry[]
}

export function hourlyFromDaily(daily: number): number {
  return daily / 8
}

export type PeriodComputed = {
  label: string
  byWorker: {
    workerId: string
    name: string
    junGross: number
    junOtPay: number
    tsaiPay: number
    tsaiOtPay: number
    advance: number
    netJun: number
    totalWithTsai: number
  }[]
  totals: {
    junGross: number
    junOtPay: number
    tsaiPay: number
    tsaiOtPay: number
    advance: number
    netJun: number
    totalWithTsai: number
  }
}

export function computePeriod(period: Period, workers: Worker[]): PeriodComputed {
  const map = new Map(workers.map((w) => [w.id, w]))
  const byWorker = period.entries.map((e) => {
    const w = map.get(e.workerId)
    if (!w) {
      return {
        workerId: e.workerId,
        name: '?',
        junGross: 0,
        junOtPay: 0,
        tsaiPay: 0,
        tsaiOtPay: 0,
        advance: e.advance,
        netJun: 0,
        totalWithTsai: 0,
      }
    }
    /** 鈞泩格線×日薪（與 salaryExcelModel「鈞泩薪水(未扣預支)」同義，不含調工） */
    const junSalaryGrid = e.junDays * w.junDaily
    /** 調工薪水＝調工天數×（鈞泩格線薪水÷格線天數），與 salaryExcelModel 一致 */
    const payPerJunGridDay = e.junDays > 0 ? junSalaryGrid / e.junDays : w.junDaily
    const junAdjustPay = (e.junAdjustDays ?? 0) * payPerJunGridDay
    const junGross = junSalaryGrid + junAdjustPay
    const junOtPay = e.junOtHours * hourlyFromDaily(w.junDaily)
    /** 蔡董調工×日薪（格線不計蔡董薪，與 salaryExcelModel 一致） */
    const tsaiAdjustPay = (e.tsaiAdjustDays ?? 0) * w.tsaiDaily
    const tsaiPay = tsaiAdjustPay
    const tsaiOtPay = e.tsaiOtHours * hourlyFromDaily(w.tsaiDaily)
    const grossJunWithOt = junGross + junOtPay
    const netJun = grossJunWithOt - e.advance
    /** 與 salaryExcelModel.netTakeHomePayInPeriod 同式（蔡董格線不計薪） */
    const totalWithTsai =
      junSalaryGrid -
      e.advance +
      junOtPay +
      tsaiOtPay +
      junAdjustPay +
      tsaiAdjustPay
    return {
      workerId: w.id,
      name: w.name,
      junGross,
      junOtPay,
      tsaiPay,
      tsaiOtPay,
      advance: e.advance,
      netJun,
      totalWithTsai,
    }
  })
  const sum = (k: keyof (typeof byWorker)[0]) =>
    byWorker.reduce((s, r) => s + (r[k] as number), 0)
  const totals = {
    junGross: sum('junGross'),
    junOtPay: sum('junOtPay'),
    tsaiPay: sum('tsaiPay'),
    tsaiOtPay: sum('tsaiOtPay'),
    advance: sum('advance'),
    netJun: sum('netJun'),
    totalWithTsai: sum('totalWithTsai'),
  }
  return { label: period.label, byWorker, totals }
}

export function defaultWorkers(): Worker[] {
  return [
    { id: 'w1', name: '蕭上彬', junDaily: 3500, tsaiDaily: 2800 },
    { id: 'w2', name: '楊家全', junDaily: 3000, tsaiDaily: 2800 },
    { id: 'w3', name: '劉子瑜', junDaily: 3000, tsaiDaily: 2800 },
    { id: 'w4', name: '陳建良', junDaily: 3500, tsaiDaily: 2800 },
    { id: 'w5', name: '黃致揚', junDaily: 3000, tsaiDaily: 2800 },
  ]
}

export function emptyEntriesForWorkers(workers: Worker[]): PeriodEntry[] {
  return workers.map((w) => ({
    workerId: w.id,
    junDays: 0,
    junAdjustDays: 0,
    junOtHours: 0,
    advance: 0,
    tsaiDays: 0,
    tsaiAdjustDays: 0,
    tsaiOtHours: 0,
  }))
}
