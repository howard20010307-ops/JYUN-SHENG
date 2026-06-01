/**
 * 重現 `services/jsonbin.ts` 的上傳管線，量測指定備份檔送到 JSONBin 的「實際 PUT body 大小」。
 *
 * 管線：state → JSON.stringify(無縮排) → fflate gzip level 9 → Base64 → PUT
 *
 * 用法：node scripts/measure-jsonbin-upload-size.mjs <backup.json>
 */
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const path = process.argv[2]
if (!path) {
  console.error('用法：node scripts/measure-jsonbin-upload-size.mjs <backup.json>')
  process.exit(1)
}

const raw = readFileSync(path)
const rawText = raw.toString('utf8')
const parsed = JSON.parse(rawText)

const compact = JSON.stringify(parsed)
const compactBytes = Buffer.byteLength(compact, 'utf8')

const gz = gzipSync(Buffer.from(compact, 'utf8'), { level: 9 })
const gzBytes = gz.byteLength

const b64 = gz.toString('base64')
const b64Bytes = Buffer.byteLength(b64, 'utf8')

const fmt = (n) => {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

console.log(`檔案：${path}`)
console.log(`────────────────────────────────────────`)
console.log(`原始備份檔（縮排格式給人看）：${fmt(raw.byteLength)}`)
console.log(`compact JSON（無縮排）       ：${fmt(compactBytes)}`)
console.log(`gzip level 9                 ：${fmt(gzBytes)}  （壓縮率 ${(gzBytes / compactBytes * 100).toFixed(1)}%）`)
console.log(`Base64 後（送到 JSONBin）    ：${fmt(b64Bytes)}  ← 這個跟 JSONBin 上限比`)
console.log(`────────────────────────────────────────`)
console.log(`JSONBin 免費版上限           ：100 KB`)
console.log(`JSONBin Pro / XL Bins 上限   ：10 MB`)
console.log()
const limitFree = 100 * 1024
const limitPro = 10 * 1024 * 1024
console.log(`vs 免費版（100 KB）：${b64Bytes > limitFree ? '超過 ✗' : '未超過 ✓'}  （目前 ${(b64Bytes / limitFree * 100).toFixed(0)}%）`)
console.log(`vs Pro 10 MB      ：${b64Bytes > limitPro ? '超過 ✗' : '未超過 ✓'}  （目前 ${(b64Bytes / limitPro * 100).toFixed(1)}%）`)
