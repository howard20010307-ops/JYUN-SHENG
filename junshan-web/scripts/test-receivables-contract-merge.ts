/**
 * 收帳：合併／載入行為自測。執行：npx tsx scripts/test-receivables-contract-merge.ts
 */
import assert from 'node:assert'
import {
  finalizeReceivableEntryIds,
  mergeReceivablesPreferLocal,
  migrateReceivablesState,
  type ReceivableEntry,
} from '../src/domain/receivablesModel.ts'
import { stableHash16 } from '../src/domain/stableIds.ts'

function baseRow(over: Partial<ReceivableEntry> = {}): ReceivableEntry {
  return {
    id: 'tmp',
    bookedDate: '2026-01-15',
    projectName: '測試案',
    buildingLabel: 'A棟',
    floorLabel: '3F',
    phaseLabel: '第一期',
    net: 10_000,
    taxZero: false,
    tax: 0,
    note: '',
    ...over,
  }
}

function run(): void {
  const sameIdLocal = baseRow({ id: 'x', contractLineId: undefined })
  const sameIdRemote = baseRow({ id: 'x', contractLineId: 'contract-line-xyz' })
  const mergedSameId = mergeReceivablesPreferLocal(
    { entries: [sameIdLocal] },
    { entries: [sameIdRemote] },
  )
  assert.strictEqual(mergedSameId.entries.length, 1, '同 id 只應成一列')
  assert.strictEqual(
    mergedSameId.entries[0]!.contractLineId,
    'contract-line-xyz',
    '同 id 合併：本機未填合約時應帶上雲端唯一合約 id',
  )

  const plain = baseRow({ id: 'a', contractLineId: undefined })
  const linked = baseRow({ id: 'b', contractLineId: 'contract-line-xyz' })
  const mergedDistinctId = mergeReceivablesPreferLocal(
    { entries: [plain] },
    { entries: [linked] },
  )
  assert.strictEqual(
    mergedDistinctId.entries.length,
    2,
    '不同 id 即使其餘欄位相同也不併列',
  )

  const dupMigrate = migrateReceivablesState({
    entries: [
      baseRow({ id: 'r1', contractLineId: undefined }),
      baseRow({ id: 'r2', contractLineId: 'c-only' }),
    ],
  })
  assert.strictEqual(dupMigrate.entries.length, 2, '載入：不同 id 不併列')

  const phaseRelaxedMerge = mergeReceivablesPreferLocal(
    { entries: [baseRow({ id: 'local-p', phaseLabel: '', net: 184_800, bookedDate: '2026-03-05' })] },
    {
      entries: [
        baseRow({
          id: 'cloud-p',
          phaseLabel: '2026/01/21 ~ 2026/02/20',
          net: 184_800,
          bookedDate: '2026-03-05',
        }),
      ],
    },
  )
  assert.strictEqual(phaseRelaxedMerge.entries.length, 2)

  const phaseRelaxedMigrate = migrateReceivablesState({
    entries: [
      baseRow({ id: 'm1', phaseLabel: '' }),
      baseRow({ id: 'm2', phaseLabel: '2026/01/21 ~ 2026/02/20' }),
    ],
  })
  assert.strictEqual(phaseRelaxedMigrate.entries.length, 2)

  const phaseConflictMigrate = migrateReceivablesState({
    entries: [
      baseRow({ id: 'c1', phaseLabel: '2026/01/01 ~ 2026/01/31' }),
      baseRow({ id: 'c2', phaseLabel: '2026/02/01 ~ 2026/02/28' }),
    ],
  })
  assert.strictEqual(phaseConflictMigrate.entries.length, 2)

  const dupIdMigrate = migrateReceivablesState({
    entries: [
      baseRow({ id: 'dup-id', projectName: '甲', note: '第一列' }),
      baseRow({ id: 'dup-id', projectName: '乙', note: '第二列' }),
    ],
  })
  assert.strictEqual(dupIdMigrate.entries.length, 2, 'JSON 內同 id 兩列應保留並重新配發 id')
  assert.notStrictEqual(dupIdMigrate.entries[0]!.id, dupIdMigrate.entries[1]!.id)

  const seqHint = 99
  const collisionId = `rcv--${stableHash16(['receivable-entry', String(seqHint)].join('\0'))}`
  const noSteal = finalizeReceivableEntryIds(
    [
      baseRow({ id: '', bookedDate: '2026-04-01', net: 1 }),
      baseRow({ id: collisionId, note: '已存檔列', bookedDate: '2026-04-01', net: 2 }),
    ],
    seqHint,
  )
  const savedRow = noSteal.entries.find((e) => e.net === 2)
  assert.strictEqual(
    savedRow?.id,
    collisionId,
    'finalize：空 id 列不得先配發而占用 nextEntrySeq 將產生之 rcv--（否則已存檔列 id 會被改配）',
  )

  console.log('test-receivables-contract-merge: OK')
}

run()
