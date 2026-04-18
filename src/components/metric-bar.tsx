interface MetricBarProps {
  label: string
  score: number
  rationale?: string
}

export function MetricBar({ label, score, rationale }: MetricBarProps) {
  const fill =
    score >= 80
      ? 'from-emerald-300 via-emerald-400 to-teal-400'
      : score >= 60
        ? 'from-amber-300 via-amber-400 to-orange-400'
        : 'from-rose-300 via-rose-400 to-red-400'

  return (
    <div className="space-y-2 rounded-2xl border border-white/8 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-white">{label}</p>
        <span className="text-sm text-slate-300">{score}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/8">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${fill} transition-[width] duration-500`}
          style={{ width: `${score}%` }}
        />
      </div>
      {rationale ? <p className="text-xs leading-5 text-slate-400">{rationale}</p> : null}
    </div>
  )
}
