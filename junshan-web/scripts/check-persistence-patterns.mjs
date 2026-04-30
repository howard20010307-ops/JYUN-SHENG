/**
 * 掃描 junshan-web/src 內已知的高風險持久化反模式（多裝置／首載合併）。
 * Run: node scripts/check-persistence-patterns.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcRoot = path.join(__dirname, '..', 'src')

/** @typedef {{ file: string; rule: string; excerpt: string }} Hit */

/** @param {string} dir @returns {Generator<string>} */
function* walkTs(dir) {
  if (!fs.existsSync(dir)) return
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'dist') continue
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) yield* walkTs(full)
    else if (/\.(ts|tsx)$/.test(ent.name)) yield full
  }
}

/** 禁止：首載／合併回傳物件內先展開雲端再整包展開本機 `prev`（會把估價、損益、分頁等古早本機整包糊在雲端上）。 */
const RE_FROM_CLOUD_THEN_SPREAD_PREV = /\.\.\.\s*fromCloud[\s\S]{0,2000}?\.\.\.\s*prev\b/

/** 禁止：`mergeStoredMonthLines` 用 `defaultLedger` 逐列鋪滿 Map 再覆寫（未列出的月會留示範老闆薪）。 */
const RE_MERGE_STORED_SEED_DEFAULT_LEDGER =
  /function\s+mergeStoredMonthLines[\s\S]*?for\s*\(\s*const\s+row\s+of\s+defaults\s*\)\s*map\.set/

function stripTsCommentsRough(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function main() {
  /** @type {Hit[]} */
  const hits = []

  for (const abs of walkTs(srcRoot)) {
    const rel = path.relative(path.join(__dirname, '..'), abs).replace(/\\/g, '/')
    const raw = fs.readFileSync(abs, 'utf8')
    const code = stripTsCommentsRough(raw)

    if (RE_FROM_CLOUD_THEN_SPREAD_PREV.test(code)) {
      const m = RE_FROM_CLOUD_THEN_SPREAD_PREV.exec(code)
      const excerpt = (m?.[0] ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
      hits.push({
        file: rel,
        rule: 'forbidden: {...fromCloud, ...prev} style whole-local overwrite in merge return',
        excerpt: excerpt || '(match)',
      })
    }

    if (rel.endsWith('domain/ledgerEngine.ts') && RE_MERGE_STORED_SEED_DEFAULT_LEDGER.test(code)) {
      hits.push({
        file: rel,
        rule: 'forbidden: mergeStoredMonthLines seeds map from defaultLedger rows (gap months get demo bossSalary)',
        excerpt: 'reintroduced defaultLedger map seed loop',
      })
    }
  }

  if (hits.length === 0) {
    console.log('check-persistence-patterns: OK (no known forbidden patterns)')
    process.exit(0)
  }

  console.error('check-persistence-patterns: FAILED\n')
  for (const h of hits) {
    console.error(`${h.file}\n  [${h.rule}]\n  ${h.excerpt}\n`)
  }
  console.error('See .cursor/rules/persistence-and-saves.mdc § 新功能上線前自檢')
  process.exit(1)
}

main()
