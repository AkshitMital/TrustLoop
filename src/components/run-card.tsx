import { Link } from 'react-router-dom'
import type { RunListItem } from '../types/app'
import { formatTimestamp } from '../lib/format'
import { ProviderBadge } from './provider-badge'
import { ScorePill } from './score-pill'
import { StatusBadge } from './status-badge'

interface RunCardProps {
  run: RunListItem
}

export function RunCard({ run }: RunCardProps) {
  const latestIterationNumber = run.latestVersionNumber ?? run.currentVersionNumber
  const scoreLabel = run.passFail === 'pending' ? 'current score' : 'best score'

  return (
    <Link
      to={`/runs/${run._id}`}
      className="glass group flex flex-col gap-4 rounded-3xl p-5 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-white/[0.07]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-[0.28em] text-slate-500">
            {run.sourceType}
          </p>
          <h3 className="text-lg font-semibold text-white">{run.title}</h3>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={run.status} passFail={run.passFail} />
          <ProviderBadge provider={run.provider} />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white/[0.04] p-3">
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
              Latest iteration
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {latestIterationNumber || '—'}
            </p>
          </div>
          <div className="rounded-2xl bg-white/[0.04] p-3">
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Updated</p>
            <p className="mt-2 text-sm text-slate-300">{formatTimestamp(run.updatedAt)}</p>
          </div>
          <div className="rounded-2xl bg-white/[0.04] p-3">
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Language</p>
            <p className="mt-2 text-lg font-semibold text-white">TypeScript</p>
          </div>
          <div className="rounded-2xl bg-white/[0.04] p-3">
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Provider</p>
            <p className="mt-2 text-sm font-medium text-white">{run.provider.label}</p>
          </div>
        </div>
        <ScorePill
          score={run.currentVersionNumber === 0 ? null : run.currentScore}
          label={scoreLabel}
        />
      </div>
    </Link>
  )
}
