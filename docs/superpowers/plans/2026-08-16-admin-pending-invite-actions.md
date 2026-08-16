# Admin Pending Invite Actions Implementation Plan

> For agentic workers: use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

Goal: Let cross-organization Operators resend or revoke unaccepted membership invitations from the Admin organization-members view.

Architecture: Add Operator-specific use cases and Admin endpoints. They receive explicit organizationId values and never use TenantContextService or tenant PermissionGuard. Resend replaces the invitation and writes its audit row in one transaction, then queues the email after commit. Reuse the existing Admin page and shared idempotency service.

Tech Stack: NestJS, TypeORM/PostgreSQL, Jest/Testcontainers, React, TanStack Query, Vitest, BullMQ.

Spec: Issue #189 and the resolved domain rules in CONTEXT.md.

## Global Constraints

- Pending means acceptedAt is null; expired pending invites remain actionable; accepted invites return CONFLICT.
- Every invite read/write is scoped by organizationId.
- Admin routes use AdminAuthGuard only.
- Resend/revoke lock the invite row and write the invite change plus OperatorAuditLog in one transaction.
- Resend creates a fresh invite/token with a seven-day expiry and invalidates the old invite.
- Queue jobs are enqueued after commit. Synchronous enqueue failure maps to EMAIL_SEND_FAILED; later provider failure is asynchronous under ADR-0009.
- Admin writes require Idempotency-Key and call IdempotencyService.executeForOrganization(...).
- No new package, UI library, notification system, unsafe production casts, or production any.
- Use RED → GREEN → REFACTOR and add Swagger decorators for every new endpoint.

---

### Task 1: Shared idempotency and audit model

Files:
- Modify apps/backend/src/common/idempotency/idempotency.service.ts
- Modify apps/backend/src/common/idempotency/idempotency.service.spec.ts
- Modify apps/backend/src/modules/admin/domain/operator-audit-log.ts
- Modify apps/backend/src/modules/admin/infrastructure/operator-audit-log.orm-entity.ts
- Modify apps/backend/src/modules/admin/infrastructure/typeorm-operator-audit-log.repository.ts and its spec
- Create apps/backend/src/database/migrations/20260823020000-add-operator-audit-logs-invite-id.ts

Interface:
Add executeForOrganization<T>(organizationId, endpoint, key, input, operation): Promise<T>. Keep execute() unchanged for tenant callers by delegating to the same organization-scoped implementation. Add OperatorActionType values INVITE_RESENT and INVITE_REVOKED plus nullable inviteId on the domain object, ORM row, mapper, and migration.

- [ ] Write a failing idempotency test proving executeForOrganization uses the explicit org without reading TenantContextService.
- [ ] Write a failing repository test proving inviteId maps and membershipId remains nullable.
- [ ] Run: pnpm --filter @casso-ledger/backend exec jest src/common/idempotency/idempotency.service.spec.ts src/modules/admin/infrastructure/typeorm-operator-audit-log.repository.spec.ts --runInBand
- [ ] Implement the shared method and reversible migration.
- [ ] Rerun focused tests; commit feat: support operator invite audit idempotency.

### Task 2: Locked invite repository lookup and Operator revoke

Files:
- Modify apps/backend/src/modules/auth/application/membership-invite-repository.port.ts
- Modify apps/backend/src/modules/auth/infrastructure/typeorm-membership-invite.repository.ts and its spec
- Create apps/backend/src/modules/admin/application/revoke-invite-by-operator.usecase.ts and its spec
- Modify apps/backend/src/modules/admin/admin.module.ts

Interface:
Add findByIdForUpdate(id, organizationId, manager): Promise<MembershipInvite | null>. Produce RevokeInviteByOperatorUseCase.execute({ organizationId, inviteId, operatorId }): Promise<void>.

- [ ] Write failing tests for successful delete plus INVITE_REVOKED audit in the same transaction; missing invite → NOT_FOUND; accepted invite → CONFLICT; repository organization predicates plus pessimistic_write lock.
- [ ] Run: pnpm --filter @casso-ledger/backend exec jest src/modules/admin/application/revoke-invite-by-operator.usecase.spec.ts src/modules/auth/infrastructure/typeorm-membership-invite.repository.spec.ts --runInBand
- [ ] Implement the transaction, Vietnamese AppError messages, fresh audit UUID, and provider registration.
- [ ] Rerun focused tests; commit feat: add operator invite revoke use case.

### Task 3: Operator resend use case

Files:
- Create apps/backend/src/modules/admin/application/resend-invite-by-operator.usecase.ts and its spec
- Modify apps/backend/src/modules/admin/admin.module.ts

Interface:
Produce ResendInviteByOperatorUseCase.execute({ organizationId, inviteId, operatorId }): Promise<void>. Consume the locked invite lookup, organization repository, AUTH_EMAIL_SENDER, audit repository, and DataSource.

- [ ] Write failing tests for expired pending invite replacement; preserved email/role/inviter; old deletion plus new save plus INVITE_RESENT audit in one manager; missing/accepted errors; queue enqueue failure mapping to EMAIL_SEND_FAILED after commit.
- [ ] Run: pnpm --filter @casso-ledger/backend exec jest src/modules/admin/application/resend-invite-by-operator.usecase.spec.ts --runInBand
- [ ] Implement with generateToken(), a fresh randomUUID(), seven-day expiry, acceptedAt null, and email enqueue only after the transaction resolves. Keep the tenant resend use case unchanged.
- [ ] Rerun focused tests; commit feat: add operator invite resend use case.

### Task 4: Admin controller endpoints

Files:
- Modify apps/backend/src/modules/admin/presentation/admin.controller.ts
- Modify apps/backend/src/modules/admin/presentation/admin.controller.spec.ts

Endpoints:
- DELETE /api/v1/admin/organizations/:orgId/invites/:inviteId → 204
- POST /api/v1/admin/organizations/:orgId/invites/:inviteId/resend → 200 and { success: true }

- [ ] Write failing controller tests asserting explicit orgId, inviteId, operatorId, endpoint-specific idempotency keys, and response values.
- [ ] Run: pnpm --filter @casso-ledger/backend exec jest src/modules/admin/presentation/admin.controller.spec.ts --runInBand
- [ ] Inject IdempotencyService and both use cases. Use executeForOrganization(), ParseUUIDPipe, HttpCode, ApiOperation, response decorators, and ApiErrorResponse for validation/auth/forbidden/not-found/conflict/idempotency/email errors.
- [ ] Rerun controller tests and pnpm --filter @casso-ledger/backend arch-check; commit feat: expose admin invite actions.

### Task 5: Admin pending-invite UI

Files:
- Modify apps/frontend/src/features/admin/api/admin-api.ts
- Create apps/frontend/src/features/admin/api/admin-api.spec.ts
- Modify apps/frontend/src/features/admin/api/use-admin.ts
- Modify apps/frontend/src/features/admin/pages/admin-organization-members-page.tsx
- Modify apps/frontend/src/features/admin/pages/admin-organization-members-page.spec.tsx

Interface:
Add resendOrganizationInvite(organizationId, inviteId) and revokeOrganizationInvite(organizationId, inviteId). Add mutations that send crypto.randomUUID() as Idempotency-Key, invalidate the existing admin member-list query, and use existing toast behavior.

- [ ] Create failing API tests for URL, HTTP method, and header; write page tests for action buttons, revoke confirmation, per-row disable, refresh, and failure feedback.
- [ ] Run: pnpm --filter @casso-ledger/frontend exec vitest run src/features/admin/api/admin-api.spec.ts src/features/admin/pages/admin-organization-members-page.spec.tsx
- [ ] Add an action column to the pending-invites table with Gửi lại and Thu hồi. Reuse Button and AlertDialog; track only the active invite row.
- [ ] Rerun focused tests, then type-check and lint.
- [ ] Commit feat: add admin pending invite actions.

### Task 6: E2E coverage, tracker, and final verification

Files:
- Modify apps/backend/test/admin.e2e-spec.ts
- Modify docs/wayfinder/feature-map.md

- [ ] Add failing e2e coverage with separate expired and OWNER pending invites. Assert resend creates a fresh invite and one audit row; repeating the same idempotency key does not duplicate it. Assert revoke removes the invite, writes INVITE_REVOKED, and safely repeats. Assert unauthenticated calls return 401 and accepted invites return 409.
- [ ] Run: pnpm --filter @casso-ledger/backend exec jest --config ./test/jest-e2e.json test/admin.e2e-spec.ts --runInBand
- [ ] Implement only required fixtures and update #189 to in-progress in feature-map.md. Do not mark it done before merge.
- [ ] Run focused backend/frontend suites, the Admin e2e suite, pnpm verify, npx tsc --noEmit, and the .claude/skills/domain-check.md procedure.
- [ ] Inspect git diff main...HEAD --check and git status --short; confirm no .env is staged and only issue #189 files changed.
- [ ] Commit test: cover admin pending invite actions.
