import { useCallback, useEffect, useMemo, useRef } from 'react'
import { QuotePanel } from './components/QuotePanel'
import { PayrollPanel } from './components/PayrollPanel'
import { LedgerPanel } from './components/LedgerPanel'
import { WorkLogPanel } from './components/WorkLogPanel'
import { ReceivablesPanel } from './components/ReceivablesPanel'
import { staffKeysAcrossBook } from './domain/salaryExcelModel'
import { jobSitesFromSalaryBook } from './domain/jobSitesFromBook'
import type { AppState, Tab } from './domain/appState'
import { initialAppState, migrateAppState, QUOTE_ROWS_SCHEMA_VERSION } from './domain/appState'
import { renameReceivableProjectNames } from './domain/receivablesModel'
import { downloadAppBackup, rawDataFromBackupJson } from './domain/appStateBackup'
import { JsonBinSyncBar } from './components/JsonBinSyncBar'
import { AppLoginGate } from './components/AppLoginGate'
import { useAppGateAuth } from './context/AppGateAuthContext'
import { useJsonBinSync } from './hooks/useJsonBinSync'
import { clearPersistentState, usePersistentStateWithUndo } from './hooks/usePersistentState'

export type { AppState, Tab } from './domain/appState'

export default function App() {
  const gate = useAppGateAuth()
  if (!gate.isUnlocked) {
    return <AppLoginGate tryLogin={gate.tryLogin} />
  }
  return <AppShell onLogout={gate.logout} />
}

function AppShell({ onLogout }: { onLogout?: () => void }) {
  const { canEdit } = useAppGateAuth()
  const backupInputRef = useRef<HTMLInputElement>(null)
  const [state, setState, undo, canUndo] = usePersistentStateWithUndo<AppState>(
    initialAppState,
    migrateAppState,
  )
  const jsonBin = useJsonBinSync(state, setState, canEdit)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (jsonBin.cloudBootstrapPending) return
      if (jsonBin.cloudUploadBlocked) return
      if (!canEdit) return
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return
      const el = e.target as HTMLElement | null
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (!canUndo) return
      e.preventDefault()
      undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, canUndo, jsonBin.cloudBootstrapPending, jsonBin.cloudUploadBlocked, canEdit])

  const setTab = useCallback(
    (tab: Tab) => setState((s) => ({ ...s, tab })),
    [setState],
  )

  const patch = useMemo(
    () => (p: Partial<AppState>) => setState((s) => ({ ...s, ...p })),
    [setState],
  )

  const quoteJobSites = useMemo(
    () => jobSitesFromSalaryBook(state.salaryBook),
    [state.salaryBook],
  )

  const worklogStaffKeys = useMemo(
    () => staffKeysAcrossBook(state.salaryBook),
    [state.salaryBook],
  )

  return (
    <div className="app">
      <div
        className="appShell"
        inert={
          jsonBin.cloudBootstrapPending || jsonBin.cloudUploadBlocked ? true : undefined
        }
      >
      <header className="top">
        <div className="topMain">
          <div className="brand">
            <h1>鈞泩放樣 · 營運試算</h1>
            <p className="sub">
              薪水統計版面與計算邏輯對齊 Excel《2026鈞泩薪水統計》：月表案場區塊、總出工數、預支、加班與分期總表。
            </p>
          </div>
          <div className="btnRow" style={{ flexWrap: 'wrap', gap: 8 }}>
          {!canEdit ? (
            <span className="readOnlyBadge" title="訪客登入：僅能瀏覽，無法改寫資料或雲端同步">
              唯讀
            </span>
          ) : null}
          <button
            type="button"
            className="btn secondary"
            disabled={!canEdit || !canUndo}
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
            disabled={!canEdit}
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
                      '確定用此備份「完整取代」目前網頁內所有資料？\n（薪水、估價、收帳、公司帳、工作日誌皆會變成備份檔內容，且會寫入本機瀏覽器。）',
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
            disabled={!canEdit}
            onClick={() => backupInputRef.current?.click()}
          >
            匯入備份
          </button>
          <button
            type="button"
            className="btn danger ghost"
            disabled={!canEdit}
            onClick={() => {
              clearPersistentState()
              setState(initialAppState())
            }}
          >
            清除本機資料
          </button>
          {onLogout ? (
            <button
              type="button"
              className="btn secondary"
              title="清除登入狀態，須重新輸入帳號密碼"
              onClick={onLogout}
            >
              登出
            </button>
          ) : null}
          </div>
        </div>
        <JsonBinSyncBar
          active={jsonBin.active}
          ready={jsonBin.ready}
          line={jsonBin.line}
          lastSavedAt={jsonBin.lastSavedAt}
          lastUploadReceivablesCount={jsonBin.lastUploadReceivablesCount}
          cloudUploadSuspended={jsonBin.cloudUploadSuspended}
          canResumeCloudUpload={jsonBin.resumeCloudUploadAllowed}
          onResumeCloudUpload={() => jsonBin.resumeCloudUpload()}
        />
      </header>

      <nav className="tabs" aria-label="主選單">
        {(
          [
            ['payroll', '薪水統計'],
            ['quote', '放樣估價'],
            ['receivables', '收帳'],
            ['ledger', '公司帳'],
            ['worklog', '工作日誌'],
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
          <fieldset className="tabFieldset" disabled={!canEdit}>
            <PayrollPanel
              salaryBook={state.salaryBook}
              setSalaryBook={(fn) =>
                setState((s) => ({ ...s, salaryBook: fn(s.salaryBook) }))
              }
              months={state.months}
              setMonths={(months) => patch({ months })}
              quoteRows={state.quoteRows}
              workLog={state.workLog}
              setWorkLog={(fn) =>
                setState((s) => ({
                  ...s,
                  workLog: fn(s.workLog),
                }))
              }
              onSiteNameRenamed={(oldEx, newN) =>
                setState((s) => ({
                  ...s,
                  receivables: renameReceivableProjectNames(s.receivables, oldEx, newN),
                }))
              }
            />
          </fieldset>
        )}
        {state.tab === 'quote' && (
          <fieldset className="tabFieldset" disabled={!canEdit}>
            <QuotePanel
              site={state.site}
              setSite={(site) => patch({ site })}
              rows={state.quoteRows}
              setRows={(quoteRows) =>
                patch({ quoteRows, quoteRowsSchemaVersion: QUOTE_ROWS_SCHEMA_VERSION })
              }
            />
          </fieldset>
        )}
        {state.tab === 'receivables' && (
          <ReceivablesPanel
            receivables={state.receivables}
            setReceivables={(fn) =>
              setState((s) => ({ ...s, receivables: fn(s.receivables) }))
            }
            salaryBook={state.salaryBook}
            setSalaryBook={(fn) =>
              setState((s) => ({ ...s, salaryBook: fn(s.salaryBook) }))
            }
            quoteSite={state.site}
            canEdit={canEdit}
          />
        )}
        {state.tab === 'ledger' && (
          <fieldset className="tabFieldset" disabled={!canEdit}>
            <LedgerPanel
              months={state.months}
              setMonths={(months) => patch({ months })}
            />
          </fieldset>
        )}
        {state.tab === 'worklog' && (
          <fieldset className="tabFieldset" disabled={!canEdit}>
            <WorkLogPanel
              workLog={state.workLog}
              setWorkLog={(fn) =>
                setState((s) => ({
                  ...s,
                  workLog: typeof fn === 'function' ? fn(s.workLog) : fn,
                }))
              }
              siteOptions={quoteJobSites}
              quoteRows={state.quoteRows}
              staffOptions={worklogStaffKeys}
              salaryBook={state.salaryBook}
            />
          </fieldset>
        )}
      </main>

      <footer className="foot">
        若與您手邊 Excel 仍有細部差異，請告知要對齊的「工作表名稱＋儲存格公式」。本機與線上可選
        <strong>JSONBin</strong>（設定環境變數則全自動讀寫雲端）或<strong>匯出／匯入備份</strong>；工作日誌一併含在內。未用雲端時，各網址的瀏覽器資料仍互不共用。
      </footer>
      </div>

      {jsonBin.cloudBootstrapPending ? (
        <div
          className="appCloudGate"
          role="dialog"
          aria-modal="true"
          aria-busy="true"
          aria-labelledby="appCloudGateTitle"
          aria-describedby="appCloudGateDesc"
        >
          <div className="appCloudGate__panel">
            <h2 id="appCloudGateTitle" className="appCloudGate__title">
              正在載入雲端資料
            </h2>
            <p id="appCloudGateDesc" className="appCloudGate__desc">
              已啟用 JSONBin 同步，系統正在向雲端取得最新資料。完成前請勿操作畫面，以免與即將載入的內容不一致。
            </p>
            <p className="appCloudGate__hint muted">
              若久未結束，請檢查網路或 JSONBin 服務狀態；未設定雲端時不會出現此畫面。
            </p>
          </div>
        </div>
      ) : null}
      {jsonBin.cloudUploadBlocked && jsonBin.cloudUploadBlockMessage ? (
        <div
          className="appCloudGate appCloudGate--err"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="appJsonBinUploadErrTitle"
          aria-describedby="appJsonBinUploadErrDesc"
        >
          <div className="appCloudGate__panel">
            <h2 id="appJsonBinUploadErrTitle" className="appCloudGate__title">
              JSONBin 上傳失敗
            </h2>
            <p id="appJsonBinUploadErrDesc" className="appCloudGate__desc">
              雲端未更新；您在本機的編輯仍已寫入瀏覽器。在排除問題前，已鎖定操作以免您在不知情下繼續編輯、以為已同步到雲端。
            </p>
            <pre className="appCloudGate__errDetail" role="status">
              {jsonBin.cloudUploadBlockMessage}
            </pre>
            <p className="appCloudGate__hint muted">
              常見原因：超過 JSONBin 免費版大小、網路中斷、金鑰或 Bin id 錯誤。建議先匯出備份，再縮減月表歷史或升級方案。
            </p>
            <div className="btnRow appCloudGate__actions">
              <button
                type="button"
                className="btn primary"
                onClick={() => jsonBin.dismissCloudUploadBlock()}
              >
                暫停雲端上傳並繼續使用
              </button>
            </div>
            <p className="appCloudGate__hint muted" style={{ marginTop: '0.75rem' }}>
              按下後暫停自動上傳；排除問題後請點頁首 JSONBin 區塊的「立即恢復雲端上傳」，會立刻上傳目前資料，無需重新整理。
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
