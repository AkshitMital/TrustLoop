import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  body: string
  action?: ReactNode
}

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className="glass rounded-3xl border-dashed p-8 text-center">
      <p className="mb-2 text-[11px] uppercase tracking-[0.32em] text-slate-500">
        Waiting for signal
      </p>
      <h2 className="mb-3 text-xl font-semibold text-white">{title}</h2>
      <p className="mx-auto max-w-xl text-sm leading-6 text-slate-400">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}
