// 檢查匯出備份內 receivables.entries 重複情況
// 用法：node inspect-receivables-dups.mjs <backup.json>
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const argv = process.argv.slice(2)
const file =
  argv[0] ??
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'junshan-web-備份-20260516-2114.json',
  )

const json = JSON.parse(readFileSync(file, 'utf8'))
const entries = json?.data?.receivables?.entries
if (!Array.isArray(entries)) {
  console.error('找不到 data.receivables.entries 陣列')
  process.exit(1)
}

console.log(`backup: ${file}`)
console.log(`exportedAt: ${json.exportedAt}`)
console.log(`receivables.entries 總數：${entries.length}`)

const norm = (s) => String(s ?? '').trim()
const isPlaceholder = (s) => {
  const v = norm(s)
  return v === '' || v === '未填'
}

// 寬鬆 key：忽略 phaseLabel 是 ''/'未填' 的差別
const keyLoose = (e) =>
  [
    norm(e.bookedDate),
    norm(e.projectName),
    norm(e.buildingLabel),
    norm(e.floorLabel),
    isPlaceholder(e.phaseLabel) ? '<placeholder>' : norm(e.phaseLabel),
    Number(e.net) || 0,
    Number(e.tax) || 0,
    e.taxZero ? '1' : '0',
    norm(e.note),
    norm(e.siteBlockId),
  ].join('|')

// 嚴格 key：所有欄位完全相同（含 phaseLabel）
const keyStrict = (e) =>
  [
    norm(e.bookedDate),
    norm(e.projectName),
    norm(e.buildingLabel),
    norm(e.floorLabel),
    norm(e.phaseLabel),
    Number(e.net) || 0,
    Number(e.tax) || 0,
    e.taxZero ? '1' : '0',
    norm(e.note),
    norm(e.siteBlockId),
  ].join('|')

const groups = new Map()
const groupsStrict = new Map()
for (const e of entries) {
  const kl = keyLoose(e)
  const ks = keyStrict(e)
  if (!groups.has(kl)) groups.set(kl, [])
  groups.get(kl).push(e)
  if (!groupsStrict.has(ks)) groupsStrict.set(ks, [])
  groupsStrict.get(ks).push(e)
}

const dupGroupsLoose = [...groups.values()].filter((g) => g.length > 1)
const dupGroupsStrict = [...groupsStrict.values()].filter((g) => g.length > 1)

const sumExtra = (arr) => arr.reduce((s, g) => s + (g.length - 1), 0)

console.log('')
console.log(`寬鬆比對（phaseLabel 為 ''/'未填' 視為同一項）：`)
console.log(`  重複群組數：${dupGroupsLoose.length}`)
console.log(`  多出的重複筆數（可刪掉的數量）：${sumExtra(dupGroupsLoose)}`)
console.log('')
console.log(`嚴格比對（所有欄位完全相同）：`)
console.log(`  重複群組數：${dupGroupsStrict.length}`)
console.log(`  多出的重複筆數：${sumExtra(dupGroupsStrict)}`)

console.log('')
console.log('—— 寬鬆重複群組明細 ——')
for (const g of dupGroupsLoose) {
  const e0 = g[0]
  console.log(
    `\n[${g.length} 筆] ${e0.bookedDate}｜${e0.projectName}｜${
      e0.buildingLabel || '-'
    }｜${e0.floorLabel || '-'}｜net=${e0.net}｜tax=${e0.tax}｜note="${
      e0.note || ''
    }"`,
  )
  for (const e of g) {
    console.log(
      `  · id=${e.id}  phaseLabel="${e.phaseLabel ?? ''}"  taxZero=${e.taxZero}  siteBlockId="${e.siteBlockId ?? ''}"`,
    )
  }
}
