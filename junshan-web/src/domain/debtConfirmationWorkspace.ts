/**
 * 工程款延期付款暨債務確認書（對外文件之一）
 */
import { COMPANY_CONTRACTOR } from './companyContact'
import { allocateWithSuffix, stableHash16 } from './stableIds'

export const DEBT_CONFIRMATION_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const DEBT_CONFIRMATION_MAX_ATTACHMENTS = 15
export const DEBT_CONFIRMATION_ATTACHMENT_ACCEPT =
  'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png'

export type DebtConfirmationAttachmentFile = {
  id: string
  fileName: string
  mimeType: string
  /** data URL（base64），供本機／雲端儲存與 PDF 合併 */
  dataUrl: string
}

export type DebtConfirmationParty = {
  companyName: string
  taxId: string
  responsiblePerson: string
  phone: string
  address: string
}

export type DebtConfirmationWorkspaceState = {
  projectName: string
  siteLocation: string
  workContent: string
  refEstimateNo: string
  refQuotationNo: string
  refDispatchNo: string
  refBillingNo: string
  refOther: string
  refEstimateChecked: boolean
  refQuotationChecked: boolean
  refDispatchChecked: boolean
  refBillingChecked: boolean
  refOtherChecked: boolean
  debtConfirmRocYear: string
  debtConfirmRocMonth: string
  debtConfirmRocDay: string
  debtAmountUpper: string
  debtAmountLower: string
  paymentDueRocYear: string
  paymentDueRocMonth: string
  paymentDueRocDay: string
  paymentAmPm: 'am' | 'pm' | ''
  paymentHour: string
  paymentMinute: string
  payCash: boolean
  payTransfer: boolean
  payCheck: boolean
  payOther: boolean
  payOtherText: string
  bankName: string
  accountName: string
  accountNumber: string
  amountTaxMode: 'incl' | 'excl' | ''
  recoveryPaymentOrder: boolean
  recoveryMediation: boolean
  recoveryLawsuit: boolean
  recoveryProvisionalSeizure: boolean
  recoveryEnforcement: boolean
  recoveryPromissoryNote: boolean
  recoveryOther: boolean
  recoveryOtherText: string
  attachEstimate: boolean
  attachQuotation: boolean
  attachBilling: boolean
  attachDispatchSign: boolean
  attachPhotos: boolean
  attachLine: boolean
  attachEmail: boolean
  attachTransferRecord: boolean
  attachOther: boolean
  attachOtherText: string
  /** 第十條上傳之附件；下載 PDF 時接在本文最後 */
  attachmentFiles: DebtConfirmationAttachmentFile[]
  guarantorName: string
  guarantorId: string
  guarantorPhone: string
  guarantorAddress: string
  guarantorSignRocYear: string
  guarantorSignRocMonth: string
  guarantorSignRocDay: string
  partyA: DebtConfirmationParty
  partyASignRocYear: string
  partyASignRocMonth: string
  partyASignRocDay: string
  partyB: DebtConfirmationParty
  partyBSignRocYear: string
  partyBSignRocMonth: string
  partyBSignRocDay: string
}

function emptyParty(): DebtConfirmationParty {
  return {
    companyName: '',
    taxId: '',
    responsiblePerson: '',
    phone: '',
    address: '',
  }
}

function defaultPartyB(): DebtConfirmationParty {
  return {
    companyName: '鈞泩放樣工程',
    taxId: COMPANY_CONTRACTOR.taxId,
    responsiblePerson: COMPANY_CONTRACTOR.responsiblePerson,
    phone: COMPANY_CONTRACTOR.phone,
    address: COMPANY_CONTRACTOR.address,
  }
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function guessAttachmentMime(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  return ''
}

function migrateAttachmentFiles(raw: unknown): DebtConfirmationAttachmentFile[] {
  if (!Array.isArray(raw)) return []
  const out: DebtConfirmationAttachmentFile[] = []
  const used = new Set<string>()
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i]
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const fileName = str(o.fileName)
    const dataUrl = str(o.dataUrl)
    if (!fileName || !dataUrl.startsWith('data:')) continue
    const mimeType = str(o.mimeType) || guessAttachmentMime(fileName)
    let id = str(o.id)
    if (!id) {
      id = `dcf-att--${stableHash16(`${i}\u0000${fileName}\u0000${dataUrl.length}`)}`
    }
    id = allocateWithSuffix(id, used)
    used.add(id)
    out.push({ id, fileName, mimeType, dataUrl })
    if (out.length >= DEBT_CONFIRMATION_MAX_ATTACHMENTS) break
  }
  return out
}

export function mergeDebtConfirmationAttachmentFilesPreferLocal(
  local: readonly DebtConfirmationAttachmentFile[],
  cloud: readonly DebtConfirmationAttachmentFile[],
): DebtConfirmationAttachmentFile[] {
  const byId = new Map<string, DebtConfirmationAttachmentFile>()
  for (const c of cloud) byId.set(c.id, c)
  for (const l of local) byId.set(l.id, l)
  return [...byId.values()].slice(0, DEBT_CONFIRMATION_MAX_ATTACHMENTS)
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('讀取檔案失敗'))
    reader.readAsDataURL(file)
  })
}

function attachmentAllowed(file: File): boolean {
  const mime = file.type.toLowerCase()
  if (mime === 'application/pdf' || mime === 'image/jpeg' || mime === 'image/png') return true
  return /\.(pdf|jpe?g|png)$/i.test(file.name)
}

export async function createDebtConfirmationAttachmentFromFile(
  file: File,
  existing: readonly DebtConfirmationAttachmentFile[],
): Promise<DebtConfirmationAttachmentFile | { error: string }> {
  if (existing.length >= DEBT_CONFIRMATION_MAX_ATTACHMENTS) {
    return { error: `最多 ${DEBT_CONFIRMATION_MAX_ATTACHMENTS} 個附件` }
  }
  if (!attachmentAllowed(file)) {
    return { error: '僅支援 PDF、JPG、PNG' }
  }
  if (file.size > DEBT_CONFIRMATION_MAX_ATTACHMENT_BYTES) {
    return { error: '單檔不得超過 10MB' }
  }
  const approxTotal =
    existing.reduce((sum, f) => sum + f.dataUrl.length, 0) + Math.ceil(file.size * 1.37)
  if (approxTotal > 45 * 1024 * 1024) {
    return { error: '附件總量過大，請刪除部分後再上傳' }
  }

  const dataUrl = await readFileAsDataUrl(file)
  const used = new Set(existing.map((x) => x.id))
  const base = `dcf-att--${stableHash16(`${file.name}\u0000${file.size}\u0000${file.lastModified}`)}`
  const id = allocateWithSuffix(base, used)
  return {
    id,
    fileName: file.name,
    mimeType: file.type || guessAttachmentMime(file.name),
    dataUrl,
  }
}

function party(raw: unknown): DebtConfirmationParty {
  if (!raw || typeof raw !== 'object') return emptyParty()
  const o = raw as Record<string, unknown>
  return {
    companyName: str(o.companyName),
    taxId: str(o.taxId),
    responsiblePerson: str(o.responsiblePerson),
    phone: str(o.phone),
    address: str(o.address),
  }
}

export function initialDebtConfirmationWorkspace(): DebtConfirmationWorkspaceState {
  return {
    projectName: '',
    siteLocation: '',
    workContent: '',
    refEstimateNo: '',
    refQuotationNo: '',
    refDispatchNo: '',
    refBillingNo: '',
    refOther: '',
    refEstimateChecked: false,
    refQuotationChecked: false,
    refDispatchChecked: false,
    refBillingChecked: false,
    refOtherChecked: false,
    debtConfirmRocYear: '',
    debtConfirmRocMonth: '',
    debtConfirmRocDay: '',
    debtAmountUpper: '',
    debtAmountLower: '',
    paymentDueRocYear: '',
    paymentDueRocMonth: '',
    paymentDueRocDay: '',
    paymentAmPm: '',
    paymentHour: '',
    paymentMinute: '',
    payCash: false,
    payTransfer: false,
    payCheck: false,
    payOther: false,
    payOtherText: '',
    bankName: COMPANY_CONTRACTOR.bankName,
    accountName: COMPANY_CONTRACTOR.accountName,
    accountNumber: COMPANY_CONTRACTOR.accountNumber,
    amountTaxMode: '',
    recoveryPaymentOrder: false,
    recoveryMediation: false,
    recoveryLawsuit: false,
    recoveryProvisionalSeizure: false,
    recoveryEnforcement: false,
    recoveryPromissoryNote: false,
    recoveryOther: false,
    recoveryOtherText: '',
    attachEstimate: false,
    attachQuotation: false,
    attachBilling: false,
    attachDispatchSign: false,
    attachPhotos: false,
    attachLine: false,
    attachEmail: false,
    attachTransferRecord: false,
    attachOther: false,
    attachOtherText: '',
    attachmentFiles: [],
    guarantorName: '',
    guarantorId: '',
    guarantorPhone: '',
    guarantorAddress: '',
    guarantorSignRocYear: '',
    guarantorSignRocMonth: '',
    guarantorSignRocDay: '',
    partyA: emptyParty(),
    partyASignRocYear: '',
    partyASignRocMonth: '',
    partyASignRocDay: '',
    partyB: defaultPartyB(),
    partyBSignRocYear: '',
    partyBSignRocMonth: '',
    partyBSignRocDay: '',
  }
}

export function migrateDebtConfirmationWorkspace(raw: unknown): DebtConfirmationWorkspaceState {
  const init = initialDebtConfirmationWorkspace()
  if (!raw || typeof raw !== 'object') return init
  const o = raw as Record<string, unknown>
  const pb = party(o.partyB)
  return {
    ...init,
    projectName: str(o.projectName),
    siteLocation: str(o.siteLocation),
    workContent: str(o.workContent),
    refEstimateNo: str(o.refEstimateNo),
    refQuotationNo: str(o.refQuotationNo),
    refDispatchNo: str(o.refDispatchNo),
    refBillingNo: str(o.refBillingNo),
    refOther: str(o.refOther),
    refEstimateChecked: bool(o.refEstimateChecked),
    refQuotationChecked: bool(o.refQuotationChecked),
    refDispatchChecked: bool(o.refDispatchChecked),
    refBillingChecked: bool(o.refBillingChecked),
    refOtherChecked: bool(o.refOtherChecked),
    debtConfirmRocYear: str(o.debtConfirmRocYear),
    debtConfirmRocMonth: str(o.debtConfirmRocMonth),
    debtConfirmRocDay: str(o.debtConfirmRocDay),
    debtAmountUpper: str(o.debtAmountUpper),
    debtAmountLower: str(o.debtAmountLower),
    paymentDueRocYear: str(o.paymentDueRocYear),
    paymentDueRocMonth: str(o.paymentDueRocMonth),
    paymentDueRocDay: str(o.paymentDueRocDay),
    paymentAmPm: o.paymentAmPm === 'am' || o.paymentAmPm === 'pm' ? o.paymentAmPm : '',
    paymentHour: str(o.paymentHour),
    paymentMinute: str(o.paymentMinute),
    payCash: bool(o.payCash),
    payTransfer: bool(o.payTransfer),
    payCheck: bool(o.payCheck),
    payOther: bool(o.payOther),
    payOtherText: str(o.payOtherText),
    bankName: str(o.bankName).trim() || COMPANY_CONTRACTOR.bankName,
    accountName: str(o.accountName).trim() || COMPANY_CONTRACTOR.accountName,
    accountNumber: str(o.accountNumber).trim() || COMPANY_CONTRACTOR.accountNumber,
    amountTaxMode: o.amountTaxMode === 'incl' || o.amountTaxMode === 'excl' ? o.amountTaxMode : '',
    recoveryPaymentOrder: bool(o.recoveryPaymentOrder),
    recoveryMediation: bool(o.recoveryMediation),
    recoveryLawsuit: bool(o.recoveryLawsuit),
    recoveryProvisionalSeizure: bool(o.recoveryProvisionalSeizure),
    recoveryEnforcement: bool(o.recoveryEnforcement),
    recoveryPromissoryNote: bool(o.recoveryPromissoryNote),
    recoveryOther: bool(o.recoveryOther),
    recoveryOtherText: str(o.recoveryOtherText),
    attachEstimate: bool(o.attachEstimate),
    attachQuotation: bool(o.attachQuotation),
    attachBilling: bool(o.attachBilling),
    attachDispatchSign: bool(o.attachDispatchSign),
    attachPhotos: bool(o.attachPhotos),
    attachLine: bool(o.attachLine),
    attachEmail: bool(o.attachEmail),
    attachTransferRecord: bool(o.attachTransferRecord),
    attachOther: bool(o.attachOther),
    attachOtherText: str(o.attachOtherText),
    attachmentFiles: migrateAttachmentFiles(o.attachmentFiles),
    guarantorName: str(o.guarantorName),
    guarantorId: str(o.guarantorId),
    guarantorPhone: str(o.guarantorPhone),
    guarantorAddress: str(o.guarantorAddress),
    guarantorSignRocYear: str(o.guarantorSignRocYear),
    guarantorSignRocMonth: str(o.guarantorSignRocMonth),
    guarantorSignRocDay: str(o.guarantorSignRocDay),
    partyA: party(o.partyA),
    partyASignRocYear: str(o.partyASignRocYear),
    partyASignRocMonth: str(o.partyASignRocMonth),
    partyASignRocDay: str(o.partyASignRocDay),
    partyB: (() => {
      const base = pb.companyName.trim() !== '' ? pb : init.partyB
      return {
        ...base,
        responsiblePerson: base.responsiblePerson.trim() || COMPANY_CONTRACTOR.responsiblePerson,
      }
    })(),
    partyBSignRocYear: str(o.partyBSignRocYear),
    partyBSignRocMonth: str(o.partyBSignRocMonth),
    partyBSignRocDay: str(o.partyBSignRocDay),
  }
}
