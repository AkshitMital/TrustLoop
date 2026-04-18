import { useEffect, useRef } from 'react'
import { useQuery } from 'convex/react'
import { useParams } from 'react-router-dom'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { AttackCaseCard } from '../components/attack-case-card'
import { CodeWindow } from '../components/code-window'
import { EmptyState } from '../components/empty-state'
import { MetricBar } from '../components/metric-bar'
import { ProviderBadge } from '../components/provider-badge'
import { ScorePill } from '../components/score-pill'
import { SectionCard } from '../components/section-card'
import { StageFeed } from '../components/stage-feed'
import { StatusBadge } from '../components/status-badge'
import {
  formatDelta,
  formatGitHubFileStats,
  formatGitHubRefLabel,
  formatGitHubRepoLabel,
  formatTimestamp,
  humanizeGitHubSourceKind,
  humanizeSourceType,
  humanizeStatus,
  truncate,
} from '../lib/format'
import type { AttackCaseDoc, FailureDoc, RunDetail } from '../types/app'

function groupAttackCasesByVersion(attackCases: AttackCaseDoc[]) {
  const grouped = new Map<number, AttackCaseDoc[]>()

  for (const attackCase of attackCases) {
    const existing = grouped.get(attackCase.versionNumber)
    if (existing) {
      existing.push(attackCase)
    } else {
      grouped.set(attackCase.versionNumber, [attackCase])
    }
  }

  return Array.from(grouped.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([versionNumber, cases]) => ({ versionNumber, cases }))
}

function isLiveStatus(status: RunDetail['run']['status']) {
  return (
    status === 'generating' ||
    status === 'attacking' ||
    status === 'awaiting_execution' ||
    status === 'evaluating' ||
    status === 'repairing'
  )
}

function describeAttackFocus(status: RunDetail['run']['status'], versionNumber: number) {
  switch (status) {
    case 'generating':
      return `Maker is assembling version ${versionNumber} and staging the first adversarial probes.`
    case 'attacking':
      return `Red Team is actively generating and shaping attacks for version ${versionNumber}.`
    case 'awaiting_execution':
      return `Attack cases for version ${versionNumber} are queued and waiting on execution evidence.`
    case 'evaluating':
      return `Eval Engine is scoring version ${versionNumber} against the current attack pack.`
    case 'repairing':
      return `Maker is patching version ${versionNumber} using the latest Red Team findings.`
    case 'completed':
      return `Version ${versionNumber} is the strongest result from the completed loop.`
    case 'error':
      return `Version ${versionNumber} needs attention because the loop ended in an error state.`
    default:
      return `Version ${versionNumber} is staged inside the trust loop.`
  }
}

function metricTileClass(isBusy: boolean) {
  return isBusy
    ? 'min-w-0 rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.08] p-4 shadow-[0_0_24px_rgba(91,208,255,0.10)]'
    : 'min-w-0 rounded-2xl bg-white/[0.04] p-4'
}

export function RunDetailPage() {
  const params = useParams()
  const runId = params.runId as Id<'runs'> | undefined
  const detail = useQuery(api.runs.getRunDetail, runId ? { runId } : 'skip') as
    | RunDetail
    | null
    | undefined
  const activeAttackGroupRef = useRef<HTMLDivElement | null>(null)
  const liveAttackCaseCount = detail?.attackCases.length ?? 0
  const liveAttackFocusVersion = detail
    ? detail.run.passFail === 'pending' && isLiveStatus(detail.run.status)
      ? detail.run.latestVersionNumber ?? detail.run.currentVersionNumber
      : detail.run.currentVersionNumber
    : null

  useEffect(() => {
    if (!detail || !activeAttackGroupRef.current || liveAttackFocusVersion == null) {
      return
    }

    activeAttackGroupRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }, [detail, liveAttackFocusVersion, liveAttackCaseCount])

  if (detail === undefined) {
    return (
      <SectionCard title="Loading run detail" eyebrow="Realtime query" busy>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_20rem]">
          <div className="space-y-4">
            <div className="loading-surface h-56 rounded-3xl border border-white/8" />
            <div className="loading-surface h-72 rounded-3xl border border-white/8" />
          </div>
          <div className="space-y-4">
            <div className="loading-surface h-[32rem] rounded-3xl border border-white/8" />
            <div className="loading-surface h-56 rounded-3xl border border-white/8" />
          </div>
          <div className="space-y-4">
            <div className="loading-surface h-72 rounded-3xl border border-white/8" />
            <div className="loading-surface h-56 rounded-3xl border border-white/8" />
          </div>
        </div>
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

  const latestIterationNumber =
    detail.run.latestVersionNumber ?? detail.run.currentVersionNumber
  const latestFix =
    detail.fixSuggestions.find(
      (fix) => fix.toVersionNumber === detail.currentVersion?.versionNumber,
    ) ??
    detail.fixSuggestions.at(-1) ??
    null
  const scoreDelta = formatDelta(
    detail.currentEval?.overallScore,
    detail.previousEval?.overallScore,
  )
  const sourceIsCode = detail.run.sourceType === 'code' || detail.run.sourceType === 'github'
  const showingBestVersion =
    detail.run.passFail !== 'pending' &&
    latestIterationNumber !== detail.run.currentVersionNumber
  const runIsLive = detail.run.passFail === 'pending' && isLiveStatus(detail.run.status)
  const attackFocusVersion = runIsLive
    ? latestIterationNumber
    : detail.run.currentVersionNumber
  const attackGroups = groupAttackCasesByVersion(detail.attackCases)
  const leftPanelBusy =
    runIsLive &&
    (detail.run.status === 'generating' || detail.run.status === 'repairing')
  const attackPanelBusy = runIsLive
  const scorePanelBusy =
    runIsLive &&
    (detail.run.status === 'awaiting_execution' || detail.run.status === 'evaluating')
  const evidencePanelBusy =
    runIsLive &&
    (detail.run.status === 'evaluating' || detail.run.status === 'repairing')

  return (
    <div className="space-y-6">
      <SectionCard
        title={detail.run.title}
        eyebrow="Run detail"
        busy={runIsLive}
        aside={
          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:flex-col md:items-end">
            <StatusBadge status={detail.run.status} passFail={detail.run.passFail} />
            <ProviderBadge provider={detail.provider} />
          </div>
        }
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] xl:items-stretch">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 min-[1900px]:grid-cols-6">
            <div className={metricTileClass(false)}>
              <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Source</p>
              <p className="mt-2 break-words text-sm text-slate-300">
                {humanizeSourceType(detail.run.sourceType)}
              </p>
            </div>
            <div className={metricTileClass(detail.run.passFail !== 'pending')}>
              <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">
                Best version
              </p>
              <p className="mt-2 text-sm text-slate-300">{detail.run.currentVersionNumber}</p>
            </div>
            <div className={metricTileClass(runIsLive)}>
              <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">
                Latest iteration
              </p>
              <p className="mt-2 text-sm text-slate-300">{latestIterationNumber}</p>
            </div>
            <div className={metricTileClass(false)}>
              <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Updated</p>
              <p className="mt-2 break-words text-sm leading-6 text-slate-300">
                {formatTimestamp(detail.run.updatedAt)}
              </p>
            </div>
            <div className={metricTileClass(runIsLive)}>
              <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Delta</p>
              <p className="mt-2 text-sm text-slate-300">{scoreDelta ?? '—'}</p>
            </div>
            <div className={metricTileClass(runIsLive)}>
              <p className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Provider</p>
              <p className="mt-2 break-words text-sm font-medium text-white">
                {detail.provider.label}
              </p>
              <p className="mt-1 break-words text-xs leading-5 text-slate-400">
                {detail.provider.detail}
              </p>
            </div>
          </div>
          <ScorePill
            score={detail.currentEval?.overallScore ?? detail.run.currentScore}
            label={
              detail.currentEval?.mode === 'analysis_only'
                ? showingBestVersion
                  ? 'analysis-only best score'
                  : 'analysis-only score'
                : showingBestVersion
                  ? 'best score'
                  : 'overall score'
            }
            emphasize
            busy={runIsLive}
            className="w-full xl:h-full"
          />
        </div>
        {showingBestVersion ? (
          <div className="mt-4 rounded-2xl border border-cyan-400/15 bg-cyan-500/8 px-4 py-3 text-sm leading-6 text-cyan-100">
            Displaying the best version from the full loop: version{' '}
            {detail.run.currentVersionNumber}. The run continued through iteration{' '}
            {latestIterationNumber}, but this version earned the strongest result.
          </div>
        ) : null}
      </SectionCard>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <SectionCard
            title="Prompt / source artifact"
            eyebrow="Left panel"
            busy={leftPanelBusy}
          >
            <div className="space-y-4">
              {detail.run.githubContext ? (
                <div className="rounded-2xl bg-white/[0.04] p-4">
                  <p className="mb-2 text-[11px] uppercase tracking-[0.25em] text-slate-500">
                    GitHub source
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-black/20 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        Repo
                      </p>
                      <p className="mt-2 text-sm text-slate-200">
                        {formatGitHubRepoLabel(detail.run.githubContext)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-black/20 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        Source kind
                      </p>
                      <p className="mt-2 text-sm text-slate-200">
                        {humanizeGitHubSourceKind(detail.run.githubContext.sourceKind)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-black/20 px-4 py-3 sm:col-span-2">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        File path
                      </p>
                      <p className="mt-2 break-words text-sm text-slate-200">
                        {detail.run.githubContext.filePath}
                      </p>
                    </div>
                    {formatGitHubRefLabel(detail.run.githubContext) ? (
                      <div className="rounded-2xl bg-black/20 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                          Ref
                        </p>
                        <p className="mt-2 text-sm text-slate-200">
                          {formatGitHubRefLabel(detail.run.githubContext)}
                        </p>
                      </div>
                    ) : null}
                    {formatGitHubFileStats(detail.run.githubContext) ? (
                      <div className="rounded-2xl bg-black/20 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                          Patch stats
                        </p>
                        <p className="mt-2 text-sm text-slate-200">
                          {formatGitHubFileStats(detail.run.githubContext)}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  <a
                    href={detail.run.githubContext.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex rounded-full border border-cyan-400/20 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/18"
                  >
                    Open on GitHub
                  </a>
                </div>
              ) : null}
              <div className="rounded-2xl bg-white/[0.04] p-4">
                <p className="mb-2 text-[11px] uppercase tracking-[0.25em] text-slate-500">
                  {detail.run.sourceType === 'github' ? 'Fetched source' : 'Original input'}
                </p>
                <pre
                  className={`overflow-x-auto rounded-2xl bg-black/20 px-4 py-4 text-sm text-slate-200 [tab-size:2] ${
                    sourceIsCode
                      ? 'font-[var(--mono)] leading-6 whitespace-pre'
                      : 'font-inherit leading-7 whitespace-pre-wrap'
                  }`}
                >
                  {detail.run.sourceText}
                </pre>
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
          <SectionCard
            title="Red Team attack feed"
            eyebrow="Center panel"
            busy={attackPanelBusy}
            aside={
              <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                auto-follow v{attackFocusVersion || latestIterationNumber || 1}
              </span>
            }
          >
            <div className="space-y-4">
              <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/[0.08] px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-100/80">
                  Live track
                </p>
                <p className="mt-2 text-sm font-medium text-white">
                  {runIsLive
                    ? `Tracking version ${attackFocusVersion} while the run is ${humanizeStatus(detail.run.status)}.`
                    : `Showing the strongest available attack pack from version ${attackFocusVersion}.`}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  {describeAttackFocus(detail.run.status, attackFocusVersion || 1)}
                </p>
              </div>

              <div className="scroll-shell">
                <div className="panel-scroll max-h-[38rem] space-y-4 overflow-y-auto pr-2">
                  {attackGroups.length === 0 ? (
                    <p className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-5 text-sm text-slate-400">
                      Attack cases will appear here once the current version is generated.
                    </p>
                  ) : (
                    attackGroups.map((group) => {
                      const isFocused = group.versionNumber === attackFocusVersion
                      const isHistorical =
                        attackFocusVersion != null &&
                        group.versionNumber < attackFocusVersion
                      const isBestVersion =
                        group.versionNumber === detail.run.currentVersionNumber

                      return (
                        <div
                          key={group.versionNumber}
                          ref={isFocused ? activeAttackGroupRef : undefined}
                          className={`rounded-[1.75rem] border p-3 transition-all duration-300 ${
                            isFocused
                              ? 'attack-group-live'
                              : 'border-white/8 bg-white/[0.03]'
                          } ${isHistorical ? 'opacity-70' : ''}`}
                        >
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                                Version {group.versionNumber}
                              </p>
                              <p className="mt-1 text-sm leading-6 text-slate-300">
                                {isFocused
                                  ? describeAttackFocus(
                                      detail.run.status,
                                      group.versionNumber,
                                    )
                                  : `${group.cases.length} attack cases captured for this version.`}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {isBestVersion ? (
                                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-emerald-200 ring-1 ring-emerald-400/20">
                                  best result
                                </span>
                              ) : null}
                              <span
                                className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.22em] ring-1 ${
                                  isFocused
                                    ? 'bg-cyan-500/12 text-cyan-100 ring-cyan-400/20'
                                    : 'bg-white/5 text-slate-400 ring-white/10'
                                }`}
                              >
                                {isFocused && runIsLive ? 'live focus' : `${group.cases.length} cases`}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-3">
                            {group.cases.map((attackCase, index) => (
                              <AttackCaseCard
                                key={attackCase._id}
                                attackCase={attackCase}
                                isActive={isFocused}
                                isDimmed={isHistorical}
                                delayMs={index * 60}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Pipeline log"
            eyebrow="Loop visibility"
            busy={runIsLive}
          >
            <div className="scroll-shell">
              <div className="panel-scroll max-h-[24rem] overflow-y-auto pr-2">
                <StageFeed
                  events={detail.events}
                  liveVersionNumber={attackFocusVersion || undefined}
                />
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard
            title="Score breakdown"
            eyebrow="Right panel"
            busy={scorePanelBusy}
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

          <SectionCard
            title="Failures and evidence"
            eyebrow="What broke"
            busy={evidencePanelBusy}
          >
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
                    <p className="text-sm text-emerald-200">
                      No remaining failures on this iteration.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {detail.currentEval.detectedFailures.map((failure: FailureDoc) => (
                        <div
                          key={`${failure.title}-${failure.category}`}
                          className="rounded-2xl bg-white/[0.04] p-3"
                        >
                          <p className="font-medium text-white">{failure.title}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                            {failure.severity} · {failure.category.replaceAll('_', ' ')}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-300">
                            {failure.detail}
                          </p>
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
