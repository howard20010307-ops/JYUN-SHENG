import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { err: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null }

  static getDerivedStateFromError(e: Error): State {
    return { err: e }
  }

  override componentDidCatch(e: Error, info: ErrorInfo): void {
    console.error(e, info.componentStack)
  }

  override render(): ReactNode {
    if (this.state.err) {
      return (
        <div
          style={{
            padding: 24,
            maxWidth: 640,
            margin: '0 auto',
            color: 'var(--text, #c8d0da)',
            background: 'var(--bg, #0f1419)',
            minHeight: '100vh',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h1 style={{ color: 'var(--head, #f2f5f9)', fontSize: '1.25rem' }}>畫面發生錯誤</h1>
          <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {this.state.err.message}
          </p>
          <p style={{ opacity: 0.85, fontSize: '0.9rem' }}>
            請按 F12 開啟開發者工具 → Console，查看完整錯誤與堆疊，並將訊息提供給維護人員。
          </p>
          <button
            type="button"
            style={{
              marginTop: 16,
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
      )
    }
    return this.props.children
  }
}
