import type { AppState } from './appState'

const BACKUP_APP_ID = 'junshan-web'

export type BackupFileV1 = {
  app: typeof BACKUP_APP_ID
  version: 1
  exportedAt: string
  data: AppState
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function backupFilenameDate(): string {
  const d = new Date()
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`
}

/** 產生可下載的 JSON 字串（含版本與時間，與本機 localStorage 的 `data` 欄相容） */
export function stringifyAppBackup(state: AppState): string {
  const payload: BackupFileV1 = {
    app: BACKUP_APP_ID,
    version: 1,
    exportedAt: new Date().toISOString(),
    data: state,
  }
  return JSON.stringify(payload, null, 2)
}

/** 不換行、供 JSONBin 上傳（減小體積） */
export function stringifyAppBackupCompact(state: AppState): string {
  const payload: BackupFileV1 = {
    app: BACKUP_APP_ID,
    version: 1,
    exportedAt: new Date().toISOString(),
    data: state,
  }
  return JSON.stringify(payload)
}

export function downloadAppBackup(state: AppState): void {
  const text = stringifyAppBackup(state)
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `junshan-web-備份-${backupFilenameDate()}.json`
  a.rel = 'noopener'
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * 從備份檔 JSON 還原出可交給 {@link migrateAppState} 的物件。
 * 接受本專案備份格式 `{ app, version, data }`，或舊版僅 `{ data }`，或整包即為 AppState。
 */
export function rawDataFromBackupJson(text: string): unknown {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    throw new Error('不是有效的 JSON 檔案。')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('備份內容必須是 JSON 物件。')
  }
  const o = parsed as Record<string, unknown>
  if (o.data !== undefined && typeof o.data === 'object' && o.data !== null) {
    if (o.app === BACKUP_APP_ID || o.app === undefined) {
      return o.data
    }
    throw new Error('此檔案不是鈞泩營運試算的備份（app 欄位不符）。')
  }
  return parsed
}
