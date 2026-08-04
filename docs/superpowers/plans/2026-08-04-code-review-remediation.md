# Whole-Repo Code Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every actionable finding from the whole-repository review on `fix/repo-code-review` without implementing unrelated open feature plans.

**Architecture:** Keep Clean Architecture boundaries. Shared error mapping, idempotency, and tenant context are cross-cutting infrastructure; Invoice and Organization remain normal domain/application/infrastructure modules. Frontend changes stay local to the existing UI primitives and navigation model.

**Tech Stack:** NestJS 11, TypeORM/Postgres, Jest/Testcontainers, React 19, Vite, Vitest, TypeScript, Biome.

## Global Constraints

- Money remains integer VND and uses TypeORM `bigint`.
- Every money/status write remains inside one DB transaction.
- Every tenant query/write is scoped by `TenantContextService`.
- Domain code imports neither NestJS nor TypeORM.
- No production `any`, no new dependency, no `console.log`, and no response leakage of internal tenant/version fields.
- Tests are written and observed failing before production implementation for each behavior.

### Task 1: Standard error envelope

**Files:**
- Create: `apps/backend/src/common/errors/error-code.ts`
- Create: `apps/backend/src/common/errors/http-exception.filter.ts`
- Modify: `apps/backend/src/configure-app.ts`
- Modify: `apps/backend/src/common/auth/jwt.strategy.ts`
- Modify: `apps/backend/src/common/rbac/permission.guard.ts`
- Test: `apps/backend/src/common/errors/http-exception.filter.spec.ts`

- [ ] Write failing tests for unauthorized, forbidden, validation, and unknown errors mapping to the required `{ statusCode, errorCode, message, details? }` shape.
- [ ] Run the focused Jest test and confirm it fails because the filter does not exist.
- [ ] Implement the enum and global filter; map Nest HTTP exceptions and validation errors without leaking internals.
- [ ] Register the filter and use stable domain error codes/messages at current auth/RBAC throw sites.
- [ ] Run the focused test and the existing auth/RBAC suites.

### Task 2: Tenant-safe saves and database integrity

**Files:**
- Modify: `apps/backend/src/common/tenancy/base.repository.ts`
- Modify: `apps/backend/src/modules/payments/infrastructure/typeorm-payment-allocation.repository.ts`
- Modify: `apps/backend/src/modules/customers/infrastructure/customer.orm-entity.ts`
- Modify: `apps/backend/src/modules/receivables/infrastructure/receivable.orm-entity.ts`
- Modify: `apps/backend/src/modules/payments/infrastructure/payment.orm-entity.ts`
- Modify: `apps/backend/src/modules/payments/infrastructure/payment-allocation.orm-entity.ts`
- Test: `apps/backend/src/common/tenancy/base.repository.spec.ts`
- Test: `apps/backend/src/modules/payments/infrastructure/typeorm-payment-allocation.repository.spec.ts`
- Test: `apps/backend/test/tenant-isolation.integration.spec.ts`

- [ ] Add failing tests for rejecting a mismatched entity tenant and for allocation saves carrying the current tenant.
- [ ] Run them and confirm the current implementation silently overwrites or saves without the tenant guard.
- [ ] Implement the smallest guard and shared scoped-save path.
- [ ] Add TypeORM check constraints for non-negative rollups, upper bounds, and positive allocation amounts; add/adjust real-Postgres assertions.
- [ ] Run focused unit/integration tests.

### Task 3: Organization and Invoice foundation

**Files:**
- Create: `apps/backend/src/modules/organizations/infrastructure/organization.orm-entity.ts`
- Modify: `apps/backend/src/modules/organizations/organizations.module.ts`
- Create: `apps/backend/src/modules/invoices/domain/invoice.ts`
- Create: `apps/backend/src/modules/invoices/application/invoice-repository.port.ts`
- Create: `apps/backend/src/modules/invoices/infrastructure/invoice.orm-entity.ts`
- Create: `apps/backend/src/modules/invoices/infrastructure/typeorm-invoice.repository.ts`
- Create: `apps/backend/src/modules/invoices/invoices.module.ts`
- Modify: `apps/backend/src/app.module.ts`
- Modify: `apps/backend/src/modules/receivables/infrastructure/receivable.orm-entity.ts`
- Test: `apps/backend/src/modules/invoices/domain/invoice.spec.ts`
- Test: `apps/backend/src/modules/invoices/infrastructure/typeorm-invoice.repository.spec.ts`

- [ ] Write failing domain/repository/module tests matching the existing domain-core plan signatures.
- [ ] Run them and confirm the Invoice module/types are absent.
- [ ] Implement only the required Invoice state/data model and tenant-scoped repository.
- [ ] Register Organization and Invoice ORM entities/modules and add tenant-safe relations/constraints that do not implement onboarding.
- [ ] Run domain tests and app type-check.

### Task 4: Idempotency for money/status POSTs

**Files:**
- Create: `apps/backend/src/common/idempotency/idempotency-key.orm-entity.ts`
- Create: `apps/backend/src/common/idempotency/idempotency.repository.ts`
- Create: `apps/backend/src/common/idempotency/idempotency.module.ts`
- Create: `apps/backend/src/common/idempotency/idempotency.service.ts`
- Modify: `apps/backend/src/modules/receivables/presentation/receivables.controller.ts`
- Modify: `apps/backend/src/modules/payments/presentation/payments.controller.ts`
- Modify: `apps/backend/src/app.module.ts`
- Test: `apps/backend/src/common/idempotency/idempotency.service.spec.ts`
- Test: `apps/backend/test/idempotency.e2e-spec.ts`

- [ ] Write failing tests proving a repeated `(organizationId, endpoint, key)` returns the first response and does not repeat the write.
- [ ] Run focused tests and observe the duplicate write.
- [ ] Implement a transaction-local claim/finalize service and wrap the four current write endpoints, preserving existing response bodies.
- [ ] Add conflict handling when the same key is reused with a different request payload.
- [ ] Run focused integration tests against Postgres.

### Task 5: Organization selection from request header

**Files:**
- Modify: `apps/backend/src/common/auth/jwt.strategy.ts`
- Modify: `apps/backend/src/common/auth/tenant-context.interceptor.ts`
- Modify: `apps/backend/src/common/auth/authenticated-user.ts`
- Test: `apps/backend/src/common/auth/jwt.strategy.spec.ts`
- Test: `apps/backend/test/jwt-auth.e2e-spec.ts`

- [ ] Write failing tests for a valid `X-Organization-Id` membership and a rejected cross-tenant header.
- [ ] Run them and confirm the strategy only uses the JWT organization.
- [ ] Implement request organization resolution while preserving JWT membership revalidation and default-token behavior.
- [ ] Run auth integration tests.

### Task 6: Frontend Sheet and plan access

**Files:**
- Modify: `apps/frontend/src/components/ui/sheet.tsx`
- Modify: `apps/frontend/src/components/layout/mobile-sidebar.tsx`
- Modify: `apps/frontend/src/lib/plan-access.ts`
- Modify: `apps/frontend/src/components/layout/nav-items.ts`
- Test: `apps/frontend/src/components/ui/sheet.test.tsx`
- Test: `apps/frontend/src/lib/plan-access.test.ts`

- [ ] Write failing tests for trigger/open/close behavior and the four canonical plan names.
- [ ] Run Vitest and confirm the current Sheet does not change state/render conditionally.
- [ ] Implement a minimal controlled/uncontrolled Sheet with trigger, overlay, content, and close behavior; derive nav lock from `minPlan`.
- [ ] Run focused frontend tests and type-check.

### Task 7: Full verification and handoff

**Files:**
- Modify: `docs/wayfinder/feature-map.md` only if the remediation status/frontier changed.

- [ ] Run `pnpm lint`.
- [ ] Run `pnpm type-check`.
- [ ] Run `pnpm test` and backend e2e/integration tests with Postgres available.
- [ ] Run `pnpm build`.
- [ ] Inspect `git diff`, confirm no secrets or unrelated open-plan features were added, and report any environment-blocked checks honestly.
- [ ] Commit the implementation with `fix: remediate whole-repo code review findings`.
