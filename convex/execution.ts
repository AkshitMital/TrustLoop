"use node";

import { createContext, Script, type Context } from 'node:vm'
import * as ts from 'typescript'
import type { Doc } from './_generated/dataModel.js'
import {
  extractExportedFunctionName,
  summarizeResultValue,
  type ExecutionCaseResult,
  type ExecutionReport,
} from '../shared/pipeline.js'

type StoredAttackCase = Doc<'attackCases'>

interface ExecutionPayload {
  code: string
  attackCases: StoredAttackCase[]
}

interface RuntimeSandbox {
  module: {
    exports: Record<string, unknown>
  }
  exports: Record<string, unknown>
  console: {
    log: () => void
    info: () => void
    warn: () => void
    error: () => void
  }
  __fn?: (input: unknown) => unknown
  __input?: unknown
  __result?: unknown
}

type SandboxedContext = Context & RuntimeSandbox

const MODULE_EVALUATION_TIMEOUT_MS = 100
const noop = () => {}

function analysisOnlyReport(
  code: string,
  attackCases: StoredAttackCase[],
  reason: string,
): ExecutionReport {
  const lower = code.toLowerCase()
  const looksGuarded =
    /typeof\s+input/.test(code) ||
    /array\.isarray/i.test(code) ||
    /input\s*==\s*null/.test(code) ||
    /input\s*===\s*null/.test(code)
  const looksObjectSafe =
    /typeof\s+input\s*===\s*["']object["']/.test(code) ||
    /Object\.entries\(/.test(code) ||
    /Object\.keys\(/.test(code) ||
    /Object\.assign\(/.test(code) ||
    /\.\.\./.test(code)
  const handlesLargeInput =
    /(?:slice|substring)\(\s*0\s*,\s*(?:\d+|[A-Za-z_$][\w$]*)\s*\)/.test(code) ||
    /\b(?:MAX_LEN|MAX_LENGTH|MAX_OUTPUT_LEN|EARLY_STRING_CAP)\b/.test(code) ||
    /\bslice\(0,\s*(?:100|120|5000|2000)\)/.test(code)
  const stripsScripts =
    (/replace\(/.test(code) && /script/i.test(lower)) || /<[^>]*>/.test(code)
  const stable = !/Math\.random|Date\.now/.test(code)
  const normalizesStrings =
    /trim\(\)|reduce\(|toLowerCase\(|Number\.isFinite|URLSearchParams|new Set/.test(code)
  const encodesQuery = /URLSearchParams|encodeURIComponent/.test(code)
  const protectsPrototype = /__proto__|constructor|prototype/.test(code)
  const sanitizesCollections = /filter\(|map\(|new Set|Array\.from/.test(code)

  const results = attackCases.map<ExecutionCaseResult>((attackCase) => {
    let passes = false

    switch (attackCase.category) {
      case 'null_undefined':
      case 'malformed_payload':
      case 'type_mismatch':
        passes = looksGuarded || looksObjectSafe
        break
      case 'large_payload':
        passes = handlesLargeInput || sanitizesCollections
        break
      case 'injection_like':
        passes = stripsScripts || encodesQuery || protectsPrototype
        break
      case 'repeated_calls':
        passes = stable
        break
      case 'boundary_condition':
      case 'logical_edge':
      case 'empty_input':
        passes = normalizesStrings || encodesQuery || sanitizesCollections
        break
      case 'performance_sensitive':
        passes = !/for\s*\(.*for\s*\(/s.test(code) || handlesLargeInput
        break
    }

    return {
      attackCaseId: attackCase._id,
      title: attackCase.title,
      category: attackCase.category,
      severity: attackCase.severity,
      result: passes ? 'pass' : 'fail',
      durationMs: 0,
      outputSummary: passes
        ? 'Static heuristics indicate this case is likely handled.'
        : `Analysis-only fallback: ${reason}`,
    }
  })

  const passed = results.filter((result) => result.result === 'pass').length
  const failed = results.length - passed

  return {
    mode: 'analysis_only',
    notes: [reason],
    attackResults: results,
    summary: {
      total: results.length,
      passed,
      failed,
      errors: 0,
      averageDurationMs: 0,
    },
  }
}

function decodeInput(attackCase: StoredAttackCase) {
  if (attackCase.inputEnvelope.kind === 'undefined') {
    return undefined
  }

  return attackCase.inputEnvelope.value
}

function deepEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function matchesSubset(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length < expected.length) {
      return false
    }

    return expected.every((item, index) => matchesSubset(actual[index], item))
  }

  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) {
      return false
    }

    return Object.entries(expected).every(([key, value]) =>
      matchesSubset((actual as Record<string, unknown>)[key], value),
    )
  }

  return deepEqual(actual, expected)
}

function includesAll(value: unknown, expected: unknown) {
  const expectedItems = Array.isArray(expected) ? expected : [expected]

  if (typeof value === 'string') {
    return expectedItems.every((item) => value.includes(String(item)))
  }

  if (Array.isArray(value)) {
    return expectedItems.every((item) =>
      value.some((candidate) => deepEqual(candidate, item) || String(candidate) === String(item)),
    )
  }

  return false
}

function withinTimeBudget(durationMs: number, budget: number | undefined) {
  return durationMs <= (budget ?? Number.POSITIVE_INFINITY)
}

function transpileExecutionCode(code: string) {
  return ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: false,
      isolatedModules: true,
    },
    reportDiagnostics: false,
  }).outputText
}

function buildRuntimeContext(transpiledCode: string) {
  const module = { exports: {} as Record<string, unknown> }
  const sandbox: RuntimeSandbox = {
    module,
    exports: module.exports,
    console: {
      log: noop,
      info: noop,
      warn: noop,
      error: noop,
    },
  }

  const context = createContext(sandbox) as SandboxedContext
  const script = new Script(transpiledCode, {
    filename: 'trust-loop-runtime.js',
  })

  script.runInContext(context, {
    timeout: MODULE_EVALUATION_TIMEOUT_MS,
  })

  return {
    context,
    loadedModule: context.module.exports,
  }
}

async function invokeWithTimeout(
  context: SandboxedContext,
  fn: (input: unknown) => unknown,
  input: unknown,
  timeoutMs: number,
) {
  context.__fn = fn
  context.__input = input
  context.__result = undefined

  try {
    const script = new Script('__result = __fn(__input)', {
      filename: 'trust-loop-call.js',
    })
    script.runInContext(context, {
      timeout: timeoutMs,
    })

    const value = context.__result
    if (value && typeof (value as PromiseLike<unknown>).then === 'function') {
      return await Promise.race([
        value as PromiseLike<unknown>,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs)
        }),
      ])
    }

    return value
  } finally {
    delete context.__fn
    delete context.__input
    delete context.__result
  }
}

function evaluateSingleAssertion(
  attackCase: StoredAttackCase,
  value: unknown,
  durationMs: number,
) {
  let passes = false

  switch (attackCase.assertionType) {
    case 'returns':
      passes = deepEqual(value, attackCase.expectedValue)
      break
    case 'not_includes':
      passes = typeof value === 'string' && !value.includes(String(attackCase.expectedValue))
      break
    case 'no_throw':
      passes = true
      break
    case 'max_length':
      passes =
        typeof value === 'string' &&
        value.length <= Number(attackCase.expectedValue ?? 0)
      break
    case 'stable_repeat':
      passes = true
      break
    case 'subset':
      passes = matchesSubset(value, attackCase.expectedValue)
      break
    case 'includes_all':
      passes = includesAll(value, attackCase.expectedValue)
      break
  }

  return passes && withinTimeBudget(durationMs, attackCase.maxDurationMs)
}

export async function executeCodeInNode({
  code,
  attackCases,
}: ExecutionPayload): Promise<ExecutionReport> {
  let context: SandboxedContext
  let loadedModule: Record<string, unknown>

  try {
    const runtime = buildRuntimeContext(transpileExecutionCode(code))
    context = runtime.context
    loadedModule = runtime.loadedModule
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'The backend evaluator could not execute this code directly.'

    return analysisOnlyReport(code, attackCases, message)
  }

  const entryPoint = extractExportedFunctionName(code)
  const resolvedEntry = entryPoint && typeof loadedModule[entryPoint] === 'function'
    ? entryPoint
    : null
  const fn =
    (resolvedEntry
      ? (loadedModule[resolvedEntry] as ((input: unknown) => unknown) | undefined)
      : undefined) ??
    (Object.entries(loadedModule).find(([, value]) => typeof value === 'function')?.[1] as
      | ((input: unknown) => unknown)
      | undefined)

  if (typeof fn !== 'function') {
    return analysisOnlyReport(
      code,
      attackCases,
      'No callable export was available for the evaluator.',
    )
  }

  const results: ExecutionCaseResult[] = []
  let durationTotal = 0

  for (const attackCase of attackCases) {
    const input = decodeInput(attackCase)
    const startedAt = performance.now()

    try {
      if (attackCase.assertionType === 'stable_repeat') {
        const repeatCount = attackCase.repeatCount ?? 20
        let previous: unknown = undefined
        let stable = true

        for (let index = 0; index < repeatCount; index += 1) {
          const value = await invokeWithTimeout(
            context,
            fn,
            input,
            attackCase.maxDurationMs ?? 80,
          )

          if (index === 0) {
            previous = value
          } else if (!deepEqual(previous, value)) {
            stable = false
          }
        }

        const durationMs = performance.now() - startedAt
        durationTotal += durationMs
        const expected = attackCase.expectedValue
        const passes =
          stable &&
          deepEqual(previous, expected) &&
          durationMs <= (attackCase.maxDurationMs ?? Number.POSITIVE_INFINITY)

        results.push({
          attackCaseId: attackCase._id,
          title: attackCase.title,
          category: attackCase.category,
          severity: attackCase.severity,
          result: passes ? 'pass' : 'fail',
          durationMs,
          outputSummary: passes
            ? `Stable over ${repeatCount} calls.`
            : `Result changed or exceeded the time budget over ${repeatCount} calls.`,
        })

        continue
      }

      const value = await invokeWithTimeout(context, fn, input, attackCase.maxDurationMs ?? 80)
      const durationMs = performance.now() - startedAt
      durationTotal += durationMs
      const passes = evaluateSingleAssertion(attackCase, value, durationMs)

      results.push({
        attackCaseId: attackCase._id,
        title: attackCase.title,
        category: attackCase.category,
        severity: attackCase.severity,
        result: passes ? 'pass' : 'fail',
        durationMs,
        outputSummary: passes
          ? `Returned ${summarizeResultValue(value)}`
          : `Observed ${summarizeResultValue(value)} instead of the expected behavior.`,
      })
    } catch (error) {
      const durationMs = performance.now() - startedAt
      durationTotal += durationMs
      const message =
        error instanceof Error ? error.message : 'Unknown execution error'

      results.push({
        attackCaseId: attackCase._id,
        title: attackCase.title,
        category: attackCase.category,
        severity: attackCase.severity,
        result: 'error',
        durationMs,
        errorMessage: message,
      })
    }
  }

  const passed = results.filter((result) => result.result === 'pass').length
  const failed = results.filter((result) => result.result === 'fail').length
  const errors = results.filter((result) => result.result === 'error').length
  const entryLabel =
    resolvedEntry ??
    Object.entries(loadedModule).find(([, value]) => value === fn)?.[0] ??
    undefined

  return {
    mode: 'executed',
    entryPoint: entryLabel,
    notes: [`Executed ${entryLabel ?? 'callable export'} in the backend evaluator.`],
    attackResults: results,
    summary: {
      total: results.length,
      passed,
      failed,
      errors,
      averageDurationMs: results.length === 0 ? 0 : durationTotal / results.length,
    },
  }
}
