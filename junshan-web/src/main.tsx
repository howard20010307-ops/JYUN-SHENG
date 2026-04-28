import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { registerBootstrapGlobalHandlers } from './bootstrapGlobalHandlers'
import { AppGateAuthProvider } from './context/AppGateAuthContext'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

registerBootstrapGlobalHandlers()

const rootEl = document.getElementById('root')
if (!rootEl) {
  document.body.insertAdjacentHTML(
    'afterbegin',
    '<p style="margin:16px;color:#f07178;font-family:system-ui,sans-serif">找不到 #root，無法啟動應用程式。</p>',
  )
} else {
  try {
    createRoot(rootEl).render(
      <StrictMode>
        <ErrorBoundary>
          <AppGateAuthProvider>
            <App />
          </AppGateAuthProvider>
        </ErrorBoundary>
      </StrictMode>,
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(e)
    rootEl.innerHTML = ''
    const wrap = document.createElement('div')
    wrap.style.cssText =
      'padding:24px;max-width:640px;margin:0 auto;color:#c8d0da;background:#0f1419;min-height:100vh;font-family:system-ui,"Noto Sans TC",sans-serif'
    wrap.innerHTML = `<h1 style="color:#f2f5f9;font-size:1.2rem">無法啟動</h1><p style="white-space:pre-wrap;word-break:break-word">${escapeHtml(
      msg,
    )}</p><p style="opacity:.85;font-size:.9rem">請檢查網路與 Console，或重新整理頁面。</p>`
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = '重新載入頁面'
    btn.style.cssText =
      'margin-top:16px;padding:10px 18px;cursor:pointer;border-radius:8px;border:1px solid #243041;background:#151c24;color:#c8d0da'
    btn.onclick = () => window.location.reload()
    wrap.appendChild(btn)
    rootEl.appendChild(wrap)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
