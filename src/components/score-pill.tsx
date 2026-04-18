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
      ? 'from-slate-700 to-slate-900 text-slate-200'
      : score >= 80
        ? 'from-emerald-400/30 to-emerald-600/10 text-emerald-200'
        : score >= 60
          ? 'from-amber-400/25 to-amber-700/10 text-amber-100'
          : 'from-rose-500/25 to-rose-700/10 text-rose-100'

  return (
    <div
      className={`rounded-3xl border border-white/10 bg-gradient-to-br px-4 py-3 ${tone} ${
        emphasize ? 'min-w-36' : ''
      }`}
    >
      <div className={`font-semibold ${emphasize ? 'text-4xl' : 'text-2xl'}`}>
        {score == null ? '—' : score}
      </div>
      <p className="text-xs uppercase tracking-[0.25em] text-slate-300">{label}</p>
    </div>
  )
}
