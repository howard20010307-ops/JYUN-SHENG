// 驗證：把使用者備份檔丟進現行 migrateReceivablesState，看看是否自動去重到正確列數。
// 用法：tsx scripts/verify-receivables-dedup.mts <backup.json>
import { readFileSync } from 'node:fs'
import {
  dedupReceivableEntriesByContent,
  migrateReceivablesState,
} from '../src/domain/receivablesModel'

const file = process.argv[2]
if (!file) {
  console.error('用法：tsx scripts/verify-receivables-dedup.mts <backup.json>')
  process.exit(1)
}

const json = JSON.parse(readFileSync(file, 'utf8'))
const r = json?.data?.receivables
if (!r) {
  console.error('找不到 data.receivables')
  process.exit(1)
}

const before = Array.isArray(r.entries) ? r.entries.length : 0
const migrated = migrateReceivablesState(r)
const after = migrated.entries.length

console.log(`backup: ${file}`)
console.log(`原列數：${before}`)
console.log(`migrate 後（含內容指紋去重）：${after}`)
console.log(`收斂筆數：${before - after}`)

const dedup = dedupReceivableEntriesByContent(migrated.entries)
console.log(`二次 dedup（理應為 0）：再去掉 ${dedup.removedCount} 筆`)
