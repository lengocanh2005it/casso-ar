---
paths:
  - "apps/backend/src/**/*.spec.ts"
  - "apps/backend/test/**/*.spec.ts"
  - "apps/backend/test/**/*.e2e-spec.ts"
---

# Test Rules

- New behavior, bug fixes, and refactors MUST use RED → GREEN → REFACTOR.
- Verify a relevant test fails before writing production code.
- Write one vertical slice at a time and test public behavior through the relevant seam.
- Bug fixes MUST include a regression test that fails before the fix.
- Before claiming completion, use `verification-before-completion` and report fresh verification evidence; do not rely on previous runs or assumptions.
- Exceptions: generated code, configuration-only changes, migrations, and throwaway prototypes. State the exception.

- Unit tests: `*.spec.ts` next to source file
- Integration tests: `*.e2e-spec.ts` in `test/` directory
- Mock repositories with `jest.fn()` for unit tests
- Use `@nestjs/testing` for module setup
- Use `testcontainers` for integration tests with real Postgres
- Biome ignores `noExplicitAny` in test files

## Test commands

```bash
npx jest                          # Run all unit tests
npx jest --testPathPattern <name> # Run specific test
npx tsc --noEmit                  # Type check
```
