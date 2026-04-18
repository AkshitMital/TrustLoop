// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import {
  resolvePushCandidatesWithClient,
  resolveTrackedRepoBaselineWithClient,
} from './github'

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    ...init,
  })
}

describe('tracked GitHub repo sync', () => {
  it('resolves a tracked branch into supported baseline candidates', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          html_url: 'https://github.com/openai/trustloop-demo',
          private: false,
          default_branch: 'main',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          name: 'main',
          commit: {
            sha: 'abc1234567890',
            commit: {
              tree: {
                sha: 'tree123',
              },
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          truncated: false,
          tree: [
            {
              path: 'src/utils/sanitize.ts',
              type: 'blob',
            },
            {
              path: 'README.md',
              type: 'blob',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          type: 'file',
          encoding: 'base64',
          html_url: 'https://github.com/openai/trustloop-demo/blob/main/src/utils/sanitize.ts',
          content: Buffer.from(
            'export function sanitize(input) { return String(input).trim() }',
            'utf8',
          ).toString('base64'),
        }),
      )

    const result = await resolveTrackedRepoBaselineWithClient(
      {
        token: 'ghp_secret',
        owner: 'openai',
        repo: 'trustloop-demo',
        branch: 'main',
      },
      fetchMock,
    )

    expect(result.branch).toBe('main')
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]?.filePath).toBe('src/utils/sanitize.ts')
    expect(result.skipped[0]?.path).toBe('README.md')
  })

  it('resolves changed files from a push webhook compare', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          html_url: 'https://github.com/openai/trustloop-demo',
          private: false,
          default_branch: 'main',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          html_url: 'https://github.com/openai/trustloop-demo/compare/old...new',
          files: [
            {
              filename: 'src/utils/sanitize.ts',
              status: 'modified',
              additions: 12,
              deletions: 2,
              blob_url: 'https://github.com/openai/trustloop-demo/blob/new/src/utils/sanitize.ts',
            },
            {
              filename: 'README.md',
              status: 'modified',
              additions: 3,
              deletions: 1,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          type: 'file',
          encoding: 'base64',
          html_url: 'https://github.com/openai/trustloop-demo/blob/new/src/utils/sanitize.ts',
          content: Buffer.from(
            'export function sanitize(input) { return String(input).trim().toLowerCase() }',
            'utf8',
          ).toString('base64'),
        }),
      )

    const result = await resolvePushCandidatesWithClient(
      {
        token: 'ghp_secret',
        owner: 'openai',
        repo: 'trustloop-demo',
        branch: 'main',
        before: 'oldcommit123',
        after: 'newcommit456',
        connectionId: 'connection123' as never,
      },
      fetchMock,
    )

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]?.sourceKind).toBe('push_sync')
    expect(result.candidates[0]?.changeStatus).toBe('modified')
    expect(result.skipped[0]?.path).toBe('README.md')
  })

  it('requires a PAT for tracked repo connections', async () => {
    await expect(
      resolveTrackedRepoBaselineWithClient(
        {
          token: '',
          owner: 'openai',
          repo: 'trustloop-demo',
          branch: 'main',
        },
        vi.fn<typeof fetch>(),
      ),
    ).rejects.toThrow('Add a GitHub PAT before connecting a tracked repo')
  })
})
