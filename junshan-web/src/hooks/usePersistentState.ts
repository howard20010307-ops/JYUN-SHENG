import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const KEY = 'junshan-web-v1'

/** 減少 JSON.stringify 全量寫入 localStorage 的頻率。 */
const PERSIST_DEBOUNCE_MS = 500

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
  const latestRef = useRef(state)
  latestRef.current = state
  const persistTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (persistTimerRef.current !== null) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null
      try {
        localStorage.setItem(KEY, JSON.stringify({ data: latestRef.current }))
      } catch {
        /* ignore */
      }
    }, PERSIST_DEBOUNCE_MS)
    return () => {
      if (persistTimerRef.current !== null) clearTimeout(persistTimerRef.current)
    }
  }, [state])

  useEffect(() => {
    return () => {
      try {
        localStorage.setItem(KEY, JSON.stringify({ data: latestRef.current }))
      } catch {
        /* ignore */
      }
    }
  }, [])

  return [state, setState]
}

const DEFAULT_MAX_UNDO = 40

/** 連續打字時合併為單一「上一步」快照，避免每字元對整包 state 做 structuredClone。 */
const UNDO_DEBOUNCE_MS = 400

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
  const latestStateRef = useRef<T | null>(null)
  const undoBurstOldRef = useRef<T | null>(null)
  const undoFlushTimerRef = useRef<number | null>(null)
  const persistTimerRef = useRef<number | null>(null)
  const [state, setStateInner] = useState<T>(() => readPersisted(getInitial, migrate))
  const [undoRev, setUndoRev] = useState(0)

  latestStateRef.current = state

  useEffect(() => {
    if (persistTimerRef.current !== null) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null
      try {
        localStorage.setItem(KEY, JSON.stringify({ data: latestStateRef.current }))
      } catch {
        /* ignore */
      }
    }, PERSIST_DEBOUNCE_MS)
    return () => {
      if (persistTimerRef.current !== null) clearTimeout(persistTimerRef.current)
    }
  }, [state])

  useEffect(() => {
    return () => {
      try {
        localStorage.setItem(KEY, JSON.stringify({ data: latestStateRef.current }))
      } catch {
        /* ignore */
      }
    }
  }, [])

  useEffect(() => {
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false
      undoBurstOldRef.current = null
      if (undoFlushTimerRef.current !== null) {
        clearTimeout(undoFlushTimerRef.current)
        undoFlushTimerRef.current = null
      }
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
    if (undoBurstOldRef.current === null) {
      try {
        undoBurstOldRef.current = structuredClone(prevCommittedRef.current)
      } catch {
        undoBurstOldRef.current = prevCommittedRef.current
      }
    }
    if (undoFlushTimerRef.current !== null) clearTimeout(undoFlushTimerRef.current)
    undoFlushTimerRef.current = window.setTimeout(() => {
      undoFlushTimerRef.current = null
      const oldSnap = undoBurstOldRef.current
      undoBurstOldRef.current = null
      if (oldSnap === null) return
      const now = latestStateRef.current as T
      try {
        pastRef.current.push(structuredClone(oldSnap))
        while (pastRef.current.length > maxUndo) pastRef.current.shift()
      } catch {
        /* 略過 */
      }
      try {
        prevCommittedRef.current = structuredClone(now)
      } catch {
        prevCommittedRef.current = now
      }
      setUndoRev((n) => n + 1)
    }, UNDO_DEBOUNCE_MS)

    return () => {
      if (undoFlushTimerRef.current !== null) {
        clearTimeout(undoFlushTimerRef.current)
        undoFlushTimerRef.current = null
      }
    }
  }, [state, maxUndo])

  const setState = useCallback((action: T | ((p: T) => T)) => {
    setStateInner((s: T) => (typeof action === 'function' ? (action as (p: T) => T)(s) : action))
  }, [])

  const undo = useCallback(() => {
    const prev = pastRef.current.pop()
    if (prev === undefined) return
    skipHistoryRef.current = true
    undoBurstOldRef.current = null
    if (undoFlushTimerRef.current !== null) {
      clearTimeout(undoFlushTimerRef.current)
      undoFlushTimerRef.current = null
    }
    setStateInner(prev)
    setUndoRev((n) => n + 1)
  }, [])

  const canUndo = useMemo(() => pastRef.current.length > 0, [undoRev])
  return [state, setState, undo, canUndo]
}

export function clearPersistentState() {
  localStorage.removeItem(KEY)
}
