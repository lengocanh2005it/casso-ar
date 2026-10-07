# Issue #457 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Complete browser viewport coverage for the remaining application routes and make the suite a required pull-request check.

**Architecture:** Reuse the existing Playwright projects, route-ready helper, layout invariants, and API interception. Keep route fixtures local to the viewport suite, and keep the CI job separate from `pnpm verify`.

**Tech Stack:** Playwright, axe-core, React/Vite, pnpm, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-07-issue-457-viewport-coverage-ci.md`

## Global Constraints

- Use the existing widths: 360, 390, 767, 900, and 1024 pixels.
- Browser routes must use `openRoute` and deterministic API stubs; never measure a loading placeholder.
- Keep `retries: 0`; do not use snapshots to hide layout or contrast failures.
- Do not add viewport testing to `pnpm verify`.
- Do not add application `data-testid` selectors for layout assertions.
- Preserve unrelated working-tree state and make all changes in the issue worktree.

## Review Focus

- The ready selector must identify the fully rendered route at every width.
- Dark-mode contrast checks must inspect rendered text, including chart labels that axe does not see.
- Empty, one-item, and full-page fixtures must drive the visible state rather than only stub an unused endpoint.
- The required check context must match the actual GitHub Actions job name.

## Files

- `apps/frontend/e2e/app-surfaces.e2e.ts`: route-level layout, data-state, theme, chart, and operator coverage.
- `apps/frontend/e2e/layout-invariants.ts`: reusable rendered-page contrast and chart containment assertions.
- `apps/frontend/package.json` and `pnpm-lock.yaml`: test-only axe integration.
- `.github/workflows/ci.yml`: standalone viewport job on pull requests and pushes to `main`.
- `apps/frontend/e2e/README.md`: CI behavior and dark-mode contrast contract.
- `docs/wayfinder/feature-map.md`: ticket status and shipped reference.
- Additional frontend components only when a new browser assertion reproduces a real visual defect.

## Tasks

### 1. Dashboard and reports

- Add the failing route-ready/layout assertions for `/dashboard` and `/reports`, with empty, one-item, and full-page data fixtures for the activity and ageing collections.
- Run the focused tests at the existing five projects; confirm failures identify layout or chart behavior, not unmatched API calls or a missing route-ready selector.
- Add the smallest deterministic API responses using the existing `stubApi` route map.
- Add light/dark chart and ageing-table assertions, including axis/legend containment. Fix only defects the browser test reproduces.

### 2. Bank connections, Copilot, and settings

- Add route-ready/layout tests for `/bank-connections`, `/copilot`, and the accessible settings tabs.
- Cover empty, one-item, and full-page states for each visible collection; stub every requested API path and let unmatched requests fail the suite.
- Run each route through all five projects and fix reproduced overflow, clipping, or reachability defects.

### 3. Operator routes

- Seed an operator JWT through the existing auth refresh stub, then cover `/admin/dashboard`, `/admin/organizations`, `/admin/organizations/:organizationId/members`, and `/admin/ai-usage`.
- Exercise collection empty/one/full-page states and chart widths with deterministic responses.
- Run at all five projects and fix only measured defects.

### 4. Dark-mode contrast

- Add `@axe-core/playwright` as a frontend dev dependency and run its `color-contrast` rule in dark mode on every covered route.
- Add focused checks for SVG chart labels and in-scope controls because axe does not fully inspect them.
- Run the contrast cases at all five projects; fix reported failures and retain the failing browser assertion as regression coverage.

### 5. Required CI check and docs

- Add a standalone GitHub Actions job named `viewport` that installs Chromium and runs `pnpm turbo run test:viewport --filter=@casso-ar/frontend` on every pull request and push to `main`.
- Update the viewport README without changing the `pnpm verify` contract.
- Configure the `main` ruleset to require the `viewport` status check while preserving its existing absence of other restrictions.
- Update the feature map to mark #457 done after verification and record the PR.

## Verification

- For each test-first slice, run the focused Playwright test before the fix and after it.
- Run `pnpm --filter @casso-ar/frontend test:viewport` freshly after all route work.
- Run the relevant frontend test/type-check/lint/build commands and `pnpm verify` before completion.
- Verify the GitHub Actions run and required-check ruleset with `gh` before reporting the gate as active.
