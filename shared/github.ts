export type GitHubSourceKind = 'pr_url' | 'file_url' | 'branch_diff' | 'commit'

export type GitHubChangeStatus =
  | 'added'
  | 'modified'
  | 'removed'
  | 'renamed'
  | 'copied'
  | 'changed'
  | 'unchanged'

export interface GitHubRunContext {
  owner: string
  repo: string
  filePath: string
  sourceKind: GitHubSourceKind
  htmlUrl: string
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

export interface GitHubCandidateFile extends GitHubRunContext {
  content: string
  resolvedRef: string
  summary: string
}

export interface GitHubSkippedFile {
  path: string
  reason: string
  htmlUrl?: string
}

export interface GitHubPreviewResult {
  repo: GitHubRepoSummary
  sourceKind: GitHubSourceKind
  summary: string
  candidates: GitHubCandidateFile[]
  skipped: GitHubSkippedFile[]
}

export interface GitHubPreviewResponse extends GitHubPreviewResult {
  suggestedSelection: string[]
}

export interface GitHubPreviewRequest {
  token?: string
  sourceKind: GitHubSourceKind
  prUrl?: string
  fileUrl?: string
  owner?: string
  repo?: string
  baseRef?: string
  headRef?: string
  commitSha?: string
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
  const normalized = path.trim().toLowerCase()

  if (!SUPPORTED_GITHUB_EXTENSIONS.some((extension) => normalized.endsWith(extension))) {
    return false
  }

  return (
    !normalized.endsWith('.d.ts') &&
    !/\.test\.[^.]+$/.test(normalized) &&
    !/\.spec\.[^.]+$/.test(normalized) &&
    !/\.min\.[^.]+$/.test(normalized) &&
    !/(^|\/)(dist|build|coverage|docs|__snapshots__)\//.test(normalized) &&
    !/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|tsconfig\.json|vite\.config\.)/.test(
      normalized,
    )
  )
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
  left: Pick<GitHubCandidateFile, 'additions' | 'deletions' | 'filePath'>,
  right: Pick<GitHubCandidateFile, 'additions' | 'deletions' | 'filePath'>,
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

export function summarizeGitHubCandidate(context: Pick<GitHubRunContext, 'changeStatus' | 'additions' | 'deletions'>) {
  const pieces: string[] = []

  if (context.changeStatus) {
    pieces.push(context.changeStatus.charAt(0).toUpperCase() + context.changeStatus.slice(1))
  }
  if (context.additions != null || context.deletions != null) {
    pieces.push(`+${context.additions ?? 0} / -${context.deletions ?? 0}`)
  }

  return pieces.join(' · ') || 'GitHub source file'
}

export function humanizeGitHubSourceKind(sourceKind: GitHubSourceKind) {
  switch (sourceKind) {
    case 'pr_url':
      return 'PR URL'
    case 'file_url':
      return 'File URL'
    case 'branch_diff':
      return 'Branch Diff'
    case 'commit':
      return 'Commit SHA'
  }
}
