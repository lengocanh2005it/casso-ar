# Backend Startup and Verification Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `pnpm verify` reliable under this machine's CPU limits and retain a backend cold-start change only if a same-host benchmark proves it is faster.

**Architecture:** Keep API/runtime and production build behavior unchanged. Run non-test verification tasks first, then serialize package test tasks. Evaluate Nest SWC with type checking, and keep it only if it meets the approved speed and Swagger metadata criteria.

**Tech Stack:** pnpm 11, Turborepo 2, Nest CLI 11, SWC, TypeScript, Jest, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-04-backend-performance-design.md`

## Global Constraints

- Preserve TypeScript type checking in the backend dev process.
- Preserve Swagger CLI plugin output and HTTP API behavior.
- Leave the production backend build command unchanged.
- Leave TypeORM synchronization and database settings unchanged.
- Do not change API SQL, indexes, caching, or response behavior without a representative route latency hotspot.
- Keep the existing Vitest timeout; fix task contention rather than hiding it with a larger timeout.

## Review Focus

- Backend injection or decorator metadata changes under SWC: verify app boot and `/api/docs-json` after the compiler switch.
- Swagger CLI annotations disappearing: compare generated DTO schemas and required fields against the current API document.
- TypeScript diagnostics no longer running in dev: keep `--type-check` and run the backend type-check command.
- Concurrent test workers recreating the timeout: run the root verify command after serializing its test phase.
- Backend API latency regressing: verify that this change does not alter production build, runtime database settings, or route implementation.

---

### Task 1: Make root verification tests resource-stable

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: existing Turbo tasks `lint`, `type-check`, `arch-check`, and `test`.
- Produces: the `pnpm verify` script first runs `turbo run lint type-check arch-check`, then runs `turbo run test --concurrency=1`.

- [x] **Step 1: Confirm the red baseline**

The existing root verification run failed when the ReportsPage CSV export test exceeded Vitest's 30-second limit. The isolated test, full frontend suite, and `turbo run test --concurrency=1` passed, identifying concurrency pressure rather than a broken CSV behavior.

- [x] **Step 2: Update the root verify command**

Change the root `package.json` script to:

```json
"verify": "turbo run lint type-check arch-check && turbo run test --concurrency=1"
```

This removes Jest/Vitest worker pools from the phase running lint and type checks, and prevents backend and frontend test workers from running simultaneously.

- [x] **Step 3: Run the workspace tests at the planned concurrency**

Run: `pnpm exec turbo run test --concurrency=1`

Expected: frontend, backend, and shared-types tests pass without a ReportsPage timeout.

- [x] **Step 4: Run root verification**

Run: `pnpm verify`

Expected: lint, type checks, architecture checks, and all package test suites pass.

### Task 2: Benchmark and gate SWC for backend dev cold starts

**Files:**
- Modify temporarily: `apps/backend/package.json`

**Interfaces:**
- Consumes: installed `@swc/cli`, `@swc/core`, and the existing Nest Swagger CLI plugin.
- Produces: keep the backend SWC `dev` script only if the benchmark and Swagger checks pass; otherwise restore the TypeScript command.

- [x] **Step 1: Measure the TypeScript baseline**

Before changing the script, run the current TypeScript dev command three times. Use the same worktree, host, local Docker services, database, and port conditions for each run. Measure from command launch until `GET /api/docs-json` returns HTTP 200, and record each duration.

Observed: `38.909s`, `18.892s`, `18.354s`; median `18.892s`, range `20.555s`.

- [x] **Step 2: Try SWC in a dev-only configuration**

The experiment used Nest SWC with `--type-check`, a dev-only compiler configuration to align compiled files with copied email assets, and generated Swagger metadata loaded before document creation. These temporary changes were reverted after the performance gate failed.

- [x] **Step 3: Run the backend type check and build**

Run from the repository root:

```sh
pnpm --filter @casso-ar/backend type-check
pnpm --filter @casso-ar/backend build
```

Expected: both commands exit zero. Observed: both passed during the experiment and again after reverting it; production build command remained unchanged.

- [x] **Step 4: Measure three SWC starts**

The three successful SWC runs returned HTTP 200 from `/api/docs-json`: `89.479s`, `40.447s`, and `20.261s`; median `40.447s`, range `69.218s`. A diagnostic run excluding generated metadata from the SWC type-check watch took `45.560s` and did not change the decision.

- [x] **Step 5: Verify runtime metadata**

After loading Nest's generated plugin metadata, `/api/docs-json` contained all 146 baseline schemas. `CreateReceivableDto`, `ReceivableResponseDto`, and `CreateCustomerBankAccountDto` matched the TypeScript document, including required and optional fields; 10 other schemas still differed. Nest startup logs showed successful startup.

- [x] **Step 6: Apply the performance gate**

The TypeScript median was `18.892s`; the 20%-faster target was `15.114s` or lower. SWC's `40.447s` median was slower, so restore the existing TypeScript `dev` command and do not retain the experiment.

## Checkpoint: Performance and Correctness

- [x] `pnpm verify` passes.
- [x] Backend type check and production build passed during the experiment; the final `dev` and `build` scripts remain unchanged.
- [x] All three SWC experiment starts served `/api/docs-json`; the SWC experiment was reverted.
- [ ] SWC cold start met the approved threshold. **Not met:** median `40.447s` vs TypeScript median `18.892s`; keep TypeScript.
- [x] No API route or database behavior was changed without a measured hotspot.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| SWC does not type-check by itself | Dev could miss type errors | Keep `--type-check` enabled and run the backend type-check script |
| Swagger plugin metadata differs under SWC | Broken docs or DTO schemas | Inspect `/api/docs-json` after every measured start |
| Serial package tests increase verification wall time | Slower feedback | Measure the complete `pnpm verify` duration and retain the change only if it prevents timeouts at acceptable cost |
| TypeORM synchronization runs during local startup | Local schema may be synchronized | Keep the existing dev configuration and use the same local database only for application startup |
| SWC metadata generation delays a clean start and changes some schemas | Slower startup or altered docs | Reject SWC unless a future setup passes the same cold-start and schema comparisons |

## Open Questions

- None. Current local API metrics show no route with a representative p95 above 200 ms; revisit API query work if later traffic metrics identify one.
