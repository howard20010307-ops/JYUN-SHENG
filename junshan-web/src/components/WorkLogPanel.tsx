import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WorkLogEntry, WorkLogState } from '../domain/workLogModel'
import {
  newWorkLogEntry,
  nowIso,
  sortWorkLogEntries,
  todayYmdLocal,
} from '../domain/workLogModel'

type Props = {
  workLog: WorkLogState
  setWorkLog: (v: WorkLogState | ((prev: WorkLogState) => WorkLogState)) => void
  siteOptions: readonly { id: string; name: string }[]
}

const EMPTY_SITE = ''

export function WorkLogPanel({ workLog, setWorkLog, siteOptions }: Props) {
  const sorted = useMemo(
    () => sortWorkLogEntries(workLog.entries),
    [workLog.entries],
  )

  const [draft, setDraft] = useState<{
    id: string | null
    logDate: string
    siteName: string
    content: string
  }>(() => ({
    id: null,
    logDate: todayYmdLocal(),
    siteName: '',
    content: '',
  }))

  const isEditing = draft.id != null

  const resetForm = useCallback(() => {
    setDraft({
      id: null,
      logDate: todayYmdLocal(),
      siteName: '',
      content: '',
    })
  }, [])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isEditing) resetForm()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [isEditing, resetForm])

  const startEdit = useCallback((e: WorkLogEntry) => {
    setDraft({
      id: e.id,
      logDate: e.logDate,
      siteName: e.siteName,
      content: e.content,
    })
  }, [])

  const onSave = useCallback(() => {
    const t = nowIso()
    if (!draft.content.trim()) {
      window.alert('請填寫內文。')
      return
    }
    if (draft.id) {
      setWorkLog((w) => ({
        entries: w.entries.map((x) =>
          x.id === draft.id
            ? {
                ...x,
                logDate: draft.logDate,
                siteName: draft.siteName,
                content: draft.content,
                updatedAt: t,
              }
            : x,
        ),
      }))
    } else {
      setWorkLog((w) => ({
        entries: [
          ...w.entries,
          newWorkLogEntry({
            logDate: draft.logDate,
            siteName: draft.siteName,
            content: draft.content,
          }),
        ],
      }))
    }
    resetForm()
  }, [draft, setWorkLog, resetForm])

  const onDelete = useCallback(
    (id: string) => {
      if (!window.confirm('確定刪除此筆日誌？')) return
      setWorkLog((w) => ({ entries: w.entries.filter((x) => x.id !== id) }))
      if (draft.id === id) resetForm()
    },
    [setWorkLog, draft.id, resetForm],
  )

  return (
    <div className="panel">
      <h2>工作日誌</h2>
      <p className="hint" style={{ marginBottom: 16 }}>
        記錄當日重點；可關聯案場。資料一併寫入匯出備份與雲端 JSONBin。勿在公共電腦或他人可見螢幕輸入敏感內容。
      </p>

      <section className="card worklogForm">
        <h3>{isEditing ? '編輯日誌' : '新增一則'}</h3>
        <div className="worklogFormGrid">
          <label className="worklogFormLabel">
            <span>日期</span>
            <input
              type="date"
              className="titleInput"
              value={draft.logDate}
              onChange={(e) => setDraft((d) => ({ ...d, logDate: e.target.value }))}
            />
          </label>
          <label className="worklogFormLabel">
            <span>案場（可空白）</span>
            <select
              className="titleInput"
              value={draft.siteName ? draft.siteName : EMPTY_SITE}
              onChange={(e) =>
                setDraft((d) => ({ ...d, siteName: e.target.value === EMPTY_SITE ? '' : e.target.value }))
              }
            >
              <option value={EMPTY_SITE}>不指定</option>
              {siteOptions.map((o) => (
                <option key={o.id} value={o.name}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="worklogFormLabel" style={{ marginTop: 8 }}>
          <span>內文</span>
          <textarea
            className="worklogTextarea"
            value={draft.content}
            onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
            rows={6}
            placeholder="當天工作摘要、人員、材料、待辦…"
          />
        </label>
        <div className="btnRow" style={{ marginTop: 12 }}>
          <button type="button" className="btn" onClick={onSave}>
            {isEditing ? '儲存變更' : '新增儲存'}
          </button>
          {isEditing ? (
            <button type="button" className="btn secondary" onClick={resetForm}>
              取消
            </button>
          ) : null}
        </div>
      </section>

      <section className="card" style={{ marginTop: 20 }}>
        <h3>列表（新→舊）</h3>
        {sorted.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>
            尚無日誌。
          </p>
        ) : (
          <ul className="worklogList">
            {sorted.map((e) => (
              <li key={e.id} className="worklogListItem">
                <div className="worklogListItemHead">
                  <span className="worklogListDate">
                    {e.logDate} {e.siteName ? <span className="worklogSitePill">· {e.siteName}</span> : null}
                  </span>
                  <span className="worklogListActions">
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => startEdit(e)}
                    >
                      編輯
                    </button>
                    <button
                      type="button"
                      className="btn danger ghost"
                      onClick={() => onDelete(e.id)}
                    >
                      刪除
                    </button>
                  </span>
                </div>
                <pre className="worklogListBody">{e.content || '（空白）'}</pre>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
