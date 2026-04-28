import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  buildQuoteRowsFromLayout,
  computeFloorPricingTable,
  computeItemPricingTable,
  computeQuote,
  defaultQuoteRows,
  exampleQuoteLayout,
  exampleSite,
  mergeQuoteRowsPreservingValues,
  m2ToPing,
  syncFloorsWithLayout,
  type QuoteRow,
  type QuoteSite,
} from '../domain/quoteEngine'
import { EXCEL_STAGE } from '../domain/quoteExcelCanonical'
import { QUOTE_TABLE_COLUMNS } from '../domain/quoteExcelColumns'
import {
  floorPricingFloorLabelBreakdown,
  floorPricingModuleBreakdown,
  floorPricingNumericBreakdown,
  itemPricingBreakdown,
} from '../domain/quotePricingTooltipBreakdown'
import { PayrollSummaryPopoverCell } from './PayrollSummaryPopoverCell'

type Props = {
  site: QuoteSite
  setSite: (s: QuoteSite) => void
  rows: QuoteRow[]
  setRows: (r: QuoteRow[]) => void
}

/** 受控 number 清空會立刻被寫回 0；改為文字輸入，輸入中可空，blur 再定稿 */
function useLooseNumericDrafts() {
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  function bindDecimal(key: string, value: number, commit: (n: number) => void, className?: string) {
    return {
      type: 'text' as const,
      inputMode: 'decimal' as const,
      className,
      value: drafts[key] !== undefined ? drafts[key]! : String(value),
      onFocus() {
        setDrafts((d) => {
          if (d[key] !== undefined) return d
          if (value !== 0) return d
          return { ...d, [key]: '' }
        })
      },
      onChange(e: React.ChangeEvent<HTMLInputElement>) {
        const v = e.target.value
        setDrafts((d) => ({ ...d, [key]: v }))
        if (v === '' || v === '-' || v === '.' || v === '-.') return
        const n = parseFloat(v)
        if (Number.isFinite(n)) commit(n)
      },
      onBlur() {
        setDrafts((d) => {
          const raw = d[key]
          const n = raw === undefined || raw === '' || raw === '-' ? 0 : parseFloat(raw)
          commit(Number.isFinite(n) ? n : 0)
          const next = { ...d }
          delete next[key]
          return next
        })
      },
    }
  }

  function bindInt(key: string, value: number, commit: (n: number) => void, min: number, max: number) {
    return {
      type: 'text' as const,
      inputMode: 'numeric' as const,
      value: drafts[key] !== undefined ? drafts[key]! : String(value),
      onFocus() {
        setDrafts((d) => {
          if (d[key] !== undefined) return d
          if (value !== 0) return d
          return { ...d, [key]: '' }
        })
      },
      onChange(e: React.ChangeEvent<HTMLInputElement>) {
        const v = e.target.value.replace(/\D/g, '')
        setDrafts((d) => ({ ...d, [key]: v }))
        if (v === '') return
        let n = parseInt(v, 10)
        if (!Number.isFinite(n)) return
        n = Math.max(min, Math.min(max, n))
        commit(n)
      },
      onBlur() {
        setDrafts((d) => {
          const raw = d[key]
          let n = raw === '' || raw === undefined ? 0 : parseInt(raw, 10)
          if (!Number.isFinite(n)) n = 0
          n = Math.max(min, Math.min(max, n))
          commit(n)
          const next = { ...d }
          delete next[key]
          return next
        })
      },
    }
  }

  return { bindDecimal, bindInt }
}

const QUOTE_DATA_COLS = QUOTE_TABLE_COLUMNS.length + 1

/**
 * 手動列（id 為 r＋數字）才顯示 A 欄編輯器。
 * 若與上一列同區（工程模組），不顯示 A 欄——區名已由分組標題呈現，細項從屬該模組。
 */
function showQuoteStageCellEditor(
  r: QuoteRow,
  rowIndex: number,
  allRows: readonly QuoteRow[],
): boolean {
  if (!/^r\d+$/.test(r.id)) return false
  if (rowIndex > 0 && allRows[rowIndex - 1]?.zone === r.zone) return false
  return true
}

function uniqueZonesInOrder(rows: readonly QuoteRow[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of rows) {
    if (seen.has(r.zone)) continue
    seen.add(r.zone)
    out.push(r.zone)
  }
  return out
}

function lastIndexForZone(rows: readonly QuoteRow[], zone: string): number {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i]!.zone === zone) return i
  }
  return -1
}

export function QuotePanel({ site, setSite, rows, setRows }: Props) {
  const { bindDecimal, bindInt } = useLooseNumericDrafts()
  const result = useMemo(() => computeQuote(site, rows), [site, rows])
  const floorPricingRows = useMemo(() => computeFloorPricingTable(site, rows), [site, rows])
  const itemPricingRows = useMemo(() => computeItemPricingTable(site, rows), [site, rows])
  const zoneOptions = useMemo(() => uniqueZonesInOrder(rows), [rows])

  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddZone, setQuickAddZone] = useState('')
  const [quickItemName, setQuickItemName] = useState('新細項')

  const [addModuleOpen, setAddModuleOpen] = useState(false)
  const [newModuleNameDraft, setNewModuleNameDraft] = useState('')

  const [renameZoneOpen, setRenameZoneOpen] = useState<string | null>(null)
  const [renameZoneDraft, setRenameZoneDraft] = useState('')

  /** 成本估算：捲動區塊目前所屬工程模組（表頭第二列顯示） */
  const [activeCostZone, setActiveCostZone] = useState('')

  /** 成本估算：表頭高度 → CSS 變數 */
  const quoteCostScrollRef = useRef<HTMLDivElement>(null)

  /** 放樣估價內工作表（對齊薪水「月表」分頁用法） */
  const [quoteSheet, setQuoteSheet] = useState<
    'setup' | 'cost' | 'floorPricing' | 'itemPricing' | 'summary'
  >('setup')

  const syncActiveCostZoneFromScroll = useCallback(() => {
    const root = quoteCostScrollRef.current
    if (!root || quoteSheet !== 'cost') return
    const heads = [...root.querySelectorAll<HTMLTableRowElement>('tbody tr.quoteZoneSep[data-zone]')]
    if (heads.length === 0) {
      setActiveCostZone((z) => (zoneOptions[0] ?? z))
      return
    }
    const row1 = root.querySelector('table.quoteCostTableExcel thead tr:first-child')
    const lineY = row1
      ? root.getBoundingClientRect().top + row1.getBoundingClientRect().height
      : root.getBoundingClientRect().top + 48
    let chosen = ''
    for (const tr of heads) {
      const r = tr.getBoundingClientRect()
      if (r.top <= lineY + 2) chosen = tr.dataset.zone ?? ''
    }
    const fallback = heads[0]?.dataset.zone ?? zoneOptions[0] ?? ''
    const next = chosen || fallback
    setActiveCostZone((prev) => (prev === next ? prev : next))
  }, [quoteSheet, zoneOptions])

  useLayoutEffect(() => {
    if (quoteSheet !== 'cost') return
    const root = quoteCostScrollRef.current
    if (!root) return
    const apply = () => {
      const row1 = root.querySelector('table.quoteCostTableExcel thead tr:first-child')
      if (!row1) {
        root.style.removeProperty('--quote-cost-head-row1-h')
        return
      }
      const h1 = Math.ceil(row1.getBoundingClientRect().height)
      root.style.setProperty('--quote-cost-head-row1-h', `${h1}px`)
    }
    const run = () => {
      apply()
      syncActiveCostZoneFromScroll()
    }
    run()
    const ro = new ResizeObserver(() => run())
    ro.observe(root)
    const theadEl = root.querySelector('table.quoteCostTableExcel thead')
    if (theadEl) ro.observe(theadEl)
    window.addEventListener('resize', run)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', run)
    }
  }, [quoteSheet, rows.length, result.computed.length, syncActiveCostZoneFromScroll])

  useEffect(() => {
    if (quoteSheet !== 'cost') return
    const root = quoteCostScrollRef.current
    if (!root) return
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        syncActiveCostZoneFromScroll()
      })
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    syncActiveCostZoneFromScroll()
    return () => root.removeEventListener('scroll', onScroll)
  }, [quoteSheet, syncActiveCostZoneFromScroll, result.computed.length, rows])

  useLayoutEffect(() => {
    if (quoteSheet !== 'cost' || zoneOptions.length === 0) return
    setActiveCostZone((z) => (z && zoneOptions.includes(z) ? z : zoneOptions[0]!))
  }, [quoteSheet, zoneOptions])

  useEffect(() => {
    if (!quickAddOpen && !addModuleOpen && renameZoneOpen === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setQuickAddOpen(false)
        setAddModuleOpen(false)
        setRenameZoneOpen(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [quickAddOpen, addModuleOpen, renameZoneOpen])

  function updateFee<K extends keyof QuoteSite['fees']>(k: K, v: number) {
    setSite({
      ...site,
      fees: { ...site.fees, [k]: v },
    })
  }

  function updateFloor(i: number, patch: Partial<{ name: string; m2: number }>) {
    const floors = site.floors.map((f, j) => (j === i ? { ...f, ...patch } : f))
    setSite({ ...site, floors })
  }

  function addFloor() {
    setSite({
      ...site,
      floors: [...site.floors, { name: '新樓層', m2: 0 }],
    })
  }

  function removeFloor(i: number) {
    setSite({ ...site, floors: site.floors.filter((_, j) => j !== i) })
  }

  function updateRow(i: number, patch: Partial<QuoteRow>) {
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  const newManualRowBase = {
    sameFloors: 1,
    basePerFloor: 2,
    riskPct: 30,
    useTotalStation: false,
    useRotatingLaser: false,
    useLineLaser: false,
    miscPerFloor: 100,
  } as const

  /** 新增一個自訂工程模組：表尾一列、新區名，可再於其下用「快速新增」加細項 */
  function addEngineeringModule(zoneName: string) {
    const zone = zoneName.trim() || '新工程模組'
    setRows([
      ...rows,
      {
        id: `r${Date.now()}`,
        zone,
        item: '新細項',
        ...newManualRowBase,
      },
    ])
  }

  /** 在該列下方插入同區手動列；item 可選 */
  function addSubItemAfter(i: number, item: string = '新細項') {
    const base = rows[i]
    if (!base) return
    const label = item.trim() || '新細項'
    const newRow: QuoteRow = {
      id: `r${Date.now()}`,
      zone: base.zone,
      item: label,
      sameFloors: base.sameFloors,
      basePerFloor: base.basePerFloor,
      riskPct: base.riskPct,
      useTotalStation: base.useTotalStation,
      useRotatingLaser: base.useRotatingLaser,
      useLineLaser: base.useLineLaser,
      miscPerFloor: base.miscPerFloor,
    }
    setRows([...rows.slice(0, i + 1), newRow, ...rows.slice(i + 1)])
  }

  function addSubItemUnderZone(zone: string, item: string) {
    const i = lastIndexForZone(rows, zone)
    if (i < 0) return
    addSubItemAfter(i, item)
  }

  function openQuickAdd() {
    if (zoneOptions.length === 0) return
    setQuickAddZone(zoneOptions[0]!)
    setQuickItemName('新細項')
    setQuickAddOpen(true)
  }

  function submitQuickAdd() {
    const z = quickAddZone.trim()
    if (!z) return
    addSubItemUnderZone(z, quickItemName)
    setQuickAddOpen(false)
  }

  function openAddModule() {
    setNewModuleNameDraft('')
    setAddModuleOpen(true)
  }

  function submitAddModule() {
    const name = newModuleNameDraft.trim() || '新工程模組'
    addEngineeringModule(name)
    setAddModuleOpen(false)
  }

  /** 將目前表內該工程模組名稱一次改為新名稱（同區所有列） */
  function renameModuleEverywhere(from: string, to: string) {
    const next = to.trim()
    if (!next || next === from) return
    setRows(rows.map((row) => (row.zone === from ? { ...row, zone: next } : row)))
  }

  function openRenameZone(from: string) {
    setRenameZoneOpen(from)
    setRenameZoneDraft(from)
  }

  function submitRenameZone() {
    if (renameZoneOpen === null) return
    renameModuleEverywhere(renameZoneOpen, renameZoneDraft)
    setRenameZoneOpen(null)
  }

  function removeRow(i: number) {
    setRows(rows.filter((_, j) => j !== i))
  }

  function loadTemplate() {
    setSite(exampleSite())
    setRows(defaultQuoteRows())
  }

  function patchLayout(
    p: Partial<{
      basementFloors: number
      hasMezzanine: boolean
      typicalStartFloor: number
      typicalFloors: number
      rfCount: number
    }>,
  ) {
    const nextLayout = { ...site.layout, ...p }
    setSite({
      ...site,
      layout: nextLayout,
      floors: syncFloorsWithLayout(site.floors, nextLayout),
    })
    setRows(mergeQuoteRowsPreservingValues(rows, nextLayout))
  }

  function applyExcelSampleFloors() {
    const nextLayout = exampleQuoteLayout()
    setSite({
      ...site,
      layout: nextLayout,
      floors: syncFloorsWithLayout(site.floors, nextLayout),
    })
    setRows(mergeQuoteRowsPreservingValues(rows, nextLayout))
  }

  function applyLayoutToRows() {
    if (
      !window.confirm(
        '將依「專案樓層」重建成本估算列（區塊／欄 C 與《估價表》同一套）。目前表格會被覆寫。確定嗎？',
      )
    ) {
      return
    }
    const nextFloors = syncFloorsWithLayout(site.floors, site.layout)
    setSite({ ...site, floors: nextFloors })
    setRows(buildQuoteRowsFromLayout(site.layout))
  }

  return (
    <div className="panel">
      <div className="panelHead">
        <h2>放樣估價</h2>
        <button type="button" className="btn secondary" onClick={loadTemplate}>
          載入範例（估價結構）
        </button>
      </div>
      <p className="hint" style={{ marginTop: -4, marginBottom: 8 }}>
        {quoteSheet === 'setup' ? (
          <>
            變更<strong>專案樓層</strong>會同步<strong>樓層面積</strong>列（同名保留 ㎡）並更新「成本估算列」工作表之結構與欄 C；已填的單層工數／儀器／雜項等會盡量保留。手動「依專案樓層產生」為整表重算範本預設。
          </>
        ) : (
          <>
            請用上方工作表切換「案場與樓層」「成本估算列」「每層計價工數」「每項工程細項計價」「總結」。
          </>
        )}
      </p>

      <div className="btnRow" style={{ marginBottom: 12 }} role="tablist" aria-label="放樣估價工作表">
        <button
          type="button"
          role="tab"
          aria-selected={quoteSheet === 'setup'}
          className={`tab ${quoteSheet === 'setup' ? 'on' : ''}`}
          onClick={() => setQuoteSheet('setup')}
        >
          案場與樓層
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={quoteSheet === 'cost'}
          className={`tab ${quoteSheet === 'cost' ? 'on' : ''}`}
          onClick={() => setQuoteSheet('cost')}
        >
          成本估算列
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={quoteSheet === 'floorPricing'}
          className={`tab ${quoteSheet === 'floorPricing' ? 'on' : ''}`}
          onClick={() => setQuoteSheet('floorPricing')}
        >
          每層計價工數
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={quoteSheet === 'itemPricing'}
          className={`tab ${quoteSheet === 'itemPricing' ? 'on' : ''}`}
          onClick={() => setQuoteSheet('itemPricing')}
        >
          每項工程細項計價
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={quoteSheet === 'summary'}
          className={`tab ${quoteSheet === 'summary' ? 'on' : ''}`}
          onClick={() => setQuoteSheet('summary')}
        >
          總結
        </button>
      </div>

      {quoteSheet === 'setup' && (
        <>
      <section className="card">
        <div className="panelHead">
          <h3>專案樓層</h3>
          <div className="btnRow" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="btn secondary" onClick={applyExcelSampleFloors}>
              套用試算表樓層範例
            </button>
            <button type="button" className="btn" onClick={applyLayoutToRows}>
              依專案樓層產生（覆寫）估價列
            </button>
          </div>
        </div>
        <div className="grid2" style={{ marginBottom: 12 }}>
          <label>
            地下幾層
            <input
              {...bindInt('lay-basement', site.layout.basementFloors, (n) =>
                patchLayout({ basementFloors: n }),
                0,
                30,
              )}
            />
          </label>
          <div className="checkPair">
            <label className="rowCheck">
              <input
                type="checkbox"
                checked={site.layout.hasMezzanine}
                onChange={(e) => patchLayout({ hasMezzanine: e.target.checked })}
              />
              有夾層
            </label>
          </div>
        </div>
        <div className="grid2">
          <label>
            正常樓自第幾層起
            <input
              {...bindInt('lay-typicalStart', site.layout.typicalStartFloor, (n) =>
                patchLayout({ typicalStartFloor: n }),
                2,
                99,
              )}
            />
          </label>
          <label>
            正常樓連續幾層
            <input
              {...bindInt('lay-typicalCount', site.layout.typicalFloors, (n) =>
                patchLayout({ typicalFloors: n }),
                0,
                200,
              )}
            />
          </label>
        </div>
        <div className="grid2">
          <label>
            RF 層數
            <input
              {...bindInt('lay-rf', site.layout.rfCount, (n) => patchLayout({ rfCount: n }), 0, 50)}
            />
          </label>
          <div />
        </div>
      </section>

      <section className="card">
        <h3>案名與費率</h3>
        <div className="grid2">
          <label>
            案名
            <input
              value={site.name}
              onChange={(e) => setSite({ ...site, name: e.target.value })}
              placeholder="新案估價請填本案名稱"
            />
          </label>
          <div className="stat">
            <span>總坪數（㎡換算；不含「基礎工程」列）</span>
            <strong>{result.ping.toFixed(4)} 坪</strong>
          </div>
        </div>
        <div className="feeGrid">
          {(
            [
              ['laborPerDay', '單工成本（元／天）'],
              ['totalStationPerDay', '全測站（元／天）'],
              ['rotatingLaserPerDay', '旋轉雷射（元／天）'],
              ['lineLaserPerDay', '墨線儀（元／天）'],
              ['drawingPerPing', '作圖（元／坪）'],
            ] as const
          ).map(([k, label]) => (
            <label key={k}>
              {label}
              <input {...bindDecimal(`fee-${k}`, site.fees[k], (n) => updateFee(k, n))} />
            </label>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="panelHead">
          <h3>樓層面積（㎡）</h3>
          <button type="button" className="btn secondary" onClick={addFloor}>
            新增樓層
          </button>
        </div>
        <div className="tableScroll tableScrollSticky">
          <table className="data quoteFloorTable">
            <thead>
              <tr>
                <th>樓層</th>
                <th>㎡</th>
                <th>坪（換算）</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {site.floors.map((fl, i) => (
                <tr key={i}>
                  <td>
                    <input
                      value={fl.name}
                      onChange={(e) => updateFloor(i, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      {...bindDecimal(`floor-m2-${i}`, fl.m2, (n) => updateFloor(i, { m2: n }))}
                    />
                  </td>
                  <td className="num">{m2ToPing(fl.m2).toFixed(4)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn danger ghost"
                      onClick={() => removeFloor(i)}
                    >
                      刪
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
        </>
      )}

      {quoteSheet === 'cost' && (
      <section className="card">
        <div className="panelHead">
          <h3>成本估算列</h3>
          <div className="btnRow" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="btn"
              disabled={rows.length === 0}
              title={rows.length === 0 ? '請先產生估價列（專案樓層或下「新增工程模組」）' : '選擇工程模組與輸入細項名稱，插入該模組最末列之下'}
              onClick={openQuickAdd}
            >
              快速新增
            </button>
            <button type="button" className="btn secondary" onClick={openAddModule}>
              新增工程模組
            </button>
          </div>
        </div>
        <p className="hint" style={{ marginTop: -4, marginBottom: 10 }}>
          依工程模組分組；表頭第二列會依<strong>垂直捲動</strong>顯示目前所在工程模組，並與 A、B 欄一併<strong>橫向鎖在左側</strong>，與欄位小標題對齊對照。區塊內細分隔線僅供對位；「改名」請用表頭該列按鈕。「快速新增」可指定模組與細項名稱。每列「＋細項」可就地插入同模組列。A「樓層／階段」與 B「細項」兩欄皆橫式（同模組接續列 A 常留白）。調整專案樓層後若範本列數不符，請至「案場與樓層」工作表按「依專案樓層產生（覆寫）估價列」重建。
        </p>
        <div ref={quoteCostScrollRef} className="tableScroll tableScrollSticky">
          <table className="data tight quoteCostTableExcel">
            <thead>
              <tr>
                {QUOTE_TABLE_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={`quoteExcelTH quoteExcelTHLblOnly${col.key === 'item' ? ' quoteStickyItemCol' : ''}`}
                  >
                    <span className="excelLbl">{col.label}</span>
                  </th>
                ))}
                <th scope="col" className="quoteExcelTH quoteExcelTHAct quoteExcelTHLblOnly">
                  <span className="excelLbl">操作</span>
                </th>
              </tr>
              {result.computed.length > 0 ? (
                <tr className="quoteCostActiveZoneHead">
                  <th
                    colSpan={2}
                    scope="colgroup"
                    className="quoteCostActiveZoneThStickyAB"
                  >
                    <div className="quoteCostActiveZoneInner">
                      <span className="quoteCostActiveZoneTitle">
                        {activeCostZone || zoneOptions[0] || '—'}
                      </span>
                      <span className="quoteCostActiveZoneSub">目前區塊</span>
                      <button
                        type="button"
                        className="btn secondary ghost quoteZoneRenameBtn"
                        title="此模組底下所有列一併換區名"
                        disabled={!(activeCostZone || zoneOptions[0])}
                        onClick={() =>
                          openRenameZone(activeCostZone || zoneOptions[0] || '')
                        }
                      >
                        改名
                      </button>
                    </div>
                  </th>
                  <th
                    colSpan={QUOTE_DATA_COLS - 2}
                    scope="colgroup"
                    className="quoteCostActiveZoneThRest"
                    aria-hidden
                  />
                </tr>
              ) : null}
            </thead>
            <tbody>
              {result.computed.length === 0 ? (
                <tr>
                  <td colSpan={QUOTE_DATA_COLS} className="emptyTableMsg">
                    尚無列。請至「案場與樓層」工作表設定專案樓層後按「依專案樓層產生（覆寫）估價列」，或在此按「新增工程模組」。
                  </td>
                </tr>
              ) : null}
              {result.computed.map((r, i) => {
                const prevZone = i > 0 ? result.computed[i - 1]!.zone : ''
                const showZoneHead = r.zone !== prevZone
                const showStageA = showQuoteStageCellEditor(r, i, rows)
                return (
                  <Fragment key={r.id}>
                    {showZoneHead ? (
                      <tr className="quoteZoneSep" data-zone={r.zone}>
                        <td colSpan={QUOTE_DATA_COLS} className="quoteZoneSepMark" aria-hidden />
                      </tr>
                    ) : null}
                    <tr
                      className={
                        r.zone === EXCEL_STAGE.foundation
                          ? 'quoteRowZoneFoundation'
                          : r.zone === EXCEL_STAGE.f1 || r.zone === EXCEL_STAGE.typical
                            ? 'quoteRowHilite'
                            : undefined
                      }
                    >
                  <td
                    className={showStageA ? undefined : 'quoteStageBlank'}
                    aria-label={r.zone}
                  >
                    {showStageA ? (
                      <input
                        value={r.zone}
                        onChange={(e) => updateRow(i, { zone: e.target.value })}
                      />
                    ) : null}
                  </td>
                  <td className="quoteStickyItemCol">
                    <input
                      value={r.item}
                      onChange={(e) => updateRow(i, { item: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      {...bindDecimal(
                        `q-${r.id}-same`,
                        r.sameFloors,
                        (n) => updateRow(i, { sameFloors: n }),
                        'narrow',
                      )}
                    />
                  </td>
                  <td>
                    <input
                      {...bindDecimal(
                        `q-${r.id}-base`,
                        r.basePerFloor,
                        (n) => updateRow(i, { basePerFloor: n }),
                        'narrow',
                      )}
                    />
                  </td>
                  <td className="num">{r.baseTotal.toFixed(2)}</td>
                  <td>
                    <input
                      {...bindDecimal(
                        `q-${r.id}-risk`,
                        r.riskPct,
                        (n) => updateRow(i, { riskPct: n }),
                        'narrow',
                      )}
                    />
                  </td>
                  <td className="num">{r.pricingPerFloor.toFixed(2)}</td>
                  <td className="num">{r.pricingTotal.toFixed(2)}</td>
                  <td className="cen">
                    <input
                      type="checkbox"
                      checked={r.useTotalStation}
                      onChange={(e) =>
                        updateRow(i, { useTotalStation: e.target.checked })
                      }
                    />
                  </td>
                  <td className="cen">
                    <input
                      type="checkbox"
                      checked={r.useRotatingLaser}
                      onChange={(e) =>
                        updateRow(i, { useRotatingLaser: e.target.checked })
                      }
                    />
                  </td>
                  <td className="cen">
                    <input
                      type="checkbox"
                      checked={r.useLineLaser}
                      onChange={(e) =>
                        updateRow(i, { useLineLaser: e.target.checked })
                      }
                    />
                  </td>
                  <td>
                    <input
                      {...bindDecimal(
                        `q-${r.id}-misc`,
                        r.miscPerFloor,
                        (n) => updateRow(i, { miscPerFloor: n }),
                        'narrow',
                      )}
                    />
                  </td>
                  <td className="num">{Math.round(r.miscModule)}</td>
                  <td className="num">{Math.round(r.instrumentPerFloor)}</td>
                  <td className="num">{Math.round(r.instrumentModule)}</td>
                  <td className="num">{Math.round(r.floorStageQuote)}</td>
                  <td className="num">{Math.round(r.regionCost)}</td>
                  <td className="quoteRowActCell">
                    <div className="quoteRowActBtns">
                      <button
                        type="button"
                        className="btn quoteRowActAdd"
                        title="在此列下方新增同區細項（複製欄 C 與工數／儀器／雜項預設）"
                        onClick={() => addSubItemAfter(i)}
                      >
                        ＋細項
                      </button>
                      <button
                        type="button"
                        className="btn danger ghost"
                        title="刪除此列"
                        onClick={() => removeRow(i)}
                      >
                        刪
                      </button>
                    </div>
                  </td>
                </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {quoteSheet === 'floorPricing' && (
        <section className="card">
          <div className="panelHead">
            <h3>每層計價工數</h3>
          </div>
          <p className="hint" style={{ marginTop: -4, marginBottom: 10 }}>
            依「樓層面積」列順序；當樓層名稱可對應試算表階段時，將該模組之基礎總工數、計價工數、儀器／雜項及工序成本合計
            <strong>平均攤</strong>至同模組各樓層；作圖成本為該層坪數×作圖費率。成本估算列若變更區名，請維持與試算表階段用字一致（如「正常樓」「B1F」）以利對應。表內<strong>樓層、套用模組</strong>兩欄橫向捲動時鎖在左側。
          </p>
          <div className="tableScroll tableScrollSticky">
            <table className="data quoteFloorPricingTable">
              <thead>
                <tr>
                  <th>樓層</th>
                  <th>套用模組</th>
                  <th className="num">基礎總工數</th>
                  <th className="num">計價工數</th>
                  <th className="num">該層坪數</th>
                  <th className="num">該層儀器成本</th>
                  <th className="num">該層雜項成本</th>
                  <th className="num">作圖成本</th>
                  <th className="num">該層成本(扣除作圖成本)</th>
                  <th className="num">該層成本</th>
                  <th className="num">每坪成本</th>
                </tr>
              </thead>
              <tbody>
                {floorPricingRows.map((row, idx) => {
                  const floorM2 = site.floors[idx]?.m2 ?? 0
                  return (
                    <tr key={`${row.floorLabel}-${idx}`}>
                      <PayrollSummaryPopoverCell
                        cellContent={row.floorLabel}
                        hintTitle={`樓層：${row.floorLabel}`}
                        breakdownLines={floorPricingFloorLabelBreakdown(row, floorM2)}
                        showValueFooter={false}
                      />
                      <PayrollSummaryPopoverCell
                        cellContent={row.moduleLabel}
                        hintTitle="套用模組"
                        breakdownLines={floorPricingModuleBreakdown(row)}
                        showValueFooter={false}
                      />
                      <PayrollSummaryPopoverCell
                        className="num"
                        cellContent={row.baseTotal.toFixed(1)}
                        summaryAmount={row.baseTotal}
                        breakdownLines={floorPricingNumericBreakdown(
                          'baseTotal',
                          row,
                          site,
                          floorM2,
                        )}
                      />
                      <PayrollSummaryPopoverCell
                        className="num"
                        cellContent={row.pricingTotal.toFixed(1)}
                        summaryAmount={row.pricingTotal}
                        breakdownLines={floorPricingNumericBreakdown(
                          'pricingTotal',
                          row,
                          site,
                          floorM2,
                        )}
                      />
                      <PayrollSummaryPopoverCell
                        className="num"
                        cellContent={row.ping.toFixed(2)}
                        summaryAmount={row.ping}
                        breakdownLines={floorPricingNumericBreakdown('ping', row, site, floorM2)}
                      />
                      <PayrollSummaryPopoverCell
                        className="num"
                        cellContent={Math.round(row.instrumentCost).toLocaleString()}
                        summaryAmount={row.instrumentCost}
                        breakdownLines={floorPricingNumericBreakdown(
                          'instrumentCost',
                          row,
                          site,
                          floorM2,
                        )}
                      />
                      <PayrollSummaryPopoverCell
                        className="num"
                        cellContent={Math.round(row.miscCost).toLocaleString()}
                        summaryAmount={row.miscCost}
                        breakdownLines={floorPricingNumericBreakdown('miscCost', row, site, floorM2)}
                      />
                      <PayrollSummaryPopoverCell
                        className="num"
                        cellContent={Math.round(row.drawingCost).toLocaleString()}
                        summaryAmount={row.drawingCost}
                        breakdownLines={floorPricingNumericBreakdown(
                          'drawingCost',
                          row,
                          site,
                          floorM2,
                        )}
                      />
                      <PayrollSummaryPopoverCell
                        className="num"
                        cellContent={Math.round(row.costExDrawing).toLocaleString()}
                        summaryAmount={row.costExDrawing}
                        breakdownLines={floorPricingNumericBreakdown(
                          'costExDrawing',
                          row,
                          site,
                          floorM2,
                        )}
                      />
                      <PayrollSummaryPopoverCell
                        className="num"
                        cellContent={Math.round(row.costTotal).toLocaleString()}
                        summaryAmount={row.costTotal}
                        breakdownLines={floorPricingNumericBreakdown(
                          'costTotal',
                          row,
                          site,
                          floorM2,
                        )}
                      />
                      <PayrollSummaryPopoverCell
                        className="num"
                        cellContent={Math.round(row.costPerPing).toLocaleString()}
                        summaryAmount={row.costPerPing}
                        breakdownLines={floorPricingNumericBreakdown(
                          'costPerPing',
                          row,
                          site,
                          floorM2,
                        )}
                      />
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {quoteSheet === 'itemPricing' && (
        <section className="card">
          <div className="panelHead">
            <h3>每項工程細項計價</h3>
          </div>
          <p className="hint" style={{ marginTop: -4, marginBottom: 10 }}>
            依成本估算列之<strong>細項</strong>名稱加總「區域細項合計計價」與<strong>基礎總工數</strong>（E 欄）；同一細項跨多個工程模組時合併一列。「總工數」為該細項之基礎總工數合計；「計價(元)」為區域合計金額；「占總(%)」為占<strong>總成本（含作圖）</strong>之百分比。表列順序為試算表基礎→地下→地上細項，其餘自訂細項排在表末。<strong>細項</strong>欄橫向捲動時鎖在左側。
          </p>
          <div className="tableScroll tableScrollSticky">
            <table className="data quoteItemPricingTable">
              <thead>
                <tr>
                  <th scope="col" className="quoteStickyItemCol">
                    細項
                  </th>
                  <th className="num">總工數</th>
                  <th className="num">計價(元)</th>
                  <th className="num">占總(%)</th>
                </tr>
              </thead>
              <tbody>
                {itemPricingRows.map((row) => (
                  <tr key={row.item}>
                    <PayrollSummaryPopoverCell
                      className="quoteStickyItemCol"
                      cellContent={row.item}
                      hintTitle={`細項：${row.item}`}
                      breakdownLines={itemPricingBreakdown(
                        'itemLabel',
                        row.item,
                        row,
                        rows,
                        site,
                        result.totalCost,
                      )}
                      showValueFooter={false}
                    />
                    <PayrollSummaryPopoverCell
                      className="num"
                      cellContent={row.totalBaseLabor.toFixed(2)}
                      summaryAmount={row.totalBaseLabor}
                      breakdownLines={itemPricingBreakdown(
                        'base',
                        row.item,
                        row,
                        rows,
                        site,
                        result.totalCost,
                      )}
                    />
                    <PayrollSummaryPopoverCell
                      className="num"
                      cellContent={Math.round(row.cost).toLocaleString()}
                      summaryAmount={row.cost}
                      breakdownLines={itemPricingBreakdown(
                        'cost',
                        row.item,
                        row,
                        rows,
                        site,
                        result.totalCost,
                      )}
                    />
                    <PayrollSummaryPopoverCell
                      className="num"
                      cellContent={row.pctOfTotal.toFixed(2)}
                      summaryAmount={row.pctOfTotal}
                      breakdownLines={itemPricingBreakdown(
                        'pct',
                        row.item,
                        row,
                        rows,
                        site,
                        result.totalCost,
                      )}
                    />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {quoteSheet === 'summary' && (
      <section className="card summary">
        <h3>總結</h3>
        <p className="hint" style={{ marginTop: -6, marginBottom: 10 }}>
          作圖總額與每坪成本所依<strong>總坪</strong>不含樓層面積「<strong>基礎工程</strong>」列；該列㎡仍會出現在樓層面積與每層計價表。
        </p>
        <dl className="dl">
          <div>
            <dt>基礎總工數加總</dt>
            <dd>{result.totalBase.toFixed(2)}</dd>
          </div>
          <div>
            <dt>計價工數加總</dt>
            <dd>{result.totalPricingDays.toFixed(2)}</dd>
          </div>
          <div>
            <dt>工序＋儀器＋雜項（未含作圖）</dt>
            <dd>{Math.round(result.totalRegion).toLocaleString()} 元</dd>
          </div>
          <div>
            <dt>作圖成本</dt>
            <dd>{Math.round(result.drawingCost).toLocaleString()} 元</dd>
          </div>
          <div>
            <dt>總成本</dt>
            <dd>{Math.round(result.totalCost).toLocaleString()} 元</dd>
          </div>
          <div>
            <dt>每坪成本</dt>
            <dd>{result.costPerPing.toFixed(2)} 元／坪</dd>
          </div>
          <div>
            <dt>每坪（扣除作圖）</dt>
            <dd>{result.costPerPingExDrawing.toFixed(2)} 元／坪</dd>
          </div>
        </dl>
      </section>
      )}

      {quickAddOpen ? (
        <div
          className="quoteDialogOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quoteQuickAddTitle"
          onClick={() => setQuickAddOpen(false)}
        >
          <div className="quoteDialogPanel" onClick={(e) => e.stopPropagation()}>
            <h2 id="quoteQuickAddTitle" className="quoteDialogTitle">
              快速新增細項
            </h2>
            <p className="quoteDialogDesc">
              選擇要掛在哪個工程模組下，新列會接在該模組最末一列之後，並帶入該列的欄 C 與工數／儀器／雜項預設。
            </p>
            <form
              className="quoteDialogForm"
              onSubmit={(e) => {
                e.preventDefault()
                submitQuickAdd()
              }}
            >
              <label>
                工程模組
                <select
                  value={quickAddZone}
                  onChange={(e) => setQuickAddZone(e.target.value)}
                  className="quoteDialogField"
                >
                  {zoneOptions.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                細項名稱
                <input
                  className="quoteDialogField"
                  value={quickItemName}
                  onChange={(e) => setQuickItemName(e.target.value)}
                  placeholder="新細項"
                  autoComplete="off"
                />
              </label>
              <div className="quoteDialogActions">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setQuickAddOpen(false)}
                >
                  取消
                </button>
                <button type="submit" className="btn">
                  加入
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {addModuleOpen ? (
        <div
          className="quoteDialogOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quoteAddModuleTitle"
          onClick={() => setAddModuleOpen(false)}
        >
          <div className="quoteDialogPanel" onClick={(e) => e.stopPropagation()}>
            <h2 id="quoteAddModuleTitle" className="quoteDialogTitle">
              新增工程模組
            </h2>
            <p className="quoteDialogDesc">
              在表尾加入一筆自訂工程模組（可填專屬區名），內建一條「新細項」列，之後可再補欄 C 與工數，或用「快速新增」加同模組細項。
            </p>
            <form
              className="quoteDialogForm"
              onSubmit={(e) => {
                e.preventDefault()
                submitAddModule()
              }}
            >
              <label>
                工程模組名稱
                <input
                  className="quoteDialogField"
                  value={newModuleNameDraft}
                  onChange={(e) => setNewModuleNameDraft(e.target.value)}
                  placeholder="留空則使用「新工程模組」"
                  autoComplete="off"
                />
              </label>
              <div className="quoteDialogActions">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setAddModuleOpen(false)}
                >
                  取消
                </button>
                <button type="submit" className="btn">
                  建立
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {renameZoneOpen !== null ? (
        <div
          className="quoteDialogOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quoteRenameZoneTitle"
          onClick={() => setRenameZoneOpen(null)}
        >
          <div className="quoteDialogPanel" onClick={(e) => e.stopPropagation()}>
            <h2 id="quoteRenameZoneTitle" className="quoteDialogTitle">
              工程模組改名
            </h2>
            <p className="quoteDialogDesc">
              將「{renameZoneOpen}」底下所有列的區名一併改為新名稱（細項與數值不變）。
            </p>
            <form
              className="quoteDialogForm"
              onSubmit={(e) => {
                e.preventDefault()
                submitRenameZone()
              }}
            >
              <label>
                新模組名稱
                <input
                  className="quoteDialogField"
                  value={renameZoneDraft}
                  onChange={(e) => setRenameZoneDraft(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <div className="quoteDialogActions">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setRenameZoneOpen(null)}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="btn"
                  disabled={
                    renameZoneDraft.trim() === '' ||
                    renameZoneDraft.trim() === renameZoneOpen
                  }
                >
                  套用
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
