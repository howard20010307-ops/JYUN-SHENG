/** 業主明細 PDF：檔名與 html2pdf 下載（動態載入，避免首屏體積） */

export function buildOwnerScopePdfFilename(siteName: string): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const safe = siteName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || '未命名案場'
  return `放樣工程(內外業)承攬供述明細_${safe}_${y}${m}${day}.pdf`
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

const PDF_HTML2PDF_OPTIONS = {
  margin: [6, 8, 10, 8] as [number, number, number, number],
  image: { type: 'jpeg' as const, quality: 0.93 },
  html2canvas: {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  },
  jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
}

/**
 * 優先截取「已在畫面上可見」的節點（例如預覽視窗內），避免閃爍。
 * 若節點不在 viewport（離屏備援），才複製到 viewport 內再截。
 */
export async function downloadOwnerScopePdf(element: HTMLElement, filename: string): Promise<void> {
  const html2pdf = (await import('html2pdf.js')).default

  if (pdfSourceIntersectsViewport(element)) {
    await waitNextPaint()
    await html2pdf()
      .set({ ...PDF_HTML2PDF_OPTIONS, filename })
      .from(element)
      .save()
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
  ].join(';')

  const clone = element.cloneNode(true) as HTMLElement
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
    await html2pdf()
      .set({ ...PDF_HTML2PDF_OPTIONS, filename })
      .from(clone)
      .save()
  } finally {
    shell.remove()
  }
}
