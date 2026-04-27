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
  /**
   * 與帳戶一組的 X-MASTER-KEY 經 **Base64** 編碼（推薦；避免 $ 在 .env 內被改寫）。
   * 若同時設定 {@link VITE_JSONBIN_X_MASTER_KEY_B64} 與 {@link VITE_JSONBIN_X_MASTER_KEY}，以前者為准。
   */
  readonly VITE_JSONBIN_X_MASTER_KEY_B64?: string
  /** 明文金鑰（不推薦；若內有 $ 仍可能被 Vite 改壞，請改用上欄 B64） */
  readonly VITE_JSONBIN_X_MASTER_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
