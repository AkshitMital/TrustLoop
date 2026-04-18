import type { RunEventDoc } from '../types/app'
import { formatTimestamp } from '../lib/format'

interface StageFeedProps {
  events: RunEventDoc[]
  liveVersionNumber?: number
}

export function StageFeed({ events, liveVersionNumber }: StageFeedProps) {
  return (
    <div className="space-y-3">
      {events.map((event, index) => {
        const isLive =
          liveVersionNumber != null &&
          event.versionNumber === liveVersionNumber &&
          index < 3 &&
          event.severity !== 'error'

        return (
          <div
            key={event._id}
            style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
            className={`motion-card-reveal flex gap-3 rounded-2xl border p-3 transition-all duration-300 ${
              isLive
                ? 'border-cyan-400/20 bg-cyan-500/[0.08] shadow-[0_0_24px_rgba(91,208,255,0.10)]'
                : 'border-white/8 bg-white/[0.04]'
            }`}
          >
          <div
            className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
              event.severity === 'error'
                ? 'bg-rose-400'
                : event.severity === 'warning'
                  ? 'bg-amber-300'
                  : isLive
                    ? 'bg-cyan-200 animate-pulse'
                    : 'bg-cyan-300'
            }`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-white">{event.title}</p>
              <p className="text-xs text-slate-500">{formatTimestamp(event.createdAt)}</p>
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">
              <span>{event.stage}</span>
              {event.source ? <span>{event.source.replaceAll('_', ' ')}</span> : null}
              {event.versionNumber != null ? <span>v{event.versionNumber}</span> : null}
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-400">{event.detail}</p>
            {event.debugData ? (
              <pre className="mt-3 overflow-x-auto rounded-xl bg-black/30 p-3 text-xs leading-6 text-slate-300">
                {event.debugData}
              </pre>
            ) : null}
          </div>
          </div>
        )
      })}
    </div>
  )
}
