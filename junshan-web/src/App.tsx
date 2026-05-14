import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { QuotePanel } from './components/QuotePanel'
import { PayrollPanel } from './components/PayrollPanel'
import { CompanyAccountPanel } from './components/CompanyAccountPanel'
import { WorkLogPanel } from './components/WorkLogPanel'
import { CustomLaborWorkspacePanel } from './components/CustomLaborWorkspacePanel'
import { QuotationWorkspacePanel } from './components/QuotationWorkspacePanel'
import { PricingWorkspacePanel } from './components/PricingWorkspacePanel'
import { ReceivablesPanel } from './components/ReceivablesPanel'
import { staffKeysAcrossBook } from './domain/salaryExcelModel'
import { jobSitesFromSalaryBook } from './domain/jobSitesFromBook'
import type { AppState, Tab } from './domain/appState'
import { initialAppState, migrateAppState, QUOTE_ROWS_SCHEMA_VERSION } from './domain/appState'
import { applySiteRenameAcrossAppState } from './domain/siteRenameAcrossApp'
import { AUTO_LEDGER_DERIVED_KEYS, withAutoLedgerDerived } from './domain/ledgerEngine'
import {
  repairWorkLogDayDocumentsAgainstPayroll,
  salaryBookNamedSitesFingerprint,
} from './domain/workLogPayrollLink'
import { sortWorkItemLabelsList } from './domain/workLogModel'
import { downloadAppBackup, rawDataFromBackupJson } from './domain/appStateBackup'
import { JsonBinSyncBar } from './components/JsonBinSyncBar'
import { TableArrowNavigation } from './components/TableArrowNavigation'
import { AppLoginGate } from './components/AppLoginGate'
import { useAppGateAuth } from './context/AppGateAuthContext'
import { useJsonBinSync } from './hooks/useJsonBinSync'
import { clearPersistentState, usePersistentStateWithUndo } from './hooks/usePersistentState'

export type { AppState, ClientDocsSheet, Tab } from './domain/appState'

/** 左側導覽分組（不重複定義 Tab，僅整理視覺層級） */
const APP_MAIN_NAV_GROUPS: { groupLabel: string; items: { id: Tab; label: string }[] }[] = [
  {
    groupLabel: '現場與薪資',
    items: [
      { id: 'payroll', label: '薪水統計' },
      { id: 'worklog', label: '工作日誌' },
    ],
  },
  {
    groupLabel: '報價與文件',
    items: [
      { id: 'quote', label: '放樣估價' },
      { id: 'clientDocs', label: '對外文件' },
    ],
  },
  {
    groupLabel: '帳務',
    items: [
      { id: 'receivables', label: '收帳' },
      { id: 'ledger', label: '公司帳' },
    ],
  },
]

const APP_SIDEBAR_MEDIA = '(min-width: 768px)'

export default function App() {
  const gate = useAppGateAuth()
  if (!gate.isUnlocked) {
    return <AppLoginGate tryLogin={gate.tryLogin} />
  }
  return <AppShell onLogout={gate.logout} />
}

function AppShell({ onLogout }: { onLogout?: () => void }) {
  const gate = useAppGateAuth()
  const { canEdit, isUnlocked } = gate
  const backupInputRef = useRef<HTMLInputElement>(null)
  const [state, setState, undo, canUndo] = usePersistentStateWithUndo<AppState>(
    initialAppState,
    migrateAppState,
  )
  /** 供案場全書更名：blur 須同步讀到最新 state 並回傳訊息，避免依賴 flushSync 卡整頁。 */
  const appStateRef = useRef(state)
  appStateRef.current = state
  const jsonBin = useJsonBinSync(state, setState, canEdit)
  /** 遞增時強制重掛薪水頁「快速登記」：登入／雲端首載後同步選項；快速登記成功後清空表單 */
  const [fieldworkQuickResetKey, setFieldworkQuickResetKey] = useState(0)
  const prevUnlockedRef = useRef(false)
  useEffect(() => {
    if (!prevUnlockedRef.current && isUnlocked) {
      setFieldworkQuickResetKey((k) => k + 1)
    }
    prevUnlockedRef.current = isUnlocked
  }, [isUnlocked])

  const cloudPendingRef = useRef<boolean | null>(null)
  useEffect(() => {
    const p = jsonBin.cloudBootstrapPending
    if (cloudPendingRef.current === null) {
      cloudPendingRef.current = p
      return
    }
    if (cloudPendingRef.current && !p) {
      setFieldworkQuickResetKey((k) => k + 1)
    }
    cloudPendingRef.current = p
  }, [jsonBin.cloudBootstrapPending])

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

  const ensureWorkItemLabelsInPresets = useCallback(
    (labels: readonly string[]) => {
      setState((s) => ({
        ...s,
        workItemPresetLabels: sortWorkItemLabelsList([...s.workItemPresetLabels, ...labels]),
      }))
    },
    [setState],
  )

  const renameWorkItemPresetLabel = useCallback(
    (from: string, to: string) => {
      const fromTrim = from.trim()
      const toTrim = to.trim()
      if (!fromTrim || !toTrim || fromTrim === toTrim) return
      setState((s) => {
        const inPreset = s.workItemPresetLabels.includes(fromTrim)
        const inCustom = (s.workLog.customWorkItemLabels ?? []).includes(fromTrim)
        if (!inPreset && !inCustom) return s
        const workItemPresetLabels = sortWorkItemLabelsList(
          s.workItemPresetLabels.map((x) => (x === fromTrim ? toTrim : x)),
        )
        const customWorkItemLabels = sortWorkItemLabelsList(
          (s.workLog.customWorkItemLabels ?? []).map((x) => (x === fromTrim ? toTrim : x)),
        )
        return {
          ...s,
          workItemPresetLabels,
          workLog: { ...s.workLog, customWorkItemLabels },
        }
      })
    },
    [setState],
  )

  const removeWorkItemPresetLabel = useCallback(
    (label: string) => {
      const t = label.trim()
      if (!t) return
      setState((s) => ({
        ...s,
        workItemPresetLabels: sortWorkItemLabelsList(s.workItemPresetLabels.filter((x) => x !== t)),
        workLog: {
          ...s.workLog,
          customWorkItemLabels: sortWorkItemLabelsList(
            (s.workLog.customWorkItemLabels ?? []).filter((x) => x !== t),
          ),
        },
      }))
    },
    [setState],
  )

  const namedSitesFingerprint = useMemo(
    () => salaryBookNamedSitesFingerprint(state.salaryBook),
    [state.salaryBook],
  )

  /** 月表案場名增刪／更名後：整日文件與骨架重併，去掉「新案名＋舊案名」重複區塊。 */
  useEffect(() => {
    setState((s) => {
      const w = repairWorkLogDayDocumentsAgainstPayroll(s.workLog, s.salaryBook)
      if (w === s.workLog) return s
      return { ...s, workLog: w }
    })
  }, [namedSitesFingerprint, setState])

  useEffect(() => {
    setState((s) => {
      const nextMonths = withAutoLedgerDerived(
        s.months,
        s.salaryBook,
        s.receivables,
        s.ledgerYear,
        s.workLog,
      )
      if (nextMonths.length !== s.months.length) return { ...s, months: nextMonths }
      for (let i = 0; i < s.months.length; i++) {
        const changed = AUTO_LEDGER_DERIVED_KEYS.some(
          (k) => s.months[i]![k] !== nextMonths[i]![k],
        )
        if (changed) {
          return { ...s, months: nextMonths }
        }
      }
      return s
    })
  }, [setState, state.salaryBook, state.receivables, state.ledgerYear, state.workLog])

  const quoteJobSites = useMemo(
    () => jobSitesFromSalaryBook(state.salaryBook),
    [state.salaryBook],
  )

  const worklogStaffKeys = useMemo(
    () => staffKeysAcrossBook(state.salaryBook),
    [state.salaryBook],
  )

  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(APP_SIDEBAR_MEDIA)
    const onMq = () => {
      if (mq.matches) setMobileNavOpen(false)
    }
    mq.addEventListener('change', onMq)
    onMq()
    return () => mq.removeEventListener('change', onMq)
  }, [])

  useEffect(() => {
    if (!mobileNavOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileNavOpen])

  const pickTab = useCallback(
    (tab: Tab) => {
      setTab(tab)
      setMobileNavOpen(false)
    },
    [setTab],
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
          <button
            type="button"
            className="appSidebarToggle"
            aria-expanded={mobileNavOpen}
            aria-controls="app-sidebar"
            onClick={() => setMobileNavOpen((o) => !o)}
          >
            <span className="appSidebarToggle__icon" aria-hidden>
              ☰
            </span>
            <span className="appSidebarToggle__text">功能選單</span>
          </button>
          <div className="brand">
            <h1>鈞泩放樣 · 營運試算</h1>
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
                      '確定用此備份「完整取代」目前網頁內所有資料？\n（薪水、估價、收帳、公司損益表、工作日誌皆會變成備份檔內容，且會寫入本機瀏覽器。）',
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
          cloudUploadSuspended={jsonBin.cloudUploadSuspended}
          canResumeCloudUpload={jsonBin.resumeCloudUploadAllowed}
          onResumeCloudUpload={() => jsonBin.resumeCloudUpload()}
          canRestoreFromCloud={canEdit && jsonBin.canRestoreFromCloud}
          restoringFromCloud={jsonBin.restoringFromCloud}
          onRestoreFromCloud={() => void jsonBin.restoreFromCloud()}
        />
      </header>

      {mobileNavOpen ? (
        <button
          type="button"
          className="appSidebarBackdrop"
          aria-label="關閉選單"
          tabIndex={-1}
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <div className="appLayout">
        <aside
          id="app-sidebar"
          className={`appSidebar ${mobileNavOpen ? 'appSidebar--open' : ''}`}
          aria-label="主選單"
        >
          {APP_MAIN_NAV_GROUPS.map((g) => (
            <div key={g.groupLabel} className="appSidebar__group">
              <div className="appSidebar__groupLabel">{g.groupLabel}</div>
              <nav className="appSidebar__nav" aria-label={g.groupLabel}>
                {g.items.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    className={`appSidebar__item tab ${state.tab === id ? 'on' : ''}`}
                    onClick={() => pickTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            </div>
          ))}
        </aside>

        <div className="appLayout__content">
          <main className="main">
            <TableArrowNavigation />
        {state.tab === 'payroll' && (
          <fieldset className="tabFieldset" disabled={!canEdit}>
            <PayrollPanel
              salaryBook={state.salaryBook}
              setSalaryBook={(fn) =>
                setState((s) => ({ ...s, salaryBook: fn(s.salaryBook) }))
              }
              months={state.months}
              setMonths={(months) => patch({ months })}
              workItemPresetLabels={state.workItemPresetLabels}
              ensureWorkItemLabelsInPresets={ensureWorkItemLabelsInPresets}
              renameWorkItemPresetLabel={renameWorkItemPresetLabel}
              removeWorkItemPresetLabel={removeWorkItemPresetLabel}
              workLog={state.workLog}
              setWorkLog={(fn) =>
                setState((s) => ({
                  ...s,
                  workLog: fn(s.workLog),
                }))
              }
              fieldworkQuickResetKey={fieldworkQuickResetKey}
              onFieldworkQuickApplySuccess={() =>
                setFieldworkQuickResetKey((k) => k + 1)
              }
              commitSiteRenameAcrossApp={({ oldExact, newTrimmed, edited }) => {
                try {
                  const r = applySiteRenameAcrossAppState(
                    appStateRef.current,
                    oldExact,
                    newTrimmed,
                    edited,
                  )
                  const msg =
                    typeof r.message === 'string' && r.message.trim() !== ''
                      ? r.message
                      : r.ok
                        ? r.message
                        : '無法完成此次更名（未回傳原因）。'
                  if (!r.ok) return { ok: false, message: msg }
                  setState(r.state)
                  appStateRef.current = r.state
                  return { ok: true, message: msg }
                } catch (e) {
                  return {
                    ok: false,
                    message: e instanceof Error ? e.message : String(e),
                  }
                }
              }}
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
              persistSlice={{
                site: state.site,
                quoteRows: state.quoteRows,
                quoteRowsSchemaVersion: state.quoteRowsSchemaVersion,
              }}
              onApplyPersistSlice={(slice) =>
                patch({
                  site: slice.site,
                  quoteRows: slice.quoteRows,
                  quoteRowsSchemaVersion: slice.quoteRowsSchemaVersion,
                })
              }
              quoteLibraryDisabled={!canEdit}
              commitSiteRenameFromQuoteNameBlur={
                canEdit
                  ? (oldEx, newT) => {
                      try {
                        const r = applySiteRenameAcrossAppState(appStateRef.current, oldEx, newT)
                        const msg =
                          typeof r.message === 'string' && r.message.trim() !== ''
                            ? r.message
                            : r.ok
                              ? r.message
                              : '無法完成此次更名（未回傳原因）。'
                        if (!r.ok) {
                          setState((s) => ({ ...s, site: { ...s.site, name: oldEx } }))
                          return { ok: false, message: msg }
                        }
                        setState(r.state)
                        appStateRef.current = r.state
                        return { ok: true, message: msg }
                      } catch (e) {
                        return {
                          ok: false,
                          message: e instanceof Error ? e.message : String(e),
                        }
                      }
                    }
                  : undefined
              }
            />
          </fieldset>
        )}
        {state.tab === 'clientDocs' && (
          <fieldset className="tabFieldset" disabled={!canEdit}>
            <div className="btnRow quoteSheetTabs" style={{ marginBottom: 12 }} role="tablist" aria-label="對外文件">
              <button
                type="button"
                role="tab"
                aria-selected={state.clientDocsSheet === 'workDetail'}
                className={`tab ${state.clientDocsSheet === 'workDetail' ? 'on' : ''}`}
                onClick={() => setState((s) => ({ ...s, clientDocsSheet: 'workDetail' }))}
              >
                承攬供述明細
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={state.clientDocsSheet === 'quotation'}
                className={`tab ${state.clientDocsSheet === 'quotation' ? 'on' : ''}`}
                onClick={() => setState((s) => ({ ...s, clientDocsSheet: 'quotation' }))}
              >
                報價單
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={state.clientDocsSheet === 'pricing'}
                className={`tab ${state.clientDocsSheet === 'pricing' ? 'on' : ''}`}
                onClick={() => setState((s) => ({ ...s, clientDocsSheet: 'pricing' }))}
              >
                計價單
              </button>
            </div>
            {state.clientDocsSheet === 'workDetail' ? (
              <CustomLaborWorkspacePanel
                workspace={state.customLaborWorkspace}
                setWorkspace={(fn) =>
                  setState((s) => ({
                    ...s,
                    customLaborWorkspace:
                      typeof fn === 'function' ? fn(s.customLaborWorkspace) : fn,
                  }))
                }
              />
            ) : state.clientDocsSheet === 'quotation' ? (
              <QuotationWorkspacePanel
                workspace={state.quotationWorkspace}
                setWorkspace={(fn) =>
                  setState((s) => ({
                    ...s,
                    quotationWorkspace:
                      typeof fn === 'function' ? fn(s.quotationWorkspace) : fn,
                  }))
                }
              />
            ) : (
              <PricingWorkspacePanel
                workspace={state.pricingWorkspace}
                setWorkspace={(fn) =>
                  setState((s) => ({
                    ...s,
                    pricingWorkspace:
                      typeof fn === 'function' ? fn(s.pricingWorkspace) : fn,
                  }))
                }
                contractContents={state.contractContents}
                receivables={state.receivables}
              />
            )}
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
            contractContents={state.contractContents}
            quoteSite={state.site}
            canEdit={canEdit}
          />
        )}
        {state.tab === 'ledger' && (
          <CompanyAccountPanel
            months={state.months}
            setMonths={(months) => patch({ months })}
            ledgerYear={state.ledgerYear}
            setLedgerYear={(ledgerYear) => patch({ ledgerYear })}
            salaryBook={state.salaryBook}
            receivables={state.receivables}
            workLog={state.workLog}
            contractContents={state.contractContents}
            setContractContents={(fn) =>
              setState((s) => ({ ...s, contractContents: fn(s.contractContents) }))
            }
            canEdit={canEdit}
          />
        )}
        {state.tab === 'worklog' && (
          <fieldset className="tabFieldset" disabled={!canEdit}>
            <WorkLogPanel
              canEdit={canEdit}
              workLog={state.workLog}
              setWorkLog={(fn) =>
                setState((s) => ({
                  ...s,
                  workLog: typeof fn === 'function' ? fn(s.workLog) : fn,
                }))
              }
              siteOptions={quoteJobSites}
              workItemPresetLabels={state.workItemPresetLabels}
              ensureWorkItemLabelsInPresets={ensureWorkItemLabelsInPresets}
              staffOptions={worklogStaffKeys}
              salaryBook={state.salaryBook}
              setSalaryBook={(fn) =>
                setState((s) => ({ ...s, salaryBook: fn(s.salaryBook) }))
              }
            />
          </fieldset>
        )}
          </main>

          <footer className="foot">
            若與您手邊 Excel 仍有細部差異，請告知要對齊的「工作表名稱＋儲存格公式」。本機與線上可選
            <strong>JSONBin</strong>（設定環境變數則全自動讀寫雲端）或<strong>匯出／匯入備份</strong>；工作日誌一併含在內。未用雲端時，各網址的瀏覽器資料仍互不共用。
          </footer>
        </div>
      </div>
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
