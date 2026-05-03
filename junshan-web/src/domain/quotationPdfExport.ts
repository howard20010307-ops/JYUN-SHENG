/**
 * 依 data-pdf-workspace 分段輸出 PDF（html2canvas + jsPDF）：
 * 僅主表 (lines) 依 tbody 列拆頁；其餘工作區整段；全域固定 mm／canvas-px 比例 k。
 * 報價單 (quotationPdfRoot) 與工作明細／業主明細 (ownerScopePdfRoot) 共用此流程。
 */
import { jsPDF } from 'jspdf'

const MARGIN = [6, 8, 10, 8] as [number, number, number, number]
const JPEG_Q = 0.93
const H2C_SCALE = 2

export type PdfCaptureRootClass = 'quotationPdfRoot' | 'ownerScopePdfRoot'

export type WorkspacePdfSpec = {
  captureRootClass: PdfCaptureRootClass
  /** 主表之前的 workspace key（依序） */
  beforeTableWorkspaceKeys: readonly string[]
  /** 主表之後的 workspace key（依序） */
  afterTableWorkspaceKeys: readonly string[]
}

const QUOTATION_WORKSPACE_SPEC: WorkspacePdfSpec = {
  captureRootClass: 'quotationPdfRoot',
  beforeTableWorkspaceKeys: ['head', 'case'],
  afterTableWorkspaceKeys: ['vat', 'payterms', 'clauses', 'sign'],
}

const OWNER_SCOPE_WORKSPACE_SPEC: WorkspacePdfSpec = {
  captureRootClass: 'ownerScopePdfRoot',
  beforeTableWorkspaceKeys: ['head'],
  afterTableWorkspaceKeys: ['drawing', 'clauses', 'sign'],
}

function waitPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

function innerBox(pdf: jsPDF) {
  const pw = pdf.internal.pageSize.getWidth()
  const ph = pdf.internal.pageSize.getHeight()
  return {
    innerW: pw - MARGIN[1] - MARGIN[3],
    innerH: ph - MARGIN[0] - MARGIN[2],
  }
}

/**
 * 分段 clone 後不在原根節點底下時，字色會繼承 :root 主題淺字；包一層與版面根相同的字色／字族。
 */
function wrapPdfFragmentForCapture(fragment: HTMLElement, captureRootClass: PdfCaptureRootClass): HTMLElement {
  const shell = document.createElement('div')
  shell.className = captureRootClass
  shell.setAttribute('data-pdf-sheet-capture-wrap', '1')
  shell.style.cssText = [
    'box-sizing:border-box',
    'width:100%',
    'margin:0',
    'padding:0',
    'font-family:"Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif',
    'font-size:11px',
    'line-height:1.45',
    'color:#1a1a1a',
    'background:#fff',
  ].join(';')
  shell.appendChild(fragment)
  return shell
}

async function html2c(el: HTMLElement, refWidthCssPx: number): Promise<HTMLCanvasElement> {
  const [{ default: html2canvas }] = await Promise.all([import('html2canvas')])
  const h = Math.max(1, Math.ceil(el.scrollHeight))
  const w = Math.max(1, Math.ceil(refWidthCssPx))
  return html2canvas(el, {
    scale: H2C_SCALE,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    width: w,
    height: h,
    windowWidth: w,
    windowHeight: h,
    scrollX: 0,
    scrollY: 0,
  })
}

function collectWorkspaceBlocks(root: HTMLElement, keys: readonly string[]): HTMLElement[] {
  const out: HTMLElement[] = []
  for (const key of keys) {
    const el = root.querySelector(`[data-pdf-workspace="${key}"]`) as HTMLElement | null
    if (el) out.push(el)
  }
  return out
}

/** 回傳 slice 的 offsetHeight（CSS px），不含 scale */
function measureTableSliceCssPx(
  host: HTMLElement,
  tableSource: HTMLTableElement,
  rowStart: number,
  rowEndExclusive: number,
  includeFooter: boolean,
  captureRootClass: PdfCaptureRootClass,
): number {
  const tbl = tableSource.cloneNode(true) as HTMLTableElement
  const tb = tbl.querySelector('tbody')
  const tf0 = tbl.querySelector('tfoot')
  if (tf0) tf0.remove()
  if (!tb) return 0
  const origRows = tableSource.querySelectorAll('tbody tr')
  while (tb.firstChild) tb.removeChild(tb.firstChild)
  for (let i = rowStart; i < rowEndExclusive && i < origRows.length; i++) {
    tb.appendChild(origRows[i]!.cloneNode(true))
  }
  if (includeFooter) {
    const srcFoot = tableSource.querySelector('tfoot')
    if (srcFoot) tbl.appendChild(srcFoot.cloneNode(true))
  }
  host.innerHTML = ''
  const wrap = wrapPdfFragmentForCapture(tbl, captureRootClass)
  host.appendChild(wrap)
  return wrap.offsetHeight
}

export async function exportSheetPdfByWorkspaces(
  root: HTMLElement,
  filename: string,
  spec: WorkspacePdfSpec,
): Promise<void> {
  await waitPaint()

  const refW = Math.max(1, Math.ceil(root.getBoundingClientRect().width || root.offsetWidth))
  const { captureRootClass } = spec

  const host = document.createElement('div')
  host.setAttribute('data-pdf-measure-host', '1')
  host.style.cssText = [
    'position:fixed',
    'left:-14000px',
    'top:0',
    `width:${refW}px`,
    'box-sizing:border-box',
    'background:#fff',
    'padding:0',
    'margin:0',
  ].join(';')
  document.body.appendChild(host)

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const { innerW, innerH } = innerBox(pdf)

  const nonTableForK: HTMLElement[] = [
    ...collectWorkspaceBlocks(root, spec.beforeTableWorkspaceKeys),
    ...collectWorkspaceBlocks(root, spec.afterTableWorkspaceKeys),
  ]

  let k = Number.POSITIVE_INFINITY
  try {
    for (const el of nonTableForK) {
      host.innerHTML = ''
      host.appendChild(wrapPdfFragmentForCapture(el.cloneNode(true) as HTMLElement, captureRootClass))
      const c = await html2c(host.firstElementChild as HTMLElement, refW)
      const kW = innerW / c.width
      const kH = innerH / c.height
      k = Math.min(k, kW, kH)
    }
    if (!Number.isFinite(k) || k === Number.POSITIVE_INFINITY || k <= 0) {
      k = innerW / (refW * H2C_SCALE)
    }

    let yMm = MARGIN[0]
    const newPage = () => {
      pdf.addPage()
      yMm = MARGIN[0]
    }

    const placeCanvas = (canvas: HTMLCanvasElement) => {
      const drawW = canvas.width * k
      const drawH = canvas.height * k
      if (yMm + drawH > MARGIN[0] + innerH + 0.02) {
        newPage()
      }
      const x = MARGIN[1] + (innerW - drawW) / 2
      pdf.addImage(canvas.toDataURL('image/jpeg', JPEG_Q), 'JPEG', x, yMm, drawW, drawH)
      yMm += drawH
    }

    const placeClone = async (el: HTMLElement) => {
      host.innerHTML = ''
      const wrap = wrapPdfFragmentForCapture(el.cloneNode(true) as HTMLElement, captureRootClass)
      host.appendChild(wrap)
      const canvas = await html2c(wrap, refW)
      host.innerHTML = ''
      placeCanvas(canvas)
    }

    for (const el of collectWorkspaceBlocks(root, spec.beforeTableWorkspaceKeys)) {
      await placeClone(el)
    }

    const tableEl = root.querySelector('[data-pdf-workspace="lines"]') as HTMLTableElement | null
    if (tableEl) {
      const tbody = tableEl.querySelector('tbody')
      const rows = tbody ? Array.from(tbody.querySelectorAll('tr')) : []
      const n = rows.length

      if (n === 0) {
        await placeClone(tableEl)
      } else {
        let start = 0
        while (start < n) {
          if (yMm >= MARGIN[0] + innerH - 0.02) {
            newPage()
          }
          const availMm = MARGIN[0] + innerH - yMm
          let lo = start + 1
          let hi = n
          let best = start
          while (lo <= hi) {
            const mid = (lo + hi) >> 1
            const hCss = measureTableSliceCssPx(host, tableEl, start, mid, mid >= n, captureRootClass)
            const hCanvas = Math.ceil(hCss * H2C_SCALE)
            if (hCanvas * k <= availMm + 0.02) {
              best = mid
              lo = mid + 1
            } else {
              hi = mid - 1
            }
          }
          if (best <= start) {
            newPage()
            best = start + 1
            const hCss1 = measureTableSliceCssPx(host, tableEl, start, best, best >= n, captureRootClass)
            let hCanvas1 = Math.ceil(hCss1 * H2C_SCALE)
            while (hCanvas1 * k > innerH + 0.02 && k > 1e-6) {
              k = (innerH / hCanvas1) * 0.998
            }
          }
          host.innerHTML = ''
          const tbl = tableEl.cloneNode(true) as HTMLTableElement
          const tb = tbl.querySelector('tbody')!
          const tf = tbl.querySelector('tfoot')
          if (tf) tf.remove()
          while (tb.firstChild) tb.removeChild(tb.firstChild)
          for (let i = start; i < best; i++) tb.appendChild(rows[i]!.cloneNode(true))
          if (best >= n) {
            const srcFoot = tableEl.querySelector('tfoot')
            if (srcFoot) tbl.appendChild(srcFoot.cloneNode(true))
          }
          host.appendChild(wrapPdfFragmentForCapture(tbl, captureRootClass))
          placeCanvas(await html2c(host.firstElementChild as HTMLElement, refW))
          host.innerHTML = ''
          start = best
        }
      }
    }

    for (const el of collectWorkspaceBlocks(root, spec.afterTableWorkspaceKeys)) {
      await placeClone(el)
    }

    pdf.save(filename)
  } finally {
    host.remove()
  }
}

export async function exportQuotationPdfByWorkspaces(root: HTMLElement, filename: string): Promise<void> {
  return exportSheetPdfByWorkspaces(root, filename, QUOTATION_WORKSPACE_SPEC)
}

export async function exportOwnerScopePdfByWorkspaces(root: HTMLElement, filename: string): Promise<void> {
  return exportSheetPdfByWorkspaces(root, filename, OWNER_SCOPE_WORKSPACE_SPEC)
}
