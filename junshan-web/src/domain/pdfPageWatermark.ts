import type { jsPDF } from 'jspdf'
import type { PDFDocument } from 'pdf-lib'

/** `public/owner-scope-page-watermark.png`：透明底公司圖樣，置中覆蓋每一頁。 */
export const PDF_PAGE_WATERMARK_SRC = `${import.meta.env.BASE_URL}owner-scope-page-watermark.png`
export const PDF_PAGE_WATERMARK_ATTR = 'data-pdf-page-watermark'

export function isPdfPageWatermarkElement(el: Element): boolean {
  return el.getAttribute(PDF_PAGE_WATERMARK_ATTR) === '1'
}

async function loadPdfWatermarkImage(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`無法載入 PDF 浮水印：${PDF_PAGE_WATERMARK_SRC}`))
    image.src = PDF_PAGE_WATERMARK_SRC
  })
}

function watermarkDrawBox(
  pageW: number,
  pageH: number,
  imageW: number,
  imageH: number,
): { x: number; y: number; drawW: number; drawH: number } {
  const maxW = pageW * 0.9
  const maxH = pageH * 0.9
  const scale = Math.min(maxW / imageW, maxH / imageH)
  const drawW = imageW * scale
  const drawH = imageH * scale
  return {
    x: (pageW - drawW) / 2,
    y: (pageH - drawH) / 2,
    drawW,
    drawH,
  }
}

/** 透明底圖片，置中覆蓋在輸出 PDF 的每一頁。 */
export async function addPdfPageWatermark(pdf: jsPDF): Promise<void> {
  const image = await loadPdfWatermarkImage()
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const { x, y, drawW, drawH } = watermarkDrawBox(pageW, pageH, image.naturalWidth, image.naturalHeight)

  for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
    pdf.setPage(page)
    pdf.addImage(image, 'PNG', x, y, drawW, drawH, undefined, 'FAST')
  }
}

/** 供 pdf-lib 合併後的附件頁使用；`fromPageIndex` 起算（0-based）。 */
export async function stampPdfLibPagesWithWatermark(
  pdfDoc: PDFDocument,
  fromPageIndex = 0,
): Promise<void> {
  const res = await fetch(PDF_PAGE_WATERMARK_SRC)
  if (!res.ok) throw new Error(`無法載入 PDF 浮水印：${PDF_PAGE_WATERMARK_SRC}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  const image = await pdfDoc.embedPng(bytes)
  const pages = pdfDoc.getPages()
  for (let i = fromPageIndex; i < pages.length; i++) {
    const page = pages[i]!
    const { x, y, drawW, drawH } = watermarkDrawBox(page.getWidth(), page.getHeight(), image.width, image.height)
    page.drawImage(image, { x, y, width: drawW, height: drawH })
  }
}
