import { useEffect } from 'react'
import { tryMoveTableCellFocus } from '../domain/tableArrowNavigation'

/** 全站：在 `table.data` 內用方向鍵切換鄰近儲存格輸入（試算表式）。 */
export function TableArrowNavigation() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      tryMoveTableCellFocus(e)
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [])
  return null
}
