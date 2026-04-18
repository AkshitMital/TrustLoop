// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { Doc, Id } from './_generated/dataModel'
import { executeCodeInNode } from './execution'

function attackCaseId(value: string) {
  return value as Id<'attackCases'>
}

function runId(value: string) {
  return value as Id<'runs'>
}

function attackCase(
  overrides: Partial<Doc<'attackCases'>>,
): Doc<'attackCases'> {
  return {
    _creationTime: 0,
    _id: attackCaseId('attack-1'),
    runId: runId('run-1'),
    versionNumber: 1,
    title: 'Null input returns empty string',
    category: 'null_undefined',
    inputEnvelope: {
      kind: 'json',
      value: null,
    },
    inputPreview: 'null',
    expectedOutcome: 'Returns an empty string.',
    whyThisCaseMatters: 'Null input should not leak or crash.',
    severity: 'medium',
    assertionType: 'returns',
    expectedValue: '',
    maxDurationMs: 20,
    repeatCount: undefined,
    result: 'not_run',
    evidence: undefined,
    createdAt: 0,
    ...overrides,
  }
}

describe('backend evaluator', () => {
  it('executes TypeScript utility code without falling back to analysis-only', async () => {
    const execution = await executeCodeInNode({
      code: `export function sanitizeUserInput(input: any): string {
  if (input == null) {
    return ''
  }

  return String(input).trim().toLowerCase()
}`,
      attackCases: [
        attackCase({}),
        attackCase({
          _id: attackCaseId('attack-2'),
          title: 'Boundary trim and lowercase',
          category: 'boundary_condition',
          inputEnvelope: {
            kind: 'json',
            value: '  HeLLo  ',
          },
          inputPreview: '"  HeLLo  "',
          expectedOutcome: 'Returns "hello".',
          expectedValue: 'hello',
        }),
      ],
    })

    expect(execution.mode).toBe('executed')
    expect(execution.summary.failed).toBe(0)
    expect(execution.summary.errors).toBe(0)
  })
})
