/** 表格內輸入：方向鍵移到鄰近儲存格（類試算表）。 */

const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

const SKIP_INPUT_TYPES = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'file',
  'hidden',
  'image',
  'date',
  'time',
  'datetime-local',
  'month',
  'week',
  'color',
  'range',
])

function keyToDir(key: string): 'up' | 'down' | 'left' | 'right' | null {
  switch (key) {
    case 'ArrowUp':
      return 'up'
    case 'ArrowDown':
      return 'down'
    case 'ArrowLeft':
      return 'left'
    case 'ArrowRight':
      return 'right'
    default:
      return null
  }
}

function siblingCell(td: HTMLTableCellElement, dir: 'left' | 'right'): HTMLTableCellElement | null {
  const row = td.parentElement
  if (!(row instanceof HTMLTableRowElement)) return null
  const cells = Array.from(row.cells)
  const idx = cells.indexOf(td)
  if (idx < 0) return null
  const nextIdx = dir === 'left' ? idx - 1 : idx + 1
  if (nextIdx < 0 || nextIdx >= cells.length) return null
  const next = cells[nextIdx]
  return next instanceof HTMLTableCellElement ? next : null
}

function verticalCell(
  td: HTMLTableCellElement,
  dir: 'up' | 'down',
  table: HTMLTableElement,
): HTMLTableCellElement | null {
  const tr = td.parentElement
  if (!(tr instanceof HTMLTableRowElement)) return null
  const rowIdx = tr.rowIndex
  const cellIdx = td.cellIndex
  const nextRowIdx = dir === 'up' ? rowIdx - 1 : rowIdx + 1
  if (nextRowIdx < 0 || nextRowIdx >= table.rows.length) return null
  const nextRow = table.rows[nextRowIdx]
  const cells = nextRow.cells
  if (cells.length === 0) return null
  const j = Math.min(cellIdx, cells.length - 1)
  const next = cells[j]
  return next instanceof HTMLTableCellElement ? next : null
}

const FOCUSABLE_SELECTOR =
  'input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([disabled]):not([readonly]),select:not([disabled]),textarea:not([disabled]):not([readonly])'

/** 含 readonly 文字欄（仍可對焦，僅略過唯讀時改用下一個可編輯） */
const FOCUSABLE_WITH_READONLY =
  'input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([disabled]),select:not([disabled]),textarea:not([disabled])'

function firstFocusableInCell(td: HTMLTableCellElement): HTMLElement | null {
  const preferEditable = td.querySelector(FOCUSABLE_SELECTOR) as HTMLElement | null
  if (preferEditable) return preferEditable
  return td.querySelector(FOCUSABLE_WITH_READONLY) as HTMLElement | null
}

function shouldInterceptForTextCaret(el: HTMLElement, key: string): boolean {
  if (el instanceof HTMLTextAreaElement) return false
  if (!(el instanceof HTMLInputElement)) return true
  if (el.readOnly) return true

  const t = el.type
  if (SKIP_INPUT_TYPES.has(t)) return false

  if (t !== 'text' && t !== 'search' && t !== 'tel' && t !== 'url' && t !== 'password' && t !== '') {
    return true
  }

  const start = el.selectionStart ?? 0
  const end = el.selectionEnd ?? 0
  const len = el.value.length
  if (start !== end) return false

  if (key === 'ArrowLeft') return start === 0
  if (key === 'ArrowRight') return start === len
  return true
}

/**
 * 若應移到鄰格則 `preventDefault`、blur 目前欄位並在下一個 microtask 對焦目標格。
 * @returns 是否已處理（呼叫端勿再處理同一鍵）
 */
export function tryMoveTableCellFocus(e: KeyboardEvent): boolean {
  if (!NAV_KEYS.has(e.key) || e.altKey || e.ctrlKey || e.metaKey) return false

  const raw = e.target
  if (!(raw instanceof HTMLElement)) return false
  if (raw.closest('[data-no-table-arrow-nav]')) return false

  if (
    raw instanceof HTMLSelectElement ||
    raw instanceof HTMLTextAreaElement ||
    raw.isContentEditable
  ) {
    return false
  }

  if (!(raw instanceof HTMLInputElement)) return false
  if (SKIP_INPUT_TYPES.has(raw.type)) return false

  const table = raw.closest('table.data')
  if (!(table instanceof HTMLTableElement)) return false

  const td = raw.closest('td, th')
  if (!(td instanceof HTMLTableCellElement)) return false

  const dir = keyToDir(e.key)
  if (!dir) return false

  if (!shouldInterceptForTextCaret(raw, e.key)) return false

  let nextTd: HTMLTableCellElement | null = null
  if (dir === 'left') nextTd = siblingCell(td, 'left')
  else if (dir === 'right') nextTd = siblingCell(td, 'right')
  else if (dir === 'up') nextTd = verticalCell(td, 'up', table)
  else nextTd = verticalCell(td, 'down', table)

  if (!nextTd) return false

  const nextEl = firstFocusableInCell(nextTd)
  if (!nextEl) return false

  e.preventDefault()
  raw.blur()
  window.setTimeout(() => {
    nextEl.focus()
    if (nextEl instanceof HTMLInputElement && (nextEl.type === 'text' || nextEl.type === '')) {
      const L = nextEl.value.length
      try {
        nextEl.setSelectionRange(L, L)
      } catch {
        /* ignore */
      }
    }
  }, 0)

  return true
}
