Run frontend tests and type-check.

Use `verification-before-completion` before reporting the result. If a test fails, use `systematic-debugging` before changing code.

```bash
cd apps/frontend && npx vitest run
cd apps/frontend && npx tsc --noEmit
```

Report: tests passed/failed, type errors.
