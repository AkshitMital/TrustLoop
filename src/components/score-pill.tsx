interface ScorePillProps {
  score?: number | null
  label?: string
  emphasize?: boolean
}

export function ScorePill({
  score,
  label = 'overall score',
  emphasize = false,
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

  return (
    <div
      className={`rounded-3xl border bg-gradient-to-br px-5 py-4 transition-all duration-300 ${tone} ${
        emphasize ? 'min-w-40' : ''
      }`}
    >
      <div className={`font-semibold tracking-tight ${emphasize ? 'text-4xl' : 'text-2xl'} ${scoreColor}`}>
        {score == null ? '—' : score}
      </div>
      <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{label}</p>
    </div>
  )
}
