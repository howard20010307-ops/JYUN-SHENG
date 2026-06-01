// 跨情境驗證：雲端=含墓碑乾淨檔；本機=舊裝置 localStorage（仍含目標 id）→ merge 後不應復活。
import { readFileSync } from 'node:fs'
import {
  mergeReceivablesPreferLocal,
  migrateReceivablesState,
  type ReceivablesState,
} from '../src/domain/receivablesModel'

const cleanFile = process.argv[2]
const dirtyFile = process.argv[3]
const targetId = process.argv[4] ?? 'rcv--8cca72ed72888bc8'
if (!cleanFile || !dirtyFile) {
  console.error('用法：tsx scripts/verify-receivables-tombstone-cross.mts <clean-with-tombstone.json> <dirty-old.json> [id]')
  process.exit(1)
}

const clean = JSON.parse(readFileSync(cleanFile, 'utf8'))
const dirty = JSON.parse(readFileSync(dirtyFile, 'utf8'))

const cloud: ReceivablesState = migrateReceivablesState(clean.data.receivables)
const local: ReceivablesState = migrateReceivablesState(dirty.data.receivables)

console.log(`雲端列數=${cloud.entries.length}, 雲端墓碑=${(cloud.deletedEntryIds ?? []).length}`)
console.log(`本機列數=${local.entries.length}, 本機是否仍有 ${targetId}=${local.entries.some((e) => e.id === targetId)}`)

const merged = mergeReceivablesPreferLocal(local, cloud)
const reappeared = merged.entries.some((e) => e.id === targetId)
console.log(`合併後列數=${merged.entries.length}, ${targetId} 復活？=${reappeared}（期望 false）`)

if (reappeared) {
  console.error('FAIL：墓碑沒擋住')
  process.exit(1)
}
console.log('PASS：含墓碑備份能阻止舊裝置帶回')
