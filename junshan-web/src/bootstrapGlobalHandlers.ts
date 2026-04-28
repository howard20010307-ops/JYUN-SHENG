/**
 * 補 React Error Boundary 抓不到的錯誤（事件、Promise、部分載入失敗），
 * 避免整頁只剩「黑屏」卻無任何提示。
 */
const OVERLAY_ID = 'app-global-fatal-overlay'

function hasErrorBoundaryFallback(): boolean {
  return document.querySelector('[data-error-boundary-fallback="1"]') !== null
}

function showGlobalFatal(title: string, detail: string) {
  if (document.getElementById(OVERLAY_ID)) return

  const wrap = document.createElement('div')
  wrap.id = OVERLAY_ID
  wrap.setAttribute('role', 'alert')
  wrap.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483646',
    'background:#0f1419',
    'color:#c8d0da',
    'padding:28px 20px',
    'font-family:system-ui,"Noto Sans TC",sans-serif',
    'line-height:1.55',
    'overflow:auto',
    'box-sizing:border-box',
  ].join(';')

  const h = document.createElement('h1')
  h.textContent = title
  h.style.cssText = 'margin:0 0 12px;font-size:1.2rem;color:#f2f5f9;font-weight:700'

  const p = document.createElement('p')
  p.textContent = detail
  p.style.cssText = 'margin:0 0 16px;white-space:pre-wrap;word-break:break-word'

  const hint = document.createElement('p')
  hint.textContent =
    '請按 F12 查看 Console；若問題持續，可嘗試清除本站資料或匯入備份後再載入。'
  hint.style.cssText = 'margin:0 0 18px;font-size:0.88rem;opacity:0.88'

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.textContent = '重新載入頁面'
  btn.style.cssText =
    'padding:10px 18px;cursor:pointer;border-radius:8px;border:1px solid #243041;background:#151c24;color:#c8d0da;font-size:0.9rem'
  btn.addEventListener('click', () => window.location.reload())

  wrap.append(h, p, hint, btn)
  document.body.appendChild(wrap)
}

/** 下一個 macrotask 再顯示，讓 Error Boundary 有機會先畫出 fallback，避免重疊兩層錯誤 UI */
function scheduleMaybeShow(title: string, detail: string) {
  setTimeout(() => {
    if (hasErrorBoundaryFallback()) return
    if (document.getElementById(OVERLAY_ID)) return
    showGlobalFatal(title, detail)
  }, 0)
}

export function registerBootstrapGlobalHandlers(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('error', (e) => {
    const err = e.error
    if (!(err instanceof Error)) return
    console.error(err)
    scheduleMaybeShow('執行錯誤', err.message || String(err))
  })

  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason
    const msg =
      r instanceof Error
        ? r.message || String(r)
        : typeof r === 'string'
          ? r
          : 'Promise 未處理錯誤'
    console.error('Unhandled rejection:', r)
    scheduleMaybeShow('非同步錯誤', msg)
  })
}
