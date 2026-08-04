---
paths:
  - "apps/backend/src/**/*.spec.ts"
  - "apps/backend/test/**/*.spec.ts"
  - "apps/backend/test/**/*.e2e-spec.ts"
---

# Test Rules

- Unit tests: *.spec.ts next to source file
- Integration tests: *.e2e-spec.ts in test/ directory
- Mock repositories with jest.fn() for unit tests
- Use @nestjs/testing for module setup
- Biome ignores noExplicitAny in test files
