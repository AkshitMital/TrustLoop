import type { PassFail, RunStatus } from '../../shared/pipeline'
import { humanizePassFail, humanizeStatus } from '../lib/format'

interface StatusBadgeProps {
  status?: RunStatus
  passFail?: PassFail
}

export function StatusBadge({ status, passFail }: StatusBadgeProps) {
  if (passFail && passFail !== 'pending') {
    const tone =
      passFail === 'pass'
        ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
        : 'bg-rose-500/15 text-rose-300 ring-rose-500/30'
    return (
      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ring-1 ${tone}`}>
        {humanizePassFail(passFail)}
      </span>
    )
  }

  const tone =
    status === 'awaiting_execution'
      ? 'bg-cyan-500/15 text-cyan-200 ring-cyan-400/30'
      : status === 'repairing'
        ? 'bg-amber-500/15 text-amber-200 ring-amber-400/30'
        : status === 'completed'
          ? 'bg-slate-500/15 text-slate-200 ring-slate-300/20'
          : status === 'error'
            ? 'bg-rose-500/15 text-rose-300 ring-rose-500/30'
            : 'bg-white/7 text-slate-200 ring-white/10'

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ring-1 ${tone}`}>
      {status ? humanizeStatus(status) : 'pending'}
    </span>
  )
}
