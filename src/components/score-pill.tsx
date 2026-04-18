import { InlineSpinner } from './inline-spinner'

interface ScorePillProps {
  score?: number | null
  label?: string
  emphasize?: boolean
  busy?: boolean
}

export function ScorePill({
  score,
  label = 'overall score',
  emphasize = false,
  busy = false,
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

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border bg-gradient-to-br px-5 py-4 transition-all duration-300 ${
        busy ? 'panel-busy' : ''
      } ${tone} ${emphasize ? 'min-w-40' : ''}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div
          className={`font-semibold tracking-tight ${emphasize ? 'text-4xl' : 'text-2xl'} ${scoreColor}`}
        >
          {score == null ? '—' : score}
        </div>
        {busy ? <InlineSpinner size={emphasize ? 'md' : 'sm'} tone={spinnerTone} /> : null}
      </div>
      <div className="mt-1 flex items-center gap-2">
        {busy ? <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-pulse" /> : null}
        <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{label}</p>
      </div>
    </div>
  )
}
