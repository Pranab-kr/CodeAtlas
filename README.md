# CodeAtlas

CodeAtlas turns a public GitHub TypeScript or JavaScript repository into an interactive dependency map, route explorer, and grounded architecture Q&A workspace.

## Stack

- **Web app**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui (`@base-ui/react`), React Flow (`@xyflow/react`)
- **Auth & workspaces**: Clerk Organizations
- **Database & live progress**: Supabase Postgres + Realtime with Clerk third-party JWT RLS
- **Parsing pipeline**: GitHub tarball download + `ts-morph` static import, route, role, and insight analysis
- **AI & Ask assistant (optional)**: Vercel AI SDK (`ai` + `@ai-sdk/openai`) over any OpenAI-compatible Chat Completions endpoint (`AI_BASE_URL`), with LangSmith tracing

## Local Setup

Requires Node.js `22.x` and `pnpm`.

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Configure environment variables:

   ```bash
   cp .env.example .env.local
   ```

   Fill in the required Clerk and Supabase keys. Optionally configure `GITHUB_TOKEN`, AI variables (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` — powering explanations, role labelling, and the in-app Ask assistant), and LangSmith tracing (`LANGSMITH_TRACING`, `LANGSMITH_API_KEY`).

3. Apply Supabase migrations in `supabase/migrations/` to your Supabase project (and configure Clerk as a third-party auth provider in Supabase).

4. Start the development server:

   ```bash
   pnpm dev
   ```

## Scripts

- `pnpm dev` — start Next.js development server
- `pnpm build` — create a production build
- `pnpm start` — start the production server
- `pnpm lint` — run ESLint
- `pnpm exec tsc --noEmit` — run TypeScript type checking
- `pnpm parse <github-url>` — run the repository parser locally from the CLI

## Deployment Notes

- Run all migrations under `supabase/migrations/` before deploying, including least-privilege grants and RLS policies.
- Set `GITHUB_TOKEN` (a fine-grained or classic token with public read access) in production so repository commit resolution and staleness checks do not hit GitHub's 60 requests/hour unauthenticated IP rate limit.
- The analysis pipeline runs in the background via Next.js `after()` and writes to a temporary directory before persisting to Supabase. For larger repositories, host on a runtime with adequate function duration and memory (or configure function `maxDuration` appropriately).
- Configure `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` (any OpenAI-compatible Chat Completions endpoint) to enable explanations, role classification, and the Ask pane in the single Next.js deployment.
