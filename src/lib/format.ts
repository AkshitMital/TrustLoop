import type { PassFail, RunStatus, SourceType } from '../../shared/pipeline'

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
  return toTitleCaseWords(sourceType)
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
