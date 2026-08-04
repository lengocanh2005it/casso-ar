---
paths:
  - "apps/backend/src/**/*.spec.ts"
  - "apps/backend/test/**/*.spec.ts"
  - "apps/backend/test/**/*.e2e-spec.ts"
---

# Test Rules

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
