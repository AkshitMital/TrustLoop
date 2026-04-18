import { InlineSpinner } from './inline-spinner'
import type { AttackCaseDoc } from '../types/app'

const severityTone = {
  low: 'bg-cyan-500/10 text-cyan-200 ring-cyan-400/20',
  medium: 'bg-amber-500/10 text-amber-200 ring-amber-400/20',
  high: 'bg-rose-500/10 text-rose-200 ring-rose-500/20',
} as const

const resultTone = {
  pass: 'bg-emerald-500/10 text-emerald-200 ring-emerald-400/20',
  fail: 'bg-amber-500/10 text-amber-200 ring-amber-400/20',
  error: 'bg-rose-500/10 text-rose-200 ring-rose-500/20',
  not_run: 'bg-white/5 text-slate-400 ring-white/10',
} as const

interface AttackCaseCardProps {
  attackCase: AttackCaseDoc
  isActive?: boolean
  isDimmed?: boolean
  delayMs?: number
}

export function AttackCaseCard({
  attackCase,
  isActive = false,
  isDimmed = false,
  delayMs = 0,
}: AttackCaseCardProps) {
  return (
    <article
      style={{ animationDelay: `${delayMs}ms` }}
      className={`group motion-card-reveal rounded-2xl border p-4 transition-all duration-300 hover:border-white/10 hover:bg-white/[0.04] ${
        isActive
          ? 'attack-card-live border-cyan-300/18 bg-white/[0.05]'
          : 'border-white/5 bg-white/[0.02]'
      } ${isDimmed ? 'opacity-60' : ''}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium text-white transition-colors group-hover:text-cyan-100">
            {attackCase.title}
          </h3>
          <p className="mt-1 text-[10px] uppercase tracking-[0.26em] text-slate-500">
            {attackCase.category.replaceAll('_', ' ')}
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-medium ring-1 ${severityTone[attackCase.severity]}`}
          >
            {attackCase.severity}
          </span>
          {attackCase.result === 'not_run' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-medium text-slate-300 ring-1 ring-white/10">
              <InlineSpinner size="xs" tone="light" />
              pending
            </span>
          ) : (
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-medium ring-1 ${resultTone[attackCase.result]}`}
            >
              {attackCase.result.replaceAll('_', ' ')}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-300">
        <div className="min-w-0">
          <p className="mb-1 text-[10px] uppercase tracking-[0.26em] text-slate-500">
            Input
          </p>
          <code className="block max-w-full overflow-hidden rounded-xl bg-black/30 px-3 py-2 text-xs text-slate-200 truncate">
            {attackCase.inputPreview}
          </code>
        </div>
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-[0.26em] text-slate-500">
            Expected outcome
          </p>
          <p className="line-clamp-2">{attackCase.expectedOutcome}</p>
        </div>
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-[0.26em] text-slate-500">
            Why this matters
          </p>
          <p className="line-clamp-2">{attackCase.whyThisCaseMatters}</p>
        </div>
        {attackCase.evidence ? (
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-[0.26em] text-slate-500">
              Evidence
            </p>
            <p className="line-clamp-2 text-amber-100">{attackCase.evidence}</p>
          </div>
        ) : null}
      </div>
    </article>
  )
}
