/** 業主明細 PDF：檔名與下載（html2canvas + jsPDF；可印區內等比置中） */

import { jsPDF } from 'jspdf'
import { appendDebtConfirmationAttachmentsToPdf } from './debtConfirmationPdfAttachments'
import type { DebtConfirmationAttachmentFile } from './debtConfirmationWorkspace'
import { addPdfPageWatermark, isPdfPageWatermarkElement } from './pdfPageWatermark'
import {
  exportOwnerScopePdfBlobByWorkspaces,
  exportQuotationPdfBlobByWorkspaces,
} from './quotationPdfExport'

export function buildOwnerScopePdfFilename(siteName: string): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const safe = siteName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || '未命名案場'
  return `放樣工程(內外業)承攬供述明細_${safe}_${y}${m}${day}.pdf`
}

export function buildQuotationPdfFilename(title: string): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const safe = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || '未命名報價'
  return `報價單_${safe}_${y}${m}${day}.pdf`
}

export function buildWorkDetailPdfFilename(caseTitle: string): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const safe = caseTitle.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || '未命名案名'
  return `承攬供述明細_${safe}_${y}${m}${day}.pdf`
}

export function buildDebtConfirmationPdfFilename(projectName: string): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const safe = projectName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || '未命名工程'
  return `工程款延期付款暨債務確認書_${safe}_${y}${m}${day}.pdf`
}

export function buildContractPdfFilename(projectName: string): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const safe = projectName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || '未命名工程'
  return `工程合約書_${safe}_${y}${m}${day}.pdf`
}

export function buildEmploymentCertificatePdfFilename(employeeName: string): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const safe = employeeName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || '未命名員工'
  return `在職證明書_${safe}_${y}${m}${day}.pdf`
}

export function buildIncomeCertificatePdfFilename(
  employeeName: string,
  payRocYear: string,
  payRocMonth: string,
): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const safe = employeeName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || '未命名員工'
  const payY = payRocYear.trim() || '未填'
  const payM = payRocMonth.trim() || '未填'
  return `服務與收入證明書_${safe}_民國${payY}年${payM}月薪資證明_${y}${m}${day}.pdf`
}

function parseDateLikeInput(input: string): Date | null {
  const s = input.trim()
  if (!s) return null
  const m = s.match(/^(\d{4})[\/\-\.]?(\d{1,2})[\/\-\.]?(\d{1,2})$/)
  if (!m) return null
  const y = Number(m[1])
  const mon = Number(m[2])
  const day = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(mon) || !Number.isFinite(day)) return null
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return null
  const d = new Date(y, mon - 1, day)
  if (d.getFullYear() !== y || d.getMonth() !== mon - 1 || d.getDate() !== day) return null
  return d
}

function rocDateCompact(d: Date): string {
  const rocYear = String(d.getFullYear() - 1911).padStart(3, '0')
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${rocYear}${m}${day}`
}

export function buildPricingPdfFilename(siteName: string, pricingDate = ''): string {
  const dateSource = parseDateLikeInput(pricingDate) ?? new Date()
  const roc = rocDateCompact(dateSource)
  const safeSite = siteName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || '未命名案場'
  return `鈞泩計價單 (${safeSite}) (${roc}).pdf`
}

function waitNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

function pdfSourceIntersectsViewport(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  if (r.width < 4 || r.height < 4) return false
  const vw = window.innerWidth
  const vh = window.innerHeight
  return r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw
}

function resolvePdfCaptureRoot(wrapper: HTMLElement): HTMLElement {
  const inner = wrapper.querySelector<HTMLElement>(
    '.quotationPdfRoot, .ownerScopePdfRoot, .contractPdfRoot, .debtConfirmationPdfRoot',
  )
  return inner ?? wrapper
}

function buildHtml2CanvasOpts(captureEl: HTMLElement) {
  const w = Math.max(1, Math.ceil(Math.max(captureEl.scrollWidth, captureEl.offsetWidth)))
  const h = Math.max(1, Math.ceil(Math.max(captureEl.scrollHeight, captureEl.offsetHeight)))
  return {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff' as const,
    width: w,
    height: h,
    windowWidth: w,
    windowHeight: h,
    scrollX: 0,
    scrollY: 0,
    ignoreElements: isPdfPageWatermarkElement,
  }
}

const PDF_MARGIN_MM = [6, 8, 10, 8] as [number, number, number, number]
const PDF_IMAGE_QUALITY = 0.93
const PDF_IMAGE_TYPE = 'jpeg' as const
const JPEG_FMT = 'JPEG' as const

const SINGLE_PAGE_FIT_SLACK_PX = 120

function isPixelNonBlank(a: number, r: number, g: number, b: number): boolean {
  if (a < 12) return false
  return r < 248 || g < 248 || b < 248
}

/**
 * 裁成「非空白像素」外接矩形（四邊）。html2canvas 常留下一側或底部大片白，
 * 若不裁掉，用 mm 置中只會讓「整張含白的圖」置中，視覺上仍像表格靠左。
 */
function cropCanvasToContentBounds(source: HTMLCanvasElement): HTMLCanvasElement {
  const w = source.width
  const h = source.height
  if (w < 1 || h < 1) return source
  const ctx = source.getContext('2d', { willReadFrequently: true })
  if (!ctx) return source
  let data: ImageData
  try {
    data = ctx.getImageData(0, 0, w, h)
  } catch {
    return source
  }
  const d = data.data
  const step = 2
  let minX = w
  let maxX = -1
  let minY = h
  let maxY = -1
  for (let y = 0; y < h; y += step) {
    const row = y * w * 4
    for (let x = 0; x < w; x += step) {
      const i = row + x * 4
      if (isPixelNonBlank(d[i + 3]!, d[i]!, d[i + 1]!, d[i + 2]!)) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < minX || maxY < minY) return source
  const pad = 2
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(w - 1, maxX + pad)
  maxY = Math.min(h - 1, maxY + pad)
  const nw = maxX - minX + 1
  const nh = maxY - minY + 1
  if (nw >= w && nh >= h) return source
  const out = document.createElement('canvas')
  out.width = nw
  out.height = nh
  const octx = out.getContext('2d')
  if (!octx) return source
  octx.drawImage(source, minX, minY, nw, nh, 0, 0, nw, nh)
  return out
}

function innerPrintableMm(pdf: jsPDF, margin: [number, number, number, number]) {
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const innerW = pageW - margin[1] - margin[3]
  const innerH = pageH - margin[0] - margin[2]
  return { innerW, innerH, innerRatio: innerH / innerW }
}

/**
 * 將「像素寬高為 pw×ph」的圖，等比放入 (boxW×boxH) mm 的矩形（左上 boxX, boxY），水平＋垂直置中。
 * pw、ph 與 box 單位無關，比例用 min(boxW/pw, boxH/ph) 換算成 mm 寬高。
 */
function addImageContainCenteredInBox(
  pdf: jsPDF,
  imgData: string,
  pw: number,
  ph: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
): void {
  if (pw < 1 || ph < 1 || boxW <= 0 || boxH <= 0) return
  const s = Math.min(boxW / pw, boxH / ph)
  const drawW = pw * s
  const drawH = ph * s
  const x = boxX + (boxW - drawW) / 2
  const y = boxY + (boxH - drawH) / 2
  pdf.addImage(imgData, JPEG_FMT, x, y, drawW, drawH)
}

/** 整張圖一頁：可印區內 contain 置中 */
function addFullCanvasSinglePage(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  margin: [number, number, number, number],
  innerW: number,
  innerH: number,
) {
  const img = canvas.toDataURL(`image/${PDF_IMAGE_TYPE}`, PDF_IMAGE_QUALITY)
  addImageContainCenteredInBox(pdf, img, canvas.width, canvas.height, margin[1], margin[0], innerW, innerH)
}

/** 多頁：每頁可印區皆相同 (innerW×innerH)，每條切片在該頁矩形內 contain 置中 */
function addCanvasAsSlicedPagesCentered(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  margin: [number, number, number, number],
  innerW: number,
  innerH: number,
  innerRatio: number,
) {
  const pxFull = canvas.height
  const cw = canvas.width
  const pxPageHeight = Math.floor(cw * innerRatio)
  if (pxPageHeight < 1) {
    addFullCanvasSinglePage(pdf, canvas, margin, innerW, innerH)
    return
  }

  if (pxFull <= pxPageHeight + SINGLE_PAGE_FIT_SLACK_PX) {
    addFullCanvasSinglePage(pdf, canvas, margin, innerW, innerH)
    return
  }

  const nPages = Math.ceil(pxFull / pxPageHeight)
  const remainder = pxFull % pxPageHeight
  const thinRemMax = Math.min(48, Math.floor(pxPageHeight * 0.04))
  if (nPages === 2 && remainder > 0 && remainder < thinRemMax) {
    addFullCanvasSinglePage(pdf, canvas, margin, innerW, innerH)
    return
  }

  const pageCanvas = document.createElement('canvas')
  pageCanvas.width = cw
  const pageCtx = pageCanvas.getContext('2d')
  if (!pageCtx) return

  for (let page = 0; page < nPages; page++) {
    const sliceH = page === nPages - 1 && remainder !== 0 ? remainder : pxPageHeight
    pageCanvas.height = sliceH
    const w = pageCanvas.width
    const h = pageCanvas.height
    pageCtx.fillStyle = '#ffffff'
    pageCtx.fillRect(0, 0, w, h)
    pageCtx.drawImage(canvas, 0, page * pxPageHeight, w, h, 0, 0, w, h)
    if (page > 0) pdf.addPage()
    const imgData = pageCanvas.toDataURL(`image/${PDF_IMAGE_TYPE}`, PDF_IMAGE_QUALITY)
    addImageContainCenteredInBox(pdf, imgData, w, h, margin[1], margin[0], innerW, innerH)
  }
}

async function captureToPdfBlob(captureEl: HTMLElement): Promise<Blob> {
  const [{ default: html2canvas }] = await Promise.all([import('html2canvas')])
  const raw = await html2canvas(captureEl, buildHtml2CanvasOpts(captureEl))
  const canvas = cropCanvasToContentBounds(raw)

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const { innerW, innerH, innerRatio } = innerPrintableMm(pdf, PDF_MARGIN_MM)

  const pxPageHeight = Math.floor(canvas.width * innerRatio)
  if (canvas.height <= pxPageHeight) {
    addFullCanvasSinglePage(pdf, canvas, PDF_MARGIN_MM, innerW, innerH)
  } else {
    addCanvasAsSlicedPagesCentered(pdf, canvas, PDF_MARGIN_MM, innerW, innerH, innerRatio)
  }

  await addPdfPageWatermark(pdf)
  return pdf.output('blob')
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

async function buildWorkspacePdfBlob(
  captureRoot: HTMLElement,
  exportBlobFn: (root: HTMLElement) => Promise<Blob>,
): Promise<Blob> {
  if (pdfSourceIntersectsViewport(captureRoot)) {
    await waitNextPaint()
    return exportBlobFn(captureRoot)
  }
  const shell = document.createElement('div')
  shell.setAttribute('data-owner-scope-pdf-capture', '1')
  shell.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'width:100%',
    'max-height:100vh',
    'overflow:auto',
    'z-index:2147483646',
    'background:#ffffff',
    'opacity:1',
    'visibility:visible',
    'pointer-events:none',
    'box-sizing:border-box',
    'display:flex',
    'justify-content:center',
    'align-items:flex-start',
  ].join(';')
  const clone = captureRoot.cloneNode(true) as HTMLElement
  applyPdfCaptureCloneLayout(clone, '210mm')
  shell.appendChild(clone)
  document.body.appendChild(shell)
  try {
    await waitNextPaint()
    return await exportBlobFn(clone)
  } finally {
    shell.remove()
  }
}

export async function buildOwnerScopePdfBlob(element: HTMLElement): Promise<Blob> {
  const captureRoot = resolvePdfCaptureRoot(element)

  if (captureRoot.classList.contains('quotationPdfRoot')) {
    return buildWorkspacePdfBlob(captureRoot, exportQuotationPdfBlobByWorkspaces)
  }
  if (captureRoot.classList.contains('ownerScopePdfRoot')) {
    return buildWorkspacePdfBlob(captureRoot, exportOwnerScopePdfBlobByWorkspaces)
  }
  if (captureRoot.classList.contains('debtConfirmationPdfRoot')) {
    return buildDebtConfirmationPdfBlob(captureRoot)
  }
  if (captureRoot.classList.contains('employmentCertPdfRoot')) {
    return buildEmploymentCertificatePdfBlob(captureRoot)
  }
  if (captureRoot.classList.contains('incomeCertPdfRoot')) {
    return buildIncomeCertificatePdfBlob(captureRoot)
  }
  if (captureRoot.classList.contains('contractPdfRoot')) {
    return buildContractPdfBlob(captureRoot)
  }

  if (pdfSourceIntersectsViewport(captureRoot)) {
    await waitNextPaint()
    return captureToPdfBlob(captureRoot)
  }

  const shell = document.createElement('div')
  shell.setAttribute('data-owner-scope-pdf-capture', '1')
  shell.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'width:100%',
    'max-height:100vh',
    'overflow:auto',
    'z-index:2147483646',
    'background:#ffffff',
    'opacity:1',
    'visibility:visible',
    'pointer-events:none',
    'box-sizing:border-box',
    'display:flex',
    'justify-content:center',
    'align-items:flex-start',
  ].join(';')

  const clone = captureRoot.cloneNode(true) as HTMLElement
  clone.style.cssText = [
    'position:relative',
    'width:210mm',
    'max-width:100%',
    'margin:0',
    'background:#ffffff',
    'box-sizing:border-box',
  ].join(';')

  shell.appendChild(clone)
  document.body.appendChild(shell)

  try {
    await waitNextPaint()
    return await captureToPdfBlob(clone)
  } finally {
    shell.remove()
  }
}

export async function downloadOwnerScopePdf(element: HTMLElement, filename: string): Promise<void> {
  const blob = await buildOwnerScopePdfBlob(element)
  downloadBlob(blob, filename)
}

const DEBT_PDF_SCALE = 2
/** 分頁高度安全邊（canvas px），避免切片邊緣裁到文字 */
const BLOCK_PAGE_SLICE_SLACK_PX = 8

async function waitForCaptureAssets(el: HTMLElement): Promise<void> {
  try {
    await document.fonts.ready
  } catch {
    /* ignore */
  }
  const imgs = [...el.querySelectorAll('img')]
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve()
            return
          }
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        }),
    ),
  )
  await waitNextPaint()
}

function createOffscreenPdfCaptureShell(): HTMLDivElement {
  const shell = document.createElement('div')
  shell.setAttribute('data-pdf-capture-shell', '1')
  shell.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'width:210mm',
    'overflow:visible',
    'z-index:2147483646',
    'background:#fff',
    'color:#111',
    'color-scheme:light',
    'pointer-events:none',
    'transform:translateX(-120vw)',
  ].join(';')
  return shell
}

/** 僅追加擷取用排版；禁止 cssText 覆寫，否則會洗掉 React inline 的字色／字級。 */
function applyPdfCaptureCloneLayout(clone: HTMLElement, width = '190mm'): void {
  clone.style.setProperty('position', 'relative')
  clone.style.setProperty('width', width)
  clone.style.setProperty('max-width', 'none')
  clone.style.setProperty('margin', '0')
  clone.style.setProperty('box-sizing', 'border-box')
}

async function mountPdfCaptureClone(captureRoot: HTMLElement): Promise<{
  clone: HTMLElement
  cleanup: () => void
}> {
  const shell = createOffscreenPdfCaptureShell()
  const clone = captureRoot.cloneNode(true) as HTMLElement
  applyPdfCaptureCloneLayout(clone)

  shell.appendChild(clone)
  document.body.appendChild(shell)
  await waitForCaptureAssets(clone)

  return {
    clone,
    cleanup: () => shell.remove(),
  }
}

type CanvasSegment = { top: number; bottom: number }

function measureBlockSegmentsInCanvas(
  captureEl: HTMLElement,
  blocks: readonly HTMLElement[],
  scale: number,
  canvasHeight: number,
): CanvasSegment[] {
  const rootTop = captureEl.getBoundingClientRect().top
  return blocks
    .map((b) => {
      const r = b.getBoundingClientRect()
      const top = Math.max(0, Math.floor((r.top - rootTop) * scale))
      const bottom = Math.min(canvasHeight, Math.ceil((r.bottom - rootTop) * scale))
      return { top, bottom }
    })
    .filter((s) => s.bottom > s.top)
}

/**
 * 依區塊邊界分頁：同一條放不下時整條跳下一頁，禁止從區塊中間切片。
 */
function packBlockSegmentsIntoPages(
  segs: readonly CanvasSegment[],
  pageHeightPx: number,
): { start: number; end: number }[] {
  if (segs.length === 0) return []
  if (pageHeightPx < 1) return []

  const pages: { start: number; end: number }[] = []
  let pageStart = segs[0]!.top
  let pageEnd = segs[0]!.bottom

  for (let i = 1; i < segs.length; i++) {
    const s = segs[i]!
    const blockH = s.bottom - s.top

    if (blockH > pageHeightPx) {
      if (pageEnd > pageStart) {
        pages.push({ start: pageStart, end: pageEnd })
      }
      pages.push({ start: s.top, end: s.bottom })
      pageStart = s.bottom
      pageEnd = s.bottom
      continue
    }

    if (s.bottom - pageStart > pageHeightPx) {
      pages.push({ start: pageStart, end: pageEnd })
      pageStart = s.top
      pageEnd = s.bottom
    } else {
      pageEnd = s.bottom
    }
  }

  if (pageEnd > pageStart) {
    pages.push({ start: pageStart, end: pageEnd })
  }

  return pages
}

/**
 * 區塊分頁：整份以「同一比例」擷取一次，再依 `[data-pdf-block]` 分頁。
 * @returns 本段新增的 PDF 頁數
 */
async function appendBlockPagedPdf(
  pdf: jsPDF,
  captureEl: HTMLElement,
  opts?: {
    /** 第一片內容前先 addPage（例如封面已佔第 1 頁） */
    addPageBeforeFirst?: boolean
    pageNumberStart?: number
    footerReserveMm?: number
  },
): Promise<number> {
  const blocks = [...captureEl.querySelectorAll<HTMLElement>('[data-pdf-block]')]
  const [{ default: html2canvas }] = await Promise.all([import('html2canvas')])

  const { innerW, innerH } = innerPrintableMm(pdf, PDF_MARGIN_MM)
  const footerMm = opts?.footerReserveMm ?? 0
  const contentInnerH = Math.max(1, innerH - footerMm)

  await waitForCaptureAssets(captureEl)
  const canvas = await html2canvas(captureEl, {
    ...buildHtml2CanvasOpts(captureEl),
    scale: DEBT_PDF_SCALE,
  })

  const cw = canvas.width
  const ch = canvas.height
  const mmPerPx = innerW / cw
  const pageHeightPx = Math.max(
    1,
    Math.floor(contentInnerH / mmPerPx) - BLOCK_PAGE_SLICE_SLACK_PX,
  )

  const segs = measureBlockSegmentsInCanvas(captureEl, blocks, DEBT_PDF_SCALE, ch)
  const pages =
    segs.length > 0 ? packBlockSegmentsIntoPages(segs, pageHeightPx) : [{ start: 0, end: ch }]

  const slice = document.createElement('canvas')
  slice.width = cw
  const sctx = slice.getContext('2d')
  if (!sctx) return 0

  let pageNum = opts?.pageNumberStart != null ? opts.pageNumberStart - 1 : null

  for (let i = 0; i < pages.length; i++) {
    if (i > 0 || opts?.addPageBeforeFirst) {
      pdf.addPage()
    }

    const { start, end } = pages[i]!
    const h = Math.max(1, end - start)
    slice.height = h
    sctx.fillStyle = '#ffffff'
    sctx.fillRect(0, 0, cw, h)
    sctx.drawImage(canvas, 0, start, cw, h, 0, 0, cw, h)
    const imgData = slice.toDataURL(`image/${PDF_IMAGE_TYPE}`, PDF_IMAGE_QUALITY)

    const drawW = innerW
    const drawH = h * mmPerPx
    pdf.addImage(imgData, JPEG_FMT, PDF_MARGIN_MM[3], PDF_MARGIN_MM[0], drawW, drawH)

    if (pageNum != null) {
      pageNum += 1
      const ph = pdf.internal.pageSize.getHeight()
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      pdf.setTextColor(51, 51, 51)
      pdf.text(`第 ${pageNum} 頁`, ph / 2, ph - PDF_MARGIN_MM[2], { align: 'center' })
    }
  }

  return pages.length
}

async function buildBlockPagedPdfBlob(rootWrapper: HTMLElement, rootClass: string): Promise<Blob> {
  const root = rootWrapper.querySelector<HTMLElement>(`.${rootClass}`) ?? rootWrapper
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  await appendBlockPagedPdf(pdf, root)
  await addPdfPageWatermark(pdf)
  return pdf.output('blob')
}

/**
 * 債務確認書：整份以「同一比例」擷取一次（各頁字級一致），再依 `[data-pdf-block]`
 * 區塊邊界分頁——區塊放不下就整塊跳下一頁（不從中間切斷）。
 */
export async function buildDebtConfirmationPdfBlob(
  rootWrapper: HTMLElement,
  attachments: readonly DebtConfirmationAttachmentFile[] = [],
): Promise<Blob> {
  const mainBlob = await buildBlockPagedPdfBlob(rootWrapper, 'debtConfirmationPdfRoot')
  return appendDebtConfirmationAttachmentsToPdf(mainBlob, attachments)
}

export async function buildEmploymentCertificatePdfBlob(rootWrapper: HTMLElement): Promise<Blob> {
  return buildBlockPagedPdfBlob(rootWrapper, 'employmentCertPdfRoot')
}

export async function buildIncomeCertificatePdfBlob(rootWrapper: HTMLElement): Promise<Blob> {
  return buildBlockPagedPdfBlob(rootWrapper, 'incomeCertPdfRoot')
}

async function renderContractPdfFromDom(captureRoot: HTMLElement): Promise<Blob> {
  const cover = captureRoot.querySelector<HTMLElement>('[data-pdf-workspace="cover"]')
  const body = captureRoot.querySelector<HTMLElement>('[data-pdf-workspace="body"]')

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const [{ default: html2canvas }] = await Promise.all([import('html2canvas')])
  const { innerW, innerH } = innerPrintableMm(pdf, PDF_MARGIN_MM)

  if (cover) {
    await waitForCaptureAssets(cover)
    const coverCanvas = await html2canvas(cover, {
      ...buildHtml2CanvasOpts(cover),
      scale: DEBT_PDF_SCALE,
    })
    const k = Math.min(innerW / coverCanvas.width, innerH / coverCanvas.height)
    const drawW = coverCanvas.width * k
    const drawH = coverCanvas.height * k
    const x = PDF_MARGIN_MM[3] + (innerW - drawW) / 2
    const y = PDF_MARGIN_MM[0] + (innerH - drawH) / 2
    pdf.addImage(
      coverCanvas.toDataURL(`image/${PDF_IMAGE_TYPE}`, PDF_IMAGE_QUALITY),
      JPEG_FMT,
      x,
      y,
      drawW,
      drawH,
    )
  }

  if (body) {
    await appendBlockPagedPdf(pdf, body, {
      addPageBeforeFirst: Boolean(cover),
      pageNumberStart: 1,
      footerReserveMm: 10,
    })
  } else if (!cover) {
    await appendBlockPagedPdf(pdf, captureRoot, { pageNumberStart: 1, footerReserveMm: 10 })
  }

  await addPdfPageWatermark(pdf)
  return pdf.output('blob')
}

export async function buildContractPdfBlob(rootWrapper: HTMLElement): Promise<Blob> {
  const captureRoot = resolvePdfCaptureRoot(rootWrapper)
  const { clone, cleanup } = await mountPdfCaptureClone(captureRoot)
  try {
    return await renderContractPdfFromDom(clone)
  } finally {
    cleanup()
  }
}

export async function downloadContractPdf(root: HTMLElement, filename: string): Promise<void> {
  const blob = await buildContractPdfBlob(root)
  downloadBlob(blob, filename)
}

export async function downloadDebtConfirmationPdf(
  root: HTMLElement,
  filename: string,
  attachments: readonly DebtConfirmationAttachmentFile[] = [],
): Promise<void> {
  const blob = await buildDebtConfirmationPdfBlob(root, attachments)
  downloadBlob(blob, filename)
}

export async function downloadEmploymentCertificatePdf(root: HTMLElement, filename: string): Promise<void> {
  const blob = await buildEmploymentCertificatePdfBlob(root)
  downloadBlob(blob, filename)
}

export async function downloadIncomeCertificatePdf(root: HTMLElement, filename: string): Promise<void> {
  const blob = await buildIncomeCertificatePdfBlob(root)
  downloadBlob(blob, filename)
}
