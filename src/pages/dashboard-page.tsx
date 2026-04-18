import { useQuery } from 'convex/react'
import { Link } from 'react-router-dom'
import { api } from '../../convex/_generated/api'
import { EmptyState } from '../components/empty-state'
import { RunCard } from '../components/run-card'
import { SectionCard } from '../components/section-card'
import { useRunLauncher } from '../hooks/use-run-launcher'
import type { RunListItem } from '../types/app'

export function DashboardPage() {
  const runs = useQuery(api.runs.listRuns, {}) as RunListItem[] | undefined
  const { launchRun, isLaunching } = useRunLauncher()

  async function launchSeededDemo() {
    await launchRun({
      title: 'Seeded sanitize input demo',
      sourceType: 'demo',
      sourceText: 'Build a sanitizeUserInput helper for profile fields.',
    })
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Trust loop at a glance"
        eyebrow="Home / Dashboard"
        aside={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void launchSeededDemo()}
              disabled={isLaunching}
              className="rounded-full bg-gradient-to-r from-[var(--accent)] to-[#ffb066] px-4 py-2 text-sm font-medium text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLaunching ? 'Launching…' : 'Load seeded demo'}
            </button>
            <Link
              to="/runs/new"
              className="rounded-full border border-white/12 px-4 py-2 text-sm text-white transition hover:bg-white/6"
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
              <div key={index} className="h-36 animate-pulse rounded-3xl bg-white/[0.04]" />
            ))}
          </div>
        </SectionCard>
      ) : runs.length === 0 ? (
        <EmptyState
          title="No trust runs yet"
          body="Create a custom run or load the seeded sanitize-input demo to get the full fail-then-improve loop on screen immediately."
          action={
            <button
              type="button"
              onClick={() => void launchSeededDemo()}
              disabled={isLaunching}
              className="rounded-full bg-gradient-to-r from-[var(--accent)] to-[#ffb066] px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLaunching ? 'Launching…' : 'Load seeded demo'}
            </button>
          }
        />
      ) : (
        <SectionCard title="Recent runs" eyebrow="Live list">
          <div className="grid gap-4 xl:grid-cols-2">
            {runs.map((run) => (
              <RunCard key={run._id} run={run} />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}
