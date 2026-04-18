import type { SourceType } from './pipeline'

export type ProviderMode = 'pending' | 'mock' | 'openai' | 'mixed'

export interface ProviderSummary {
  mode: ProviderMode
  label: string
  detail: string
  models: string[]
}

export interface ProviderEventLike {
  title: string
  debugData?: string
}

function normalizeReason(reason: unknown) {
  if (typeof reason !== 'string') {
    return null
  }

  const trimmed = reason.trim()
  return trimmed ? trimmed : null
}

function isMissingConvexOpenAIKey(reason: string | null) {
  if (!reason) {
    return false
  }

  return (
    reason === 'missing_convex_openai_api_key' ||
    /OPENAI_API_KEY is not configured/i.test(reason)
  )
}

function parseDebugData(debugData?: string): Record<string, unknown> | null {
  if (!debugData) {
    return null
  }

  try {
    const parsed = JSON.parse(debugData) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return null
  }

  return null
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

export function deriveProviderSummary(
  sourceType: SourceType,
  events: ProviderEventLike[],
): ProviderSummary {
  let sawOpenAI = false
  let sawDeterministic = sourceType === 'demo'
  const models: string[] = []
  const reasons: string[] = []
  let sawFallback = false

  for (const event of events) {
    const debugData = parseDebugData(event.debugData)
    const reason = normalizeReason(debugData?.reason)

    if (reason) {
      reasons.push(reason)
      if (isMissingConvexOpenAIKey(reason)) {
        sawDeterministic = true
      }
    }

    for (const key of ['makerMode', 'redTeamMode', 'repairMode'] as const) {
      const value = debugData?.[key]
      if (value === 'openai') {
        sawOpenAI = true
      }
      if (value === 'deterministic') {
        sawDeterministic = true
      }
    }

    for (const key of ['makerModel', 'redTeamModel', 'repairModel'] as const) {
      const value = debugData?.[key]
      if (typeof value === 'string' && value.trim()) {
        sawOpenAI = true
        models.push(value.trim())
      }
    }

    if (/fallback/i.test(event.title)) {
      sawDeterministic = true
      sawFallback = true
    }

    const modelMatch = event.title.match(/\bvia\s+([A-Za-z0-9._:-]+)/i)
    if (modelMatch?.[1]) {
      sawOpenAI = true
      models.push(modelMatch[1])
    }
  }

  const uniqueModels = uniqueStrings(models)
  const uniqueReasons = uniqueStrings(reasons)
  const missingBackendKey = uniqueReasons.some((reason) =>
    isMissingConvexOpenAIKey(reason),
  )
  const codeRunHybrid = sourceType === 'code' && sawOpenAI && sawDeterministic && !sawFallback

  if (sawOpenAI && sawDeterministic) {
    return {
      mode: 'mixed',
      label: codeRunHybrid ? 'Hybrid' : 'Mixed',
      detail:
        codeRunHybrid
          ? uniqueModels.length > 0
            ? `This code run kept your submitted version local while OpenAI handled Red Team and repair stages. OpenAI models seen: ${uniqueModels.join(', ')}.`
            : 'This code run kept your submitted version local while OpenAI handled Red Team and repair stages.'
          : uniqueModels.length > 0
            ? `This run mixed OpenAI-backed stages with deterministic fallback. OpenAI models seen: ${uniqueModels.join(', ')}.`
            : 'This run mixed OpenAI-backed stages with deterministic fallback.',
      models: uniqueModels,
    }
  }

  if (sawOpenAI) {
    return {
      mode: 'openai',
      label: uniqueModels.length > 0 ? `OpenAI · ${uniqueModels[0]}` : 'OpenAI',
      detail:
        uniqueModels.length > 0
          ? `OpenAI-backed Maker and Red Team stages ran for this run. Models seen: ${uniqueModels.join(', ')}.`
          : 'OpenAI-backed Maker and Red Team stages ran for this run.',
      models: uniqueModels,
    }
  }

  if (sawDeterministic) {
    return {
      mode: 'mock',
      label: sourceType === 'demo' ? 'Mock demo' : 'Mock',
      detail:
        sourceType === 'demo'
          ? 'The seeded demo uses deterministic local orchestration, so it never bills OpenAI.'
          : missingBackendKey
            ? 'This run used deterministic local orchestration because Convex OPENAI_API_KEY is not configured. Set it with `npx convex env set OPENAI_API_KEY ...`, then restart `npx convex dev`.'
            : 'This run used deterministic local orchestration, so it did not bill OpenAI.',
      models: [],
    }
  }

  return {
    mode: 'pending',
    label: 'Pending',
    detail: 'The provider will be known after Maker starts this run.',
    models: [],
  }
}
