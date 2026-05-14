import type { ChangeEvent } from 'react'
import { useMemo, useRef, useState } from 'react'
import type { QuotePersistSlice } from '../domain/appState'
import {
  addQuoteProjectToStore,
  deleteQuoteProjectFromStore,
  downloadQuoteProjectFile,
  loadQuoteProjectStore,
  overwriteQuoteProjectInStore,
  parseQuoteProjectImportText,
  renameQuoteProjectInStore,
  saveQuoteProjectStore,
} from '../domain/quoteProjectStorage'

type Props = {
  persistSlice: QuotePersistSlice
  onApplyPersistSlice: (slice: QuotePersistSlice) => void
  disabled?: boolean
}

function formatSavedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function QuoteProjectLibrary({ persistSlice, onApplyPersistSlice, disabled }: Props) {
  const [store, setStore] = useState(loadQuoteProjectStore)
  const importRef = useRef<HTMLInputElement>(null)
  const [selectedId, setSelectedId] = useState('')

  const sorted = useMemo(
    () => [...store.projects].sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0)),
    [store.projects],
  )

  function commit(next: ReturnType<typeof loadQuoteProjectStore>) {
    saveQuoteProjectStore(next)
    setStore(next)
  }

  function handleSaveNew() {
    if (disabled) return
    const guess = persistSlice.site.name?.trim() || '未命名估價'
    const name = window.prompt('加入本機列表的專案名稱', guess)
    if (name === null) return
    const trimmed = name.trim()
    if (!trimmed) {
      window.alert('名稱不可為空。')
      return
    }
    const next = addQuoteProjectToStore(store, trimmed, persistSlice)
    commit(next)
    const added = next.projects[next.projects.length - 1]
    if (added) setSelectedId(added.id)
  }

  function handleOverwriteSelected() {
    if (disabled || !selectedId) return
    if (!window.confirm('以目前畫面上的放樣估價覆寫所選專案？')) return
    commit(overwriteQuoteProjectInStore(store, selectedId, persistSlice))
  }

  function handleLoadSelected() {
    if (disabled || !selectedId) return
    const p = store.projects.find((x) => x.id === selectedId)
    if (!p) return
    if (!window.confirm('以所選專案取代目前放樣估價（案場與估價列）？')) return
    onApplyPersistSlice({
      site: p.site,
      quoteRows: p.quoteRows,
      quoteRowsSchemaVersion: p.quoteRowsSchemaVersion,
    })
  }

  function handleDeleteSelected() {
    if (disabled || !selectedId) return
    if (!window.confirm('從本機列表刪除此專案？（不影響目前已開啟的估價）')) return
    const next = deleteQuoteProjectFromStore(store, selectedId)
    commit(next)
    setSelectedId('')
  }

  function handleRenameSelected() {
    if (disabled || !selectedId) return
    const p = store.projects.find((x) => x.id === selectedId)
    if (!p) return
    const name = window.prompt('新的專案名稱', p.name)
    if (name === null) return
    const next = renameQuoteProjectInStore(store, selectedId, name)
    if (next === store) {
      window.alert('名稱不可為空。')
      return
    }
    commit(next)
  }

  function handleExportFile() {
    if (disabled) return
    const guess = persistSlice.site.name?.trim() || ''
    const hint = window.prompt('匯出檔案的顯示名稱（可留空）', guess)
    if (hint === null) return
    downloadQuoteProjectFile(persistSlice, hint.trim() === '' ? undefined : hint)
  }

  function handleImportPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || disabled) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      const r = parseQuoteProjectImportText(text)
      if (!r.ok) {
        window.alert(r.message)
        return
      }
      if (!window.confirm('以檔案內容取代目前放樣估價（案場與估價列）？')) return
      onApplyPersistSlice(r.slice)
    }
    reader.readAsText(file, 'utf-8')
  }

  return (
    <section className="card" style={{ marginBottom: 12 }}>
      <div className="panelHead">
        <h3>估價專案（本機列表與檔案）</h3>
      </div>
      <p className="help" style={{ marginTop: 0 }}>
        僅含放樣估價：案場、估價列、列結構版本。列表存在獨立的本機鍵（與全站
        `junshan-web-v1` 分開，不會互蓋）。「從檔案載入」只會取代目前估價三欄，並會拒絕全站備份
        JSON；整包還原請用備份功能。
      </p>
      <div className="btnRow" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button type="button" className="btn secondary" disabled={disabled} onClick={handleSaveNew}>
          加入本機列表
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={disabled || !selectedId}
          onClick={handleOverwriteSelected}
        >
          覆寫所選
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={disabled || !selectedId}
          onClick={handleLoadSelected}
        >
          載入所選
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={disabled || !selectedId}
          onClick={handleRenameSelected}
        >
          重新命名
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={disabled || !selectedId}
          onClick={handleDeleteSelected}
        >
          刪除所選
        </button>
        <button type="button" className="btn secondary" disabled={disabled} onClick={handleExportFile}>
          匯出 JSON
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={disabled}
          onClick={() => importRef.current?.click()}
        >
          從檔案載入
        </button>
        <input
          ref={importRef}
          type="file"
          hidden
          accept="application/json,.json"
          onChange={handleImportPick}
        />
      </div>
      <label className="field" style={{ marginTop: 12, marginBottom: 0 }}>
        <span>已存專案</span>
        <select
          className="control"
          value={selectedId}
          disabled={disabled}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">— 選取一筆 —</option>
          {sorted.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}（{formatSavedAt(p.savedAt)}）
            </option>
          ))}
        </select>
      </label>
    </section>
  )
}
