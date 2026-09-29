# Optional Bank Linking During Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let active members use permitted app routes without an active bank connection while showing the organization’s sync status and preserving connection permissions.

**Architecture:** Reuse the existing `bankingLinked` field from `/auth/me`. Remove the route-level onboarding gate, keep onboarding as an optional connect-or-skip page, place the persistent status notice in `AppLayout`, and refresh the profile from `AuthProvider` every 60 seconds while authenticated. Grant `FINANCE_MANAGER` the existing read and full management permissions; do not add a new API or persisted skip state.

**Tech Stack:** React, React Router, React Query, NestJS, shared TypeScript role permissions, Vitest, Jest, PostgreSQL Testcontainers.

## Global Constraints

- Preserve authentication, organization/member status, tenant isolation, and route RBAC.
- A bank-linked organization has at least one active `BankConnection`; authorization rows alone do not count.
- Do not collect a Casso Flow API key during signup.
- FINANCE_MANAGER receives `BANK_CONNECTION_READ` and the existing full `BANK_CONNECTION_MANAGE` scope.
- Follow TDD at the approved public seams: application routes/app shell, shared role-permission contract, bank-connections API e2e, signup request.
- Do not add a database migration, status endpoint, or persisted onboarding-skip flag.

---

### Task 1: Grant finance managers bank-connection permissions

**Files:**
- Modify: `packages/shared-types/src/role-permissions.ts`
- Test: `packages/shared-types/src/role-permissions.spec.ts`
- Test: `apps/backend/test/bank-connections-audit-events.e2e-spec.ts`

**Interfaces:**
- Shared contract: `ROLE_PERMISSIONS[Role.FINANCE_MANAGER]` gains `Permission.BANK_CONNECTION_READ` and `Permission.BANK_CONNECTION_MANAGE`.
- Existing API: `GET /api/v1/bank-connections` requires READ; connection preview/confirm, key rotation, and disconnect require MANAGE.

- [x] Add a role-contract test granting both permissions to FINANCE_MANAGER and denying them to ACCOUNTANT, SALES_REP, and VIEWER.
- [x] Run the shared-types permission test and confirm the new assertions fail before the role mapping changes.
- [x] Add API-boundary coverage showing FINANCE_MANAGER can list and connect/rotate/disconnect while ACCOUNTANT is rejected for management and VIEWER is rejected for list.
- [x] Attempt the focused bank-connections e2e test; Testcontainers cannot find a container runtime in this environment, so its assertions could not execute.
- [x] Add only the two permissions to the FINANCE_MANAGER role mapping and confirm the focused shared-types test passes.

### Task 2: Make onboarding optional and remove the bank-link route gate

**Files:**
- Modify: `apps/frontend/src/App.tsx`
- Modify: `apps/frontend/src/routes/protected-route.tsx`
- Modify: `apps/frontend/src/routes/protected-route.spec.tsx`
- Modify: `apps/frontend/src/features/onboarding/pages/onboarding-page.tsx`
- Modify: `apps/frontend/src/features/onboarding/pages/onboarding-page.spec.tsx`
- Test: `apps/frontend/src/routes/app-routes.spec.tsx`

**Interfaces:**
- `/onboarding` remains protected and continues to use the existing Casso Flow account picker.
- All `appRoutes` remain inside `ProtectedRoute`; individual `PermissionRoute` checks stay unchanged.
- Skip navigates to `/dashboard` and does not write a skip flag.

- [x] At the app-route seam, add a case where an authenticated unlinked VIEWER opens `/customers` and sees the page, not onboarding.
- [x] Run the focused application-route test and confirm the case fails under the current `OnboardingRoute`.
- [x] Add an onboarding test that an unlinked OWNER can choose “Bỏ qua, đến trang chủ” and reach the dashboard.
- [x] Run the onboarding test and confirm it fails before the skip control is implemented.
- [x] Remove `OnboardingRoute` from the app route tree and its now-obsolete component tests; leave `ProtectedRoute` around app routes.
- [x] Add the skip button to onboarding and run the route/onboarding tests.

### Task 3: Show sync status and refresh profile in open sessions

**Files:**
- Modify: `apps/frontend/src/components/layout/app-layout.tsx`
- Modify: `apps/frontend/src/components/layout/app-layout.spec.tsx`
- Modify: `apps/frontend/src/contexts/auth-context.tsx`
- Modify: `apps/frontend/src/contexts/auth-context.spec.tsx`
- Test: `apps/frontend/src/routes/app-routes.spec.tsx`

**Interfaces:**
- The shared `AppLayout` renders a persistent status notice while `user.bankingLinked` is false.
- A member with `BANK_CONNECTION_MANAGE` receives a `/bank-connections` link; other members receive OWNER/FINANCE_MANAGER guidance.
- `AuthProvider` calls its existing `refreshUser()` once per 60,000 ms while authenticated and stops polling after logout/unmount.

- [x] Add app-shell tests for unavailable-sync copy, a manager link, non-manager guidance, and hiding the notice while linked.
- [x] Add a real-router/AuthProvider fake-timer test proving the notice follows `/auth/me` refreshes every 60 seconds in both directions.
- [x] Run the focused app-shell test and confirm the new expectations fail before adding the notice.
- [x] Implement the notice using existing `hasPermission` and the profile’s `bankingLinked` value; add the 60-second authenticated-only poll and remove the onboarding-only 5-second poll.
- [x] In the real-router/AuthProvider route seam, verify the notice disappears after a refreshed profile becomes linked and reappears after the last active connection is lost.
- [x] Run the focused app-shell, auth-context, onboarding, protected-route, and route integration tests; one initial run exposed a test query collision with the dashboard loading skeleton, then passed after querying the notice copy.

### Task 4: Preserve signup payload and run verification

**Files:**
- Review: `apps/frontend/src/features/auth/pages/signup-page.spec.tsx`
- Review: `apps/frontend/src/features/auth/pages/signup-page.tsx`
- Verify: affected frontend/shared-types/backend packages and repo checks.

- [x] Confirm the existing exact signup-request assertion contains only organization name, name, email, password, and tax code, with no Casso Flow API key; the exact request assertion already proves this.
- [x] Run focused frontend tests (49 passed across 7 files) and shared-types tests (9 passed across 2 suites) after all slices are green.
- [x] Run frontend/backend type checks and `pnpm verify` (exit 0); attempt the backend e2e (blocked before test execution because Testcontainers has no container runtime); run `/domain-check` scans, with no backend production source changes or violations found.
- [x] Review the complete diff against issue #401, check whitespace, and commit the implementation on `feat/optional-bank-linking`.
