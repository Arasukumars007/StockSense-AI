---
name: Orval and Zod compatibility
description: Compatibility rule for generated API validation schemas in this workspace.
---

Pin the Orval Zod generator to numeric version 3 when generating API schemas.

**Why:** The workspace catalog currently resolves `zod` to the 3.x API. Orval v8 defaults to Zod 4 syntax for integer schemas (`zod.int()`), which causes the generated library typecheck to fail even though code generation itself succeeds.

**How to apply:** Keep `override.zod.version: 3` in `lib/api-spec/orval.config.ts` and rerun codegen after any OpenAPI change.