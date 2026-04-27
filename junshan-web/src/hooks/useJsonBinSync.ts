import { useEffect, useRef, useState } from 'react'
import type { AppState } from '../domain/appState'
import {
  downloadAppStateFromJsonBin,
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
): { active: boolean; ready: boolean; line: JsonBinLine; lastSavedAt: Date | null } {
  const configured = isJsonBinConfigured()
  const [ready, setReady] = useState(!configured)
  const [line, setLine] = useState<JsonBinLine>(null)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const skipNextUpload = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!configured) return
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
  }, [configured, setState])

  useEffect(() => {
    if (!configured || !ready) return
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
  }, [state, ready, configured])

  return { active: configured, ready, line, lastSavedAt }
}
