/**
 * 在職證明書（對外文件之一）
 */
import { COMPANY_CONTRACTOR } from './companyContact'

export type EmploymentCertificateWorkspaceState = {
  employeeName: string
  gender: string
  idNumber: string
  birthRocYear: string
  birthRocMonth: string
  birthRocDay: string
  jobTitle: string
  hireRocYear: string
  hireRocMonth: string
  hireRocDay: string
  remarks: string
  companyName: string
  taxId: string
  responsiblePerson: string
  address: string
  issueRocYear: string
  issueRocMonth: string
  issueRocDay: string
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function todayRocParts(): { y: string; m: string; d: string } {
  const now = new Date()
  return {
    y: String(now.getFullYear() - 1911),
    m: String(now.getMonth() + 1),
    d: String(now.getDate()),
  }
}

export function initialEmploymentCertificateWorkspace(): EmploymentCertificateWorkspaceState {
  const today = todayRocParts()
  return {
    employeeName: '',
    gender: '',
    idNumber: '',
    birthRocYear: '',
    birthRocMonth: '',
    birthRocDay: '',
    jobTitle: '',
    hireRocYear: '',
    hireRocMonth: '',
    hireRocDay: '',
    remarks: '',
    companyName: COMPANY_CONTRACTOR.name,
    taxId: COMPANY_CONTRACTOR.taxId,
    responsiblePerson: COMPANY_CONTRACTOR.responsiblePerson,
    address: COMPANY_CONTRACTOR.address,
    issueRocYear: today.y,
    issueRocMonth: today.m,
    issueRocDay: today.d,
  }
}

export function migrateEmploymentCertificateWorkspace(raw: unknown): EmploymentCertificateWorkspaceState {
  const init = initialEmploymentCertificateWorkspace()
  if (!raw || typeof raw !== 'object') return init
  const o = raw as Record<string, unknown>
  return {
    employeeName: str(o.employeeName),
    gender: str(o.gender),
    idNumber: str(o.idNumber),
    birthRocYear: str(o.birthRocYear),
    birthRocMonth: str(o.birthRocMonth),
    birthRocDay: str(o.birthRocDay),
    jobTitle: str(o.jobTitle),
    hireRocYear: str(o.hireRocYear),
    hireRocMonth: str(o.hireRocMonth),
    hireRocDay: str(o.hireRocDay),
    remarks: str(o.remarks),
    companyName: str(o.companyName).trim() || init.companyName,
    taxId: str(o.taxId).trim() || init.taxId,
    responsiblePerson: str(o.responsiblePerson).trim() || init.responsiblePerson,
    address: str(o.address).trim() || init.address,
    issueRocYear: str(o.issueRocYear),
    issueRocMonth: str(o.issueRocMonth),
    issueRocDay: str(o.issueRocDay),
  }
}
