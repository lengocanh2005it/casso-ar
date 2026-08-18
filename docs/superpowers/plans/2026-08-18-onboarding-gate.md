# Onboarding Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require every authenticated organization member to link at least one active Cas ID bank connection before accessing organization app routes.

**Architecture:** Compute the live `bankingLinked` boolean from the tenant-scoped bank-connection repository and expose it on `/auth/me`. Keep authentication, onboarding, and organization route protection separate: `/onboarding` is a standalone authenticated page, `/bank-connections` remains accessible, and the remaining app routes use an onboarding gate.

**Tech Stack:** NestJS, TypeORM, React, React Router, TanStack Query, Jest, Vitest, Testing Library.

**Spec:** GitHub issue #244 — `feat: require Cas ID/bank linking before dashboard access (onboarding gate)`.

## Global Constraints

- `bankingLinked` is true only when the current organization has at least one `ACTIVE` bank connection.
- Do not add a database column or migration; this is a live read model field.
- Do not enforce onboarding on backend business APIs in this ticket.
- `/onboarding` is standalone; `/bank-connections` is exempt from the onboarding gate.
- Unknown onboarding state fails closed; non-manage roles see a waiting state and refresh every 5 seconds.
- Follow RED → GREEN → REFACTOR and run focused tests after each vertical slice.

### Task 1: Expose the tenant onboarding status

**Files:**
- Modify: `apps/backend/src/modules/bank-connections/application/bank-connection-repository.port.ts`
- Modify: `apps/backend/src/modules/bank-connections/infrastructure/typeorm-bank-connection.repository.ts`
- Modify: `apps/backend/src/modules/auth/application/get-user-profile.usecase.ts`
- Modify: `apps/backend/src/modules/auth/presentation/dto/user-profile-response.dto.ts`
- Modify: `apps/backend/src/modules/auth/auth.module.ts`
- Test: `apps/backend/src/modules/auth/application/get-user-profile.usecase.spec.ts`
- Test: `apps/backend/src/modules/auth/presentation/dto/user-profile-response.dto.spec.ts`

**Interfaces:**
- Consume the existing `BANK_CONNECTION_REPOSITORY` port from `BankConnectionsModule`.
- Produce `bankingLinked: boolean` in the profile use-case result and `/auth/me` response DTO.

- [ ] Write a failing use-case test proving `bankingLinked` is true for an active connection and false otherwise.
- [ ] Run `pnpm --filter @casso-ledger/backend test -- get-user-profile.usecase.spec.ts --runInBand` and confirm the new assertion fails for the missing field/lookup.
- [ ] Add the smallest tenant-scoped repository read method, inject the port into the profile use case, and wire `BankConnectionsModule` into `AuthModule`.
- [ ] Add the response field and mapper assignment.
- [ ] Run the focused use-case and DTO tests and confirm they pass.

### Task 2: Add the route gate

**Files:**
- Modify: `apps/frontend/src/contexts/auth-context.tsx`
- Modify: `apps/frontend/src/routes/protected-route.tsx`
- Modify: `apps/frontend/src/routes/index.tsx`
- Modify: `apps/frontend/src/App.tsx`
- Test: `apps/frontend/src/routes/protected-route.spec.tsx`
- Test: `apps/frontend/src/routes/app-routes.spec.tsx`

**Interfaces:**
- Consume `AuthenticatedUser.bankingLinked` from `/auth/me`.
- Produce an authenticated `OnboardingRoute` that allows `/bank-connections`, redirects other organization routes to `/onboarding` when false, and renders children when true.

- [ ] Write failing route tests for redirecting an unlinked user, allowing a linked user, and exempting `/bank-connections`.
- [ ] Run the focused Vitest files and confirm the new route assertions fail.
- [ ] Implement the minimal route wrapper and add the standalone `/onboarding` route slot without changing existing login/signup redirects.
- [ ] Run the focused frontend route tests and the frontend type-check.

### Task 3: Reuse the Cas ID flow in onboarding

**Files:**
- Create: `apps/frontend/src/features/bank-connections/components/cas-id-connection-flow.tsx`
- Modify: `apps/frontend/src/features/bank-connections/components/connect-dialog.tsx`
- Create: `apps/frontend/src/features/onboarding/pages/onboarding-page.tsx`
- Modify: `apps/frontend/src/routes/index.tsx`
- Test: `apps/frontend/src/features/onboarding/pages/onboarding-page.spec.tsx`

**Interfaces:**
- Consume the existing `useConnectCasId`, `useExchangeCasId`, permission helper, and `refreshUser` callback.
- Produce a reusable Cas ID connection flow; successful exchange refreshes the profile and navigates to `/dashboard`.

- [ ] Write failing onboarding tests for the no-permission waiting state and successful link redirect.
- [ ] Run the onboarding test file and confirm it fails because the page/component does not exist.
- [ ] Extract the dialog body into the reusable flow, render it in the standalone onboarding page, and refresh the profile every 5 seconds while unlinked.
- [ ] Run onboarding tests, route tests, frontend type-check, and frontend lint.

### Task 4: Verify, review, and commit

- [ ] Run the backend focused tests, frontend focused tests, relevant full suites, and `pnpm verify`.
- [ ] Run the repository `domain-check` procedure and resolve any violations.
- [ ] Run `/code-review` against `main`; fix any actionable Standards or Spec findings.
- [ ] Inspect `git diff` and `git status`, then commit with `feat: add onboarding gate for bank linking`.

### Task 5: Connect registration to email verification and onboarding

**Files:**
- Modify: `apps/backend/src/modules/auth/application/verify-email.usecase.ts`
- Modify: `apps/backend/src/modules/auth/application/login.usecase.ts`
- Modify: `apps/backend/src/modules/auth/presentation/auth.controller.ts`
- Modify: `apps/backend/src/modules/auth/application/signup.usecase.ts`
- Test: `apps/backend/src/modules/auth/application/verify-email.usecase.spec.ts`
- Test: `apps/backend/src/modules/auth/application/signup.usecase.spec.ts`
- Modify: `apps/frontend/src/features/auth/pages/signup-page.tsx`
- Modify: `apps/frontend/src/features/auth/pages/verify-email-page.tsx`
- Test: `apps/frontend/src/features/auth/pages/signup-verify.spec.tsx`

**Interfaces:**
- Registration sends the user to a pending verification screen without hydrating an unverified session.
- Email verification marks the user verified transactionally, issues a normal session, and returns `accessToken` while setting the refresh cookie.
- The verification link uses the frontend route `/verify-email?token=...`; successful verification refreshes the profile and navigates to `/onboarding`.

- [x] Write failing backend tests for the frontend verification-link path and verified-session response.
- [x] Run the focused backend tests and confirm the new assertions fail.
- [x] Write failing frontend tests for the post-registration pending state and verified-link navigation to onboarding.
- [x] Run the focused frontend auth tests and confirm the new assertions fail.
- [x] Implement the smallest session handoff by reusing the existing token signer/refresh-token path and preserve `EmailVerifiedGuard`.
- [x] Run focused backend/frontend tests and both type-checks.
