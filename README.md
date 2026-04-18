# AI Trust Cockpit

AI Trust Cockpit is an AI-native evaluation and repair platform for generated code. Instead of treating AI coding as a one-shot prompt-and-pray workflow, it runs a visible trust loop: generate code, attack it, execute it when safe, score it across multiple dimensions, patch it, and keep iterating until the system either passes or hits a hard cap.

This project was built as a serious answer to the hackathon prompt areas around agentic coding, AI-native UX, multimodal reasoning, vertical agents, and eval tooling. The product does not just call a model. It orchestrates multiple agent roles, stores intermediate artifacts, reacts to GitHub pushes, surfaces live evaluation telemetry, and promotes the best version found across the entire loop.

## Demo

Video demo placeholder:

- `TBD: add Loom / YouTube / Drive link here before submission`

Suggested demo flow:

1. Create a prompt-based run.
2. Show Maker, Red Team, execution, evaluation, and repair progressing live.
3. Open a run detail page and show score deltas, failed cases, evidence, and fix suggestions.
4. Connect a GitHub repo and show baseline file scans.
5. Push a commit and show webhook-triggered re-analysis of changed files only.

## Why this project matters

AI coding agents are powerful, but in production they fail in subtle ways:

- they generate code that looks plausible but breaks on edge cases
- they pass happy-path demos while failing under adversarial inputs
- they hide reasoning and repair steps inside opaque chains
- they are hard to evaluate systematically across iterations
- they are even harder to monitor when connected to real repositories

AI Trust Cockpit turns that invisible process into a measurable system. It is designed for teams who want to treat AI-generated code as something to interrogate, pressure-test, score, and improve continuously instead of trusting a single output.

## Core product capabilities

### 1. Multi-stage trust loop

Every run moves through a structured pipeline:

1. `Maker` produces an initial implementation.
2. `Red Team` generates adversarial attack cases.
3. A constrained evaluator executes the code when possible.
4. The `Eval Engine` scores correctness, robustness, security, performance, and code quality.
5. A repair stage patches the code using the latest failures and reruns the loop.

This creates a visible agentic workflow rather than a single hidden model call.

### 2. Multiple input modalities

The app supports several ways to start trust evaluation:

- `Prompt` mode for natural-language feature requests
- `Code` mode for raw source submitted directly into the loop
- `GitHub` mode for repository-connected evaluation of tracked files

In practice, the system reasons over multiple modalities of evidence:

- natural-language requirements
- source code artifacts
- GitHub metadata and file diffs
- execution traces and attack outcomes
- structured scoring telemetry

### 3. Realtime AI-native cockpit UX

The UI is not a generic admin panel. It is a live control surface for an agentic system:

- dashboard with run status, pass/fail state, iteration count, score, and recency
- repo-grouped GitHub view with one repo card and nested file analyses
- detailed run view with original input, generated versions, attacks, failures, fix suggestions, score breakdown, and stage feed
- best-version promotion so users see the strongest result, not just the last iteration

### 4. GitHub repository automation

GitHub mode goes beyond importing a single file:

- connect a repo using owner, repo, branch, and PAT
- baseline-scan supported JS/TS files on first connect
- register a push webhook back to Convex
- on new commits, evaluate only changed supported files
- preserve repo provenance including branch, commit metadata, patch stats, and source links

This makes the app feel like an actual engineering workflow tool rather than a toy evaluator.

### 5. Execution-aware evaluation with safe fallback

Generated code is executed in a constrained backend environment when possible. When safe execution is not possible, the system explicitly marks the run as `analysis_only` instead of pretending execution happened.

That distinction matters because it preserves trust in the evaluator itself.

### 6. Iterative repair with hard stopping conditions

The loop can continue for multiple versions, up to a defined cap of 20 iterations. The system stops when:

- a version passes
- the repair loop converges without meaningful improvement
- the iteration cap is reached

At completion, the app promotes the best-scoring version across the full run.

## What makes this technically hard

This project combines several difficult engineering problems in one product:

- orchestrating multiple agent roles with stateful transitions
- converting freeform prompts into executable artifacts
- generating attack cases that are structured enough to score deterministically
- safely evaluating code in a constrained runtime
- handling execution and non-execution paths without misleading users
- preserving provenance across GitHub syncs and webhook-triggered reruns
- streaming a long-running backend pipeline into a live frontend UX
- scoring quality across several dimensions instead of a single pass/fail bit

## Stack

- `React 19`
- `Vite`
- `TypeScript`
- `Convex` for backend data, actions, scheduling, HTTP endpoints, and live queries
- `OpenAI Responses API` for model-backed Maker and Red Team stages
- `Vitest` and Testing Library for tests
- `Vercel` for frontend deployment

## System architecture

### Frontend

- `src/pages/dashboard-page.tsx`: live dashboard and GitHub repo grouping
- `src/pages/new-run-page.tsx`: prompt, code, and GitHub run creation
- `src/pages/run-detail-page.tsx`: deep inspection of each trust loop
- `src/components/`: score pills, stage feed, attack cards, code windows, and status UI

### Backend

- `convex/orchestrator.ts`: core loop orchestration, execution queueing, evaluation, repair, and finalization
- `convex/runs.ts`: run storage, events, versions, evaluations, and detail queries
- `convex/github.ts`: repo connection, PAT-backed fetches, baseline scans, and push-sync processing
- `convex/http.ts`: GitHub webhook endpoint with HMAC signature verification
- `convex/execution.ts`: constrained code execution
- `convex/openai.ts`: model-backed generation and repair stages
- `convex/schema.ts`: tables for runs, versions, attack cases, evals, fix suggestions, events, and repo connections

### Data model

Convex persists the full trust loop, including:

- run metadata and source artifacts
- every generated version
- attack cases per version
- evaluation results and evidence
- fix suggestions between versions
- stage-by-stage event logs
- GitHub repo connection and webhook state

## Evaluation model

Each evaluated version is scored across five dimensions:

- correctness
- robustness
- security
- performance
- code quality

The evaluator also records:

- detected failures
- evidence items
- per-category rationales
- attack results with pass, fail, or error state
- execution mode: `executed` or `analysis_only`

This gives the app both a user-facing trust narrative and a machine-usable evaluation record.

## Hackathon track alignment

This project intentionally spans the hackathon themes:

- `Agentic Coding`: multiple role-specific agents collaborate inside one automated coding loop
- `UX for Agentic Applications`: the UI exposes long-running agent state, evidence, iteration history, and best-result selection
- `Multimodal Intelligence`: the system reasons across prompts, source code, GitHub diffs, attack inputs, and execution evidence
- `Domain Agents`: this is a vertical agent for AI code trust, review, and repair under engineering constraints
- `Building Evals`: the core of the product is evaluation infrastructure, attack generation, scoring, debugging, and improvement loops

## Local development guide

This guide is intentionally detailed so judges, mentors, and developers can reproduce the app locally without guessing.

### Prerequisites

Install these first:

- `Node.js 20+` recommended
- `npm 10+` recommended
- a `Convex` account for creating a development deployment
- optionally, an `OpenAI API key` if you want model-backed generation and repair
- optionally, a `GitHub Personal Access Token` if you want tracked repo mode

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd ai-trust-cockpit
```

If the folder name is different on your machine, use that folder instead. The important part is being inside the project root before running the commands below.

### 2. Install frontend and backend dependencies

```bash
npm install
```

This installs the React app, Convex client, TypeScript toolchain, test tooling, and build tooling used by the project.

### 3. Start the Convex backend for the first time

In terminal window 1:

```bash
npm run dev:backend
```

What happens here:

- Convex will prompt you to log in if needed.
- Convex will ask you to create or select a deployment.
- After setup, Convex writes `VITE_CONVEX_URL` to `.env.local`.
- The backend functions, schema, and HTTP routes are synced to your development deployment.

This step is required before the frontend can connect. If `VITE_CONVEX_URL` does not exist yet, the app will intentionally show the setup screen.

### 4. Configure optional OpenAI support

If you want the full model-backed Maker and Red Team experience, set the backend secret in Convex:

```bash
npx convex env set OPENAI_API_KEY your_openai_api_key
```

Optional model override:

```bash
npx convex env set OPENAI_TRUSTLOOP_MODEL gpt-5-mini
```

Important:

- storing the key only in local frontend env files is not enough
- the backend actions run inside Convex, so the key must be stored in Convex environment variables
- without this key, the app still works using deterministic fallback logic

If you set the secret after the backend is already running, rerun:

```bash
npx convex dev
```

or simply restart:

```bash
npm run dev:backend
```

### 5. Start the frontend

In terminal window 2:

```bash
npm run dev
```

Then open the local URL shown by Vite, usually:

```bash
http://localhost:5173
```

### 6. Verify the app is connected correctly

A correct local setup should behave like this:

- the setup page disappears
- the dashboard loads instead of the Convex setup helper
- creating a prompt or code run inserts a live run into the dashboard
- the status advances through generation, attack, execution/evaluation, and repair stages

### 7. Run the app without OpenAI, if needed

The app is intentionally designed to remain functional without external model access.

In no-key mode:

- deterministic orchestration remains available
- you can still create runs
- the trust loop still produces artifacts and evaluation output
- GitHub-connected evaluation still works for supported files

This is useful for local demos, testing, and fallback behavior.

### 8. Configure GitHub tracked repo mode

GitHub mode requires one extra frontend environment variable so GitHub knows where to send webhooks:

Add this to `.env.local`:

```bash
VITE_CONVEX_SITE_URL=https://your-deployment.convex.site
```

Where to get it:

- open your Convex deployment
- find the public Convex site URL
- use that full URL as the value

Why this is needed:

- the app registers a GitHub push webhook at `https://your-deployment.convex.site/github/webhook`
- after the first baseline scan, future pushes trigger TrustLoop again for changed files only

### 9. Create a GitHub token for repo mode

Use a demo-scoped token with only the permissions needed for the workflow.

Recommended access:

- repository read access
- webhook management access

The app stores the token in Convex for tracked-repo sync. For a hackathon demo, use a dedicated token for the demo repo rather than a broad personal token.

### 10. Use the app locally

Recommended local walkthrough:

1. Start with a `Prompt` run.
2. Submit a small utility request.
3. Watch the run appear on the dashboard.
4. Open the run detail page.
5. Inspect the original input, generated code, attack cases, score breakdown, and fix suggestions.
6. Create a `GitHub` run and connect a small JS/TS repo.
7. Confirm the initial baseline file scans are created.
8. Push a commit to the tracked branch and verify only changed supported files rerun.

### Common setup issues

#### The frontend only shows the setup screen

Cause:

- `VITE_CONVEX_URL` has not been written yet

Fix:

- run `npm run dev:backend`
- complete the Convex deployment selection flow
- confirm `.env.local` now contains `VITE_CONVEX_URL`

#### OpenAI-backed stages are not running

Cause:

- `OPENAI_API_KEY` is not set in Convex environment variables

Fix:

```bash
npx convex env set OPENAI_API_KEY your_openai_api_key
```

Then restart the backend dev process.

#### GitHub repo mode cannot register webhooks

Common causes:

- `VITE_CONVEX_SITE_URL` is missing
- the PAT lacks webhook permission
- the repo or branch is incorrect

Fix:

- set `VITE_CONVEX_SITE_URL`
- use a token with repo and webhook access
- retry with a smaller JS/TS repo for the demo

#### A code sample cannot be executed

Expected behavior:

- the app should mark the run as `analysis_only`
- the UI should still show evaluation output without falsely claiming execution happened

This is a feature, not a failure. It protects trust in the evaluator.

## Testing

Run unit tests:

```bash
npm test
```

Run linting:

```bash
npm run lint
```

Build the frontend:

```bash
npm run build
```

## Deploying to Vercel

This repo includes [vercel.json](/Users/akshitmittal/Desktop/Codex Hackathon/vercel.json) for a Convex-backed Vercel deployment.

### One-time production setup

1. Push the repository to GitHub, GitLab, or Bitbucket.
2. Create or open a Convex production deployment.
3. Generate a Convex Production Deploy Key.
4. Import the repo into Vercel.
5. Add `CONVEX_DEPLOY_KEY` to the Vercel project environment variables.
6. Deploy.

### Why the Vercel config matters

The deploy flow is set up so that:

- `npx convex deploy` runs before the frontend build
- the production Convex URL is injected into the Vite build
- SPA routes are rewritten correctly back to the frontend entrypoint

### Production secrets

If you want model-backed stages in production, set them in the Convex production environment:

```bash
npx convex env set OPENAI_API_KEY your_openai_api_key --prod
npx convex env set OPENAI_TRUSTLOOP_MODEL gpt-5-mini --prod
```

Do not rely on `.env.local` for production secrets.

## Important files

- `src/` contains the frontend product experience
- `convex/` contains the trust-loop backend and GitHub integration
- `shared/pipeline.ts` contains shared scoring and artifact logic
- `src/lib/*.test.ts` and `convex/*.test.ts` contain test coverage for key flows

## Environment variables

### Local frontend

- `VITE_CONVEX_URL`: written by `npx convex dev`
- `VITE_CONVEX_SITE_URL`: required for GitHub webhook mode

### Convex backend environment

- `OPENAI_API_KEY`: enables model-backed Maker and Red Team stages
- `OPENAI_TRUSTLOOP_MODEL`: optional override for the OpenAI model used

## Submission summary

AI Trust Cockpit is not just an LLM wrapper. It is a full-stack trust system for AI-generated code with:

- agentic generation and repair
- adversarial evaluation
- execution-aware scoring
- realtime evidence-rich UX
- GitHub-triggered continuous analysis
- persistent evaluation history inside Convex

That combination is what makes the project feel product-grade and hackathon-worthy.
