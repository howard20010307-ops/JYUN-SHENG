import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  summaryBreakdownLineDisplayLabel,
  type SummaryCellBreakdownLine,
} from '../domain/salaryExcelModel'

function formatAmount(n: number): string {
  const r = Math.round(n * 100) / 100
  return r.toLocaleString('zh-TW', { maximumFractionDigits: 2 })
}

function clientFromTouch(e: TouchEvent | React.TouchEvent): {
  clientX: number
  clientY: number
} | null {
  const t = e.touches[0] ?? e.changedTouches[0]
  if (!t) return null
  return { clientX: t.clientX, clientY: t.clientY }
}

type TipState = { x: number; y: number; open: boolean; pinned: boolean }

type Props = {
  className?: string
  cellContent: React.ReactNode
  /** 數字欄帳面值；項目欄可不傳 */
  summaryAmount?: number
  breakdownLines?: SummaryCellBreakdownLine[]
  /** 總表「實領薪水」數字欄：本分期工數／時數總結（鈞泩格線、調工、鈞泩加班、蔡董調工、蔡董加班） */
  footerTotalsLines?: SummaryCellBreakdownLine[]
  hintTitle?: string
  showValueFooter?: boolean
}

export function PayrollSummaryPopoverCell({
  className,
  cellContent,
  summaryAmount,
  breakdownLines,
  footerTotalsLines,
  hintTitle,
  showValueFooter = true,
}: Props) {
  const [tip, setTip] = useState<TipState>({
    x: 0,
    y: 0,
    open: false,
    pinned: false,
  })
  const [dragging, setDragging] = useState(false)
  const cellRef = useRef<HTMLTableCellElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const dragOriginRef = useRef({ sx: 0, sy: 0, ox: 0, oy: 0 })
  const tipRef = useRef(tip)
  const suppressClickUntilRef = useRef(0)
  const touchStartRef = useRef<{
    x: number
    y: number
    wasPinned: boolean
  } | null>(null)

  useEffect(() => {
    tipRef.current = tip
  }, [tip])

  const dismiss = useCallback(() => {
    setDragging(false)
    setTip((t) => ({ ...t, open: false, pinned: false }))
  }, [])

  useEffect(() => {
    if (!tip.pinned) return
    const onDocDown = (e: MouseEvent | TouchEvent) => {
      let n: Node | null = null
      if ('touches' in e) {
        const te = e as TouchEvent
        const t = te.touches[0] ?? te.changedTouches[0]
        n = (t?.target as Node) ?? null
      } else {
        n = (e as MouseEvent).target as Node
      }
      if (!n) return
      if (cellRef.current?.contains(n) || tooltipRef.current?.contains(n)) return
      dismiss()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('touchstart', onDocDown, { capture: true })
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('touchstart', onDocDown, { capture: true })
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [tip.pinned, dismiss])

  useEffect(() => {
    if (!dragging) return
    const applyMove = (clientX: number, clientY: number) => {
      const d = dragOriginRef.current
      let nx = d.ox + (clientX - d.sx)
      let ny = d.oy + (clientY - d.sy)
      const margin = 10
      const vw = window.innerWidth
      const vh = window.innerHeight
      const el = tooltipRef.current
      const w = el?.offsetWidth ?? 260
      const h = el?.offsetHeight ?? 180
      nx = Math.min(Math.max(nx, margin - w + 56), vw - margin)
      ny = Math.min(Math.max(ny, margin), vh - margin - h)
      setTip((t) => ({ ...t, x: nx, y: ny }))
    }
    const onMouseMove = (e: MouseEvent) => applyMove(e.clientX, e.clientY)
    const onTouchMove = (e: TouchEvent) => {
      const c = clientFromTouch(e)
      if (!c) return
      e.preventDefault()
      applyMove(c.clientX, c.clientY)
    }
    const onUp = () => setDragging(false)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onUp)
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onUp)
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [dragging])

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      if (!tip.pinned || e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      dragOriginRef.current = {
        sx: e.clientX,
        sy: e.clientY,
        ox: tip.x,
        oy: tip.y,
      }
      setDragging(true)
    },
    [tip.pinned, tip.x, tip.y],
  )

  const startDragTouch = useCallback(
    (e: React.TouchEvent) => {
      if (!tip.pinned || e.touches.length !== 1) return
      e.preventDefault()
      e.stopPropagation()
      const t = e.touches[0]!
      dragOriginRef.current = {
        sx: t.clientX,
        sy: t.clientY,
        ox: tip.x,
        oy: tip.y,
      }
      setDragging(true)
    },
    [tip.pinned, tip.x, tip.y],
  )

  const lines: SummaryCellBreakdownLine[] =
    breakdownLines && breakdownLines.length > 0
      ? breakdownLines
      : summaryAmount !== undefined
        ? [{ label: '本格數值', amount: summaryAmount }]
        : [{ label: '（無明細）', amount: 0 }]

  const openAt = useCallback((e: React.MouseEvent) => {
    setTip((prev) =>
      prev.pinned
        ? prev
        : { x: e.clientX + 12, y: e.clientY + 12, open: true, pinned: false },
    )
  }, [])

  const move = useCallback((e: React.MouseEvent) => {
    setTip((t) =>
      t.open && !t.pinned ? { ...t, x: e.clientX + 12, y: e.clientY + 12 } : t,
    )
  }, [])

  const leaveCell = useCallback(() => {
    setTip((t) => (t.pinned ? t : { ...t, open: false, pinned: false }))
  }, [])

  const togglePin = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setTip((prev) => {
      if (prev.pinned) {
        return { ...prev, open: false, pinned: false }
      }
      return {
        x: e.clientX + 12,
        y: e.clientY + 12,
        open: true,
        pinned: true,
      }
    })
  }, [])

  const onCellTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    const t = e.touches[0]!
    const cur = tipRef.current
    touchStartRef.current = {
      x: t.clientX,
      y: t.clientY,
      wasPinned: cur.pinned,
    }
    if (!cur.pinned) {
      setTip({
        x: t.clientX + 12,
        y: t.clientY + 12,
        open: true,
        pinned: false,
      })
    }
  }, [])

  const onCellTouchMove = useCallback((e: React.TouchEvent) => {
    const cur = tipRef.current
    if (!cur.open || cur.pinned || e.touches.length !== 1) return
    const t = e.touches[0]!
    setTip((prev) =>
      prev.open && !prev.pinned
        ? { ...prev, x: t.clientX + 12, y: t.clientY + 12 }
        : prev,
    )
  }, [])

  const onCellTouchEnd = useCallback((e: React.TouchEvent) => {
    suppressClickUntilRef.current = Date.now() + 500
    const t = e.changedTouches[0]
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!t || !start) return
    const dist = Math.hypot(t.clientX - start.x, t.clientY - start.y)
    if (start.wasPinned) {
      if (dist < 20) dismiss()
      return
    }
    if (dist < 20) {
      setTip((prev) =>
        prev.open && !prev.pinned ? { ...prev, pinned: true } : prev,
      )
    } else {
      setTip((prev) =>
        prev.open && !prev.pinned ? { ...prev, open: false, pinned: false } : prev,
      )
    }
  }, [dismiss])

  const onCellTouchCancel = useCallback(() => {
    touchStartRef.current = null
    setTip((prev) =>
      prev.open && !prev.pinned ? { ...prev, open: false, pinned: false } : prev,
    )
  }, [])

  const onCellClick = useCallback(
    (e: React.MouseEvent) => {
      if (Date.now() < suppressClickUntilRef.current) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      togglePin(e)
    },
    [togglePin],
  )

  const mergedClass = ['payrollSummaryPopoverCell', className].filter(Boolean).join(' ')

  return (
    <>
      <td
        ref={cellRef}
        className={mergedClass}
        onMouseEnter={openAt}
        onMouseMove={move}
        onMouseLeave={leaveCell}
        onClick={onCellClick}
        onTouchStart={onCellTouchStart}
        onTouchMove={onCellTouchMove}
        onTouchEnd={onCellTouchEnd}
        onTouchCancel={onCellTouchCancel}
      >
        {cellContent}
      </td>
      {tip.open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={tooltipRef}
            className={
              tip.pinned
                ? 'payrollSummaryTooltip payrollSummaryTooltip--pinned'
                : 'payrollSummaryTooltip'
            }
            style={{ left: tip.x, top: tip.y }}
            role="dialog"
            aria-modal={tip.pinned}
            onClick={(e) => e.stopPropagation()}
          >
            {tip.pinned ? (
              <div
                className="payrollSummaryTooltip__dragBar"
                onMouseDown={startDrag}
                onTouchStart={startDragTouch}
                title="拖曳移動視窗（滑鼠左鍵或觸控按住此列）"
              >
                ⋮⋮ 拖曳移動
              </div>
            ) : null}
            <div className="payrollSummaryTooltip__body">
              {hintTitle ? (
                <div className="payrollSummaryTooltip__title">{hintTitle}</div>
              ) : null}
              <ul className="payrollSummaryTooltip__lines">
                {lines.map((ln, idx) => (
                  <li key={idx} className="payrollSummaryTooltip__line">
                    <span className="payrollSummaryTooltip__label">
                      {summaryBreakdownLineDisplayLabel(ln)}
                    </span>
                    <span
                      className={
                        ln.hideAmount
                          ? 'payrollSummaryTooltip__amount payrollSummaryTooltip__amount--hidden'
                          : 'payrollSummaryTooltip__amount'
                      }
                    >
                      {ln.hideAmount ? '—' : formatAmount(ln.amount)}
                    </span>
                  </li>
                ))}
              </ul>
              {footerTotalsLines && footerTotalsLines.length > 0 ? (
                <ul className="payrollSummaryTooltip__lines payrollSummaryTooltip__footerTotals">
                  {footerTotalsLines.map((ln, idx) => (
                    <li key={`ft-${idx}`} className="payrollSummaryTooltip__line">
                      <span className="payrollSummaryTooltip__label">{ln.label}</span>
                      <span className="payrollSummaryTooltip__amount">
                        {formatAmount(ln.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {showValueFooter && summaryAmount !== undefined ? (
                <div className="payrollSummaryTooltip__footer">
                  本格顯示：<strong>{formatAmount(summaryAmount)}</strong>
                </div>
              ) : null}
              {tip.pinned ? (
                <div className="payrollSummaryTooltip__pinHint">
                  已鎖定：上方列可拖曳視窗；內容區可捲動。關閉：再點同一格、點畫面其他處，或按 Esc（外接鍵盤時）
                </div>
              ) : null}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
