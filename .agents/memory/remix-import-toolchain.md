---
name: Imported Remix toolchain
description: Compatibility rule for importing Remix/Vite applications into this pnpm workspace.
---

When importing a Remix application into this workspace, keep the workspace’s security-oriented esbuild override scoped away from the app’s Vite and Remix compiler dependencies. Remix’s Vite build can fail with hundreds of destructuring transform errors when it is forced onto the workspace esbuild version.

**Why:** The workspace and imported app use different Vite/Remix compiler generations, and a global esbuild override makes the dev server fail before serving the UI.

**How to apply:** Add the imported app as its own workspace artifact and scope esbuild overrides for `vite` and `@remix-run/dev` to the versions those packages expect before restarting its managed workflow.

The Vite dev server also needs `server.allowedHosts: true` for Replit’s generated preview hostname; binding to `0.0.0.0` alone is not sufficient.

When the imported app’s client stays on its hydration fallback, inspect browser module errors for named icon exports before changing the root layout; `react-icons` version drift can break the whole client bundle.