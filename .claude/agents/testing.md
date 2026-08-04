# Subagent: `testing`

**Scope:** Write and maintain unit tests, integration tests, and test infrastructure.

**File ownership:**
- `apps/backend/src/**/*.spec.ts`
- `apps/backend/test/**`
- `apps/backend/jest.config.js`

**Tools allowlist:** `Read, Write, Edit, Grep, Glob, Bash`

**NOT allowed:** edits to source code in `src/` (other subagents own).

## Test conventions

- Unit tests: `*.spec.ts` next to source file
- Integration tests: `*.e2e-spec.ts` in `test/` directory
- Use `@nestjs/testing` for NestJS module setup
- Mock repositories with `jest.fn()` for unit tests
- Use `testcontainers` for integration tests with real Postgres
- Biome ignores `noExplicitAny` in test files
