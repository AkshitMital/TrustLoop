# AI Trust Cockpit

AI Trust Cockpit is a React + Vite + Tailwind + Convex MVP for evaluating AI-generated code through a visible trust loop:

1. Maker generates or refactors code.
2. Red Team generates adversarial attack cases.
3. A constrained evaluator runs the code when possible.
4. The Eval Engine scores correctness, robustness, security, performance, and code quality.
5. A repair iteration patches the code and reruns the evaluation.

Prompt and code runs can use OpenAI-backed Maker and Red Team stages when `OPENAI_API_KEY` is configured in Convex, while deterministic fallback remains available if the backend key is missing.

## Stack

- React 19 + Vite + TypeScript
- Tailwind CSS v4 via the Vite plugin
- Convex for storage, queries, mutations, actions, and live updates
- A backend evaluator in Convex node actions for constrained utility execution
- OpenAI Responses API for model-backed Maker and Red Team stages

## Getting started

Install dependencies:

```bash
npm install
```

Start Convex in one terminal:

```bash
npm run dev:backend
```

The first `convex dev` run will prompt you to create or select a deployment. Per the current Convex docs, it writes the development URL to `.env.local` as `VITE_CONVEX_URL`.

If you want OpenAI-backed Maker and Red Team stages, set the secret in Convex before starting the dev loop:

```bash
npx convex env set OPENAI_API_KEY your_openai_api_key
```

Optional model override:

```bash
npx convex env set OPENAI_TRUSTLOOP_MODEL gpt-5-mini
```

Then rerun:

```bash
npx convex dev
```

Start the frontend in another terminal:

```bash
npm run dev
```

Open the app and create a `Prompt` or `Code` run to trigger the trust loop.

Important: a key stored only in the repo's `.env.local` does not automatically reach Convex actions. `.env.local` is where `convex dev` writes `VITE_CONVEX_URL` for the frontend. The backend OpenAI key must be stored with `npx convex env set ...`.

## What works

- Dashboard with live run list, status, score, iteration, pass/fail, and timestamp
- New Run flow for prompt and code runs
- Run detail cockpit with:
  - original prompt/code
  - generated versions
  - attack cases
  - failed cases
  - score breakdown
  - fix suggestion
  - before/after comparison
  - stage feed and iteration history
- A staged automatic repair loop that can progress across multiple versions
- Automatic backend scheduling so the loop keeps iterating even if the detail page is closed
- OpenAI-backed Maker and Red Team stages for prompt/code runs when the backend has `OPENAI_API_KEY`
- Deterministic fallback mode so the product still works without an external model key
- Explicit `analysis-only` fallback when a submitted code sample cannot be executed safely in the backend evaluator

## Notes on execution

The evaluator executes exported JavaScript and TypeScript utility functions inside a constrained Convex node action. The loop transpiles TypeScript syntax before execution, so model-generated repairs no longer fail just because they include type annotations.

If a code sample still cannot be executed safely, the app marks the run `analysis-only` instead of pretending the code ran. The repair loop can continue for up to 20 iterations, and when the run finishes, the UI promotes the best-scoring version rather than blindly showing only the last attempt.

## Testing

Run the frontend unit tests:

```bash
npm test
```

Build the frontend:

```bash
npm run build
```

## Important files

- `src/` for the React application
- `convex/` for schema, queries, mutations, and actions
- `shared/pipeline.ts` for scenario generation, patch generation, and scoring helpers shared by frontend and backend

## Environment

- `VITE_CONVEX_URL` is written by `npx convex dev`
- `OPENAI_API_KEY` should be set in Convex env if you want live Maker/Red Team model calls
- `OPENAI_TRUSTLOOP_MODEL` is optional and defaults to `gpt-5-mini`
- Without an OpenAI key, the app falls back to deterministic orchestration
