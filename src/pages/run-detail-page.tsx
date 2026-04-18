import { useQuery } from 'convex/react'
import { useParams } from 'react-router-dom'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { AttackCaseCard } from '../components/attack-case-card'
import { CodeWindow } from '../components/code-window'
import { EmptyState } from '../components/empty-state'
import { MetricBar } from '../components/metric-bar'
import { ScorePill } from '../components/score-pill'
import { SectionCard } from '../components/section-card'
import { StageFeed } from '../components/stage-feed'
import { StatusBadge } from '../components/status-badge'
import { formatDelta, formatTimestamp, truncate } from '../lib/format'
import { useRunAutomation } from '../hooks/use-run-automation'
import type { AttackCaseDoc, FailureDoc, RunDetail } from '../types/app'

export function RunDetailPage() {
  const params = useParams()
  const runId = params.runId as Id<'runs'> | undefined
  const detail = useQuery(api.runs.getRunDetail, runId ? { runId } : 'skip') as
    | RunDetail
    | null
    | undefined

  useRunAutomation(detail)

  if (detail === undefined) {
    return (
      <SectionCard title="Loading run detail" eyebrow="Realtime query">
        <div className="h-[32rem] animate-pulse rounded-3xl bg-white/[0.04]" />
      </SectionCard>
    )
  }

  if (!detail) {
    return (
      <EmptyState
        title="Run not found"
        body="This run does not exist yet, or the Convex backend has not synced it."
      />
    )
  }

  const latestFix = detail.fixSuggestions.at(-1) ?? null
  const scoreDelta = formatDelta(
    detail.currentEval?.overallScore,
    detail.previousEval?.overallScore,
  )

  return (
    <div className="space-y-6">
      <SectionCard
        title={detail.run.title}
        eyebrow="Run detail"
        aside={<StatusBadge status={detail.run.status} passFail={detail.run.passFail} />}
      >
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-white/[0.04] p-4">
              <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Source</p>
              <p className="mt-2 text-sm text-slate-300">{detail.run.sourceType}</p>
            </div>
            <div className="rounded-2xl bg-white/[0.04] p-4">
              <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Iteration</p>
              <p className="mt-2 text-sm text-slate-300">{detail.run.currentVersionNumber}</p>
            </div>
            <div className="rounded-2xl bg-white/[0.04] p-4">
              <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Updated</p>
              <p className="mt-2 text-sm text-slate-300">{formatTimestamp(detail.run.updatedAt)}</p>
            </div>
            <div className="rounded-2xl bg-white/[0.04] p-4">
              <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Delta</p>
              <p className="mt-2 text-sm text-slate-300">{scoreDelta ?? '—'}</p>
            </div>
          </div>
          <ScorePill
            score={detail.currentEval?.overallScore ?? detail.run.currentScore}
            label={
              detail.currentEval?.mode === 'analysis_only'
                ? 'analysis-only score'
                : 'overall score'
            }
            emphasize
          />
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <SectionCard title="Prompt / source artifact" eyebrow="Left panel">
            <div className="space-y-4">
              <div className="rounded-2xl bg-white/[0.04] p-4">
                <p className="mb-2 text-[11px] uppercase tracking-[0.25em] text-slate-500">
                  Original input
                </p>
                <p className="text-sm leading-7 text-slate-200">{detail.run.sourceText}</p>
              </div>
              {detail.currentVersion ? (
                <CodeWindow
                  title={`Version ${detail.currentVersion.versionNumber}`}
                  body={detail.currentVersion.code}
                  footer={detail.currentVersion.changeSummary}
                />
              ) : null}
              {detail.versions.length > 1 ? (
                <CodeWindow
                  title="Version history"
                  body={detail.versions
                    .map(
                      (version) =>
                        `v${version.versionNumber}\n${version.changeSummary}\n${'-'.repeat(40)}`,
                    )
                    .join('\n')}
                />
              ) : null}
            </div>
          </SectionCard>

          <SectionCard title="Before / after comparison" eyebrow="Diff summary">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl bg-white/[0.04] p-4">
                <p className="mb-2 text-[11px] uppercase tracking-[0.25em] text-slate-500">
                  Before
                </p>
                <p className="text-sm leading-7 text-slate-300">
                  {truncate(detail.versions[0]?.changeSummary ?? 'No initial summary yet.', 180)}
                </p>
              </div>
              <div className="rounded-2xl bg-white/[0.04] p-4">
                <p className="mb-2 text-[11px] uppercase tracking-[0.25em] text-slate-500">
                  After
                </p>
                <p className="text-sm leading-7 text-slate-300">
                  {truncate(
                    detail.versions.at(-1)?.changeSummary ?? 'No repaired version yet.',
                    180,
                  )}
                </p>
              </div>
            </div>
            {latestFix ? (
              <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <p className="mb-2 text-[11px] uppercase tracking-[0.25em] text-slate-500">
                  Fix suggestion
                </p>
                <p className="text-sm font-medium text-white">{latestFix.issueSummary}</p>
                <p className="mt-2 text-sm leading-7 text-slate-300">{latestFix.suggestion}</p>
              </div>
            ) : null}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Red Team attack feed" eyebrow="Center panel">
            <div className="space-y-4">
              {detail.currentAttackCases.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Attack cases will appear here once the current version is generated.
                </p>
              ) : (
                detail.currentAttackCases.map((attackCase: AttackCaseDoc) => (
                  <AttackCaseCard key={attackCase._id} attackCase={attackCase} />
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard title="Pipeline log" eyebrow="Loop visibility">
            <StageFeed events={detail.events} />
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard
            title="Score breakdown"
            eyebrow="Right panel"
            aside={
              detail.currentEval ? (
                <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                  {detail.currentEval.mode.replaceAll('_', ' ')}
                </span>
              ) : null
            }
          >
            {detail.currentEval ? (
              <div className="space-y-3">
                <MetricBar
                  label="Correctness"
                  score={detail.currentEval.correctnessScore}
                  rationale={detail.currentEval.breakdown.correctness.rationale}
                />
                <MetricBar
                  label="Robustness"
                  score={detail.currentEval.robustnessScore}
                  rationale={detail.currentEval.breakdown.robustness.rationale}
                />
                <MetricBar
                  label="Security"
                  score={detail.currentEval.securityScore}
                  rationale={detail.currentEval.breakdown.security.rationale}
                />
                <MetricBar
                  label="Performance"
                  score={detail.currentEval.performanceScore}
                  rationale={detail.currentEval.breakdown.performance.rationale}
                />
                <MetricBar
                  label="Code quality"
                  score={detail.currentEval.codeQualityScore}
                  rationale={detail.currentEval.breakdown.codeQuality.rationale}
                />
              </div>
            ) : (
              <p className="text-sm leading-6 text-slate-400">
                The evaluator is still working on the current version.
              </p>
            )}
          </SectionCard>

          <SectionCard title="Failures and evidence" eyebrow="What broke">
            {detail.currentEval ? (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-[11px] uppercase tracking-[0.25em] text-slate-500">
                    Summary
                  </p>
                  <p className="text-sm leading-7 text-slate-300">{detail.currentEval.summary}</p>
                </div>

                <div>
                  <p className="mb-2 text-[11px] uppercase tracking-[0.25em] text-slate-500">
                    Detected failures
                  </p>
                  {detail.currentEval.detectedFailures.length === 0 ? (
                    <p className="text-sm text-emerald-200">No remaining failures on this iteration.</p>
                  ) : (
                    <div className="space-y-3">
                      {detail.currentEval.detectedFailures.map((failure: FailureDoc) => (
                        <div key={`${failure.title}-${failure.category}`} className="rounded-2xl bg-white/[0.04] p-3">
                          <p className="font-medium text-white">{failure.title}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                            {failure.severity} · {failure.category.replaceAll('_', ' ')}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-300">{failure.detail}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                Evidence appears after the current iteration finishes evaluating.
              </p>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
