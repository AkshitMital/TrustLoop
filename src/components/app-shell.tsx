import type { PropsWithChildren } from 'react'
import { Link, useLocation } from 'react-router-dom'

function NavLink({ to, label }: { to: string; label: string }) {
  const location = useLocation()
  const active = location.pathname === to

  return (
    <Link
      to={to}
      className={`rounded-full px-4 py-2 text-sm transition ${
        active
          ? 'bg-white/10 text-white ring-1 ring-white/12'
          : 'text-slate-400 hover:bg-white/6 hover:text-white'
      }`}
    >
      {label}
    </Link>
  )
}

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen px-4 py-5 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="glass-strong overflow-hidden rounded-[2rem] p-6 shadow-2xl shadow-black/25">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="mb-3 inline-flex rounded-full bg-cyan-500/12 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-cyan-100 ring-1 ring-cyan-400/20">
                AI Trust Cockpit
              </p>
              <h1 className="text-3xl font-semibold leading-tight text-white sm:text-4xl">
                Generate, attack, score, repair, and show the trust delta.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                This MVP is built around one visible moment: version 1 fails, the Red Team
                proves why, Maker patches it, and the score climbs.
              </p>
            </div>
            <nav className="flex flex-wrap gap-2">
              <NavLink to="/" label="Dashboard" />
              <NavLink to="/runs/new" label="New Run" />
            </nav>
          </div>
        </header>

        <main>{children}</main>
      </div>
    </div>
  )
}
