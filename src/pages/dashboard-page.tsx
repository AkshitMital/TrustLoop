import { useQuery } from 'convex/react'
import { Link } from 'react-router-dom'
import { api } from '../../convex/_generated/api'
import { EmptyState } from '../components/empty-state'
import { RunCard } from '../components/run-card'
import { SectionCard } from '../components/section-card'
import type { RunListItem } from '../types/app'

export function DashboardPage() {
  const runs = useQuery(api.runs.listRuns, {}) as RunListItem[] | undefined

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
              <div key={index} className="h-36 animate-pulse rounded-3xl bg-white/[0.04]" />
            ))}
          </div>
        </SectionCard>
      ) : runs.length === 0 ? (
        <EmptyState
          title="No trust runs yet"
          body="Create a prompt or code run to watch the Maker, Red Team, evaluator, and repair loop harden the result in Convex."
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
