# Task 1 Report: Aging report exact totals

## Scope

Changed only the aging report path: the repository SQL/result mapping, repository port, query service zero fill, `/reports/aging` OpenAPI schema, and their specs/fixtures. The global PostgreSQL int8 parser and customer aging/report endpoints were left unchanged. `totalRemaining` now stays a decimal integer string; bucket counts remain numbers.

## TDD evidence

- **RED:** Before production changes, the focused Jest run failed as expected: repository tests received numbers (`12345` and `9007199254740992`) instead of strings, and the query-service test received numeric `0` for synthesized buckets. The controller fixture test passed.
- **GREEN:** After the production changes, all focused specs passed.

## Verification

- `pnpm --filter @casso-ar/backend exec jest --runInBand src/modules/reporting/infrastructure/typeorm-aging-report.repository.spec.ts src/modules/reporting/application/aging-report-query.service.spec.ts src/modules/reporting/presentation/reports.controller.spec.ts` — passed, 3 suites / 12 tests.
- `pnpm --filter @casso-ar/backend type-check` — passed, exit code 0.
- `pnpm --filter @casso-ar/backend exec biome check --write <the seven changed TypeScript files>` — passed after formatting the changed files.
- `git diff --check` — passed before the final formatter pass; no whitespace-only logic changes followed other than formatting.
- Domain check of the changed backend path: SQL remains scoped by `organizationId`; the service obtains that ID from `TenantContextService`; money is not passed through `Number`; counts continue using `Number(row.count)`; no domain layer or write/transaction behavior was changed.

## Limits

This task uses repository/service/controller unit specs and a mocked PostgreSQL result. Real PostgreSQL aggregation and sums from individually safe rows are reserved for the later Testcontainers integration work described in the task brief. The full backend test suite and `pnpm verify` were not run.
