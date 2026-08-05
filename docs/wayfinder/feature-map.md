# Wayfinder Map — Casso Ledger AR Automation

**Tracker**: GitHub Issues
**Charted**: 2026-08-04
**Map mode**: chart — Plan #1, #2, #3, #4, #18 complete, Plan #5+ pending

---

## Destination

A priority-ordered backlog of every feature Lane A–D must ship to land the full AR Automation platform. Each ticket sized to one implementation session. Map is "done" when no ticket remains open and every shipped feature is reflected here.

Success = a single document a new developer can read and know exactly what to pick up next, what blocks it, and which spec it implements.

## Notes

**Source-of-truth synthesis:**
- `docs/superpowers/plans/` — 26 detailed implementation plans
- `docs/superpowers/specs/` — 22 design specs
- `docs/adr/` — Architecture Decision Records

**Standing preferences:**
- Read this map once per session before picking a ticket
- Cite ADRs from `docs/adr/` for architectural decisions
- Cite specs from `docs/superpowers/specs/` for feature work
- Owner: `BE` (backend NestJS) or `FE` (frontend React)
- Type labels: `task`, `research`, `prototype`, `grilling`
- Status: `open` | `in-progress` | `blocked` | `done` | `superseded`
- Blockers list plans that must complete first

**Business rules (enforce on every ticket):**
1. Money: integer VND, NEVER float/decimal
2. Transactions: write money/status trong 1 DB transaction
3. Tenant isolation: scope every query/write to `organizationId`
4. Derived fields: calculate at query time, NEVER store
5. `paidAmount`/`allocatedAmount` are persisted rollups, updated only in a locked transaction
6. `domain/` does not import NestJS/TypeORM

**Key cross-plan contracts:**
- `AllocatePaymentUseCase.allocateWithinTransaction(manager, input)` — Plan 1 → Plans 8, 13
- `TenantContextService` (AsyncLocalStorage) — Plan 2 → All backend plans
- `BaseRepository` (auto-scope) — Plan 2 → All repositories
- `@Audited(actionType, entityType)` — Plan 13 → Plans 1, 8, 13
- `EventEmitter2` events — Plans 9, 10 → Plans 10, 11, 12
- `EmailService.sendReminderEmail` — Plan 7 → Plans 12, 16
- `reminder.scan.completed` event — Plan 12 → Plan 11
- `ReceivableStatus` enum — `packages/shared-types` → All plans
- `Permission` enum + `ROLE_PERMISSIONS` — Plan 2 → All RBAC endpoints
- Read API response shapes — Plan 17 → Plans 18-21 (FE)

## Decisions so far

- **2026-08-04**: Plan #1 complete — PR #1 merged, 21 commits
- **2026-08-04**: Tech stack: NestJS 11, TypeORM 1.1, TypeScript 6.0, Biome 2.5, React 19, Vite 8
- **2026-08-04**: TenantContextService uses AsyncLocalStorage (request-scoped)
- **2026-08-04**: Domain entities: Customer/Invoice as interfaces, Receivable/Payment as classes with behavior
- **2026-08-04**: PaymentAllocation uses `implements PaymentAllocationData` pattern
- **2026-08-04**: AuditLog uses enums (AuditActionType, AuditEntityType) — only used values
- **2026-08-05**: PR #6 merged — whole-repo code-review remediation is shipped: standardized error envelope, tenant-scoped writes, rollup checks, persisted idempotency keys, `X-Organization-Id` membership selection, Invoice module, frontend plan gating, and Radix-based Sheet. Organization persistence/FK wiring remains deferred; idempotency is not yet atomic with the business transaction.
- **2026-08-05**: Plan #3 shipped (branch `feat/billing-usage-metering`, PR #8, awaiting review) — `receivablesThisMonth` gate only. `activeBankConnections` gate deliberately deferred to Plan #5 (no `BankConnection` table to count yet). No signup/bootstrap transaction exists yet (Plan #4), so `PlanLimitService` lazily creates a FREE `Subscription` per organization on first use instead of at signup; billing period is a lazily-rolled current calendar month (no renewal cron). A `/code-review` pass found and fixed a real race condition (advisory lock replaces a row lock that couldn't cover first-time Subscription creation) and a dead `status` field; a `ponytail-review` pass then deleted 3 unused plan-limit catalog entries and merged two always-paired repository calls into one.
- **2026-08-05**: Application Layer Boundary Enforcement shipped — `AppError`/`ITokenSigner` replace `HttpException`/`JwtService` leaks in 9 use case files across auth/billing/receivables; `.claude/rules/application.md` added; `api.md`'s unconditional `@RequirePermission()` rule corrected (was wrong for pre-auth endpoints); `arch-check` (dependency-cruiser + Node script) wired into `pnpm verify`. Domain/infrastructure/presentation audited clean, no code changes there.

## Not yet specified

- Cas ID OAuth flow details (grant → link → publicToken → accessToken)
- Resend email provider configuration
- Copilot AI model selection (Claude via @anthropic-ai/sdk per spec)
- Frontend design tokens (oklch colors, "Be Vietnam Pro" font)

## Out of scope

- Microservices architecture (modular monolith for MVP)
- Kubernetes production-grade deployment
- Multi-currency support
- SSO/OAuth social login
- ML-based cash flow forecasting (rule-based naive forecast only)

---

## Ticket Index

**26 plans** | status snapshot (2026-08-05):
- 🟢 done (5): Plan #1, Plan #2, Plan #3, Plan #4, Plan #18
- 🔴 open/not started (21): Plan #5–#17, #19–#23 + 3 additional plans

---

### LANE A — Foundation (Plans 1–6)

---

#### Plan #1 — Project Scaffolding + Domain Core
- **Type**: task
- **Status**: done ✅
- **Owner**: BE
- **Spec**: `specs/2026-08-03-project-scaffolding-architecture-design.md`
- **Plan**: `plans/2026-08-03-project-scaffolding-and-domain-core.md`
- **Blockers**: none
- **Shipped**: 2026-08-04 — PR #1 merged, 21 commits
- **Created**: Monorepo (pnpm + Turborepo + Biome), NestJS backend, 5 domain modules (Customer, Invoice, Receivable, Payment, PaymentAllocation), state machines, use cases (AllocatePayment, UndoPaymentAllocation), controllers, TypeORM config, Docker Compose, integration test, agent docs

---

#### Plan #2 — Multi-tenancy + RBAC
- **Type**: task
- **Status**: done ✅
- **Owner**: BE
- **Spec**: `specs/2026-08-03-multi-tenancy-rbac-design.md`
- **Plan**: `plans/2026-08-03-multi-tenancy-rbac.md`
- **Blockers**: Plan #1 ✅
- **Shipped**: 2026-08-04 — branch `feat/multi-tenancy-rbac`, 25 commits (9 tasks + final-review fix wave + real-e2e fix wave + code-review fix wave + ponytail-review fix wave)
- **Key entities**: `Membership`, `Role` (OWNER/FINANCE_MANAGER/ACCOUNTANT/SALES_REP/VIEWER), `Permission` (14 permissions). No standalone `Organization` entity — nothing in this branch reads/writes one yet (deleted during the ponytail-review pass; `organizationId` lives as a plain column on every business table per the spec's shared-schema model)
- **Key rules**:
  - 5 static roles, 14 permissions, hardcoded `ROLE_PERMISSIONS` map (no DB tables)
  - `BaseRepository` auto-adds `WHERE organizationId` from `TenantContextService` (AsyncLocalStorage); `scopedSaveWithManager` covers both transactional and non-transactional writes in one method
  - `JwtAuthGuard` (global) + `JwtStrategy` re-validates active Membership from DB, JWT `role` claim is not trusted
  - `TenantContextInterceptor` (global) propagates the authenticated user through AsyncLocalStorage for the whole request lifecycle, including deferred/async handler execution
  - `CreateReceivableUseCase` rejects a `customerId` belonging to another organization (tenant-scoped `findById` returns null for cross-tenant references)
  - Deleted pre-existing insecure `TenantMiddleware` (derived tenant context from unauthenticated request headers)
- **Created**: `organizations/` module (Membership domain+infra only), `common/tenancy/` (TenantContextService, BaseRepository, TenantContextInterceptor, TenancyModule), `common/auth/` (JwtStrategy, JwtAuthGuard, Public decorator — reserved for Plans #4/#8/#23's health/webhook/auth routes, not yet consumed), `common/rbac/` (Permission enum, ROLE_PERMISSIONS map, RequirePermission decorator, PermissionGuard), migrated Customer/Receivable/Payment repositories to `BaseRepository`, `WriteOffReceivableUseCase` + endpoint, `tenant-isolation.integration.spec.ts`, `organizationId` indexes on Customer/Receivable/Payment/PaymentAllocation
- **Note**: the original Plan #2 branch did not contain `invoices/` or idempotency infrastructure. PR #6 subsequently added the minimal Invoice module and persisted idempotency-key service. Organization remains a shared-schema `organizationId` column without a standalone Organization entity/FK until onboarding provides the required bootstrap transaction. Final whole-branch review (Opus) caught 3 Critical defects invisible to static verification — an `AsyncLocalStorage` propagation bug that would have 500'd every business request, an incomplete `import type`/NestJS-DI sweep that would have failed app boot, and a money-mutating endpoint with no permission check — all fixed and re-reviewed clean. Docker was then made available and the real e2e/integration suite was run for the first time in this branch's history, surfacing 6 more real bugs invisible to any static check (every write endpoint was silently receiving `undefined` request bodies due to more `import type`-erased DTOs; a static-at-import-time TypeORM config that never saw testcontainers' dynamic DB host/port; 4 ORM entities with nullable columns TypeORM couldn't type-infer; plus e2e fixture bugs) — all fixed. A `/code-review` pass (Standards + Spec axes) then caught a real cross-tenant gap (Receivable creation didn't verify `customerId` belonged to the caller's org) and a missing `organizationId` index — both fixed. A `ponytail-review` pass then deleted the unused Organization repository/entity/domain class, collapsed 3x duplicated manager-branch save logic into one `BaseRepository` method, dropped a redundant guard, replaced the hand-rolled Sheet with Radix Dialog, and removed no-op test assertions. All 3 e2e/integration suites (6 tests) pass against a real Postgres container, alongside the 15-suite/35-test unit suite, 3 frontend test files/4 tests, and clean type-check/build verification.

---

#### Plan #3 — Billing + Usage Metering
- **Type**: task
- **Status**: done ✅
- **Owner**: BE
- **Spec**: `specs/2026-08-03-billing-usage-metering-design.md`
- **Blockers**: Plan #1 ✅, Plan #2 ✅
- **Shipped**: 2026-08-05 — branch `feat/billing-usage-metering`, PR #8 (includes a `/code-review` fix wave + a `ponytail-review` fix wave)
- **Key entities**: `Subscription` (FREE/STARTER/BUSINESS/ENTERPRISE, ACTIVE/PAST_DUE/CANCELLED) — `PlanId`/`SubscriptionStatus` added to `packages/shared-types` following the `ReceivableStatus` pattern
- **Key rules**:
  - `receivablesThisMonth` gate shipped and wired into `POST /receivables`; count via raw SQL against the `receivables` table (no usage tracking table), per spec
  - Lock via `pg_advisory_xact_lock(hashtext(organizationId))` (spec's explicit alternative to `SELECT ... FOR UPDATE`) acquired before reading the `Subscription`, inside the same `DataSource.transaction()` as the receivable insert — `SubscriptionRepository.lockAndFindByOrganizationId`. A row-level `FOR UPDATE` lock was tried first and replaced: it can only lock a row that already exists, so two concurrent first-ever requests for a brand-new org both saw no row and raced to create one, tripping the `@Unique(['organizationId'])` constraint — caught by `/code-review`'s Spec axis
  - `PlanLimitService` also checks `Subscription.status`: PAST_DUE/CANCELLED blocks with 402 before usage is even counted — the field was persisted but unread until the same review pass
  - No signup/bootstrap transaction exists yet (Plan #4 not shipped), so `PlanLimitService` lazily creates a FREE `Subscription` on first use per organization instead — replace with true bootstrap-transaction creation once Plan #4 ships (would then also need to guarantee "no active org lacks a subscription" up front)
  - Billing period is a rolling current-calendar-month, recalculated lazily on each check (no renewal cron exists — one of the spec's own open questions, calendar-month was chosen)
  - `activeBankConnections` gate and the `bank-connections` exchange 402 are **not implemented** — `BankConnection`/`bank-connections` module doesn't exist yet (Plan #5). `Subscription.bankConnectionLimit` is on the entity per spec, ready for Plan #5 to wire a matching gate when that module lands
  - Plan-limit catalog trimmed to FREE only (`FREE_PLAN_LIMITS`) after `ponytail-review` flagged the STARTER/BUSINESS/ENTERPRISE entries as unread dead data (no upgrade/downgrade path exists yet) — reintroduce a real catalog only when one does
- **Creates**: `billing/` module (`domain/subscription.ts`, `application/plan-limit.service.ts` + port, `infrastructure/` TypeORM entity+repo), `CreateReceivableUseCase` now runs inside a `DataSource.transaction()` with the plan-limit check, `test/billing-quota.e2e-spec.ts` (2 tests, run against a real Postgres testcontainer, both pass)
- **Note**: Docker became available mid-branch, giving this codebase its first real e2e run since PR #6. It surfaced 4 pre-existing NestJS DI erasure bugs (`import type` on an undecorated constructor param resolves to `Function` at runtime) that silently blocked every e2e test booting `AppModule` — `IdempotencyService`'s own constructor, `TypeOrmInvoiceRepository`'s `TenantContextService` param, and `IdempotencyService` as injected into both `PaymentsController` and `ReceivablesController`. Fixed to match the codebase's established `biome-ignore lint/style/useImportType` + value-import pattern. Also surfaced, left as-is (pre-existing, out of scope): `payment-allocation.e2e-spec.ts` and `tenant-isolation.integration.spec.ts` don't send an `Idempotency-Key` header on their POST requests, so they now fail 409 instead of their expected 2xx/404 — worth a follow-up ticket

---

#### Plan #4 — Authentication + Onboarding
- **Type**: task
- **Status**: done
- **Owner**: BE
- **Spec**: `specs/2026-08-03-authentication-onboarding-design.md`
- **Blockers**: Plan #1 ✅, Plan #2 ✅, Plan #3 ✅
- **Key entities**: `User`, `EmailVerificationToken`, `PasswordResetToken`, `MembershipInvite`, `RefreshToken`
- **Key rules**:
  - Bootstrap transaction: Organization + User + Membership(OWNER) + Subscription(FREE)
  - `IOrganizationBootstrap` is a no-op seam in this plan; Plans #6/#12 rebind it to seed default email templates/reminder rules without changing signup
- **Shipped**: 2026-08-05 — PR #11
  - Tokens stored as SHA-256 hash (never plaintext)
  - Access token 15min, refresh token 7day httpOnly cookie
  - Rate limit 5/min per (IP, email) — not per-IP-only
  - Forgot-password always returns 200 (prevent enumeration)
  - Reset revokes all refresh tokens
- **Creates**: `users/` module, `auth/` module (4 token entities + 8 use cases + controller), `EmailVerifiedGuard`
- **Review follow-up** (same PR, commit `f27034f`): `switch-organization` now validates `organizationId` via a `class-validator` DTO instead of a raw unchecked body field; `EmailVerifiedGuard` moved into `presentation/` to match layering convention. Two findings raised against the generic AGENTS.md "access token in httpOnly cookie" / "rate-limit all auth endpoints" lines were checked against the actual spec and the already-shipped `JwtStrategy` (Plan #2) and left as-is — spec section 3/6 and shipped code both use Bearer-token-in-body + cookie-only-for-refresh, and rate limiting scoped to login/signup/forgot-password only.
- **Ponytail-review follow-up** (same PR, commit `97d8a2f`): deleted `AuthError` (duplicated `HttpException`'s existing errorCode/message envelope handling) — all auth use cases now throw `HttpException` directly, matching the pre-existing `plan-limit.service.ts` convention (net line count unchanged: HttpException's call-site shape is more verbose than AuthError's, offsetting the savings elsewhere); removed `auth.module.ts`'s unused `exports` array; collapsed repeated field-by-field constructors into `Object.assign(this, props)` across the 4 auth token entities + `User`; extracted `REFRESH_TOKEN_TTL_MS` into one shared constant (was redefined identically in 3 places). Note: using `HttpException` (an HTTP/transport concern) directly in the `application/` layer is a pragmatic consistency choice, not strict Clean Architecture — a proper fix would need a framework-agnostic error taxonomy shared with `plan-limit.service.ts`; deferred to a separate whole-codebase PR per user decision.

---

#### Plan #5 — Cas ID Bank Connection
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `specs/2026-08-03-cas-id-bank-connection-design.md`
- **Blockers**: Plan #2 ✅, Plan #3 ✅, Plan #4 ✅
- **Key entities**: `CasIdConnectionSession`, `BankConnection` (ACTIVE/REQUIRES_REAUTHORIZATION/DISCONNECTED), `ConnectionAuditEvent`
- **Key rules**:
  - Redirect-based flow: grant token → Cas Link → publicToken → accessToken exchange
  - AES-256-GCM encryption for stored access tokens
  - Lazy revocation detection (401/403 → REQUIRES_REAUTHORIZATION)
  - Re-auth reactivates existing row (not create new)
  - `MockCasIdAdapter` for MVP
- **Creates**: `bank-connections/` module, token encryption utility, initiate/exchange/disconnect use cases, controller

---

#### Plan #6 — Email Template Management
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `specs/2026-08-03-email-template-management-design.md`
- **Blockers**: Plan #2 ✅, Plan #3 ✅, Plan #4 ✅
- **Key entities**: `EmailTemplate` (isDefault, reminderStage, bodyHtml)
- **Key rules**:
  - 4 default templates seeded per organization in bootstrap
  - `isDefault` templates editable but NOT deletable
  - Delete blocked if referenced by reminder rule
  - Handlebars auto-escapes XSS
  - Fixed 7 render variables
  - Preview endpoint returns `{ subject, bodyHtml }`
- **Creates**: `email-templates/` module, render/create/list/update/delete/preview use cases, controller

---

### LANE B — Features (Plans 7–16)

---

#### Plan #7 — Email Notification Service
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `specs/2026-08-03-email-notification-service-design.md`
- **Blockers**: Plan #4, Plan #6
- **Key entities**: None (orchestration only)
- **Key rules**:
  - `IEmailProviderAdapter` port with `ResendEmailAdapter`
  - Never call provider synchronously — always via BullMQ queue
  - 3 retries with exponential backoff
  - `SENT` status only after provider confirms (has `providerMessageId`)
  - `FAILED` after final attempt
  - Rebinds `AUTH_EMAIL_SENDER` to real Resend adapter
- **Creates**: `notifications/` module, `ResendEmailAdapter`, `ResendAuthEmailSenderAdapter`, `EmailQueueProcessor`, integration test

---

#### Plan #8 — Webhook Ingestion + Matching Engine
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `specs/2026-08-03-webhook-matching-engine-design.md`
- **Blockers**: Plan #1 ✅, Plan #2, Plan #5
- **Key entities**: `WebhookInbox`, `BankTransaction`, `MatchingCandidate`, `CustomerBankAccount`
- **Key rules**:
  - `providerTransactionId` unique constraint = idempotency
  - Constant-time header auth (client ID + secret key)
  - `amount < 0` never scored (refunds)
  - 5-component scoring: referenceCodeScore(0-60) + amountScore(0-20) + customerBankAccountScore(0-10) + payerNameScore(0-5) + timingScore(0-5)
  - Thresholds: ≥90 auto-allocate, 60-89 Exception Queue, <60 UNMATCHED
  - Money stays integer throughout
- **Creates**: `webhooks/` module (3 entities + scoring functions + normalizer + processor), `bank-accounts/` module (stub), BullMQ setup, integration tests

---

#### Plan #9 — Dispute Management
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `specs/2026-08-03-dispute-management-design.md`
- **Blockers**: Plan #1 ✅, Plan #2
- **Key entities**: `Dispute` (OPEN/RESOLVED)
- **Key rules**:
  - Opening dispute does NOT change `Receivable.status`
  - Max 1 OPEN dispute per receivable at a time
  - `isDisputed` = `EXISTS(Dispute WHERE status='OPEN')` — computed, never stored
  - Domain events: `dispute.opened`, `dispute.resolved` (emitted after save)
- **Creates**: `disputes/` module, `GetReceivableUseCase` (attaches `isDisputed`), `EventEmitterModule.forRoot()`, integration test

---

#### Plan #10 — Collection Activity Timeline
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `specs/2026-08-03-collection-activity-timeline-design.md`
- **Blockers**: Plan #1 ✅, Plan #7, Plan #9
- **Key entities**: `CollectionActivity` (10 activity types, INSERT-only)
- **Key rules**:
  - Never the source of truth — status lives in `ReminderExecution`/`PaymentAllocation`/`Dispute`/`Receivable`
  - Only INSERT, no update/delete
  - Single `CollectionActivityListener` subscribing to 6 events
  - Listener wraps tenant context for background events
- **Creates**: `collection-activity/` module, listener (6 events), `RecordManualActivityUseCase`, modifies `AllocatePaymentUseCase` to emit events

---

#### Plan #11 — Internal Task + Escalation
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `specs/2026-08-03-internal-task-escalation-design.md`
- **Blockers**: Plan #1 ✅, Plan #2
- **Key entities**: `InternalTask` (ESCALATION/MANUAL, OPEN/DONE/DISMISSED)
- **Key rules**:
  - Escalation threshold 30 days overdue (hardcoded MVP)
  - `receivable.status-closed` = broad terminal event (auto-dismiss)
  - `receivable.closed` = PAID-only
  - Assigned to first FINANCE_MANAGER
  - CRUD endpoints for manual tasks
- **Creates**: `internal-tasks/` module, `RunEscalationScanUseCase`, listeners, controller (4 endpoints)

---

#### Plan #12 — Reminder Automation
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `specs/2026-08-03-reminder-automation-design.md`
- **Blockers**: Plan #1 ✅, Plan #2, Plan #6, Plan #7
- **Key entities**: `ReminderPolicy`, `ReminderRule`, `ReminderExecution`, `CustomerGroup` (VIP/REGULAR)
- **Key rules**:
  - Policy unique by `(organizationId, customerGroup)`
  - Rule uses `offsetDays` (negative=before, positive=after dueDate)
  - Rate limiting via latest SENT execution (`minIntervalDays`)
  - Daily BullMQ scan emits `reminder.scan.completed`
  - Fresh-state worker re-checks before sending
  - Timezone: `Asia/Ho_Chi_Minh` (not server time)
  - `PENDING→SENT/FAILED` lifecycle, immutable `ReminderExecution`
- **Creates**: `reminders/` module (3 entities + scheduler + sender + processors), CRUD endpoints, integration tests

---

#### Plan #13 — Exception Queue + Audit Log
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `specs/2026-08-03-exception-queue-audit-log-design.md`
- **Blockers**: Plan #1 ✅, Plan #2, Plan #8
- **Key entities**: `AuditLog` (INSERT-only), `BankTransaction` extended with `IGNORED` status
- **Key rules**:
  - `match` uses `BankTransaction.version` optimistic lock + `AllocatePaymentUseCase`
  - `skip`/`mark-prepaid` don't need version (idempotent)
  - Audit payload sanitized (denylist for sensitive fields)
  - `@Audited()` decorator = fire-and-forget (global interceptor)
  - Response: `/bank-transactions/unmatched`, `/bank-transactions/pending-review-count`
- **Creates**: `common/audit/` module (@Global), `exception-queue/` module (match/skip/mark-prepaid use cases + controller), integration tests

---

#### Plan #14 — Invoice Import
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `specs/2026-08-03-invoice-import-design.md`
- **Blockers**: Plan #1 ✅, Plan #2, Plan #3
- **Key entities**: Reuses existing `Customer`, `Invoice`, `Receivable`
- **Key rules**:
  - Multipart Excel/CSV upload
  - Row numbering 1-based (header=row 1)
  - Per-row transaction (valid rows succeed, invalid reported)
  - Customer resolved by taxCode→email then auto-created
  - `InvoiceRowParser` is pure function
  - Response: `{ totalRows, successCount, failedRows: [{ rowNumber, data, errors }] }`
- **Creates**: `invoice-import/` module, file parser, row validator, controller, integration test

---

#### Plan #15 — Aging Dashboard + Reporting
- **Type**: task
- **Status**: open
- **Owner**: BE + FE
- **Spec**: `specs/2026-08-03-aging-dashboard-reporting-design.md`
- **Blockers**: Plan #1 ✅, Plan #2, Plan #8, Plan #13
- **Key entities**: None (read-only queries)
- **Key rules**:
  - 5 canonical aging buckets: `NOT_DUE`, `OVERDUE_1_7`, `OVERDUE_8_30`, `OVERDUE_31_60`, `OVERDUE_60_PLUS`
  - Real-time raw SQL, no precompute/materialized view
  - Composite index: `receivables(organizationId, status, dueDate)`
  - `Permission.REPORT_READ`
- **Creates**: `reporting/` module (2 query services + controller), composite index

---

#### Plan #16 — Collection Copilot
- **Type**: task
- **Status**: open
- **Owner**: BE + FE
- **Spec**: `specs/2026-08-03-collection-copilot-design.md`
- **Blockers**: Plan #2, Plan #6, Plan #7, Plan #10, Plan #12
- **Key entities**: `CopilotConversation`, `CopilotMessage`, `CopilotPendingAction`, `CopilotDraft`, `AIUsageLog`
- **Key rules**:
  - Chat-based AI (Claude via `@anthropic-ai/sdk`)
  - 5 tools max (hardcoded whitelist): `getReceivableSummary`, `getCollectionActivityTimeline`, `getPaymentHistory`, `draftReminderEmail`, `sendReminderEmail`
  - `sendReminderEmail` intercepted into pending action (never executes in model turn)
  - Confirm/cancel endpoints: `POST /copilot/actions/:id/confirm|cancel`
  - 15s timeout + 1 retry
  - `CopilotPendingAction` expires 10min
  - `Permission.REMINDER_SEND_MANUAL` gates write
  - Never expose credentials in prompts
- **Creates**: `copilot/` module (5 entities + tool registry + chat/confirm/cancel use cases + controller)

---

### LANE C — Frontend (Plans 17–21)

---

#### Plan #17 — Read APIs Completion
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Plan**: `plans/2026-08-03-read-apis-completion.md`
- **Blockers**: Plan #1 ✅, Plan #2, Plan #3, Plan #5, Plan #8, Plan #9, Plan #10, Plan #13
- **Key rules**:
  - Pagination: `page≥1, limit default 20 max 100`
  - Response: `{ items, total, page, limit }`
  - Tenant isolation on every endpoint
  - Response shape contract for FE (no fallback)
  - Endpoints: `GET /customers`, `GET /customers/:id/timeline`, `GET /receivables`, `GET /receivables/:id`, `GET /bank-transactions/unmatched`, `GET /bank-transactions/pending-review-count`
- **Creates**: Read endpoints across all modules, integration tests for response shapes

---

#### Plan #18 — Frontend Design System
- **Type**: task
- **Status**: done ✅
- **Owner**: FE
- **Spec**: `specs/2026-08-03-frontend-design-system.md`
- **Blockers**: Plan #1 ✅
- **Shipped**: 2026-08-04 — PR #2 merged, 6 commits
- **Key rules**:
  - React 19 + Vite + TypeScript
  - Tailwind v4 + shadcn/ui (new-york/neutral theme)
  - Design tokens: primary `#16AB64` (oklch), font "Be Vietnam Pro"
  - 10 nav items: Dashboard, Customers, Receivables, Bank Connections, Transactions, Exceptions, Reminders, Copilot, Reports, Settings
  - Feature-based folder structure
  - API client singleton, `/api/v1` prefix
- **Created**: `apps/frontend/` scaffold, design tokens (oklch light/dark), collapsible Sidebar, mobile drawer, AppLayout, 10 placeholder pages, route skeleton, apiClient, queryClient, useReviewCount hook, Vitest + RTL smoke test

---

#### Plan #19 — FE Auth + App Shell
- **Type**: task
- **Status**: open
- **Owner**: FE
- **Plan**: `plans/2026-08-03-fe-auth-app-shell.md`
- **Blockers**: Plan #3, Plan #18
- **Key rules**:
  - Auth UI: login, signup, verify-email, forgot/reset password, invite accept
  - Axios + `AuthTokenManager` (auto-refresh, single-flight)
  - httpOnly cookie refresh
  - `GET /me` for session restore
  - `hasPermission(role, permission)` for RBAC
  - Route guards (hide button when no permission, never disable)
  - No form library (controlled + HTML5)
- **Creates**: Auth pages, AuthTokenManager, auth context, route guards

---

#### Plan #20 — FE Core AR Loop
- **Type**: task
- **Status**: open
- **Owner**: FE
- **Plan**: `plans/2026-08-03-fe-core-ar-loop.md`
- **Blockers**: Plan #1 ✅, Plan #2, Plan #8, Plan #9, Plan #10, Plan #11, Plan #13, Plan #14, Plan #17, Plan #18, Plan #19
- **Key rules**:
  - 4 core pages: Customers (list + detail route), Receivables (list + detail route + import + write-off/cancel/dispute), Transactions (matching workspace), Exceptions (review + split match)
  - Receivable/Customer detail = routes (`/receivables/:id`, `/customers/:id`)
  - BankTransaction detail = sheet (not route)
  - RBAC hides buttons (never disables)
  - Money via `formatVND` utility
  - `ReceivableStatusBadge` shared component
- **Creates**: Customer pages, Receivable pages, Transaction matching workspace, Exception queue pages

---

#### Plan #21 — FE Reminders, Copilot, Reports, Settings
- **Type**: task
- **Status**: open
- **Owner**: FE
- **Plan**: `plans/2026-08-03-fe-reminders-copilot-reports-settings.md`
- **Blockers**: Plan #4, Plan #5, Plan #6, Plan #7, Plan #12, Plan #15, Plan #16, Plan #17, Plan #18, Plan #19
- **Key rules**:
  - Reminders: policy + executions list
  - Copilot: chat message list + pending-action cards (confirm/cancel)
  - Reports: aging chart (recharts) + summary cards
  - Bank Connections: Cas ID QR flow (`qrcode.react`)
  - Settings: tabbed (Billing + Users + Email Templates)
  - 402 handling → upgrade prompt
  - No conversation list (fresh per session for Copilot)
- **Creates**: Reminder pages, Copilot chat, Reports dashboard, Bank Connection page, Settings tabs

---

### LANE D — Infrastructure (Plans 22–23)

---

#### Plan #22 — Testing Strategy + CI
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `specs/2026-08-03-testing-strategy-design.md`
- **Blockers**: Plan #1 ✅, Plan #7, Plan #8, Plan #13
- **Key rules**:
  - Testcontainers for real Postgres + Redis
  - `turbo run verify` in CI (lint + type-check + test)
  - Missing integration tests: overpayment leftover, PARTIALLY_PAID reject cancel
  - Domain errors translated to HTTP in use case layer
- **Creates**: `CancelReceivableUseCase`, GitHub Actions CI workflow, missing integration tests

---

#### Plan #23 — Deployment + Observability
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `specs/2026-08-03-deployment-observability-design.md`
- **Blockers**: Plan #1 ✅, Plan #7, Plan #18
- **Key rules**:
  - `GET /health` (Postgres + Redis + BullMQ checks) — returns 200/503, never throws
  - Structured JSON logs with `requestId` correlation (separate AsyncLocalStorage)
  - `/metrics` Prometheus endpoint (no auth)
  - Multi-stage Docker builds
  - Extend compose to 4 services (backend, frontend/nginx, postgres, redis)
  - No `@nestjs/terminus` / `nestjs-pino` (YAGNI)
- **Creates**: Health endpoint, metrics endpoint, Dockerfiles, extended docker-compose

---

### ADDITIONAL PLANS

---

#### Plan: Credit Balance Management
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `specs/2026-08-04-credit-balance-management-design.md`
- **Blockers**: Plan #2, Plan #8, Plan #13
- **Key rules**:
  - Customer credit read API: `GET /customers/:customerId/credits`
  - `Payment` rollups are source of truth (no new credit entity)
  - `mark-prepaid` validates customer tenant ownership
  - Harden allocation paths for credit Payments
- **Creates**: Credit read endpoint, validation logic

---

#### Plan: Customer Bank Account Management
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Spec**: `specs/2026-08-04-customer-bank-account-management-design.md`
- **Blockers**: Plan #8
- **Key rules**:
  - Full CRUD for `CustomerBankAccount` mappings
  - Account number normalization (trim, remove separators, require 4-34 digits)
  - Active/inactive soft-delete
  - Masked responses in API/audit
  - `CUSTOMER_BANK_ACCOUNT_MANAGE` permission
  - Matching Engine consumes only active mappings
- **Creates**: `bank-accounts/` module (full CRUD), normalization utility

---

#### Plan: Spec-Plan Reconciliation
- **Type**: task
- **Status**: open
- **Owner**: BE
- **Plan**: `plans/2026-08-03-spec-plan-reconciliation.md`
- **Blockers**: All plans
- **Key rules**: Documentation-only changes, ensures one implementable system across all specs/plans
- **Creates**: Updated spec/plan files with reconciled contracts

---

#### Plan: Application Layer Boundary Enforcement
- **Type**: task
- **Status**: done
- **Owner**: BE
- **Spec**: `specs/2026-08-05-application-layer-boundaries-design.md`
- **Plan**: `plans/2026-08-05-application-layer-boundaries.md`
- **Blockers**: none
- **Key rules**:
  - application/ must not import @nestjs/jwt or throw HttpException — use AppError
  - The ITokenSigner port replaces direct JwtService usage in auth use cases
  - .claude/rules/application.md + AGENTS.md record the corresponding rule; api.md corrects the incorrect @RequirePermission rule
  - dependency-cruiser + Node script enforce the rules automatically through `pnpm verify`
- **Creates**: `AppError`, `ITokenSigner` port + `JwtTokenSigner` adapter, rule docs, `arch-check` CI gate

---

## Frontier

**Next available tickets** (all blockers resolved):
- **Plan #5** (Cas ID Bank Connection) — blockers: Plan #2 ✅, Plan #3 ✅, Plan #4 ✅
- **Plan #6** (Email Template Management) — blockers: Plan #2 ✅, Plan #3 ✅, Plan #4 ✅
- **Plan #9** (Dispute Management) — blockers: Plan #1 ✅, Plan #2 ✅
- **Plan #11** (Internal Task + Escalation) — blockers: Plan #1 ✅, Plan #2 ✅
- **Plan #19** (FE Auth + App Shell) — blockers: Plan #3 ✅, Plan #18 ✅

**Blocked tickets waiting:**
- Plan #5–#8, #10, #12–#17, #20–#23, additional plans — waiting on Plan #4/#5/#6 or other dependencies

**Recommended next step:** Start Plan #5 (Cas ID Bank Connection) or Plan #6 (Email Template Management); both are now unblocked by Plan #4.
