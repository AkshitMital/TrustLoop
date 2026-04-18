import { describe, expect, it } from 'vitest'
import { deriveProviderSummary } from '../../shared/provider'

describe('provider summary', () => {
  it('explains when Convex is missing the backend OpenAI key', () => {
    const provider = deriveProviderSummary('prompt', [
      {
        title: 'OpenAI disabled for this run',
        debugData: JSON.stringify({
          reason: 'missing_convex_openai_api_key',
        }),
      },
    ])

    expect(provider.mode).toBe('mock')
    expect(provider.detail).toContain('Convex OPENAI_API_KEY is not configured')
    expect(provider.detail).toContain('npx convex env set OPENAI_API_KEY')
  })

  it('labels code runs as hybrid when OpenAI handles red team stages', () => {
    const provider = deriveProviderSummary('code', [
      {
        title: 'Maker draft ready',
        debugData: JSON.stringify({
          makerMode: 'deterministic',
        }),
      },
      {
        title: 'Red Team generated 8 attack cases via gpt-5-mini',
        debugData: JSON.stringify({
          redTeamMode: 'openai',
          redTeamModel: 'gpt-5-mini',
        }),
      },
    ])

    expect(provider.mode).toBe('mixed')
    expect(provider.label).toBe('Hybrid')
    expect(provider.detail).toContain('kept your submitted version local')
  })
})
