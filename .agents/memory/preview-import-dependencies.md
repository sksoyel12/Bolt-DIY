---
name: Preview import dependencies
description: Importing a large external pnpm app can require workspace-level dependency overrides before its managed preview will install.
---

When importing an existing pnpm app into a Replit artifact, run installation through the workspace rather than relying on the app's nested lockfile. Older transitive packages may be blocked by the package firewall; prefer a current compatible workspace override instead of bypassing the firewall.

**Why:** External lockfiles can pin packages that the workspace security registry rejects, even when the app source itself is valid.

**How to apply:** If install fails on a blocked transitive package, identify the dependency chain and update or override it at the workspace level, then restart the managed artifact workflow so it receives the configured port and base path.