import { v } from 'convex/values'
import { api, internal } from './_generated/api.js'
import type { Id } from './_generated/dataModel.js'
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type ActionCtx,
} from './_generated/server.js'
import type {
  GitHubChangeStatus,
  GitHubConnectRepoResult,
  GitHubRepoSummary,
  GitHubSkippedFile,
  GitHubTrackedCandidate,
} from '../shared/github.js'
import {
  compareGitHubCandidatesByPatchSize,
  getUnsupportedGitHubFileReason,
  normalizeGitHubBranchRef,
  summarizeGitHubCandidate,
  type GitHubConnectionSummary,
} from '../shared/github.js'

type GitHubFetch = typeof fetch

type GitHubRepoResponse = {
  default_branch?: string
  html_url?: string
  private?: boolean
}

type GitHubBranchResponse = {
  name?: string
  commit?: {
    sha?: string
    commit?: {
      tree?: {
        sha?: string
      }
    }
  }
}

type GitHubTreeResponse = {
  tree?: Array<{
    path?: string
    type?: string
  }>
  truncated?: boolean
}

type GitHubHookResponse = {
  id?: number
  active?: boolean
  config?: {
    url?: string
  }
}

type GitHubCompareFile = {
  filename: string
  status?: GitHubChangeStatus
  additions?: number
  deletions?: number
  blob_url?: string
  html_url?: string
}

type GitHubCompareResponse = {
  html_url?: string
  files?: GitHubCompareFile[]
}

type GitHubContentsResponse = {
  type?: string
  content?: string
  encoding?: string
  html_url?: string
}

type WebhookSetupResult = {
  webhookStatus: 'active' | 'error' | 'missing'
  webhookMessage: string
  webhookId?: number
}

type RunProvisioningCtx = Pick<ActionCtx, 'runMutation'>

const repoConnectionStatusValidator = v.union(
  v.literal('active'),
  v.literal('syncing'),
  v.literal('error'),
)

const webhookStatusValidator = v.union(
  v.literal('active'),
  v.literal('error'),
  v.literal('missing'),
)
const textDecoder = new TextDecoder()

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

async function requestGitHubJson<T>(
  fetchImpl: GitHubFetch,
  path: string,
  options?: {
    method?: string
    token?: string
    body?: unknown
  },
): Promise<T> {
  const headers = buildHeaders(options?.token)
  if (options?.body) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetchImpl(`https://api.github.com${path}`, {
    method: options?.method ?? 'GET',
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    let message = `GitHub request failed with ${response.status}.`

    try {
      const payload = (await response.json()) as { message?: string }
      if (payload?.message) {
        message = payload.message
      }
    } catch {
      // Ignore parse failures and keep the default message.
    }

    if (response.status === 401) {
      throw new Error('GitHub rejected the token. Check that your PAT is valid.')
    }
    if (response.status === 403) {
      if (path.includes('/hooks')) {
        throw new Error(
          'GitHub denied webhook setup. For a classic PAT, add admin:repo_hook. For a fine-grained token, grant repository Webhooks read/write access.',
        )
      }
      throw new Error(
        'GitHub denied access to this repo or webhook configuration. Check repo access and token scopes.',
      )
    }
    if (response.status === 404) {
      throw new Error('GitHub could not find that repo, branch, or file with the current access.')
    }

    throw new Error(message)
  }

  if (response.status === 204) {
    return null as T
  }

  return (await response.json()) as T
}

async function fetchRepo(
  fetchImpl: GitHubFetch,
  owner: string,
  repo: string,
  token: string,
): Promise<GitHubRepoSummary> {
  const repoData = await requestGitHubJson<GitHubRepoResponse>(
    fetchImpl,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    {
      token,
    },
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

async function fetchBranch(
  fetchImpl: GitHubFetch,
  owner: string,
  repo: string,
  branch: string,
  token: string,
) {
  const branchData = await requestGitHubJson<GitHubBranchResponse>(
    fetchImpl,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`,
    {
      token,
    },
  )

  const commitSha = branchData.commit?.sha
  const treeSha = branchData.commit?.commit?.tree?.sha
  const resolvedBranch = normalizeGitHubBranchRef(branchData.name || branch)

  if (!commitSha || !treeSha) {
    throw new Error('GitHub did not return the branch head SHA for this repo.')
  }

  return {
    branch: resolvedBranch,
    commitSha,
    treeSha,
  }
}

async function fetchTree(
  fetchImpl: GitHubFetch,
  owner: string,
  repo: string,
  treeSha: string,
  token: string,
) {
  const tree = await requestGitHubJson<GitHubTreeResponse>(
    fetchImpl,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`,
    {
      token,
    },
  )

  if (tree.truncated) {
    throw new Error(
      'GitHub returned a truncated file tree for this repo. Use a smaller demo repo for the hackathon flow.',
    )
  }

  return tree.tree ?? []
}

async function fetchContentsAtRef(
  fetchImpl: GitHubFetch,
  owner: string,
  repo: string,
  filePath: string,
  ref: string,
  token: string,
) {
  const encodedPath = filePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  const payload = await requestGitHubJson<GitHubContentsResponse>(
    fetchImpl,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
    {
      token,
    },
  )

  if (payload.type !== 'file') {
    throw new Error(`GitHub path ${filePath} does not resolve to a file.`)
  }

  if (payload.encoding !== 'base64' || typeof payload.content !== 'string') {
    throw new Error(`GitHub did not return file contents for ${filePath}.`)
  }

  return {
    content: decodeBase64Utf8(payload.content.replace(/\n/g, '')),
    htmlUrl: payload.html_url || `https://github.com/${owner}/${repo}/blob/${ref}/${filePath}`,
  }
}

function decodeBase64Utf8(value: string) {
  const binary = atob(value)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return textDecoder.decode(bytes)
}

function generateWebhookSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

async function fetchCompare(
  fetchImpl: GitHubFetch,
  owner: string,
  repo: string,
  before: string,
  after: string,
  token: string,
) {
  return await requestGitHubJson<GitHubCompareResponse>(
    fetchImpl,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/compare/${encodeURIComponent(before)}...${encodeURIComponent(after)}`,
    {
      token,
    },
  )
}

function buildCandidate(candidate: GitHubTrackedCandidate) {
  return {
    ...candidate,
    summary: summarizeGitHubCandidate(candidate),
  }
}

function buildSkippedFile(path: string, reason: string, htmlUrl?: string): GitHubSkippedFile {
  return {
    path,
    reason,
    htmlUrl,
  }
}

async function upsertGitHubWebhook(
  fetchImpl: GitHubFetch,
  args: {
    token: string
    owner: string
    repo: string
    webhookUrl: string
    webhookSecret: string
  },
): Promise<WebhookSetupResult> {
  if (!args.token.trim()) {
    return {
      webhookStatus: 'missing',
      webhookMessage:
        'A GitHub PAT is required to register the push webhook for automatic TrustLoop sync.',
    }
  }

  try {
    const hooks = await requestGitHubJson<GitHubHookResponse[]>(
      fetchImpl,
      `/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}/hooks?per_page=100`,
      {
        token: args.token,
      },
    )

    const config = {
      url: args.webhookUrl,
      content_type: 'json',
      secret: args.webhookSecret,
      insecure_ssl: '0',
    }
    const existing = hooks.find((hook) => hook.config?.url === args.webhookUrl)

    if (existing?.id) {
      await requestGitHubJson<GitHubHookResponse>(
        fetchImpl,
        `/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}/hooks/${existing.id}`,
        {
          method: 'PATCH',
          token: args.token,
          body: {
            active: true,
            events: ['push'],
            config,
          },
        },
      )

      return {
        webhookStatus: 'active',
        webhookMessage: 'Updated the existing GitHub push webhook for automatic TrustLoop sync.',
        webhookId: existing.id,
      }
    }

    const created = await requestGitHubJson<GitHubHookResponse>(
      fetchImpl,
      `/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}/hooks`,
      {
        method: 'POST',
        token: args.token,
        body: {
          name: 'web',
          active: true,
          events: ['push'],
          config,
        },
      },
    )

    return {
      webhookStatus: 'active',
      webhookMessage: 'Created a GitHub push webhook for automatic TrustLoop sync.',
      webhookId: created.id,
    }
  } catch (error) {
    return {
      webhookStatus: 'error',
      webhookMessage:
        error instanceof Error
          ? error.message
          : 'GitHub webhook setup failed.',
    }
  }
}

async function createRunsForCandidates(
  ctx: RunProvisioningCtx,
  args: {
    connectionId: Id<'repoConnections'>
    candidates: GitHubTrackedCandidate[]
    trigger: 'baseline' | 'push'
  },
) {
  const runIds: Id<'runs'>[] = []

  for (const candidate of args.candidates) {
    const runId = await ctx.runMutation(api.runs.createRun, {
      title: '',
      sourceType: 'github',
      sourceText: candidate.content,
      githubContext: {
        owner: candidate.owner,
        repo: candidate.repo,
        filePath: candidate.filePath,
        sourceKind: candidate.sourceKind,
        htmlUrl: candidate.htmlUrl,
        connectionId: args.connectionId,
        branch: candidate.branch,
        prNumber: candidate.prNumber,
        commitSha: candidate.commitSha,
        baseRef: candidate.baseRef,
        headRef: candidate.headRef,
        changeStatus: candidate.changeStatus,
        additions: candidate.additions,
        deletions: candidate.deletions,
      },
    })

    await ctx.runMutation(internal.runs.enqueueBootstrap, {
      runId,
      source: 'system',
      title:
        args.trigger === 'baseline'
          ? 'Tracked repo baseline queued'
          : 'Push-triggered re-analysis queued',
      detail:
        args.trigger === 'baseline'
          ? `Tracked GitHub repo queued ${candidate.filePath} for the first TrustLoop pass on ${candidate.branch ?? candidate.headRef ?? 'the selected branch'}.`
          : `A GitHub push updated ${candidate.filePath}, so TrustLoop queued a fresh run for the changed file.`,
    })

    runIds.push(runId)
  }

  return runIds
}

export async function resolveTrackedRepoBaselineWithClient(
  input: {
    token: string
    owner: string
    repo: string
    branch: string
    connectionId?: Id<'repoConnections'>
  },
  fetchImpl: GitHubFetch = fetch,
) {
  const owner = input.owner.trim()
  const repo = input.repo.trim()
  const branch = normalizeGitHubBranchRef(input.branch)
  const token = input.token.trim()

  if (!token) {
    throw new Error(
      'Add a GitHub PAT before connecting a tracked repo. TrustLoop stores it in Convex so future push syncs can fetch changed files.',
    )
  }
  if (!owner || !repo || !branch) {
    throw new Error('Owner, repo, and branch are required to connect a tracked GitHub repo.')
  }

  const repoSummary = await fetchRepo(fetchImpl, owner, repo, token)
  const branchInfo = await fetchBranch(fetchImpl, owner, repo, branch, token)
  const tree = await fetchTree(fetchImpl, owner, repo, branchInfo.treeSha, token)

  const candidates: GitHubTrackedCandidate[] = []
  const skipped: GitHubSkippedFile[] = []

  const paths = tree
    .filter((entry) => entry.type === 'blob' && entry.path)
    .map((entry) => entry.path as string)
    .sort((left, right) => left.localeCompare(right))

  for (const path of paths) {
    const reason = getUnsupportedGitHubFileReason(path)
    if (reason) {
      skipped.push(buildSkippedFile(path, reason))
      continue
    }

    const contents = await fetchContentsAtRef(
      fetchImpl,
      owner,
      repo,
      path,
      branchInfo.commitSha,
      token,
    )

    candidates.push(
      buildCandidate({
        owner,
        repo,
        filePath: path,
        sourceKind: 'repo_branch',
        htmlUrl: contents.htmlUrl,
        connectionId: input.connectionId,
        branch: branchInfo.branch,
        headRef: branchInfo.branch,
        commitSha: branchInfo.commitSha,
        resolvedRef: branchInfo.commitSha,
        content: contents.content,
        summary: '',
      }),
    )
  }

  return {
    repo: repoSummary,
    branch: branchInfo.branch,
    headSha: branchInfo.commitSha,
    candidates,
    skipped,
    summary: `Scanned ${candidates.length} supported source file${candidates.length === 1 ? '' : 's'} on ${owner}/${repo}@${branchInfo.branch}.`,
  }
}

export async function resolvePushCandidatesWithClient(
  input: {
    token: string
    owner: string
    repo: string
    branch: string
    before: string
    after: string
    connectionId: Id<'repoConnections'>
  },
  fetchImpl: GitHubFetch = fetch,
) {
  const before = input.before.trim()
  const after = input.after.trim()

  if (!before || /^0+$/.test(before)) {
    const baseline = await resolveTrackedRepoBaselineWithClient(
      {
        token: input.token,
        owner: input.owner,
        repo: input.repo,
        branch: input.branch,
        connectionId: input.connectionId,
      },
      fetchImpl,
    )

    return {
      ...baseline,
      candidates: baseline.candidates.map((candidate) =>
        buildCandidate({
          ...candidate,
          sourceKind: 'push_sync',
          changeStatus: 'added',
          commitSha: after || candidate.commitSha,
          resolvedRef: after || candidate.resolvedRef,
        }),
      ),
      summary: `GitHub delivered an initial branch push, so TrustLoop queued ${baseline.candidates.length} supported file${baseline.candidates.length === 1 ? '' : 's'} from ${input.branch}.`,
    }
  }

  const repoSummary = await fetchRepo(fetchImpl, input.owner, input.repo, input.token)
  const comparison = await fetchCompare(
    fetchImpl,
    input.owner,
    input.repo,
    before,
    after,
    input.token,
  )
  const candidates: GitHubTrackedCandidate[] = []
  const skipped: GitHubSkippedFile[] = []

  for (const file of comparison.files ?? []) {
    if (!file.filename) {
      continue
    }

    if (file.status === 'removed') {
      skipped.push(
        buildSkippedFile(
          file.filename,
          'Deleted files cannot be re-analyzed after this push.',
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
      input.owner,
      input.repo,
      file.filename,
      after,
      input.token,
    )

    candidates.push(
      buildCandidate({
        owner: input.owner,
        repo: input.repo,
        filePath: file.filename,
        sourceKind: 'push_sync',
        htmlUrl: file.blob_url || file.html_url || contents.htmlUrl,
        connectionId: input.connectionId,
        branch: input.branch,
        baseRef: before,
        headRef: input.branch,
        commitSha: after,
        changeStatus: file.status,
        additions: file.additions,
        deletions: file.deletions,
        resolvedRef: after,
        content: contents.content,
        summary: '',
      }),
    )
  }

  candidates.sort(compareGitHubCandidatesByPatchSize)

  return {
    repo: repoSummary,
    branch: input.branch,
    headSha: after,
    candidates,
    skipped,
    summary: `Detected ${candidates.length} supported changed file${candidates.length === 1 ? '' : 's'} from the latest push to ${input.branch}.`,
  }
}

export const listConnections = query({
  args: {},
  handler: async (ctx): Promise<GitHubConnectionSummary[]> => {
    const connections = await ctx.db
      .query('repoConnections')
      .withIndex('by_updatedAt')
      .order('desc')
      .collect()

    return connections.map((connection) => ({
      _id: connection._id,
      owner: connection.owner,
      repo: connection.repo,
      branch: connection.branch,
      htmlUrl: connection.htmlUrl,
      status: connection.webhookStatus === 'active' ? connection.status : 'error',
      webhookStatus: connection.webhookStatus,
      webhookMessage: connection.webhookMessage,
      lastProcessedCommitSha: connection.lastProcessedCommitSha,
      lastSyncAt: connection.lastSyncAt,
      lastWebhookAt: connection.lastWebhookAt,
      lastError: connection.lastError,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    }))
  },
})

export const getConnectionForWebhook = internalQuery({
  args: {
    owner: v.string(),
    repo: v.string(),
    branch: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedBranch = normalizeGitHubBranchRef(args.branch)

    return await ctx.db
      .query('repoConnections')
      .withIndex('by_owner_and_repo_and_branch', (q) =>
        q.eq('owner', args.owner).eq('repo', args.repo).eq('branch', normalizedBranch),
      )
      .unique()
  },
})

export const getConnectionById = internalQuery({
  args: {
    connectionId: v.id('repoConnections'),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.connectionId)
  },
})

export const saveConnection = internalMutation({
  args: {
    connectionId: v.optional(v.id('repoConnections')),
    owner: v.string(),
    repo: v.string(),
    branch: v.string(),
    htmlUrl: v.string(),
    token: v.string(),
    webhookSecret: v.string(),
    webhookUrl: v.string(),
    webhookId: v.optional(v.number()),
    webhookStatus: webhookStatusValidator,
    webhookMessage: v.optional(v.string()),
    status: repoConnectionStatusValidator,
    lastProcessedCommitSha: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
    lastWebhookAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const patch = {
      owner: args.owner,
      repo: args.repo,
      branch: args.branch,
      htmlUrl: args.htmlUrl,
      token: args.token,
      webhookSecret: args.webhookSecret,
      webhookUrl: args.webhookUrl,
      webhookStatus: args.webhookStatus,
      status: args.status,
      updatedAt: now,
      ...(args.webhookId !== undefined ? { webhookId: args.webhookId } : {}),
      ...(args.webhookMessage !== undefined
        ? { webhookMessage: args.webhookMessage }
        : {}),
      ...(args.lastProcessedCommitSha !== undefined
        ? { lastProcessedCommitSha: args.lastProcessedCommitSha }
        : {}),
      ...(args.lastSyncAt !== undefined ? { lastSyncAt: args.lastSyncAt } : {}),
      ...(args.lastWebhookAt !== undefined
        ? { lastWebhookAt: args.lastWebhookAt }
        : {}),
      ...(args.lastError !== undefined ? { lastError: args.lastError } : {}),
    }

    if (args.connectionId) {
      await ctx.db.patch(args.connectionId, patch)

      return args.connectionId
    }

    return await ctx.db.insert('repoConnections', {
      ...patch,
      createdAt: now,
    })
  },
})

export const markConnectionState = internalMutation({
  args: {
    connectionId: v.id('repoConnections'),
    status: v.optional(repoConnectionStatusValidator),
    webhookStatus: v.optional(webhookStatusValidator),
    webhookMessage: v.optional(v.string()),
    webhookId: v.optional(v.number()),
    lastProcessedCommitSha: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
    lastWebhookAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, number | string> = {
      updatedAt: Date.now(),
    }

    if (args.status !== undefined) {
      patch.status = args.status
    }
    if (args.webhookStatus !== undefined) {
      patch.webhookStatus = args.webhookStatus
    }
    if (args.webhookMessage !== undefined) {
      patch.webhookMessage = args.webhookMessage
    }
    if (args.webhookId !== undefined) {
      patch.webhookId = args.webhookId
    }
    if (args.lastProcessedCommitSha !== undefined) {
      patch.lastProcessedCommitSha = args.lastProcessedCommitSha
    }
    if (args.lastSyncAt !== undefined) {
      patch.lastSyncAt = args.lastSyncAt
    }
    if (args.lastWebhookAt !== undefined) {
      patch.lastWebhookAt = args.lastWebhookAt
    }
    if (args.lastError !== undefined) {
      patch.lastError = args.lastError
    }

    await ctx.db.patch(args.connectionId, patch)
  },
})

export const enqueuePushWebhook = internalMutation({
  args: {
    connectionId: v.id('repoConnections'),
    before: v.string(),
    after: v.string(),
    branch: v.string(),
    deliveryId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now()

    await ctx.db.patch(args.connectionId, {
      status: 'syncing',
      lastWebhookAt: now,
      updatedAt: now,
    })

    await ctx.scheduler.runAfter(0, internal.github.processPushWebhook, {
      connectionId: args.connectionId,
      before: args.before,
      after: args.after,
      branch: normalizeGitHubBranchRef(args.branch),
      deliveryId: args.deliveryId,
    })
  },
})

export const connectRepo = action({
  args: {
    token: v.string(),
    owner: v.string(),
    repo: v.string(),
    branch: v.string(),
    webhookUrl: v.string(),
  },
  handler: async (ctx, args): Promise<GitHubConnectRepoResult> => {
    const owner = args.owner.trim()
    const repo = args.repo.trim()
    const branch = normalizeGitHubBranchRef(args.branch)
    const token = args.token.trim()
    const webhookUrl = args.webhookUrl.trim().replace(/\/+$/, '')

    if (!token) {
      throw new Error(
        'Add a GitHub PAT before connecting a tracked repo. TrustLoop stores it in Convex so webhook-triggered syncs can fetch changed files after future commits.',
      )
    }
    if (!owner || !repo || !branch) {
      throw new Error('Owner, repo, and branch are required.')
    }
    if (!webhookUrl.startsWith('http')) {
      throw new Error('A public Convex site URL is required to register the GitHub webhook.')
    }

    const existingConnection = await ctx.runQuery(internal.github.getConnectionForWebhook, {
      owner,
      repo,
      branch,
    })

    const baseline = await resolveTrackedRepoBaselineWithClient(
      {
        token,
        owner,
        repo,
        branch,
        connectionId: existingConnection?._id,
      },
      fetch,
    )

    const webhookSecret =
      existingConnection?.webhookSecret || generateWebhookSecret()
    const webhookResult = await upsertGitHubWebhook(fetch, {
      token,
      owner,
      repo,
      webhookUrl,
      webhookSecret,
    })

    const connectionId = await ctx.runMutation(internal.github.saveConnection, {
      connectionId: existingConnection?._id,
      owner,
      repo,
      branch: baseline.branch,
      htmlUrl: baseline.repo.htmlUrl,
      token,
      webhookSecret,
      webhookUrl,
      webhookId: webhookResult.webhookId,
      webhookStatus: webhookResult.webhookStatus,
      webhookMessage: webhookResult.webhookMessage,
      status: webhookResult.webhookStatus === 'active' ? 'active' : 'error',
      lastProcessedCommitSha: baseline.headSha,
      lastSyncAt: Date.now(),
      lastWebhookAt: existingConnection?.lastWebhookAt,
      lastError:
        webhookResult.webhookStatus === 'error' ? webhookResult.webhookMessage : undefined,
    })

    const candidates = baseline.candidates.map((candidate) => ({
      ...candidate,
      connectionId,
    }))
    const runIds = await createRunsForCandidates(ctx, {
      connectionId,
      candidates,
      trigger: 'baseline',
    })

    return {
      connectionId,
      repo: baseline.repo,
      branch: baseline.branch,
      syncedSha: baseline.headSha,
      summary: baseline.summary,
      createdRuns: runIds.length,
      runIds,
      skipped: baseline.skipped,
      webhookStatus: webhookResult.webhookStatus,
      webhookMessage: webhookResult.webhookMessage,
    }
  },
})

export const processPushWebhook = internalAction({
  args: {
    connectionId: v.id('repoConnections'),
    before: v.string(),
    after: v.string(),
    branch: v.string(),
    deliveryId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.runQuery(internal.github.getConnectionById, {
      connectionId: args.connectionId,
    })

    if (!connection) {
      return {
        createdRuns: 0,
        reason: 'missing_connection',
      }
    }

    if (connection.lastProcessedCommitSha === args.after) {
      await ctx.runMutation(internal.github.markConnectionState, {
        connectionId: args.connectionId,
        status: 'active',
        lastWebhookAt: Date.now(),
      })

      return {
        createdRuns: 0,
        reason: 'already_processed',
      }
    }

    try {
      const changed = await resolvePushCandidatesWithClient(
        {
          token: connection.token,
          owner: connection.owner,
          repo: connection.repo,
          branch: normalizeGitHubBranchRef(args.branch || connection.branch),
          before: args.before,
          after: args.after,
          connectionId: args.connectionId,
        },
        fetch,
      )

      const runIds = await createRunsForCandidates(ctx, {
        connectionId: args.connectionId,
        candidates: changed.candidates.map((candidate) => ({
          ...candidate,
          connectionId: args.connectionId,
        })),
        trigger: 'push',
      })

      await ctx.runMutation(internal.github.markConnectionState, {
        connectionId: args.connectionId,
        status: 'active',
        lastProcessedCommitSha: changed.headSha,
        lastSyncAt: Date.now(),
        lastWebhookAt: Date.now(),
        lastError: '',
      })

      return {
        createdRuns: runIds.length,
        runIds,
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'GitHub push sync failed.'

      await ctx.runMutation(internal.github.markConnectionState, {
        connectionId: args.connectionId,
        status: 'error',
        lastWebhookAt: Date.now(),
        lastError: message,
      })

      return {
        createdRuns: 0,
        reason: message,
      }
    }
  },
})
