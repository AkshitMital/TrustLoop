interface CodeWindowProps {
  title: string
  body: string
  footer?: string
}

export function CodeWindow({ title, body, footer }: CodeWindowProps) {
  return (
    <div className="overflow-hidden rounded-3xl border border-white/8 bg-slate-950/70">
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <p className="text-sm font-medium text-white">{title}</p>
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/70" />
        </div>
      </div>
      <pre className="max-h-[34rem] overflow-auto px-4 py-4 text-xs leading-6 text-slate-200">
        {body}
      </pre>
      {footer ? (
        <div className="border-t border-white/8 px-4 py-3 text-xs text-slate-400">{footer}</div>
      ) : null}
    </div>
  )
}
