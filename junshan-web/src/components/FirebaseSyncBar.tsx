import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import type { AppState } from '../domain/appState'
import { migrateAppState } from '../domain/appState'
import { getFirebaseApp, isFirebaseConfigured } from '../firebase/config'
import {
  downloadUserAppStateRaw,
  readAutoSyncPreference,
  uploadUserAppState,
  writeAutoSyncPreference,
} from '../firebase/userFirestore'

type Props = {
  state: AppState
  setState: (v: AppState | ((prev: AppState) => AppState)) => void
}

export function FirebaseSyncBar({ state, setState }: Props) {
  const [user, setUser] = useState<User | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [autoSync, setAutoSync] = useState(readAutoSyncPreference)
  const autoTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const app = getFirebaseApp()
    if (!app) return
    const auth = getAuth(app)
    return onAuthStateChanged(auth, setUser)
  }, [])

  const signInGoogle = useCallback(async () => {
    const app = getFirebaseApp()
    if (!app) {
      setMsg('請先設定 Firebase 環境變數（見 .env.example）。')
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const auth = getAuth(app)
      const prov = new GoogleAuthProvider()
      prov.setCustomParameters({ prompt: 'select_account' })
      await signInWithPopup(auth, prov)
      setMsg('已登入 Google。')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  const doSignOut = useCallback(async () => {
    const app = getFirebaseApp()
    if (!app) return
    setBusy(true)
    setMsg(null)
    try {
      await signOut(getAuth(app))
      setMsg('已登出。')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  const pushCloud = useCallback(async () => {
    if (!user) return
    setBusy(true)
    setMsg(null)
    try {
      await uploadUserAppState(user.uid, state)
      setMsg('已上傳至雲端。')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [user, state])

  const pullCloud = useCallback(async () => {
    if (!user) return
    setBusy(true)
    setMsg(null)
    try {
      const { raw, updatedAt } = await downloadUserAppStateRaw(user.uid)
      const next = migrateAppState(raw)
      const t = updatedAt ? `（雲端更新時間：${updatedAt.toLocaleString('zh-TW')}）` : ''
      if (
        !window.confirm(
          `確定用雲端資料覆寫目前網頁內所有內容？\n${t}\n本機未備份的變更將遺失。`,
        )
      ) {
        return
      }
      setState(next)
      setMsg('已從雲端載入。')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [user, setState])

  useEffect(() => {
    if (!user || !autoSync || !getFirebaseApp()) return
    if (autoTimerRef.current != null) clearTimeout(autoTimerRef.current)
    autoTimerRef.current = window.setTimeout(() => {
      uploadUserAppState(user.uid, state).catch((e) => {
        console.error(e)
        setMsg(e instanceof Error ? e.message : String(e))
      })
    }, 4500)
    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
    }
  }, [state, user, autoSync])

  const onAutoChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.checked
    setAutoSync(next)
    writeAutoSyncPreference(next)
    setMsg(next ? '已開啟：約 4.5 秒無操作後會自動上傳至雲端。' : '已關閉自動上傳。')
  }, [])

  if (!isFirebaseConfigured()) {
    return (
      <div className="firebaseSyncBar firebaseSyncBar--disabled">
        <span className="firebaseSyncBar__hint">
          雲端同步：請在專案根目錄新增 <code>.env</code> 並填入{' '}
          <code>VITE_FIREBASE_*</code>（見 <code>.env.example</code>），建置後即可使用 Google 登入與 Firestore。
        </span>
      </div>
    )
  }

  return (
    <div className="firebaseSyncBar">
      <div className="firebaseSyncBar__row">
        {!user ? (
          <button type="button" className="btn secondary" disabled={busy} onClick={signInGoogle}>
            {busy ? '登入中…' : 'Google 登入（雲端）'}
          </button>
        ) : (
          <>
            <span className="firebaseSyncBar__user" title={user.email ?? undefined}>
              {user.displayName ?? user.email ?? user.uid}
            </span>
            <button type="button" className="btn secondary" disabled={busy} onClick={pushCloud}>
              上傳至雲端
            </button>
            <button type="button" className="btn secondary" disabled={busy} onClick={pullCloud}>
              從雲端載入
            </button>
            <label className="firebaseSyncBar__check">
              <input type="checkbox" checked={autoSync} onChange={onAutoChange} disabled={busy} />
              自動上傳（約 4.5 秒靜止後）
            </label>
            <button type="button" className="btn danger ghost" disabled={busy} onClick={doSignOut}>
              登出
            </button>
          </>
        )}
      </div>
      {msg ? <p className="firebaseSyncBar__msg">{msg}</p> : null}
      <p className="firebaseSyncBar__fineprint">
        資料存放在您的 Firebase 專案（Firestore），請在 Firebase Console 啟用「Google
        登入」並部署安全性規則（見 <code>firestore.rules</code>）。
      </p>
    </div>
  )
}
