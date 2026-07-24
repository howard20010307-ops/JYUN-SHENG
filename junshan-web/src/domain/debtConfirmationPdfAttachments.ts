import { PageSizes, PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { DebtConfirmationAttachmentFile } from './debtConfirmationWorkspace'

const A4 = PageSizes.A4
const PAGE_MARGIN = 40

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new Error('附件資料格式無效')
  const b64 = dataUrl.slice(comma + 1)
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function isPdfAttachment(att: DebtConfirmationAttachmentFile): boolean {
  return (
    att.mimeType === 'application/pdf' ||
    att.fileName.toLowerCase().endsWith('.pdf')
  )
}

function isPngAttachment(att: DebtConfirmationAttachmentFile): boolean {
  return att.mimeType === 'image/png' || att.fileName.toLowerCase().endsWith('.png')
}

async function drawImageAttachmentPage(
  pdfDoc: PDFDocument,
  att: DebtConfirmationAttachmentFile,
  bytes: Uint8Array,
): Promise<void> {
  const page = pdfDoc.addPage(A4)
  const pageW = page.getWidth()
  const pageH = page.getHeight()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const titleY = pageH - PAGE_MARGIN
  page.drawText(att.fileName, {
    x: PAGE_MARGIN,
    y: titleY,
    size: 10,
    font,
    color: rgb(0.15, 0.15, 0.15),
  })

  const image = isPngAttachment(att)
    ? await pdfDoc.embedPng(bytes)
    : await pdfDoc.embedJpg(bytes)
  const maxW = pageW - PAGE_MARGIN * 2
  const maxH = titleY - PAGE_MARGIN * 2
  const scale = Math.min(maxW / image.width, maxH / image.height, 1)
  const drawW = image.width * scale
  const drawH = image.height * scale
  const x = PAGE_MARGIN + (maxW - drawW) / 2
  const y = PAGE_MARGIN + (maxH - drawH) / 2
  page.drawImage(image, { x, y, width: drawW, height: drawH })
}

async function drawUnsupportedAttachmentPage(
  pdfDoc: PDFDocument,
  att: DebtConfirmationAttachmentFile,
): Promise<void> {
  const page = pdfDoc.addPage(A4)
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  page.drawText(`Attachment: ${att.fileName}`, {
    x: PAGE_MARGIN,
    y: page.getHeight() - PAGE_MARGIN,
    size: 12,
    font,
  })
  page.drawText('(Preview not embedded; see original file.)', {
    x: PAGE_MARGIN,
    y: page.getHeight() - PAGE_MARGIN - 18,
    size: 10,
    font,
    color: rgb(0.35, 0.35, 0.35),
  })
}

/** 將上傳附件接在債務確認書 PDF 最後 */
export async function appendDebtConfirmationAttachmentsToPdf(
  mainPdfBlob: Blob,
  attachments: readonly DebtConfirmationAttachmentFile[],
): Promise<Blob> {
  if (attachments.length === 0) return mainPdfBlob

  const mainBytes = new Uint8Array(await mainPdfBlob.arrayBuffer())
  const pdfDoc = await PDFDocument.load(mainBytes)

  for (const att of attachments) {
    const bytes = dataUrlToBytes(att.dataUrl)
    if (isPdfAttachment(att)) {
      const src = await PDFDocument.load(bytes)
      const copied = await pdfDoc.copyPages(src, src.getPageIndices())
      for (const p of copied) pdfDoc.addPage(p)
      continue
    }
    if (
      att.mimeType === 'image/jpeg' ||
      att.mimeType === 'image/jpg' ||
      att.mimeType === 'image/png' ||
      /\.(jpe?g|png)$/i.test(att.fileName)
    ) {
      await drawImageAttachmentPage(pdfDoc, att, bytes)
      continue
    }
    await drawUnsupportedAttachmentPage(pdfDoc, att)
  }

  const out = await pdfDoc.save()
  return new Blob([out as BlobPart], { type: 'application/pdf' })
}
