import type { JsonBinLine } from '../hooks/useJsonBinSync'

type Props = {
  active: boolean
  ready: boolean
  line: JsonBinLine
  lastSavedAt: Date | null
  /** 上次成功上傳時一併記錄之收帳筆數 */
  lastUploadReceivablesCount: number | null
  cloudUploadSuspended: boolean
  canResumeCloudUpload: boolean
  onResumeCloudUpload: () => void
}

/**
 * 顯示 JSONBin 雲端同步狀態（不設定環境變數時不渲染實質內容，僅佔外層不顯示的極小區塊可於 App 內以 active 判斷不 mount）。
 */
export function JsonBinSyncBar({
  active,
  ready,
  line,
  lastSavedAt,
  lastUploadReceivablesCount,
  cloudUploadSuspended,
  canResumeCloudUpload,
  onResumeCloudUpload,
}: Props) {
  if (!active) {
    return null
  }
  const timeFmt: Intl.DateTimeFormatOptions = {
    dateStyle: 'short',
    timeStyle: 'medium',
  }

  return (
    <div className="jsonbinSyncBar">
      <div className="jsonbinSyncBar__row">
        <strong>JSONBin</strong>
        {!ready ? (
          <span className="jsonbinSyncBar__msg">讀取雲端中…</span>
        ) : (
          <span className="jsonbinSyncBar__ok">變更會自動同步至雲端（約 1 秒防抖）。</span>
        )}
      </div>
      {ready && cloudUploadSuspended && canResumeCloudUpload ? (
        <div className="jsonbinSyncBar__resume">
          <p className="jsonbinSyncBar__resumeText muted">
            雲端自動上傳已暫停（先前上傳失敗後選擇暫停）。排除問題後可立刻恢復，無需重新整理。
          </p>
          <button type="button" className="btn primary jsonbinSyncBar__resumeBtn" onClick={onResumeCloudUpload}>
            立即恢復雲端上傳
          </button>
        </div>
      ) : null}
      {ready ? (
        <p
          className="jsonbinSyncBar__record muted"
          title="紀錄存在此網址使用的瀏覽器內，重新整理後仍會顯示。"
        >
          {lastSavedAt ? (
            <>
              上次<strong>雲端上傳成功</strong>：{lastSavedAt.toLocaleString('zh-TW', timeFmt)}
              {typeof lastUploadReceivablesCount === 'number' ? (
                <>
                  {' '}
                  （收帳 <strong>{lastUploadReceivablesCount}</strong> 筆已納入該次上傳）
                </>
              ) : null}
            </>
          ) : (
            <>尚無雲端上傳成功紀錄；編輯並儲存後會顯示時間。</>
          )}
        </p>
      ) : null}
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
