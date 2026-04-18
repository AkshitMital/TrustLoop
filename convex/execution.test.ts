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

  it('supports subset assertions for object-shaped utilities', async () => {
    const execution = await executeCodeInNode({
      code: `export function mergeUserPreferences(input: any) {
  const defaults = input?.defaults && typeof input.defaults === "object" ? input.defaults : {}
  const stored = input?.stored && typeof input.stored === "object" ? input.stored : {}
  const incoming = input?.incoming && typeof input.incoming === "object" ? input.incoming : {}

  return {
    ...defaults,
    ...stored,
    ...incoming,
    theme: typeof (incoming.theme ?? stored.theme ?? defaults.theme) === "string"
      ? String(incoming.theme ?? stored.theme ?? defaults.theme).trim().toLowerCase()
      : "light",
    emailNotifications:
      typeof (incoming.emailNotifications ?? stored.emailNotifications ?? defaults.emailNotifications) === "boolean"
        ? Boolean(incoming.emailNotifications ?? stored.emailNotifications ?? defaults.emailNotifications)
        : true,
    marketingEmails:
      typeof (incoming.marketingEmails ?? stored.marketingEmails ?? defaults.marketingEmails) === "boolean"
        ? Boolean(incoming.marketingEmails ?? stored.marketingEmails ?? defaults.marketingEmails)
        : false,
    locale: typeof (incoming.locale ?? stored.locale ?? defaults.locale) === "string"
      ? String(incoming.locale ?? stored.locale ?? defaults.locale).trim().toLowerCase()
      : "en",
    shortcuts: Array.isArray(incoming.shortcuts ?? stored.shortcuts ?? defaults.shortcuts)
      ? Array.from(new Set((incoming.shortcuts ?? stored.shortcuts ?? defaults.shortcuts).filter((item: unknown) => typeof item === "string")))
      : [],
  }
}`,
      attackCases: [
        attackCase({
          _id: attackCaseId('attack-subset'),
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
          inputPreview: '{ defaults: { theme: "light" }, stored: { theme: "dark" }, incoming: { locale: "fr" } }',
          expectedOutcome: 'Incoming edits win while earlier stored values remain intact.',
          assertionType: 'subset',
          expectedValue: {
            theme: 'dark',
            marketingEmails: true,
            locale: 'fr',
            emailNotifications: false,
          },
        }),
      ],
    })

    expect(execution.mode).toBe('executed')
    expect(execution.summary.failed).toBe(0)
  })

  it('supports includes-all assertions for query builders', async () => {
    const execution = await executeCodeInNode({
      code: `export function buildQueryString(input: any) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return ""
  }

  const params = new URLSearchParams()
  for (const key of Object.keys(input).sort()) {
    const value = input[key]
    if (value === undefined || value === null || value === "" || value === false) {
      continue
    }
    params.append(key, String(value).trim())
  }
  return params.toString()
}`,
      attackCases: [
        attackCase({
          _id: attackCaseId('attack-query'),
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
          assertionType: 'includes_all',
          expectedValue: ['search=trustloop', 'page=2', 'status=open'],
        }),
      ],
    })

    expect(execution.mode).toBe('executed')
    expect(execution.summary.failed).toBe(0)
  })
})
