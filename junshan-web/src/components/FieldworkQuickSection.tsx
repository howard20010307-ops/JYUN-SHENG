import { useEffect, useMemo, useState, type FocusEvent } from 'react'
import {
  applyFieldworkQuick,
  QUICK_SITE_JUN_ADJUST,
  QUICK_SITE_TSAI_ADJUST,
} from '../domain/fieldworkQuickApply'
import type { MonthLine } from '../domain/ledgerEngine'
import type { SalaryBook } from '../domain/salaryExcelModel'

type Props = {
  staffPickerKeys: readonly string[]
  salaryBook: SalaryBook
  months: MonthLine[]
  setSalaryBook: (fn: (b: SalaryBook) => SalaryBook) => void
  setMonths: (m: MonthLine[]) => void
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

  const [iso, setIso] = useState(todayIso)
  const [site, setSite] = useState('')
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [extraNames, setExtraNames] = useState('')
  const [dayVal, setDayVal] = useState('1')
  const [mealAmount, setMealAmount] = useState('')
  const [otHoursPerPerson, setOtHoursPerPerson] = useState('')
  const [otManualAmount, setOtManualAmount] = useState('')
  const [otRateLine, setOtRateLine] = useState<'jun' | 'tsai'>('jun')

  useEffect(() => {
    const t = site.trim()
    if (t === QUICK_SITE_TSAI_ADJUST) setOtRateLine('tsai')
    else if (t === QUICK_SITE_JUN_ADJUST) setOtRateLine('jun')
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
    const r = applyFieldworkQuick(salaryBook, months, {
      isoDate: iso,
      siteName: site,
      workers,
      dayValue: num(dayVal),
      mealLedgerAmount: num(mealAmount),
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
    alert(r.message)
  }

  return (
    <section className="card">
      <h3>快速登記（出工＋公司帳）</h3>
      <div className="btnRow" style={{ flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>日期</span>
          <input type="date" value={iso} onChange={(e) => setIso(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 }}>
          <span>地點（案場）</span>
          <input
            type="text"
            value={site}
            onChange={(e) => setSite(e.target.value)}
            placeholder="可選下方或自填"
            list="fieldwork-site-datalist"
          />
          <datalist id="fieldwork-site-datalist">
            {siteOptions.map((n) => (
              <option key={n} value={n} />
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
          placeholder="臨時人員"
          value={extraNames}
          onChange={(e) => setExtraNames(e.target.value)}
        />
      </div>

      <h4 style={{ marginTop: 18, marginBottom: 8 }}>公司帳（選填）</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <fieldset style={fieldsetStyle}>
          <legend>餐費</legend>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 220 }}>
            <span>加帳金額（可正負，0 表示不加）</span>
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
          登記到月表與公司帳
        </button>
      </div>
    </section>
  )
}
