import { useCallback, useEffect, useRef, useState } from 'react'

const KEY = 'junshan-web-v1'

/** 以頂層欄位參考比對是否「實質相同」，避免對大型 state 做 JSON.stringify（會卡死主執行緒）。 */
function topLevelRefsEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  const keys = Object.keys(ra)
  if (Object.keys(rb).length !== keys.length) return false
  for (const k of keys) {
    if (!Object.is(ra[k], rb[k])) return false
  }
  return true
}

function readPersisted<T>(getInitial: () => T, migrate?: (loaded: unknown) => T): T {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return getInitial()
    const parsed = JSON.parse(raw) as { data?: unknown }
    if (parsed && parsed.data !== undefined) {
      return migrate ? migrate(parsed.data) : (parsed.data as T)
    }
  } catch {
    /* ignore */
  }
  return getInitial()
}

export function usePersistentState<T>(
  getInitial: () => T,
  migrate?: (loaded: unknown) => T,
): [T, (v: T | ((p: T) => T)) => void] {
  const [state, setState] = useState<T>(() => readPersisted(getInitial, migrate))

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify({ data: state }))
      } catch {
        /* ignore */
      }
    }, 0)
    return () => clearTimeout(t)
  }, [state])

  return [state, setState]
}

const DEFAULT_MAX_UNDO = 40

/**
 * 與 usePersistentState 相同之讀寫本機鍵值，另維護「上一步」快照（整份狀態 deep clone）。
 * 歷史在 state 提交後寫入（useEffect），避免 React StrictMode 重複呼叫 updater 時重複入帳。
 */
export function usePersistentStateWithUndo<T>(
  getInitial: () => T,
  migrate?: (loaded: unknown) => T,
  maxUndo = DEFAULT_MAX_UNDO,
): [T, (v: T | ((p: T) => T)) => void, () => void, boolean] {
  const pastRef = useRef<T[]>([])
  const prevCommittedRef = useRef<T | null>(null)
  const skipHistoryRef = useRef(false)
  const [state, setStateInner] = useState<T>(() => readPersisted(getInitial, migrate))

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify({ data: state }))
      } catch {
        /* ignore */
      }
    }, 0)
    return () => clearTimeout(t)
  }, [state])

  useEffect(() => {
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false
      try {
        prevCommittedRef.current = structuredClone(state)
      } catch {
        prevCommittedRef.current = state
      }
      return
    }
    if (prevCommittedRef.current === null) {
      try {
        prevCommittedRef.current = structuredClone(state)
      } catch {
        prevCommittedRef.current = state
      }
      return
    }
    if (topLevelRefsEqual(state, prevCommittedRef.current)) {
      return
    }
    try {
      pastRef.current.push(structuredClone(prevCommittedRef.current))
      while (pastRef.current.length > maxUndo) pastRef.current.shift()
    } catch {
      /* 略過 */
    }
    try {
      prevCommittedRef.current = structuredClone(state)
    } catch {
      prevCommittedRef.current = state
    }
  }, [state, maxUndo])

  const setState = useCallback((action: T | ((p: T) => T)) => {
    setStateInner((s: T) => (typeof action === 'function' ? (action as (p: T) => T)(s) : action))
  }, [])

  const undo = useCallback(() => {
    const prev = pastRef.current.pop()
    if (prev === undefined) return
    skipHistoryRef.current = true
    setStateInner(prev)
  }, [])

  const canUndo = pastRef.current.length > 0
  return [state, setState, undo, canUndo]
}

export function clearPersistentState() {
  localStorage.removeItem(KEY)
}
