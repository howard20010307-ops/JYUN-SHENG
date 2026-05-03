import { useState } from 'react'

/** 受控 number 清空會立刻被寫回 0；改為文字輸入，輸入中可空，blur 再定稿 */
export function useLooseNumericDrafts() {
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  function bindDecimal(key: string, value: number, commit: (n: number) => void, className?: string) {
    return {
      type: 'text' as const,
      inputMode: 'decimal' as const,
      className,
      value: drafts[key] !== undefined ? drafts[key]! : String(value),
      onFocus() {
        setDrafts((d) => {
          if (d[key] !== undefined) return d
          if (value !== 0) return d
          return { ...d, [key]: '' }
        })
      },
      onChange(e: React.ChangeEvent<HTMLInputElement>) {
        const v = e.target.value
        setDrafts((d) => ({ ...d, [key]: v }))
        if (v === '' || v === '-' || v === '.' || v === '-.') return
        const n = parseFloat(v)
        if (Number.isFinite(n)) commit(n)
      },
      onBlur() {
        setDrafts((d) => {
          const raw = d[key]
          const n = raw === undefined || raw === '' || raw === '-' ? 0 : parseFloat(raw)
          commit(Number.isFinite(n) ? n : 0)
          const next = { ...d }
          delete next[key]
          return next
        })
      },
    }
  }

  function bindInt(key: string, value: number, commit: (n: number) => void, min: number, max: number) {
    return {
      type: 'text' as const,
      inputMode: 'numeric' as const,
      value: drafts[key] !== undefined ? drafts[key]! : String(value),
      onFocus() {
        setDrafts((d) => {
          if (d[key] !== undefined) return d
          if (value !== 0) return d
          return { ...d, [key]: '' }
        })
      },
      onChange(e: React.ChangeEvent<HTMLInputElement>) {
        const v = e.target.value.replace(/\D/g, '')
        setDrafts((d) => ({ ...d, [key]: v }))
        if (v === '') return
        let n = parseInt(v, 10)
        if (!Number.isFinite(n)) return
        n = Math.max(min, Math.min(max, n))
        commit(n)
      },
      onBlur() {
        setDrafts((d) => {
          const raw = d[key]
          let n = raw === '' || raw === undefined ? 0 : parseInt(raw, 10)
          if (!Number.isFinite(n)) n = 0
          n = Math.max(min, Math.min(max, n))
          commit(n)
          const next = { ...d }
          delete next[key]
          return next
        })
      },
    }
  }

  return { bindDecimal, bindInt }
}
