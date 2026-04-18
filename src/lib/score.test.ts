import { describe, expect, it } from 'vitest'
import type { Id } from '../../convex/_generated/dataModel'
import {
  buildInitialArtifacts,
  buildPatchedArtifacts,
  pickBestEvaluation,
  scoreExecution,
  type ExecutionReport,
} from '../../shared/pipeline'

function attackCaseId(value: string) {
  return value as Id<'attackCases'>
}

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
    const patch = buildPatchedArtifacts(
      'sanitize',
      'export function sanitizeUserInput(input) { return input.trim() }',
      [
        {
          title: 'Undefined payload',
          severity: 'high',
          category: 'null_undefined',
          detail: 'The helper threw on undefined.',
        },
      ],
      2,
    )

    expect(patch.code).toContain('typeof input !== "string"')
    expect(patch.changeSummary).toContain('null and type guards')
  })

  it('stages sanitize hardening across multiple repair versions', () => {
    const stageTwo = buildPatchedArtifacts(
      'sanitize',
      'export function sanitizeUserInput(input) { return input }',
      [],
      2,
    )
    const stageThree = buildPatchedArtifacts(
      'sanitize',
      stageTwo.code,
      [],
      3,
    )
    const stageFour = buildPatchedArtifacts(
      'sanitize',
      stageThree.code,
      [],
      4,
    )

    expect(stageTwo.code).not.toContain('slice(0, 5000)')
    expect(stageThree.code).toContain('slice(0, 5000)')
    expect(stageThree.code).not.toContain('replace(/<script')
    expect(stageFour.code).toContain('replace(/<script')
  })

  it('scores a clean executed report as passing', () => {
    const execution: ExecutionReport = {
      mode: 'executed',
      entryPoint: 'sanitizeUserInput',
      notes: [],
      attackResults: [
        {
          attackCaseId: attackCaseId('case-1'),
          title: 'Undefined payload',
          category: 'null_undefined',
          severity: 'high',
          result: 'pass',
          durationMs: 1.2,
        },
        {
          attackCaseId: attackCaseId('case-2'),
          title: 'Injection-like string',
          category: 'injection_like',
          severity: 'high',
          result: 'pass',
          durationMs: 1.1,
        },
        {
          attackCaseId: attackCaseId('case-3'),
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

  it('picks the best evaluation instead of the latest one', () => {
    const best = pickBestEvaluation([
      {
        versionNumber: 3,
        mode: 'analysis_only' as const,
        overallScore: 74,
        detectedFailures: [
          {
            title: 'Large payload clamp',
            severity: 'medium' as const,
            category: 'large_payload' as const,
            detail: 'Fallback missed the clamp.',
          },
        ],
      },
      {
        versionNumber: 2,
        mode: 'executed' as const,
        overallScore: 88,
        detectedFailures: [],
      },
    ])

    expect(best?.versionNumber).toBe(2)
  })
})
