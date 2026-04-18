"use node";

import { v } from 'convex/values'
import { action } from './_generated/server.js'
import type {
  GitHubCandidateFile,
  GitHubPreviewRequest,
  GitHubPreviewResult,
  GitHubRunContext,
  GitHubSkippedFile,
  ParsedGitHubBlobFileUrl,
  ParsedGitHubRawFileUrl,
} from '../shared/github.js'
import {
  MAX_GITHUB_BATCH_FILES,
  compareGitHubCandidatesByPatchSize,
  getUnsupportedGitHubFileReason,
  parseGitHubCommitUrl,
  parseGitHubFileUrl,
  parseGitHubPullRequestUrl,
  parseOwnerRepo,
  summarizeGitHubCandidate,
  type GitHubRepoSummary,
  type GitHubChangeStatus,
} from '../shared/github.js'

type GitHubFetch = typeof fetch

type GitHubRepoResponse = {
  default_branch?: string
  html_url?: string
  private?: boolean
}

type GitHubPullRequestResponse = {
  number: number
  html_url?: string
  head?: {
    ref?: string
    sha?: string
  }
  base?: {
    ref?: string
  }
}

type GitHubFileListItem = {
  filename: string
  status?: GitHubChangeStatus
  additions?: number
  deletions?: number
  blob_url?: string
  html_url?: string
}

type GitHubCommitResponse = {
  sha?: string
  html_url?: string
  files?: GitHubFileListItem[]
}

type GitHubCompareResponse = {
  html_url?: string
  files?: GitHubFileListItem[]
}

type GitHubContentsResponse = {
  type?: string
  content?: string
  encoding?: string
  html_url?: string
}

function buildHeaders(token?: string) {
  const headers = new Headers({
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  })

  if (token?.trim()) {
    headers.set('Authorization', `Bearer ${token.trim()}`)
  }

  return headers
}

async function fetchGitHubJson<T>(
  fetchImpl: GitHubFetch,
  path: string,
  token?: string,
): Promise<T> {
  const response = await fetchImpl(`https://api.github.com${path}`, {
    headers: buildHeaders(token),
  })

  if (!response.ok) {
    let message = `GitHub request failed with ${response.status}.`
    try {
      const payload = (await response.json()) as { message?: string }
      if (payload?.message) {
        message = payload.message
      }
    } catch {
      // Ignore parse failures and use the default message.
    }

    if (response.status === 401) {
      throw new Error('GitHub rejected the token. Check that your PAT is valid.')
    }
    if (response.status === 403) {
      throw new Error('GitHub denied access to this repo or rate-limited the request.')
    }
    if (response.status === 404) {
      throw new Error('GitHub could not find that repo or artifact with the current access.')
    }

    throw new Error(message)
  }

  return (await response.json()) as T
}

async function fetchRepo(
  fetchImpl: GitHubFetch,
  owner: string,
  repo: string,
  token?: string,
): Promise<GitHubRepoSummary> {
  const repoData = await fetchGitHubJson<GitHubRepoResponse>(
    fetchImpl,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    token,
  )

  const visibility: GitHubRepoSummary['visibility'] =
    typeof repoData.private === 'boolean'
      ? repoData.private
        ? 'private'
        : 'public'
      : 'unknown'

  return {
    owner,
    repo,
    htmlUrl: repoData.html_url || `https://github.com/${owner}/${repo}`,
    visibility,
    defaultBranch: repoData.default_branch,
  }
}

async function fetchAllPullRequestFiles(
  fetchImpl: GitHubFetch,
  owner: string,
  repo: string,
  prNumber: number,
  token?: string,
) {
  const items: GitHubFileListItem[] = []

  for (let page = 1; page <= 10; page += 1) {
    const pageItems = await fetchGitHubJson<GitHubFileListItem[]>(
      fetchImpl,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/files?per_page=100&page=${page}`,
      token,
    )

    items.push(...pageItems)

    if (pageItems.length < 100) {
      break
    }
  }

  return items
}

async function fetchContentsAtRef(
  fetchImpl: GitHubFetch,
  owner: string,
  repo: string,
  filePath: string,
  ref: string,
  token?: string,
) {
  const encodedPath = filePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  const payload = await fetchGitHubJson<GitHubContentsResponse>(
    fetchImpl,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
    token,
  )

  if (payload.type !== 'file') {
    throw new Error(`GitHub path ${filePath} does not resolve to a file.`)
  }

  if (payload.encoding !== 'base64' || typeof payload.content !== 'string') {
    throw new Error(`GitHub did not return file contents for ${filePath}.`)
  }

  const content = Buffer.from(payload.content.replace(/\n/g, ''), 'base64').toString('utf8')

  return {
    content,
    htmlUrl: payload.html_url || `https://github.com/${owner}/${repo}/blob/${ref}/${filePath}`,
  }
}

async function resolveBlobUrl(
  fetchImpl: GitHubFetch,
  fileUrl: ParsedGitHubBlobFileUrl,
  token?: string,
) {
  for (let splitIndex = fileUrl.blobSegments.length - 1; splitIndex >= 1; splitIndex -= 1) {
    const ref = fileUrl.blobSegments.slice(0, splitIndex).join('/')
    const filePath = fileUrl.blobSegments.slice(splitIndex).join('/')

    try {
      const contents = await fetchContentsAtRef(
        fetchImpl,
        fileUrl.owner,
        fileUrl.repo,
        filePath,
        ref,
        token,
      )

      return {
        ref,
        filePath,
        content: contents.content,
        htmlUrl: contents.htmlUrl,
      }
    } catch {
      // Try the next possible ref/path split.
    }
  }

  throw new Error('Could not resolve the GitHub file URL to a file path and ref.')
}

function buildCandidate(
  context: GitHubRunContext,
  resolvedRef: string,
  content: string,
): GitHubCandidateFile {
  return {
    ...context,
    resolvedRef,
    content,
    summary: summarizeGitHubCandidate(context),
  }
}

function buildSkippedFile(path: string, reason: string, htmlUrl?: string): GitHubSkippedFile {
  return {
    path,
    reason,
    htmlUrl,
  }
}

async function resolvePullRequestPreview(
  fetchImpl: GitHubFetch,
  owner: string,
  repo: string,
  prNumber: number,
  token?: string,
) {
  const repoSummary = await fetchRepo(fetchImpl, owner, repo, token)
  const pr = await fetchGitHubJson<GitHubPullRequestResponse>(
    fetchImpl,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}`,
    token,
  )

  const headSha = pr.head?.sha
  const headRef = pr.head?.ref
  const baseRef = pr.base?.ref

  if (!headSha || !headRef) {
    throw new Error('GitHub did not return the pull request head ref.')
  }

  const files = await fetchAllPullRequestFiles(fetchImpl, owner, repo, prNumber, token)

  const candidates: GitHubCandidateFile[] = []
  const skipped: GitHubSkippedFile[] = []

  for (const file of files) {
    if (!file.filename) {
      continue
    }

    if (file.status === 'removed') {
      skipped.push(
        buildSkippedFile(
          file.filename,
          'Deleted files cannot be evaluated in this phase.',
          file.blob_url || file.html_url,
        ),
      )
      continue
    }

    const reason = getUnsupportedGitHubFileReason(file.filename)
    if (reason) {
      skipped.push(buildSkippedFile(file.filename, reason, file.blob_url || file.html_url))
      continue
    }

    const contents = await fetchContentsAtRef(
      fetchImpl,
      owner,
      repo,
      file.filename,
      headSha,
      token,
    )

    candidates.push(
      buildCandidate(
        {
          owner,
          repo,
          filePath: file.filename,
          sourceKind: 'pr_url',
          htmlUrl: file.blob_url || file.html_url || contents.htmlUrl,
          prNumber,
          commitSha: headSha,
          baseRef,
          headRef,
          changeStatus: file.status,
          additions: file.additions,
          deletions: file.deletions,
        },
        headSha,
        contents.content,
      ),
    )
  }

  candidates.sort(compareGitHubCandidatesByPatchSize)

  return {
    repo: repoSummary,
    sourceKind: 'pr_url' as const,
    summary: `Resolved ${candidates.length} supported source file${candidates.length === 1 ? '' : 's'} from PR #${prNumber}.`,
    candidates,
    skipped,
  }
}

async function resolveCommitPreview(
  fetchImpl: GitHubFetch,
  owner: string,
  repo: string,
  commitSha: string,
  token?: string,
) {
  const repoSummary = await fetchRepo(fetchImpl, owner, repo, token)
  const commit = await fetchGitHubJson<GitHubCommitResponse>(
    fetchImpl,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(commitSha)}`,
    token,
  )

  const files = commit.files ?? []
  const resolvedSha = commit.sha || commitSha
  const candidates: GitHubCandidateFile[] = []
  const skipped: GitHubSkippedFile[] = []

  for (const file of files) {
    if (!file.filename) {
      continue
    }

    if (file.status === 'removed') {
      skipped.push(
        buildSkippedFile(
          file.filename,
          'Deleted files cannot be evaluated in this phase.',
          file.blob_url || file.html_url,
        ),
      )
      continue
    }

    const reason = getUnsupportedGitHubFileReason(file.filename)
    if (reason) {
      skipped.push(buildSkippedFile(file.filename, reason, file.blob_url || file.html_url))
      continue
    }

    const contents = await fetchContentsAtRef(
      fetchImpl,
      owner,
      repo,
      file.filename,
      resolvedSha,
      token,
    )

    candidates.push(
      buildCandidate(
        {
          owner,
          repo,
          filePath: file.filename,
          sourceKind: 'commit',
          htmlUrl: file.blob_url || file.html_url || contents.htmlUrl,
          commitSha: resolvedSha,
          changeStatus: file.status,
          additions: file.additions,
          deletions: file.deletions,
        },
        resolvedSha,
        contents.content,
      ),
    )
  }

  candidates.sort(compareGitHubCandidatesByPatchSize)

  return {
    repo: repoSummary,
    sourceKind: 'commit' as const,
    summary: `Resolved ${candidates.length} supported source file${candidates.length === 1 ? '' : 's'} from commit ${resolvedSha.slice(0, 7)}.`,
    candidates,
    skipped,
  }
}

async function resolveBranchDiffPreview(
  fetchImpl: GitHubFetch,
  owner: string,
  repo: string,
  baseRef: string,
  headRef: string,
  token?: string,
) {
  const repoSummary = await fetchRepo(fetchImpl, owner, repo, token)
  const comparison = await fetchGitHubJson<GitHubCompareResponse>(
    fetchImpl,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/compare/${encodeURIComponent(baseRef)}...${encodeURIComponent(headRef)}`,
    token,
  )

  const files = comparison.files ?? []
  const candidates: GitHubCandidateFile[] = []
  const skipped: GitHubSkippedFile[] = []

  for (const file of files) {
    if (!file.filename) {
      continue
    }

    if (file.status === 'removed') {
      skipped.push(
        buildSkippedFile(
          file.filename,
          'Deleted files cannot be evaluated in this phase.',
          file.blob_url || file.html_url,
        ),
      )
      continue
    }

    const reason = getUnsupportedGitHubFileReason(file.filename)
    if (reason) {
      skipped.push(buildSkippedFile(file.filename, reason, file.blob_url || file.html_url))
      continue
    }

    const contents = await fetchContentsAtRef(fetchImpl, owner, repo, file.filename, headRef, token)

    candidates.push(
      buildCandidate(
        {
          owner,
          repo,
          filePath: file.filename,
          sourceKind: 'branch_diff',
          htmlUrl:
            file.blob_url ||
            file.html_url ||
            comparison.html_url ||
            contents.htmlUrl,
          baseRef,
          headRef,
          changeStatus: file.status,
          additions: file.additions,
          deletions: file.deletions,
        },
        headRef,
        contents.content,
      ),
    )
  }

  candidates.sort(compareGitHubCandidatesByPatchSize)

  return {
    repo: repoSummary,
    sourceKind: 'branch_diff' as const,
    summary: `Resolved ${candidates.length} supported source file${candidates.length === 1 ? '' : 's'} from ${baseRef}...${headRef}.`,
    candidates,
    skipped,
  }
}

async function resolveFilePreview(
  fetchImpl: GitHubFetch,
  fileUrl: ParsedGitHubRawFileUrl | ParsedGitHubBlobFileUrl,
  token?: string,
) {
  const repoSummary = await fetchRepo(fetchImpl, fileUrl.owner, fileUrl.repo, token)
  const resolved =
    fileUrl.kind === 'raw'
      ? {
          ref: fileUrl.ref,
          filePath: fileUrl.filePath,
          ...(await fetchContentsAtRef(
            fetchImpl,
            fileUrl.owner,
            fileUrl.repo,
            fileUrl.filePath,
            fileUrl.ref,
            token,
          )),
        }
      : await resolveBlobUrl(fetchImpl, fileUrl, token)

  const reason = getUnsupportedGitHubFileReason(resolved.filePath)
  if (reason) {
    return {
      repo: repoSummary,
      sourceKind: 'file_url' as const,
      summary: 'The selected GitHub file is not supported in the current MVP.',
      candidates: [] as GitHubCandidateFile[],
      skipped: [buildSkippedFile(resolved.filePath, reason, resolved.htmlUrl)],
    }
  }

  return {
    repo: repoSummary,
    sourceKind: 'file_url' as const,
    summary: `Resolved 1 supported source file from ${fileUrl.owner}/${fileUrl.repo}.`,
    candidates: [
      buildCandidate(
        {
          owner: fileUrl.owner,
          repo: fileUrl.repo,
          filePath: resolved.filePath,
          sourceKind: 'file_url',
          htmlUrl: resolved.htmlUrl,
          headRef: resolved.ref,
        },
        resolved.ref,
        resolved.content,
      ),
    ],
    skipped: [] as GitHubSkippedFile[],
  }
}

export async function previewGitHubSourceWithClient(
  input: GitHubPreviewRequest,
  fetchImpl: GitHubFetch = fetch,
): Promise<GitHubPreviewResult> {
  const token = input.token?.trim() || undefined

  switch (input.sourceKind) {
    case 'pr_url': {
      if (!input.prUrl?.trim()) {
        throw new Error('Add a GitHub pull request URL first.')
      }

      const parsed = parseGitHubPullRequestUrl(input.prUrl)
      return await resolvePullRequestPreview(
        fetchImpl,
        parsed.owner,
        parsed.repo,
        parsed.prNumber,
        token,
      )
    }

    case 'file_url': {
      if (!input.fileUrl?.trim()) {
        throw new Error('Add a GitHub file URL first.')
      }

      const parsed = parseGitHubFileUrl(input.fileUrl)
      return await resolveFilePreview(fetchImpl, parsed, token)
    }

    case 'branch_diff': {
      const repoRef = parseOwnerRepo(input.owner, input.repo)
      if (!repoRef) {
        throw new Error('Add the GitHub owner and repo before fetching a branch diff.')
      }
      if (!input.baseRef?.trim() || !input.headRef?.trim()) {
        throw new Error('Add both base and head refs before fetching a branch diff.')
      }

      return await resolveBranchDiffPreview(
        fetchImpl,
        repoRef.owner,
        repoRef.repo,
        input.baseRef.trim(),
        input.headRef.trim(),
        token,
      )
    }

    case 'commit': {
      let owner = input.owner?.trim()
      let repo = input.repo?.trim()
      let commitSha = input.commitSha?.trim()

      if (commitSha?.startsWith('http')) {
        const parsed = parseGitHubCommitUrl(commitSha)
        owner = parsed.owner
        repo = parsed.repo
        commitSha = parsed.commitSha
      }

      const repoRef = parseOwnerRepo(owner, repo)
      if (!repoRef) {
        throw new Error('Add the GitHub owner and repo before fetching a commit.')
      }
      if (!commitSha) {
        throw new Error('Add a commit SHA before fetching a commit.')
      }

      return await resolveCommitPreview(
        fetchImpl,
        repoRef.owner,
        repoRef.repo,
        commitSha,
        token,
      )
    }
  }
}

export const previewSource = action({
  args: {
    token: v.optional(v.string()),
    sourceKind: v.union(
      v.literal('pr_url'),
      v.literal('file_url'),
      v.literal('branch_diff'),
      v.literal('commit'),
    ),
    prUrl: v.optional(v.string()),
    fileUrl: v.optional(v.string()),
    owner: v.optional(v.string()),
    repo: v.optional(v.string()),
    baseRef: v.optional(v.string()),
    headRef: v.optional(v.string()),
    commitSha: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
      const preview = await previewGitHubSourceWithClient(args)

      return {
        ...preview,
        candidates: preview.candidates,
        skipped: preview.skipped,
      suggestedSelection: preview.candidates
        .slice(0, MAX_GITHUB_BATCH_FILES)
        .map((candidate) => candidate.filePath),
    }
  },
})
