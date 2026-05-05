import { useMemo, useState } from 'react'
import {
  contractAmountOf,
  createContractContentLine,
  type ContractContentLine,
  type ContractContentState,
} from '../domain/contractContentModel'
import type { ReceivablesState } from '../domain/receivablesModel'
import type { SalaryBook } from '../domain/salaryExcelModel'
import { buildSiteAnalysis, compareFloorLevelAsc } from '../domain/siteAnalysis'
import type { WorkLogState } from '../domain/workLogModel'
import { PayrollNumberInput } from './PayrollNumberInput'

type Props = {
  salaryBook: SalaryBook
  workLog: WorkLogState
  receivables: ReceivablesState
  contractContents: ContractContentState
  setContractContents: (fn: (prev: ContractContentState) => ContractContentState) => void
  canEdit: boolean
}

function fmtMoney(n: number): string {
  return Math.round(Number.isFinite(n) ? n : 0).toLocaleString()
}

function fmtPct(n: number): string {
  return `${(Number.isFinite(n) ? n * 100 : 0).toFixed(1)}%`
}

export function SiteAnalysisPanel({
  salaryBook,
  workLog,
  receivables,
  contractContents,
  setContractContents,
  canEdit,
}: Props) {
  type ProfitSortMode = 'constructionDate' | 'building' | 'floor' | 'phase'
  const snap = useMemo(
    () => buildSiteAnalysis(salaryBook, workLog, receivables, contractContents),
    [salaryBook, workLog, receivables, contractContents],
  )
  const siteOptions = useMemo(() => {
    const withWorkLog = snap.siteNames.filter((name) => {
      const details = snap.bySite[name]?.details ?? []
      return details.some(
        (d) =>
          d.staffCount > 0 ||
          d.workDays > 0 ||
          d.salaryCost !== 0 ||
          d.mealCost !== 0 ||
          d.instrumentCost !== 0 ||
          (d.workItems ?? '').trim() !== '' ||
          (d.note ?? '').trim() !== '',
      )
    })
    // 若目前完全沒有出工明細，才退回原本聯集（避免選單空白）
    return withWorkLog.length > 0 ? withWorkLog : snap.siteNames
  }, [snap])
  const [site, setSite] = useState('')
  const [profitSortMode, setProfitSortMode] = useState<ProfitSortMode>('constructionDate')
  const [profitPanelsOpen, setProfitPanelsOpen] = useState({
    total: true,
    byBuilding: false,
    byFloor: false,
    byPhase: false,
  })
  const activeSite = site && snap.bySite[site] ? site : siteOptions[0] ?? ''
  const data = activeSite ? snap.bySite[activeSite] : null
  const activeSiteContractTargetNet = activeSite ? contractContents.siteTotalNetBySite[activeSite.trim()] ?? 0 : 0
  const activeSiteContractLinesNet = data?.contractTotals.contractAmount ?? 0
  const activeSiteContractGapNet = activeSiteContractTargetNet - activeSiteContractLinesNet
  const contractRowsForSite = useMemo(
    () =>
      activeSite
        ? contractContents.lines.filter((line) => line.siteName.trim() === activeSite.trim())
        : [],
    [contractContents.lines, activeSite],
  )
  const buildingContractRows = useMemo(() => {
    if (!data) return []
    const byBuilding = new Map<
      string,
      { buildingLabel: string; contractAmount: number; receivableNetLinked: number; receivableRemaining: number; receivableProgress: number }
    >()
    for (const row of data.contractRows) {
      const buildingLabel = row.dong
      const got = byBuilding.get(buildingLabel) ?? {
        buildingLabel,
        contractAmount: 0,
        receivableNetLinked: 0,
        receivableRemaining: 0,
        receivableProgress: 0,
      }
      got.contractAmount += row.contractAmount
      got.receivableNetLinked += row.receivableNetLinked
      byBuilding.set(buildingLabel, got)
    }
    const out = [...byBuilding.values()]
    for (const row of out) {
      row.receivableRemaining = row.contractAmount - row.receivableNetLinked
      row.receivableProgress = row.contractAmount > 0 ? row.receivableNetLinked / row.contractAmount : 0
    }
    return out
      .filter((row) => row.buildingLabel !== '未填' || row.contractAmount !== 0 || row.receivableNetLinked !== 0)
      .sort((a, b) => a.buildingLabel.localeCompare(b.buildingLabel, 'zh-Hant'))
  }, [data])
  const sortedContractRows = useMemo(() => {
    if (!data) return []
    return data.contractRows.slice().sort((a, b) => {
      const d = a.dong.localeCompare(b.dong, 'zh-Hant')
      if (d !== 0) return d
      const f = compareFloorLevelAsc(a.floorLevel, b.floorLevel)
      if (f !== 0) return f
      return a.workPhase.localeCompare(b.workPhase, 'zh-Hant')
    })
  }, [data])
  const buildingAnalysisRows = useMemo(() => {
    if (!data) return []
    const byBuilding = new Map<string, typeof data.totals>()
    for (const g of data.groups) {
      const key = g.dong
      const got = byBuilding.get(key) ?? {
        siteName: data.totals.siteName,
        dong: key,
        floorLevel: '全部',
        workPhase: '全部',
        revenueNet: 0,
        salaryCost: 0,
        mealCost: 0,
        instrumentCost: 0,
        directCost: 0,
        grossProfit: 0,
        grossMargin: 0,
        operatingExpenseAllocated: 0,
        netProfit: 0,
        netMargin: 0,
        workDays: 0,
        grossPerWorkDay: 0,
      }
      got.revenueNet += g.revenueNet
      got.salaryCost += g.salaryCost
      got.mealCost += g.mealCost
      got.operatingExpenseAllocated += g.operatingExpenseAllocated
      got.workDays += g.workDays
      byBuilding.set(key, got)
    }
    return [...byBuilding.values()]
      .map((row) => {
        const directCost = row.salaryCost + row.mealCost
        const grossProfit = row.revenueNet - directCost
        const grossMargin = row.revenueNet !== 0 ? grossProfit / row.revenueNet : 0
        const netProfit = grossProfit - row.operatingExpenseAllocated
        const netMargin = row.revenueNet !== 0 ? netProfit / row.revenueNet : 0
        const grossPerWorkDay = row.workDays !== 0 ? grossProfit / row.workDays : 0
        return { ...row, directCost, grossProfit, grossMargin, netProfit, netMargin, grossPerWorkDay }
      })
      .sort((a, b) => a.dong.localeCompare(b.dong, 'zh-Hant'))
  }, [data])
  const floorAnalysisRows = useMemo(() => {
    if (!data) return []
    const byFloor = new Map<string, typeof data.totals>()
    for (const g of data.groups) {
      const key = g.floorLevel
      const got = byFloor.get(key) ?? {
        siteName: data.totals.siteName,
        dong: '全部',
        floorLevel: key,
        workPhase: '全部',
        revenueNet: 0,
        salaryCost: 0,
        mealCost: 0,
        instrumentCost: 0,
        directCost: 0,
        grossProfit: 0,
        grossMargin: 0,
        operatingExpenseAllocated: 0,
        netProfit: 0,
        netMargin: 0,
        workDays: 0,
        grossPerWorkDay: 0,
      }
      got.revenueNet += g.revenueNet
      got.salaryCost += g.salaryCost
      got.mealCost += g.mealCost
      got.operatingExpenseAllocated += g.operatingExpenseAllocated
      got.workDays += g.workDays
      byFloor.set(key, got)
    }
    return [...byFloor.values()]
      .map((row) => {
        const directCost = row.salaryCost + row.mealCost
        const grossProfit = row.revenueNet - directCost
        const grossMargin = row.revenueNet !== 0 ? grossProfit / row.revenueNet : 0
        const netProfit = grossProfit - row.operatingExpenseAllocated
        const netMargin = row.revenueNet !== 0 ? netProfit / row.revenueNet : 0
        const grossPerWorkDay = row.workDays !== 0 ? grossProfit / row.workDays : 0
        return { ...row, directCost, grossProfit, grossMargin, netProfit, netMargin, grossPerWorkDay }
      })
      .sort((a, b) => compareFloorLevelAsc(a.floorLevel, b.floorLevel))
  }, [data])
  const phaseAnalysisRows = useMemo(() => {
    if (!data) return []
    const byPhase = new Map<string, typeof data.totals>()
    for (const g of data.groups) {
      const key = g.workPhase
      const got = byPhase.get(key) ?? {
        siteName: data.totals.siteName,
        dong: '全部',
        floorLevel: '全部',
        workPhase: key,
        revenueNet: 0,
        salaryCost: 0,
        mealCost: 0,
        instrumentCost: 0,
        directCost: 0,
        grossProfit: 0,
        grossMargin: 0,
        operatingExpenseAllocated: 0,
        netProfit: 0,
        netMargin: 0,
        workDays: 0,
        grossPerWorkDay: 0,
      }
      got.revenueNet += g.revenueNet
      got.salaryCost += g.salaryCost
      got.mealCost += g.mealCost
      got.operatingExpenseAllocated += g.operatingExpenseAllocated
      got.workDays += g.workDays
      byPhase.set(key, got)
    }
    return [...byPhase.values()]
      .map((row) => {
        const directCost = row.salaryCost + row.mealCost
        const grossProfit = row.revenueNet - directCost
        const grossMargin = row.revenueNet !== 0 ? grossProfit / row.revenueNet : 0
        const netProfit = grossProfit - row.operatingExpenseAllocated
        const netMargin = row.revenueNet !== 0 ? netProfit / row.revenueNet : 0
        const grossPerWorkDay = row.workDays !== 0 ? grossProfit / row.workDays : 0
        return { ...row, directCost, grossProfit, grossMargin, netProfit, netMargin, grossPerWorkDay }
      })
      .sort((a, b) => a.workPhase.localeCompare(b.workPhase, 'zh-Hant'))
  }, [data])
  function normalizeDateForSort(raw: string): string {
    const t = (raw ?? '').trim()
    if (!t) return ''
    const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(t)
    if (!m) return ''
    return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`
  }
  function parseBuildingToken(raw: string): { alpha: string; num: number; text: string } {
    const text = (raw ?? '').trim()
    const m = /^([A-Za-z]+)\s*(\d+)?$/.exec(text)
    if (!m) return { alpha: text.toUpperCase(), num: Number.MAX_SAFE_INTEGER, text }
    return {
      alpha: (m[1] ?? '').toUpperCase(),
      num: Number(m[2] ?? Number.MAX_SAFE_INTEGER),
      text,
    }
  }
  function compareBuildingAsc(a: string, b: string): number {
    const aa = parseBuildingToken(a)
    const bb = parseBuildingToken(b)
    const alphaCmp = aa.alpha.localeCompare(bb.alpha, 'en')
    if (alphaCmp !== 0) return alphaCmp
    if (aa.num !== bb.num) return aa.num - bb.num
    return aa.text.localeCompare(bb.text, 'zh-Hant')
  }
  const sortedProfitGroups = useMemo(() => {
    if (!data) return []
    const firstDateByGroup = new Map<string, string>()
    for (const d of data.details) {
      const key = `${d.dong}\u0001${d.floorLevel}\u0001${d.workPhase}`
      const date = normalizeDateForSort(d.date)
      if (!date) continue
      const got = firstDateByGroup.get(key)
      if (!got || date < got) firstDateByGroup.set(key, date)
    }
    return data.groups.slice().sort((a, b) => {
      const keyA = `${a.dong}\u0001${a.floorLevel}\u0001${a.workPhase}`
      const keyB = `${b.dong}\u0001${b.floorLevel}\u0001${b.workPhase}`
      if (profitSortMode === 'constructionDate') {
        const da = firstDateByGroup.get(keyA) ?? '9999-99-99'
        const db = firstDateByGroup.get(keyB) ?? '9999-99-99'
        const dcmp = da.localeCompare(db)
        if (dcmp !== 0) return dcmp
      }
      if (profitSortMode === 'building') {
        const bcmp = compareBuildingAsc(a.dong, b.dong)
        if (bcmp !== 0) return bcmp
        const fcmp = compareFloorLevelAsc(a.floorLevel, b.floorLevel)
        if (fcmp !== 0) return fcmp
        return a.workPhase.localeCompare(b.workPhase, 'zh-Hant')
      }
      if (profitSortMode === 'floor') {
        const fcmp = compareFloorLevelAsc(a.floorLevel, b.floorLevel)
        if (fcmp !== 0) return fcmp
        const bcmp = compareBuildingAsc(a.dong, b.dong)
        if (bcmp !== 0) return bcmp
        return a.workPhase.localeCompare(b.workPhase, 'zh-Hant')
      }
      if (profitSortMode === 'phase') {
        const pa = normalizeDateForSort(a.workPhase)
        const pb = normalizeDateForSort(b.workPhase)
        if (pa && pb) {
          const pcmp = pa.localeCompare(pb)
          if (pcmp !== 0) return pcmp
        } else if (pa && !pb) {
          return -1
        } else if (!pa && pb) {
          return 1
        }
        const bcmp = compareBuildingAsc(a.dong, b.dong)
        if (bcmp !== 0) return bcmp
        const fcmp = compareFloorLevelAsc(a.floorLevel, b.floorLevel)
        if (fcmp !== 0) return fcmp
        return a.workPhase.localeCompare(b.workPhase, 'zh-Hant')
      }
      return 0
    })
  }, [data, profitSortMode])
  function toggleProfitPanel(key: keyof typeof profitPanelsOpen) {
    setProfitPanelsOpen((prev) => ({ ...prev, [key]: !prev[key] }))
  }
  const contractRowsByBuilding = useMemo(() => {
    const out = new Map<string, typeof sortedContractRows>()
    for (const row of sortedContractRows) {
      const key = row.dong
      const arr = out.get(key) ?? []
      arr.push(row)
      out.set(key, arr)
    }
    return [...out.entries()]
  }, [sortedContractRows])

  function updateContractLine(id: string, patch: Partial<ContractContentLine>) {
    if (!canEdit) return
    setContractContents((prev) => ({
      ...prev,
      lines: prev.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    }))
  }

  function addContractLine() {
    if (!canEdit || !activeSite) return
    setContractContents((prev) => ({
      ...prev,
      lines: [...prev.lines, createContractContentLine(activeSite, prev.lines)],
    }))
  }

  function setActiveSiteContractTargetNet(n: number) {
    if (!canEdit || !activeSite) return
    const key = activeSite.trim()
    setContractContents((prev) => ({
      ...prev,
      siteTotalNetBySite: {
        ...prev.siteTotalNetBySite,
        [key]: Number.isFinite(n) ? n : 0,
      },
    }))
  }

  function removeContractLine(id: string) {
    if (!canEdit) return
    const linkedCount = receivables.entries.filter((x) => (x.contractLineId ?? '').trim() === id).length
    if (linkedCount > 0) {
      window.alert(`此合約列已有 ${linkedCount} 筆收帳綁定，請先在收帳解除或改綁後再刪除。`)
      return
    }
    setContractContents((prev) => ({ ...prev, lines: prev.lines.filter((x) => x.id !== id) }))
  }

  return (
    <div className="panel">
      <h2>案場分析</h2>
      <p className="hint">
        僅供分析，唯讀不回寫。資料來源：工作日誌＋收帳＋薪水月表。收入以收帳掛載；
        棟/樓層/階段以工作日誌分類；薪資與工數依月表同日同案場人員資料計算；儀器成本列入營業費用（儀器）。
      </p>
      <div className="btnRow" style={{ marginBottom: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>案場</span>
          <select value={activeSite} onChange={(e) => setSite(e.target.value)}>
            {siteOptions.length === 0 ? <option value="">（無資料）</option> : null}
            {siteOptions.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!data ? (
        <p className="muted">尚無可分析之案場資料。</p>
      ) : (
        <>
          <div className="siteAnalysisContractBlock">
          <h3 style={{ marginTop: 8 }}>合約內容（可連接收帳）</h3>
          <p className="hint" style={{ marginTop: -2 }}>
            可切換「固定數量」或「手填工數」模式；對帳口徑為未稅對未稅。
          </p>
          <div className="btnRow" style={{ marginBottom: 8, gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>案場合約總價（未稅）</span>
              <PayrollNumberInput
                className="titleInput"
                value={activeSiteContractTargetNet}
                onCommit={setActiveSiteContractTargetNet}
                aria-label="案場合約總價（未稅）"
              />
            </label>
            <span className="muted">
              明細合計：<strong>{fmtMoney(activeSiteContractLinesNet)}</strong>；差額：
              <strong>{fmtMoney(activeSiteContractGapNet)}</strong>
            </span>
          </div>
          <fieldset className="tabFieldset" disabled={!canEdit}>
            <div className="tableScroll">
              <table className="data tight siteAnalysisContractTable">
                <thead>
                  <tr>
                    <th>棟</th>
                    <th>樓層</th>
                    <th>階段</th>
                    <th>計價模式</th>
                    <th>單位</th>
                    <th className="num">合約單價</th>
                    <th className="num">總數量</th>
                    <th className="num">手填工數</th>
                    <th className="num">合約總額(未稅)</th>
                    <th>備註</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {contractRowsForSite.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="muted">
                        尚無合約內容列；可按下方「新增合約列」。
                      </td>
                    </tr>
                  ) : (
                    contractRowsForSite.map((line) => (
                      <tr key={line.id}>
                        <td>
                          <input
                            type="text"
                            className="titleInput"
                            value={line.buildingLabel}
                            onChange={(e) => updateContractLine(line.id, { buildingLabel: e.target.value })}
                            placeholder="例：A棟"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="titleInput"
                            value={line.floorLabel}
                            onChange={(e) => updateContractLine(line.id, { floorLabel: e.target.value })}
                            placeholder="例：3F"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="titleInput"
                            value={line.phaseLabel}
                            onChange={(e) => updateContractLine(line.id, { phaseLabel: e.target.value })}
                            placeholder="例：結構"
                          />
                        </td>
                        <td>
                          <select
                            className="titleInput"
                            value={line.pricingMode}
                            onChange={(e) =>
                              updateContractLine(line.id, {
                                pricingMode:
                                  e.target.value === 'manualWorkDays' ? 'manualWorkDays' : 'fixedQuantity',
                              })
                            }
                          >
                            <option value="fixedQuantity">固定數量</option>
                            <option value="manualWorkDays">手填工數</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="text"
                            className="titleInput"
                            value={line.unit}
                            onChange={(e) => updateContractLine(line.id, { unit: e.target.value })}
                            placeholder="式"
                          />
                        </td>
                        <td className="num">
                          <PayrollNumberInput
                            className="titleInput"
                            value={line.contractUnitPrice}
                            onCommit={(n) => updateContractLine(line.id, { contractUnitPrice: n })}
                            aria-label="合約單價"
                          />
                        </td>
                        <td className="num">
                          {line.pricingMode === 'manualWorkDays' ? (
                            <input type="text" className="titleInput" value={line.contractQuantity} disabled />
                          ) : (
                            <PayrollNumberInput
                              className="titleInput"
                              value={line.contractQuantity}
                              onCommit={(n) => updateContractLine(line.id, { contractQuantity: n })}
                              aria-label="總數量"
                            />
                          )}
                        </td>
                        <td className="num">
                          {line.pricingMode !== 'manualWorkDays' ? (
                            <input type="text" className="titleInput" value={line.manualWorkDays} disabled />
                          ) : (
                            <PayrollNumberInput
                              className="titleInput"
                              value={line.manualWorkDays}
                              onCommit={(n) => updateContractLine(line.id, { manualWorkDays: n })}
                              aria-label="手填工數"
                            />
                          )}
                        </td>
                        <td className="num">{fmtMoney(contractAmountOf(line))}</td>
                        <td>
                          <input
                            type="text"
                            className="titleInput"
                            value={line.note}
                            onChange={(e) => updateContractLine(line.id, { note: e.target.value })}
                            placeholder="選填"
                          />
                        </td>
                        <td>
                          <button type="button" className="btn danger ghost" onClick={() => removeContractLine(line.id)}>
                            刪除
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="btnRow" style={{ marginTop: 8 }}>
              <button type="button" className="btn secondary" onClick={addContractLine} disabled={!activeSite}>
                新增合約列
              </button>
            </div>
          </fieldset>

          <h3 style={{ marginTop: 16 }}>合約對帳（未稅）</h3>
          {sortedContractRows.length === 0 ? (
            <div className="tableScroll">
              <table className="data tight siteAnalysisContractSummaryTable">
                <tbody>
                  <tr>
                    <td colSpan={6} className="muted">
                      尚無合約內容資料。
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="tableScroll siteAnalysisContractBoardsScroll">
              <div className="siteAnalysisContractBoards">
                {contractRowsByBuilding.map(([buildingLabel, rows]) => {
                  const total = rows.reduce(
                    (acc, row) => {
                      acc.contractAmount += row.contractAmount
                      acc.receivableNetLinked += row.receivableNetLinked
                      acc.receivableRemaining += row.receivableRemaining
                      return acc
                    },
                    { contractAmount: 0, receivableNetLinked: 0, receivableRemaining: 0 },
                  )
                  const progress = total.contractAmount > 0 ? total.receivableNetLinked / total.contractAmount : 0
                  const hasAnyReceivable = total.receivableNetLinked > 0
                  return (
                    <section key={buildingLabel} className="siteAnalysisContractBoard">
                      <p className="hint siteAnalysisContractBoardTitle">
                        棟：<strong>{buildingLabel}</strong>
                        <span
                          className={`siteAnalysisContractBoardBadge ${hasAnyReceivable ? 'is-linked' : 'is-unlinked'}`}
                        >
                          {hasAnyReceivable ? '有收帳' : '未收帳'}
                        </span>
                      </p>
                      <table className="data tight siteAnalysisContractSummaryTable">
                        <thead>
                          <tr>
                            <th>樓層</th>
                            <th>階段</th>
                            <th className="num">合約總額</th>
                            <th className="num">已收(綁定)</th>
                            <th className="num">未收</th>
                            <th className="num">達成率</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr
                              key={row.contractLineId}
                              className={row.receivableNetLinked > 0 ? 'contractRow--linked' : 'contractRow--unlinked'}
                            >
                              <td>{row.floorLevel}</td>
                              <td>{row.workPhase}</td>
                              <td className="num">{fmtMoney(row.contractAmount)}</td>
                              <td className="num contractCell--linked">{fmtMoney(row.receivableNetLinked)}</td>
                              <td className="num contractCell--remaining">{fmtMoney(row.receivableRemaining)}</td>
                              <td className="num">{fmtPct(row.receivableProgress)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <th colSpan={2}>本棟合計</th>
                            <th className="num">{fmtMoney(total.contractAmount)}</th>
                            <th className="num">{fmtMoney(total.receivableNetLinked)}</th>
                            <th className="num">{fmtMoney(total.receivableRemaining)}</th>
                            <th className="num">{fmtPct(progress)}</th>
                          </tr>
                        </tfoot>
                      </table>
                    </section>
                  )
                })}
              </div>
            </div>
          )}
          <p className="hint siteAnalysisContractGrandSummary">
            全案合計：合約 <strong>{fmtMoney(data.contractTotals.contractAmount)}</strong>；已收(綁定){' '}
            <strong>{fmtMoney(data.contractTotals.receivableNetLinked)}</strong>；未收{' '}
            <strong>{fmtMoney(data.contractTotals.receivableRemaining)}</strong>；達成率{' '}
            <strong>{fmtPct(data.contractTotals.receivableProgress)}</strong>
          </p>
          <section className="siteAnalysisBlock siteAnalysisBlock--contractSubtotal">
            <h3 style={{ marginTop: 0 }}>棟別小計（未稅）</h3>
            <div className="tableScroll">
              <table className="data tight siteAnalysisContractSummaryTable">
                <thead>
                  <tr>
                    <th>棟</th>
                    <th className="num">合約總額</th>
                    <th className="num">已收(綁定)</th>
                    <th className="num">未收</th>
                    <th className="num">達成率</th>
                  </tr>
                </thead>
                <tbody>
                  {buildingContractRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        尚無可統計之棟別資料。
                      </td>
                    </tr>
                  ) : (
                    buildingContractRows.map((row) => (
                      <tr key={row.buildingLabel}>
                        <td>{row.buildingLabel}</td>
                        <td className="num">{fmtMoney(row.contractAmount)}</td>
                        <td className="num">{fmtMoney(row.receivableNetLinked)}</td>
                        <td className="num">{fmtMoney(row.receivableRemaining)}</td>
                        <td className="num">{fmtPct(row.receivableProgress)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
          </div>

          <section className="siteAnalysisBlock siteAnalysisBlock--profit">
            <div className="btnRow" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h3 style={{ marginTop: 0, marginBottom: 0 }}>案場損益分析（未稅）</h3>
              <div className="btnRow" style={{ gap: 8, alignItems: 'center' }}>
                <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <span>排序</span>
                  <select
                    className="titleInput"
                    value={profitSortMode}
                    onChange={(e) => setProfitSortMode((e.target.value as ProfitSortMode) || 'constructionDate')}
                  >
                    <option value="constructionDate">施工日期</option>
                    <option value="building">棟</option>
                    <option value="floor">樓層</option>
                    <option value="phase">階段</option>
                  </select>
                </label>
                <button type="button" className="btn secondary ghost" onClick={() => toggleProfitPanel('total')}>
                  {profitPanelsOpen.total ? '收合' : '展開'}
                </button>
              </div>
            </div>
            {profitPanelsOpen.total ? (
              <div className="tableScroll">
                <table className="data tight">
                  <thead>
                    <tr>
                      <th>棟</th>
                      <th>樓層</th>
                      <th>階段</th>
                      <th>營收(未稅)</th>
                      <th>薪資</th>
                      <th>餐費</th>
                      <th>直接成本</th>
                      <th>毛利</th>
                      <th>毛利率</th>
                      <th title="儀器成本列入營業費用">營業費用(儀器)</th>
                      <th>淨利</th>
                      <th>淨利率</th>
                      <th>出工天數</th>
                      <th>每工天毛利</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProfitGroups.map((g, idx) => (
                      <tr key={`${g.dong}-${g.floorLevel}-${g.workPhase}-${idx}`}>
                        <td>{g.dong}</td>
                        <td>{g.floorLevel}</td>
                        <td>{g.workPhase}</td>
                        <td className="num">{fmtMoney(g.revenueNet)}</td>
                        <td className="num">{fmtMoney(g.salaryCost)}</td>
                        <td className="num">{fmtMoney(g.mealCost)}</td>
                        <td className="num">{fmtMoney(g.directCost)}</td>
                        <td className="num">{fmtMoney(g.grossProfit)}</td>
                        <td className="num">{fmtPct(g.grossMargin)}</td>
                        <td className="num" title="儀器成本列入營業費用">
                          {fmtMoney(g.operatingExpenseAllocated)}
                        </td>
                        <td className="num">{fmtMoney(g.netProfit)}</td>
                        <td className="num">{fmtPct(g.netMargin)}</td>
                        <td className="num">{g.workDays.toFixed(2)}</td>
                        <td className="num">{fmtMoney(g.grossPerWorkDay)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={3}>案場合計</th>
                      <th className="num">{fmtMoney(data.totals.revenueNet)}</th>
                      <th className="num">{fmtMoney(data.totals.salaryCost)}</th>
                      <th className="num">{fmtMoney(data.totals.mealCost)}</th>
                      <th className="num">{fmtMoney(data.totals.directCost)}</th>
                      <th className="num">{fmtMoney(data.totals.grossProfit)}</th>
                      <th className="num">{fmtPct(data.totals.grossMargin)}</th>
                      <th className="num" title="儀器成本列入營業費用">
                        {fmtMoney(data.totals.operatingExpenseAllocated)}
                      </th>
                      <th className="num">{fmtMoney(data.totals.netProfit)}</th>
                      <th className="num">{fmtPct(data.totals.netMargin)}</th>
                      <th className="num">{data.totals.workDays.toFixed(2)}</th>
                      <th className="num">{fmtMoney(data.totals.grossPerWorkDay)}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : null}
          </section>
          <section className="siteAnalysisBlock siteAnalysisBlock--profit">
            <div className="btnRow" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h3 style={{ marginTop: 0, marginBottom: 0 }}>每棟分析（未稅）</h3>
              <button type="button" className="btn secondary ghost" onClick={() => toggleProfitPanel('byBuilding')}>
                {profitPanelsOpen.byBuilding ? '收合' : '展開'}
              </button>
            </div>
            {profitPanelsOpen.byBuilding ? (
              <div className="tableScroll">
                <table className="data tight">
                  <thead>
                    <tr>
                      <th>棟</th>
                      <th>營收(未稅)</th>
                      <th>薪資</th>
                      <th>餐費</th>
                      <th>直接成本</th>
                      <th>毛利</th>
                      <th>毛利率</th>
                      <th title="儀器成本列入營業費用">營業費用(儀器)</th>
                      <th>淨利</th>
                      <th>淨利率</th>
                      <th>出工天數</th>
                      <th>每工天毛利</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buildingAnalysisRows.map((g) => (
                      <tr key={g.dong}>
                        <td>{g.dong}</td>
                        <td className="num">{fmtMoney(g.revenueNet)}</td>
                        <td className="num">{fmtMoney(g.salaryCost)}</td>
                        <td className="num">{fmtMoney(g.mealCost)}</td>
                        <td className="num">{fmtMoney(g.directCost)}</td>
                        <td className="num">{fmtMoney(g.grossProfit)}</td>
                        <td className="num">{fmtPct(g.grossMargin)}</td>
                        <td className="num">{fmtMoney(g.operatingExpenseAllocated)}</td>
                        <td className="num">{fmtMoney(g.netProfit)}</td>
                        <td className="num">{fmtPct(g.netMargin)}</td>
                        <td className="num">{g.workDays.toFixed(2)}</td>
                        <td className="num">{fmtMoney(g.grossPerWorkDay)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
          <section className="siteAnalysisBlock siteAnalysisBlock--profit">
            <div className="btnRow" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h3 style={{ marginTop: 0, marginBottom: 0 }}>每樓層分析（未稅）</h3>
              <button type="button" className="btn secondary ghost" onClick={() => toggleProfitPanel('byFloor')}>
                {profitPanelsOpen.byFloor ? '收合' : '展開'}
              </button>
            </div>
            {profitPanelsOpen.byFloor ? (
              <div className="tableScroll">
                <table className="data tight">
                  <thead>
                    <tr>
                      <th>樓層</th>
                      <th>營收(未稅)</th>
                      <th>薪資</th>
                      <th>餐費</th>
                      <th>直接成本</th>
                      <th>毛利</th>
                      <th>毛利率</th>
                      <th title="儀器成本列入營業費用">營業費用(儀器)</th>
                      <th>淨利</th>
                      <th>淨利率</th>
                      <th>出工天數</th>
                      <th>每工天毛利</th>
                    </tr>
                  </thead>
                  <tbody>
                    {floorAnalysisRows.map((g) => (
                      <tr key={g.floorLevel}>
                        <td>{g.floorLevel}</td>
                        <td className="num">{fmtMoney(g.revenueNet)}</td>
                        <td className="num">{fmtMoney(g.salaryCost)}</td>
                        <td className="num">{fmtMoney(g.mealCost)}</td>
                        <td className="num">{fmtMoney(g.directCost)}</td>
                        <td className="num">{fmtMoney(g.grossProfit)}</td>
                        <td className="num">{fmtPct(g.grossMargin)}</td>
                        <td className="num">{fmtMoney(g.operatingExpenseAllocated)}</td>
                        <td className="num">{fmtMoney(g.netProfit)}</td>
                        <td className="num">{fmtPct(g.netMargin)}</td>
                        <td className="num">{g.workDays.toFixed(2)}</td>
                        <td className="num">{fmtMoney(g.grossPerWorkDay)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
          <section className="siteAnalysisBlock siteAnalysisBlock--profit">
            <div className="btnRow" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h3 style={{ marginTop: 0, marginBottom: 0 }}>每階段分析（未稅）</h3>
              <button type="button" className="btn secondary ghost" onClick={() => toggleProfitPanel('byPhase')}>
                {profitPanelsOpen.byPhase ? '收合' : '展開'}
              </button>
            </div>
            {profitPanelsOpen.byPhase ? (
              <div className="tableScroll">
                <table className="data tight">
                  <thead>
                    <tr>
                      <th>階段</th>
                      <th>營收(未稅)</th>
                      <th>薪資</th>
                      <th>餐費</th>
                      <th>直接成本</th>
                      <th>毛利</th>
                      <th>毛利率</th>
                      <th title="儀器成本列入營業費用">營業費用(儀器)</th>
                      <th>淨利</th>
                      <th>淨利率</th>
                      <th>出工天數</th>
                      <th>每工天毛利</th>
                    </tr>
                  </thead>
                  <tbody>
                    {phaseAnalysisRows.map((g) => (
                      <tr key={g.workPhase}>
                        <td>{g.workPhase}</td>
                        <td className="num">{fmtMoney(g.revenueNet)}</td>
                        <td className="num">{fmtMoney(g.salaryCost)}</td>
                        <td className="num">{fmtMoney(g.mealCost)}</td>
                        <td className="num">{fmtMoney(g.directCost)}</td>
                        <td className="num">{fmtMoney(g.grossProfit)}</td>
                        <td className="num">{fmtPct(g.grossMargin)}</td>
                        <td className="num">{fmtMoney(g.operatingExpenseAllocated)}</td>
                        <td className="num">{fmtMoney(g.netProfit)}</td>
                        <td className="num">{fmtPct(g.netMargin)}</td>
                        <td className="num">{g.workDays.toFixed(2)}</td>
                        <td className="num">{fmtMoney(g.grossPerWorkDay)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <h3 style={{ marginTop: 16 }}>出工紀錄（日期排序）</h3>
          <div className="tableScroll">
            <table className="data tight">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>棟</th>
                  <th>樓層</th>
                  <th>階段</th>
                  <th>工作內容</th>
                  <th>人數</th>
                  <th>完整施工人員</th>
                  <th>工天</th>
                  <th>薪資</th>
                  <th>餐費</th>
                  <th>儀器</th>
                  <th>備註</th>
                </tr>
              </thead>
              <tbody>
                {data.details.map((d, idx) => (
                  <tr key={`${d.date}-${d.dong}-${d.floorLevel}-${d.workPhase}-${idx}`}>
                    <td>{d.date}</td>
                    <td>{d.dong}</td>
                    <td>{d.floorLevel}</td>
                    <td>{d.workPhase}</td>
                    <td>{d.workItems}</td>
                    <td className="num">{d.staffCount}</td>
                    <td>{d.staffNames}</td>
                    <td className="num">{d.workDays.toFixed(2)}</td>
                    <td className="num">{fmtMoney(d.salaryCost)}</td>
                    <td className="num">{fmtMoney(d.mealCost)}</td>
                    <td className="num">{fmtMoney(d.instrumentCost)}</td>
                    <td>{d.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

