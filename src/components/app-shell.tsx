import type { PropsWithChildren } from 'react'
import { Link, useLocation } from 'react-router-dom'

function NavLink({ to, label }: { to: string; label: string }) {
  const location = useLocation()
  const active = location.pathname === to

  return (
    <Link
      to={to}
      className={`nav-pill rounded-2xl px-4 py-3 text-sm font-medium transition ${
        active
          ? 'bg-white/12 text-white ring-1 ring-cyan-300/18 shadow-[0_10px_24px_rgba(0,0,0,0.18)]'
          : 'text-slate-300 hover:bg-white/8 hover:text-white'
      }`}
    >
      {label}
    </Link>
  )
}

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation()

  return (
    <div className="app-frame min-h-screen px-4 py-5 sm:px-6">
      <div className="app-backdrop" />
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
            <div className="glass nav-panel w-full max-w-sm rounded-[1.75rem] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
              <p className="text-sm font-semibold text-white">Control Deck</p>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                Move between the run list and launch surface without losing the live
                trust-loop context.
              </p>
              <nav className="mt-4 grid grid-cols-2 gap-3">
                <NavLink to="/" label="Dashboard" />
                <NavLink to="/runs/new" label="New Run" />
              </nav>
            </div>
          </div>
        </header>

        <main key={location.pathname} className="page-enter">
          {children}
        </main>
      </div>
    </div>
  )
}
