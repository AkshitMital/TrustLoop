import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

const sourceType = v.union(
  v.literal('prompt'),
  v.literal('code'),
  v.literal('demo'),
)

const runStatus = v.union(
  v.literal('queued'),
  v.literal('generating'),
  v.literal('attacking'),
  v.literal('awaiting_execution'),
  v.literal('evaluating'),
  v.literal('repairing'),
  v.literal('completed'),
  v.literal('error'),
)

const passFail = v.union(
  v.literal('pending'),
  v.literal('pass'),
  v.literal('fail'),
)

const severity = v.union(
  v.literal('low'),
  v.literal('medium'),
  v.literal('high'),
)

const category = v.union(
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

const assertionType = v.union(
  v.literal('returns'),
  v.literal('not_includes'),
  v.literal('no_throw'),
  v.literal('max_length'),
  v.literal('stable_repeat'),
)

const inputEnvelope = v.union(
  v.object({
    kind: v.literal('json'),
    value: v.optional(v.any()),
  }),
  v.object({
    kind: v.literal('undefined'),
  }),
)

const failureItem = v.object({
  title: v.string(),
  severity,
  category,
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

const eventSource = v.union(
  v.literal('client'),
  v.literal('worker'),
  v.literal('orchestrator'),
  v.literal('maker'),
  v.literal('red_team'),
  v.literal('eval_engine'),
  v.literal('system'),
)

export default defineSchema({
  runs: defineTable({
    title: v.string(),
    sourceType,
    sourceText: v.string(),
    language: v.literal('ts'),
    status: runStatus,
    currentVersionNumber: v.number(),
    currentScore: v.number(),
    passFail,
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_updatedAt', ['updatedAt']),

  runVersions: defineTable({
    runId: v.id('runs'),
    versionNumber: v.number(),
    role: v.union(v.literal('maker_initial'), v.literal('maker_patch')),
    code: v.string(),
    changeSummary: v.string(),
    createdAt: v.number(),
  })
    .index('by_runId', ['runId'])
    .index('by_runId_versionNumber', ['runId', 'versionNumber']),

  attackCases: defineTable({
    runId: v.id('runs'),
    versionNumber: v.number(),
    title: v.string(),
    category,
    inputEnvelope,
    inputPreview: v.string(),
    expectedOutcome: v.string(),
    whyThisCaseMatters: v.string(),
    severity,
    assertionType,
    expectedValue: v.optional(v.any()),
    maxDurationMs: v.optional(v.number()),
    repeatCount: v.optional(v.number()),
    result: v.union(
      v.literal('pass'),
      v.literal('fail'),
      v.literal('error'),
      v.literal('not_run'),
    ),
    evidence: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_runId_versionNumber', ['runId', 'versionNumber'])
    .index('by_runId', ['runId']),

  evalResults: defineTable({
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
    createdAt: v.number(),
  })
    .index('by_runId_versionNumber', ['runId', 'versionNumber'])
    .index('by_runId', ['runId']),

  fixSuggestions: defineTable({
    runId: v.id('runs'),
    fromVersionNumber: v.number(),
    toVersionNumber: v.number(),
    issueSummary: v.string(),
    suggestion: v.string(),
    patchedCode: v.string(),
    createdAt: v.number(),
  })
    .index('by_runId', ['runId'])
    .index('by_runId_toVersionNumber', ['runId', 'toVersionNumber']),

  runEvents: defineTable({
    runId: v.id('runs'),
    stage: v.string(),
    source: v.optional(eventSource),
    versionNumber: v.optional(v.number()),
    title: v.string(),
    detail: v.string(),
    debugData: v.optional(v.string()),
    severity: v.union(v.literal('info'), v.literal('warning'), v.literal('error')),
    createdAt: v.number(),
  })
    .index('by_runId', ['runId'])
    .index('by_runId_createdAt', ['runId', 'createdAt']),
})
