import type { AttackCaseDoc } from '../types/app'

const severityTone = {
  low: 'bg-cyan-500/15 text-cyan-200 ring-cyan-400/25',
  medium: 'bg-amber-500/15 text-amber-200 ring-amber-400/25',
  high: 'bg-rose-500/15 text-rose-200 ring-rose-500/25',
} as const

const resultTone = {
  pass: 'text-emerald-300',
  fail: 'text-amber-200',
  error: 'text-rose-300',
  not_run: 'text-slate-400',
} as const

interface AttackCaseCardProps {
  attackCase: AttackCaseDoc
}

export function AttackCaseCard({ attackCase }: AttackCaseCardProps) {
  return (
    <article className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-white">{attackCase.title}</h3>
          <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
            {attackCase.category.replaceAll('_', ' ')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${severityTone[attackCase.severity]}`}
          >
            {attackCase.severity}
          </span>
          <span className={`text-xs font-medium ${resultTone[attackCase.result]}`}>
            {attackCase.result.replaceAll('_', ' ')}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-300">
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-[0.24em] text-slate-500">Input</p>
          <code className="block overflow-x-auto rounded-xl bg-black/20 px-3 py-2 text-xs text-slate-200">
            {attackCase.inputPreview}
          </code>
        </div>
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-[0.24em] text-slate-500">
            Expected outcome
          </p>
          <p>{attackCase.expectedOutcome}</p>
        </div>
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-[0.24em] text-slate-500">
            Why this matters
          </p>
          <p>{attackCase.whyThisCaseMatters}</p>
        </div>
        {attackCase.evidence ? (
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-[0.24em] text-slate-500">
              Evidence
            </p>
            <p>{attackCase.evidence}</p>
          </div>
        ) : null}
      </div>
    </article>
  )
}
