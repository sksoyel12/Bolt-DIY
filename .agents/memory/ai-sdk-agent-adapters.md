---
name: AI SDK agent adapters
description: Compatibility constraint for custom AI SDK v4 language-model adapters used by non-chat web agents.
---

Custom AI SDK v4 `LanguageModelV1` adapters should return the complete v1 model shape, including `defaultObjectGenerationMode`, and may need an explicit `unknown` cast when the adapter intentionally implements only the text subset.

**Why:** The installed provider typings require the object-generation capability field even when the wrapped service only returns text. Omitting it produces a misleading structural type error rather than a runtime diagnosis.

**How to apply:** When adding a direct web-service adapter to an AI SDK v4 app, keep the adapter text-only at runtime, set the unsupported object mode to `undefined`, and preserve the typed stream finish event shape.