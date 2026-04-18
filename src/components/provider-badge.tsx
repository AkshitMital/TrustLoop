import type { ProviderSummary } from '../../shared/provider'

interface ProviderBadgeProps {
  provider: ProviderSummary
}

export function ProviderBadge({ provider }: ProviderBadgeProps) {
  const tone =
    provider.mode === 'openai'
      ? 'bg-cyan-500/15 text-cyan-100 ring-cyan-400/30'
      : provider.mode === 'mock'
        ? 'bg-slate-500/15 text-slate-100 ring-slate-400/25'
        : provider.mode === 'mixed'
          ? 'bg-amber-500/15 text-amber-100 ring-amber-400/30'
          : 'bg-white/7 text-slate-200 ring-white/10'

  return (
    <span
      className={`inline-flex max-w-full items-center justify-center rounded-full px-3 py-1 text-center text-xs font-medium ring-1 ${tone}`}
      title={provider.detail}
    >
      {provider.label}
    </span>
  )
}
