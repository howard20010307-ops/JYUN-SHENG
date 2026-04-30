/**
 * 本機／雲端一致、可重現的短 id（無 random／Date.now）。
 * 用於表單 DOM、存檔 entity id；非密碼學用途。
 */

const KEY_SEP = '\0'

/** 16 hex；兩段 FNV 系混合，降低碰撞。 */
export function stableHash16(input: string): string {
  let h1 = 5381 >>> 0
  let h2 = 52711 >>> 0
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    h1 = (((h1 << 5) + h1) ^ c) >>> 0
    h2 = (((h2 << 5) + h2) ^ (c * (i + 1))) >>> 0
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')
}

/** 合法 HTML id：`字母／數字／-`，以 `prefix--hash` 組成。 */
export function stableDomId(prefix: string, parts: readonly string[]): string {
  const slug = stableHash16([prefix, ...parts].join(KEY_SEP))
  return `${prefix}--${slug}`
}

/** 同一後綴已存在時加 `~2`、`~3`…（不改變既有列之 id）。 */
export function allocateWithSuffix(base: string, used: ReadonlySet<string>): string {
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}~${n}`)) n++
  return `${base}~${n}`
}
