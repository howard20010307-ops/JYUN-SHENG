import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { err: Error | null }

function normalizeError(e: unknown): Error {
  if (e instanceof Error) return e
  if (typeof e === 'string') return new Error(e)
  try {
    return new Error(JSON.stringify(e))
  } catch {
    return new Error('未知錯誤')
  }
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null }

  static getDerivedStateFromError(e: unknown): State {
    return { err: normalizeError(e) }
  }

  override componentDidCatch(e: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', e, info.componentStack)
  }

  private clear = (): void => {
    this.setState({ err: null })
  }

  override render(): ReactNode {
    if (this.state.err) {
      const msg = this.state.err.message || String(this.state.err)
      return (
        <div
          data-error-boundary-fallback="1"
          style={{
            padding: 24,
            maxWidth: 640,
            margin: '0 auto',
            color: 'var(--text, #c8d0da)',
            background: 'var(--bg, #0f1419)',
            minHeight: '100vh',
            fontFamily: 'system-ui, "Noto Sans TC", sans-serif',
          }}
        >
          <h1 style={{ color: 'var(--head, #f2f5f9)', fontSize: '1.25rem', margin: '0 0 12px' }}>
            畫面發生錯誤
          </h1>
          <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '0 0 12px' }}>{msg}</p>
          <p style={{ opacity: 0.85, fontSize: '0.9rem', margin: '0 0 16px' }}>
            請按 F12 → Console 查看完整堆疊。可先試「重試」；若仍失敗請「重新載入」或還原備份。
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button
              type="button"
              style={{
                padding: '10px 18px',
                cursor: 'pointer',
                borderRadius: 8,
                border: '1px solid #243041',
                background: 'rgba(61, 156, 245, 0.2)',
                color: '#f2f5f9',
              }}
              onClick={this.clear}
            >
              重試
            </button>
            <button
              type="button"
              style={{
                padding: '10px 18px',
                cursor: 'pointer',
                borderRadius: 8,
                border: '1px solid #243041',
                background: '#151c24',
                color: '#c8d0da',
              }}
              onClick={() => window.location.reload()}
            >
              重新載入頁面
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
