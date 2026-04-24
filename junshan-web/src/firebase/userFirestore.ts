import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore'
import type { AppState } from '../domain/appState'
import { getFirebaseApp } from './config'

const AUTO_SYNC_KEY = 'junshan-firebase-auto-sync'

/** Firestore 單一欄位約 1MB；過大時請用「匯出備份」 */
const MAX_STATE_JSON_CHARS = 900_000

export function readAutoSyncPreference(): boolean {
  try {
    return localStorage.getItem(AUTO_SYNC_KEY) === '1'
  } catch {
    return false
  }
}

export function writeAutoSyncPreference(on: boolean): void {
  try {
    localStorage.setItem(AUTO_SYNC_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function userDocRef(uid: string) {
  const app = getFirebaseApp()
  if (!app) throw new Error('Firebase 尚未設定（缺少環境變數）。')
  return doc(getFirestore(app), 'users', uid)
}

export async function uploadUserAppState(uid: string, state: AppState): Promise<void> {
  const payload = JSON.stringify(state)
  if (payload.length > MAX_STATE_JSON_CHARS) {
    throw new Error(
      `資料過大（約 ${Math.round(payload.length / 1024)} KB），超過雲端建議上限。請使用「匯出備份」或縮減月表後再試。`,
    )
  }
  await setDoc(
    userDocRef(uid),
    {
      stateJson: payload,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function downloadUserAppStateRaw(uid: string): Promise<{
  raw: unknown
  updatedAt: Date | null
}> {
  const snap = await getDoc(userDocRef(uid))
  if (!snap.exists()) {
    throw new Error('雲端尚無您的資料（請先「上傳至雲端」）。')
  }
  const data = snap.data() as { stateJson?: string; updatedAt?: { toDate?: () => Date } }
  const j = data?.stateJson
  if (typeof j !== 'string' || !j.trim()) {
    throw new Error('雲端資料格式異常，請重新上傳。')
  }
  let raw: unknown
  try {
    raw = JSON.parse(j) as unknown
  } catch {
    throw new Error('雲端資料不是有效的 JSON。')
  }
  const updatedAt =
    data.updatedAt && typeof data.updatedAt.toDate === 'function'
      ? data.updatedAt.toDate()
      : null
  return { raw, updatedAt }
}
