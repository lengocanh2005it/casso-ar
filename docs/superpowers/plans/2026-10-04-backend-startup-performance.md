# Backend Startup and Verification Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce local backend cold-start time and make `pnpm verify` reliable under this machine's CPU limits.

**Architecture:** Keep API/runtime and production build behavior unchanged. Run non-test verification tasks first, then serialize package test tasks. Use the Nest SWC builder only for the backend dev script, with type checking enabled so the Swagger CLI plugin continues to generate metadata.

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

### Task 2: Use SWC for backend dev cold starts

**Files:**
- Modify: `apps/backend/package.json`

**Interfaces:**
- Consumes: installed `@swc/cli`, `@swc/core`, and the existing Nest Swagger CLI plugin.
- Produces: the backend `dev` script runs `nest start --builder swc --watch --type-check`.

- [ ] **Step 1: Change only the backend dev script**

Set the script to:

```json
"dev": "nest start --builder swc --watch --type-check"
```

Leave the `build` and `type-check` scripts unchanged.

- [ ] **Step 2: Run the backend type check and build**

Run from the repository root:

```sh
pnpm --filter @casso-ar/backend type-check
pnpm --filter @casso-ar/backend build
```

Expected: both commands exit zero.

- [ ] **Step 3: Measure the TypeScript baseline**

Before changing the script, run the current TypeScript dev command three times. Use the same worktree, host, local Docker services, database, and port conditions for each run. Measure from command launch until `GET /api/docs-json` returns HTTP 200, and record each duration.

- [ ] **Step 4: Measure three SWC starts**

After changing the script, repeat the same three runs. In PowerShell, from `apps/backend`, set `$env:PORT='3102'` and run `pnpm dev`; stop the server with Ctrl+C after each measurement. Keep the SWC script only if its median is at least 20% faster than the TypeScript median and the gain exceeds run-to-run variation.

- [ ] **Step 5: Verify runtime metadata**

Check that `/api/docs-json` returns HTTP 200 and retains representative request and response DTO schemas, including required and optional fields. Check the Nest log for successful startup with no unresolved dependency or decorator metadata errors.

## Checkpoint: Performance and Correctness

- [x] `pnpm verify` passes.
- [ ] Backend type check and production build pass.
- [ ] All three SWC cold starts serve `/api/docs-json` successfully.
- [ ] Median SWC cold start is at least 20% faster than the median of three TypeScript starts, with a gain beyond run-to-run variation.
- [ ] No API route or database behavior was changed without a measured hotspot.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| SWC does not type-check by itself | Dev could miss type errors | Keep `--type-check` enabled and run the backend type-check script |
| Swagger plugin metadata differs under SWC | Broken docs or DTO schemas | Inspect `/api/docs-json` after every measured start |
| Serial package tests increase verification wall time | Slower feedback | Measure the complete `pnpm verify` duration and retain the change only if it prevents timeouts at acceptable cost |
| TypeORM synchronization runs during local startup | Local schema may be synchronized | Keep the existing dev configuration and use the same local database only for application startup |

## Open Questions

- None. Current local API metrics show no route with a representative p95 above 200 ms; revisit API query work if later traffic metrics identify one.
