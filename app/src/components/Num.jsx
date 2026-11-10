// Numbers that stay still while they count (Poppins has no tabular figures): each digit sits in a fixed .64em slot,
// separators (comma, period, space, no-break and narrow no-break space) in a .32em slot. The full number is the
// accessible name; the slots are hidden from screen readers.
const SEP = /[,.\s  ]/
export default function Num({ value, className = '' }) {
  const s = String(value)
  return (
    <span className={`num ${className}`.trim()} role="img" aria-label={s}>
      {[...s].map((ch, i) => (
        <span key={i} aria-hidden="true" className={/\d/.test(ch) ? 'num-d' : SEP.test(ch) ? 'num-s' : 'num-o'}>{ch}</span>
      ))}
    </span>
  )
}
