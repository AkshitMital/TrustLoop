import type { Id } from '../convex/_generated/dataModel'

export type SourceType = 'prompt' | 'code' | 'demo'
export type RunStatus =
  | 'queued'
  | 'generating'
  | 'attacking'
  | 'awaiting_execution'
  | 'evaluating'
  | 'repairing'
  | 'completed'
  | 'error'
export type PassFail = 'pending' | 'pass' | 'fail'
export type Severity = 'low' | 'medium' | 'high'
export type EvaluationMode = 'executed' | 'analysis_only'
export type ScenarioKey = 'sanitize' | 'sum'
export type AttackCategory =
  | 'null_undefined'
  | 'empty_input'
  | 'malformed_payload'
  | 'large_payload'
  | 'boundary_condition'
  | 'type_mismatch'
  | 'injection_like'
  | 'repeated_calls'
  | 'logical_edge'
  | 'performance_sensitive'

export type AssertionType =
  | 'returns'
  | 'not_includes'
  | 'no_throw'
  | 'max_length'
  | 'stable_repeat'

export type InputEnvelope =
  | {
      kind: 'json'
      value: unknown
    }
  | {
      kind: 'undefined'
    }

export interface AttackCaseTemplate {
  title: string
  category: AttackCategory
  inputEnvelope: InputEnvelope
  inputPreview: string
  expectedOutcome: string
  whyThisCaseMatters: string
  severity: Severity
  assertionType: AssertionType
  expectedValue?: unknown
  maxDurationMs?: number
  repeatCount?: number
}

export interface ExecutionCaseResult {
  attackCaseId: Id<'attackCases'>
  title: string
  category: AttackCategory
  severity: Severity
  result: 'pass' | 'fail' | 'error'
  durationMs: number
  outputSummary?: string
  errorMessage?: string
}

export interface ExecutionReport {
  mode: EvaluationMode
  entryPoint?: string
  notes: string[]
  attackResults: ExecutionCaseResult[]
  summary: {
    total: number
    passed: number
    failed: number
    errors: number
    averageDurationMs: number
  }
}

export interface FailureItem {
  title: string
  severity: Severity
  category: AttackCategory
  detail: string
}

export interface EvidenceItem {
  label: string
  detail: string
}

export interface CategoryScore {
  score: number
  rationale: string
  detectedFailures: FailureItem[]
  evidence: EvidenceItem[]
}

export interface EvaluationOutput {
  correctnessScore: number
  robustnessScore: number
  securityScore: number
  performanceScore: number
  codeQualityScore: number
  overallScore: number
  summary: string
  detectedFailures: FailureItem[]
  evidence: EvidenceItem[]
  passFail: 'pass' | 'fail'
  perCategory: {
    correctness: CategoryScore
    robustness: CategoryScore
    security: CategoryScore
    performance: CategoryScore
    codeQuality: CategoryScore
  }
}

export interface EvaluationSnapshot {
  versionNumber: number
  mode: EvaluationMode
  overallScore: number
  detectedFailures: FailureItem[]
}

export interface RunSeedInput {
  sourceType: SourceType
  title: string
  sourceText: string
}

export interface DraftArtifacts {
  scenario: ScenarioKey
  code: string
  changeSummary: string
  cases: AttackCaseTemplate[]
}

export interface PatchArtifacts {
  code: string
  changeSummary: string
  issueSummary: string
  suggestion: string
  cases: AttackCaseTemplate[]
}

export const MAX_VERSION_NUMBER = 20

const CATEGORY_LABEL: Record<AttackCategory, string> = {
  null_undefined: 'Null / undefined handling',
  empty_input: 'Empty input handling',
  malformed_payload: 'Malformed payload handling',
  large_payload: 'Large payload safety',
  boundary_condition: 'Boundary condition handling',
  type_mismatch: 'Type mismatch handling',
  injection_like: 'Injection-like string safety',
  repeated_calls: 'Repeated-call stability',
  logical_edge: 'Logical edge case handling',
  performance_sensitive: 'Performance-sensitive behavior',
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function stringifyValue(value: unknown) {
  if (typeof value === 'string') {
    return value
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function extractExportedFunctionName(code: string) {
  const functionMatch = code.match(
    /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/m,
  )

  if (functionMatch?.[1]) {
    return functionMatch[1]
  }

  const constMatch = code.match(
    /export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/m,
  )

  if (constMatch?.[1]) {
    return constMatch[1]
  }

  return null
}

export function ensureExported(code: string) {
  if (/\bexport\b/.test(code)) {
    return code
  }

  const namedFunction = code.match(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/m)
  if (namedFunction) {
    return code.replace(namedFunction[0], `export ${namedFunction[0].trimStart()}`)
  }

  const namedConst = code.match(
    /^\s*const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/m,
  )
  if (namedConst) {
    return code.replace(namedConst[0], `export ${namedConst[0].trimStart()}`)
  }

  return code
}

export function inferScenarioFromText(text: string): ScenarioKey {
  const normalized = text.toLowerCase()
  if (
    /\b(sum|add|total|accumulate|numbers?|array)\b/.test(normalized) &&
    !/\bsanitize\b/.test(normalized)
  ) {
    return 'sum'
  }

  return 'sanitize'
}

function sanitizeInitialCode(name: string) {
  return `export function ${name}(input) {
  return input.trim().toLowerCase()
}`
}

function sanitizePatchStageTwo(name: string) {
  return `export function ${name}(input) {
  if (typeof input !== "string") {
    return ""
  }

  const trimmed = input.trim()

  if (!trimmed) {
    return ""
  }

  return trimmed.toLowerCase()
}`
}

function sanitizePatchStageThree(name: string) {
  return `export function ${name}(input) {
  if (typeof input !== "string") {
    return ""
  }

  const bounded = input.slice(0, 5000)
  const trimmed = bounded.trim()

  if (!trimmed) {
    return ""
  }

  return trimmed.toLowerCase()
}`
}

function sanitizePatchStageFour(name: string) {
  return `export function ${name}(input) {
  if (typeof input !== "string") {
    return ""
  }

  const bounded = input.slice(0, 5000)
  const trimmed = bounded.trim()

  if (!trimmed) {
    return ""
  }

  const withoutScripts = trimmed.replace(/<script\\b[^>]*>(.*?)<\\/script>/gi, "")

  return withoutScripts.toLowerCase()
}`
}

function sumInitialCode(name: string) {
  return `export function ${name}(input) {
  return input.reduce((sum, item) => sum + item, 0)
}`
}

function sumPatchStageTwo(name: string) {
  return `export function ${name}(input) {
  if (!Array.isArray(input) || input.length === 0) {
    return 0
  }

  return input.reduce((sum, item) => sum + item, 0)
}`
}

function sumPatchStageThree(name: string) {
  return `export function ${name}(input) {
  if (!Array.isArray(input) || input.length === 0) {
    return 0
  }

  return input.reduce((sum, item) => {
    return Number.isFinite(item) ? sum + item : sum
  }, 0)
}`
}

function sumPatchStageFour(name: string) {
  return `export function ${name}(input) {
  if (!Array.isArray(input) || input.length === 0) {
    return 0
  }

  return input.reduce((sum, item) => {
    if (!Number.isFinite(item)) {
      return sum
    }

    return sum + item
  }, 0)
}`
}

function buildSanitizeCases(): AttackCaseTemplate[] {
  return [
    {
      title: 'Undefined payload',
      category: 'null_undefined',
      inputEnvelope: { kind: 'undefined' },
      inputPreview: 'undefined',
      expectedOutcome: 'Returns an empty string instead of throwing.',
      whyThisCaseMatters: 'Generated helpers should fail safely on missing input.',
      severity: 'high',
      assertionType: 'returns',
      expectedValue: '',
    },
    {
      title: 'Empty string',
      category: 'empty_input',
      inputEnvelope: { kind: 'json', value: '' },
      inputPreview: '""',
      expectedOutcome: 'Returns an empty string.',
      whyThisCaseMatters: 'Empty inputs are common in user-generated forms.',
      severity: 'medium',
      assertionType: 'returns',
      expectedValue: '',
    },
    {
      title: 'Malformed object payload',
      category: 'malformed_payload',
      inputEnvelope: { kind: 'json', value: { raw: 'hello' } },
      inputPreview: '{ "raw": "hello" }',
      expectedOutcome: 'Returns an empty string instead of crashing.',
      whyThisCaseMatters: 'Unexpected object payloads should not explode the helper.',
      severity: 'high',
      assertionType: 'returns',
      expectedValue: '',
    },
    {
      title: 'Boundary trim and lowercase',
      category: 'boundary_condition',
      inputEnvelope: { kind: 'json', value: '  MiXeD Case  ' },
      inputPreview: '"  MiXeD Case  "',
      expectedOutcome: 'Returns "mixed case".',
      whyThisCaseMatters: 'Core correctness should still work on a normal string.',
      severity: 'medium',
      assertionType: 'returns',
      expectedValue: 'mixed case',
    },
    {
      title: 'Numeric payload',
      category: 'type_mismatch',
      inputEnvelope: { kind: 'json', value: 42 },
      inputPreview: '42',
      expectedOutcome: 'Returns an empty string.',
      whyThisCaseMatters: 'Type mismatches are one of the first places AI code breaks.',
      severity: 'high',
      assertionType: 'returns',
      expectedValue: '',
    },
    {
      title: 'Injection-like string',
      category: 'injection_like',
      inputEnvelope: {
        kind: 'json',
        value: '<script>alert("pwned")</script>Profile',
      },
      inputPreview: '"<script>alert(\\"pwned\\")</script>Profile"',
      expectedOutcome: 'Output does not contain the raw `<script>` tag.',
      whyThisCaseMatters: 'Visible security probes make the trust story tangible.',
      severity: 'high',
      assertionType: 'not_includes',
      expectedValue: '<script',
    },
    {
      title: 'Large payload clamp',
      category: 'large_payload',
      inputEnvelope: { kind: 'json', value: 'A'.repeat(7000) },
      inputPreview: '"A".repeat(7000)',
      expectedOutcome: 'Output is bounded to 5000 characters or fewer.',
      whyThisCaseMatters: 'Large payloads expose performance cliffs and unbounded output.',
      severity: 'medium',
      assertionType: 'max_length',
      expectedValue: 5000,
      maxDurationMs: 30,
    },
    {
      title: 'Repeated-call stability',
      category: 'repeated_calls',
      inputEnvelope: { kind: 'json', value: '  Repeat Me  ' },
      inputPreview: '"  Repeat Me  "',
      expectedOutcome: 'Repeated calls stay stable and fast.',
      whyThisCaseMatters: 'The demo should show deterministic behavior under repeated use.',
      severity: 'low',
      assertionType: 'stable_repeat',
      expectedValue: 'repeat me',
      maxDurationMs: 40,
      repeatCount: 50,
    },
  ]
}

function buildSumCases(): AttackCaseTemplate[] {
  return [
    {
      title: 'Undefined input array',
      category: 'null_undefined',
      inputEnvelope: { kind: 'undefined' },
      inputPreview: 'undefined',
      expectedOutcome: 'Returns 0 instead of throwing.',
      whyThisCaseMatters: 'Array reducers fail loudly on missing input.',
      severity: 'high',
      assertionType: 'returns',
      expectedValue: 0,
    },
    {
      title: 'Empty array',
      category: 'empty_input',
      inputEnvelope: { kind: 'json', value: [] },
      inputPreview: '[]',
      expectedOutcome: 'Returns 0.',
      whyThisCaseMatters: 'Empty collections are a basic correctness edge case.',
      severity: 'medium',
      assertionType: 'returns',
      expectedValue: 0,
    },
    {
      title: 'Malformed string payload',
      category: 'malformed_payload',
      inputEnvelope: { kind: 'json', value: '1,2,3' },
      inputPreview: '"1,2,3"',
      expectedOutcome: 'Returns 0 instead of throwing.',
      whyThisCaseMatters: 'String payloads are a common boundary-crossing mistake.',
      severity: 'high',
      assertionType: 'returns',
      expectedValue: 0,
    },
    {
      title: 'Negative and positive values',
      category: 'boundary_condition',
      inputEnvelope: { kind: 'json', value: [-5, 10, -1] },
      inputPreview: '[-5, 10, -1]',
      expectedOutcome: 'Returns 4.',
      whyThisCaseMatters: 'The core arithmetic should still work on a realistic edge mix.',
      severity: 'medium',
      assertionType: 'returns',
      expectedValue: 4,
    },
    {
      title: 'Non-number item',
      category: 'type_mismatch',
      inputEnvelope: { kind: 'json', value: [5, 'x', 10] },
      inputPreview: '[5, "x", 10]',
      expectedOutcome: 'Ignores non-number items and returns 15.',
      whyThisCaseMatters: 'Mixed arrays expose how strict or brittle the function is.',
      severity: 'high',
      assertionType: 'returns',
      expectedValue: 15,
    },
    {
      title: 'Large array performance',
      category: 'performance_sensitive',
      inputEnvelope: { kind: 'json', value: Array.from({ length: 2000 }, () => 1) },
      inputPreview: 'Array(2000).fill(1)',
      expectedOutcome: 'Returns 2000 and stays quick.',
      whyThisCaseMatters: 'Performance regressions are visible in demos even at small scale.',
      severity: 'medium',
      assertionType: 'returns',
      expectedValue: 2000,
      maxDurationMs: 30,
    },
    {
      title: 'Repeated-call stability',
      category: 'repeated_calls',
      inputEnvelope: { kind: 'json', value: [1, 2, 3] },
      inputPreview: '[1, 2, 3]',
      expectedOutcome: 'Repeated calls return 6 consistently.',
      whyThisCaseMatters: 'The score should represent stable behavior, not one lucky run.',
      severity: 'low',
      assertionType: 'stable_repeat',
      expectedValue: 6,
      maxDurationMs: 40,
      repeatCount: 80,
    },
    {
      title: 'Logical edge with NaN values',
      category: 'logical_edge',
      inputEnvelope: { kind: 'json', value: [1, Number.NaN, 4] },
      inputPreview: '[1, NaN, 4]',
      expectedOutcome: 'Returns 5.',
      whyThisCaseMatters: 'Quiet data quality issues should not poison the entire result.',
      severity: 'medium',
      assertionType: 'returns',
      expectedValue: 5,
    },
  ]
}

export function buildInitialArtifacts(input: RunSeedInput): DraftArtifacts {
  const hintText = `${input.title}\n${input.sourceText}`
  const scenario = inferScenarioFromText(hintText)
  const fallbackName = scenario === 'sum' ? 'addNumbers' : 'sanitizeUserInput'

  if (input.sourceType === 'code') {
    const code = ensureExported(input.sourceText)
    return {
      scenario,
      code,
      changeSummary: 'User-supplied code is now under attack.',
      cases:
        scenario === 'sum'
          ? buildSumCases()
          : buildSanitizeCases(),
    }
  }

  const functionName = fallbackName
  return {
    scenario,
    code:
      scenario === 'sum'
        ? sumInitialCode(functionName)
        : sanitizeInitialCode(functionName),
    changeSummary:
      input.sourceType === 'demo'
        ? 'Seeded Maker draft created for the guaranteed fail-then-improve demo.'
        : 'Maker draft generated from the submitted prompt.',
    cases:
      scenario === 'sum'
        ? buildSumCases()
        : buildSanitizeCases(),
  }
}

export function cloneCasesForVersion(cases: AttackCaseTemplate[]) {
  return cases.map((caseItem) => ({ ...caseItem }))
}

export function buildPatchedArtifacts(
  scenario: ScenarioKey,
  code: string,
  failures: FailureItem[],
  targetVersionNumber: number,
): PatchArtifacts {
  const functionName =
    extractExportedFunctionName(code) ??
    (scenario === 'sum' ? 'addNumbers' : 'sanitizeUserInput')

  const uniqueFailureLabels = Array.from(new Set(failures.map((failure) => failure.title)))
  const targetVersion = clamp(targetVersionNumber, 2, MAX_VERSION_NUMBER)

  if (scenario === 'sum') {
    const stagedCode =
      targetVersion === 2
        ? sumPatchStageTwo(functionName)
        : targetVersion === 3
          ? sumPatchStageThree(functionName)
          : sumPatchStageFour(functionName)

    const stagedChangeSummary =
      targetVersion === 2
        ? 'Adds an array guard so reducers stop crashing on missing or malformed input.'
        : targetVersion === 3
          ? 'Filters out non-number items while keeping the reducer deterministic.'
          : 'Locks in the reducer contract and keeps noisy values from poisoning the total.'

    const stagedSuggestion =
      targetVersion === 2
        ? 'Start by guarding the reducer so bad inputs return a safe default instead of exploding.'
        : targetVersion === 3
          ? 'Harden mixed-array handling next so unexpected items no longer corrupt the calculation.'
          : 'Finalize the arithmetic path so the reducer stays strict, deterministic, and easy to read.'

    return {
      code: stagedCode,
      changeSummary: stagedChangeSummary,
      issueSummary: uniqueFailureLabels.join(', '),
      suggestion: stagedSuggestion,
      cases: buildSumCases(),
    }
  }

  return {
    code:
      targetVersion === 2
        ? sanitizePatchStageTwo(functionName)
        : targetVersion === 3
          ? sanitizePatchStageThree(functionName)
          : sanitizePatchStageFour(functionName),
    changeSummary:
      targetVersion === 2
        ? 'Adds null and type guards so malformed inputs stop crashing the helper.'
        : targetVersion === 3
          ? 'Clamps oversized payloads while preserving the normalization behavior.'
          : 'Neutralizes raw script tags after the helper is already safe on malformed and oversized input.',
    issueSummary: uniqueFailureLabels.join(', '),
    suggestion:
      targetVersion === 2
        ? 'First make the helper safe: reject non-string input and preserve the basic trim/lowercase behavior.'
        : targetVersion === 3
          ? 'Next bound the output size so large payloads stop creating noisy or unbounded results.'
          : 'Finally strip raw script tags so the helper closes the remaining security hole before returning text.',
    cases:
      buildSanitizeCases(),
  }
}

function severityPenalty(severity: Severity) {
  switch (severity) {
    case 'high':
      return 26
    case 'medium':
      return 14
    case 'low':
      return 8
  }
}

function scoreCategory(
  title: string,
  results: ExecutionCaseResult[],
  categories: AttackCategory[],
  baseScore: number,
  code: string,
  executionMode: EvaluationMode,
): CategoryScore {
  const relevant = results.filter((result) => categories.includes(result.category))
  const failures = relevant
    .filter((result) => result.result !== 'pass')
    .map<FailureItem>((result) => ({
      title: result.title,
      severity: result.severity,
      category: result.category,
      detail:
        result.result === 'error'
          ? result.errorMessage ?? `${title} crashed during evaluation.`
          : `${title} failed: ${result.outputSummary ?? 'unexpected output.'}`,
    }))

  const penalty = failures.reduce((total, failure) => total + severityPenalty(failure.severity), 0)

  let score = clamp(baseScore - penalty, 18, 100)

  if (executionMode === 'analysis_only') {
    score = clamp(score - 18, 15, 82)
  }

  if (title === 'Code quality') {
    if (!/\bif\s*\(/.test(code)) {
      score = clamp(score - 10, 18, 100)
    }
    if (/\bconsole\.log\b/.test(code)) {
      score = clamp(score - 8, 18, 100)
    }
    if (/slice\(0,\s*5000\)/.test(code) || /replace\(/.test(code)) {
      score = clamp(score + 4, 18, 96)
    }
  }

  const evidence = relevant.slice(0, 3).map<EvidenceItem>((result) => ({
    label: CATEGORY_LABEL[result.category],
    detail:
      result.result === 'pass'
        ? `${result.title} passed in ${result.durationMs.toFixed(1)}ms.`
        : `${result.title} ${result.result === 'error' ? 'errored' : 'failed'} in ${result.durationMs.toFixed(1)}ms.`,
  }))

  const rationale =
    failures.length === 0
      ? `${title} held up across its targeted attack cases.`
      : `${title} lost points on ${failures.length} targeted attack case${failures.length === 1 ? '' : 's'}.`

  return {
    score,
    rationale,
    detectedFailures: failures,
    evidence,
  }
}

function overallSummary(execution: ExecutionReport, overallScore: number, passFail: PassFail) {
  return `${execution.mode === 'analysis_only' ? 'Analysis-only' : 'Executed'} evaluation ran ${execution.summary.total} attack cases with ${execution.summary.failed} failures and ${execution.summary.errors} runtime errors. Overall score ${overallScore}. Final verdict: ${passFail}.`
}

export function derivePassFailFromEvaluation(
  evaluation: Pick<EvaluationSnapshot, 'overallScore' | 'detectedFailures'>,
): Extract<PassFail, 'pass' | 'fail'> {
  return evaluation.overallScore >= 80 &&
    !evaluation.detectedFailures.some((failure) => failure.severity === 'high')
    ? 'pass'
    : 'fail'
}

export function compareEvaluationsForBest<T extends EvaluationSnapshot>(
  left: T,
  right: T,
) {
  const leftPassFail = derivePassFailFromEvaluation(left)
  const rightPassFail = derivePassFailFromEvaluation(right)

  if (leftPassFail !== rightPassFail) {
    return leftPassFail === 'pass' ? 1 : -1
  }

  if (left.overallScore !== right.overallScore) {
    return left.overallScore > right.overallScore ? 1 : -1
  }

  if (left.mode !== right.mode) {
    return left.mode === 'executed' ? 1 : -1
  }

  if (left.versionNumber !== right.versionNumber) {
    return left.versionNumber > right.versionNumber ? 1 : -1
  }

  return 0
}

export function pickBestEvaluation<T extends EvaluationSnapshot>(evaluations: T[]) {
  return evaluations.reduce<T | null>((best, candidate) => {
    if (!best) {
      return candidate
    }

    return compareEvaluationsForBest(candidate, best) > 0 ? candidate : best
  }, null)
}

export function scoreExecution(code: string, execution: ExecutionReport): EvaluationOutput {
  const correctness = scoreCategory(
    'Correctness',
    execution.attackResults,
    ['empty_input', 'boundary_condition', 'logical_edge'],
    96,
    code,
    execution.mode,
  )

  const robustness = scoreCategory(
    'Robustness',
    execution.attackResults,
    ['null_undefined', 'malformed_payload', 'type_mismatch', 'repeated_calls'],
    94,
    code,
    execution.mode,
  )

  const security = scoreCategory(
    'Security',
    execution.attackResults,
    ['injection_like'],
    92,
    code,
    execution.mode,
  )

  const performance = scoreCategory(
    'Performance',
    execution.attackResults,
    ['large_payload', 'performance_sensitive', 'repeated_calls'],
    90,
    code,
    execution.mode,
  )

  const codeQuality = scoreCategory(
    'Code quality',
    execution.attackResults,
    [],
    88,
    code,
    execution.mode,
  )

  const overallScore = Math.round(
    correctness.score * 0.35 +
      robustness.score * 0.25 +
      security.score * 0.2 +
      performance.score * 0.1 +
      codeQuality.score * 0.1,
  )

  const detectedFailures = [
    ...correctness.detectedFailures,
    ...robustness.detectedFailures,
    ...security.detectedFailures,
    ...performance.detectedFailures,
  ]

  const passFail = derivePassFailFromEvaluation({
    overallScore,
    detectedFailures,
  })

  return {
    correctnessScore: correctness.score,
    robustnessScore: robustness.score,
    securityScore: security.score,
    performanceScore: performance.score,
    codeQualityScore: codeQuality.score,
    overallScore,
    summary: overallSummary(execution, overallScore, passFail),
    detectedFailures,
    evidence: [
      ...correctness.evidence,
      ...robustness.evidence,
      ...security.evidence,
      ...performance.evidence,
      {
        label: 'Execution mode',
        detail:
          execution.mode === 'analysis_only'
            ? 'Execution fell back to analysis-only because the evaluator could not safely run the code directly.'
            : `Entry point ${execution.entryPoint ?? 'unknown'} executed successfully in the evaluator.`,
      },
    ],
    passFail,
    perCategory: {
      correctness,
      robustness,
      security,
      performance,
      codeQuality,
    },
  }
}

export function summarizeResultValue(value: unknown) {
  if (typeof value === 'string') {
    return value.length > 80 ? `${value.slice(0, 77)}...` : value
  }

  return stringifyValue(value)
}
