// 驗證墓碑：裝置 A 刪除某 id → 上傳；裝置 B（仍持有舊 id）下載 → 不應復活該列。
import { readFileSync } from 'node:fs'
import {
  mergeReceivablesPreferLocal,
  migrateReceivablesState,
  tombstoneReceivableEntryId,
  type ReceivablesState,
} from '../src/domain/receivablesModel'

const file = process.argv[2]
if (!file) {
  console.error('用法：tsx scripts/verify-receivables-tombstone.mts <backup.json>')
  process.exit(1)
}
const targetId = process.argv[3] ?? 'rcv--8cca72ed72888bc8'

const json = JSON.parse(readFileSync(file, 'utf8'))
const cloudOriginal: ReceivablesState = migrateReceivablesState(json.data.receivables)
console.log(`原雲端列數：${cloudOriginal.entries.length}`)
const targetExists = cloudOriginal.entries.some((e) => e.id === targetId)
console.log(`目標列 (${targetId}) 是否存在於雲端：${targetExists}`)
if (!targetExists) {
  console.error('目標列不在雲端，無法驗證情境。')
  process.exit(1)
}

// 裝置 A：對著「雲端」資料按下刪除（模擬 App 刪除）→ 上傳
const deviceALocalAfterDelete: ReceivablesState = {
  ...cloudOriginal,
  entries: cloudOriginal.entries.filter((e) => e.id !== targetId),
  deletedEntryIds: tombstoneReceivableEntryId(cloudOriginal, targetId),
}
console.log(
  `裝置 A 刪除後：列數=${deviceALocalAfterDelete.entries.length}, 墓碑=${(deviceALocalAfterDelete.deletedEntryIds ?? []).length}`,
)

// 模擬裝置 A 上傳：雲端變成裝置 A 的內容
const cloudAfterAUpload: ReceivablesState = deviceALocalAfterDelete

// 裝置 B：localStorage 還停留在原始 cloudOriginal（仍含 targetId），且自己沒按過刪除
const deviceBLocalBefore: ReceivablesState = cloudOriginal

// 裝置 B 同步：mergeReceivablesPreferLocal(local=B, remote=cloud)
const deviceBAfterSync = mergeReceivablesPreferLocal(deviceBLocalBefore, cloudAfterAUpload)
const stillThereOnB = deviceBAfterSync.entries.some((e) => e.id === targetId)
console.log(
  `裝置 B 同步後：列數=${deviceBAfterSync.entries.length}, 該列復活？=${stillThereOnB}（期望 false）`,
)

// 進一步：裝置 B 上傳；裝置 A 再下載一次，看會不會復活
const cloudAfterBUpload = deviceBAfterSync
const deviceAAfterRoundTrip = mergeReceivablesPreferLocal(deviceALocalAfterDelete, cloudAfterBUpload)
const reappearedOnA = deviceAAfterRoundTrip.entries.some((e) => e.id === targetId)
console.log(
  `裝置 A 再下載：列數=${deviceAAfterRoundTrip.entries.length}, 該列復活？=${reappearedOnA}（期望 false）`,
)

if (stillThereOnB || reappearedOnA) {
  console.error('FAIL：墓碑沒擋住復活。')
  process.exit(1)
}
console.log('PASS：墓碑成功阻擋跨裝置同步復活。')
