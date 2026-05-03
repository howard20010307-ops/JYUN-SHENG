/**
 * 工作明細：獨立工作區（對外文件之一；與放樣估價案場／成本列無連動），供自填品項與甲方、條款後輸出 PDF。
 */
import { allocateWithSuffix, stableHash16 } from './stableIds'
import { migrateCustomLaborReportLines, type CustomLaborReportLine } from './quoteCustomLaborReport'
import { migrateQuoteOwnerClient, type QuoteOwnerClient } from './quoteEngine'

/** PDF「備註與條款」預設文字（工作明細工作區） */
export function defaultCustomLaborClauseTexts(): readonly string[] {
  return [
    '本附件僅就表列項目為釋疑說明，不作為契約價金之唯一依據。',
    '實際施作範圍以雙方書面約定或現場簽認為準。',
    '表列數量、單位與備註為依溝通需要自行填寫，不作為全案估價之唯一依據。',
  ]
}

export type CustomLaborClauseLine = {
  id: string
  text: string
}

function clauseLinesDefaultEntities(): CustomLaborClauseLine[] {
  const texts = defaultCustomLaborClauseTexts()
  const seen = new Set<string>()
  return texts.map((text, i) => {
    const base = `clw-clause--${stableHash16(`default\0${i}\0${text}`)}`
    const id = allocateWithSuffix(base, seen)
    seen.add(id)
    return { id, text }
  })
}

export function createCustomLaborClauseLine(
  caseTitle: string,
  existing: readonly CustomLaborClauseLine[],
): CustomLaborClauseLine {
  const seed = `clause\0${caseTitle}\0${existing.map((c) => c.id).join('\n')}\0new`
  const base = `clw-clause--${stableHash16(seed)}`
  const id = allocateWithSuffix(base, new Set(existing.map((c) => c.id)))
  return { id, text: '' }
}

function migrateClauseLines(raw: unknown): CustomLaborClauseLine[] {
  if (raw === undefined || raw === null) return clauseLinesDefaultEntities()
  if (!Array.isArray(raw)) return clauseLinesDefaultEntities()
  if (raw.length === 0) return []

  const first = raw[0]
  if (typeof first === 'string') {
    const seen = new Set<string>()
    return (raw as unknown[]).map((x, i) => {
      const text = typeof x === 'string' ? x : ''
      const base = `clw-clause--${stableHash16(`migrateStr\0${i}\0${text}`)}`
      const id = allocateWithSuffix(base, seen)
      seen.add(id)
      return { id, text }
    })
  }

  const tmp: CustomLaborClauseLine[] = []
  for (let i = 0; i < raw.length; i++) {
    const e = raw[i]
    if (!e || typeof e !== 'object') continue
    const o = e as Record<string, unknown>
    const text = typeof o.text === 'string' ? o.text : ''
    const id =
      typeof o.id === 'string' && o.id.trim() !== ''
        ? o.id
        : `clw-clause--${stableHash16(`migrateObj\0${i}\0${text}`)}`
    tmp.push({ id, text })
  }
  const seen = new Set<string>()
  return tmp.map((l, i) => {
    if (!seen.has(l.id)) {
      seen.add(l.id)
      return l
    }
    const base = `clw-clause--${stableHash16(`dedupe\0${i}\0${l.id}\0${l.text}`)}`
    const id = allocateWithSuffix(base, seen)
    seen.add(id)
    return { ...l, id }
  })
}

export type CustomLaborWorkspaceState = {
  /** PDF／畫面「案名」 */
  caseTitle: string
  ownerClient: QuoteOwnerClient
  lines: CustomLaborReportLine[]
  /** PDF「備註與條款」逐條（空白條列印時略過） */
  clauseLines: CustomLaborClauseLine[]
}

export function initialCustomLaborWorkspace(): CustomLaborWorkspaceState {
  return {
    caseTitle: '',
    ownerClient: migrateQuoteOwnerClient(undefined),
    lines: [],
    clauseLines: clauseLinesDefaultEntities(),
  }
}

/**
 * @param legacy 舊版存於 `QuoteSite.customLaborReportLines` 時於 {@link migrateAppState} 注入一次
 */
export function migrateCustomLaborWorkspace(
  raw: unknown,
  legacy?: { caseTitle: string; ownerClient: unknown; lines: CustomLaborReportLine[] },
): CustomLaborWorkspaceState {
  const init = initialCustomLaborWorkspace()
  let base: CustomLaborWorkspaceState
  if (!raw || typeof raw !== 'object') {
    base = init
  } else {
    const o = raw as Record<string, unknown>
    base = {
      caseTitle: typeof o.caseTitle === 'string' ? o.caseTitle : '',
      ownerClient: migrateQuoteOwnerClient(o.ownerClient),
      lines: migrateCustomLaborReportLines(o.lines),
      clauseLines: migrateClauseLines(o.clauseLines),
    }
  }
  if (legacy && legacy.lines.length > 0 && base.lines.length === 0) {
    return {
      ...base,
      caseTitle: base.caseTitle.trim() !== '' ? base.caseTitle : legacy.caseTitle,
      ownerClient:
        base.ownerClient.companyName.trim() !== '' ||
        base.ownerClient.contactName.trim() !== '' ||
        base.ownerClient.phoneEmail.trim() !== ''
          ? base.ownerClient
          : migrateQuoteOwnerClient(legacy.ownerClient),
      lines: legacy.lines,
    }
  }
  return base
}
