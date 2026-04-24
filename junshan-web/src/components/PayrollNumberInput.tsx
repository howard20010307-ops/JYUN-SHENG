import { useCallback, useState, type ChangeEvent, type KeyboardEvent } from 'react'

function stringifyNumber(v: number): string {
  if (!Number.isFinite(v)) return '0'
  return String(v)
}

const PARTIAL_NUM = /^-?\d*\.?\d*$/

type Props = {
  value: number
  onCommit: (n: number) => void
  className?: string
  'aria-label'?: string
}

/**
 * 薪水表用數字輸入：焦點內以字串編輯（可暫時出現「00」「0300」等），移開焦點才寫回數字。
 * 避免 `type="number"` + 受控 value 在刪字時被 parse 吃掉、無法刪除前導 0 的問題。
 */
export function PayrollNumberInput({
  value,
  onCommit,
  className,
  'aria-label': ariaLabel,
}: Props) {
  const [draft, setDraft] = useState<string | null>(null)

  const display = draft !== null ? draft : stringifyNumber(value)

  const onFocus = useCallback(() => {
    setDraft(stringifyNumber(value))
  }, [value])

  const flush = useCallback(
    (text: string) => {
      const t = text.replace(/,/g, '').trim()
      if (t === '' || t === '-' || t === '.' || t === '-.') {
        onCommit(0)
        setDraft(null)
        return
      }
      const n = parseFloat(t)
      onCommit(Number.isFinite(n) ? n : 0)
      setDraft(null)
    },
    [onCommit],
  )

  const onChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const t = e.target.value.replace(/,/g, '')
    if (!PARTIAL_NUM.test(t)) return
    setDraft(e.target.value)
  }, [])

  const onBlur = useCallback(() => {
    if (draft !== null) flush(draft)
  }, [draft, flush])

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    }
  }, [])

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      aria-label={ariaLabel}
      value={display}
      onFocus={onFocus}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    />
  )
}
