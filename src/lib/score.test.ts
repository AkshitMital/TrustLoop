import { describe, expect, it } from 'vitest'
import {
  buildInitialArtifacts,
  buildPatchedArtifacts,
  scoreExecution,
  type ExecutionReport,
} from '../../shared/pipeline'

describe('shared trust pipeline helpers', () => {
  it('creates the seeded sanitize scenario for demo runs', () => {
    const artifacts = buildInitialArtifacts({
      sourceType: 'demo',
      title: 'Seeded sanitize input demo',
      sourceText: 'Build a sanitize helper.',
    })

    expect(artifacts.scenario).toBe('sanitize')
    expect(artifacts.code).toContain('sanitizeUserInput')
    expect(artifacts.cases.length).toBeGreaterThanOrEqual(6)
  })

  it('creates a safe patch for failing sanitize runs', () => {
    const patch = buildPatchedArtifacts('sanitize', 'export function sanitizeUserInput(input) { return input.trim() }', [
      {
        title: 'Undefined payload',
        severity: 'high',
        category: 'null_undefined',
        detail: 'The helper threw on undefined.',
      },
    ])

    expect(patch.code).toContain('typeof input !== "string"')
    expect(patch.changeSummary).toContain('null and type guards')
  })

  it('scores a clean executed report as passing', () => {
    const execution: ExecutionReport = {
      mode: 'executed',
      entryPoint: 'sanitizeUserInput',
      notes: [],
      attackResults: [
        {
          attackCaseId: 'case-1',
          title: 'Undefined payload',
          category: 'null_undefined',
          severity: 'high',
          result: 'pass',
          durationMs: 1.2,
        },
        {
          attackCaseId: 'case-2',
          title: 'Injection-like string',
          category: 'injection_like',
          severity: 'high',
          result: 'pass',
          durationMs: 1.1,
        },
        {
          attackCaseId: 'case-3',
          title: 'Large payload clamp',
          category: 'large_payload',
          severity: 'medium',
          result: 'pass',
          durationMs: 1.4,
        },
      ],
      summary: {
        total: 3,
        passed: 3,
        failed: 0,
        errors: 0,
        averageDurationMs: 1.23,
      },
    }

    const evaluation = scoreExecution(
      'export function sanitizeUserInput(input) { if (typeof input !== "string") return ""; return input.slice(0, 5000).replace(/<script/gi, "").trim().toLowerCase(); }',
      execution,
    )

    expect(evaluation.passFail).toBe('pass')
    expect(evaluation.overallScore).toBeGreaterThanOrEqual(80)
  })
})
