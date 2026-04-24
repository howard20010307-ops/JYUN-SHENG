/**
 * 若尚未執行 `npm install`（沒有 `node_modules/xlsx`），可避免 TS2307。
 * 已安裝時 TypeScript 會與套件型別合併；`read` 請傳 `Uint8Array` 或 `ArrayBuffer`。
 */
declare module 'xlsx' {
  export interface WorkBook {
    SheetNames: string[]
    Sheets: Record<string, WorkSheet>
  }
  export interface WorkSheet {
    [key: string]: unknown
  }
  export const utils: {
    sheet_to_json<T>(sheet: WorkSheet, opts?: { header?: number; defval?: unknown }): T
    encode_cell(ref: { r: number; c: number }): string
  }
  export const SSF: {
    parse_date_code?: (v: number) => { y: number; m: number; d: number }
  }
  export function read(
    data: Uint8Array | ArrayBuffer,
    opts?: { type?: 'array'; cellDates?: boolean; cellStyles?: boolean },
  ): WorkBook
}
