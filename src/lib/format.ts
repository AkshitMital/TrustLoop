import type { PassFail, RunStatus, SourceType } from '../../shared/pipeline'
import type {
  GitHubChangeStatus,
  GitHubRunContext,
  GitHubSourceKind,
} from '../../shared/github'
import { basename } from '../../shared/github'

const timeFormatter = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function formatTimestamp(timestamp: number) {
  return timeFormatter.format(timestamp)
}

function toTitleCaseWords(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

export function humanizeStatus(status: RunStatus) {
  return toTitleCaseWords(status.replaceAll('_', ' '))
}

export function humanizePassFail(passFail: PassFail) {
  return passFail === 'pending' ? 'In Progress' : toTitleCaseWords(passFail)
}

export function humanizeSourceType(sourceType: SourceType) {
  if (sourceType === 'github') {
    return 'GitHub'
  }

  return toTitleCaseWords(sourceType)
}

export function humanizeGitHubSourceKind(sourceKind: GitHubSourceKind) {
  switch (sourceKind) {
    case 'pr_url':
      return 'PR URL'
    case 'file_url':
      return 'File URL'
    case 'branch_diff':
      return 'Branch Diff'
    case 'commit':
      return 'Commit SHA'
  }
}

export function humanizeGitHubChangeStatus(status: GitHubChangeStatus) {
  return toTitleCaseWords(status)
}

export function formatGitHubRepoLabel(context: Pick<GitHubRunContext, 'owner' | 'repo'>) {
  return `${context.owner}/${context.repo}`
}

export function formatGitHubRefLabel(context: GitHubRunContext) {
  if (context.prNumber != null) {
    return `PR #${context.prNumber}`
  }
  if (context.commitSha) {
    return `Commit ${context.commitSha.slice(0, 7)}`
  }
  if (context.baseRef && context.headRef) {
    return `${context.baseRef}...${context.headRef}`
  }
  if (context.headRef) {
    return context.headRef
  }

  return null
}

export function formatGitHubPathLabel(context: Pick<GitHubRunContext, 'filePath'>) {
  return basename(context.filePath)
}

export function formatGitHubFileStats(context: GitHubRunContext) {
  const parts: string[] = []

  if (context.changeStatus) {
    parts.push(humanizeGitHubChangeStatus(context.changeStatus))
  }
  if (context.additions != null || context.deletions != null) {
    parts.push(`+${context.additions ?? 0} / -${context.deletions ?? 0}`)
  }

  return parts.join(' · ')
}

export function formatDelta(current?: number | null, previous?: number | null) {
  if (current == null || previous == null) {
    return null
  }

  const delta = current - previous
  if (delta === 0) {
    return '0'
  }

  return `${delta > 0 ? '+' : ''}${delta}`
}

export function truncate(text: string, length = 140) {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text
}
