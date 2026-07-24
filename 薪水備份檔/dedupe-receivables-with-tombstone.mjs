// 在「收帳去重」版本基礎上，再砍掉指定 id 並寫入 deletedEntryIds 墓碑，避免雲端／其他裝置帶回。
// 用法：node dedupe-receivables-with-tombstone.mjs <input-deduped.json> <id-to-remove>... [-o <output.json>]
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const argv = process.argv.slice(2)
const oFlagIdx = argv.indexOf('-o')
let outFile
if (oFlagIdx >= 0) {
  outFile = argv[oFlagIdx + 1]
  argv.splice(oFlagIdx, 2)
}
if (argv.length < 2) {
  console.error('用法：node dedupe-receivables-with-tombstone.mjs <input.json> <id-to-remove>... [-o <output.json>]')
  process.exit(1)
}
const inFile = argv[0]
const removeIds = argv.slice(1)
if (!outFile) {
  const ext = path.extname(inFile)
  const base = inFile.slice(0, -ext.length)
  outFile = `${base}-含墓碑${ext}`
}

const json = JSON.parse(readFileSync(inFile, 'utf8'))
const r = json?.data?.receivables
if (!r || !Array.isArray(r.entries)) {
  console.error('找不到 data.receivables.entries 陣列')
  process.exit(1)
}

const before = r.entries.length
const now = Date.now()
const remaining = r.entries.filter((e) => !removeIds.includes(e.id))
const tombstoneMap = new Map()
for (const t of r.deletedEntryIds ?? []) {
  if (t && typeof t.id === 'string' && typeof t.deletedAt === 'number') {
    tombstoneMap.set(t.id, t.deletedAt)
  }
}
for (const id of removeIds) {
  const prev = tombstoneMap.get(id) ?? 0
  tombstoneMap.set(id, Math.max(prev, now))
}
const deletedEntryIds = [...tombstoneMap.entries()]
  .map(([id, deletedAt]) => ({ id, deletedAt }))
  .sort((a, b) => a.id.localeCompare(b.id))

const out = {
  ...json,
  exportedAt: new Date().toISOString(),
  data: {
    ...json.data,
    receivables: {
      ...r,
      entries: remaining,
      deletedEntryIds,
    },
  },
}
writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf8')
console.log(`輸入：${inFile}`)
console.log(`移除 id：${removeIds.join(', ')}`)
console.log(`列數：${before} → ${remaining.length}`)
console.log(`墓碑（含舊有）：${deletedEntryIds.length} 筆`)
console.log(`輸出：${outFile}`)
