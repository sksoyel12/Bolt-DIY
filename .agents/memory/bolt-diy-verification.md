---
name: Bolt DIY verification
description: Verification constraints for the imported Bolt DIY Remix application.
---

The imported Bolt DIY bundle can exceed Node's default V8 heap during a production build; use a larger `NODE_OPTIONS=--max-old-space-size` value for build verification. The Replit preview can also capture the short-lived client-only SSR fallback before hydration, so confirm the hydrated UI through the browser and allow time for the client bundle to load.

**Why:** The app is large and includes many language/editor assets. Its SSR shell is intentionally minimal while browser-only auth and workbench code hydrate.

**How to apply:** Treat a default-heap build failure or a one-frame “Loading Bolt…” preview screenshot as inconclusive. Check workflow startup, browser console, and the hydrated DOM before changing application code.