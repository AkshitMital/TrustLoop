import { useEffect } from 'react'
import { useQuery } from 'convex/react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../convex/_generated/api'
import { EmptyState } from '../components/empty-state'
import { RunCard } from '../components/run-card'
import { ScorePill } from '../components/score-pill'
import { SectionCard } from '../components/section-card'
import { StatusBadge } from '../components/status-badge'
import {
  formatGitHubPathLabel,
  formatGitHubRefLabel,
  formatGitHubRepoLabel,
  formatTimestamp,
  truncate,
} from '../lib/format'
import type { RunListItem } from '../types/app'

interface DashboardBatchLaunchState {
  batchLaunch?: {
    count: number
    runIds: string[]
    sourceType?: string
    repoLabel?: string
  }
}

interface RepoRunGroup {
  repoKey: string
  repoLabel: string
  runs: RunListItem[]
}

function isRunLive(run: RunListItem) {
  return (
    run.passFail === 'pending' &&
    run.status !== 'queued' &&
    run.status !== 'completed' &&
    run.status !== 'error'
  )
}

function buildDashboardGroups(runs: RunListItem[]) {
  const repoGroups = new Map<string, RepoRunGroup>()
  const standaloneRuns: RunListItem[] = []

  for (const run of runs) {
    if (!run.githubContext) {
      standaloneRuns.push(run)
      continue
    }

    const repoKey = `${run.githubContext.owner}/${run.githubContext.repo}`
    const existingGroup = repoGroups.get(repoKey)

    if (existingGroup) {
      existingGroup.runs.push(run)
      continue
    }

    repoGroups.set(repoKey, {
      repoKey,
      repoLabel: formatGitHubRepoLabel(run.githubContext),
      runs: [run],
    })
  }

  const orderedRepoGroups = Array.from(repoGroups.values())
    .map((group) => ({
      ...group,
      runs: [...group.runs].sort((left, right) => right.updatedAt - left.updatedAt),
    }))
    .sort((left, right) => right.runs[0]!.updatedAt - left.runs[0]!.updatedAt)

  const orderedStandaloneRuns = [...standaloneRuns].sort(
    (left, right) => right.updatedAt - left.updatedAt,
  )

  return {
    repoGroups: orderedRepoGroups,
    standaloneRuns: orderedStandaloneRuns,
  }
}

function RepoRunCard({
  group,
  highlight,
}: {
  group: RepoRunGroup
  highlight: boolean
}) {
  const latestRun = group.runs[0]
  const liveRuns = group.runs.filter(isRunLive)
  const highestScore = group.runs.reduce(
    (best, run) => Math.max(best, run.currentVersionNumber > 0 ? run.currentScore : 0),
    0,
  )
  const completedScores = group.runs
    .filter((run) => run.currentVersionNumber > 0)
    .map((run) => run.currentScore)
  const averageScore =
    completedScores.length > 0
      ? Math.round(
          completedScores.reduce((total, score) => total + score, 0) /
            completedScores.length,
        )
      : null

  return (
    <section
      className={`glass relative overflow-hidden rounded-3xl p-5 shadow-2xl shadow-black/20 transition ${
        liveRuns.length > 0 ? 'panel-busy' : ''
      } ${highlight ? 'ring-1 ring-cyan-300/30' : ''}`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-[11px] uppercase tracking-[0.32em] text-slate-400">
            GitHub Repo
          </p>
          <h3 className="break-words text-xl font-semibold text-white">
            {group.repoLabel}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            One repo card, with each analyzed file nested below as a compact clickable item.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/[0.05] px-3 py-1 text-xs text-slate-300">
            {group.runs.length} file{group.runs.length === 1 ? '' : 's'}
          </span>
          <span className="rounded-full bg-white/[0.05] px-3 py-1 text-xs text-slate-300">
            {liveRuns.length} live
          </span>
          {latestRun?.githubContext ? (
            <span className="rounded-full bg-white/[0.05] px-3 py-1 text-xs text-slate-300">
              {formatGitHubRefLabel(latestRun.githubContext) ?? 'Repo scan'}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl bg-white/[0.04] p-4">
          <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">
            Last updated
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {latestRun ? formatTimestamp(latestRun.updatedAt) : '—'}
          </p>
        </div>
        <div className="rounded-2xl bg-white/[0.04] p-4">
          <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">
            Highest score
          </p>
          <p className="mt-2 text-lg font-semibold text-white">
            {highestScore > 0 ? highestScore : '—'}
          </p>
        </div>
        <ScorePill
          score={averageScore}
          label="average file score"
          compact
          className="h-full"
        />
      </div>

      <div className="mt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
            File analyses
          </p>
          <p className="text-xs text-slate-400">
            Click a file row to open its detailed analysis.
          </p>
        </div>

        <div className="space-y-2">
          {group.runs.map((run) => {
            const fileLabel = run.githubContext
              ? formatGitHubPathLabel(run.githubContext)
              : run.title
            const refLabel = run.githubContext
              ? formatGitHubRefLabel(run.githubContext)
              : null
            const isLive = isRunLive(run)

            return (
              <Link
                key={run._id}
                to={`/runs/${run._id}`}
                className={`group flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 transition hover:border-cyan-300/30 hover:bg-white/[0.07] ${
                  isLive ? 'panel-busy' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="truncate text-sm font-semibold text-white">
                      {fileLabel}
                    </h4>
                    {refLabel ? (
                      <span className="rounded-full bg-white/[0.05] px-2.5 py-0.5 text-[11px] text-slate-400">
                        {refLabel}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-xs leading-5 text-slate-400">
                    {run.githubContext?.filePath ?? truncate(run.title, 72)}
                  </p>
                </div>

                <div className="hidden min-[980px]:block">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Iteration
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-200">
                    {(run.latestVersionNumber ?? run.currentVersionNumber) || '—'}
                  </p>
                </div>

                <div className="hidden min-[1120px]:block">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Updated
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    {formatTimestamp(run.updatedAt)}
                  </p>
                </div>

                <StatusBadge status={run.status} passFail={run.passFail} />

                <div className="w-24 shrink-0">
                  <ScorePill
                    score={run.currentVersionNumber === 0 ? null : run.currentScore}
                    label="score"
                    busy={isLive}
                    compact
                    className="rounded-2xl"
                  />
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export function DashboardPage() {
  const runs = useQuery(api.runs.listRuns, {}) as RunListItem[] | undefined
  const location = useLocation()
  const navigate = useNavigate()
  const batchLaunch = (location.state as DashboardBatchLaunchState | null)?.batchLaunch

  useEffect(() => {
    if (!batchLaunch) {
      return
    }

    navigate(location.pathname, { replace: true, state: null })
  }, [batchLaunch, location.pathname, navigate])

  const { repoGroups, standaloneRuns } = buildDashboardGroups(runs ?? [])

  return (
    <div className="space-y-6">
      <SectionCard
        title="Trust loop at a glance"
        eyebrow="Home / Dashboard"
        aside={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/runs/new"
              className="rounded-full bg-gradient-to-r from-[var(--accent)] to-[#ffb066] px-4 py-2 text-sm font-medium text-slate-950 transition hover:brightness-105"
            >
              New Run
            </Link>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-white/[0.04] p-4">
            <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Story</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Initial code fails, Red Team proves why, Maker repairs, and the score rises.
            </p>
          </div>
          <div className="rounded-2xl bg-white/[0.04] p-4">
            <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Storage</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Runs, versions, attacks, evals, fixes, and events all live in Convex.
            </p>
          </div>
          <div className="rounded-2xl bg-white/[0.04] p-4">
            <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Evaluator</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              A backend evaluator executes exported utility code in Convex and falls back to analysis-only only when execution truly cannot run safely.
            </p>
          </div>
          <div className="rounded-2xl bg-white/[0.04] p-4">
            <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Rubric</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Correctness 35, robustness 25, security 20, performance 10, code quality 10.
            </p>
          </div>
        </div>
      </SectionCard>

      {runs === undefined ? (
        <SectionCard title="Loading runs" eyebrow="Realtime query">
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div
                key={index}
                className="loading-surface h-36 rounded-3xl border border-white/8"
              />
            ))}
          </div>
        </SectionCard>
      ) : runs.length === 0 ? (
        <EmptyState
          title="No trust runs yet"
          body="Create a prompt, code, or GitHub run to watch the Maker, Red Team, evaluator, and repair loop harden the result in Convex."
          action={
            <Link
              to="/runs/new"
              className="rounded-full bg-gradient-to-r from-[var(--accent)] to-[#ffb066] px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:brightness-105"
            >
              Create a run
            </Link>
          }
        />
      ) : (
        <SectionCard title="Recent runs" eyebrow="Live list">
          {batchLaunch ? (
            <div className="mb-4 rounded-2xl border border-cyan-400/15 bg-cyan-500/8 px-4 py-3 text-sm leading-6 text-cyan-50">
              Created {batchLaunch.count} GitHub-backed TrustLoop run
              {batchLaunch.count === 1 ? '' : 's'}
              {batchLaunch.repoLabel ? ` from ${batchLaunch.repoLabel}` : ''}. The newest
              runs are listed below.
            </div>
          ) : null}
          <div className="space-y-4">
            {repoGroups.map((group) => (
              <RepoRunCard
                key={group.repoKey}
                group={group}
                highlight={batchLaunch?.repoLabel === group.repoLabel}
              />
            ))}
            {standaloneRuns.length > 0 ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {standaloneRuns.map((run) => (
                  <RunCard key={run._id} run={run} />
                ))}
              </div>
            ) : null}
          </div>
        </SectionCard>
      )}
    </div>
  )
}
