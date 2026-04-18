export function SetupPage() {
  return (
    <div className="app-frame min-h-screen px-4 py-6 sm:px-6">
      <div className="app-backdrop" />
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="glass-strong page-enter rounded-[2rem] p-8 shadow-2xl shadow-black/30">
          <p className="mb-3 inline-flex rounded-full bg-amber-500/12 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-amber-100 ring-1 ring-amber-400/20">
            Convex setup required
          </p>
          <h1 className="text-3xl font-semibold text-white sm:text-4xl">
            The frontend is ready. The backend URL is the missing piece.
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
            Per the current Convex React quickstart, the first `npx convex dev` run writes
            `VITE_CONVEX_URL` into `.env.local`. Once that happens, this cockpit connects to
            live data instead of showing this setup screen.
          </p>
        </section>

        <section className="glass rounded-3xl p-6">
          <p className="mb-4 text-[11px] uppercase tracking-[0.3em] text-slate-500">
            Run these commands
          </p>
          <div className="space-y-4">
            {['npm install', 'npm run dev:backend', 'npm run dev'].map((command) => (
              <code
                key={command}
                className="block overflow-x-auto rounded-2xl bg-black/30 px-4 py-3 text-sm text-slate-100"
              >
                {command}
              </code>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
