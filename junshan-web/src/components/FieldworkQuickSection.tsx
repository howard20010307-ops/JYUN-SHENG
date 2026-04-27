import { useEffect, useMemo, useState } from 'react'
import {
  applyFieldworkQuick,
  QUICK_SITE_JUN_ADJUST,
  QUICK_SITE_TSAI_ADJUST,
} from '../domain/fieldworkQuickApply'
import type { MonthLine } from '../domain/ledgerEngine'
import type { SalaryBook } from '../domain/salaryExcelModel'

type Props = {
  /** 全書各月曾出現之人員併集（與「鈞泩／蔡董日薪」連動；切換月分仍同一份勾選名單） */
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

/** 臨時人員：換行、逗號／頓號／分號／斜線／空白等皆可分隔多人 */
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
      <p className="hint">
        地點填「<strong>{QUICK_SITE_TSAI_ADJUST}</strong>」或「<strong>{QUICK_SITE_JUN_ADJUST}</strong>」時，出工寫入月表<strong>蔡董調工／鈞泩調工</strong>列，不寫案場格線；加班費會自動對應同一條日薪。
        其餘案名則寫入該日所在月表案場格線。下方<strong>餐費</strong>與<strong>加班費</strong>各自填寫（皆為選填），會加在與日期同日曆月的公司帳欄位。
        有填「每人加班時數」時，會<strong>連動</strong>寫入該月薪水表「鈞泩加班／蔡董加班」時數格（與加班費試算同一條日薪線）；手動金額僅進公司帳、不寫時數。
      </p>
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
            onChange={(e) => setDayVal(e.target.value)}
          />
        </label>
      </div>
      <div style={{ marginTop: 12 }}>
        <div className="hint" style={{ marginBottom: 8 }}>
          施工人員為<strong>全書各月併集名單</strong>（與「鈞泩／蔡董日薪」連動；換月不切換勾選）；登記時會把勾選或臨時輸入的人員<strong>同步補進每一個月的格線與日薪列</strong>。下方可再加臨時人員。
        </div>
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
          placeholder="臨時人員（多人：逗號、頓號、分號、斜線或換行分隔），例：小明、小華 或 每行一位"
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
              onChange={(e) => setMealAmount(e.target.value)}
              placeholder="0"
            />
          </label>
        </fieldset>

        <fieldset style={fieldsetStyle}>
          <legend>加班費</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div className="hint" style={{ marginBottom: 8 }}>
                有填「每人加班時數」時，依日薪÷8自動計算並加在公司帳「加班費」欄，並連動累加該月月表「鈞泩加班」或「蔡董加班」該日時數（與下方日薪線一致）。時數為 0 時才使用下方手動金額（僅公司帳、不寫月表時數）。
              </div>
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
                onChange={(e) => setOtHoursPerPerson(e.target.value)}
                placeholder="例：2，0 則改用手動"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 220 }}>
              <span>手動加班費（僅在時數為 0 時入帳；可正負）</span>
              <input
                type="number"
                className="narrow"
                value={otManualAmount}
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
