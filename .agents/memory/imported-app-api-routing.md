---
name: Imported app API routing
description: Route ownership rules when an imported full-stack app is added beside the default API artifact.
---

When an imported full-stack web app has its own `/api/*` routes, keep the default scaffold API service on a separate internal prefix so the app's API requests are not intercepted and returned as generic 404s.

**Why:** Artifact routing prefers the most-specific path. A default API service mounted at `/api` silently captures an imported app's internal API endpoints.

**How to apply:** Before preview verification, inspect artifact paths and probe one imported `/api` endpoint. If the default API service owns `/api`, move it to a non-conflicting prefix and make its server mount and health check use that same prefix.