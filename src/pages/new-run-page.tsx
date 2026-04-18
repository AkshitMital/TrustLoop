import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { SourceType } from '../../shared/pipeline'
import { EmptyState } from '../components/empty-state'
import { SectionCard } from '../components/section-card'
import { useRunLauncher } from '../hooks/use-run-launcher'

export function NewRunPage() {
  const { launchRun, isLaunching } = useRunLauncher()
  const [sourceType, setSourceType] = useState<SourceType>('prompt')
  const [title, setTitle] = useState('')
  const [sourceText, setSourceText] = useState(
    'Build a sanitizeUserInput helper for profile fields.',
  )
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (sourceType !== 'demo' && !sourceText.trim()) {
      setError('Add a prompt or code sample before launching the run.')
      return
    }

    try {
      await launchRun({
        title,
        sourceType,
        sourceText: sourceType === 'demo' ? '' : sourceText,
      })
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'The run could not be launched.',
      )
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_22rem]">
      <SectionCard title="Create a new evaluation run" eyebrow="New run">
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="flex flex-wrap gap-2">
            {(['prompt', 'code', 'demo'] as const).map((value) => {
              const active = sourceType === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSourceType(value)}
                  className={`rounded-full px-4 py-2 text-sm transition ${
                    active
                      ? 'bg-cyan-500/15 text-cyan-100 ring-1 ring-cyan-400/25'
                      : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
                  }`}
                >
                  {value}
                </button>
              )
            })}
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white">Run title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Seeded sanitize input demo"
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-cyan-300/40"
            />
          </label>

          {sourceType === 'demo' ? (
            <EmptyState
              title="Seeded demo path"
              body="This creates a staged sanitize-input hardening story. The demo starts with brittle code, then climbs through multiple visible repair iterations before it fully passes."
            />
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/8 p-4 text-sm leading-6 text-amber-100">
                Prompt and code runs only use OpenAI when `OPENAI_API_KEY` is set in Convex
                env. A key in `.env.local` alone will not reach Convex actions. After
                setting the secret, restart `npx convex dev`.
              </div>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-white">
                  {sourceType === 'prompt' ? 'Prompt' : 'Code'}
                </span>
                <textarea
                  value={sourceText}
                  onChange={(event) => setSourceText(event.target.value)}
                  rows={sourceType === 'prompt' ? 8 : 16}
                  className="min-h-60 w-full rounded-3xl border border-white/10 bg-black/25 px-4 py-4 font-[var(--mono)] text-sm leading-7 text-slate-100 outline-none transition focus:border-cyan-300/40"
                />
              </label>
            </div>
          )}

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isLaunching}
              className="rounded-full bg-gradient-to-r from-[var(--accent)] to-[#ffb066] px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLaunching ? 'Launching run…' : 'Launch run'}
            </button>
            <Link
              to="/"
              className="rounded-full border border-white/12 px-5 py-2.5 text-sm text-white transition hover:bg-white/6"
            >
              Back to dashboard
            </Link>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Scope guardrails" eyebrow="MVP constraints">
        <ul className="space-y-3 text-sm leading-6 text-slate-300">
          <li>Single-language MVP: JavaScript / TypeScript only.</li>
          <li>Best for one exported function or a small utility file.</li>
          <li>Exported utility code executes in the backend evaluator; unsupported samples fall back to analysis-only.</li>
          <li>The loop keeps iterating automatically in Convex until it passes, converges, or hits the high iteration cap.</li>
        </ul>
      </SectionCard>
    </div>
  )
}
