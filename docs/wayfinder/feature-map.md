# Wayfinder Map — Casso Ledger AR Automation

**Tracker**: GitHub Issues
**Charted**: 2026-08-04
**Map mode**: chart — Plan #1, #2, #3, #4, #5, #6, #7, #8, #9, #10, #11, #12, #13, #14, #17, #18 complete, remaining Plan #15–#16, #19–#23 pending

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
2. Transactions: write money/status in one DB transaction
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
- **2026-08-05**: Plan #5 shipped (branch `feat/cas-id-bank-connection`, PR #15 merged) — `bank-connections/` module: initiate/exchange/disconnect flow, AES-256-GCM token encryption, lazy 401/403 revocation detection via `MarkRequiresReauthorizationUseCase`, `MockCasIdAdapter` (real Cas ID client deferred). Webhook ACTIVE-status gating stays with Plan #8 (webhook module doesn't exist yet). Two review passes plus a `domain-check` pass ran before merge: Standards+Spec review found and fixed missing transactions, an unscoped `HttpException`→`AppError` gap, missing `IdempotencyService` wrapping, missing `organizationId` on `ConnectionAuditEvent`, and 3 real DI/ORM bugs invisible to unit tests + `tsc` (`import type` erasing NestJS constructor params to `Function`/`undefined`; a `Date | null` column with no explicit TypeORM `type`) — only caught because a Postgres integration test was added and Docker was available. A `ponytail-review` pass then removed a `@VersionColumn()` that had been added to match convention but was never wired through the domain layer, and deduplicated 3 repeated code blocks across use cases. `activeBankConnections` billing gate (deferred from Plan #3) is still not wired — `BankConnection` now exists but `PlanLimitService` doesn't count it yet.
- **2026-08-06**: Tech-debt fix (branch `fix/domain-orm-mapper`, PR #38 merged) — dropped every remaining unsafe domain→ORM cast (`as`/`as unknown as`) across the backend: `Receivable`/`Subscription` domain entities gained an explicit `version` field plus `toOrm()` mappers in their repositories (original PR scope), and a `code-review` pass on the merged PR found the new "no domain→ORM cast" rule (now in `AGENTS.md`, `.claude/rules/infrastructure.md`, `.claude/rules/typescript.md`) wasn't applied repo-wide — `customers` and `payments` repositories still cast (behaviorally harmless, masked by `BaseRepository`'s spread-to-plain-object) and `typeorm-invoice.repository.ts` still cast a live `Invoice` class instance straight into `repo.save()` (a real bug: TypeORM would have received a class instance, not a plain row). All three got explicit `toOrm()` mappers with a RED→GREEN spec each; production `src/` now has zero `as any`/`as unknown as` casts (verified by repo-wide grep), `arch-check` and full `jest` suite pass.
- **2026-08-06**: Whole-repo `/code-review` (Standards + Spec axes, run against the empty-tree diff so it covered every shipped file) found 9 findings across Standards and Spec; branch `fix/code-review-remediation` fixed the actionable ones: persisted the previously-dead `CasIdConnectionSession` `EXPIRED` status (see Plan #5 note above); backfilled a missing `switch-organization.usecase.spec.ts`; added `qrcode.react`/`recharts` to the frontend per Plan #18 spec §1; fixed `api-client.ts` to bake in the `/api/v1` prefix instead of requiring callers to hardcode it; deduped the frontend's `Plan` type to import `PlanId` from `@casso-ledger/shared-types`; restructured all 10 frontend feature folders to the documented `pages/`+barrel `index.ts` shape (`.claude/rules/frontend.md`). Two findings were corrected as documentation instead of code: the Plan #2 "Organization entity deleted" claim was stale/wrong (entity still exists and is load-bearing since Plan #4's bootstrap transaction — see corrected Plan #2 note); the Plan #18 spec's English nav-label mockup was updated to reflect that shipped Vietnamese labels are intentional, not a bug. Two findings were deliberately deferred rather than fixed here: SALES_REP data-scope filtering (spec-required but has no query to attach to — no read/list endpoint exists yet, Plan #17 not shipped; requirement now recorded on the Plan #17 entry) and Plan #5's owner-notification-on-status-change (needs Plan #7's email adapter, which doesn't exist yet). This branch's own `@VersionColumn()` removal finding (Receivable, Subscription — believed dead at review time) was dropped during rebase onto `main`: PR #38, merged in the meantime, wired that exact `version` field through `domain/`+`toOrm()`, so it's load-bearing now, not dead — the finding was stale by the time this branch rebased, not wrong when written.
- **2026-08-06**: Plan #7 shipped (branch `feat/email-notification-service`, PR #44 merged) — `notifications/` module: `IEmailProviderAdapter` port, `ResendEmailAdapter`, `ResendAuthEmailSenderAdapter` (rebinds `AUTH_EMAIL_SENDER`), `EmailQueueProcessor` on a BullMQ queue with 3 retries + exponential backoff. Also lands an early slice of Plan #12's `ReminderExecution` domain/ORM entity, needed as somewhere for the queue processor to record SENT/FAILED — the rest of Plan #12 (policy/rule/scan cron) is still unbuilt. A `/code-review` pass on the PR found and fixed 6 issues before merge: Resend's `reply_to` field was silently dropped (SDK expects camelCase `replyTo`); `RESEND_API_KEY` defaulted to `''` instead of failing fast at boot; auth emails (signup/invite/reset) could turn a successful signup into an HTTP 500 if Resend failed after the DB transaction had already committed (now caught + logged, matching the old console-stub's no-throw contract); `ReminderExecution`'s domain entity was missing the `version` field its ORM entity carries via `@VersionColumn()` (same drift class already fixed twice before, PR #38/#39); a DB write failure after a successful send could cause `EmailQueueProcessor`'s BullMQ retry to email the customer twice (now guarded by a status check before sending); `findOwnerByOrganization` could return a pending, never-accepted OWNER invite as the reply-to address on customer-facing reminder emails (now filters `joinedAt: Not(IsNull())`, matching `findFirstActiveByUserId`'s existing convention). Merging also required resolving a real conflict with `main`'s same-day `refactor: resolve configuration at module boundaries` (4d58445) — `getBullMqConfig` was converted from reading `process.env` directly to taking an injected `ConfigService`, matching the pattern that refactor established for `getJwtSecret`/`getTypeOrmConfig`. Known gaps: no integration test (e2e blocked by no local Docker; 139 unit tests cover the module instead); auth email failures are logged, not retried (no queue on that path).

- **2026-08-06**: Plan #8 shipped (branch `feat/webhook-matching-engine`, PR #46 merged) — webhook inbox/idempotency, constant-time CASSO auth, BullMQ processing, five-factor matching, auto-allocation/review/unmatched routing, and Docker/Testcontainers E2E coverage. A `code-review` pass (Standards + Spec axes) before merge found and fixed 6 issues: plain `Error` thrown from application-layer code instead of `AppError` (`process-webhook.usecase.ts`, `transaction-normalizer.ts`); business logic and transaction handling living in `WebhooksController` instead of a use case (extracted into `ReceiveWebhookUseCase`); `MatchingEngineService` only resolved `customerId` via a stored `CustomerBankAccount`, never via an exact invoice/receivable code match in `transferContent` per spec §3 (capped `totalScore` at 80, making the ≥90 auto-allocate threshold unreachable for that case); `findOpenTopNByOrganization`'s "closest by dueDate" ordering was a plain `ASC` sort instead of closeness to the transaction date; error-message secret redaction only caught labeled `key=value` pairs, not bare JWT/hex/base64-shaped tokens; `BankTransaction.isRefund()`/`.markIgnored()` were defined and tested but never called, so refund transactions were silently dropped instead of persisted as `IGNORED`. Verified with 73 unit suites (156 tests), `tsc --noEmit`, `domain-check`, and 8 e2e suites (20 tests) against real Postgres + Redis. Merged with `--admin` bypassing the `verify` CI check, which never started — GitHub Actions reported "The job was not acquired by Runner of type hosted even after multiple attempts" (hosted-runner infra issue, not a code failure); the same verification commands above were run locally as the merge gate instead.

- **2026-08-07**: Repo-wide security + performance audit (2 parallel agents, whole-tree scan, no ticket) — branch `chore/perf-security-audit`, PR #47 merged. Security: `DB_PASSWORD` no longer defaults to `'casso'` (`getOrThrow`, matching `JWT_SECRET`); `synchronize` gated off when `NODE_ENV === 'production'` (was unconditionally `true` — a schema-drift/data-loss vector on a misconfigured prod deploy); added `helmet()` (no security-headers middleware existed before); `AuthCompositeRateLimitGuard` added to `/auth/refresh` and `/auth/reset-password` for defense-in-depth. Performance: `MatchingEngineService.scoreCandidates` did 2 sequential DB round trips per receivable in a loop (up to ~40 per webhook in the worst case) — `IInvoiceRepository` gained a batched `findByReceivableIds()` (`IN` query, 2 queries total), the old single-id `findByReceivableId()` removed as dead code; `TypeOrmReceivableRepository.findOpenTopNByOrganization` ordered by a computed SQL expression that defeated the `(organizationId, status, dueDate)` index, forcing a full sort at scale — replaced with two index-served range scans merged in memory. While verifying, found and fixed a masking bug in `billing-quota`/`jwt-auth`/`payment-allocation.e2e-spec.ts`: none set `JWT_SECRET`/`ACCESS_TOKEN_ENCRYPTION_KEY`/`RESEND_API_KEY`/`CASSO_WEBHOOK_*` themselves and only passed by accident when Jest ran `webhook-matching.e2e-spec.ts` first in the same worker and leaked its env vars — each file now sets its own placeholder values. Deliberately not changed: `idempotency.service.ts`'s `!==` on `requestHash` is a body-hash consistency check, not a secret/signature verification, so the constant-time rule doesn't apply. Merged with `--admin` — CI hit the same "runner not acquired" infra issue as PR #46; verification ran locally (73 suites/160 unit tests, `tsc --noEmit`, `domain-check`, all 5 e2e files green standalone). A deeper pre-existing e2e cross-file flakiness (TypeORM retry-loop bleeding across testcontainer boundaries when all 5 e2e files run together) was found but not fixed — tracked in issue #48.

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

**27 plans** | status snapshot (2026-08-09):
- 🟢 done (17): Plan #1, Plan #2, Plan #3, Plan #4, Plan #5, Plan #6, Plan #7, Plan #8, Plan #9, Plan #10, Plan #11, Plan #12, Plan #13, Plan #14, Plan #17, Plan #18, Application Layer Boundary Enforcement
- 🔴 open/not started (10): Plan #15–#16, #19–#23 + Credit Balance Management, Customer Bank Account Management, Spec-Plan Reconciliation

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
- **Key entities**: `Membership`, `Role` (OWNER/FINANCE_MANAGER/ACCOUNTANT/SALES_REP/VIEWER), `Permission` (14 permissions). A standalone `Organization` entity (`organizations/domain/organization.ts` + repo + ORM entity, wired into `organizations.module.ts`) exists and is used by the Plan #4 bootstrap transaction (signup creates Organization + User + Membership + Subscription) — **correction 2026-08-06**: this entry previously claimed it "was deleted during the ponytail-review pass" and "nothing in this branch reads/writes one yet"; a whole-repo `/code-review` Spec-axis pass found the entity still present and load-bearing, so that claim was stale/wrong, not a description of current reality. `organizationId` also lives as a plain column on every business table per the spec's shared-schema model
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
- **Status**: done ✅
- **Owner**: BE
- **Spec**: `specs/2026-08-03-cas-id-bank-connection-design.md`
- **Shipped**: 2026-08-05 — PR #15 merged (branch `feat/cas-id-bank-connection`)
- **Blockers**: Plan #2 ✅, Plan #3 ✅, Plan #4 ✅
- **Key entities**: `CasIdConnectionSession`, `BankConnection` (ACTIVE/REQUIRES_REAUTHORIZATION/DISCONNECTED), `ConnectionAuditEvent`
- **Key rules**:
  - Redirect-based flow: grant token → Cas Link → publicToken → accessToken exchange
  - AES-256-GCM encryption for stored access tokens
  - Lazy revocation detection (401/403 → REQUIRES_REAUTHORIZATION)
  - Re-auth reactivates existing row (not create new)
  - `MockCasIdAdapter` for MVP
- **Creates**: `bank-connections/` module, token encryption utility, initiate/exchange/disconnect use cases, controller
- **Implementation note**: Core connection flow is implemented on branch `feat/cas-id-bank-connection`, including a Postgres integration test (`test/cas-id-bank-connection-flow.integration.spec.ts`) covering initiate → exchange → disconnect end to end. Webhook ACTIVE-status gating remains with Plan #8 because the webhook module does not exist yet; no duplicate webhook infrastructure is created here. A code-review pass on this branch found and fixed 3 real DI/ORM bugs invisible to unit tests + `tsc` (type-only imports erasing NestJS constructor params to `Function`/`undefined`; a `Date | null` ORM column with no explicit `type`), added missing transactions/pessimistic locking, scoped `ConnectionAuditEvent` by `organizationId` (previously unscoped), and added the `REVOKED` status to `BankConnectionStatus` per the spec's field listing (§2) even though the spec's own transition table, §3, never produces it — a spec inconsistency, not an implementation gap. A follow-up `@VersionColumn()` was added to match the Receivable/Subscription convention, then removed by a `ponytail-review` pass after it turned out never to be wired through the domain layer (no field, no conflict handling) — real protection for the entity's concurrent-write paths is the pessimistic lock (`findByIdForUpdate`) on the tenant-scoped `disconnect` flow plus the domain's own state-transition guards on the unscoped background paths. The same pass also deduplicated 3 identical code blocks across use cases (`MarkRequiresReauthorizationUseCase.handleAdapterError`, `DisconnectConnectionUseCase.assertFound`, `assertReauthorizable`).
- **Known gap (deferred, 2026-08-06; Plan #7 now shipped)**: spec §3 requires notifying the Organization Owner when a connection's status leaves ACTIVE. No notification is sent today — `notifications/` exists as of Plan #7 (PR #44), so the email adapter is available, but `MarkRequiresReauthorizationUseCase`/`DisconnectConnectionUseCase` haven't been wired to call it yet. Still open, no longer blocked.
- **Bug fixed (2026-08-06, code-review remediation branch)**: `CasIdConnectionSessionStatus = 'EXPIRED'` was declared but never persisted — `exchange-token.usecase.ts` only threw a transient error on an expired session without writing the status back, so the enum value was dead. `CasIdConnectionSession.markExpired()` added; `ExchangeTokenUseCase` now persists `EXPIRED` before throwing.

---

#### Plan #6 — Email Template Management
- **Type**: task
- **Status**: done ✅
- **Owner**: BE
- **Spec**: `specs/2026-08-03-email-template-management-design.md`
- **Blockers**: Plan #2 ✅, Plan #3 ✅, Plan #4 ✅
- **Shipped**: 2026-08-06 — PR #40 (branch `feat/email-template-management`)
- **Key entities**: `EmailTemplate` (isDefault, reminderStage, bodyHtml)
- **Key rules**:
  - 4 default templates seeded per organization in bootstrap
  - `isDefault` templates editable but NOT deletable
  - Delete blocked if referenced by reminder rule
  - Handlebars auto-escapes XSS
  - Fixed 7 render variables
  - Preview endpoint returns `{ subject, bodyHtml }`
- **Creates**: `email-templates/` module, render/create/list/update/delete/preview use cases, controller
- **Implementation note**: Shipped with full CRUD (create/list/update/delete) + Handlebars preview + RBAC (`Permission.REMINDER_POLICY_WRITE` on create/update/delete, `Permission.EMAIL_TEMPLATE_READ` on `GET` and `POST /:id/preview` — a dedicated read permission granted to all 5 roles, following the same universal-read pattern as `RECEIVABLE_READ`) + signup-bootstrap seeding of the 4 (Vietnamese-language) default templates. `DeleteEmailTemplateUseCase`'s reference check catches Postgres `42P01` (undefined table) and treats it as "not referenced" because the `reminder_rules` table doesn't exist yet — Plan #12 (Reminder Automation) will make this guard fully load-bearing once that table ships; until then it's a deliberate no-op fallback, not a bug; the query is also explicitly `organizationId`-scoped so it stays tenant-safe once that table exists. Task 7's reminder-bootstrap wiring (`IDefaultReminderBootstrap`, seeding default `ReminderPolicy`/`ReminderRule` rows alongside the default templates) was deliberately deferred to Plan #12 for the same reason — that module doesn't exist yet. A final whole-branch review pass fixed 5 findings: removed an incorrect `IdempotencyService` wrap on the read-only preview endpoint, added the missing `organizationId` index on `EmailTemplateOrmEntity`, added `@RequirePermission()` to `GET /email-templates` (initially reusing the write permission), and added closed-list Handlebars variable validation (rejecting unknown variable names and `{{{triple-stash}}}`) on both create/update DTOs. A follow-up `/code-review` pass on the resulting PR (#40) then found and fixed 3 more issues: the write-permission reuse on `GET` was overly restrictive versus the spec (fixed by adding `EMAIL_TEMPLATE_READ`, above); the reminder-rule reference query had no `organizationId` filter (fixed); and `TypeOrmEmailTemplateRepository.findAllForOrganization()`/`delete()` hand-rolled tenant scoping instead of going through `BaseRepository` (fixed by adding `scopedFindMany`/`scopedDelete` to `BaseRepository`, tested, additive — no other repository's behavior changed). A second manual review round then fixed 4 more: added `@VersionColumn()` to `EmailTemplateOrmEntity` (was missing optimistic locking, risking silent lost updates on concurrent `PATCH`); added `page`/`limit` pagination (default 20, max 100) plus explicit column selection to `GET /email-templates`, extending `BaseRepository.scopedFindMany` with `select`/`skip`/`take` support (additive, only this repository uses it so far); fixed `POST /:id/preview` to require `EMAIL_TEMPLATE_READ` instead of `REMINDER_POLICY_WRITE` since it is a pure read with no side effects; and moved Handlebars out of `RenderEmailTemplateUseCase` (application layer) behind a new `ITemplateCompiler` port + `HandlebarsTemplateCompiler` adapter (infrastructure layer), matching the existing `ITokenSigner`/`jwt-token-signer.adapter.ts` pattern for keeping concrete SDKs out of application/. `reminderStage` was deliberately kept in Vietnamese (not reverted to the plan's English literals) per explicit product decision — it's documented in the spec as UI-display metadata only, not a matching key; Plan #12 will need to account for the Vietnamese values when it wires `ReminderRule.emailTemplateId`.

---

### LANE B — Features (Plans 7–16)

---

#### Plan #7 — Email Notification Service
- **Type**: task
- **Status**: done ✅
- **Shipped**: 2026-08-06 — branch `feat/email-notification-service`, PR #44 (merged `c5f3a7a`)
- **Owner**: BE
- **Spec**: `specs/2026-08-03-email-notification-service-design.md`
- **Blockers**: Plan #4 ✅, Plan #6 ✅
- **Key entities**: None (orchestration only) — plus an early slice of Plan #12's `ReminderExecution` domain entity (status/skip-reason/version), added because `EmailQueueProcessor` needed somewhere to record SENT/FAILED; the rest of Plan #12 (`ReminderPolicy`, `ReminderRule`, `CustomerGroup`, scan cron) is still unbuilt
- **Key rules**:
  - `IEmailProviderAdapter` port with `ResendEmailAdapter`
  - Never call provider synchronously — always via BullMQ queue
  - 3 retries with exponential backoff
  - `SENT` status only after provider confirms (has `providerMessageId`)
  - `FAILED` after final attempt
  - Rebinds `AUTH_EMAIL_SENDER` to real Resend adapter
- **Creates**: `notifications/` module, `ResendEmailAdapter`, `ResendAuthEmailSenderAdapter`, `EmailQueueProcessor`; `reminders/` module (`ReminderExecution` domain/ORM entity + repository, Plan #12 groundwork only)
- **Known gaps (deferred)**:
  - No integration test — e2e blocked by no local Docker; unit tests (135+) cover the module instead
  - Auth email failures (signup/invite/reset) are caught and logged rather than retried — no BullMQ queue for that path yet (reminder emails do use the queue with 3 retries)
  - Plan #5's owner-notification-on-status-change (needs this adapter) is now unblocked but not yet wired — see Plan #5 note above

---

#### Plan #8 — Webhook Ingestion + Matching Engine
- **Type**: task
- **Status**: done ✅
- **Owner**: BE
- **Spec**: `specs/2026-08-03-webhook-matching-engine-design.md`
- **Blockers**: Plan #1 ✅, Plan #2 ✅, Plan #5 ✅ (not actually blocked on Plan #6 despite prior Frontier prose — this ticket's own Blockers line never listed it)
- **Shipped**: 2026-08-06 — PR #46 merged
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
- **Status**: done ✅
- **Shipped**: 2026-08-07, PR #50
- **Owner**: BE
- **Spec**: `specs/2026-08-03-dispute-management-design.md`
- **Blockers**: none — Plan #1 ✅, Plan #2 ✅
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
- **Status**: done ✅
- **Owner**: BE
- **Spec**: `specs/2026-08-03-collection-activity-timeline-design.md`
- **Blockers**: none — Plan #1 ✅, Plan #7 ✅, Plan #9 ✅
- **Shipped**: 2026-08-07 — branch `feat/collection-activity-timeline`, PR #61 (awaiting review; e2e not yet run — Docker unavailable in the implementing environment)
- **Key entities**: `CollectionActivity` (10 activity types, INSERT-only)
- **Key rules**:
  - Never the source of truth — status lives in `ReminderExecution`/`PaymentAllocation`/`Dispute`/`Receivable`
  - Only INSERT, no update/delete
  - Single `CollectionActivityListener` subscribing to 6 events
  - Listener wraps tenant context for background events
- **Creates**: `collection-activity/` module, listener (6 events, now in `infrastructure/`), `RecordManualActivityUseCase`, modifies `AllocatePaymentUseCase` to emit events
- **Implementation note**: this session's subagent-driven-development execution (13 commits across 7 plan tasks + 1 controller-authored scope addition, each task reviewed and, where needed, fixed) found and fixed 4 gaps beyond the plan's written code samples: (1) the plan's `RecordManualActivityUseCase`/`CollectionActivityListener` samples threw plain `Error` — fixed to `AppError`/`ErrorCode`, matching the codebase's live convention; (2) **major finding** — `AllocatePaymentUseCase.execute()` was the plan's only specified event-emission hook, but bank-webhook auto-match (`process-webhook.usecase.ts`) and exception-queue match (`match-bank-transaction.usecase.ts`) both call the shared `allocateWithinTransaction()` directly, bypassing it — without a fix, the product's primary AR-automation path (webhook-driven payments) would never have produced timeline rows; fixed by extracting `emitAllocationEvents()` and wiring it into all 3 call sites, each firing only after its own owning transaction commits (human consulted and approved this scope expansion, tracked as "Task 5b"); (3) the controller's plan-sample code returned raw `CollectionActivity` domain entities, leaking `organizationId` into JSON responses — fixed with a `toCollectionActivityResponse()` DTO mapper at all 3 HTTP boundaries, including correct placement relative to `IdempotencyService` caching; (4) a final whole-branch review found `EventEmitter2` injected directly into the application layer (`AllocatePaymentUseCase`, the listener) — an earlier task had wrongly assumed this matched existing `disputes`-module debt, but `disputes` actually already has the correct `IEventPublisher` port; fixed by widening/relocating that port to `common/events/` and moving `CollectionActivityListener` itself to `infrastructure/`, plus wrapping the listener's fire-and-forget event handlers in try/catch so a timeline-write failure can never propagate into the business flow that produced it (previously a real unhandled-rejection/process-crash risk on 4 of its 6 handlers). The integration test (Task 7) was also extended, human-approved, to cover the webhook auto-match path, not just the manual endpoint the plan's brief exercised — this needed a mid-review fix of its own (an initial poll loop checked a proxy DB-status signal instead of polling for the actual `CollectionActivity` rows, a race window; fixed to poll the timeline endpoint directly). Known deferred gaps: timeline endpoints are unpaginated (plan-level oversight); `PaymentAllocatedEvent.allocatedByUserId` typed `string` but `null` flows through via the webhook path (cosmetic); a rejecting event listener after a committed webhook allocation still flips `WebhookInbox` to FAILED causing spurious retry/DLQ noise (no double-allocation risk, unique constraint on `providerTransactionId`). Docker/testcontainers unavailable throughout this session, so the integration test (including its extended webhook-path coverage) was written and type-checked but never executed against real Postgres/Redis — needs a Docker-available run before full merge confidence.

---

#### Plan #11 — Internal Task + Escalation
- **Type**: task
- **Status**: done ✅
- **Owner**: BE
- **Spec**: `specs/2026-08-03-internal-task-escalation-design.md`
- **Plan**: `plans/2026-08-03-internal-task-escalation.md`
- **Blockers**: none — Plan #1 ✅, Plan #2 ✅
- **Key entities**: `InternalTask` (ESCALATION/MANUAL, OPEN/DONE/DISMISSED)
- **Key rules**:
  - Escalation threshold per `customerGroup` on `ReminderPolicy.escalationThresholdDays` (fallback 30 days)
  - `receivable.status-closed` = broad terminal event (auto-dismiss), distinct from PAID-only `receivable.closed` (ADR-0005)
  - Assigned to first active FINANCE_MANAGER, falling back to first OWNER when the org has none
  - Manual assignees must be active organization members; resolve/dismiss is restricted to assignee or OWNER
  - `findOverdueByThreshold` paginates via a keyset cursor (500/batch) so a large org's overdue scan stays memory-bounded
- **Creates**: `internal-tasks/` module, `RunEscalationScanUseCase`, listeners, controller (4 endpoints), cancel endpoint, migration
- **Shipped**: 2026-08-09 — PR #77 merged, 3 commits

---

#### Plan #12 — Reminder Automation
- **Type**: task
- **Status**: done ✅
- **Shipped**: 2026-08-08, PR #73
- **Owner**: BE
- **Spec**: `specs/2026-08-03-reminder-automation-design.md`
- **Plan**: `plans/2026-08-08-reminder-automation.md` (updated with grilling decisions)
- **Blockers**: none — Plan #1 ✅, Plan #2 ✅, Plan #6 ✅, Plan #7 ✅
- **Key entities**: `ReminderPolicy`, `ReminderRule`, `ReminderExecution` (domain/ORM entity shipped early by Plan #7 — see its note), `CustomerGroup` (VIP/REGULAR)
- **Key rules**:
  - Policy unique by `(organizationId, customerGroup)`
  - Rule uses `offsetDays` (negative=before, positive=after dueDate)
  - Rate limiting via latest SENT execution (`minIntervalDays`)
  - Daily BullMQ scan emits `reminder.scan.completed`
  - Fresh-state worker re-checks before sending
  - Timezone: `Asia/Ho_Chi_Minh` (not server time)
  - `PENDING→SENT/FAILED` lifecycle, immutable `ReminderExecution`
- **Creates**: `reminders/` module (3 entities + policy CRUD + scheduler + sender + processors), CRUD endpoints, e2e coverage against real Postgres/Redis/BullMQ
- **Implementation note**: A `/code-review` pass (two rounds) found and fixed a long list of issues before merge. Standards-axis: `updateSendResult` had lost its `organizationId` scope (cross-tenant write); `TypeOrmReminderRuleRepository.findById` had no tenant scoping (now joins through the owning policy's `organizationId`); the application layer threw bare `Error` instead of `AppError`/`ErrorCode`; `ReminderExecutionsController` called the repository directly instead of an application service (added `ReminderExecutionQueryService`); `reminder-policy.service.ts#update()` used `findAll().find()` instead of a scoped `findById`; duplicated `ReminderRuleDto` and skip-execution construction were deduped. Spec-axis: the Task 10 integration test was essentially unimplemented (4 smoke tests, none of the 9 required behavior groups); the default bootstrap seeded reminder rules against English template names while the actual seed templates are Vietnamese, leaving every seeded rule's `emailTemplateId` empty. Three more critical bugs surfaced only once the e2e suite was actually run against real Postgres/Redis/BullMQ, which neither a static review nor a mocked unit test could catch: `TypeOrmReminderCandidateReader`'s joins compared a `uuid` column to a `varchar` column without a cast, so the daily scan silently found zero candidates for every organization with real receivables; `findLatestSent` selected via a raw quoted SQL string instead of an entity property path, silently breaking hydration so rate-limiting never took effect and duplicate reminders could send every day; and the scheduler's BullMQ `jobId` contained `:` separators, which BullMQ rejects, so the daily scan's real enqueue path failed for every match (masked by the per-organization try/catch) — only tests that bypassed the scheduler and called `ReminderSenderService.send()` directly ever exercised a successful send. A separate CI `arch-check` failure (the candidate reader importing other modules' ORM entity classes) was fixed by joining on raw table names instead. The e2e suite now covers all 9 Task 10 scenarios and passes 12/12 against real Postgres/Redis/BullMQ.

---

#### Plan #13 — Exception Queue + Audit Log
- **Type**: task
- **Status**: done ✅
- **Shipped**: 2026-08-07, PR #49
- **Owner**: BE
- **Spec**: `specs/2026-08-03-exception-queue-audit-log-design.md`
- **Blockers**: none — Plan #1 ✅, Plan #2 ✅, Plan #8 ✅; local Testcontainers e2e still hangs during `Test.createTestingModule().compile()` after PostgreSQL startup (unit/type-check/arch-check pass; e2e is not part of the CI `verify` job)
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
- **Status**: done ✅
- **Owner**: BE
- **Spec**: `specs/2026-08-03-invoice-import-design.md`
- **Blockers**: none — Plan #1 ✅, Plan #2 ✅, Plan #3 ✅
- **Shipped**: 2026-08-08 — PR #76 (branch `feat/invoice-import`)
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
- **Blockers**: none — Plan #1 ✅, Plan #2 ✅, Plan #8 ✅, Plan #13 ✅
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
- **Blockers**: none — Plan #2 ✅, Plan #6 ✅, Plan #7 ✅, Plan #10 ✅, Plan #12 ✅
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
- **Status**: done ✅
- **Owner**: BE
- **Plan**: `plans/2026-08-03-read-apis-completion.md`
- **Blockers**: Plan #1 ✅, Plan #2 ✅, Plan #3 ✅, Plan #5 ✅, Plan #8 ✅, Plan #9 ✅, Plan #10 ✅, Plan #13 ✅
- **Shipped**: 2026-08-07 — branch `feat/read-apis-completion`, PR #72
- **Key rules**:
  - Pagination: `page≥1, limit default 20 max 100`
  - Response: `{ items, total, page, limit }`
  - Tenant isolation on every endpoint
  - Response shape contract for FE (no fallback)
  - Endpoints: `GET /customers`, `GET /customers/:id/timeline`, `GET /receivables`, `GET /receivables/:id`, `GET /bank-transactions/unmatched`, `GET /bank-transactions/pending-review-count`
  - **Required by Plan #2 spec** (`specs/2026-08-03-multi-tenancy-rbac-design.md` §"Special case: SALES_REP"): `GET /receivables` must add `WHERE salesRepresentativeId = ctx.userId` when the caller's role is `SALES_REP`. `Receivable.salesRepresentativeId` already exists on the entity; no query exists yet to apply the filter to since this endpoint hasn't been built — do it here, not as a standalone fix.
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
- **Blockers**: none — Plan #3 ✅, Plan #18 ✅
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
- **Blockers**: Plan #1 ✅, Plan #2 ✅, Plan #8 ✅, Plan #9 ✅, Plan #10 ✅, Plan #11 ✅, Plan #13 ✅, Plan #14 ✅, Plan #17 ✅, Plan #18 ✅, Plan #19
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
- **Blockers**: Plan #4 ✅, Plan #5 ✅, Plan #6 ✅, Plan #7 ✅, Plan #12 ✅, Plan #15, Plan #16, Plan #17 ✅, Plan #18 ✅, Plan #19
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
- **Blockers**: none — Plan #1 ✅, Plan #7 ✅, Plan #8 ✅, Plan #13 ✅
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
- **Blockers**: none — Plan #1 ✅, Plan #7 ✅, Plan #18 ✅
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
- **Blockers**: none — Plan #2 ✅, Plan #8 ✅, Plan #13 ✅
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
- **Blockers**: none — Plan #8 ✅
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
- **Plan #15** (Aging Dashboard + Reporting) — blockers: Plan #1 ✅, Plan #2 ✅, Plan #8 ✅, Plan #13 ✅
- **Plan #16** (Collection Copilot) — blockers: Plan #2 ✅, Plan #6 ✅, Plan #7 ✅, Plan #10 ✅, Plan #12 ✅
- **Plan #19** (FE Auth + App Shell) — blockers: Plan #3 ✅, Plan #18 ✅
- **Plan #22** (Testing Strategy + CI) — blockers: Plan #1 ✅, Plan #7 ✅, Plan #8 ✅, Plan #13 ✅
- **Plan #23** (Deployment + Observability) — blockers: Plan #1 ✅, Plan #7 ✅, Plan #18 ✅
- **Credit Balance Management** — blockers: Plan #2 ✅, Plan #8 ✅, Plan #13 ✅
- **Customer Bank Account Management** — blockers: Plan #8 ✅

**Blocked tickets waiting:**
- **Plan #20** (FE Core AR Loop) — waiting on Plan #19 (Plan #10, #11, #14 + #17 now shipped)
- **Plan #21** (FE Reminders, Copilot, Reports, Settings) — waiting on Plan #15, Plan #16, Plan #19 (Plan #12 + #17 now shipped)
- **Spec-Plan Reconciliation** — waiting on all plans

**Recommended next step:** Plan #16 (Collection Copilot) is the highest-leverage pick now that Plan #12 (Reminder Automation) has shipped — it's the last blocker for Plan #16 and feeds Plan #21. Plan #15 (Aging Dashboard + Reporting) is also unblocked.
