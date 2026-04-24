import { useCallback, useEffect, useMemo, useRef } from 'react'
import { QuotePanel } from './components/QuotePanel'
import { PayrollPanel } from './components/PayrollPanel'
import { LedgerPanel } from './components/LedgerPanel'
import type { SalaryBook } from './domain/salaryExcelModel'
import type { AppState, Tab } from './domain/appState'
import { initialAppState, migrateAppState } from './domain/appState'
import { downloadAppBackup, rawDataFromBackupJson } from './domain/appStateBackup'
import { FirebaseSyncBar } from './components/FirebaseSyncBar'
import { clearPersistentState, usePersistentStateWithUndo } from './hooks/usePersistentState'

export type { AppState, Tab } from './domain/appState'

function jobSitesFromBook(book: SalaryBook): { id: string; name: string }[] {
  const seen = new Set<string>()
  const out: { id: string; name: string }[] = []
  for (const m of book.months) {
    for (const b of m.blocks) {
      const n = b.siteName.trim()
      if (!n || seen.has(n)) continue
      seen.add(n)
      out.push({ id: n, name: n })
    }
  }
  return out
}

export default function App() {
  const backupInputRef = useRef<HTMLInputElement>(null)
  const [state, setState, undo, canUndo] = usePersistentStateWithUndo<AppState>(
    initialAppState,
    migrateAppState,
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return
      const el = e.target as HTMLElement | null
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (!canUndo) return
      e.preventDefault()
      undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, canUndo])

  const setTab = useCallback(
    (tab: Tab) => setState((s) => ({ ...s, tab })),
    [setState],
  )

  const patch = useMemo(
    () => (p: Partial<AppState>) => setState((s) => ({ ...s, ...p })),
    [setState],
  )

  const quoteJobSites = useMemo(
    () => jobSitesFromBook(state.salaryBook),
    [state.salaryBook],
  )

  return (
    <div className="app">
      <header className="top">
        <div className="topMain">
          <div className="brand">
            <h1>鈞泩放樣 · 營運試算</h1>
            <p className="sub">
              薪水統計版面與計算邏輯對齊 Excel《2026鈞泩薪水統計》：月表案場區塊、總出工數、預支、加班與分期總表。
            </p>
          </div>
          <div className="btnRow" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            className="btn secondary"
            disabled={!canUndo}
            onClick={undo}
            title="不在輸入框內時，可用 Ctrl+Z／⌘Z"
          >
            回復上一步
          </button>
          <button type="button" className="btn secondary" onClick={() => downloadAppBackup(state)}>
            匯出備份（同步用）
          </button>
          <input
            ref={backupInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              const reader = new FileReader()
              reader.onload = () => {
                try {
                  const text = String(reader.result ?? '')
                  const raw = rawDataFromBackupJson(text)
                  const next = migrateAppState(raw)
                  if (
                    !window.confirm(
                      '確定用此備份「完整取代」目前網頁內所有資料？\n（薪水、估價、公司帳皆會變成備份檔內容，且會寫入本機瀏覽器。）',
                    )
                  ) {
                    return
                  }
                  setState(next)
                } catch (err) {
                  alert(err instanceof Error ? err.message : String(err))
                }
              }
              reader.readAsText(f, 'UTF-8')
            }}
          />
          <button
            type="button"
            className="btn secondary"
            onClick={() => backupInputRef.current?.click()}
          >
            匯入備份
          </button>
          <button
            type="button"
            className="btn danger ghost"
            onClick={() => {
              clearPersistentState()
              setState(initialAppState())
            }}
          >
            清除本機資料
          </button>
          </div>
        </div>
        <FirebaseSyncBar state={state} setState={setState} />
      </header>

      <nav className="tabs" aria-label="主選單">
        {(
          [
            ['payroll', '薪水統計'],
            ['quote', '放樣估價'],
            ['ledger', '公司帳'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`tab ${state.tab === id ? 'on' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="main">
        {state.tab === 'payroll' && (
          <PayrollPanel
            salaryBook={state.salaryBook}
            setSalaryBook={(fn) =>
              setState((s) => ({ ...s, salaryBook: fn(s.salaryBook) }))
            }
            months={state.months}
            setMonths={(months) => patch({ months })}
          />
        )}
        {state.tab === 'quote' && (
          <QuotePanel
            site={state.site}
            setSite={(site) => patch({ site })}
            rows={state.quoteRows}
            setRows={(quoteRows) => patch({ quoteRows })}
            jobSites={quoteJobSites}
          />
        )}
        {state.tab === 'ledger' && (
          <LedgerPanel
            months={state.months}
            setMonths={(months) => patch({ months })}
          />
        )}
      </main>

      <footer className="foot">
        若與您手邊 Excel 仍有細部差異，請告知要對齊的「工作表名稱＋儲存格公式」。本機與線上可選
        <strong> Google 雲端（Firebase）</strong>或<strong>匯出／匯入備份</strong>同步；未登入雲端時，各網址的瀏覽器資料仍互不共用。
      </footer>
    </div>
  )
}
