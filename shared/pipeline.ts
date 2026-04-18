import type { Id } from '../convex/_generated/dataModel'

export type SourceType = 'prompt' | 'code' | 'github' | 'demo'
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
export type ScenarioKey =
  | 'sanitize'
  | 'sum'
  | 'merge_preferences'
  | 'build_query'
  | 'normalize_checkout'
  | 'serialize_tags'
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
  | 'subset'
  | 'includes_all'

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

const DEFAULT_FUNCTION_NAME_BY_SCENARIO: Record<ScenarioKey, string> = {
  sanitize: 'sanitizeUserInput',
  sum: 'addNumbers',
  merge_preferences: 'mergeUserPreferences',
  build_query: 'buildQueryString',
  normalize_checkout: 'normalizeCheckout',
  serialize_tags: 'serializeTags',
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

export function defaultFunctionNameForScenario(scenario: ScenarioKey) {
  return DEFAULT_FUNCTION_NAME_BY_SCENARIO[scenario]
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

  const scores: Record<ScenarioKey, number> = {
    sanitize: 0,
    sum: 0,
    merge_preferences: 0,
    build_query: 0,
    normalize_checkout: 0,
    serialize_tags: 0,
  }

  const award = (scenario: ScenarioKey, points: number, pattern: RegExp) => {
    if (pattern.test(normalized)) {
      scores[scenario] += points
    }
  }

  award('merge_preferences', 10, /\bmerge(user)?preferences?\b/)
  award('merge_preferences', 6, /\bpreferences?\b/)
  award('merge_preferences', 4, /\b(defaults?|stored|incoming|overrides?)\b/)
  award('merge_preferences', 2, /\bprofile\b/)

  award('build_query', 10, /\b(buildquery|stringifyquery|querystring)\b/)
  award('build_query', 8, /\b(urlsearchparams|searchparams)\b/)
  award('build_query', 5, /\bquery\b/)
  award('build_query', 4, /\b(params?|filters?)\b/)

  award('normalize_checkout', 10, /\bnormalizecheckout\b/)
  award('normalize_checkout', 7, /\bcheckout\b/)
  award('normalize_checkout', 4, /\b(cart|shipping|billing|coupon|order|line items?)\b/)

  award('serialize_tags', 10, /\bserializetags?\b/)
  award('serialize_tags', 6, /\btags?\b/)
  award('serialize_tags', 4, /\b(labels?|keywords?)\b/)
  award('serialize_tags', 3, /\b(csv|comma-separated|join)\b/)

  award('sum', 10, /\b(addnumbers|sumnumbers|sumarray|calculatetotal)\b/)
  award('sum', 6, /\b(sum|total|accumulate|reduce)\b/)
  award('sum', 5, /\b(numbers?|numeric)\b/)
  award('sum', 4, /\barray\b/)

  award('sanitize', 10, /\bsanitize(user)?input\b/)
  award('sanitize', 7, /\bsanitize\b/)
  award('sanitize', 4, /\b(trim|lowercase|normalize text|normalize string)\b/)
  award('sanitize', 3, /\bscript tag|xss\b/)

  const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1])
  const [bestScenario, bestScore] = ranked[0] ?? ['sanitize', 0]

  if (bestScore <= 0) {
    return 'sanitize'
  }

  return bestScenario as ScenarioKey
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

function mergePreferencesInitialCode(name: string) {
  return `export function ${name}(input) {
  return {
    ...input.defaults,
    ...input.stored,
    ...input.incoming,
  }
}`
}

function mergePreferencesPatchStageTwo(name: string) {
  return `export function ${name}(input) {
  const isRecord = (value) => {
    return value !== null && typeof value === "object" && !Array.isArray(value)
  }

  const defaults = isRecord(input?.defaults) ? input.defaults : {}
  const stored = isRecord(input?.stored) ? input.stored : {}
  const incoming = isRecord(input?.incoming) ? input.incoming : {}

  return {
    ...defaults,
    ...stored,
    ...incoming,
  }
}`
}

function mergePreferencesPatchStageThree(name: string) {
  return `export function ${name}(input) {
  const isRecord = (value) => {
    return value !== null && typeof value === "object" && !Array.isArray(value)
  }

  const defaults = isRecord(input?.defaults) ? input.defaults : {}
  const stored = isRecord(input?.stored) ? input.stored : {}
  const incoming = isRecord(input?.incoming) ? input.incoming : {}
  const merged = {
    ...defaults,
    ...stored,
    ...incoming,
  }

  return {
    ...merged,
    theme:
      typeof merged.theme === "string" && merged.theme.trim()
        ? merged.theme.trim().toLowerCase()
        : "light",
    emailNotifications:
      typeof merged.emailNotifications === "boolean"
        ? merged.emailNotifications
        : true,
    marketingEmails:
      typeof merged.marketingEmails === "boolean"
        ? merged.marketingEmails
        : false,
    locale:
      typeof merged.locale === "string" && merged.locale.trim()
        ? merged.locale.trim().toLowerCase()
        : "en",
    shortcuts: Array.isArray(merged.shortcuts)
      ? Array.from(
          new Set(
            merged.shortcuts
              .filter((item) => typeof item === "string")
              .map((item) => item.trim())
              .filter(Boolean),
          ),
        )
      : [],
  }
}`
}

function mergePreferencesPatchStageFour(name: string) {
  return `export function ${name}(input) {
  const isRecord = (value) => {
    return value !== null && typeof value === "object" && !Array.isArray(value)
  }
  const blockedKeys = new Set(["__proto__", "constructor", "prototype"])

  const copySafe = (source) => {
    if (!isRecord(source)) {
      return {}
    }

    const output = {}
    for (const [key, value] of Object.entries(source)) {
      if (blockedKeys.has(key)) {
        continue
      }
      output[key] = value
    }
    return output
  }

  const merged = {
    ...copySafe(input?.defaults),
    ...copySafe(input?.stored),
    ...copySafe(input?.incoming),
  }

  return {
    ...merged,
    theme:
      typeof merged.theme === "string" && merged.theme.trim()
        ? merged.theme.trim().toLowerCase()
        : "light",
    emailNotifications:
      typeof merged.emailNotifications === "boolean"
        ? merged.emailNotifications
        : true,
    marketingEmails:
      typeof merged.marketingEmails === "boolean"
        ? merged.marketingEmails
        : false,
    locale:
      typeof merged.locale === "string" && merged.locale.trim()
        ? merged.locale.trim().toLowerCase()
        : "en",
    shortcuts: Array.isArray(merged.shortcuts)
      ? Array.from(
          new Set(
            merged.shortcuts
              .filter((item) => typeof item === "string")
              .map((item) => item.trim())
              .filter(Boolean),
          ),
        )
      : [],
  }
}`
}

function buildQueryInitialCode(name: string) {
  return `export function ${name}(input) {
  return Object.entries(input)
    .map(([key, value]) => key + "=" + value)
    .join("&")
}`
}

function buildQueryPatchStageTwo(name: string) {
  return `export function ${name}(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return ""
  }

  return Object.entries(input)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => key + "=" + value)
    .join("&")
}`
}

function buildQueryPatchStageThree(name: string) {
  return `export function ${name}(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return ""
  }

  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === "" || value === false) {
      continue
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null || item === "") {
          continue
        }
        params.append(key, String(item).trim())
      }
      continue
    }

    params.append(key, String(value).trim())
  }

  return params.toString()
}`
}

function buildQueryPatchStageFour(name: string) {
  return `export function ${name}(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return ""
  }

  const params = new URLSearchParams()
  const sortedKeys = Object.keys(input).sort((left, right) => left.localeCompare(right))

  for (const key of sortedKeys) {
    const value = input[key]
    if (value === undefined || value === null || value === "" || value === false) {
      continue
    }

    if (Array.isArray(value)) {
      const normalizedItems = value
        .filter((item) => item !== undefined && item !== null && item !== "")
        .map((item) => String(item).trim())
        .sort((left, right) => left.localeCompare(right))

      for (const item of normalizedItems) {
        params.append(key, item)
      }
      continue
    }

    params.append(key, String(value).trim())
  }

  return params.toString()
}`
}

function normalizeCheckoutInitialCode(name: string) {
  return `export function ${name}(input) {
  return {
    ...input,
    email: input.email.trim(),
    couponCode: input.couponCode.trim(),
  }
}`
}

function normalizeCheckoutPatchStageTwo(name: string) {
  return `export function ${name}(input) {
  const source =
    input && typeof input === "object" && !Array.isArray(input) ? input : {}

  return {
    email: typeof source.email === "string" ? source.email : "",
    items: Array.isArray(source.items) ? source.items : [],
    couponCode: typeof source.couponCode === "string" ? source.couponCode : "",
    notes: typeof source.notes === "string" ? source.notes : "",
  }
}`
}

function normalizeCheckoutPatchStageThree(name: string) {
  return `export function ${name}(input) {
  const source =
    input && typeof input === "object" && !Array.isArray(input) ? input : {}

  const items = Array.isArray(source.items)
    ? source.items
        .filter((item) => item && typeof item === "object" && !Array.isArray(item))
        .map((item) => ({
          sku: typeof item.sku === "string" ? item.sku.trim() : "",
          quantity:
            Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1,
        }))
        .filter((item) => item.sku)
    : []

  return {
    email:
      typeof source.email === "string" ? source.email.trim().toLowerCase() : "",
    items,
    couponCode:
      typeof source.couponCode === "string"
        ? source.couponCode.trim().toUpperCase()
        : "",
    notes: typeof source.notes === "string" ? source.notes.trim() : "",
  }
}`
}

function normalizeCheckoutPatchStageFour(name: string) {
  return `export function ${name}(input) {
  const source =
    input && typeof input === "object" && !Array.isArray(input) ? input : {}

  const items = Array.isArray(source.items)
    ? source.items
        .filter((item) => item && typeof item === "object" && !Array.isArray(item))
        .slice(0, 100)
        .map((item) => ({
          sku: typeof item.sku === "string" ? item.sku.trim() : "",
          quantity:
            Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1,
        }))
        .filter((item) => item.sku)
    : []

  const rawNotes = typeof source.notes === "string" ? source.notes.trim() : ""
  const notes = rawNotes
    .replace(/<script\\b[^>]*>(.*?)<\\/script>/gi, "")
    .slice(0, 2000)

  return {
    email:
      typeof source.email === "string" ? source.email.trim().toLowerCase() : "",
    items,
    couponCode:
      typeof source.couponCode === "string"
        ? source.couponCode.trim().toUpperCase()
        : "",
    notes,
  }
}`
}

function serializeTagsInitialCode(name: string) {
  return `export function ${name}(input) {
  return input.join(",")
}`
}

function serializeTagsPatchStageTwo(name: string) {
  return `export function ${name}(input) {
  if (!Array.isArray(input) || input.length === 0) {
    return ""
  }

  return input.join(",")
}`
}

function serializeTagsPatchStageThree(name: string) {
  return `export function ${name}(input) {
  if (!Array.isArray(input) || input.length === 0) {
    return ""
  }

  return Array.from(
    new Set(
      input
        .filter((item) => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).join(",")
}`
}

function serializeTagsPatchStageFour(name: string) {
  return `export function ${name}(input) {
  if (!Array.isArray(input) || input.length === 0) {
    return ""
  }

  return Array.from(
    new Set(
      input
        .filter((item) => typeof item === "string")
        .map((item) =>
          item
            .trim()
            .toLowerCase()
            .replace(/<script\\b[^>]*>(.*?)<\\/script>/gi, "")
            .replace(/[<>]/g, ""),
        )
        .filter(Boolean),
    ),
  )
    .slice(0, 20)
    .join(",")
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

function buildMergePreferencesCases(): AttackCaseTemplate[] {
  return [
    {
      title: 'Undefined merge envelope',
      category: 'null_undefined',
      inputEnvelope: { kind: 'undefined' },
      inputPreview: 'undefined',
      expectedOutcome:
        'Returns a normalized preference object instead of throwing on missing input.',
      whyThisCaseMatters:
        'Preference mergers should fail closed and still emit a usable shape.',
      severity: 'high',
      assertionType: 'subset',
      expectedValue: {
        theme: 'light',
        emailNotifications: true,
        marketingEmails: false,
        locale: 'en',
        shortcuts: [],
      },
    },
    {
      title: 'Empty preference bags',
      category: 'empty_input',
      inputEnvelope: { kind: 'json', value: {} },
      inputPreview: '{}',
      expectedOutcome: 'Returns the normalized fallback preference shape.',
      whyThisCaseMatters:
        'Connected GitHub utilities often see sparse or empty preference snapshots.',
      severity: 'medium',
      assertionType: 'subset',
      expectedValue: {
        theme: 'light',
        emailNotifications: true,
        marketingEmails: false,
        locale: 'en',
        shortcuts: [],
      },
    },
    {
      title: 'Malformed stored preference payload',
      category: 'malformed_payload',
      inputEnvelope: {
        kind: 'json',
        value: {
          defaults: {
            theme: 'light',
            emailNotifications: true,
            marketingEmails: false,
            locale: 'en',
            shortcuts: [],
          },
          stored: 'dark',
          incoming: {
            theme: 42,
            shortcuts: ['home', null, 'home'],
          },
        },
      },
      inputPreview:
        '{ defaults: { theme: "light", locale: "en" }, stored: "dark", incoming: { theme: 42, shortcuts: ["home", null, "home"] } }',
      expectedOutcome:
        'Falls back to safe preference values and deduplicates valid shortcuts.',
      whyThisCaseMatters:
        'Partial corruption in persisted settings should not poison the merged result.',
      severity: 'high',
      assertionType: 'subset',
      expectedValue: {
        theme: 'light',
        locale: 'en',
        shortcuts: ['home'],
      },
    },
    {
      title: 'Stored values are overridden by incoming edits',
      category: 'boundary_condition',
      inputEnvelope: {
        kind: 'json',
        value: {
          defaults: {
            theme: 'light',
            emailNotifications: true,
            marketingEmails: false,
            locale: 'en',
            shortcuts: [],
          },
          stored: {
            theme: 'dark',
            marketingEmails: true,
          },
          incoming: {
            locale: 'fr',
            emailNotifications: false,
          },
        },
      },
      inputPreview:
        '{ defaults: { theme: "light" }, stored: { theme: "dark" }, incoming: { locale: "fr", emailNotifications: false } }',
      expectedOutcome: 'Incoming edits win while earlier stored values remain intact.',
      whyThisCaseMatters:
        'This is the core correctness contract for a preference merge utility.',
      severity: 'medium',
      assertionType: 'subset',
      expectedValue: {
        theme: 'dark',
        marketingEmails: true,
        locale: 'fr',
        emailNotifications: false,
      },
    },
    {
      title: 'Null incoming preferences',
      category: 'type_mismatch',
      inputEnvelope: {
        kind: 'json',
        value: {
          defaults: {
            theme: 'light',
            emailNotifications: true,
            marketingEmails: false,
            locale: 'en',
            shortcuts: [],
          },
          incoming: null,
        },
      },
      inputPreview:
        '{ defaults: { theme: "light", emailNotifications: true }, incoming: null }',
      expectedOutcome: 'Ignores the invalid bag and keeps the fallback shape.',
      whyThisCaseMatters:
        'Null edge cases show up often when user profile forms partially serialize.',
      severity: 'high',
      assertionType: 'subset',
      expectedValue: {
        theme: 'light',
        emailNotifications: true,
      },
    },
    {
      title: 'Prototype-pollution style payload',
      category: 'injection_like',
      inputEnvelope: {
        kind: 'json',
        value: {
          defaults: {
            theme: 'light',
            emailNotifications: true,
            marketingEmails: false,
            locale: 'en',
            shortcuts: [],
          },
          incoming: {
            __proto__: {
              polluted: true,
            },
            theme: 'dark',
          },
        },
      },
      inputPreview:
        '{ defaults: { theme: "light" }, incoming: { "__proto__": { polluted: true }, theme: "dark" } }',
      expectedOutcome: 'Does not crash and preserves the legitimate theme override.',
      whyThisCaseMatters:
        'Merge helpers are a classic place for accidental prototype pollution bugs.',
      severity: 'high',
      assertionType: 'subset',
      expectedValue: {
        theme: 'dark',
      },
    },
    {
      title: 'Large shortcut payload remains responsive',
      category: 'performance_sensitive',
      inputEnvelope: {
        kind: 'json',
        value: {
          defaults: {
            theme: 'light',
            emailNotifications: true,
            marketingEmails: false,
            locale: 'en',
            shortcuts: [],
          },
          incoming: {
            shortcuts: Array.from({ length: 500 }, (_, index) => `shortcut-${index}`),
          },
        },
      },
      inputPreview:
        '{ defaults: { ... }, incoming: { shortcuts: Array.from({ length: 500 }) } }',
      expectedOutcome: 'Returns quickly while preserving the normalized shortcuts array.',
      whyThisCaseMatters:
        'Preference payloads can balloon when they accumulate feature flags or saved views.',
      severity: 'medium',
      assertionType: 'subset',
      expectedValue: {
        theme: 'light',
      },
      maxDurationMs: 35,
    },
    {
      title: 'Repeated-call stability',
      category: 'repeated_calls',
      inputEnvelope: {
        kind: 'json',
        value: {
          defaults: {
            theme: 'light',
            emailNotifications: true,
            marketingEmails: false,
            locale: 'en',
            shortcuts: [],
          },
          stored: {
            theme: 'dark',
          },
          incoming: {
            locale: 'fr',
          },
        },
      },
      inputPreview:
        '{ defaults: { theme: "light" }, stored: { theme: "dark" }, incoming: { locale: "fr" } }',
      expectedOutcome: 'Repeated calls stay deterministic on the same merge payload.',
      whyThisCaseMatters:
        'The trust loop should catch non-deterministic merges before they hit production state.',
      severity: 'low',
      assertionType: 'stable_repeat',
      expectedValue: {
        theme: 'dark',
        locale: 'fr',
        emailNotifications: true,
        marketingEmails: false,
        shortcuts: [],
      },
      maxDurationMs: 45,
      repeatCount: 40,
    },
  ]
}

function buildQueryCases(): AttackCaseTemplate[] {
  const largeParams = Object.fromEntries(
    Array.from({ length: 120 }, (_, index) => [`key${index}`, `${index}`]),
  )

  return [
    {
      title: 'Undefined query payload',
      category: 'null_undefined',
      inputEnvelope: { kind: 'undefined' },
      inputPreview: 'undefined',
      expectedOutcome: 'Returns an empty string instead of throwing.',
      whyThisCaseMatters:
        'Query builders are often called with optional filter bags that can be missing.',
      severity: 'high',
      assertionType: 'returns',
      expectedValue: '',
    },
    {
      title: 'Empty query object',
      category: 'empty_input',
      inputEnvelope: { kind: 'json', value: {} },
      inputPreview: '{}',
      expectedOutcome: 'Returns an empty string.',
      whyThisCaseMatters:
        'An empty filter state should not generate a noisy dangling query string.',
      severity: 'medium',
      assertionType: 'returns',
      expectedValue: '',
    },
    {
      title: 'Malformed string payload',
      category: 'malformed_payload',
      inputEnvelope: { kind: 'json', value: 'status=open' },
      inputPreview: '"status=open"',
      expectedOutcome: 'Returns an empty string instead of exploding.',
      whyThisCaseMatters:
        'Raw strings often cross network or router boundaries during migrations.',
      severity: 'high',
      assertionType: 'returns',
      expectedValue: '',
    },
    {
      title: 'Scalar filters are serialized',
      category: 'boundary_condition',
      inputEnvelope: {
        kind: 'json',
        value: {
          search: 'trustloop',
          page: 2,
          status: 'open',
        },
      },
      inputPreview: '{ search: "trustloop", page: 2, status: "open" }',
      expectedOutcome: 'Includes the expected scalar filters.',
      whyThisCaseMatters:
        'Correct scalar serialization is the baseline correctness contract.',
      severity: 'medium',
      assertionType: 'includes_all',
      expectedValue: ['search=trustloop', 'page=2', 'status=open'],
    },
    {
      title: 'Falsey and empty values are skipped',
      category: 'logical_edge',
      inputEnvelope: {
        kind: 'json',
        value: {
          search: 'trustloop',
          empty: '',
          includeArchived: false,
          page: null,
        },
      },
      inputPreview:
        '{ search: "trustloop", empty: "", includeArchived: false, page: null }',
      expectedOutcome: 'Omits empty, null, and falsey fields from the query string.',
      whyThisCaseMatters:
        'Search URLs become noisy and brittle when empty state leaks into them.',
      severity: 'medium',
      assertionType: 'not_includes',
      expectedValue: 'includeArchived=',
    },
    {
      title: 'Injection-like text is encoded',
      category: 'injection_like',
      inputEnvelope: {
        kind: 'json',
        value: {
          search: '<script>alert(1)</script>',
          redirect: 'https://example.com/?next=/admin',
        },
      },
      inputPreview:
        '{ search: "<script>alert(1)</script>", redirect: "https://example.com/?next=/admin" }',
      expectedOutcome: 'Output should not contain raw `<script>` markup.',
      whyThisCaseMatters:
        'Visible query encoding failures make demos feel untrustworthy immediately.',
      severity: 'high',
      assertionType: 'not_includes',
      expectedValue: '<script>',
    },
    {
      title: 'Large filter bag stays responsive',
      category: 'performance_sensitive',
      inputEnvelope: {
        kind: 'json',
        value: largeParams,
      },
      inputPreview: 'Object.fromEntries(Array.from({ length: 120 }))',
      expectedOutcome: 'Serializes the large filter bag quickly.',
      whyThisCaseMatters:
        'Large dashboards and admin screens can easily generate wide filter objects.',
      severity: 'medium',
      assertionType: 'includes_all',
      expectedValue: ['key0=0', 'key119=119'],
      maxDurationMs: 35,
    },
    {
      title: 'Repeated-call stability',
      category: 'repeated_calls',
      inputEnvelope: {
        kind: 'json',
        value: {
          status: 'open',
          tags: ['security', 'eval'],
        },
      },
      inputPreview: '{ status: "open", tags: ["security", "eval"] }',
      expectedOutcome: 'Repeated calls produce the same query string.',
      whyThisCaseMatters:
        'Query builders should be stable so cache keys and router transitions stay predictable.',
      severity: 'low',
      assertionType: 'stable_repeat',
      expectedValue: 'status=open&tags=eval&tags=security',
      maxDurationMs: 45,
      repeatCount: 50,
    },
  ]
}

function buildNormalizeCheckoutCases(): AttackCaseTemplate[] {
  return [
    {
      title: 'Undefined checkout payload',
      category: 'null_undefined',
      inputEnvelope: { kind: 'undefined' },
      inputPreview: 'undefined',
      expectedOutcome: 'Returns a normalized empty checkout shape.',
      whyThisCaseMatters:
        'Checkout pipelines should degrade safely even when upstream state is missing.',
      severity: 'high',
      assertionType: 'subset',
      expectedValue: {
        email: '',
        items: [],
        couponCode: '',
        notes: '',
      },
    },
    {
      title: 'Empty checkout object',
      category: 'empty_input',
      inputEnvelope: { kind: 'json', value: {} },
      inputPreview: '{}',
      expectedOutcome: 'Returns a normalized empty checkout shape.',
      whyThisCaseMatters:
        'An empty checkout snapshot should not cascade into runtime errors.',
      severity: 'medium',
      assertionType: 'subset',
      expectedValue: {
        email: '',
        items: [],
        couponCode: '',
        notes: '',
      },
    },
    {
      title: 'Malformed line-items payload',
      category: 'malformed_payload',
      inputEnvelope: {
        kind: 'json',
        value: {
          email: 'buyer@example.com',
          items: 'sku-1',
          couponCode: 'save10',
          notes: 'Ship fast',
        },
      },
      inputPreview:
        '{ email: "buyer@example.com", items: "sku-1", couponCode: "save10", notes: "Ship fast" }',
      expectedOutcome: 'Recovers to an empty item list without crashing.',
      whyThisCaseMatters:
        'Data shape bugs in cart storage are one of the most common checkout regressions.',
      severity: 'high',
      assertionType: 'subset',
      expectedValue: {
        email: 'buyer@example.com',
        items: [],
        couponCode: 'SAVE10',
      },
    },
    {
      title: 'Normalizes checkout email and coupon',
      category: 'boundary_condition',
      inputEnvelope: {
        kind: 'json',
        value: {
          email: '  BUYER@Example.com  ',
          items: [
            {
              sku: ' sku-1 ',
              quantity: 2,
            },
            {
              sku: 'sku-2',
              quantity: -4,
            },
          ],
          couponCode: '  save10 ',
          notes: 'Doorstep drop',
        },
      },
      inputPreview:
        '{ email: "  BUYER@Example.com  ", items: [{ sku: " sku-1 ", quantity: 2 }, { sku: "sku-2", quantity: -4 }], couponCode: "  save10 " }',
      expectedOutcome: 'Trims email, uppercases the coupon, and clamps bad quantities.',
      whyThisCaseMatters:
        'Checkout normalization is mostly about getting noisy human input into a safe form.',
      severity: 'medium',
      assertionType: 'subset',
      expectedValue: {
        email: 'buyer@example.com',
        couponCode: 'SAVE10',
        items: [
          {
            sku: 'sku-1',
            quantity: 2,
          },
          {
            sku: 'sku-2',
            quantity: 1,
          },
        ],
      },
    },
    {
      title: 'Null items are ignored safely',
      category: 'type_mismatch',
      inputEnvelope: {
        kind: 'json',
        value: {
          email: 42,
          items: [null, { sku: 'sku-1', quantity: 1 }],
          couponCode: ['save10'],
        },
      },
      inputPreview:
        '{ email: 42, items: [null, { sku: "sku-1", quantity: 1 }], couponCode: ["save10"] }',
      expectedOutcome: 'Filters to valid line items and drops invalid scalar types.',
      whyThisCaseMatters:
        'Mixed payload bugs in carts should not take the whole checkout flow down.',
      severity: 'high',
      assertionType: 'subset',
      expectedValue: {
        email: '',
        items: [
          {
            sku: 'sku-1',
            quantity: 1,
          },
        ],
        couponCode: '',
      },
    },
    {
      title: 'Script tags are removed from notes',
      category: 'injection_like',
      inputEnvelope: {
        kind: 'json',
        value: {
          email: 'buyer@example.com',
          items: [],
          couponCode: '',
          notes: '<script>alert(1)</script>Leave at desk',
        },
      },
      inputPreview:
        '{ email: "buyer@example.com", notes: "<script>alert(1)</script>Leave at desk" }',
      expectedOutcome: 'Notes do not contain the raw `<script>` tag.',
      whyThisCaseMatters:
        'Free-text checkout fields are a common source of attack probes and embarrassing logs.',
      severity: 'high',
      assertionType: 'subset',
      expectedValue: {
        notes: 'Leave at desk',
      },
    },
    {
      title: 'Large cart stays responsive',
      category: 'performance_sensitive',
      inputEnvelope: {
        kind: 'json',
        value: {
          email: 'buyer@example.com',
          items: Array.from({ length: 140 }, (_, index) => ({
            sku: `sku-${index}`,
            quantity: 1,
          })),
          couponCode: 'SAVE10',
          notes: 'Leave at desk',
        },
      },
      inputPreview:
        '{ email: "buyer@example.com", items: Array.from({ length: 140 }), couponCode: "SAVE10" }',
      expectedOutcome: 'Normalizes the cart quickly without throwing.',
      whyThisCaseMatters:
        'Large wholesale or B2B carts quickly expose expensive normalization logic.',
      severity: 'medium',
      assertionType: 'subset',
      expectedValue: {
        email: 'buyer@example.com',
      },
      maxDurationMs: 40,
    },
    {
      title: 'Repeated-call stability',
      category: 'repeated_calls',
      inputEnvelope: {
        kind: 'json',
        value: {
          email: 'buyer@example.com',
          items: [
            {
              sku: 'sku-1',
              quantity: 2,
            },
          ],
          couponCode: 'SAVE10',
          notes: 'Leave at desk',
        },
      },
      inputPreview:
        '{ email: "buyer@example.com", items: [{ sku: "sku-1", quantity: 2 }], couponCode: "SAVE10" }',
      expectedOutcome: 'Repeated checkout normalization remains deterministic.',
      whyThisCaseMatters:
        'If the normalizer is unstable, downstream totals, logs, and fraud checks become hard to trust.',
      severity: 'low',
      assertionType: 'stable_repeat',
      expectedValue: {
        email: 'buyer@example.com',
        items: [
          {
            sku: 'sku-1',
            quantity: 2,
          },
        ],
        couponCode: 'SAVE10',
        notes: 'Leave at desk',
      },
      maxDurationMs: 50,
      repeatCount: 35,
    },
  ]
}

function buildSerializeTagsCases(): AttackCaseTemplate[] {
  return [
    {
      title: 'Undefined tag list',
      category: 'null_undefined',
      inputEnvelope: { kind: 'undefined' },
      inputPreview: 'undefined',
      expectedOutcome: 'Returns an empty string.',
      whyThisCaseMatters:
        'Tag serialization helpers often sit behind optional fields or feature flags.',
      severity: 'high',
      assertionType: 'returns',
      expectedValue: '',
    },
    {
      title: 'Empty tag list',
      category: 'empty_input',
      inputEnvelope: { kind: 'json', value: [] },
      inputPreview: '[]',
      expectedOutcome: 'Returns an empty string.',
      whyThisCaseMatters:
        'Empty metadata should stay empty instead of producing dangling commas.',
      severity: 'medium',
      assertionType: 'returns',
      expectedValue: '',
    },
    {
      title: 'Malformed string payload',
      category: 'malformed_payload',
      inputEnvelope: { kind: 'json', value: 'ai,trust' },
      inputPreview: '"ai,trust"',
      expectedOutcome: 'Returns an empty string instead of throwing.',
      whyThisCaseMatters:
        'Metadata flows often switch between raw strings and arrays during migrations.',
      severity: 'high',
      assertionType: 'returns',
      expectedValue: '',
    },
    {
      title: 'Whitespace and casing are normalized',
      category: 'boundary_condition',
      inputEnvelope: {
        kind: 'json',
        value: ['  AI Trust  ', 'Red Team'],
      },
      inputPreview: '["  AI Trust  ", "Red Team"]',
      expectedOutcome: 'Returns "ai trust,red team".',
      whyThisCaseMatters:
        'A serializer should emit a stable normalized representation, not whatever the UI handed it.',
      severity: 'medium',
      assertionType: 'returns',
      expectedValue: 'ai trust,red team',
    },
    {
      title: 'Non-string values are ignored',
      category: 'type_mismatch',
      inputEnvelope: {
        kind: 'json',
        value: ['AI', 42, null, 'Eval'],
      },
      inputPreview: '["AI", 42, null, "Eval"]',
      expectedOutcome: 'Returns "ai,eval".',
      whyThisCaseMatters:
        'Unexpected mixed arrays are a very common failure mode in generated utility code.',
      severity: 'high',
      assertionType: 'returns',
      expectedValue: 'ai,eval',
    },
    {
      title: 'Raw script tags are removed',
      category: 'injection_like',
      inputEnvelope: {
        kind: 'json',
        value: ['<script>alert(1)</script>', 'safe'],
      },
      inputPreview: '["<script>alert(1)</script>", "safe"]',
      expectedOutcome: 'Output does not contain raw `<script>` markup.',
      whyThisCaseMatters:
        'Serialized metadata often gets copied into logs, analytics labels, and HTML attributes.',
      severity: 'high',
      assertionType: 'not_includes',
      expectedValue: '<script',
    },
    {
      title: 'Large tag list is bounded and quick',
      category: 'large_payload',
      inputEnvelope: {
        kind: 'json',
        value: Array.from({ length: 80 }, (_, index) => `tag-${index}`),
      },
      inputPreview: 'Array.from({ length: 80 }, (_, index) => `tag-${index}`)',
      expectedOutcome: 'Returns a bounded serialized string within the time budget.',
      whyThisCaseMatters:
        'Large metadata lists can silently explode storage and UI layouts.',
      severity: 'medium',
      assertionType: 'max_length',
      expectedValue: 220,
      maxDurationMs: 35,
    },
    {
      title: 'Repeated-call stability',
      category: 'repeated_calls',
      inputEnvelope: {
        kind: 'json',
        value: ['AI', 'Red Team', 'AI'],
      },
      inputPreview: '["AI", "Red Team", "AI"]',
      expectedOutcome: 'Repeated calls consistently return "ai,red team".',
      whyThisCaseMatters:
        'Metadata helpers should not produce drift across repeated renders or worker retries.',
      severity: 'low',
      assertionType: 'stable_repeat',
      expectedValue: 'ai,red team',
      maxDurationMs: 45,
      repeatCount: 45,
    },
  ]
}

function buildCasesForScenario(scenario: ScenarioKey) {
  switch (scenario) {
    case 'sum':
      return buildSumCases()
    case 'merge_preferences':
      return buildMergePreferencesCases()
    case 'build_query':
      return buildQueryCases()
    case 'normalize_checkout':
      return buildNormalizeCheckoutCases()
    case 'serialize_tags':
      return buildSerializeTagsCases()
    case 'sanitize':
      return buildSanitizeCases()
  }
}

export function buildInitialArtifacts(input: RunSeedInput): DraftArtifacts {
  const hintText = `${input.title}\n${input.sourceText}`
  const scenario = inferScenarioFromText(hintText)
  const fallbackName = defaultFunctionNameForScenario(scenario)
  const cases = buildCasesForScenario(scenario)

  if (input.sourceType === 'code' || input.sourceType === 'github') {
    const code = ensureExported(input.sourceText)
    return {
      scenario,
      code,
      changeSummary: 'User-supplied code is now under attack.',
      cases,
    }
  }

  const functionName = fallbackName
  let code: string

  switch (scenario) {
    case 'sum':
      code = sumInitialCode(functionName)
      break
    case 'merge_preferences':
      code = mergePreferencesInitialCode(functionName)
      break
    case 'build_query':
      code = buildQueryInitialCode(functionName)
      break
    case 'normalize_checkout':
      code = normalizeCheckoutInitialCode(functionName)
      break
    case 'serialize_tags':
      code = serializeTagsInitialCode(functionName)
      break
    case 'sanitize':
      code = sanitizeInitialCode(functionName)
      break
  }

  return {
    scenario,
    code,
    changeSummary:
      input.sourceType === 'demo'
        ? 'Seeded Maker draft created for the guaranteed fail-then-improve demo.'
        : 'Maker draft generated from the submitted prompt.',
    cases,
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
    extractExportedFunctionName(code) ?? defaultFunctionNameForScenario(scenario)

  const uniqueFailureLabels = Array.from(new Set(failures.map((failure) => failure.title)))
  const targetVersion = clamp(targetVersionNumber, 2, MAX_VERSION_NUMBER)
  const issueSummary =
    uniqueFailureLabels.length > 0
      ? uniqueFailureLabels.join(', ')
      : 'Red Team findings from the previous iteration'

  switch (scenario) {
    case 'sum':
      return {
        code:
          targetVersion === 2
            ? sumPatchStageTwo(functionName)
            : targetVersion === 3
              ? sumPatchStageThree(functionName)
              : sumPatchStageFour(functionName),
        changeSummary:
          targetVersion === 2
            ? 'Adds an array guard so reducers stop crashing on missing or malformed input.'
            : targetVersion === 3
              ? 'Filters out non-number items while keeping the reducer deterministic.'
              : 'Locks in the reducer contract and keeps noisy values from poisoning the total.',
        issueSummary,
        suggestion:
          targetVersion === 2
            ? 'Start by guarding the reducer so bad inputs return a safe default instead of exploding.'
            : targetVersion === 3
              ? 'Harden mixed-array handling next so unexpected items no longer corrupt the calculation.'
              : 'Finalize the arithmetic path so the reducer stays strict, deterministic, and easy to read.',
        cases: buildSumCases(),
      }
    case 'merge_preferences':
      return {
        code:
          targetVersion === 2
            ? mergePreferencesPatchStageTwo(functionName)
            : targetVersion === 3
              ? mergePreferencesPatchStageThree(functionName)
              : mergePreferencesPatchStageFour(functionName),
        changeSummary:
          targetVersion === 2
            ? 'Guards the preference bags so missing or malformed objects stop crashing the merge.'
            : targetVersion === 3
              ? 'Normalizes the merged preference shape and cleans up booleans, locale values, and shortcut arrays.'
              : 'Blocks dangerous prototype-style keys while preserving the normalized merged preference output.',
        issueSummary,
        suggestion:
          targetVersion === 2
            ? 'First harden the object merge path so invalid preference bags safely collapse to empty objects.'
            : targetVersion === 3
              ? 'Next normalize the merged output so corrupted scalar and array fields stop leaking into the final preferences.'
              : 'Finally harden the merge against prototype-style keys while preserving the normalized user preference shape.',
        cases: buildMergePreferencesCases(),
      }
    case 'build_query':
      return {
        code:
          targetVersion === 2
            ? buildQueryPatchStageTwo(functionName)
            : targetVersion === 3
              ? buildQueryPatchStageThree(functionName)
              : buildQueryPatchStageFour(functionName),
        changeSummary:
          targetVersion === 2
            ? 'Adds object guards and omits empty values so malformed query payloads stop crashing.'
            : targetVersion === 3
              ? 'Switches to URLSearchParams so query values are trimmed and encoded safely.'
              : 'Sorts keys and list values to make repeated query generation deterministic.',
        issueSummary,
        suggestion:
          targetVersion === 2
            ? 'Start by guarding non-object inputs and skipping empty values so the serializer stops emitting noisy query fragments.'
            : targetVersion === 3
              ? 'Then encode the query string properly so unsafe characters no longer leak through raw concatenation.'
              : 'Finish by sorting keys and list values so repeated calls produce stable, cache-friendly query strings.',
        cases: buildQueryCases(),
      }
    case 'normalize_checkout':
      return {
        code:
          targetVersion === 2
            ? normalizeCheckoutPatchStageTwo(functionName)
            : targetVersion === 3
              ? normalizeCheckoutPatchStageThree(functionName)
              : normalizeCheckoutPatchStageFour(functionName),
        changeSummary:
          targetVersion === 2
            ? 'Adds a safe fallback checkout shape so missing payloads no longer throw.'
            : targetVersion === 3
              ? 'Normalizes email, coupon, and line-item quantity data while filtering malformed entries.'
              : 'Cleans free-text notes and bounds large carts so checkout normalization stays safer under attack.',
        issueSummary,
        suggestion:
          targetVersion === 2
            ? 'First collapse invalid checkout payloads to a known-safe shape with empty items and strings.'
            : targetVersion === 3
              ? 'Then normalize the important business fields so email, coupon, and item quantities become deterministic.'
              : 'Finally sanitize free-text notes and bound oversized carts so the checkout normalizer holds up under adversarial payloads.',
        cases: buildNormalizeCheckoutCases(),
      }
    case 'serialize_tags':
      return {
        code:
          targetVersion === 2
            ? serializeTagsPatchStageTwo(functionName)
            : targetVersion === 3
              ? serializeTagsPatchStageThree(functionName)
              : serializeTagsPatchStageFour(functionName),
        changeSummary:
          targetVersion === 2
            ? 'Guards non-array inputs so malformed tag payloads stop throwing.'
            : targetVersion === 3
              ? 'Normalizes, trims, and deduplicates string tags before serialization.'
              : 'Removes raw script-like markup and caps oversized tag output before returning the final string.',
        issueSummary,
        suggestion:
          targetVersion === 2
            ? 'Start by making the serializer array-safe so string or null payloads return an empty result.'
            : targetVersion === 3
              ? 'Then normalize and deduplicate the tags so repeated or noisy values stop polluting the serialized output.'
              : 'Finish by stripping raw markup and bounding very large tag lists so the final serialized value stays safer to reuse.',
        cases: buildSerializeTagsCases(),
      }
    case 'sanitize':
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
        issueSummary,
        suggestion:
          targetVersion === 2
            ? 'First make the helper safe: reject non-string input and preserve the basic trim/lowercase behavior.'
            : targetVersion === 3
              ? 'Next bound the output size so large payloads stop creating noisy or unbounded results.'
              : 'Finally strip raw script tags so the helper closes the remaining security hole before returning text.',
        cases: buildSanitizeCases(),
      }
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
    if (/for\s*\([^)]*\)\s*\{[\s\S]*for\s*\(/.test(code)) {
      score = clamp(score - 8, 18, 100)
    }

    const qualitySignals = [
      /\bArray\.isArray\(/,
      /\bURLSearchParams\b/,
      /\bnew Set\b/,
      /\bObject\.entries\(/,
      /\bObject\.keys\(/,
      /\btypeof\s+input\b/,
      /\b__proto__\b|\bconstructor\b|\bprototype\b/,
      /slice\(0,\s*(?:5000|2000|100)\)/,
      /replace\(/,
      /\?\./,
    ].filter((pattern) => pattern.test(code)).length

    score = clamp(score + Math.min(qualitySignals * 2, 12), 18, 98)

    if (/\bany\b/.test(code)) {
      score = clamp(score - 4, 18, 98)
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
