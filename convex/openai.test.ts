// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { parseJsonLiteral } from './openai'

describe('OpenAI payload normalization', () => {
  it('expands Array.fill shorthand for large performance cases', () => {
    const value = parseJsonLiteral('Array(6).fill(1)', 'large array input')

    expect(value).toEqual([1, 1, 1, 1, 1, 1])
  })

  it('accepts arrays containing NaN and Infinity shorthand values', () => {
    const value = parseJsonLiteral('[1, NaN, Infinity, -Infinity, 4]', 'logical edge input')

    expect(value).toEqual([1, null, null, null, 4])
  })

  it('accepts simple comma-separated numeric input', () => {
    const value = parseJsonLiteral('1, 2, 3', 'numeric shorthand')

    expect(value).toEqual([1, 2, 3])
  })
})
