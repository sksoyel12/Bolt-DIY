# Bolt DIY

Bolt DIY is an AI-assisted full-stack development workspace for creating and editing applications from natural-language prompts.

## Run & Operate

- `pnpm --filter @workspace/bolt-diy run dev` — run the Bolt DIY Remix/Vite app on the artifact preview port.
- `pnpm --filter @workspace/bolt-diy run build` — build the imported app; use `NODE_OPTIONS=--max-old-space-size=4096` in the constrained workspace if the build reaches the Node heap limit.
- `pnpm --filter @workspace/bolt-diy run lint` — lint the Bolt DIY `app` directory.
- `pnpm --filter @workspace/bolt-diy run typecheck` — run the package TypeScript check. The imported package currently also contains an unrelated `src/` scaffold with baseline type errors.
- The managed preview workflow is `artifacts/bolt-diy: web`; do not start a competing API workflow for Bolt’s `/api` routes.
- Provider credentials are server-side environment bindings. Never commit or print their values.

## Stack

- pnpm workspaces, Node.js, TypeScript
- Remix 2 with Vite and Cloudflare-compatible server routes
- React 18, AI SDK 4, UnoCSS, Sass modules, Nanostores, and Zustand
- Imported app source of truth: `artifacts/bolt-diy/app`

## Where things live

- `artifacts/bolt-diy/app/components/chat/ModelSelector.tsx` — fixed provider selector UI.
- `artifacts/bolt-diy/app/utils/constants.ts` — selector labels, provider/model defaults, and provider registry exports.
- `artifacts/bolt-diy/app/lib/modules/llm/` — provider implementations and model routing.
- `artifacts/bolt-diy/app/routes/api.*` — Bolt-owned backend API routes.
- `artifacts/bolt-diy/.replit-artifact/artifact.toml` — managed preview and build configuration.

## Architecture decisions

- The selector intentionally exposes one fixed line per supported provider instead of the dynamic model catalog.
- The selector’s friendly labels map to canonical backend provider names and a single target model per provider.
- Firecrawl and Tavily use server-side agent adapters because they are web extraction/search services rather than chat-model providers.
- Bolt owns `/api` inside the imported Remix app; the separate API artifact must not be used for these routes.

## Product

- Natural-language app generation and code editing.
- Chat-based build/discuss workflows with file context, workbench previews, imports, exports, and deployment integrations.
- Provider selection across the supported hosted, local, and web-agent backends.

## User preferences

- Preserve the existing dark theme, rounded borders, padding, and header layout when changing the provider selector.

## Gotchas

- The production build can exceed the default Node heap in this workspace; use the documented `NODE_OPTIONS` override when needed.
- The package-wide TypeScript script includes an unrelated `src/` scaffold and is not a clean signal for the Remix app changes.
- Dynamic model catalogs may still be fetched for backend validation; the selector must continue to render only the fixed provider descriptors.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
