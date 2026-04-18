import type { Id } from '../convex/_generated/dataModel'

export type GitHubSourceKind =
  | 'pr_url'
  | 'file_url'
  | 'branch_diff'
  | 'commit'
  | 'repo_branch'
  | 'push_sync'

export type GitHubChangeStatus =
  | 'added'
  | 'modified'
  | 'removed'
  | 'renamed'
  | 'copied'
  | 'changed'
  | 'unchanged'

export type GitHubConnectionStatus = 'active' | 'syncing' | 'error'
export type GitHubWebhookStatus = 'active' | 'error' | 'missing'

export interface GitHubRunContext {
  owner: string
  repo: string
  filePath: string
  sourceKind: GitHubSourceKind
  htmlUrl: string
  connectionId?: Id<'repoConnections'>
  branch?: string
  prNumber?: number
  commitSha?: string
  baseRef?: string
  headRef?: string
  changeStatus?: GitHubChangeStatus
  additions?: number
  deletions?: number
}

export interface GitHubRepoSummary {
  owner: string
  repo: string
  htmlUrl: string
  visibility: 'public' | 'private' | 'unknown'
  defaultBranch?: string
}

export interface GitHubTrackedCandidate extends GitHubRunContext {
  content: string
  resolvedRef: string
  summary: string
}

export interface GitHubSkippedFile {
  path: string
  reason: string
  htmlUrl?: string
}

export interface GitHubConnectRepoRequest {
  token: string
  owner: string
  repo: string
  branch: string
  webhookUrl: string
}

export interface GitHubConnectRepoResult {
  connectionId: Id<'repoConnections'>
  repo: GitHubRepoSummary
  branch: string
  syncedSha: string
  summary: string
  createdRuns: number
  runIds: Id<'runs'>[]
  skipped: GitHubSkippedFile[]
  webhookStatus: GitHubWebhookStatus
  webhookMessage: string
}

export interface GitHubConnectionSummary {
  _id: Id<'repoConnections'>
  owner: string
  repo: string
  branch: string
  htmlUrl: string
  status: GitHubConnectionStatus
  webhookStatus: GitHubWebhookStatus
  webhookMessage?: string
  lastProcessedCommitSha?: string
  lastSyncAt?: number
  lastWebhookAt?: number
  lastError?: string
  createdAt: number
  updatedAt: number
}

export interface ParsedGitHubRepoRef {
  owner: string
  repo: string
}

export interface ParsedGitHubPullRequestUrl extends ParsedGitHubRepoRef {
  prNumber: number
}

export interface ParsedGitHubCommitUrl extends ParsedGitHubRepoRef {
  commitSha: string
}

export interface ParsedGitHubRawFileUrl extends ParsedGitHubRepoRef {
  kind: 'raw'
  ref: string
  filePath: string
}

export interface ParsedGitHubBlobFileUrl extends ParsedGitHubRepoRef {
  kind: 'blob'
  blobSegments: string[]
}

export const MAX_GITHUB_BATCH_FILES = 5

const SUPPORTED_GITHUB_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx']

function cleanSegment(value: string) {
  return decodeURIComponent(value).trim()
}

export function basename(path: string) {
  const trimmed = path.trim().replace(/\/+$/, '')
  const segments = trimmed.split('/')
  return segments[segments.length - 1] || trimmed
}

export function parseOwnerRepo(owner?: string, repo?: string): ParsedGitHubRepoRef | null {
  const normalizedOwner = owner?.trim()
  const normalizedRepo = repo?.trim()

  if (!normalizedOwner || !normalizedRepo) {
    return null
  }

  return {
    owner: normalizedOwner,
    repo: normalizedRepo,
  }
}

export function normalizeGitHubBranchRef(ref?: string | null) {
  if (!ref) {
    return ''
  }

  return ref.replace(/^refs\/heads\//, '').trim()
}

export function parseGitHubPullRequestUrl(url: string): ParsedGitHubPullRequestUrl {
  const parsed = new URL(url)
  if (parsed.hostname !== 'github.com') {
    throw new Error('Pull request URLs must come from github.com.')
  }

  const segments = parsed.pathname
    .split('/')
    .map(cleanSegment)
    .filter(Boolean)

  if (segments.length < 4 || segments[2] !== 'pull') {
    throw new Error('Enter a valid GitHub pull request URL.')
  }

  const prNumber = Number(segments[3])
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error('Pull request URLs must include a numeric PR number.')
  }

  return {
    owner: segments[0],
    repo: segments[1],
    prNumber,
  }
}

export function parseGitHubCommitUrl(url: string): ParsedGitHubCommitUrl {
  const parsed = new URL(url)
  if (parsed.hostname !== 'github.com') {
    throw new Error('Commit URLs must come from github.com.')
  }

  const segments = parsed.pathname
    .split('/')
    .map(cleanSegment)
    .filter(Boolean)

  if (segments.length < 4 || segments[2] !== 'commit') {
    throw new Error('Enter a valid GitHub commit URL.')
  }

  const commitSha = segments[3]
  if (!/^[0-9a-f]{7,}$/i.test(commitSha)) {
    throw new Error('Commit URLs must include a valid commit SHA.')
  }

  return {
    owner: segments[0],
    repo: segments[1],
    commitSha,
  }
}

export function parseGitHubFileUrl(
  url: string,
): ParsedGitHubRawFileUrl | ParsedGitHubBlobFileUrl {
  const parsed = new URL(url)

  if (parsed.hostname === 'raw.githubusercontent.com') {
    const segments = parsed.pathname
      .split('/')
      .map(cleanSegment)
      .filter(Boolean)

    if (segments.length < 4) {
      throw new Error('Enter a valid raw GitHub file URL.')
    }

    return {
      kind: 'raw',
      owner: segments[0],
      repo: segments[1],
      ref: segments[2],
      filePath: segments.slice(3).join('/'),
    }
  }

  if (parsed.hostname !== 'github.com') {
    throw new Error('File URLs must come from github.com or raw.githubusercontent.com.')
  }

  const segments = parsed.pathname
    .split('/')
    .map(cleanSegment)
    .filter(Boolean)

  if (segments.length < 5 || segments[2] !== 'blob') {
    throw new Error('Enter a valid GitHub file URL.')
  }

  return {
    kind: 'blob',
    owner: segments[0],
    repo: segments[1],
    blobSegments: segments.slice(3),
  }
}

export function isSupportedGitHubSourcePath(path: string) {
  return getUnsupportedGitHubFileReason(path) == null
}

export function getUnsupportedGitHubFileReason(path: string) {
  const normalized = path.trim().toLowerCase()

  if (!SUPPORTED_GITHUB_EXTENSIONS.some((extension) => normalized.endsWith(extension))) {
    return 'Only JavaScript and TypeScript source files are supported in this phase.'
  }
  if (normalized.endsWith('.d.ts')) {
    return 'Declaration files are skipped in this phase.'
  }
  if (/\.test\.[^.]+$/.test(normalized) || /\.spec\.[^.]+$/.test(normalized)) {
    return 'Test files are skipped in this phase.'
  }
  if (/\.min\.[^.]+$/.test(normalized)) {
    return 'Minified files are skipped in this phase.'
  }
  if (/(^|\/)(dist|build|coverage|docs|__snapshots__)\//.test(normalized)) {
    return 'Generated, build, or docs paths are skipped in this phase.'
  }
  if (
    /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|tsconfig\.json|vite\.config\.)/.test(
      normalized,
    )
  ) {
    return 'Config and lock files are skipped in this phase.'
  }

  return null
}

export function compareGitHubCandidatesByPatchSize(
  left: Pick<GitHubTrackedCandidate, 'additions' | 'deletions' | 'filePath'>,
  right: Pick<GitHubTrackedCandidate, 'additions' | 'deletions' | 'filePath'>,
) {
  const leftSize = (left.additions ?? 0) + (left.deletions ?? 0)
  const rightSize = (right.additions ?? 0) + (right.deletions ?? 0)

  if (leftSize !== rightSize) {
    return rightSize - leftSize
  }

  return left.filePath.localeCompare(right.filePath)
}

export function buildGitHubRunTitle(context: GitHubRunContext) {
  return `${context.owner}/${context.repo} · ${basename(context.filePath)}`
}

export function summarizeGitHubCandidate(
  context: Pick<GitHubRunContext, 'sourceKind' | 'changeStatus' | 'additions' | 'deletions'>,
) {
  const pieces: string[] = []

  if (context.sourceKind === 'repo_branch') {
    pieces.push('Baseline scan')
  }
  if (context.sourceKind === 'push_sync') {
    pieces.push('Triggered from push webhook')
  }
  if (context.changeStatus) {
    pieces.push(context.changeStatus.charAt(0).toUpperCase() + context.changeStatus.slice(1))
  }
  if (context.additions != null || context.deletions != null) {
    pieces.push(`+${context.additions ?? 0} / -${context.deletions ?? 0}`)
  }

  return pieces.join(' · ') || 'GitHub source file'
}

export function buildGitHubRepoKey(context: Pick<GitHubRunContext, 'owner' | 'repo'>) {
  return `${context.owner}/${context.repo}`
}
