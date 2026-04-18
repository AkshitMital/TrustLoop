// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { previewGitHubSourceWithClient } from './github'

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    ...init,
  })
}

describe('GitHub preview resolver', () => {
  it('resolves a public pull request into supported source candidates', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          html_url: 'https://github.com/openai/trustloop',
          private: false,
          default_branch: 'main',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          number: 42,
          html_url: 'https://github.com/openai/trustloop/pull/42',
          head: {
            ref: 'feature/trust',
            sha: 'abc1234567890',
          },
          base: {
            ref: 'main',
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            filename: 'src/utils/sanitize.ts',
            status: 'modified',
            additions: 12,
            deletions: 2,
            blob_url: 'https://github.com/openai/trustloop/blob/abc1234567890/src/utils/sanitize.ts',
          },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          type: 'file',
          encoding: 'base64',
          html_url: 'https://github.com/openai/trustloop/blob/abc1234567890/src/utils/sanitize.ts',
          content: Buffer.from(
            'export function sanitizeUserInput(input) { return String(input).trim() }',
            'utf8',
          ).toString('base64'),
        }),
      )

    const preview = await previewGitHubSourceWithClient(
      {
        sourceKind: 'pr_url',
        prUrl: 'https://github.com/openai/trustloop/pull/42',
      },
      fetchMock,
    )

    expect(preview.repo.owner).toBe('openai')
    expect(preview.repo.repo).toBe('trustloop')
    expect(preview.candidates).toHaveLength(1)
    expect(preview.candidates[0]?.filePath).toBe('src/utils/sanitize.ts')
    expect(preview.candidates[0]?.prNumber).toBe(42)
    expect(preview.skipped).toHaveLength(0)
  })

  it('uses the PAT for private repo file fetches', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          html_url: 'https://github.com/openai/private-trustloop',
          private: true,
          default_branch: 'main',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          type: 'file',
          encoding: 'base64',
          html_url: 'https://github.com/openai/private-trustloop/blob/main/src/index.ts',
          content: Buffer.from(
            'export function hardenPayload(input) { return input }',
            'utf8',
          ).toString('base64'),
        }),
      )

    const preview = await previewGitHubSourceWithClient(
      {
        sourceKind: 'file_url',
        token: 'ghp_secret_token',
        fileUrl:
          'https://raw.githubusercontent.com/openai/private-trustloop/main/src/index.ts',
      },
      fetchMock,
    )

    const authHeader = (fetchMock.mock.calls[0]?.[1]?.headers as Headers).get('Authorization')

    expect(authHeader).toBe('Bearer ghp_secret_token')
    expect(preview.repo.visibility).toBe('private')
    expect(preview.candidates[0]?.owner).toBe('openai')
  })

  it('returns skipped files when a branch diff only changes unsupported files', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          html_url: 'https://github.com/openai/trustloop',
          private: false,
          default_branch: 'main',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          html_url: 'https://github.com/openai/trustloop/compare/main...docs',
          files: [
            {
              filename: 'README.md',
              status: 'modified',
              additions: 4,
              deletions: 1,
              blob_url: 'https://github.com/openai/trustloop/blob/docs/README.md',
            },
          ],
        }),
      )

    const preview = await previewGitHubSourceWithClient(
      {
        sourceKind: 'branch_diff',
        owner: 'openai',
        repo: 'trustloop',
        baseRef: 'main',
        headRef: 'docs',
      },
      fetchMock,
    )

    expect(preview.candidates).toHaveLength(0)
    expect(preview.skipped[0]?.path).toBe('README.md')
  })

  it('surfaces invalid repo or access errors', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            message: 'Not Found',
          },
          { status: 404 },
        ),
      )

    await expect(
      previewGitHubSourceWithClient(
        {
          sourceKind: 'branch_diff',
          owner: 'missing',
          repo: 'repo',
          baseRef: 'main',
          headRef: 'feature',
        },
        fetchMock,
      ),
    ).rejects.toThrow('GitHub could not find that repo or artifact with the current access.')
  })
})
