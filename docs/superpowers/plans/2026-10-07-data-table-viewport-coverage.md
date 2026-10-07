# Data Table Viewport Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add deterministic browser coverage for the four data tables in issue #456, including long-name clipping, responsive layout, row-height bounds, and horizontal overflow.

**Architecture:** Keep the existing Playwright/Vite harness. Add a test-only fixture that intercepts session and table API calls with fixed payloads, then exercise real routed pages and components at the configured phone, md-edge, and desktop viewports. Do not change production authentication or table breakpoints.

**Tech Stack:** Playwright, TypeScript, existing frontend API contracts and layout-invariant helpers.

**Spec:** GitHub issue #456 plus the accepted grilling decisions recorded in this conversation.

## Global Constraints

- Reuse the existing viewport projects: 390px, 767px, and 1024px.
- Test customers, receivables, exceptions, and reminder executions; do not include reminder policies.
- Customers, receivables, and exceptions use their current responsive card/grid layouts; reminder executions retain their table and internal horizontal scrolling.
- Use fixed API response fixtures with three customer names longer than 200 characters and linked table rows; do not require a backend or database.
- Bound rows to 64px at desktop and 120px at narrow widths.
- Recover the complete customer name through the existing TooltipLabel behavior; do not add native title attributes.

## Review Focus

- Session restore must reach the actual authenticated route, not a loading or auth placeholder.
- The fixture must include complete response shapes the pages consume and stable timestamps/IDs.
- Table readiness must be asserted before measuring layout.
- Responsive assertions must inspect rendered layout, not Tailwind class strings.
- Inner table scrolling must not become document-level horizontal overflow or let cell content paint over neighboring cells.

---

### Task 1: Add deterministic browser fixtures and table layout assertions

**Files:**
- Create: `apps/frontend/e2e/fixtures/data-table-api-fixture.ts`
- Modify: `apps/frontend/e2e/layout-invariants.ts`

**Interfaces:**
- Export a Playwright helper that installs the fixed auth and API responses needed by the four routes.
- Export layout assertions for bounded table rows and cell-content containment, using the existing `Page` and `expect` imports.

- [ ] **Step 1: Write a focused failing Playwright test for the helper contract**

Add an assertion through a real table route that requires a fixed fixture row to render and have bounded geometry. Before implementation, run the focused Playwright command and confirm it fails because no authenticated fixture is installed.

- [ ] **Step 2: Implement the test-only API fixture and minimal geometry helpers**

Intercept `/api/v1/auth/refresh`, `/api/v1/auth/me`, and the four list endpoints. Return fixed, complete payloads with stable identifiers and timestamps. Keep test helpers under `e2e/`; do not add production bypasses.

- [ ] **Step 3: Run the focused test and confirm it passes**

Run the single test at its configured viewport and verify it measures a rendered route row rather than a placeholder.

### Task 2: Cover all four table routes and document the viewport contract

**Files:**
- Create: `apps/frontend/e2e/data-tables.e2e.ts`
- Modify: `apps/frontend/e2e/README.md`
- Modify: `docs/wayfinder/feature-map.md`

**Interfaces:**
- The e2e spec consumes the fixture and geometry helpers from Task 1.
- The README documents the data fixture, row-height limits, responsive expectations, and focused test command.

- [ ] **Step 1: Add the failing behavior assertions**

For each route, wait for its rendered heading/table row, then assert no document horizontal scroll, bounded row heights (64px desktop, 120px narrow), and that rendered cell content stays within its cell. For customers, receivables, and exceptions, assert the header is hidden and rows render as a card/grid at 390px and 767px, and normal table layout at 1024px. For reminder executions, assert the header remains visible and its table container owns any horizontal scrolling. Hover a long customer name and assert the tooltip contains its full literal value.

- [ ] **Step 2: Run the focused spec and inspect the first failing assertion**

Run `pnpm --filter @casso-ar/frontend test:viewport -- --grep "data tables"`; confirm failures identify real layout or fixture gaps, not a route placeholder.

- [ ] **Step 3: Make only the necessary test and fixture adjustments**

Fix test setup/selector mistakes or geometry helper defects. Preserve existing production table behavior unless a confirmed acceptance assertion exposes a real mismatch.

- [ ] **Step 4: Run the viewport suite and frontend verification**

Run the full viewport suite, frontend typecheck, full relevant frontend test suite, and `pnpm verify`.

- [ ] **Step 5: Review the diff, update the feature-map status, and commit**

Record the shipped result in `docs/wayfinder/feature-map.md` only after verification; commit the complete issue #456 change on the current worktree branch.
