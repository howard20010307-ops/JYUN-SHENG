import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * 本機開發：固定埠、明確 host，減少「localhost 拒絕連線」
 * - 須在 junshan-web 目錄執行 `npm run dev`（關閉終端機即停止，網址會連不上）
 * - 網址以終端機顯示為準，預設為 http://localhost:5173/（若被占用會改 5174…）
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    /** 5173 被占用時自動改用下一個埠（終端機會印出正確網址） */
    strictPort: false,
    /** 監聽所有介面；終端機會顯示 Local / Network 網址 */
    host: true,
  },
  preview: {
    port: 4173,
    strictPort: false,
    host: true,
  },
})
