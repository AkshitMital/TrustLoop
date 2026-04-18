import { useAction } from 'convex/react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../convex/_generated/api'
import {
  MAX_GITHUB_BATCH_FILES,
  basename,
  type GitHubPreviewResponse,
  type GitHubSourceKind,
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
  formatGitHubFileStats,
  formatGitHubRefLabel,
  formatGitHubRepoLabel,
  humanizeGitHubSourceKind,
  humanizeSourceType,
} from '../lib/format'

const githubSourceKinds: GitHubSourceKind[] = ['pr_url', 'file_url', 'branch_diff', 'commit']

export function NewRunPage() {
  const { launchRun, launchRuns, isLaunching } = useRunLauncher()
  const previewGitHubSource = useAction(api.github.previewSource)
  const [sourceType, setSourceType] = useState<SourceType>('prompt')
  const [title, setTitle] = useState('')
  const [sourceText, setSourceText] = useState(
    'Build a sanitizeUserInput helper for profile fields.',
  )
  const [attackIntensity, setAttackIntensity] = useState(5)
  const [error, setError] = useState<string | null>(null)
  const [isResolvingGitHub, setIsResolvingGitHub] = useState(false)
  const [githubPreview, setGitHubPreview] = useState<GitHubPreviewResponse | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [recentRepos, setRecentRepos] = useState(() => loadRecentGitHubRepos())

  const initialGitHubDraft = useMemo(() => loadGitHubDraft(), [])
  const [githubToken, setGitHubToken] = useState(initialGitHubDraft.token)
  const [githubOwner, setGitHubOwner] = useState(initialGitHubDraft.owner)
  const [githubRepo, setGitHubRepo] = useState(initialGitHubDraft.repo)
  const [githubSourceKind, setGitHubSourceKind] = useState<GitHubSourceKind>(
    initialGitHubDraft.sourceKind,
  )
  const [prUrl, setPrUrl] = useState(initialGitHubDraft.prUrl)
  const [fileUrl, setFileUrl] = useState(initialGitHubDraft.fileUrl)
  const [baseRef, setBaseRef] = useState(initialGitHubDraft.baseRef)
  const [headRef, setHeadRef] = useState(initialGitHubDraft.headRef)
  const [commitSha, setCommitSha] = useState(initialGitHubDraft.commitSha)

  useEffect(() => {
    saveGitHubDraft({
      token: githubToken,
      owner: githubOwner,
      repo: githubRepo,
      sourceKind: githubSourceKind,
      prUrl,
      fileUrl,
      baseRef,
      headRef,
      commitSha,
    })
  }, [
    baseRef,
    commitSha,
    fileUrl,
    githubOwner,
    githubRepo,
    githubSourceKind,
    githubToken,
    headRef,
    prUrl,
  ])

  async function handleResolveGitHub() {
    setError(null)
    setIsResolvingGitHub(true)

    try {
      const preview = (await previewGitHubSource({
        token: githubToken.trim() || undefined,
        sourceKind: githubSourceKind,
        prUrl: prUrl.trim() || undefined,
        fileUrl: fileUrl.trim() || undefined,
        owner: githubOwner.trim() || undefined,
        repo: githubRepo.trim() || undefined,
        baseRef: baseRef.trim() || undefined,
        headRef: headRef.trim() || undefined,
        commitSha: commitSha.trim() || undefined,
      })) as GitHubPreviewResponse

      setGitHubPreview(preview)
      setSelectedFiles(preview.suggestedSelection.slice(0, MAX_GITHUB_BATCH_FILES))
      setGitHubOwner(preview.repo.owner)
      setGitHubRepo(preview.repo.repo)
      rememberRecentGitHubRepo({
        owner: preview.repo.owner,
        repo: preview.repo.repo,
      })
      setRecentRepos(loadRecentGitHubRepos())
    } catch (resolveError) {
      setGitHubPreview(null)
      setSelectedFiles([])
      setError(
        resolveError instanceof Error
          ? resolveError.message
          : 'GitHub source could not be resolved.',
      )
    } finally {
      setIsResolvingGitHub(false)
    }
  }

  function toggleSelectedFile(path: string) {
    setError(null)
    setSelectedFiles((current) => {
      if (current.includes(path)) {
        return current.filter((value) => value !== path)
      }

      if (current.length >= MAX_GITHUB_BATCH_FILES) {
        setError(`Select up to ${MAX_GITHUB_BATCH_FILES} files per GitHub batch.`)
        return current
      }

      return [...current, path]
    })
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (sourceType === 'github') {
      if (!githubPreview) {
        setError('Resolve a GitHub PR, file, diff, or commit before launching the run.')
        return
      }

      const selectedCandidates = githubPreview.candidates.filter((candidate) =>
        selectedFiles.includes(candidate.filePath),
      )

      if (selectedCandidates.length === 0) {
        setError('Select at least one GitHub file to analyze.')
        return
      }

      const inputs = selectedCandidates.map((candidate) => ({
        title: title.trim() ? `${title.trim()} · ${basename(candidate.filePath)}` : '',
        sourceType: 'github' as const,
        sourceText: candidate.content,
        githubContext: {
          owner: candidate.owner,
          repo: candidate.repo,
          filePath: candidate.filePath,
          sourceKind: candidate.sourceKind,
          htmlUrl: candidate.htmlUrl,
          prNumber: candidate.prNumber,
          commitSha: candidate.commitSha,
          baseRef: candidate.baseRef,
          headRef: candidate.headRef,
          changeStatus: candidate.changeStatus,
          additions: candidate.additions,
          deletions: candidate.deletions,
        },
      }))

      if (inputs.length === 1) {
        await launchRun(inputs[0])
      } else {
        await launchRuns(inputs)
      }

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

  const selectedCount = selectedFiles.length
  const showingGitHubMode = sourceType === 'github'

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_22rem]">
      <SectionCard title="Create a new evaluation run" eyebrow="New run" busy={isLaunching}>
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="flex flex-wrap gap-2">
            {(['prompt', 'code', 'github'] as const).map((value) => {
              const active = sourceType === value
              return (
                <button
                  key={value}
                  type="button"
                  disabled={isLaunching || isResolvingGitHub}
                  onClick={() => {
                    setSourceType(value)
                    setError(null)
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

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white">Run title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={isLaunching}
              placeholder={
                showingGitHubMode
                  ? 'Optional title prefix for GitHub runs'
                  : 'Checkout payload hardening run'
              }
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-cyan-300/40"
            />
          </label>

          {showingGitHubMode ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.07] p-4 text-sm leading-6 text-cyan-50">
                Connect a GitHub repo or paste a PR/file URL. Your PAT stays in browser
                local storage only and is never persisted to Convex.
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <p className="mb-3 text-[11px] uppercase tracking-[0.28em] text-slate-500">
                  GitHub access
                </p>
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <label className="block md:col-span-2">
                    <span className="mb-2 block text-sm font-medium text-white">
                      Personal access token
                    </span>
                    <input
                      value={githubToken}
                      onChange={(event) => setGitHubToken(event.target.value)}
                      disabled={isLaunching || isResolvingGitHub}
                      type="password"
                      placeholder="ghp_... or leave blank for public repos"
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-cyan-300/40"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-white">Owner</span>
                    <input
                      value={githubOwner}
                      onChange={(event) => setGitHubOwner(event.target.value)}
                      disabled={isLaunching || isResolvingGitHub}
                      placeholder="openai"
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-cyan-300/40"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-white">Repo</span>
                    <input
                      value={githubRepo}
                      onChange={(event) => setGitHubRepo(event.target.value)}
                      disabled={isLaunching || isResolvingGitHub}
                      placeholder="trustloop"
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-cyan-300/40"
                    />
                  </label>
                </div>
                {recentRepos.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {recentRepos.map((repoItem) => (
                      <button
                        key={`${repoItem.owner}/${repoItem.repo}`}
                        type="button"
                        disabled={isLaunching || isResolvingGitHub}
                        onClick={() => {
                          setGitHubOwner(repoItem.owner)
                          setGitHubRepo(repoItem.repo)
                        }}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/[0.08]"
                      >
                        {repoItem.owner}/{repoItem.repo}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <p className="mb-3 text-[11px] uppercase tracking-[0.28em] text-slate-500">
                  GitHub source
                </p>
                <div className="flex flex-wrap gap-2">
                  {githubSourceKinds.map((value) => {
                    const active = githubSourceKind === value
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={isLaunching || isResolvingGitHub}
                        onClick={() => {
                          setGitHubSourceKind(value)
                          setError(null)
                        }}
                        className={`rounded-full px-3 py-1.5 text-sm transition ${
                          active
                            ? 'bg-amber-400/15 text-amber-100 ring-1 ring-amber-300/25'
                            : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
                        }`}
                      >
                        {humanizeGitHubSourceKind(value)}
                      </button>
                    )
                  })}
                </div>

                <div className="mt-4 space-y-4">
                  {githubSourceKind === 'pr_url' ? (
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-white">
                        Pull request URL
                      </span>
                      <input
                        value={prUrl}
                        onChange={(event) => setPrUrl(event.target.value)}
                        disabled={isLaunching || isResolvingGitHub}
                        placeholder="https://github.com/owner/repo/pull/42"
                        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-cyan-300/40"
                      />
                    </label>
                  ) : null}

                  {githubSourceKind === 'file_url' ? (
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-white">
                        File URL
                      </span>
                      <input
                        value={fileUrl}
                        onChange={(event) => setFileUrl(event.target.value)}
                        disabled={isLaunching || isResolvingGitHub}
                        placeholder="https://github.com/owner/repo/blob/main/src/utils/sanitize.ts"
                        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-cyan-300/40"
                      />
                    </label>
                  ) : null}

                  {githubSourceKind === 'branch_diff' ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-white">
                          Base ref
                        </span>
                        <input
                          value={baseRef}
                          onChange={(event) => setBaseRef(event.target.value)}
                          disabled={isLaunching || isResolvingGitHub}
                          placeholder="main"
                          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-cyan-300/40"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-white">
                          Head ref
                        </span>
                        <input
                          value={headRef}
                          onChange={(event) => setHeadRef(event.target.value)}
                          disabled={isLaunching || isResolvingGitHub}
                          placeholder="feature/trust-loop"
                          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-cyan-300/40"
                        />
                      </label>
                    </div>
                  ) : null}

                  {githubSourceKind === 'commit' ? (
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-white">
                        Commit SHA
                      </span>
                      <input
                        value={commitSha}
                        onChange={(event) => setCommitSha(event.target.value)}
                        disabled={isLaunching || isResolvingGitHub}
                        placeholder="abc1234 or full commit URL"
                        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-cyan-300/40"
                      />
                    </label>
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={isLaunching || isResolvingGitHub}
                      onClick={handleResolveGitHub}
                      className={`inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/12 px-5 py-2.5 text-sm font-medium text-cyan-50 transition hover:bg-cyan-500/18 ${
                        isResolvingGitHub ? 'button-live' : ''
                      } disabled:cursor-not-allowed disabled:opacity-70`}
                    >
                      {isResolvingGitHub ? <InlineSpinner size="sm" tone="light" /> : null}
                      {isResolvingGitHub ? 'Resolving GitHub source…' : 'Verify Access & Fetch Source'}
                    </button>
                    {githubPreview ? (
                      <p className="self-center text-sm text-slate-300">
                        {githubPreview.summary}
                      </p>
                    ) : (
                      <p className="self-center text-sm text-slate-400">
                        Fetch a GitHub artifact to preview supported files before launching.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {githubPreview ? (
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                        Resolved repo
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-white">
                        {formatGitHubRepoLabel(githubPreview.repo)}
                      </h3>
                      <p className="mt-2 text-sm text-slate-300">
                        {githubPreview.repo.visibility === 'private' ? 'Private' : 'Public'}
                        {githubPreview.repo.defaultBranch
                          ? ` · default ${githubPreview.repo.defaultBranch}`
                          : ''}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm text-slate-200">
                      {selectedCount} selected / {MAX_GITHUB_BATCH_FILES} max
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {githubPreview.candidates.map((candidate) => {
                      const checked = selectedFiles.includes(candidate.filePath)
                      const refLabel = formatGitHubRefLabel(candidate)
                      const statsLabel = formatGitHubFileStats(candidate)

                      return (
                        <button
                          key={candidate.filePath}
                          type="button"
                          onClick={() => toggleSelectedFile(candidate.filePath)}
                          className={`w-full rounded-2xl border p-4 text-left transition ${
                            checked
                              ? 'border-cyan-400/30 bg-cyan-500/[0.08]'
                              : 'border-white/8 bg-black/15 hover:bg-white/[0.04]'
                          }`}
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0">
                              <div className="flex items-center gap-3">
                                <span
                                  className={`h-4 w-4 rounded border ${
                                    checked
                                      ? 'border-cyan-300 bg-cyan-300/20'
                                      : 'border-white/20 bg-transparent'
                                  }`}
                                />
                                <p className="truncate font-medium text-white">
                                  {candidate.filePath}
                                </p>
                              </div>
                              <p className="mt-2 text-sm leading-6 text-slate-300">
                                {candidate.summary}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                                {refLabel ? (
                                  <span className="rounded-full bg-white/[0.05] px-3 py-1">
                                    {refLabel}
                                  </span>
                                ) : null}
                                {statsLabel ? (
                                  <span className="rounded-full bg-white/[0.05] px-3 py-1">
                                    {statsLabel}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <a
                              href={candidate.htmlUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-cyan-200 underline-offset-4 hover:underline"
                              onClick={(event) => event.stopPropagation()}
                            >
                              Open source
                            </a>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {githubPreview.skipped.length > 0 ? (
                    <div className="mt-4 rounded-2xl border border-amber-400/15 bg-amber-500/8 p-4">
                      <p className="mb-3 text-[11px] uppercase tracking-[0.25em] text-amber-100">
                        Skipped files
                      </p>
                      <div className="space-y-2">
                        {githubPreview.skipped.map((item) => (
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
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/8 p-4 text-sm leading-6 text-amber-100">
                Prompt and code runs only use OpenAI when `OPENAI_API_KEY` is set in Convex
                env. A key in `.env.local` alone will not reach Convex actions. After
                setting the secret, restart `npx convex dev`.
              </div>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-white">
                  {humanizeSourceType(sourceType)}
                </span>
                <textarea
                  value={sourceText}
                  onChange={(event) => setSourceText(event.target.value)}
                  disabled={isLaunching}
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

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isLaunching || isResolvingGitHub}
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
          {isLaunching ? (
            <p className="text-sm leading-6 text-cyan-100">
              Provisioning Maker, Red Team, and the first evaluation pass. You’ll land in
              the cockpit as soon as the run is ready.
            </p>
          ) : null}
        </form>
      </SectionCard>

      <SectionCard title="Scope guardrails" eyebrow="MVP constraints">
        <ul className="space-y-3 text-sm leading-6 text-slate-300">
          <li>Single-language MVP: JavaScript / TypeScript only.</li>
          <li>Best for one exported function or a small utility file.</li>
          <li>GitHub mode launches one TrustLoop run per selected source file.</li>
          <li>Exported utility code executes in the backend evaluator; unsupported samples fall back to analysis-only.</li>
          <li>The loop keeps iterating automatically in Convex until it passes, converges, or hits the high iteration cap.</li>
        </ul>
      </SectionCard>
    </div>
  )
}
