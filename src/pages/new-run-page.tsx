import { useAction, useQuery } from 'convex/react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../convex/_generated/api'
import type {
  GitHubConnectRepoResult,
  GitHubConnectionSummary,
} from '../../shared/github'
import type { SourceType } from '../../shared/pipeline'
import { InlineSpinner } from '../components/inline-spinner'
import { IntensityControl } from '../components/intensity-control'
import { SectionCard } from '../components/section-card'
import { useRunLauncher } from '../hooks/use-run-launcher'
import {
  loadGitHubDraft,
  loadRecentGitHubRepos,
  rememberRecentGitHubRepo,
  saveGitHubDraft,
} from '../lib/github-storage'
import {
  formatGitHubRepoLabel,
  formatTimestamp,
  humanizeSourceType,
} from '../lib/format'

export function NewRunPage() {
  const navigate = useNavigate()
  const { launchRun, isLaunching } = useRunLauncher()
  const connectGitHubRepo = useAction(api.github.connectRepo)
  const trackedConnections = useQuery(api.github.listConnections, {}) as
    | GitHubConnectionSummary[]
    | undefined
  const [sourceType, setSourceType] = useState<SourceType>('prompt')
  const [title, setTitle] = useState('')
  const [sourceText, setSourceText] = useState(
    'Build a sanitizeUserInput helper for profile fields.',
  )
  const [attackIntensity, setAttackIntensity] = useState(5)
  const [error, setError] = useState<string | null>(null)
  const [isConnectingGitHub, setIsConnectingGitHub] = useState(false)
  const [connectionSummary, setConnectionSummary] =
    useState<GitHubConnectRepoResult | null>(null)
  const [recentRepos, setRecentRepos] = useState(() => loadRecentGitHubRepos())

  const initialGitHubDraft = useMemo(() => loadGitHubDraft(), [])
  const [githubToken, setGitHubToken] = useState(initialGitHubDraft.token)
  const [githubOwner, setGitHubOwner] = useState(initialGitHubDraft.owner)
  const [githubRepo, setGitHubRepo] = useState(initialGitHubDraft.repo)
  const [githubBranch, setGitHubBranch] = useState(initialGitHubDraft.branch)

  useEffect(() => {
    saveGitHubDraft({
      token: githubToken,
      owner: githubOwner,
      repo: githubRepo,
      branch: githubBranch,
    })
  }, [githubBranch, githubOwner, githubRepo, githubToken])

  const convexSiteUrl = (import.meta.env.VITE_CONVEX_SITE_URL ?? '')
    .trim()
    .replace(/\/+$/, '')
  const showingGitHubMode = sourceType === 'github'
  const isBusy = isLaunching || isConnectingGitHub

  async function handleConnectTrackedRepo() {
    setError(null)
    setConnectionSummary(null)
    setIsConnectingGitHub(true)

    try {
      if (!convexSiteUrl) {
        throw new Error(
          'VITE_CONVEX_SITE_URL is missing. Set it so GitHub can post push webhooks back into TrustLoop.',
        )
      }

      const result = (await connectGitHubRepo({
        token: githubToken.trim(),
        owner: githubOwner.trim(),
        repo: githubRepo.trim(),
        branch: githubBranch.trim(),
        webhookUrl: `${convexSiteUrl}/github/webhook`,
      })) as GitHubConnectRepoResult

      setConnectionSummary(result)
      rememberRecentGitHubRepo({
        owner: result.repo.owner,
        repo: result.repo.repo,
        branch: result.branch,
      })
      setRecentRepos(loadRecentGitHubRepos())

      if (result.createdRuns > 0 && result.webhookStatus === 'active') {
        navigate('/', {
          state: {
            batchLaunch: {
              count: result.createdRuns,
              runIds: result.runIds,
              sourceType: 'github',
              repoLabel: `${result.repo.owner}/${result.repo.repo}`,
              contextMessage: `${result.summary} ${result.webhookMessage}`.trim(),
            },
          },
        })
      }
    } catch (connectError) {
      setError(
        connectError instanceof Error
          ? connectError.message
          : 'The GitHub repo could not be connected.',
      )
    } finally {
      setIsConnectingGitHub(false)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (showingGitHubMode) {
      await handleConnectTrackedRepo()
      return
    }

    if (!sourceText.trim()) {
      setError('Add a prompt or code sample before launching the run.')
      return
    }

    try {
      await launchRun({
        title,
        sourceType,
        sourceText,
      })
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'The run could not be launched.',
      )
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_22rem]">
      <SectionCard
        title="Create a new evaluation run"
        eyebrow="New run"
        busy={isBusy}
      >
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="flex flex-wrap gap-2">
            {(['prompt', 'code', 'github'] as const).map((value) => {
              const active = sourceType === value
              return (
                <button
                  key={value}
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    setSourceType(value)
                    setError(null)
                    setConnectionSummary(null)
                  }}
                  className={`rounded-full px-4 py-2 text-sm transition ${
                    active
                      ? 'bg-cyan-500/15 text-cyan-100 ring-1 ring-cyan-400/25'
                      : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {humanizeSourceType(value)}
                </button>
              )
            })}
          </div>

          {showingGitHubMode ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.07] p-4 text-sm leading-6 text-cyan-50">
                Connect a GitHub repo and branch to baseline-scan every supported JS/TS
                file once. After that, each new commit on the tracked branch triggers
                TrustLoop again for just the changed files.
              </div>

              <div className="rounded-2xl border border-amber-400/18 bg-amber-500/8 p-4 text-sm leading-6 text-amber-100">
                For this tracked-repo mode, the GitHub PAT is stored in Convex so the
                webhook can fetch changed files after future pushes. Use a demo-scoped
                token with repo access and webhook permissions.
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <p className="mb-3 text-[11px] uppercase tracking-[0.28em] text-slate-500">
                  GitHub repo connection
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block md:col-span-2">
                    <span className="mb-2 block text-sm font-medium text-white">
                      Personal access token
                    </span>
                    <input
                      value={githubToken}
                      onChange={(event) => setGitHubToken(event.target.value)}
                      disabled={isBusy}
                      type="password"
                      placeholder="ghp_... with repo + webhook access"
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-cyan-300/40"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-white">Owner</span>
                    <input
                      value={githubOwner}
                      onChange={(event) => setGitHubOwner(event.target.value)}
                      disabled={isBusy}
                      placeholder="openai"
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-cyan-300/40"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-white">Repo</span>
                    <input
                      value={githubRepo}
                      onChange={(event) => setGitHubRepo(event.target.value)}
                      disabled={isBusy}
                      placeholder="trustloop-demo"
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-cyan-300/40"
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="mb-2 block text-sm font-medium text-white">Branch</span>
                    <input
                      value={githubBranch}
                      onChange={(event) => setGitHubBranch(event.target.value)}
                      disabled={isBusy}
                      placeholder="main"
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-cyan-300/40"
                    />
                  </label>
                </div>

                {recentRepos.length > 0 ? (
                  <div className="mt-4">
                    <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-slate-500">
                      Recent repos
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {recentRepos.map((repoItem) => (
                        <button
                          key={`${repoItem.owner}/${repoItem.repo}/${repoItem.branch}`}
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            setGitHubOwner(repoItem.owner)
                            setGitHubRepo(repoItem.repo)
                            setGitHubBranch(repoItem.branch)
                          }}
                          className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/[0.08]"
                        >
                          {repoItem.owner}/{repoItem.repo} · {repoItem.branch}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                      Automatic sync
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      TrustLoop registers a GitHub push webhook at
                      <span className="mx-1 font-[var(--mono)] text-cyan-100">
                        {convexSiteUrl ? `${convexSiteUrl}/github/webhook` : 'missing site URL'}
                      </span>
                      and re-runs only the files changed by later commits.
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={isBusy}
                    className={`inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[var(--accent)] to-[#ffb066] px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70 ${
                      isConnectingGitHub ? 'button-live' : ''
                    }`}
                  >
                    {isConnectingGitHub ? (
                      <InlineSpinner size="sm" tone="dark" />
                    ) : null}
                    {isConnectingGitHub
                      ? 'Connecting repo…'
                      : 'Connect repo & start baseline scan'}
                  </button>
                </div>
              </div>

              {connectionSummary ? (
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                        Latest connection result
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-white">
                        {formatGitHubRepoLabel(connectionSummary.repo)} ·{' '}
                        {connectionSummary.branch}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        {connectionSummary.summary}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm text-slate-200">
                      {connectionSummary.createdRuns} queued run
                      {connectionSummary.createdRuns === 1 ? '' : 's'}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl bg-black/20 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        Head commit
                      </p>
                      <p className="mt-2 text-sm text-slate-200">
                        {connectionSummary.syncedSha.slice(0, 7)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-black/20 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        Webhook
                      </p>
                      <p className="mt-2 text-sm text-slate-200">
                        {connectionSummary.webhookStatus === 'active'
                          ? 'Active'
                          : connectionSummary.webhookStatus === 'missing'
                            ? 'Missing'
                            : 'Error'}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-black/20 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        Webhook note
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-200">
                        {connectionSummary.webhookMessage}
                      </p>
                    </div>
                  </div>

                  {connectionSummary.webhookStatus !== 'active' ? (
                    <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/8 px-4 py-3 text-sm leading-6 text-rose-100">
                      Baseline runs were created, but automatic push-triggered TrustLoop
                      is not armed yet. Reconnect this repo with a token that can manage
                      repository webhooks.
                    </div>
                  ) : null}

                  {connectionSummary.skipped.length > 0 ? (
                    <div className="mt-4 rounded-2xl border border-amber-400/15 bg-amber-500/8 p-4">
                      <p className="mb-3 text-[11px] uppercase tracking-[0.25em] text-amber-100">
                        Skipped files
                      </p>
                      <div className="max-h-56 space-y-2 overflow-y-auto pr-2">
                        {connectionSummary.skipped.map((item) => (
                          <div
                            key={`${item.path}-${item.reason}`}
                            className="rounded-2xl bg-black/15 px-3 py-3 text-sm text-amber-50"
                          >
                            <p className="font-medium">{item.path}</p>
                            <p className="mt-1 text-amber-100/80">{item.reason}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-white">Run title</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={isBusy}
                  placeholder={
                    sourceType === 'prompt'
                      ? 'Checkout payload hardening run'
                      : 'Code trust run'
                  }
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-cyan-300/40"
                />
              </label>

              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/8 p-4 text-sm leading-6 text-amber-100">
                Prompt and code runs only use OpenAI when `OPENAI_API_KEY` is set in
                Convex env. A key in `.env.local` alone will not reach Convex actions.
                After setting the secret, restart `npx convex dev`.
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-white">
                  {humanizeSourceType(sourceType)}
                </span>
                <textarea
                  value={sourceText}
                  onChange={(event) => setSourceText(event.target.value)}
                  disabled={isBusy}
                  rows={sourceType === 'prompt' ? 8 : 16}
                  className="min-h-60 w-full rounded-3xl border border-white/10 bg-black/25 px-4 py-4 font-[var(--mono)] text-sm leading-7 text-slate-100 outline-none transition focus:border-cyan-300/40"
                />
              </label>
            </div>
          )}

          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <IntensityControl
              value={attackIntensity}
              onChange={setAttackIntensity}
              min={1}
              max={8}
              label="Red Team intensity"
              description={`Generate ${attackIntensity} attack cases (1=light probe, 8=comprehensive stress test)`}
            />
          </div>

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}

          {!showingGitHubMode ? (
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={isBusy}
                className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--accent)] to-[#ffb066] px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70 ${
                  isLaunching ? 'button-live' : ''
                }`}
              >
                {isLaunching ? <InlineSpinner size="sm" tone="dark" /> : null}
                {isLaunching ? 'Launching run…' : 'Launch run'}
              </button>
              <Link
                to="/"
                className="rounded-full border border-white/12 px-5 py-2.5 text-sm text-white transition hover:bg-white/6"
              >
                Back to dashboard
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Link
                to="/"
                className="rounded-full border border-white/12 px-5 py-2.5 text-sm text-white transition hover:bg-white/6"
              >
                Back to dashboard
              </Link>
            </div>
          )}

          {isLaunching ? (
            <p className="text-sm leading-6 text-cyan-100">
              Provisioning Maker, Red Team, and the first evaluation pass. You’ll land in
              the cockpit as soon as the run is ready.
            </p>
          ) : null}
          {isConnectingGitHub ? (
            <p className="text-sm leading-6 text-cyan-100">
              Verifying repo access, scanning the branch tree, registering the GitHub
              webhook, and queueing one TrustLoop run per supported source file.
            </p>
          ) : null}
        </form>
      </SectionCard>

      <div className="space-y-6">
        <SectionCard title="Scope guardrails" eyebrow="MVP constraints">
          <ul className="space-y-3 text-sm leading-6 text-slate-300">
            <li>Single-language MVP: JavaScript / TypeScript only.</li>
            <li>Best for one exported function or a small utility file.</li>
            <li>Tracked GitHub mode baseline-scans every supported file on first connect.</li>
            <li>Later commits only trigger runs for changed supported files on the tracked branch.</li>
            <li>Exported utility code executes in the backend evaluator; unsupported samples fall back to analysis-only.</li>
            <li>The loop keeps iterating automatically in Convex until it passes, converges, or hits the high iteration cap.</li>
          </ul>
        </SectionCard>

        {showingGitHubMode ? (
          <SectionCard title="Tracked repos" eyebrow="GitHub sync">
            {trackedConnections === undefined ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }, (_, index) => (
                  <div
                    key={index}
                    className="loading-surface h-28 rounded-3xl border border-white/8"
                  />
                ))}
              </div>
            ) : trackedConnections.length === 0 ? (
              <p className="text-sm leading-6 text-slate-300">
                No tracked repos yet. Connect one above, then new commits on that branch
                will queue fresh TrustLoop runs automatically.
              </p>
            ) : (
              <div className="space-y-3">
                {trackedConnections.map((connection) => (
                  <div
                    key={connection._id}
                    className="rounded-3xl border border-white/8 bg-white/[0.03] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          {connection.owner}/{connection.repo}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Branch {connection.branch}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        <span className="rounded-full bg-white/[0.05] px-3 py-1 text-slate-200">
                          {connection.status.charAt(0).toUpperCase() +
                            connection.status.slice(1)}
                        </span>
                        <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-cyan-100">
                          Webhook{' '}
                          {connection.webhookStatus.charAt(0).toUpperCase() +
                            connection.webhookStatus.slice(1)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2 text-sm text-slate-300">
                      <p>{connection.webhookMessage ?? 'Ready for push-triggered sync.'}</p>
                      {connection.lastProcessedCommitSha ? (
                        <p>
                          Last processed commit:{' '}
                          <span className="font-[var(--mono)] text-cyan-100">
                            {connection.lastProcessedCommitSha.slice(0, 7)}
                          </span>
                        </p>
                      ) : null}
                      {connection.lastSyncAt ? (
                        <p>Last sync: {formatTimestamp(connection.lastSyncAt)}</p>
                      ) : null}
                      {connection.lastError ? (
                        <p className="text-rose-200">{connection.lastError}</p>
                      ) : null}
                    </div>

                    <a
                      href={connection.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex text-sm text-cyan-200 underline-offset-4 hover:underline"
                    >
                      Open {formatGitHubRepoLabel(connection)}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        ) : null}
      </div>
    </div>
  )
}
