// 去重收帳：(bookedDate, projectName, buildingLabel, floorLabel, net, taxZero, note, siteBlockId)
// 同組視為同一筆。phaseLabel 取「資訊量最高」者（非空、非「未填」、可解析為日期區間者優先）。
// 用法：node dedupe-receivables.mjs <input.json> [output.json]
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const argv = process.argv.slice(2)
if (argv.length < 1) {
  console.error('用法：node dedupe-receivables.mjs <input.json> [output.json]')
  process.exit(1)
}
const inFile = argv[0]
const outFile =
  argv[1] ??
  (() => {
    const ext = path.extname(inFile)
    const base = inFile.slice(0, -ext.length)
    return `${base}-收帳去重${ext}`
  })()

const json = JSON.parse(readFileSync(inFile, 'utf8'))
const r = json?.data?.receivables
if (!r || !Array.isArray(r.entries)) {
  console.error('找不到 data.receivables.entries 陣列')
  process.exit(1)
}

const norm = (s) => String(s ?? '').trim()
const isPlaceholder = (s) => {
  const v = norm(s)
  return v === '' || v === '未填'
}

// 解析 yyyy/mm/dd ~ yyyy/mm/dd 與 m/d ~ m/d
const looksLikePeriod = (s) => /\s*~\s*/.test(s)
const fullPeriodChars = (s) => {
  // 含 4 位年份判斷為「完整」
  return /\d{4}/.test(s)
}

const phaseScore = (s) => {
  const v = norm(s)
  if (v === '' || v === '未填') return 0
  if (looksLikePeriod(v) && fullPeriodChars(v)) return 30
  if (looksLikePeriod(v)) return 20
  return 10
}

const groupKey = (e) =>
  [
    norm(e.bookedDate),
    norm(e.projectName),
    norm(e.buildingLabel),
    norm(e.floorLabel),
    Number(e.net) || 0,
    Number(e.tax) || 0,
    e.taxZero ? '1' : '0',
    norm(e.note),
    norm(e.siteBlockId),
  ].join('|')

const groups = new Map()
for (const e of r.entries) {
  const k = groupKey(e)
  if (!groups.has(k)) groups.set(k, [])
  groups.get(k).push(e)
}

const kept = []
let removed = 0
for (const [, g] of groups) {
  if (g.length === 1) {
    kept.push(g[0])
    continue
  }
  // 同組多筆：選 phaseScore 最高者；同分時取 id 最小者，保留穩定挑選
  let best = g[0]
  for (const e of g) {
    const sBest = phaseScore(best.phaseLabel)
    const sCand = phaseScore(e.phaseLabel)
    if (sCand > sBest) {
      best = e
    } else if (sCand === sBest) {
      if (String(e.id ?? '').localeCompare(String(best.id ?? '')) < 0) best = e
    }
  }
  // 把 phaseLabel 「未填」也還原成空字串，避免日後再次混入
  const cleaned = { ...best, phaseLabel: norm(best.phaseLabel) === '未填' ? '' : best.phaseLabel }
  kept.push(cleaned)
  removed += g.length - 1
}

// 依入帳日穩定排序
kept.sort((a, b) => {
  const aa = /^\d{4}-\d{2}-\d{2}$/.test(String(a.bookedDate ?? ''))
  const bb = /^\d{4}-\d{2}-\d{2}$/.test(String(b.bookedDate ?? ''))
  if (aa && !bb) return -1
  if (!aa && bb) return 1
  const d = String(a.bookedDate ?? '').localeCompare(String(b.bookedDate ?? ''))
  if (d !== 0) return d
  return String(a.id ?? '').localeCompare(String(b.id ?? ''))
})

const out = {
  ...json,
  exportedAt: new Date().toISOString(),
  data: {
    ...json.data,
    receivables: {
      ...r,
      entries: kept,
    },
  },
}

writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf8')
console.log(`輸入：${inFile}`)
console.log(`原列數：${r.entries.length}`)
console.log(`去重後：${kept.length}（移除 ${removed} 筆）`)
console.log(`輸出：${outFile}`)
