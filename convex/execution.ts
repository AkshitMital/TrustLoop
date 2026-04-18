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
  const handlesLargeInput =
    /(?:slice|substring)\(\s*0\s*,\s*(?:\d+|[A-Za-z_$][\w$]*)\s*\)/.test(code) ||
    /\b(?:MAX_LEN|MAX_LENGTH|MAX_OUTPUT_LEN|EARLY_STRING_CAP)\b/.test(code)
  const stripsScripts =
    (/replace\(/.test(code) && /script/i.test(lower)) || /<[^>]*>/.test(code)
  const stable = !/Math\.random|Date\.now/.test(code)
  const normalizesStrings = /trim\(\)|reduce\(|toLowerCase\(|Number\.isFinite/.test(code)

  const results = attackCases.map<ExecutionCaseResult>((attackCase) => {
    let passes = false

    switch (attackCase.category) {
      case 'null_undefined':
      case 'malformed_payload':
      case 'type_mismatch':
        passes = looksGuarded
        break
      case 'large_payload':
        passes = handlesLargeInput
        break
      case 'injection_like':
        passes = stripsScripts
        break
      case 'repeated_calls':
        passes = stable
        break
      case 'boundary_condition':
      case 'logical_edge':
      case 'empty_input':
        passes = normalizesStrings
        break
      case 'performance_sensitive':
        passes = !/for\s*\(.*for\s*\(/s.test(code)
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
  switch (attackCase.assertionType) {
    case 'returns':
      return deepEqual(value, attackCase.expectedValue)
    case 'not_includes':
      return typeof value === 'string' && !value.includes(String(attackCase.expectedValue))
    case 'no_throw':
      return true
    case 'max_length':
      return (
        typeof value === 'string' &&
        value.length <= Number(attackCase.expectedValue ?? 0) &&
        durationMs <= (attackCase.maxDurationMs ?? Number.POSITIVE_INFINITY)
      )
    case 'stable_repeat':
      return true
  }
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
