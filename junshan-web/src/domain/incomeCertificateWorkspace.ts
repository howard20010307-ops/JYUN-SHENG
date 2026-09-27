/**
 * 服務與收入證明書（對外文件之一；與在職證明書分開）
 */
import { COMPANY_CONTRACTOR } from './companyContact'
import {
  netTakeHomePayBeforeAdvanceInPeriod,
  type SalaryBook,
} from './salaryExcelModel'

export type IncomeCertificateWorkspaceState = {
  employeeName: string
  idNumber: string
  department: string
  hireRocYear: string
  hireRocMonth: string
  hireRocDay: string
  /** 申報／採計月份（民國年） */
  payRocYear: string
  payRocMonth: string
  /** 實領金額（元）；`netPayFromPayroll` 為真時由薪水總表覆寫 */
  netPayAmount: string
  /** 真：從該計薪月「實領薪水（未扣預支）」帶入；假：手填 */
  netPayFromPayroll: boolean
  landlordName: string
  /** 第三點聲明全文；`{房東}` 於 PDF 帶入房東姓名 */
  legalStatement: string
  companyName: string
  taxId: string
  address: string
  phone: string
  responsiblePerson: string
  issueRocYear: string
  issueRocMonth: string
  issueRocDay: string
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function todayRocParts(): { y: string; m: string; d: string } {
  const now = new Date()
  return {
    y: String(now.getFullYear() - 1911),
    m: String(now.getMonth() + 1),
    d: String(now.getDate()),
  }
}

/** 上一完整計薪週期所屬「採計月份」（每月 11 日至次月 10 日）。 */
export function lastCompletedPayCycleRoc(now: Date = new Date()): { y: string; m: string } {
  let gy = now.getFullYear()
  let mo = now.getMonth() + 1
  if (now.getDate() >= 11) mo -= 1
  else mo -= 2
  if (mo <= 0) {
    mo += 12
    gy -= 1
  }
  return { y: String(gy - 1911), m: String(mo) }
}

export function parseRocYearMonth(
  rocYear: string,
  rocMonth: string,
): { gy: number; mo: number } | null {
  const gy = Number.parseInt(rocYear.trim(), 10) + 1911
  const mo = Number.parseInt(rocMonth.trim(), 10)
  if (!Number.isFinite(gy) || gy < 1912 || gy > 2100) return null
  if (!Number.isFinite(mo) || mo < 1 || mo > 12) return null
  return { gy, mo }
}

export type PayCycleRange = {
  startIso: string
  endIso: string
  startRocYear: string
  startRocMonth: string
  endRocYear: string
  endRocMonth: string
}

/** 採計月份 M → 該月 11 日至次月 10 日。 */
export function payCycleRangeFromRocMonth(rocYear: string, rocMonth: string): PayCycleRange | null {
  const parsed = parseRocYearMonth(rocYear, rocMonth)
  if (!parsed) return null
  const { gy, mo } = parsed
  const nextMo = mo === 12 ? 1 : mo + 1
  const nextY = mo === 12 ? gy + 1 : gy
  return {
    startIso: `${gy}-${pad2(mo)}-11`,
    endIso: `${nextY}-${pad2(nextMo)}-10`,
    startRocYear: String(gy - 1911),
    startRocMonth: String(mo),
    endRocYear: String(nextY - 1911),
    endRocMonth: String(nextMo),
  }
}

export function parseNetPayAmount(raw: string): number {
  const n = Number.parseFloat(raw.replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

const CN_DIGITS = ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖'] as const

function chineseDigit(d: number): string {
  return CN_DIGITS[d] ?? '零'
}

/** 0～99 轉大寫（給「萬」位超過個位時用）。 */
function chineseTens(n: number): string {
  if (n <= 0) return '零'
  if (n < 10) return chineseDigit(n)
  const t = Math.floor(n / 10)
  const o = n % 10
  const head = t === 1 ? '拾' : `${chineseDigit(t)}拾`
  return o === 0 ? head : `${head}${chineseDigit(o)}`
}

export type NetPayChinesePlaces = {
  wan: string
  qian: string
  bai: string
  shi: string
  ge: string
}

/** 對應範本「＿萬＿仟＿佰＿拾元整」；個位有值時另填 ge。 */
export function netPayChinesePlaces(amount: number): NetPayChinesePlaces {
  const n = Math.max(0, Math.round(Number.isFinite(amount) ? amount : 0))
  const ge = n % 10
  const shi = Math.floor(n / 10) % 10
  const bai = Math.floor(n / 100) % 10
  const qian = Math.floor(n / 1000) % 10
  const wan = Math.floor(n / 10000)
  return {
    wan: wan <= 0 ? '零' : wan < 100 ? chineseTens(wan) : String(wan),
    qian: chineseDigit(qian),
    bai: chineseDigit(bai),
    shi: chineseDigit(shi),
    ge: ge === 0 ? '' : chineseDigit(ge),
  }
}

export const DEFAULT_INCOME_CERT_LEGAL_STATEMENT = `1. 本證明書僅限提供予房屋出租人（房東）{房東} 先生/小姐，作為評估乙方房屋租賃履約能力之參考依據，不具備任何公務、稅務申報或保證責任。
2. 本文件未授權用於申請任何政府機關補助（包括但不限於中央或地方租金補貼）、金融機構貸款或法律擔保事項。非經開立單位書面同意，影印、轉載或挪作其他用途者，一律無效。`

export function formatNetPayNt(amount: number): string {
  const n = Math.max(0, Math.round(Number.isFinite(amount) ? amount : 0))
  return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })
}

/** 該採計月份（11 日～次月 10 日）之「實領薪水（未扣預支）」。 */
export function netTakeHomeBeforeAdvanceForPayCycle(
  book: SalaryBook,
  staffName: string,
  rocYear: string,
  rocMonth: string,
): number {
  const name = staffName.trim()
  const range = payCycleRangeFromRocMonth(rocYear, rocMonth)
  if (!name || !range) return 0
  return netTakeHomePayBeforeAdvanceInPeriod(book, name, {
    label: `${range.startRocMonth}/11~${range.endRocMonth}/10`,
    startIso: range.startIso,
    endIso: range.endIso,
  })
}

export function initialIncomeCertificateWorkspace(): IncomeCertificateWorkspaceState {
  const today = todayRocParts()
  const pay = lastCompletedPayCycleRoc()
  return {
    employeeName: '',
    idNumber: '',
    department: '',
    hireRocYear: '',
    hireRocMonth: '',
    hireRocDay: '',
    payRocYear: pay.y,
    payRocMonth: pay.m,
    netPayAmount: '',
    netPayFromPayroll: true,
    landlordName: '',
    legalStatement: DEFAULT_INCOME_CERT_LEGAL_STATEMENT,
    companyName: COMPANY_CONTRACTOR.name,
    taxId: COMPANY_CONTRACTOR.taxId,
    address: COMPANY_CONTRACTOR.address,
    phone: COMPANY_CONTRACTOR.phone,
    responsiblePerson: COMPANY_CONTRACTOR.responsiblePerson,
    issueRocYear: today.y,
    issueRocMonth: today.m,
    issueRocDay: today.d,
  }
}

export function migrateIncomeCertificateWorkspace(raw: unknown): IncomeCertificateWorkspaceState {
  const init = initialIncomeCertificateWorkspace()
  if (!raw || typeof raw !== 'object') return init
  const o = raw as Record<string, unknown>
  return {
    employeeName: str(o.employeeName),
    idNumber: str(o.idNumber),
    department: str(o.department),
    hireRocYear: str(o.hireRocYear),
    hireRocMonth: str(o.hireRocMonth),
    hireRocDay: str(o.hireRocDay),
    payRocYear: str(o.payRocYear).trim() || init.payRocYear,
    payRocMonth: str(o.payRocMonth).trim() || init.payRocMonth,
    netPayAmount: str(o.netPayAmount),
    netPayFromPayroll: o.netPayFromPayroll !== false,
    landlordName: str(o.landlordName),
    legalStatement:
      typeof o.legalStatement === 'string' ? o.legalStatement : init.legalStatement,
    companyName: str(o.companyName).trim() || init.companyName,
    taxId: str(o.taxId).trim() || init.taxId,
    address: str(o.address).trim() || init.address,
    phone: str(o.phone).trim() || init.phone,
    responsiblePerson: str(o.responsiblePerson).trim() || init.responsiblePerson,
    issueRocYear: str(o.issueRocYear),
    issueRocMonth: str(o.issueRocMonth),
    issueRocDay: str(o.issueRocDay),
  }
}

export function mergeIncomeCertificateWorkspacePreferLocal(
  local: IncomeCertificateWorkspaceState,
  remote: IncomeCertificateWorkspaceState,
): IncomeCertificateWorkspaceState {
  const l = migrateIncomeCertificateWorkspace(local)
  const r = migrateIncomeCertificateWorkspace(remote)
  return migrateIncomeCertificateWorkspace({ ...r, ...l })
}
