/** 業主明細 PDF：檔名與下載（html2canvas + jsPDF；可印區內等比置中） */

import { jsPDF } from 'jspdf'
import { exportOwnerScopePdfByWorkspaces, exportQuotationPdfByWorkspaces } from './quotationPdfExport'

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
  const inner = wrapper.querySelector<HTMLElement>('.quotationPdfRoot, .ownerScopePdfRoot')
  return inner ?? wrapper
}

/** 工作區分段 PDF：視區內直接截；否則複製到全白 overlay 再截（避免預覽灰底影響） */
async function runWorkspacePdfExport(
  captureRoot: HTMLElement,
  filename: string,
  exportFn: (root: HTMLElement, name: string) => Promise<void>,
): Promise<void> {
  if (pdfSourceIntersectsViewport(captureRoot)) {
    await waitNextPaint()
    await exportFn(captureRoot, filename)
    return
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
    await exportFn(clone, filename)
  } finally {
    shell.remove()
  }
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

async function captureToPdf(captureEl: HTMLElement, filename: string): Promise<void> {
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

  pdf.save(filename)
}

export async function downloadOwnerScopePdf(element: HTMLElement, filename: string): Promise<void> {
  const captureRoot = resolvePdfCaptureRoot(element)

  if (captureRoot.classList.contains('quotationPdfRoot')) {
    await runWorkspacePdfExport(captureRoot, filename, exportQuotationPdfByWorkspaces)
    return
  }
  if (captureRoot.classList.contains('ownerScopePdfRoot')) {
    await runWorkspacePdfExport(captureRoot, filename, exportOwnerScopePdfByWorkspaces)
    return
  }

  if (pdfSourceIntersectsViewport(captureRoot)) {
    await waitNextPaint()
    await captureToPdf(captureRoot, filename)
    return
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
    await captureToPdf(clone, filename)
  } finally {
    shell.remove()
  }
}
