import type { PassFail, RunStatus } from '../../shared/pipeline'
import { humanizePassFail, humanizeStatus } from '../lib/format'

interface StatusBadgeProps {
  status?: RunStatus
  passFail?: PassFail
}

const statusColors: Record<string, { bg: string; dot: string; text: string }> = {
  queued: { bg: 'bg-white/5', dot: 'bg-slate-400', text: 'text-slate-300' },
  generating: { bg: 'bg-cyan-500/10', dot: 'bg-cyan-400', text: 'text-cyan-200' },
  attacking: { bg: 'bg-rose-500/10', dot: 'bg-rose-400', text: 'text-rose-200' },
  awaiting_execution: { bg: 'bg-cyan-500/10', dot: 'bg-cyan-400', text: 'text-cyan-200' },
  evaluating: { bg: 'bg-amber-500/10', dot: 'bg-amber-400', text: 'text-amber-200' },
  repairing: { bg: 'bg-amber-500/10', dot: 'bg-amber-400', text: 'text-amber-200' },
  completed: { bg: 'bg-slate-500/10', dot: 'bg-slate-400', text: 'text-slate-300' },
  error: { bg: 'bg-rose-500/10', dot: 'bg-rose-400', text: 'text-rose-200' },
  pass: { bg: 'bg-emerald-500/10', dot: 'bg-emerald-400', text: 'text-emerald-200' },
  fail: { bg: 'bg-rose-500/10', dot: 'bg-rose-400', text: 'text-rose-200' },
  pending: { bg: 'bg-white/5', dot: 'bg-slate-500', text: 'text-slate-400' },
}

const passFailColors: Record<string, { bg: string; dot: string; text: string }> = {
  pass: { bg: 'bg-emerald-500/10', dot: 'bg-emerald-400', text: 'text-emerald-200' },
  fail: { bg: 'bg-rose-500/10', dot: 'bg-rose-400', text: 'text-rose-200' },
}

export function StatusBadge({ status, passFail }: StatusBadgeProps) {
  if (passFail && passFail !== 'pending') {
    const colors = passFailColors[passFail]
    return (
      <span
        className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${colors.bg} ${colors.text}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${colors.dot} animate-pulse`} />
        {humanizePassFail(passFail)}
      </span>
    )
  }

  const key = status || 'pending'
  const colors = statusColors[key] || statusColors.pending
  const isActive = status === 'awaiting_execution' || status === 'evaluating' || status === 'repairing' || status === 'generating'

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${colors.bg} ${colors.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${colors.dot} ${isActive ? 'animate-pulse' : ''}`} />
      {status ? humanizeStatus(status) : 'Pending'}
    </span>
  )
}
