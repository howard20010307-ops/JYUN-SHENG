import type { AppState } from './appState'
import { renameQuoteSiteIfProjectNameMatches } from './quoteEngine'
import { renameReceivableProjectNames, remapReceivablePayrollBindings } from './receivablesModel'
import { renameSiteAcrossBook, isSingleBlockSiteRenameOldName, type SiteRenameEditedRef } from './salaryExcelModel'
import { renameWorkLogSiteNames } from './workLogModel'
import { repairWorkLogDayDocumentsAgainstPayroll } from './workLogPayrollLink'

/**
 * 任一端將案名由 `oldExact` 改為 `newNameRaw`（trim 後）：一次更新
 * 薪水月表、工作日誌（含整日文件修併）、放樣估價主案名、收帳案名。
 *
 * 「新案場」／空白案名僅更新 `edited` 所指月表區塊，不連動其他月份草稿，也不改日誌／估價／收帳之同名案場。
 *
 * - 月表 {@link renameSiteAcrossBook} 失敗時整包不變（`state` 回傳原 `s`）。
 * - 月表「無需變更」時仍會嘗試同步日誌／估價／收帳（例如案名僅存在估價而尚未上薪月表）。
 */
export function applySiteRenameAcrossAppState(
  s: AppState,
  oldExact: string,
  newNameRaw: string,
  edited?: SiteRenameEditedRef,
): { state: AppState; ok: boolean; message: string } {
  const newT = newNameRaw.trim()
  if (!newT) {
    return { state: s, ok: false, message: '案場名稱不可為空白。' }
  }
  if (oldExact === newT) {
    return { state: s, ok: true, message: '名稱相同，無需變更。' }
  }

  const oldTrim = oldExact.trim()
  /** 估價首次填寫案名（焦點時為空白）不連動日誌／收帳，避免誤改「空案名」列 */
  if (!oldTrim && edited === undefined) {
    return { state: s, ok: true, message: '' }
  }

  const r = renameSiteAcrossBook(s.salaryBook, oldExact, newT, edited)
  if (!r.ok) {
    return { state: s, ok: false, message: r.message }
  }

  const book = r.book
  const singleBlockOnly = isSingleBlockSiteRenameOldName(oldExact)
  let workLog = s.workLog
  let site = s.site
  let receivables = s.receivables
  if (!singleBlockOnly) {
    workLog = renameWorkLogSiteNames(workLog, oldExact, newT)
    site = renameQuoteSiteIfProjectNameMatches(site, oldExact, newT)
    receivables = renameReceivableProjectNames(receivables, oldExact, newT)
  }
  workLog = repairWorkLogDayDocumentsAgainstPayroll(workLog, book)
  if (Object.keys(r.blockByOldId).length > 0) {
    receivables = remapReceivablePayrollBindings(receivables, {}, r.blockByOldId)
  }

  return {
    state: { ...s, salaryBook: book, workLog, site, receivables },
    ok: true,
    message: r.message,
  }
}
