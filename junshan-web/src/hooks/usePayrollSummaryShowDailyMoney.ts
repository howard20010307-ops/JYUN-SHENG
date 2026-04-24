import { useCallback, useState } from 'react'

const LS_KEY = 'junshan-payroll-show-daily-money'

function readStored(): boolean {
  try {
    return localStorage.getItem(LS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * 總表 hover：是否顯示「逐日金額／薪水」右欄。預設關（僅列日期等），寫入 localStorage。
 */
export function usePayrollSummaryShowDailyMoney(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(readStored)

  const persist = useCallback((v: boolean) => {
    setOn(v)
    try {
      localStorage.setItem(LS_KEY, v ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [])

  return [on, persist]
}
