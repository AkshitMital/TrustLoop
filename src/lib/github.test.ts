import { describe, expect, it } from 'vitest'
import {
  getUnsupportedGitHubFileReason,
  normalizeGitHubBranchRef,
  parseGitHubCommitUrl,
  parseGitHubFileUrl,
  parseGitHubPullRequestUrl,
} from '../../shared/github'

describe('GitHub source helpers', () => {
  it('parses a pull request URL', () => {
    expect(
      parseGitHubPullRequestUrl('https://github.com/openai/trustloop/pull/42'),
    ).toEqual({
      owner: 'openai',
      repo: 'trustloop',
      prNumber: 42,
    })
  })

  it('parses a blob file URL into owner, repo, and path segments', () => {
    expect(
      parseGitHubFileUrl(
        'https://github.com/openai/trustloop/blob/main/src/utils/sanitize.ts',
      ),
    ).toEqual({
      kind: 'blob',
      owner: 'openai',
      repo: 'trustloop',
      blobSegments: ['main', 'src', 'utils', 'sanitize.ts'],
    })
  })

  it('parses a raw file URL', () => {
    expect(
      parseGitHubFileUrl(
        'https://raw.githubusercontent.com/openai/trustloop/main/src/utils/sanitize.ts',
      ),
    ).toEqual({
      kind: 'raw',
      owner: 'openai',
      repo: 'trustloop',
      ref: 'main',
      filePath: 'src/utils/sanitize.ts',
    })
  })

  it('parses a commit URL', () => {
    expect(
      parseGitHubCommitUrl(
        'https://github.com/openai/trustloop/commit/abc1234567890def',
      ),
    ).toEqual({
      owner: 'openai',
      repo: 'trustloop',
      commitSha: 'abc1234567890def',
    })
  })

  it('flags unsupported files and accepts source files', () => {
    expect(getUnsupportedGitHubFileReason('src/utils/sanitize.ts')).toBeNull()
    expect(getUnsupportedGitHubFileReason('src/utils/sanitize.test.ts')).toContain(
      'Test files',
    )
    expect(getUnsupportedGitHubFileReason('README.md')).toContain(
      'JavaScript and TypeScript source files',
    )
  })

  it('normalizes branch refs for tracked webhook sync', () => {
    expect(normalizeGitHubBranchRef('refs/heads/main')).toBe('main')
    expect(normalizeGitHubBranchRef('feature/trustloop')).toBe('feature/trustloop')
  })
})
