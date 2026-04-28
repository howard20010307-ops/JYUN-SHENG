import { useEffect, useMemo, useState, type FocusEvent } from 'react'
import {
  applyFieldworkQuick,
  normalizeQuickSiteKey,
  QUICK_SITE_JUN_ADJUST,
  QUICK_SITE_TSAI_ADJUST,
} from '../domain/fieldworkQuickApply'
import type { MonthLine } from '../domain/ledgerEngine'
import type { QuoteRow } from '../domain/quoteEngine'
import type { SalaryBook } from '../domain/salaryExcelModel'
import {
  DEFAULT_WORK_END,
  DEFAULT_WORK_START,
  mergedWorkItemOptions,
  formatInstrumentQty,
  instrumentQtyAnyPositive,
  parseInstrumentQtyFromDraftStrings,
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
  quoteRows: readonly QuoteRow[]
  workLog: WorkLogState
  setWorkLog: (fn: (prev: WorkLogState) => WorkLogState) => void
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
  quoteRows,
  workLog,
  setWorkLog,
}: Props) {
  const pickerSig = staffPickerKeys.join('\u0001')
  const siteOptions = useMemo(() => {
    const s = new Set<string>([QUICK_SITE_TSAI_ADJUST, QUICK_SITE_JUN_ADJUST])
    for (const m of salaryBook.months) {
      for (const b of m.blocks) {
        const n = b.siteName
        if (n.trim()) s.add(n)
      }
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  }, [salaryBook.months])

  const workItemOptions = useMemo(
    () => mergedWorkItemOptions(quoteRows, workLog.customWorkItemLabels ?? []),
    [quoteRows, workLog.customWorkItemLabels],
  )

  const [iso, setIso] = useState(todayIso)
  const [site, setSite] = useState('')
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [extraNames, setExtraNames] = useState('')
  const [dayVal, setDayVal] = useState('1')
  const [timeStart, setTimeStart] = useState(DEFAULT_WORK_START)
  const [timeEnd, setTimeEnd] = useState(DEFAULT_WORK_END)
  const [workItem, setWorkItem] = useState('')
  const [instrumentTotalStation, setInstrumentTotalStation] = useState('')
  const [instrumentRotatingLaser, setInstrumentRotatingLaser] = useState('')
  const [instrumentLineLaser, setInstrumentLineLaser] = useState('')
  const [remarkQuick, setRemarkQuick] = useState('')
  const [mealAmount, setMealAmount] = useState('')
  const [miscLedger, setMiscLedger] = useState('')
  const [otHoursPerPerson, setOtHoursPerPerson] = useState('')
  const [otManualAmount, setOtManualAmount] = useState('')
  const [otRateLine, setOtRateLine] = useState<'jun' | 'tsai'>('jun')

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
    const miscN = num(miscLedger)
    const r = applyFieldworkQuick(salaryBook, months, {
      isoDate: iso,
      siteName: site,
      workers,
      dayValue: num(dayVal),
      mealLedgerAmount: num(mealAmount),
      miscLedgerAmount: miscN,
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

    const remarkParts: string[] = []
    const hOt = num(otHoursPerPerson)
    if (hOt > 0) {
      remarkParts.push(
        `加班 ${hOt} 時／人（${otRateLine === 'jun' ? '鈞泩' : '蔡董'}日薪線）`,
      )
    }
    const manOt = num(otManualAmount)
    if (manOt !== 0 && hOt <= 0) {
      remarkParts.push(`加班費手動 ${manOt} 元`)
    }
    if (remarkQuick.trim()) remarkParts.push(remarkQuick.trim())

    const wi = workItem.trim()
    const iq = parseInstrumentQtyFromDraftStrings(
      instrumentTotalStation,
      instrumentRotatingLaser,
      instrumentLineLaser,
    )
    const equipStr = instrumentQtyAnyPositive(iq) ? formatInstrumentQty(iq) : ''
    const quickOverlay: QuickApplyTextOverlay = {
      siteName: site.trim(),
      workItem: wi,
      equipment: equipStr,
      remark: remarkParts.join('\n'),
      miscCost: miscN,
      timeStart: padHhmm(timeStart, DEFAULT_WORK_START),
      timeEnd: padHhmm(timeEnd, DEFAULT_WORK_END),
    }

    setWorkLog((w) => {
      let custom = [...(w.customWorkItemLabels ?? [])]
      const opts = mergedWorkItemOptions(quoteRows, custom)
      if (wi && !opts.includes(wi)) {
        custom = [...custom, wi].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
      }
      const w1 = { ...w, customWorkItemLabels: custom }
      return reconcileDayDocumentWithPayrollBook(w1, iso, r.book, staffPickerKeys, quickOverlay)
    })

    alert(`${r.message}\n已依月表同步「整日工作日誌」（${iso}）；案場／人員以月表為準，表單內容已併入本次登記。`)
  }

  return (
    <section className="card">
      <h3>快速登記（出工＋公司帳＋工作日誌）</h3>
      <p className="hint" style={{ marginTop: -4, marginBottom: 10 }}>
        送出後會更新<strong>月表出工／調工支援／加班</strong>與<strong>公司帳</strong>，並依月表<strong>同步「整日工作日誌」</strong>（案場／人員以月表為準，工作內容與備註等會併入本次登記）。
      </p>
      <div className="btnRow" style={{ flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>日期</span>
          <input type="date" value={iso} onChange={(e) => setIso(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 }}>
          <span>地點（案場或調工支援）</span>
          <input
            type="text"
            value={site}
            onChange={(e) => setSite(e.target.value)}
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
          <span>上班（預設 7:30）</span>
          <input
            type="time"
            value={padHhmm(timeStart, DEFAULT_WORK_START)}
            onChange={(e) => setTimeStart(e.target.value)}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>下班（預設 16:30）</span>
          <input
            type="time"
            value={padHhmm(timeEnd, DEFAULT_WORK_END)}
            onChange={(e) => setTimeEnd(e.target.value)}
          />
        </label>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
        <span>工作內容（可自填；選項含放樣估價「細項」字串；新字會加入日誌自訂選項）</span>
        <input
          type="text"
          value={workItem}
          onChange={(e) => setWorkItem(e.target.value)}
          list="fieldwork-workitem-datalist"
          placeholder="選擇或輸入"
        />
        <datalist id="fieldwork-workitem-datalist">
          {workItemOptions.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
        <span>使用儀器（全站儀／旋轉雷射／墨線儀；填台數，0 或空白＝未使用）</span>
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
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
        <span>備註（寫入日誌；可補現場說明）</span>
        <textarea
          rows={2}
          style={{ width: '100%', maxWidth: 520, resize: 'vertical' }}
          value={remarkQuick}
          onChange={(e) => setRemarkQuick(e.target.value)}
        />
      </label>

      <h4 style={{ marginTop: 18, marginBottom: 8 }}>公司帳（選填）</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <fieldset style={fieldsetStyle}>
          <legend>餐費</legend>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 220 }}>
            <span>加帳金額（可正負，0 表示不加；同日誌「餐費」）</span>
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
          <legend>雜項（入公司帳「工具」）</legend>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 220 }}>
            <span>金額（可正負，0 表示不加；同日誌「雜項支出」）</span>
            <input
              type="number"
              className="narrow"
              value={miscLedger}
              onFocus={(e) => clearSingleZeroOnFocus(e, setMiscLedger)}
              onChange={(e) => setMiscLedger(e.target.value)}
              placeholder="0"
            />
          </label>
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
          登記到月表、公司帳與工作日誌
        </button>
      </div>
    </section>
  )
}
