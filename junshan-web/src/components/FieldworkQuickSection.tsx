import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent } from 'react'
import {
  applyFieldworkQuick,
  normalizeQuickSiteKey,
  QUICK_SITE_JUN_ADJUST,
  QUICK_SITE_TSAI_ADJUST,
} from '../domain/fieldworkQuickApply'
import type { MonthLine } from '../domain/ledgerEngine'
import { isPlaceholderMonthBlockSiteName, type SalaryBook } from '../domain/salaryExcelModel'
import {
  DEFAULT_WORK_END,
  DEFAULT_WORK_START,
  mergedWorkItemOptions,
  formatInstrumentQty,
  instrumentQtyAnyPositive,
  parseInstrumentQtyFromDraftStrings,
  newWorkLogEntityId,
  WORK_LOG_INSTRUMENT_UNIT_PRICE_LINE_LASER,
  WORK_LOG_INSTRUMENT_UNIT_PRICE_ROTATING_LASER,
  WORK_LOG_INSTRUMENT_UNIT_PRICE_TOTAL_STATION,
  type WorkLogState,
} from '../domain/workLogModel'
import {
  reconcileDayDocumentWithPayrollBook,
  type QuickApplyTextOverlay,
} from '../domain/workLogPayrollLink'

type Props = {
  staffPickerKeys: readonly string[]
  salaryBook: SalaryBook
  months: MonthLine[]
  setSalaryBook: (fn: (b: SalaryBook) => SalaryBook) => void
  setMonths: (m: MonthLine[]) => void
  workItemPresetLabels: readonly string[]
  ensureWorkItemLabelsInPresets: (labels: readonly string[]) => void
  workLog: WorkLogState
  setWorkLog: (fn: (prev: WorkLogState) => WorkLogState) => void
  /** 登記成功後呼叫（例如重掛表單以清空欄位） */
  onApplySuccess?: () => void
}

function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function num(v: string): number {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

function padHhmm(s: string, fb: string): string {
  const t = (s || fb).trim()
  const m = /^(\d{1,2}):(\d{2})$/.exec(t)
  if (!m) return fb
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)))
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)))
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** 受控字串數字欄若目前顯示為單一 0，進焦點即清空（與 PayrollNumberInput 一致） */
function clearSingleZeroOnFocus(e: FocusEvent<HTMLInputElement>, set: (s: string) => void) {
  const v = e.target.value.trim()
  if (v === '0' || v === '-0') set('')
}

/**
 * 以滑鼠／觸控點進欄位（含點標籤）再聚焦時視為要打開 datalist；進焦點時清空內容。
 * 僅鍵盤 Tab 聚焦不會清空。
 */
function useClearWhenOpenedByPointer(setter: (v: string) => void) {
  const openedByPointerRef = useRef(false)
  const onPointerDownCapture = useCallback(() => {
    openedByPointerRef.current = true
  }, [])
  const onFocus = useCallback(() => {
    if (openedByPointerRef.current) {
      openedByPointerRef.current = false
      setter('')
    }
  }, [setter])
  const onBlur = useCallback(() => {
    openedByPointerRef.current = false
  }, [])
  return { onPointerDownCapture, onFocus, onBlur }
}

function parseExtraWorkerNames(raw: string): string[] {
  const out: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    for (const seg of line.split(/[,，、;；/|｜\s]+/)) {
      const s = seg.trim()
      if (s) out.push(s)
    }
  }
  return [...new Set(out)]
}

const fieldsetStyle = {
  border: '1px solid var(--border, #ccc)',
  borderRadius: 8,
  padding: '10px 14px',
  margin: 0,
}

export function FieldworkQuickSection({
  staffPickerKeys,
  salaryBook,
  months,
  setSalaryBook,
  setMonths,
  workItemPresetLabels,
  ensureWorkItemLabelsInPresets,
  workLog,
  setWorkLog,
  onApplySuccess,
}: Props) {
  const pickerSig = staffPickerKeys.join('\u0001')
  const siteOptions = useMemo(() => {
    const s = new Set<string>([QUICK_SITE_TSAI_ADJUST, QUICK_SITE_JUN_ADJUST])
    for (const m of salaryBook.months) {
      for (const b of m.blocks) {
        const n = b.siteName
        if (n.trim() && !isPlaceholderMonthBlockSiteName(n)) s.add(n)
      }
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  }, [salaryBook.months])

  const workItemOptions = useMemo(
    () => mergedWorkItemOptions(workItemPresetLabels, workLog.customWorkItemLabels ?? []),
    [workItemPresetLabels, workLog.customWorkItemLabels],
  )

  const [iso, setIso] = useState(todayIso)
  const [site, setSite] = useState('')
  const [dong, setDong] = useState('')
  const [floorLevel, setFloorLevel] = useState('')
  const [workPhase, setWorkPhase] = useState('')
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [extraNames, setExtraNames] = useState('')
  const [dayVal, setDayVal] = useState('1')
  const [timeStart, setTimeStart] = useState(DEFAULT_WORK_START)
  const [timeEnd, setTimeEnd] = useState(DEFAULT_WORK_END)
  const [workLineRows, setWorkLineRows] = useState<{ id: string; label: string }[]>(() => [
    { id: newWorkLogEntityId(), label: '' },
  ])
  const [instrumentTotalStation, setInstrumentTotalStation] = useState('')
  const [instrumentRotatingLaser, setInstrumentRotatingLaser] = useState('')
  const [instrumentLineLaser, setInstrumentLineLaser] = useState('')
  const [mealAmount, setMealAmount] = useState('')
  const [toolRows, setToolRows] = useState<
    { id: string; name: string; qty: string; unit: string; amount: string }[]
  >(() => [{ id: newWorkLogEntityId(), name: '', qty: '', unit: '', amount: '' }])
  const [otHoursPerPerson, setOtHoursPerPerson] = useState('')
  const [otManualAmount, setOtManualAmount] = useState('')
  const [otRateLine, setOtRateLine] = useState<'jun' | 'tsai'>('jun')

  const sitePickClear = useClearWhenOpenedByPointer(setSite)
  const setFirstWorkLineLabel = useCallback((v: string) => {
    setWorkLineRows((rows) => rows.map((r, i) => (i === 0 ? { ...r, label: v } : r)))
  }, [])
  const workLine0PickClear = useClearWhenOpenedByPointer(setFirstWorkLineLabel)

  useEffect(() => {
    const key = normalizeQuickSiteKey(site.trim())
    if (key === QUICK_SITE_TSAI_ADJUST) setOtRateLine('tsai')
    else if (key === QUICK_SITE_JUN_ADJUST) setOtRateLine('jun')
  }, [site])

  useEffect(() => {
    const allowed = new Set(staffPickerKeys)
    setPicked((prev) => {
      const next = new Set<string>()
      for (const p of prev) {
        if (allowed.has(p)) next.add(p)
      }
      return next
    })
  }, [pickerSig, staffPickerKeys])

  function toggle(name: string) {
    setPicked((prev) => {
      const n = new Set(prev)
      if (n.has(name)) n.delete(name)
      else n.add(name)
      return n
    })
  }

  function submit() {
    const extras = parseExtraWorkerNames(extraNames)
    const pickOrdered = staffPickerKeys.filter((n) => picked.has(n))
    const workers: string[] = []
    const seen = new Set<string>()
    for (const w of [...pickOrdered, ...extras]) {
      if (seen.has(w)) continue
      seen.add(w)
      workers.push(w)
    }
    const toolLedgerLines = toolRows
      .map((row) => {
        const qRaw = row.qty.trim()
        const qn = qRaw === '' ? 1 : num(row.qty)
        const qty = Number.isFinite(qn) && qn > 0 ? qn : 1
        return {
          name: row.name.trim(),
          amount: num(row.amount),
          qty,
          unit: row.unit.trim(),
        }
      })
      .filter(
        (row) =>
          row.name ||
          row.amount !== 0 ||
          row.unit ||
          (Number.isFinite(row.qty) && row.qty > 0 && row.qty !== 1),
      )
    const r = applyFieldworkQuick(salaryBook, months, {
      isoDate: iso,
      siteName: site,
      workers,
      dayValue: num(dayVal),
      mealLedgerAmount: num(mealAmount),
      toolLedgerLines: toolLedgerLines.length > 0 ? toolLedgerLines : undefined,
      otHoursPerPerson: num(otHoursPerPerson),
      otManualAmount: num(otManualAmount),
      otRateLine,
    })
    if (!r.ok) {
      alert(r.message)
      return
    }
    setSalaryBook(() => r.book)
    setMonths(r.months)

    const workItemLabels = workLineRows.map((r) => r.label.trim()).filter(Boolean)
    const iq = parseInstrumentQtyFromDraftStrings(
      instrumentTotalStation,
      instrumentRotatingLaser,
      instrumentLineLaser,
    )
    const equipStr = instrumentQtyAnyPositive(iq) ? formatInstrumentQty(iq) : ''
    const quickOverlay: QuickApplyTextOverlay = {
      siteName: site.trim(),
      ...(workItemLabels.length > 0 ? { workItems: workItemLabels } : {}),
      equipment: equipStr,
      ...(toolLedgerLines.length > 0 ? { toolLines: toolLedgerLines } : {}),
      timeStart: padHhmm(timeStart, DEFAULT_WORK_START),
      timeEnd: padHhmm(timeEnd, DEFAULT_WORK_END),
      dong: dong.trim(),
      floorLevel: floorLevel.trim(),
      workPhase: workPhase.trim(),
    }

    const mergedOpts = mergedWorkItemOptions(
      workItemPresetLabels,
      workLog.customWorkItemLabels ?? [],
    )
    const toAdd = workItemLabels.filter((l) => l && !mergedOpts.includes(l))
    if (toAdd.length) ensureWorkItemLabelsInPresets(toAdd)

    setWorkLog((w) =>
      reconcileDayDocumentWithPayrollBook(w, iso, r.book, staffPickerKeys, quickOverlay),
    )

    alert(`${r.message}\n已依月表同步「整日工作日誌」（${iso}）；案場／人員以月表為準，表單內容已併入本次登記。`)
    onApplySuccess?.()
  }

  return (
    <section className="card">
      <h3>快速登記（出工＋公司損益表＋工作日誌）</h3>
      <p className="hint" style={{ marginTop: -4, marginBottom: 10 }}>
        送出後會更新<strong>月表出工／調工支援／加班</strong>與<strong>公司損益表</strong>，並依月表<strong>同步「整日工作日誌」</strong>（案場／人員以月表為準，工作內容會併入本次登記）。
      </p>
      <div className="btnRow" style={{ flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>日期</span>
          <input type="date" value={iso} onChange={(e) => setIso(e.target.value)} />
        </label>
        <label
          style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 }}
          onPointerDownCapture={sitePickClear.onPointerDownCapture}
        >
          <span>地點（案場或調工支援）</span>
          <input
            type="text"
            value={site}
            onChange={(e) => setSite(e.target.value)}
            onPointerDownCapture={sitePickClear.onPointerDownCapture}
            onFocus={sitePickClear.onFocus}
            onBlur={sitePickClear.onBlur}
            placeholder="可選下方或自填"
            list="fieldwork-site-datalist"
          />
          <datalist id="fieldwork-site-datalist">
            {siteOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </datalist>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 72 }}>
          <span>棟</span>
          <input type="text" value={dong} onChange={(e) => setDong(e.target.value)} placeholder="例：A棟" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 72 }}>
          <span>樓層</span>
          <input
            type="text"
            value={floorLevel}
            onChange={(e) => setFloorLevel(e.target.value)}
            placeholder="例：3F"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 88 }}>
          <span>階段</span>
          <input
            type="text"
            value={workPhase}
            onChange={(e) => setWorkPhase(e.target.value)}
            placeholder="例：結構"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>出工天數（每人該日）</span>
          <input
            type="number"
            step={0.25}
            min={0}
            className="narrow"
            value={dayVal}
            onFocus={(e) => clearSingleZeroOnFocus(e, setDayVal)}
            onChange={(e) => setDayVal(e.target.value)}
          />
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="btnRow" style={{ flexWrap: 'wrap', gap: 8 }}>
          {staffPickerKeys.map((name) => (
            <label
              key={name}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={picked.has(name)}
                onChange={() => toggle(name)}
              />
              {name}
            </label>
          ))}
        </div>
        <textarea
          rows={3}
          style={{ marginTop: 8, width: '100%', maxWidth: 480, resize: 'vertical' }}
          aria-label="臨時人員"
          placeholder="臨時人員（可逗號、換行分隔）"
          value={extraNames}
          onChange={(e) => setExtraNames(e.target.value)}
        />
      </div>

      <h4 style={{ marginTop: 18, marginBottom: 8 }}>工作日誌欄位（與日誌頁連動）</h4>
      <div className="btnRow" style={{ flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>上班</span>
          <input
            type="time"
            value={padHhmm(timeStart, DEFAULT_WORK_START)}
            onChange={(e) => setTimeStart(e.target.value)}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>下班</span>
          <input
            type="time"
            value={padHhmm(timeEnd, DEFAULT_WORK_END)}
            onChange={(e) => setTimeEnd(e.target.value)}
          />
        </label>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        <span>工作內容（可複數列，與日誌頁多列工作相同）</span>
        <datalist id="fieldwork-workitem-datalist">
          {workItemOptions.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
        {workLineRows.map((row, idx) => (
          <div
            key={row.id}
            className="btnRow"
            style={{ flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}
          >
            <label
              style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 220px', minWidth: 160 }}
              {...(idx === 0
                ? {
                    onPointerDownCapture: workLine0PickClear.onPointerDownCapture,
                  }
                : {})}
            >
              <span className="muted" style={{ fontSize: 13 }}>
                {idx === 0 ? '工作內容' : `第 ${idx + 1} 列`}
              </span>
              <input
                type="text"
                value={row.label}
                onChange={(e) =>
                  setWorkLineRows((rows) =>
                    rows.map((r, i) => (i === idx ? { ...r, label: e.target.value } : r)),
                  )
                }
                {...(idx === 0
                  ? {
                      onPointerDownCapture: workLine0PickClear.onPointerDownCapture,
                      onFocus: workLine0PickClear.onFocus,
                      onBlur: workLine0PickClear.onBlur,
                    }
                  : {})}
                list="fieldwork-workitem-datalist"
                placeholder="選擇或輸入"
              />
            </label>
            <button
              type="button"
              className="btn secondary"
              disabled={workLineRows.length <= 1}
              onClick={() =>
                setWorkLineRows((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx)))
              }
            >
              移除此列
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn secondary"
          onClick={() =>
            setWorkLineRows((rows) => [...rows, { id: newWorkLogEntityId(), label: '' }])
          }
        >
          新增工作內容列
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
        <span>使用儀器</span>
        <p className="hint muted" style={{ margin: 0, fontSize: 12 }}>
          儀器支出單價（與工作日誌一致）：全站儀 {WORK_LOG_INSTRUMENT_UNIT_PRICE_TOTAL_STATION.toLocaleString()} 元／台、旋轉雷射{' '}
          {WORK_LOG_INSTRUMENT_UNIT_PRICE_ROTATING_LASER.toLocaleString()} 元／台、墨線儀{' '}
          {WORK_LOG_INSTRUMENT_UNIT_PRICE_LINE_LASER.toLocaleString()} 元／台。
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 }}>
            <span>全站儀（台）</span>
            <input
              type="number"
              min={0}
              max={999}
              step={1}
              className="narrow"
              value={instrumentTotalStation}
              onChange={(e) => setInstrumentTotalStation(e.target.value)}
              placeholder="0"
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 }}>
            <span>旋轉雷射（台）</span>
            <input
              type="number"
              min={0}
              max={999}
              step={1}
              className="narrow"
              value={instrumentRotatingLaser}
              onChange={(e) => setInstrumentRotatingLaser(e.target.value)}
              placeholder="0"
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 }}>
            <span>墨線儀（台）</span>
            <input
              type="number"
              min={0}
              max={999}
              step={1}
              className="narrow"
              value={instrumentLineLaser}
              onChange={(e) => setInstrumentLineLaser(e.target.value)}
              placeholder="0"
            />
          </label>
        </div>
      </div>
      <h4 style={{ marginTop: 18, marginBottom: 8 }}>公司損益表（選填）</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <fieldset style={fieldsetStyle}>
          <legend>餐費</legend>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 220 }}>
            <span>加帳金額</span>
            <input
              type="number"
              className="narrow"
              value={mealAmount}
              onFocus={(e) => clearSingleZeroOnFocus(e, setMealAmount)}
              onChange={(e) => setMealAmount(e.target.value)}
              placeholder="0"
            />
          </label>
        </fieldset>

        <fieldset style={fieldsetStyle}>
          <legend>工具（入公司損益表「工具」）</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {toolRows.map((row, idx) => (
              <div
                key={row.id}
                className="btnRow"
                style={{ flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}
              >
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
                  <span>名稱</span>
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) =>
                      setToolRows((rows) =>
                        rows.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r)),
                      )
                    }
                    placeholder="選填"
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 72 }}>
                  <span>數量</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    className="narrow"
                    value={row.qty}
                    onChange={(e) =>
                      setToolRows((rows) =>
                        rows.map((r, i) => (i === idx ? { ...r, qty: e.target.value } : r)),
                      )
                    }
                    placeholder="1"
                    title="空白則視為 1"
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 72 }}>
                  <span>單位</span>
                  <input
                    type="text"
                    value={row.unit}
                    onChange={(e) =>
                      setToolRows((rows) =>
                        rows.map((r, i) => (i === idx ? { ...r, unit: e.target.value } : r)),
                      )
                    }
                    placeholder="組"
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 140 }}>
                  <span>金額（元）</span>
                  <input
                    type="number"
                    className="narrow"
                    value={row.amount}
                    onFocus={(e) =>
                      clearSingleZeroOnFocus(e, (s) =>
                        setToolRows((rows) =>
                          rows.map((r, i) => (i === idx ? { ...r, amount: s } : r)),
                        ),
                      )
                    }
                    onChange={(e) =>
                      setToolRows((rows) =>
                        rows.map((r, i) => (i === idx ? { ...r, amount: e.target.value } : r)),
                      )
                    }
                    placeholder="0"
                  />
                </label>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={toolRows.length <= 1}
                  onClick={() =>
                    setToolRows((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx)))
                  }
                >
                  移除此列
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn secondary"
              onClick={() =>
                setToolRows((rows) => [
                  ...rows,
                  { id: newWorkLogEntityId(), name: '', qty: '', unit: '', amount: '' },
                ])
              }
            >
              新增工具列
            </button>
          </div>
        </fieldset>

        <fieldset style={fieldsetStyle}>
          <legend>加班費</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 16 }}>
                <input
                  type="radio"
                  name="ot-rate-line"
                  checked={otRateLine === 'jun'}
                  onChange={() => setOtRateLine('jun')}
                />
                鈞泩日薪
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="radio"
                  name="ot-rate-line"
                  checked={otRateLine === 'tsai'}
                  onChange={() => setOtRateLine('tsai')}
                />
                蔡董日薪
              </label>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 220 }}>
              <span>每人加班時數</span>
              <input
                type="number"
                step={0.5}
                min={0}
                className="narrow"
                value={otHoursPerPerson}
                onFocus={(e) => clearSingleZeroOnFocus(e, setOtHoursPerPerson)}
                onChange={(e) => setOtHoursPerPerson(e.target.value)}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 220 }}>
              <span>手動加班費（僅在時數為 0 時入帳；可正負）</span>
              <input
                type="number"
                className="narrow"
                value={otManualAmount}
                onFocus={(e) => clearSingleZeroOnFocus(e, setOtManualAmount)}
                onChange={(e) => setOtManualAmount(e.target.value)}
                placeholder="0"
              />
            </label>
          </div>
        </fieldset>
      </div>

      <div className="btnRow" style={{ marginTop: 16 }}>
        <button type="button" className="btn" onClick={submit}>
          登記到月表、公司損益表與工作日誌
        </button>
      </div>
    </section>
  )
}
