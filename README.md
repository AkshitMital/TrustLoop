# AI Trust Cockpit

AI Trust Cockpit is a React + Vite + Tailwind + Convex MVP for evaluating AI-generated code through a visible trust loop:

1. Maker generates or refactors code.
2. Red Team generates adversarial attack cases.
3. A constrained evaluator runs the code when possible.
4. The Eval Engine scores correctness, robustness, security, performance, and code quality.
5. A repair iteration patches the code and reruns the evaluation.

The seeded demo path is intentionally opinionated: it shows a guaranteed fail-then-improve run so the score jump is obvious in a live demo.

## Stack

- React 19 + Vite + TypeScript
- Tailwind CSS v4 via the Vite plugin
- Convex for storage, queries, mutations, actions, and live updates
- A client-side Worker for constrained JS-compatible execution

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

Start the frontend in another terminal:

```bash
npm run dev
```

Open the app and use `Load seeded demo` to create the guaranteed trust-loop run.

## What works

- Dashboard with live run list, status, score, iteration, pass/fail, and timestamp
- New Run flow for prompt, code, or seeded demo runs
- Run detail cockpit with:
  - original prompt/code
  - generated versions
  - attack cases
  - failed cases
  - score breakdown
  - fix suggestion
  - before/after comparison
  - stage feed and iteration history
- One automatic repair loop
- Mock orchestration by default so the product still works without an external model key
- Explicit `analysis-only` fallback when a submitted code sample cannot be executed safely in the client worker

## Notes on execution

The evaluator executes only JS-compatible TypeScript or plain JavaScript exported utility functions. If a code sample requires a full server runtime, multiple files, or TypeScript syntax the browser cannot execute directly, the app marks the run `analysis-only` instead of pretending the code ran.

That constraint is deliberate. It keeps the MVP honest and fast enough for a hackathon.

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
- External model keys are optional in this MVP. The current implementation defaults to deterministic mock orchestration.
