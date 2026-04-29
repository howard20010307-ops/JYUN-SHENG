import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppState } from '../domain/appState'
import {
  downloadAppStateFromJsonBin,
  getJsonBinKeyErrorMessage,
  hasJsonBinEnvIntent,
  isJsonBinConfigured,
  readLastJsonBinUploadSuccessAt,
  uploadAppStateToJsonBin,
  writeLastJsonBinUploadSuccessAt,
} from '../services/jsonbin'

export type JsonBinLine = { text: string; isError: boolean } | null

const SAVE_MS = 700

/**
 * 已設定 VITE_JSONBIN_* 時：開啟時自 JSONBin 拉下有效資料則覆寫 state；
 * 之後 state 變更會 debounce 自動上傳。金鑰在瀏覽器內可見，僅適合個人／內部使用。
 */
export function useJsonBinSync(
  state: AppState,
  setState: React.Dispatch<React.SetStateAction<AppState>>,
  allowCloudWrite = true,
): {
  active: boolean
  ready: boolean
  line: JsonBinLine
  lastSavedAt: Date | null
  /** 已設定有效 JSONBin、且尚未完成首次雲端讀取：應鎖定操作避免與即將覆寫之雲端資料打架 */
  cloudBootstrapPending: boolean
  /** 自動上傳失敗：應全螢幕鎖定，直到使用者暫停雲端上傳 */
  cloudUploadBlocked: boolean
  cloudUploadBlockMessage: string | null
  dismissCloudUploadBlock: () => void
  /** 使用者已選暫停上傳後為 true；可呼叫 {@link resumeCloudUpload} 立刻恢復，不必重新整理 */
  cloudUploadSuspended: boolean
  /** 可安全執行恢復／自動上傳（金鑰有效、已就緒、且允許寫入） */
  resumeCloudUploadAllowed: boolean
  resumeCloudUpload: () => void
} {
  const envIntent = hasJsonBinEnvIntent()
  const keyErr = getJsonBinKeyErrorMessage()
  const canUse = isJsonBinConfigured()
  /** 無意用雲端、金鑰錯誤、或設定不完整時不等待下載，避免畫面鎖一幀 */
  const [ready, setReady] = useState(
    () => !envIntent || Boolean(keyErr) || !canUse,
  )
  const [line, setLine] = useState<JsonBinLine>(() =>
    keyErr ? { text: keyErr, isError: true } : null,
  )
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(() =>
    envIntent ? readLastJsonBinUploadSuccessAt() : null,
  )
  const [uploadBlockMessage, setUploadBlockMessage] = useState<string | null>(null)
  const [cloudUploadSuspended, setCloudUploadSuspended] = useState(false)
  const skipNextUpload = useRef(false)
  /** 瀏覽器 setTimeout 回傳 number；與 NodeJS.Timeout 分開，避免 tsc 在雲端建置失敗 */
  const saveTimer = useRef<number | null>(null)

  const performUpload = useCallback((s: AppState) => {
    return uploadAppStateToJsonBin(s)
      .then(() => {
        const d = new Date()
        setLastSavedAt(d)
        writeLastJsonBinUploadSuccessAt(d)
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e)
        setUploadBlockMessage(msg)
        setLine({
          text: msg,
          isError: true,
        })
        throw e
      })
  }, [])

  const dismissCloudUploadBlock = useCallback(() => {
    setCloudUploadSuspended(true)
    setUploadBlockMessage(null)
    setLine(null)
  }, [])

  const resumeCloudUpload = useCallback(() => {
    if (!allowCloudWrite) return
    if (keyErr || !canUse || !ready) return
    if (!cloudUploadSuspended) return
    setCloudUploadSuspended(false)
    void performUpload(state)
      .then(() => {
        setLine({
          text: '已恢復雲端同步，並已上傳目前資料至 JSONBin。',
          isError: false,
        })
        window.setTimeout(() => setLine(null), 3200)
      })
      .catch(() => {
        /* 錯誤已在 performUpload 內處理 */
      })
  }, [allowCloudWrite, keyErr, canUse, ready, cloudUploadSuspended, state, performUpload])

  useEffect(() => {
    if (keyErr) {
      setReady(true)
      return
    }
    if (!envIntent || !canUse) {
      if (envIntent) setReady(true)
      return
    }
    let dead = false
    ;(async () => {
      try {
        const fromCloud = await downloadAppStateFromJsonBin()
        if (dead) return
        if (fromCloud) {
          skipNextUpload.current = true
          setState(fromCloud)
          setLine({ text: '已從 JSONBin 載入。', isError: false })
          window.setTimeout(() => setLine(null), 3200)
        }
      } catch (e) {
        if (dead) return
        setLine({
          text: e instanceof Error ? e.message : String(e),
          isError: true,
        })
      } finally {
        if (!dead) setReady(true)
      }
    })()
    return () => {
      dead = true
    }
  }, [envIntent, canUse, keyErr, setState])

  useEffect(() => {
    if (!allowCloudWrite) return
    if (cloudUploadSuspended) return
    if (keyErr || !canUse || !ready) return
    if (skipNextUpload.current) {
      skipNextUpload.current = false
      return
    }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null
      void performUpload(state).catch(() => {
        /* 錯誤已在 performUpload 內處理 */
      })
    }, SAVE_MS)
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
    }
  }, [state, ready, canUse, keyErr, allowCloudWrite, cloudUploadSuspended, performUpload])

  const cloudBootstrapPending = Boolean(envIntent && canUse && !keyErr && !ready)
  const cloudUploadBlocked = uploadBlockMessage !== null
  const resumeCloudUploadAllowed = Boolean(allowCloudWrite && !keyErr && canUse && ready)

  return {
    active: envIntent,
    ready,
    line,
    lastSavedAt,
    cloudBootstrapPending,
    cloudUploadBlocked,
    cloudUploadBlockMessage: uploadBlockMessage,
    dismissCloudUploadBlock,
    cloudUploadSuspended,
    resumeCloudUploadAllowed,
    resumeCloudUpload,
  }
}
