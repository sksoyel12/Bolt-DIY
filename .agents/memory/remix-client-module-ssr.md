---
name: Remix client-module SSR boundary
description: Imported Remix apps using .client modules need a server-safe boundary around auth and browser-only components.
---

Keep components that import `.client` modules behind `ClientOnly` in the Remix root; render a visible server-safe fallback instead of invoking them during SSR.

**Why:** Vite/Remix can replace `.client` module exports during server rendering, causing runtime failures even when the browser bundle is valid.

**How to apply:** If the app’s root imports auth or browser-only code, keep that subtree inside `ClientOnly` and use a loading or login-safe fallback so the preview is never blank while hydration starts.