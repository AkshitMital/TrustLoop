import type { PropsWithChildren } from 'react'
import { Link, useLocation } from 'react-router-dom'

function NavLink({ to, label }: { to: string; label: string }) {
  const location = useLocation()
  const active = location.pathname === to || (to === '/' && location.pathname === '/')

  return (
    <Link
      to={to}
      className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition ${
        active
          ? 'bg-gradient-to-r from-[var(--accent)] to-[#ffb066] text-slate-900'
          : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
      }`}
    >
      {label}
    </Link>
  )
}

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation()

  return (
    <div className="min-h-screen px-4 py-5 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex items-center justify-between gap-4 rounded-3xl border border-white/8 bg-white/[0.02] px-5 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-500 shadow-lg shadow-cyan-400/25">
                <svg className="h-5 w-5 text-slate-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-white">TrustLoop</h1>
                <p className="text-[10px] uppercase tracking-widest text-slate-500">AI Trust Platform</p>
              </div>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            <NavLink to="/" label="Dashboard" />
            <NavLink to="/runs/new" label="New Run" />
          </nav>
        </header>

        <main key={location.pathname} className="animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}
