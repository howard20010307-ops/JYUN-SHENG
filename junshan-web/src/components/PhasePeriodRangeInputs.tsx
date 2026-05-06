import {
  phasePeriodLabelFromIsoRange,
  phaseRangeDateFieldsFromText,
} from '../domain/receivablePhaseRange'

type Props = {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  /** 額外 class 加在最外層（例：worklog 表單縮排） */
  rowClassName?: string
  startAriaLabel?: string
  endAriaLabel?: string
}

/**
 * 階段（期間）：與收帳表相同之雙 `<input type="date">`，存檔字串與 {@link phasePeriodLabelFromIsoRange} 一致。
 */
export function PhasePeriodRangeInputs({
  value,
  onChange,
  disabled,
  rowClassName,
  startAriaLabel = '階段期間起日',
  endAriaLabel = '階段期間迄日',
}: Props) {
  const range = phaseRangeDateFieldsFromText(value)
  return (
    <div
      className={['receivablesTable__phaseRangeRow', rowClassName].filter(Boolean).join(' ')}
    >
      <input
        type="date"
        className={`titleInput receivablesTable__inline receivablesTable__phaseDate${
          range.startDate === '' ? ' is-empty' : ''
        }`}
        value={range.startDate}
        disabled={disabled}
        onChange={(e) => onChange(phasePeriodLabelFromIsoRange(e.target.value, range.endDate))}
        aria-label={startAriaLabel}
      />
      <span className="receivablesTable__phaseSep" aria-hidden>
        ~
      </span>
      <input
        type="date"
        className={`titleInput receivablesTable__inline receivablesTable__phaseDate${
          range.endDate === '' ? ' is-empty' : ''
        }`}
        value={range.endDate}
        disabled={disabled}
        onChange={(e) => onChange(phasePeriodLabelFromIsoRange(range.startDate, e.target.value))}
        aria-label={endAriaLabel}
      />
    </div>
  )
}
