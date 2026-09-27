import { PDF_PAGE_WATERMARK_SRC } from '../domain/pdfPageWatermark'

/** 預覽用全幅浮水印；匯出時由 jsPDF 逐頁覆蓋，html2canvas 會略過此節點以免重複。 */
export function PdfPageWatermark() {
  return (
    <img
      src={PDF_PAGE_WATERMARK_SRC}
      alt=""
      aria-hidden="true"
      data-pdf-page-watermark="1"
      style={{
        position: 'absolute',
        inset: '5% 4%',
        width: '92%',
        height: '90%',
        objectFit: 'contain',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    />
  )
}
