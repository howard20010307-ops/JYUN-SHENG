import { useEffect, useRef, useState } from 'react'
import type { AppState } from '../domain/appState'
import {
  downloadAppStateFromJsonBin,
  getJsonBinKeyErrorMessage,
  hasJsonBinEnvIntent,
  isJsonBinConfigured,
  uploadAppStateToJsonBin,
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
): {
  active: boolean
  ready: boolean
  line: JsonBinLine
  lastSavedAt: Date | null
  /** 已設定有效 JSONBin、且尚未完成首次雲端讀取：應鎖定操作避免與即將覆寫之雲端資料打架 */
  cloudBootstrapPending: boolean
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
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const skipNextUpload = useRef(false)
  /** 瀏覽器 setTimeout 回傳 number；與 NodeJS.Timeout 分開，避免 tsc 在雲端建置失敗 */
  const saveTimer = useRef<number | null>(null)

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
    if (keyErr || !canUse || !ready) return
    if (skipNextUpload.current) {
      skipNextUpload.current = false
      return
    }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null
      uploadAppStateToJsonBin(state)
        .then(() => {
          setLastSavedAt(new Date())
        })
        .catch((e: unknown) => {
          setLine({
            text: e instanceof Error ? e.message : String(e),
            isError: true,
          })
        })
    }, SAVE_MS)
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
    }
  }, [state, ready, canUse, keyErr])

  const cloudBootstrapPending = Boolean(envIntent && canUse && !keyErr && !ready)

  return { active: envIntent, ready, line, lastSavedAt, cloudBootstrapPending }
}
