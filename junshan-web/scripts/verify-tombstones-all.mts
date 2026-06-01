/**
 * 跨子系統墓碑驗證：模擬「本機刪除某筆資料、雲端尚未刪、再次同步」的情境，
 * 驗證刪除事件被保留、雲端版本不會把刪掉的資料帶回（resurrection）。
 *
 * 涵蓋：收帳、工作日誌（entries / dayDocuments / customWorkItemLabels）、
 * 全站工作項目選項、合約內容、計價（rows / remarkLines）、薪水月表（months / blocks / staff）。
 *
 * 用法：cd junshan-web && npx tsx scripts/verify-tombstones-all.mts
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  initialReceivablesState,
  mergeReceivablesPreferLocal,
  tombstoneReceivableEntryId,
  type ReceivableEntry,
} from '../src/domain/receivablesModel'
import {
  initialWorkLogState,
  mergeWorkLogPreferLocal,
  removeDayDocumentAndEntries,
  removeWorkLogEntryById,
  removeCustomWorkItemLabel,
  type WorkLogState,
  type WorkLogEntry,
  type WorkLogDayDocument,
} from '../src/domain/workLogModel'
import {
  mergeWorkItemPresetLabelsPreferLocal,
  appendWorkItemPresetLabelTombstone,
} from '../src/domain/workItemPresets'
import {
  initialContractContentState,
  mergeContractContentPreferLocal,
  tombstoneContractContentLineId,
  type ContractContentLine,
} from '../src/domain/contractContentModel'
import {
  initialPricingWorkspace,
  mergePricingWorkspacePreferLocal,
  tombstonePricingRemarkLineId,
  tombstonePricingRowId,
  type PricingRow,
} from '../src/domain/pricingWorkspace'
import {
  defaultSalaryBook,
  finalizeSalaryBookPayroll,
  mergeSalaryBookPreferLocal,
  removeWorkerFromBook,
  tombstoneSalaryBookMonthId,
  tombstoneSalaryBookSiteBlockId,
  tombstoneSalaryBookSiteBlockIds,
  type SalaryBook,
} from '../src/domain/salaryExcelModel'

let pass = 0
let fail = 0

function check(label: string, ok: boolean, info?: unknown) {
  if (ok) {
    pass++
    console.log(`  PASS  ${label}`)
  } else {
    fail++
    console.error(`  FAIL  ${label}`)
    if (info !== undefined) console.error('         ', info)
  }
}

function section(title: string) {
  console.log(`\n— ${title} —`)
}

// ---------- 收帳 ----------
section('收帳 receivables')
{
  const entry: ReceivableEntry = {
    id: 'rcv--ABC',
    bookedDate: '2026-04-07',
    siteName: '永清安居',
    buildingLabel: 'B1棟',
    floorLabel: '2F',
    phaseLabel: '',
    contractLineId: '',
    item: '工程款',
    payerName: '',
    note: '',
    netAmount: 33500,
    taxIncluded: false,
    taxAmount: 0,
    grossAmount: 33500,
    payrollMonthSheetId: '',
    payrollSiteBlockId: '',
    seq: 1,
  }
  const cloud = { ...initialReceivablesState(), entries: [entry], nextEntrySeq: 2 }
  const local = {
    ...initialReceivablesState(),
    deletedEntryIds: tombstoneReceivableEntryId(initialReceivablesState(), entry.id),
  }
  const merged = mergeReceivablesPreferLocal(local, cloud)
  check(
    '本機刪除 → 雲端有同 id → 合併後不會復活',
    merged.entries.every((e) => e.id !== entry.id),
    merged.entries.map((e) => e.id),
  )
  check('墓碑保留', (merged.deletedEntryIds ?? []).some((t) => t.id === entry.id))
}

// ---------- 工作日誌 ----------
section('工作日誌 workLog')
{
  const entry: WorkLogEntry = {
    id: 'wle--TBD',
    logDate: '2026-04-07',
    siteName: '永清安居',
    buildingLabel: 'B1棟',
    floorLabel: '2F',
    phaseLabel: '',
    staffNames: ['楊家全'],
    timeStart: '08:00',
    timeEnd: '17:00',
    workItem: '柱心線放樣',
    equipment: '',
    mealCost: 0,
    miscCost: 0,
    instrumentCost: 0,
    remark: '',
    content: '',
    createdAt: '2026-04-07T00:00:00.000Z',
    updatedAt: '2026-04-07T00:00:00.000Z',
  } as any
  const cloudWl: WorkLogState = mergeWorkLogPreferLocal(initialWorkLogState(), {
    ...initialWorkLogState(),
    entries: [entry],
  })
  const cloudEntryId = cloudWl.entries[0]!.id // 由 finalize 算出之穩定 id
  const localWlBeforeDelete: WorkLogState = {
    ...initialWorkLogState(),
    entries: [{ ...entry, id: cloudEntryId }],
  }
  const localWlAfterDelete = removeWorkLogEntryById(localWlBeforeDelete, cloudEntryId)
  const merged = mergeWorkLogPreferLocal(localWlAfterDelete, cloudWl)
  check(
    'entry 本機刪除 → 雲端有 → 合併後不會復活',
    merged.entries.every((e) => e.id !== cloudEntryId),
    merged.entries.map((e) => e.id),
  )

  // 整日刪除：dayDocuments by logDate
  const day: WorkLogDayDocument = {
    id: 'wldoc--2026-04-07',
    logDate: '2026-04-07',
    blocks: [],
    toolLines: [],
    mealCost: 0,
    miscCost: 0,
    remark: '',
    content: '',
    createdAt: '2026-04-07T00:00:00.000Z',
    updatedAt: '2026-04-07T00:00:00.000Z',
  } as any
  const cloudWl2: WorkLogState = { ...initialWorkLogState(), dayDocuments: [day] }
  const localWl2: WorkLogState = removeDayDocumentAndEntries(
    { ...initialWorkLogState(), dayDocuments: [day] },
    '2026-04-07',
  )
  const merged2 = mergeWorkLogPreferLocal(localWl2, cloudWl2)
  check(
    '整日文件本機刪除 → 雲端有 → 合併後 logDate 不會復活',
    (merged2.dayDocuments ?? []).every((d) => d.logDate !== '2026-04-07'),
    (merged2.dayDocuments ?? []).map((d) => d.logDate),
  )

  // customWorkItemLabels by value
  const cloudWl3: WorkLogState = {
    ...initialWorkLogState(),
    customWorkItemLabels: ['臨時自訂A'],
  }
  const localWl3 = removeCustomWorkItemLabel(
    { ...initialWorkLogState(), customWorkItemLabels: ['臨時自訂A'] },
    '臨時自訂A',
  )
  const merged3 = mergeWorkLogPreferLocal(localWl3, cloudWl3)
  check(
    '自訂工作項目本機刪除 → 雲端有 → 合併後不會復活',
    !(merged3.customWorkItemLabels ?? []).includes('臨時自訂A'),
    merged3.customWorkItemLabels,
  )
}

// ---------- 工作項目預設選項 ----------
section('工作項目預設選項 workItemPresetLabels')
{
  const local: string[] = []
  const localTomb = appendWorkItemPresetLabelTombstone(undefined, '柱心線放樣')
  const cloud: string[] = ['柱心線放樣', '其他正常項目']
  const r = mergeWorkItemPresetLabelsPreferLocal(local, cloud, localTomb, undefined)
  check('預設選項本機刪除 → 雲端有 → 合併後不會復活', !r.labels.includes('柱心線放樣'), r.labels)
  check('其他選項仍保留', r.labels.includes('其他正常項目'))
  check('墓碑保留', r.tombstones.some((t) => t.id === '柱心線放樣'))
}

// ---------- 合約內容 ----------
section('合約內容 contractContents')
{
  const ln: ContractContentLine = {
    id: 'ctc-line--XYZ',
    siteName: '永清安居',
    buildingLabel: 'B1棟',
    floorLabel: '2F',
    phaseLabel: '',
    pricingMode: 'fixedQuantity',
    unit: '式',
    contractUnitPrice: 100,
    contractQuantity: 1,
    manualWorkDays: 0,
    note: '',
  }
  const cloud = { ...initialContractContentState(), lines: [ln] }
  const local = {
    ...initialContractContentState(),
    lines: [],
    deletedLineIds: tombstoneContractContentLineId(initialContractContentState(), ln.id),
  }
  const merged = mergeContractContentPreferLocal(local, cloud)
  check(
    '合約列本機刪除 → 雲端有 → 合併後不會復活',
    merged.lines.every((x) => x.id !== ln.id),
    merged.lines.map((x) => x.id),
  )
}

// ---------- 計價工作區 ----------
section('計價工作區 pricingWorkspace')
{
  const row: PricingRow = {
    id: 'prc-row--XX',
    contractLineId: '',
    buildingLabel: 'B1棟',
    floorLabel: '2F',
    phaseLabel: '',
    item: '工程款',
    unit: '式',
    quantity: 1,
    amountNet: 100,
    tax: 5,
    total: 105,
    note: '',
  }
  const cloudP = { ...initialPricingWorkspace(), rows: [row] }
  const localP = {
    ...initialPricingWorkspace(),
    rows: [],
    deletedRowIds: tombstonePricingRowId(initialPricingWorkspace(), row.id),
  }
  const mergedP = mergePricingWorkspacePreferLocal(localP, cloudP)
  check(
    '計價列本機刪除 → 雲端有 → 合併後不會復活',
    mergedP.rows.every((x) => x.id !== row.id),
    mergedP.rows.map((x) => x.id),
  )

  const cloudR = {
    ...initialPricingWorkspace(),
    remarkLines: [{ id: 'prc-rmk--AAA', text: '臨時備註' }],
  }
  const localR = {
    ...initialPricingWorkspace(),
    remarkLines: [],
    deletedRemarkLineIds: tombstonePricingRemarkLineId(initialPricingWorkspace(), 'prc-rmk--AAA'),
  }
  const mergedR = mergePricingWorkspacePreferLocal(localR, cloudR)
  check(
    '備註列本機刪除 → 雲端有 → 合併後不會復活',
    mergedR.remarkLines.every((x) => x.id !== 'prc-rmk--AAA'),
    mergedR.remarkLines.map((x) => x.id),
  )
}

// ---------- 薪水月表 ----------
section('薪水月表 salaryBook')
{
  const cloud = defaultSalaryBook()
  const targetMonth = cloud.months[5]! // 6月
  const targetMonthId = targetMonth.id
  const local0 = finalizeSalaryBookPayroll(cloud).book
  const local: SalaryBook = {
    ...local0,
    months: local0.months.filter((m) => m.id !== targetMonthId),
    deletedMonthIds: tombstoneSalaryBookMonthId(local0, targetMonthId),
    deletedSiteBlockIds: tombstoneSalaryBookSiteBlockIds(
      local0,
      targetMonth.blocks.map((b) => b.id),
    ),
  }
  const merged = mergeSalaryBookPreferLocal(local, cloud)
  check(
    '整月本機刪除 → 雲端有 → 合併後該月 id 不會復活',
    merged.months.every((m) => m.id !== targetMonthId),
    merged.months.map((m) => m.id),
  )

  const cloud2 = defaultSalaryBook()
  const m2 = cloud2.months[1]! // 2月
  const blockToDelete = m2.blocks[0]!
  const blockIdToDelete = blockToDelete.id
  const local2Base = finalizeSalaryBookPayroll(cloud2).book
  const local2: SalaryBook = {
    ...local2Base,
    months: local2Base.months.map((m) =>
      m.id === m2.id ? { ...m, blocks: m.blocks.filter((b) => b.id !== blockIdToDelete) } : m,
    ),
    deletedSiteBlockIds: tombstoneSalaryBookSiteBlockId(local2Base, blockIdToDelete),
  }
  const merged2 = mergeSalaryBookPreferLocal(local2, cloud2)
  const m2Out = merged2.months.find((m) => m.id === m2.id)
  check(
    '案場區塊本機刪除 → 雲端有 → 合併後該 block id 不會復活',
    !!m2Out && m2Out.blocks.every((b) => b.id !== blockIdToDelete),
    m2Out?.blocks.map((b) => b.id),
  )

  const cloud3 = defaultSalaryBook()
  const localR3 = removeWorkerFromBook(cloud3, '楊家全').book
  check('removeWorkerFromBook 寫入墓碑', (localR3.deletedStaffNames ?? []).some((t) => t.id === '楊家全'))
  const mergedR3 = mergeSalaryBookPreferLocal(localR3, cloud3)
  const someoneStillHas = mergedR3.months.some((m) =>
    m.blocks.some((b) => '楊家全' in b.grid),
  )
  check('人員本機刪除 → 雲端有 → 合併後 grid／日薪等不再含該人員', !someoneStillHas)
  const stillInRate = mergedR3.months.some(
    (m) => '楊家全' in m.rateJun || '楊家全' in m.rateTsai,
  )
  check('人員墓碑也清掉日薪欄位', !stillInRate)
}

console.log(`\n結果：${pass} 通過 / ${fail} 失敗`)
if (fail > 0) process.exit(1)
