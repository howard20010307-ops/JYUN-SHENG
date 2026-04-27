/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
  /** 單一 Bin 的 id（在 jsonbin.io 儀表台建立 Bin 後取得） */
  readonly VITE_JSONBIN_BIN_ID?: string
  /** 與帳戶一組的 $MASTER_KEY，可讀寫私密 Bin；會打包進前端 */
  readonly VITE_JSONBIN_X_MASTER_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
