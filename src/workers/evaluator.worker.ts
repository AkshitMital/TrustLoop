import {
  extractExportedFunctionName,
  summarizeResultValue,
  type AttackCaseTemplate,
  type ExecutionCaseResult,
  type ExecutionReport,
} from '../../shared/pipeline'

interface WorkerAttackCase extends AttackCaseTemplate {
  _id: string
}

interface WorkerPayload {
  code: string
  attackCases: WorkerAttackCase[]
}

function analysisOnlyReport(code: string, attackCases: WorkerAttackCase[], reason: string) {
  const results = attackCases.map<ExecutionCaseResult>((attackCase) => {
    const lower = code.toLowerCase()
    const looksGuarded =
      /typeof\s+input/.test(code) ||
      /array\.isarray/i.test(code) ||
      /input\s*==\s*null/.test(code)
    const handlesLargeInput = /slice\(0,\s*5000\)/.test(code)
    const stripsScripts = /replace\(/.test(code) && /script/i.test(lower)
    const stable = !/Math\.random|Date\.now/.test(code)

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
        passes = /trim\(\)|reduce\(|toLowerCase\(|Number\.isFinite/.test(code)
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
  } satisfies ExecutionReport
}

function decodeInput(attackCase: WorkerAttackCase) {
  if (attackCase.inputEnvelope.kind === 'undefined') {
    return undefined
  }

  return attackCase.inputEnvelope.value
}

function deepEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

async function invokeWithTimeout(
  fn: (input: unknown) => unknown,
  input: unknown,
  timeoutMs: number,
) {
  return await Promise.race([
    Promise.resolve(fn(input)),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs)
    }),
  ])
}

function evaluateSingleAssertion(
  attackCase: WorkerAttackCase,
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

async function executeCode(payload: WorkerPayload): Promise<ExecutionReport> {
  const entryPoint = extractExportedFunctionName(payload.code)

  if (!entryPoint) {
    return analysisOnlyReport(
      payload.code,
      payload.attackCases,
      'No exported function could be found in the submitted code.',
    )
  }

  let loadedModule: Record<string, unknown>
  const moduleUrl = URL.createObjectURL(
    new Blob([payload.code], { type: 'text/javascript' }),
  )

  try {
    loadedModule = (await import(/* @vite-ignore */ moduleUrl)) as Record<
      string,
      unknown
    >
  } catch {
    URL.revokeObjectURL(moduleUrl)
    return analysisOnlyReport(
      payload.code,
      payload.attackCases,
      'The worker could not execute this code directly, so the run fell back to static analysis.',
    )
  }

  URL.revokeObjectURL(moduleUrl)

  const fn =
    (loadedModule[entryPoint] as ((input: unknown) => unknown) | undefined) ??
    (Object.values(loadedModule).find((value) => typeof value === 'function') as
      | ((input: unknown) => unknown)
      | undefined)

  if (typeof fn !== 'function') {
    return analysisOnlyReport(
      payload.code,
      payload.attackCases,
      'No callable export was available for the evaluator.',
    )
  }

  const results: ExecutionCaseResult[] = []
  let durationTotal = 0

  for (const attackCase of payload.attackCases) {
    const input = decodeInput(attackCase)
    const startedAt = performance.now()

    try {
      if (attackCase.assertionType === 'stable_repeat') {
        const repeatCount = attackCase.repeatCount ?? 20
        let previous: unknown = undefined
        let stable = true

        for (let index = 0; index < repeatCount; index += 1) {
          const value = await invokeWithTimeout(
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

      const value = await invokeWithTimeout(fn, input, attackCase.maxDurationMs ?? 80)
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

  return {
    mode: 'executed',
    entryPoint,
    notes: [`Executed ${entryPoint} in the browser worker.`],
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

self.onmessage = async (event: MessageEvent<WorkerPayload>) => {
  const report = await executeCode(event.data)
  self.postMessage(report)
}
