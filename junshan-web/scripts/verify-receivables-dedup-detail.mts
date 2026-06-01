// 列出 migrate 後仍剩下哪些列；找出「同基底」但 monthSheetId 一個 ''、一個 undefined 的近重複。
import { readFileSync } from 'node:fs'
import { migrateReceivablesState } from '../src/domain/receivablesModel'

const file = process.argv[2]
if (!file) process.exit(1)
const json = JSON.parse(readFileSync(file, 'utf8'))
const migrated = migrateReceivablesState(json.data.receivables)

const looseKey = (e: any) =>
  [
    e.bookedDate,
    e.projectName,
    e.buildingLabel,
    e.floorLabel,
    e.net,
    e.taxZero,
    e.note,
    e.siteBlockId ?? '',
  ].join('|')

const groups = new Map<string, any[]>()
for (const e of migrated.entries) {
  const k = looseKey(e)
  if (!groups.has(k)) groups.set(k, [])
  groups.get(k)!.push(e)
}

console.log(`migrate 後共 ${migrated.entries.length} 筆`)
let extras = 0
for (const arr of groups.values()) {
  if (arr.length > 1) {
    extras += arr.length - 1
    console.log(`\n[${arr.length} 筆] ${arr[0].bookedDate}｜${arr[0].projectName}｜${arr[0].buildingLabel || '-'}｜${arr[0].floorLabel || '-'}｜net=${arr[0].net}｜note="${arr[0].note}"`)
    for (const e of arr) {
      console.log(
        `  · id=${e.id}  monthSheetId=${JSON.stringify(e.monthSheetId)}  siteBlockId=${JSON.stringify(e.siteBlockId)}  phaseLabel="${e.phaseLabel}"`,
      )
    }
  }
}
console.log(`\n寬鬆比對下還有 ${extras} 筆可疑近重複（差別僅在 monthSheetId / siteBlockId）。`)
