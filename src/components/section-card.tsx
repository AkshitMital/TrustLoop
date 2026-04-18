import type { PropsWithChildren, ReactNode } from 'react'

interface SectionCardProps extends PropsWithChildren {
  title: string
  eyebrow?: string
  aside?: ReactNode
  className?: string
  contentClassName?: string
  busy?: boolean
}

export function SectionCard({
  title,
  eyebrow,
  aside,
  className = '',
  contentClassName = '',
  busy = false,
  children,
}: SectionCardProps) {
  return (
    <section
      className={`glass relative overflow-hidden rounded-3xl p-5 shadow-2xl shadow-black/20 ${
        busy ? 'panel-busy' : ''
      } ${className}`}
    >
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-1 text-[11px] uppercase tracking-[0.32em] text-slate-400">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="break-words text-lg font-semibold leading-tight text-white">{title}</h2>
        </div>
        {aside ? <div className="w-full lg:w-auto lg:flex-none">{aside}</div> : null}
      </div>
      <div className={contentClassName}>{children}</div>
    </section>
  )
}
