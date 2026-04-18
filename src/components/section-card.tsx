import type { PropsWithChildren, ReactNode } from 'react'

interface SectionCardProps extends PropsWithChildren {
  title: string
  eyebrow?: string
  aside?: ReactNode
  className?: string
}

export function SectionCard({
  title,
  eyebrow,
  aside,
  className = '',
  children,
}: SectionCardProps) {
  return (
    <section className={`glass rounded-3xl p-5 shadow-2xl shadow-black/20 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          {eyebrow ? (
            <p className="mb-1 text-[11px] uppercase tracking-[0.32em] text-slate-400">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="text-lg font-semibold text-white">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}
