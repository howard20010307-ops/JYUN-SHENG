import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'

/**
 * 在專案根目錄建立 `.env`（或 Netlify → Environment variables）填入 Firebase 網頁應用程式設定。
 * 見 Firebase Console → 專案設定 → 一般 → 您的應用程式。
 */
export function isFirebaseConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_PROJECT_ID,
  )
}

let appInstance: FirebaseApp | null | undefined

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null
  if (appInstance !== undefined) return appInstance
  try {
    const config = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    }
    appInstance = getApps().length > 0 ? getApp() : initializeApp(config)
    return appInstance
  } catch {
    appInstance = null
    return null
  }
}
