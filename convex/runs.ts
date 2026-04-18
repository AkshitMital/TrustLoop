import { v } from 'convex/values'
import { internal } from './_generated/api.js'
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server.js'
import { deriveProviderSummary } from '../shared/provider.js'
import { buildGitHubRunTitle } from '../shared/github.js'

const sourceTypeValidator = v.union(
  v.literal('prompt'),
  v.literal('code'),
  v.literal('github'),
  v.literal('demo'),
)

const githubSourceKindValidator = v.union(
  v.literal('pr_url'),
  v.literal('file_url'),
  v.literal('branch_diff'),
  v.literal('commit'),
  v.literal('repo_branch'),
  v.literal('push_sync'),
)

const githubChangeStatusValidator = v.union(
  v.literal('added'),
  v.literal('modified'),
  v.literal('removed'),
  v.literal('renamed'),
  v.literal('copied'),
  v.literal('changed'),
  v.literal('unchanged'),
)

const githubContextValidator = v.object({
  owner: v.string(),
  repo: v.string(),
  filePath: v.string(),
  sourceKind: githubSourceKindValidator,
  htmlUrl: v.string(),
  connectionId: v.optional(v.id('repoConnections')),
  branch: v.optional(v.string()),
  prNumber: v.optional(v.number()),
  commitSha: v.optional(v.string()),
  baseRef: v.optional(v.string()),
  headRef: v.optional(v.string()),
  changeStatus: v.optional(githubChangeStatusValidator),
  additions: v.optional(v.number()),
  deletions: v.optional(v.number()),
})

const severityValidator = v.union(
  v.literal('low'),
  v.literal('medium'),
  v.literal('high'),
)

const categoryValidator = v.union(
  v.literal('null_undefined'),
  v.literal('empty_input'),
  v.literal('malformed_payload'),
  v.literal('large_payload'),
  v.literal('boundary_condition'),
  v.literal('type_mismatch'),
  v.literal('injection_like'),
  v.literal('repeated_calls'),
  v.literal('logical_edge'),
  v.literal('performance_sensitive'),
)

const inputEnvelopeValidator = v.union(
  v.object({
    kind: v.literal('json'),
    value: v.optional(v.any()),
  }),
  v.object({
    kind: v.literal('undefined'),
  }),
)

const attackCaseArg = v.object({
  title: v.string(),
  category: categoryValidator,
  inputEnvelope: inputEnvelopeValidator,
  inputPreview: v.string(),
  expectedOutcome: v.string(),
  whyThisCaseMatters: v.string(),
  severity: severityValidator,
  assertionType: v.union(
    v.literal('returns'),
    v.literal('not_includes'),
    v.literal('no_throw'),
    v.literal('max_length'),
    v.literal('stable_repeat'),
    v.literal('subset'),
    v.literal('includes_all'),
  ),
  expectedValue: v.optional(v.any()),
  maxDurationMs: v.optional(v.number()),
  repeatCount: v.optional(v.number()),
})

const failureItem = v.object({
  title: v.string(),
  severity: severityValidator,
  category: categoryValidator,
  detail: v.string(),
})

const evidenceItem = v.object({
  label: v.string(),
  detail: v.string(),
})

const breakdownItem = v.object({
  score: v.number(),
  rationale: v.string(),
  detectedFailures: v.array(failureItem),
  evidence: v.array(evidenceItem),
})

const eventSourceValidator = v.union(
  v.literal('client'),
  v.literal('worker'),
  v.literal('orchestrator'),
  v.literal('maker'),
  v.literal('red_team'),
  v.literal('eval_engine'),
  v.literal('system'),
)

function defaultTitle(
  sourceType: 'prompt' | 'code' | 'github' | 'demo',
  sourceText: string,
  githubContext?: {
    owner: string
    repo: string
    filePath: string
    sourceKind:
      | 'pr_url'
      | 'file_url'
      | 'branch_diff'
      | 'commit'
      | 'repo_branch'
      | 'push_sync'
    htmlUrl: string
  } | null,
) {
  if (sourceType === 'demo') {
    return 'Seeded sanitize input demo'
  }

  if (sourceType === 'github' && githubContext) {
    return buildGitHubRunTitle(githubContext)
  }

  if (sourceType === 'prompt') {
    return sourceText.split('\n')[0]?.slice(0, 48) || 'Prompted trust run'
  }

  return 'Code trust run'
}

export const listRuns = query({
  args: {},
  handler: async (ctx) => {
    const runs = await ctx.db
      .query('runs')
      .withIndex('by_updatedAt')
      .order('desc')
      .collect()

    return await Promise.all(
      runs.map(async (run) => {
        const events = await ctx.db
          .query('runEvents')
          .withIndex('by_runId', (q) => q.eq('runId', run._id))
          .collect()

        return {
          ...run,
          latestVersionNumber: run.latestVersionNumber ?? run.currentVersionNumber,
          provider: deriveProviderSummary(run.sourceType, events),
        }
      }),
    )
  },
})

export const getRunDetail = query({
  args: {
    runId: v.id('runs'),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) {
      return null
    }

    const [versions, attackCases, evalResults, fixSuggestions, events] =
      await Promise.all([
        ctx.db
          .query('runVersions')
          .withIndex('by_runId', (q) => q.eq('runId', args.runId))
          .collect(),
        ctx.db
          .query('attackCases')
          .withIndex('by_runId', (q) => q.eq('runId', args.runId))
          .collect(),
        ctx.db
          .query('evalResults')
          .withIndex('by_runId', (q) => q.eq('runId', args.runId))
          .collect(),
        ctx.db
          .query('fixSuggestions')
          .withIndex('by_runId', (q) => q.eq('runId', args.runId))
          .collect(),
        ctx.db
          .query('runEvents')
          .withIndex('by_runId', (q) => q.eq('runId', args.runId))
          .collect(),
      ])

    const orderedVersions = [...versions].sort(
      (left, right) => left.versionNumber - right.versionNumber,
    )
    const latestVersionNumber =
      run.latestVersionNumber ??
      orderedVersions.at(-1)?.versionNumber ??
      run.currentVersionNumber
    const currentVersion =
      orderedVersions.find(
        (version) => version.versionNumber === run.currentVersionNumber,
      ) ?? orderedVersions.at(-1)
    const currentAttackCases = attackCases.filter(
      (attackCase) => attackCase.versionNumber === run.currentVersionNumber,
    )
    const currentEval =
      evalResults.find(
        (result) => result.versionNumber === run.currentVersionNumber,
      ) ?? null
    const previousEval =
      evalResults.find(
        (result) => result.versionNumber === run.currentVersionNumber - 1,
      ) ?? null
    const provider = deriveProviderSummary(run.sourceType, events)

    return {
      run: {
        ...run,
        latestVersionNumber,
      },
      provider,
      versions: orderedVersions,
      currentVersion: currentVersion ?? null,
      attackCases: attackCases.sort(
        (left, right) => left.versionNumber - right.versionNumber,
      ),
      currentAttackCases,
      evalResults: evalResults.sort(
        (left, right) => left.versionNumber - right.versionNumber,
      ),
      currentEval,
      previousEval,
      fixSuggestions: fixSuggestions.sort(
        (left, right) => left.toVersionNumber - right.toVersionNumber,
      ),
      events: events.sort((left, right) => right.createdAt - left.createdAt),
    }
  },
})

export const createRun = mutation({
  args: {
    title: v.string(),
    sourceType: sourceTypeValidator,
    sourceText: v.string(),
    githubContext: v.optional(githubContextValidator),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const normalizedTitle =
      args.title.trim() || defaultTitle(args.sourceType, args.sourceText, args.githubContext)
    const normalizedText =
      args.sourceType === 'demo' && !args.sourceText
        ? 'Build a sanitizeUserInput helper for profile fields.'
        : args.sourceText

    if (args.sourceType === 'github' && !args.githubContext) {
      throw new Error('GitHub runs require GitHub metadata.')
    }

    const runId = await ctx.db.insert('runs', {
      title: normalizedTitle,
      sourceType: args.sourceType,
      sourceText: normalizedText,
      githubContext: args.githubContext,
      language: 'ts',
      status: 'queued',
      currentVersionNumber: 0,
      latestVersionNumber: 0,
      currentScore: 0,
      passFail: 'pending',
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('runEvents', {
      runId,
      stage: 'queued',
      title: 'Run created',
      detail: 'The run is queued for Maker and Red Team orchestration.',
      severity: 'info',
      createdAt: now,
    })

    return runId
  },
})

export const logEvent = mutation({
  args: {
    runId: v.id('runs'),
    stage: v.string(),
    source: v.optional(eventSourceValidator),
    versionNumber: v.optional(v.number()),
    title: v.string(),
    detail: v.string(),
    debugData: v.optional(v.string()),
    severity: v.union(v.literal('info'), v.literal('warning'), v.literal('error')),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('runEvents', {
      ...args,
      createdAt: Date.now(),
    })
  },
})

export const reportRunError = mutation({
  args: {
    runId: v.id('runs'),
    stage: v.string(),
    title: v.string(),
    detail: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()

    await ctx.db.patch(args.runId, {
      status: 'error',
      updatedAt: now,
    })

    await ctx.db.insert('runEvents', {
      runId: args.runId,
      stage: args.stage,
      source: 'client',
      title: args.title,
      detail: args.detail,
      debugData: undefined,
      versionNumber: undefined,
      severity: 'error',
      createdAt: now,
    })
  },
})

export const getRunForBootstrap = internalQuery({
  args: {
    runId: v.id('runs'),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.runId)
  },
})

export const getExecutionContext = internalQuery({
  args: {
    runId: v.id('runs'),
    versionNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) {
      return null
    }

    const version = await ctx.db
      .query('runVersions')
      .withIndex('by_runId_versionNumber', (q) =>
        q.eq('runId', args.runId).eq('versionNumber', args.versionNumber),
      )
      .unique()

    if (!version) {
      return null
    }

    const attackCases = await ctx.db
      .query('attackCases')
      .withIndex('by_runId_versionNumber', (q) =>
        q.eq('runId', args.runId).eq('versionNumber', args.versionNumber),
      )
      .collect()

    return { run, version, attackCases }
  },
})

export const getEvaluationForVersion = internalQuery({
  args: {
    runId: v.id('runs'),
    versionNumber: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('evalResults')
      .withIndex('by_runId_versionNumber', (q) =>
        q.eq('runId', args.runId).eq('versionNumber', args.versionNumber),
      )
      .unique()
  },
})

export const listRunEvaluations = internalQuery({
  args: {
    runId: v.id('runs'),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('evalResults')
      .withIndex('by_runId', (q) => q.eq('runId', args.runId))
      .collect()
  },
})

export const setRunStatus = internalMutation({
  args: {
    runId: v.id('runs'),
    status: v.union(
      v.literal('queued'),
      v.literal('generating'),
      v.literal('attacking'),
      v.literal('awaiting_execution'),
      v.literal('evaluating'),
      v.literal('repairing'),
      v.literal('completed'),
      v.literal('error'),
    ),
    currentVersionNumber: v.optional(v.number()),
    latestVersionNumber: v.optional(v.number()),
    currentScore: v.optional(v.number()),
    passFail: v.optional(v.union(v.literal('pending'), v.literal('pass'), v.literal('fail'))),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, string | number> = {
      status: args.status,
      updatedAt: Date.now(),
    }

    if (args.currentVersionNumber !== undefined) {
      patch.currentVersionNumber = args.currentVersionNumber
    }
    if (args.latestVersionNumber !== undefined) {
      patch.latestVersionNumber = args.latestVersionNumber
    }
    if (args.currentScore !== undefined) {
      patch.currentScore = args.currentScore
    }
    if (args.passFail !== undefined) {
      patch.passFail = args.passFail
    }

    await ctx.db.patch(args.runId, patch)
  },
})

export const appendEvent = internalMutation({
  args: {
    runId: v.id('runs'),
    stage: v.string(),
    source: v.optional(eventSourceValidator),
    versionNumber: v.optional(v.number()),
    title: v.string(),
    detail: v.string(),
    debugData: v.optional(v.string()),
    severity: v.union(v.literal('info'), v.literal('warning'), v.literal('error')),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('runEvents', {
      ...args,
      createdAt: Date.now(),
    })
  },
})

export const enqueueBootstrap = internalMutation({
  args: {
    runId: v.id('runs'),
    title: v.string(),
    detail: v.string(),
    source: v.optional(eventSourceValidator),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.orchestrator.bootstrapRunInternal, {
      runId: args.runId,
    })

    await ctx.db.insert('runEvents', {
      runId: args.runId,
      stage: 'queued',
      source: args.source ?? 'system',
      title: args.title,
      detail: args.detail,
      severity: 'info',
      createdAt: Date.now(),
    })
  },
})

export const seedVersionArtifacts = internalMutation({
  args: {
    runId: v.id('runs'),
    versionNumber: v.number(),
    role: v.union(v.literal('maker_initial'), v.literal('maker_patch')),
    code: v.string(),
    changeSummary: v.string(),
    cases: v.array(attackCaseArg),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    await ctx.db.insert('runVersions', {
      runId: args.runId,
      versionNumber: args.versionNumber,
      role: args.role,
      code: args.code,
      changeSummary: args.changeSummary,
      createdAt: now,
    })

    for (const caseItem of args.cases) {
      await ctx.db.insert('attackCases', {
        runId: args.runId,
        versionNumber: args.versionNumber,
        title: caseItem.title,
        category: caseItem.category,
        inputEnvelope: caseItem.inputEnvelope,
        inputPreview: caseItem.inputPreview,
        expectedOutcome: caseItem.expectedOutcome,
        whyThisCaseMatters: caseItem.whyThisCaseMatters,
        severity: caseItem.severity,
        assertionType: caseItem.assertionType,
        expectedValue: caseItem.expectedValue,
        maxDurationMs: caseItem.maxDurationMs,
        repeatCount: caseItem.repeatCount,
        result: 'not_run',
        evidence: undefined,
        createdAt: now,
      })
    }

    await ctx.db.patch(args.runId, {
      currentVersionNumber: args.versionNumber,
      latestVersionNumber: args.versionNumber,
      status: 'awaiting_execution',
      updatedAt: now,
    })
  },
})

export const saveEvaluation = internalMutation({
  args: {
    runId: v.id('runs'),
    versionNumber: v.number(),
    mode: v.union(v.literal('executed'), v.literal('analysis_only')),
    correctnessScore: v.number(),
    robustnessScore: v.number(),
    securityScore: v.number(),
    performanceScore: v.number(),
    codeQualityScore: v.number(),
    overallScore: v.number(),
    summary: v.string(),
    detectedFailures: v.array(failureItem),
    evidence: v.array(evidenceItem),
    breakdown: v.object({
      correctness: breakdownItem,
      robustness: breakdownItem,
      security: breakdownItem,
      performance: breakdownItem,
      codeQuality: breakdownItem,
    }),
    attackResults: v.array(
      v.object({
        attackCaseId: v.id('attackCases'),
        result: v.union(v.literal('pass'), v.literal('fail'), v.literal('error')),
        durationMs: v.number(),
        outputSummary: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now()

    await ctx.db.insert('evalResults', {
      runId: args.runId,
      versionNumber: args.versionNumber,
      mode: args.mode,
      correctnessScore: args.correctnessScore,
      robustnessScore: args.robustnessScore,
      securityScore: args.securityScore,
      performanceScore: args.performanceScore,
      codeQualityScore: args.codeQualityScore,
      overallScore: args.overallScore,
      summary: args.summary,
      detectedFailures: args.detectedFailures,
      evidence: args.evidence,
      breakdown: args.breakdown,
      createdAt: now,
    })

    for (const result of args.attackResults) {
      const attackCase = await ctx.db.get(result.attackCaseId)
      if (!attackCase) {
        continue
      }

      await ctx.db.patch(result.attackCaseId, {
        result: result.result,
        evidence:
          result.result === 'pass'
            ? `Passed in ${result.durationMs.toFixed(1)}ms`
            : result.errorMessage ?? result.outputSummary ?? 'No evidence captured.',
      })
    }

    await ctx.db.patch(args.runId, {
      currentScore: args.overallScore,
      updatedAt: now,
    })
  },
})

export const createPatchedVersion = internalMutation({
  args: {
    runId: v.id('runs'),
    fromVersionNumber: v.number(),
    toVersionNumber: v.number(),
    code: v.string(),
    changeSummary: v.string(),
    issueSummary: v.string(),
    suggestion: v.string(),
    cases: v.array(attackCaseArg),
  },
  handler: async (ctx, args) => {
    const now = Date.now()

    await ctx.db.insert('fixSuggestions', {
      runId: args.runId,
      fromVersionNumber: args.fromVersionNumber,
      toVersionNumber: args.toVersionNumber,
      issueSummary: args.issueSummary,
      suggestion: args.suggestion,
      patchedCode: args.code,
      createdAt: now,
    })

    await ctx.db.insert('runVersions', {
      runId: args.runId,
      versionNumber: args.toVersionNumber,
      role: 'maker_patch',
      code: args.code,
      changeSummary: args.changeSummary,
      createdAt: now,
    })

    for (const caseItem of args.cases) {
      await ctx.db.insert('attackCases', {
        runId: args.runId,
        versionNumber: args.toVersionNumber,
        title: caseItem.title,
        category: caseItem.category,
        inputEnvelope: caseItem.inputEnvelope,
        inputPreview: caseItem.inputPreview,
        expectedOutcome: caseItem.expectedOutcome,
        whyThisCaseMatters: caseItem.whyThisCaseMatters,
        severity: caseItem.severity,
        assertionType: caseItem.assertionType,
        expectedValue: caseItem.expectedValue,
        maxDurationMs: caseItem.maxDurationMs,
        repeatCount: caseItem.repeatCount,
        result: 'not_run',
        evidence: undefined,
        createdAt: now,
      })
    }

    await ctx.db.patch(args.runId, {
      currentVersionNumber: args.toVersionNumber,
      latestVersionNumber: args.toVersionNumber,
      status: 'awaiting_execution',
      updatedAt: now,
    })
  },
})

export const completeRun = internalMutation({
  args: {
    runId: v.id('runs'),
    passFail: v.union(v.literal('pass'), v.literal('fail')),
    currentScore: v.number(),
    currentVersionNumber: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: 'completed',
      passFail: args.passFail,
      currentScore: args.currentScore,
      currentVersionNumber: args.currentVersionNumber,
      updatedAt: Date.now(),
    })
  },
})

export const clearAllData = mutation({
  args: {},
  handler: async (ctx) => {
    const repoConnections = await ctx.db.query('repoConnections').collect()
    const runs = await ctx.db.query('runs').collect()
    const runVersions = await ctx.db.query('runVersions').collect()
    const attackCases = await ctx.db.query('attackCases').collect()
    const evalResults = await ctx.db.query('evalResults').collect()
    const fixSuggestions = await ctx.db.query('fixSuggestions').collect()
    const runEvents = await ctx.db.query('runEvents').collect()

    for (const doc of attackCases) {
      await ctx.db.delete(doc._id)
    }
    for (const doc of evalResults) {
      await ctx.db.delete(doc._id)
    }
    for (const doc of fixSuggestions) {
      await ctx.db.delete(doc._id)
    }
    for (const doc of runEvents) {
      await ctx.db.delete(doc._id)
    }
    for (const doc of runVersions) {
      await ctx.db.delete(doc._id)
    }
    for (const doc of runs) {
      await ctx.db.delete(doc._id)
    }
    for (const doc of repoConnections) {
      await ctx.db.delete(doc._id)
    }

    return {
      repoConnections: repoConnections.length,
      runs: runs.length,
      runVersions: runVersions.length,
      attackCases: attackCases.length,
      evalResults: evalResults.length,
      fixSuggestions: fixSuggestions.length,
      runEvents: runEvents.length,
    }
  },
})
