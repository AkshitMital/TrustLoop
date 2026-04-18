import { Link } from 'react-router-dom'
import type { RunListItem } from '../types/app'
import {
  formatGitHubRepoLabel,
  formatTimestamp,
  humanizeSourceType,
} from '../lib/format'
import { ProviderBadge } from './provider-badge'
import { ScorePill } from './score-pill'
import { StatusBadge } from './status-badge'

interface RunCardProps {
  run: RunListItem
}

export function RunCard({ run }: RunCardProps) {
  const latestIterationNumber = run.latestVersionNumber ?? run.currentVersionNumber
  const scoreLabel = run.passFail === 'pending' ? 'current score' : 'best score'
  const isLive =
    run.passFail === 'pending' &&
    run.status !== 'queued' &&
    run.status !== 'completed' &&
    run.status !== 'error'

  return (
    <Link
      to={`/runs/${run._id}`}
      className={`glass group relative flex flex-col gap-4 overflow-hidden rounded-3xl p-5 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-white/[0.07] ${
        isLive ? 'panel-busy' : ''
      }`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-[11px] uppercase tracking-[0.28em] text-slate-500">
            {humanizeSourceType(run.sourceType)}
          </p>
          <h3 className="break-words text-lg font-semibold text-white">{run.title}</h3>
          {run.githubContext ? (
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
              <span className="rounded-full bg-white/[0.05] px-3 py-1">
                {formatGitHubRepoLabel(run.githubContext)}
              </span>
              <span className="rounded-full bg-white/[0.05] px-3 py-1">
                {run.githubContext.filePath}
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:flex-col md:items-end">
          <StatusBadge status={run.status} passFail={run.passFail} />
          <ProviderBadge provider={run.provider} />
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(9.75rem,10.5rem)] xl:items-stretch">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0 rounded-2xl bg-white/[0.04] p-3">
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
              Latest iteration
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {latestIterationNumber || '—'}
            </p>
          </div>
          <div className="min-w-0 rounded-2xl bg-white/[0.04] p-3">
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Updated</p>
            <p className="mt-2 break-words text-sm leading-6 text-slate-300">
              {formatTimestamp(run.updatedAt)}
            </p>
          </div>
          <div className="min-w-0 rounded-2xl bg-white/[0.04] p-3">
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Language</p>
            <p className="mt-2 overflow-hidden text-ellipsis text-base font-semibold text-white sm:text-lg">
              TypeScript
            </p>
          </div>
          <div className="min-w-0 rounded-2xl bg-white/[0.04] p-3">
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Provider</p>
            <p className="mt-2 overflow-hidden text-ellipsis text-sm font-medium text-white">
              {run.provider.label}
            </p>
          </div>
        </div>
        <ScorePill
          score={run.currentVersionNumber === 0 ? null : run.currentScore}
          label={scoreLabel}
          busy={isLive}
          compact
          className="w-full xl:h-full xl:min-w-[9.75rem] xl:max-w-[10.5rem]"
        />
      </div>
    </Link>
  )
}
