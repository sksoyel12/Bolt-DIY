# Bolt DIY

Bolt DIY is an AI-powered full-stack web development environment imported from StackBlitz Labs.

## Run & Operate

- `pnpm --filter @workspace/bolt-diy run dev` — run the Bolt DIY preview
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9, Remix 2, Vite 5
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- Bolt DIY app: `artifacts/bolt-diy`
- Bolt routes and UI: `artifacts/bolt-diy/app`
- Bolt build configuration: `artifacts/bolt-diy/vite.config.ts`
- Shared API server: `artifacts/api-server`
- Shared libraries: `lib/`

## Architecture decisions

- The imported Bolt application remains isolated in its own web artifact so its Remix routes and dependencies do not mix with the shared API package.
- The app binds to the artifact-provided `PORT` and `BASE_PATH` so it works through the project preview proxy.
- The workspace keeps its existing API server and shared libraries available for future integrations.

## Product

- Generate and edit full-stack applications from natural-language prompts.
- Chat with configurable AI model providers.
- Preview and manage generated project files in the browser.

## User preferences

- Keep the imported Bolt DIY source recognizable and avoid replacing it with a mock implementation.

## Gotchas

- The Bolt artifact uses Remix’s Vite dev server, not the shared API server.
- The imported Remix toolchain needs its compatible esbuild versions; the workspace override keeps Vite and Remix compiler versions scoped separately.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
