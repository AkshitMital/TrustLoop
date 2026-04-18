export interface RecentGitHubRepo {
  owner: string
  repo: string
  branch: string
}

export interface StoredGitHubDraft {
  token: string
  owner: string
  repo: string
  branch: string
}

const GITHUB_DRAFT_KEY = 'trustloop.githubDraft'
const GITHUB_RECENT_REPOS_KEY = 'trustloop.githubRecentRepos'

const defaultDraft: StoredGitHubDraft = {
  token: '',
  owner: '',
  repo: '',
  branch: 'main',
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readJson<T>(key: string) {
  if (!canUseStorage()) {
    return null
  }

  const raw = window.localStorage.getItem(key)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.setItem(key, JSON.stringify(value))
}

export function loadGitHubDraft() {
  const stored = readJson<Partial<StoredGitHubDraft>>(GITHUB_DRAFT_KEY)

  return {
    ...defaultDraft,
    ...stored,
  }
}

export function saveGitHubDraft(draft: StoredGitHubDraft) {
  writeJson(GITHUB_DRAFT_KEY, draft)
}

export function loadRecentGitHubRepos() {
  const stored = readJson<RecentGitHubRepo[]>(GITHUB_RECENT_REPOS_KEY)
  if (!stored) {
    return [] as RecentGitHubRepo[]
  }

  return stored.filter(
    (repo) => repo.owner?.trim() && repo.repo?.trim() && repo.branch?.trim(),
  )
}

export function rememberRecentGitHubRepo(repo: RecentGitHubRepo) {
  const next = [
    repo,
    ...loadRecentGitHubRepos().filter(
      (entry) =>
        !(
          entry.owner === repo.owner &&
          entry.repo === repo.repo &&
          entry.branch === repo.branch
        ),
    ),
  ].slice(0, 4)

  writeJson(GITHUB_RECENT_REPOS_KEY, next)
}
