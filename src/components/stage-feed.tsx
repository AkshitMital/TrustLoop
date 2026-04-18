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
            <p className="mt-1 text-sm leading-6 text-slate-400">{event.detail}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
