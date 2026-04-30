/**
 * Fail if junshan-web/src uses forbidden random / unstable id sources.
 * Run: node scripts/check-stable-ids.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '..')
const srcRoot = path.join(projectRoot, 'src')

/** @typedef {{ file: string; line: number; rule: string; text: string }} Violation */

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

/**
 * Strip // comments (rough) so we do not flag examples in comments.
 * Does not handle strings containing //.
 * @param {string} line
 */
function codePart(line) {
  const idx = line.indexOf('//')
  if (idx === -1) return line
  return line.slice(0, idx)
}

/** @param {string} code */
function checkLine(code, file, lineNo) {
  /** @type {Violation[]} */
  const out = []

  if (/\brandomUUID\b/i.test(code) || /\bcrypto\s*\.\s*randomUUID\s*\(/i.test(code)) {
    out.push({ file, line: lineNo, rule: 'randomUUID', text: code.trim() })
  }
  if (/\bMath\s*\.\s*random\s*\(/.test(code)) {
    out.push({ file, line: lineNo, rule: 'Math.random', text: code.trim() })
  }
  if (/\bfrom\s+['"]nanoid['"]/.test(code) || /\bimport\s+.*\bnanoid\b/.test(code) || /\bnanoid\s*\(/.test(code)) {
    out.push({ file, line: lineNo, rule: 'nanoid', text: code.trim() })
  }
  if (/\bfrom\s+['"]uuid['"]/.test(code) || /\buuidv4\s*\(/.test(code) || /\bv4\s+as\s+uuidv4\b/.test(code)) {
    out.push({ file, line: lineNo, rule: 'uuid random', text: code.trim() })
  }

  const hasTime =
    /\bDate\s*\.\s*now\s*\(/.test(code) || /\bperformance\s*\.\s*now\s*\(/.test(code)
  if (hasTime) {
    const timeAsId =
      /\bid\s*[=:]\s*[^;\n]*\b(?:Date|performance)\s*\.\s*now\s*\(/.test(code) ||
      /\b_id\s*[=:]\s*[^;\n]*\b(?:Date|performance)\s*\.\s*now\s*\(/.test(code) ||
      /\$\{\s*(?:Date|performance)\s*\.\s*now\s*\(\)\s*\}/.test(code) ||
      /[`'"][^`'"]*[`'"]\s*\+\s*[^;\n]*\b(?:Date|performance)\s*\.\s*now\s*\(/.test(code) ||
      /\b(?:Date|performance)\s*\.\s*now\s*\([^;\n]*\+\s*[`'"]/.test(code) ||
      /\bString\s*\(\s*(?:Date|performance)\s*\.\s*now\s*\(/.test(code) ||
      (/\b(?:newId|randomId|uniqueId|entityId|docId|rowId)\b/i.test(code) &&
        /\b(?:Date|performance)\s*\.\s*now\s*\(/.test(code))

    if (timeAsId) {
      out.push({ file, line: lineNo, rule: 'Date.now/performance.now as id', text: code.trim() })
    }
  }

  return out
}

function main() {
  /** @type {Violation[]} */
  const violations = []

  for (const abs of walkTs(srcRoot)) {
    const rel = path.relative(projectRoot, abs).replace(/\\/g, '/')
    const raw = fs.readFileSync(abs, 'utf8')
    const lines = raw.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const code = codePart(lines[i] ?? '')
      for (const v of checkLine(code, rel, i + 1)) violations.push(v)
    }
  }

  if (violations.length === 0) {
    console.log('check-stable-ids: OK (no forbidden patterns in src/)')
    process.exit(0)
  }

  console.error('check-stable-ids: FAILED — stable id rules violated:\n')
  for (const v of violations) {
    console.error(`${v.file}:${v.line}  [${v.rule}]\n  ${v.text}\n`)
  }
  console.error(
    'Use stableIds.ts (stableHash16, allocateWithSuffix, finalize*StableIds, etc.). See .cursor/rules/stable-ids.mdc',
  )
  process.exit(1)
}

main()
