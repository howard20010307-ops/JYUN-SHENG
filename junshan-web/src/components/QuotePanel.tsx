import { Fragment, useEffect, useMemo, useState } from 'react'
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
import { allocateWithSuffix, stableHash16 } from '../domain/stableIds'
import { PayrollSummaryPopoverCell } from './PayrollSummaryPopoverCell'

function allocManualQuoteRowId(rows: readonly QuoteRow[], seed: string): string {
  const base = `q--${stableHash16(`manual\0${seed}`)}`
  return allocateWithSuffix(base, new Set(rows.map((r) => r.id)))
}

type Props = {
  site: QuoteSite
  setSite: (s: QuoteSite) => void
  rows: QuoteRow[]
  setRows: (r: QuoteRow[]) => void
  /**
   * 估價案名：先順暢編輯；按「同步全書」才與薪水月表、日誌、收帳全書同步。
   * 失敗時父層會還原案名；此處仍應呼叫以顯示錯誤。
   */
  commitSiteRenameFromQuoteNameBlur?: (
    oldExact: string,
    newTrimmed: string,
  ) => { ok: boolean; message: string }
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

/** 成本估算：各模組區段橫幅配色 */
function quoteCostZoneBannerMod(zone: string): 'foundation' | 'spot' | 'default' {
  if (zone === EXCEL_STAGE.foundation) return 'foundation'
  if (zone === EXCEL_STAGE.f1 || zone === EXCEL_STAGE.typical) return 'spot'
  return 'default'
}

function quoteCostZoneBannerRowClass(zone: string): string {
  return `quoteZoneBannerRow quoteZoneBannerRow--${quoteCostZoneBannerMod(zone)}`
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

export function QuotePanel({
  site,
  setSite,
  rows,
  setRows,
  commitSiteRenameFromQuoteNameBlur,
}: Props) {
  const { bindDecimal, bindInt } = useLooseNumericDrafts()
  /** 第一次點進案名欄時的舊字串；按「同步全書」前不寫回月表／日誌等 */
  const [quoteSiteRenameOldExact, setQuoteSiteRenameOldExact] = useState<string | null>(null)
  const result = useMemo(() => computeQuote(site, rows), [site, rows])
  const floorPricingRows = useMemo(() => computeFloorPricingTable(site, rows), [site, rows])
  const floorPricingTotals = useMemo(() => {
    let baseTotal = 0
    let pricingTotal = 0
    let ping = 0
    let instrumentCost = 0
    let miscCost = 0
    let drawingCost = 0
    let costExDrawing = 0
    let costTotal = 0
    for (const r of floorPricingRows) {
      baseTotal += r.baseTotal
      pricingTotal += r.pricingTotal
      ping += r.ping
      instrumentCost += r.instrumentCost
      miscCost += r.miscCost
      drawingCost += r.drawingCost
      costExDrawing += r.costExDrawing
      costTotal += r.costTotal
    }
    const costPerPing = ping > 0 ? costTotal / ping : 0
    return {
      baseTotal,
      pricingTotal,
      ping,
      instrumentCost,
      miscCost,
      drawingCost,
      costExDrawing,
      costTotal,
      costPerPing,
    }
  }, [floorPricingRows])
  const itemPricingRows = useMemo(() => computeItemPricingTable(site, rows), [site, rows])
  const itemPricingTotals = useMemo(() => {
    let totalBaseLabor = 0
    let cost = 0
    for (const r of itemPricingRows) {
      totalBaseLabor += r.totalBaseLabor
      cost += r.cost
    }
    return { totalBaseLabor, cost }
  }, [itemPricingRows])
  const zoneOptions = useMemo(() => uniqueZonesInOrder(rows), [rows])

  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddZone, setQuickAddZone] = useState('')
  const [quickItemName, setQuickItemName] = useState('新細項')

  const [addModuleOpen, setAddModuleOpen] = useState(false)
  const [newModuleNameDraft, setNewModuleNameDraft] = useState('')

  /** 放樣估價內工作表（對齊薪水「月表」分頁用法） */
  const [quoteSheet, setQuoteSheet] = useState<
    'setup' | 'cost' | 'floorPricing' | 'itemPricing' | 'summary'
  >('setup')

  useEffect(() => {
    if (!quickAddOpen && !addModuleOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setQuickAddOpen(false)
        setAddModuleOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [quickAddOpen, addModuleOpen])

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
        id: allocManualQuoteRowId(rows, `mod\0${zone}\0${rows.length}`),
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
      id: allocManualQuoteRowId(rows, `sub\0${base.zone}\0${i}\0${label}\0${rows.length}`),
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
    if (!window.confirm('將依範本重建成本估算列並覆寫已填內容。確定嗎？')) {
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
      <div className="btnRow quoteSheetTabs" style={{ marginBottom: 12 }} role="tablist" aria-label="放樣估價工作表">
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <input
                value={site.name}
                onFocus={() => {
                  setQuoteSiteRenameOldExact((o) => (o === null ? site.name : o))
                }}
                onChange={(e) => setSite({ ...site, name: e.target.value })}
                placeholder="新案估價請填本案名稱"
                style={{ minWidth: '12rem', flex: '1 1 10rem' }}
              />
              <button
                type="button"
                className="btn secondary"
                title="以第一次點進此欄時的案名為舊名，與目前內容比對後同步至月表、日誌、收帳"
                disabled={
                  !commitSiteRenameFromQuoteNameBlur ||
                  quoteSiteRenameOldExact === null ||
                  site.name.trim() === quoteSiteRenameOldExact.trim()
                }
                onClick={() => {
                  if (!commitSiteRenameFromQuoteNameBlur || quoteSiteRenameOldExact === null) return
                  const newT = site.name.trim()
                  const r = commitSiteRenameFromQuoteNameBlur(quoteSiteRenameOldExact, newT)
                  if (!r.ok) {
                    window.alert(r.message)
                    setSite({ ...site, name: quoteSiteRenameOldExact })
                    setQuoteSiteRenameOldExact(null)
                    return
                  }
                  setQuoteSiteRenameOldExact(null)
                  if (
                    r.message &&
                    r.message !== '名稱相同，無需變更。' &&
                    r.message !== '無需變更。'
                  ) {
                    window.alert(r.message)
                  }
                }}
              >
                同步全書
              </button>
            </div>
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
              title={rows.length === 0 ? '請先產生估價列' : '插入於該模組末列之下'}
              onClick={openQuickAdd}
            >
              快速新增
            </button>
            <button type="button" className="btn secondary" onClick={openAddModule}>
              新增工程模組
            </button>
          </div>
        </div>
        <div className="tableScroll tableScrollSticky quoteCostScrollWrap">
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
            </thead>
            <tbody>
              {result.computed.length === 0 ? (
                <tr>
                  <td colSpan={QUOTE_DATA_COLS} className="emptyTableMsg">
                    尚無列。請於「案場與樓層」產生估價列，或在此按「新增工程模組」。
                  </td>
                </tr>
              ) : null}
              {result.computed.map((r, i) => {
                const prevZone = i > 0 ? result.computed[i - 1]!.zone : ''
                const showZoneHead = r.zone !== prevZone
                return (
                  <Fragment key={r.id}>
                    {showZoneHead ? (
                      <tr className={quoteCostZoneBannerRowClass(r.zone)} data-zone={r.zone}>
                        <td colSpan={QUOTE_DATA_COLS} className="quoteZoneBannerCell">
                          <span className="quoteZoneBannerTitle">{r.zone}</span>
                        </td>
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
                  <td className="quoteStickyItemCol" aria-label={`工程模組：${r.zone}`}>
                    <input
                      type="text"
                      className="quoteStickyItemText"
                      value={r.item}
                      size={Math.max(10, Math.min(96, (r.item?.length ?? 0) + 4))}
                      onChange={(e) => updateRow(i, { item: e.target.value })}
                      spellCheck={false}
                    />
                  </td>
                  <td className="num quoteSameFloorsCell" title="依專案樓層（可於「案場與樓層」調整）">
                    {Number.isFinite(r.sameFloors) ? r.sameFloors : '—'}
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
                        title="同區新增細項（沿用本列預設）"
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
              <tfoot>
                <tr className="quoteFloorPricingTotalRow">
                  <td>合計</td>
                  <td>—</td>
                  <td className="num">{floorPricingTotals.baseTotal.toFixed(1)}</td>
                  <td className="num">{floorPricingTotals.pricingTotal.toFixed(1)}</td>
                  <td className="num">{floorPricingTotals.ping.toFixed(2)}</td>
                  <td className="num">{Math.round(floorPricingTotals.instrumentCost).toLocaleString()}</td>
                  <td className="num">{Math.round(floorPricingTotals.miscCost).toLocaleString()}</td>
                  <td className="num">{Math.round(floorPricingTotals.drawingCost).toLocaleString()}</td>
                  <td className="num">{Math.round(floorPricingTotals.costExDrawing).toLocaleString()}</td>
                  <td className="num">{Math.round(floorPricingTotals.costTotal).toLocaleString()}</td>
                  <td className="num">{Math.round(floorPricingTotals.costPerPing).toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {quoteSheet === 'itemPricing' && (
        <section className="card">
          <div className="panelHead">
            <h3>每項工程細項計價</h3>
          </div>
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
                        result.totalRegion,
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
                        result.totalRegion,
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
                        result.totalRegion,
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
                        result.totalRegion,
                      )}
                    />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="quoteItemPricingTotalRow">
                  <td className="quoteStickyItemCol">合計</td>
                  <td className="num">{itemPricingTotals.totalBaseLabor.toFixed(2)}</td>
                  <td className="num">{Math.round(itemPricingTotals.cost).toLocaleString()}</td>
                  <td className="num">
                    {result.totalRegion > 0
                      ? ((itemPricingTotals.cost / result.totalRegion) * 100).toFixed(2)
                      : '0.00'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {quoteSheet === 'summary' && (
      <section className="card summary">
        <h3>總結</h3>
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
    </div>
  )
}
