import type { JsonBinLine } from '../hooks/useJsonBinSync'

type Props = {
  active: boolean
  ready: boolean
  line: JsonBinLine
  lastSavedAt: Date | null
}

/**
 * 顯示 JSONBin 雲端同步狀態（不設定環境變數時不渲染實質內容，僅佔外層不顯示的極小區塊可於 App 內以 active 判斷不 mount）。
 */
export function JsonBinSyncBar({ active, ready, line, lastSavedAt }: Props) {
  if (!active) {
    return null
  }
  return (
    <div className="jsonbinSyncBar">
      <div className="jsonbinSyncBar__row">
        <strong>JSONBin</strong>
        {!ready ? (
          <span className="jsonbinSyncBar__msg">讀取雲端中…</span>
        ) : (
          <span className="jsonbinSyncBar__ok">
            變更會自動儲存
            {lastSavedAt
              ? `（上次寫入：${lastSavedAt.toLocaleString('zh-TW')}）`
              : null}
          </span>
        )}
      </div>
      {line ? (
        <p
          className={`jsonbinSyncBar__hint${line.isError ? ' jsonbinSyncBar__hint--err' : ''}`}
        >
          {line.text}
        </p>
      ) : null}
    </div>
  )
}
