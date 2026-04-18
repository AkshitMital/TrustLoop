import type { RunEventDoc } from '../types/app'
import { formatTimestamp } from '../lib/format'

interface StageFeedProps {
  events: RunEventDoc[]
}

export function StageFeed({ events }: StageFeedProps) {
  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div key={event._id} className="flex gap-3 rounded-2xl border border-white/8 bg-white/[0.04] p-3">
          <div
            className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
              event.severity === 'error'
                ? 'bg-rose-400'
                : event.severity === 'warning'
                  ? 'bg-amber-300'
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
      ))}
    </div>
  )
}
