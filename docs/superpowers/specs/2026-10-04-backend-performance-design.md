# Backend Startup and API Performance Design

**Date:** 2026-10-04

**Status:** Implemented; SWC rejected by benchmark

## Goal

Reduce local backend development cold-start time while preserving compile-time type checks and generated Swagger metadata. Use existing request metrics to identify API latency bottlenecks, then optimize only routes with representative evidence.

## Baseline

The existing `apps/backend` `dev` script runs `nest start --watch` with the default TypeScript compiler. A cold launch on the current machine took about 22 seconds from compiler start to Nest's successful-start log. The first compile took about 16 seconds; Nest bootstrap, TypeORM initialization, route setup, and Swagger generation account for the remaining interval. The project has 743 production TypeScript source files, 31 feature modules, and 46 ORM entity files.

The active backend on port 3000 exposes in-memory Prometheus histograms. A local scrape showed:

| Route | Samples | Mean duration | Approximate p95 bucket |
|---|---:|---:|---:|
| `GET /api/v1/reports/dashboard-summary` | 21 | 34 ms | <= 100 ms |
| `POST /api/v1/auth/refresh` | 21 | 40 ms | <= 100 ms |
| `GET /api/v1/alerts` | 36 | 7 ms | <= 50 ms |
| `POST /api/v1/auth/login` | 1 | 145 ms | <= 300 ms |

These are small local samples, not a production latency guarantee. `GET /api/v1/alerts/stream` has a much higher recorded duration because it holds a streaming connection open; it is excluded from ordinary request-latency comparisons.

## Proposed Design

### Verification runner reliability

The original root `pnpm verify` run timed out the ReportsPage CSV export test while running lint, type checks, architecture checks, and package tests together. The focused test, the full frontend suite on its own, and workspace tests with Turbo concurrency set to one all passed. Treat this as test-runner resource contention. Run lint/type-check/architecture checks in one phase, then run package tests with Turbo concurrency set to one. Keep the existing Vitest timeout rather than increasing it to mask worker starvation.

### Development startup

The proposed SWC dev command was tested with type checking enabled:

```sh
nest start --builder swc --watch --type-check
```

The experiment required a dev-only output layout so copied email assets resolved, plus loading Nest's generated Swagger metadata before document creation. Without metadata loading, 29 schemas were missing and DTOs became empty. With metadata loaded, all 146 schemas returned; three representative request/response DTO schemas matched the TypeScript document exactly, though 10 other schemas still differed.

The TypeScript cold-start measurements were `38.909s`, `18.892s`, and `18.354s` (median `18.892s`). The successful SWC measurements were `89.479s`, `40.447s`, and `20.261s` (median `40.447s`). The SWC median was slower than TypeScript and failed the required 20% improvement threshold (`15.114s` or lower). A diagnostic run that excluded generated metadata from the SWC type-check watch still took `45.560s`; the first clean SWC start also regenerated metadata 39 times. The experiment was reverted; the existing TypeScript `dev` and production `build` commands remain in place. Do not retain SWC unless a future configuration can pass the same startup and metadata checks.

### API latency

Use the existing `http_request_duration_seconds` histogram to select a route with enough samples and a p95 above the project's 200 ms API target. For that route, profile its repository/database work and make a separate, narrowly scoped optimization. Do not change SQL, indexes, caching, or response behavior based only on the current small sample, which shows no clear non-streaming hotspot.

## Alternatives Considered

1. **SWC with type checking (evaluated and rejected):** Its measured median was `40.447s` versus `18.892s` for TypeScript, and 10 schemas still differed after loading generated Swagger metadata; it failed the 20% improvement threshold.
2. **SWC without type checking:** Likely faster, but removes compiler diagnostics from the dev command and does not run the Swagger CLI transformation required by this project.
3. **Change TypeORM synchronization or defer Swagger setup:** Could reduce bootstrap work, but changes local schema or documentation behavior and is not justified before separately measuring those stages.

## Success Criteria

- Root `pnpm verify` completes without timing out the ReportsPage CSV export test.
- The median SWC cold start is at least 20% faster than the median of three TypeScript cold starts, with an improvement larger than run-to-run variation. **Not met:** SWC median `40.447s` vs TypeScript median `18.892s`; the SWC change was reverted.
- A TypeScript type error still fails the dev type-check process.
- `/api/docs-json` returns HTTP 200 and retains the expected DTO schemas and route documentation.
- Production build behavior is unchanged.
- API query changes are limited to a route supported by representative latency metrics and profiling evidence.

## Risks and Constraints

- SWC transpiles faster but does not type-check on its own; the Nest `--type-check` option must remain enabled.
- Swagger CLI plugin behavior must be checked after changing the compiler.
- TypeORM development synchronization remains enabled and is not changed by this design.
- Existing route metrics are process-local, use coarse histogram buckets, and have limited samples. The long-lived alerts stream must not be treated as an ordinary request.
- The isolated worktree's `pnpm install` exited successfully, but its optional `cpu-features` native build script logged that it could not detect a compiler. This environment warning must be considered if it affects verification.
