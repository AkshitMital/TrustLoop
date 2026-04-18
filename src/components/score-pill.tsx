import { InlineSpinner } from './inline-spinner'

interface ScorePillProps {
  score?: number | null
  label?: string
  emphasize?: boolean
  busy?: boolean
  compact?: boolean
  className?: string
}

export function ScorePill({
  score,
  label = 'overall score',
  emphasize = false,
  busy = false,
  compact = false,
  className = '',
}: ScorePillProps) {
  const tone =
    score == null
      ? 'from-slate-700 to-slate-900 text-slate-200 border-white/5'
      : score >= 80
        ? 'from-emerald-400/20 to-emerald-600/10 text-emerald-200 border-emerald-400/20'
        : score >= 60
          ? 'from-amber-400/20 to-amber-700/10 text-amber-100 border-amber-400/20'
          : 'from-rose-500/20 to-rose-700/10 text-rose-100 border-rose-400/20'

  const scoreColor =
    score == null
      ? 'text-slate-400'
      : score >= 80
        ? 'text-emerald-300'
        : score >= 60
        ? 'text-amber-300'
        : 'text-rose-300'

  const spinnerTone =
    score == null ? 'light' : score >= 80 ? 'accent' : score >= 60 ? 'amber' : 'light'

  const paddingClass = compact ? 'px-4 py-3' : 'px-5 py-4'
  const scoreSizeClass = emphasize
    ? 'text-3xl sm:text-4xl'
    : compact
      ? 'text-[1.85rem] leading-none'
      : 'text-2xl'
  const labelClass = compact
    ? 'text-[11px] uppercase tracking-[0.22em] text-slate-400'
    : 'text-xs uppercase tracking-[0.28em] text-slate-400'

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border bg-gradient-to-br transition-all duration-300 ${
        busy ? 'panel-busy' : ''
      } ${tone} ${paddingClass} ${emphasize ? 'sm:min-w-40' : ''} ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div
          className={`min-w-0 font-semibold tracking-tight ${scoreSizeClass} ${scoreColor}`}
        >
          {score == null ? '—' : score}
        </div>
        {busy ? <InlineSpinner size={emphasize ? 'md' : 'sm'} tone={spinnerTone} /> : null}
      </div>
      <div className="mt-1 flex items-center gap-2">
        {busy ? <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-pulse" /> : null}
        <p className={`min-w-0 break-words ${labelClass}`}>
          {label}
        </p>
      </div>
    </div>
  )
}
