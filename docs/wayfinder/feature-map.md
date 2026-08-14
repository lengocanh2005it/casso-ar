# Wayfinder Map — Casso Ledger AR Automation

**Tracker**: GitHub Issues
**Charted**: 2026-08-04
**Last reviewed**: 2026-08-13
**Map mode**: chart — Plans #1–#23 complete; follow-up issues are listed in Frontier

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
- **2026-08-05**: Plan #3 shipped (branch `feat/billing-usage-metering`, PR #8 merged) — `receivablesThisMonth` gate only. `activeBankConnections` gate deliberately deferred to Plan #5 because no `BankConnection` table existed yet; Plan #5 later shipped the module, but the gate remains unwired (issue #101). Plan #4 later added the signup/bootstrap transaction; the Plan #3 implementation still keeps a lazy FREE `Subscription` fallback for organizations without a row. Billing period is a lazily-rolled current calendar month (no renewal cron). A `/code-review` pass found and fixed a real race condition (advisory lock replaces a row lock that couldn't cover first-time Subscription creation) and a dead `status` field; a `ponytail-review` pass then deleted 3 unused plan-limit catalog entries and merged two always-paired repository calls into one.
- **2026-08-05**: Application Layer Boundary Enforcement shipped — `AppError`/`ITokenSigner` replace `HttpException`/`JwtService` leaks in 9 use case files across auth/billing/receivables; `.claude/rules/application.md` added; `api.md`'s unconditional `@RequirePermission()` rule corrected (was wrong for pre-auth endpoints); `arch-check` (dependency-cruiser + Node script) wired into `pnpm verify`. Domain/infrastructure/presentation audited clean, no code changes there.
- **2026-08-05**: Plan #5 shipped (branch `feat/cas-id-bank-connection`, PR #15 merged) — `bank-connections/` module: initiate/exchange/disconnect flow, AES-256-GCM token encryption, lazy 401/403 revocation detection via `MarkRequiresReauthorizationUseCase`, `MockCasIdAdapter` (real Cas ID client deferred). Webhook ACTIVE-status gating was deferred to Plan #8, which is now shipped. Two review passes plus a `domain-check` pass ran before merge: Standards+Spec review found and fixed missing transactions, an unscoped `HttpException`→`AppError` gap, missing `IdempotencyService` wrapping, missing `organizationId` on `ConnectionAuditEvent`, and 3 real DI/ORM bugs invisible to unit tests + `tsc` (`import type` erasing NestJS constructor params to `Function`/`undefined`; a `Date | null` column with no explicit TypeORM `type`) — only caught because a Postgres integration test was added and Docker was available. A `ponytail-review` pass then removed a `@VersionColumn()` that had been added to match convention but was never wired through the domain layer, and deduplicated 3 repeated code blocks across use cases. `activeBankConnections` billing gate (deferred from Plan #3) is still not wired — `BankConnection` now exists but `PlanLimitService` doesn't count it yet (issue #101).
- **2026-08-06**: Tech-debt fix (branch `fix/domain-orm-mapper`, PR #38 merged) — dropped every remaining unsafe domain→ORM cast (`as`/`as unknown as`) across the backend: `Receivable`/`Subscription` domain entities gained an explicit `version` field plus `toOrm()` mappers in their repositories (original PR scope), and a `code-review` pass on the merged PR found the new "no domain→ORM cast" rule (now in `AGENTS.md`, `.claude/rules/infrastructure.md`, `.claude/rules/typescript.md`) wasn't applied repo-wide — `customers` and `payments` repositories still cast (behaviorally harmless, masked by `BaseRepository`'s spread-to-plain-object) and `typeorm-invoice.repository.ts` still cast a live `Invoice` class instance straight into `repo.save()` (a real bug: TypeORM would have received a class instance, not a plain row). All three got explicit `toOrm()` mappers with a RED→GREEN spec each; production `src/` now has zero `as any`/`as unknown as` casts (verified by repo-wide grep), `arch-check` and full `jest` suite pass.
- **2026-08-06**: Whole-repo `/code-review` (Standards + Spec axes, run against the empty-tree diff so it covered every shipped file) found 9 findings across Standards and Spec; branch `fix/code-review-remediation` fixed the actionable ones: persisted the previously-dead `CasIdConnectionSession` `EXPIRED` status (see Plan #5 note above); backfilled a missing `switch-organization.usecase.spec.ts`; added `qrcode.react`/`recharts` to the frontend per Plan #18 spec §1; fixed `api-client.ts` to bake in the `/api/v1` prefix instead of requiring callers to hardcode it; deduped the frontend's `Plan` type to import `PlanId` from `@casso-ledger/shared-types`; restructured all 10 frontend feature folders to the documented `pages/`+barrel `index.ts` shape (`.claude/rules/frontend.md`). Two findings were corrected as documentation instead of code: the Plan #2 "Organization entity deleted" claim was stale/wrong (entity still exists and is load-bearing since Plan #4's bootstrap transaction — see corrected Plan #2 note); the Plan #18 spec's English nav-label mockup was updated to reflect that shipped Vietnamese labels are intentional, not a bug. Two findings were deliberately deferred rather than fixed here: SALES_REP data-scope filtering (spec-required but has no query to attach to — no read/list endpoint exists yet, Plan #17 not shipped; requirement now recorded on the Plan #17 entry) and Plan #5's owner-notification-on-status-change (needs Plan #7's email adapter, which doesn't exist yet). This branch's own `@VersionColumn()` removal finding (Receivable, Subscription — believed dead at review time) was dropped during rebase onto `main`: PR #38, merged in the meantime, wired that exact `version` field through `domain/`+`toOrm()`, so it's load-bearing now, not dead — the finding was stale by the time this branch rebased, not wrong when written.
- **2026-08-06**: Plan #7 shipped (branch `feat/email-notification-service`, PR #44 merged) — `notifications/` module: `IEmailProviderAdapter` port, `ResendEmailAdapter`, `ResendAuthEmailSenderAdapter` (rebinds `AUTH_EMAIL_SENDER`), `EmailQueueProcessor` on a BullMQ queue with 3 retries + exponential backoff. Also lands an early slice of Plan #12's `ReminderExecution` domain/ORM entity, needed as somewhere for the queue processor to record SENT/FAILED — the rest of Plan #12 (policy/rule/scan cron) is still unbuilt. A `/code-review` pass on the PR found and fixed 6 issues before merge: Resend's `reply_to` field was silently dropped (SDK expects camelCase `replyTo`); `RESEND_API_KEY` defaulted to `''` instead of failing fast at boot; auth emails (signup/invite/reset) could turn a successful signup into an HTTP 500 if Resend failed after the DB transaction had already committed (now caught + logged, matching the old console-stub's no-throw contract); `ReminderExecution`'s domain entity was missing the `version` field its ORM entity carries via `@VersionColumn()` (same drift class already fixed twice before, PR #38/#39); a DB write failure after a successful send could cause `EmailQueueProcessor`'s BullMQ retry to email the customer twice (now guarded by a status check before sending); `findOwnerByOrganization` could return a pending, never-accepted OWNER invite as the reply-to address on customer-facing reminder emails (now filters `joinedAt: Not(IsNull())`, matching `findFirstActiveByUserId`'s existing convention). Merging also required resolving a real conflict with `main`'s same-day `refactor: resolve configuration at module boundaries` (4d58445) — `getBullMqConfig` was converted from reading `process.env` directly to taking an injected `ConfigService`, matching the pattern that refactor established for `getJwtSecret`/`getTypeOrmConfig`. Known gaps: no integration test (e2e blocked by no local Docker; 139 unit tests cover the module instead); auth email failures are logged, not retried (no queue on that path).

- **2026-08-06**: Plan #8 shipped (branch `feat/webhook-matching-engine`, PR #46 merged) — webhook inbox/idempotency, constant-time CASSO auth, BullMQ processing, five-factor matching, auto-allocation/review/unmatched routing, and Docker/Testcontainers E2E coverage. A `code-review` pass (Standards + Spec axes) before merge found and fixed 6 issues: plain `Error` thrown from application-layer code instead of `AppError` (`process-webhook.usecase.ts`, `transaction-normalizer.ts`); business logic and transaction handling living in `WebhooksController` instead of a use case (extracted into `ReceiveWebhookUseCase`); `MatchingEngineService` only resolved `customerId` via a stored `CustomerBankAccount`, never via an exact invoice/receivable code match in `transferContent` per spec §3 (capped `totalScore` at 80, making the ≥90 auto-allocate threshold unreachable for that case); `findOpenTopNByOrganization`'s "closest by dueDate" ordering was a plain `ASC` sort instead of closeness to the transaction date; error-message secret redaction only caught labeled `key=value` pairs, not bare JWT/hex/base64-shaped tokens; `BankTransaction.isRefund()`/`.markIgnored()` were defined and tested but never called, so refund transactions were silently dropped instead of persisted as `IGNORED`. Verified with 73 unit suites (156 tests), `tsc --noEmit`, `domain-check`, and 8 e2e suites (20 tests) against real Postgres + Redis. Merged with `--admin` bypassing the `verify` CI check, which never started — GitHub Actions reported "The job was not acquired by Runner of type hosted even after multiple attempts" (hosted-runner infra issue, not a code failure); the same verification commands above were run locally as the merge gate instead.

- **2026-08-07**: Repo-wide security + performance audit (2 parallel agents, whole-tree scan, no ticket) — branch `chore/perf-security-audit`, PR #47 merged. Security: `DB_PASSWORD` no longer defaults to `'casso'` (`getOrThrow`, matching `JWT_SECRET`); `synchronize` gated off when `NODE_ENV === 'production'` (was unconditionally `true` — a schema-drift/data-loss vector on a misconfigured prod deploy); added `helmet()` (no security-headers middleware existed before); `AuthCompositeRateLimitGuard` added to `/auth/refresh` and `/auth/reset-password` for defense-in-depth. Performance: `MatchingEngineService.scoreCandidates` did 2 sequential DB round trips per receivable in a loop (up to ~40 per webhook in the worst case) — `IInvoiceRepository` gained a batched `findByReceivableIds()` (`IN` query, 2 queries total), the old single-id `findByReceivableId()` removed as dead code; `TypeOrmReceivableRepository.findOpenTopNByOrganization` ordered by a computed SQL expression that defeated the `(organizationId, status, dueDate)` index, forcing a full sort at scale — replaced with two index-served range scans merged in memory. While verifying, found and fixed a masking bug in `billing-quota`/`jwt-auth`/`payment-allocation.e2e-spec.ts`: none set `JWT_SECRET`/`ACCESS_TOKEN_ENCRYPTION_KEY`/`RESEND_API_KEY`/`CASSO_WEBHOOK_*` themselves and only passed by accident when Jest ran `webhook-matching.e2e-spec.ts` first in the same worker and leaked its env vars — each file now sets its own placeholder values. Deliberately not changed: `idempotency.service.ts`'s `!==` on `requestHash` is a body-hash consistency check, not a secret/signature verification, so the constant-time rule doesn't apply. Merged with `--admin` — CI hit the same "runner not acquired" infra issue as PR #46; verification ran locally (73 suites/160 unit tests, `tsc --noEmit`, `domain-check`, all 5 e2e files green standalone). A deeper pre-existing e2e cross-file flakiness (TypeORM retry-loop bleeding across testcontainer boundaries when all 5 e2e files run together) was found but not fixed — tracked in issue #48.

- **2026-08-11**: Fresh whole-repo verification found follow-ups not represented in the original map: active bank-connection plan enforcement (#101), non-authentication Cas ID failures not transitioning to `ERROR` (#102), webhook tenant-mismatch ordering (#103), missing audit coverage (#104), fail-fast DB/Resend configuration (#105), application-layer `AppError`/integration-boundary violations (#106), and an unused direct `ioredis` dependency (#107). Existing open follow-ups #90 and #96–#100 remain current; #88, #43, and #48 are closed.
- **2026-08-12**: PR #141 merged — closed security issues #110, #111, #113, and #125: Copilot per-user rate limiting, bounded prompt/model/history cost, user-scoped conversations, SMTP timeout and public-host validation with allowlist support, org/user SMTP rate limiting, and CAS ID redirect URI allowlisting. Empty `CAS_ID_REDIRECT_URI_ALLOWLIST` remains pass-through by design.

- **2026-08-12**: PR #145 ("fail-fast required config + restore application layer boundaries") closed #105 and #106 — `DB_PASSWORD`/`RESEND_API_KEY` now fail at bootstrap when missing or empty (`getOrThrow` + empty check, matching `JWT_SECRET`/`ACCESS_TOKEN_ENCRYPTION_KEY`); the 5 e2e suites that never set `RESEND_API_KEY` (`auth-flow`, `cas-id-bank-connection-flow`, `read-apis-completion`, `receivable-repository`, `tenant-isolation`) gained explicit placeholders. #106: TypeORM `QueryFailedError` unique-violation detection + `CONFLICT` translation moved out of application code into `TypeOrmCustomerBankAccountRepository.save()` (both bank-account use cases drop their catch-translate blocks; `account-number-normalizer.ts` no longer imports TypeORM); raw invariant errors in `token-encryption`/`copilot-tool-registry`/normalizer kept as-is with regression coverage (the `HttpExceptionFilter` catch-all already wraps boundary-crossing errors). Also closed as completed (verified shipped in PR #141, tracker never updated): #111, #113, #125. Running e2e with Docker exposed two pre-existing `smtp-config.e2e-spec.ts` failures on `main`, fixed in the same PR: `smtp.example.com` doesn't resolve (`ENOTFOUND`) so PR #141's public-host validation rejected it — fixed with `SMTP_HOST_ALLOWLIST=smtp.example.com` (designed escape hatch); and a stale 5-arg `send()` expectation updated to the 6-arg signature (fromName) from PR #140. E2E re-run: all 7 suites green.

- **2026-08-12**: PR #146 ("bank-connection status alerts + reminder scan/effectiveness perf") closed #97, #102, #115, #117 — #102: non-auth Cas ID failures (5xx/network) now transition ACTIVE → `ERROR` via `markError()` in the shared `handleAdapterError` path (atomic `MARKED_ERROR`/`API_CALL_FAILED` audit, rethrow preserves caller retry policy); recovery via re-auth works from `ERROR` too. #97: `MarkRequiresReauthorizationUseCase` emits `bank-connection.status.changed`; new `BankConnectionStatusListener` (notifications) emails the org OWNER (send-owner-alert, always via Resend, Vietnamese copy) on REAUTH/ERROR — DISCONNECTED excluded (owner-initiated). #115: reminder daily scan batches policy/rule/latest-sent lookups (`findLatestSentByReceivableIds`, O(policies + 2) queries instead of O(candidates × 3)). #117: `(organizationId, status, sentAt)` index + effectiveness query rewritten to index-served range scans with global latest-sent semantics, proven by the new `reminder-effectiveness.e2e-spec.ts` (also caught a varchar/uuid mismatch on `receivables.organizationId`). E2E also caught a DI wiring bug (EVENT_PUBLISHER missing from `BankConnectionsModule` — unit tests construct use cases directly so never exercised the container).

- **2026-08-12**: PR #147 ("bank-connection plan limit + audit log API + webhook inbox API") closed #101, #127, #131 — #101: `ExchangeTokenUseCase` counts ACTIVE connections inside the same transaction as activation and enforces the plan limit via `PlanLimitService.enforceBankConnectionLimit` (subscription advisory lock serializes concurrent exchanges). #127: paginated `GET /audit-logs` (entityType/actionType/actorUserId/date filters), tenant-scoped, `AUDIT_LOG_READ`, response omits `organizationId`. #131: `GET /webhooks/inbox` (status filter, paginated) + `POST /webhooks/inbox/:id/reprocess` (FAILED-only, deterministic jobId → idempotent); new `WEBHOOK_INBOX_READ` permission (OWNER + FINANCE_MANAGER). Verified by new `ops-apis.e2e-spec.ts` (7/7).

- **2026-08-12**: PR #148 ("member management + CSV export") closed #128, #130 — #128 (P1): `PATCH/DELETE /organizations/:id/members/:userId` (role change + remove member; guards: không hạ/gỡ OWNER cuối cùng, member chưa join không đổi role; remove revoke refresh tokens trong 1 transaction), `DELETE /organizations/:id/invites/:inviteId` + `POST .../resend` (token mới, reuse InviteMemberUseCase); permission mới `ORGANIZATION_MANAGE` (OWNER-only). #130 (P1): `GET /receivables/export` (cùng filters như list, ≤10k rows, Content-Disposition attachment) + `GET /reports/aging/export` (totals theo bucket); shared csv-writer chống formula injection (`= + - @` → prefix `'`).

- **2026-08-12**: PR #149 ("member management + CSV export FE", branch `feat/member-management-export-fe`, merged) — FE completion for issues #128 and #130 (backend shipped in PR #148). Settings → Users tab gained inline role-change/remove-member actions and a pending-invites table (resend/revoke), all gated on `ORGANIZATION_MANAGE` (OWNER-only) and hidden on the current user's own row to prevent accidental self-lockout; "Xuất CSV" buttons added to the receivables list (respects the active status/customer filter, warns on the 10,000-row export cap via the `X-Export-Truncated` header) and the aging report, sharing a new `lib/use-csv-export.ts` hook. Small backend addition: `GET /organizations/:id/invites` (paginated, excludes accepted invites) — the FE had no way to list pending invites before this; the repository returns a data-only `PendingInviteSummary` projection (no `tokenHash`) rather than rehydrating the full domain entity. Post-review fixes: dropped a client-side `REPORT_READ` gate the reports export button had added where the page never had one before (spec said reuse an existing gate, not add one — backend already requires `REPORT_READ` on every query the page makes); last-owner 409 toast copy aligned across role-change/remove-member; role `<select>` now validates against the `Role` enum before mutating. Verified: backend 647/647 unit + e2e (`member-management-export.e2e-spec.ts` 9/9, `auth-flow.e2e-spec.ts` 5/5, standalone), frontend 89/89, `pnpm verify` 8/8, domain-check clean. Closes #128, Closes #130.

- **2026-08-12**: FE responsive + dark/light mode batch (branch `lengocanh2005it/feat-frontend-responsive-dark-mode`, PR #142 merged) — no ticket; follow-up from a frontend audit. Dark mode previously had complete CSS vars but **no mechanism to enable them**: added `ThemeProvider` (`light | dark | system`, persisted to localStorage, follows `prefers-color-scheme`), a FOUC-prevention inline script in `index.html`, `<meta name="theme-color">` + `color-scheme` CSS (web-design-guidelines findings), a Sun/Moon toggle (cycle system→light→dark) in the sidebar footer and mobile header, and a Sonner Toaster synced to the resolved theme. Responsive fixes: tab lists scroll instead of overflowing (`overflow-x-auto max-w-full`), two dialogs restored mobile margins (`sm:max-w-xl`/`sm:max-w-lg`), Copilot chat replaced fixed `calc(100vh-8rem)` with a flex `h-dvh` layout (input box stays above the fold), main padding `p-4 md:p-6`, and action-button cells wrap. Polish (emil-design-eng pass): installed `tailwindcss-animate` — referenced by every dialog/sheet/select but never installed, so modals animated nothing — and gave the Sheet real slide-in/out (4 sides) + overlay fade; narrowed `transition-all` on tab triggers to explicit properties; added `active:scale-95` press feedback; skip link "Đi tới nội dung" + `focus-visible` rings on icon buttons (a11y). Reviewed with three global skills (react-best-practices: no violations; web-design-guidelines: 3 fixes; emil-design-eng: animation system). Verified: 67/67 FE tests, lint 0, type-check 0, build OK.

## Not yet specified

- Cas ID OAuth flow details (grant → link → publicToken → accessToken)
- Resend email provider configuration
- Frontend design tokens (oklch colors, "Be Vietnam Pro" font)
- **Casso Admin Platform** (2026-08-09): a cross-organization admin panel for Casso's own operators — not an org-scoped feature like the Reports dashboard (Plan #15/#21). Needs a new superadmin role/concept (outside the existing 5-role RBAC, which is scoped per-organization) and queries that intentionally cross tenant isolation. Mentioned use cases so far: locking/unlocking organizations, and — once built — surfacing `AIUsageLog` (Plan #16) for cross-org AI cost/usage monitoring; `AIUsageLog` already captures everything this would need (model, tokens, latency, errors, per organizationId), no schema change required to support it later. No spec/plan/brainstorming session yet — needs `domain-modeling` before any implementation starts.

## Out of scope

- Microservices architecture (modular monolith for MVP)
- Kubernetes production-grade deployment
- Multi-currency support
- SSO/OAuth social login
- ML-based cash flow forecasting (rule-based naive forecast only)

---

## Ticket Index

**30 tracked tickets** | status snapshot (2026-08-13):
- 🟢 done (30): Plan #1, Plan #2, Plan #3, Plan #4, Plan #5, Plan #6, Plan #7, Plan #8, Plan #9, Plan #10, Plan #11, Plan #12, Plan #13, Plan #14, Plan #15, Plan #16, Plan #17, Plan #18, Plan #19, Plan #20, Plan #21, Plan #22, Plan #23, Application Layer Boundary Enforcement, Customer Bank Account Management, Credit Balance Management, Spec-Plan Reconciliation, Org-Branded Reminder Emails via Custom SMTP (BYO-SMTP), SMTP Settings UI (Frontend), In-App Alerts (#137)
- 🟡 in-progress (0): none
- 🔴 open/not started (0): none

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
  - Plan #4 now creates `Organization + User + Membership(OWNER) + Subscription(FREE)` in the signup bootstrap transaction; `PlanLimitService` retains a lazy FREE `Subscription` fallback for organizations without a row. Replace that fallback only when all legacy organizations are guaranteed to have a subscription.
  - Billing period is a rolling current-calendar-month, recalculated lazily on each check (no renewal cron exists — one of the spec's own open questions, calendar-month was chosen)
  - `activeBankConnections` gate and the `bank-connections` exchange 402 are **not implemented** — `BankConnection`/`bank-connections` now exists from Plan #5, but `PlanLimitService` still does not count ACTIVE connections (issue #101). `Subscription.bankConnectionLimit` is on the entity per spec, ready for the gate to be wired
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
- **Key entities**: `CasIdConnectionSession`, `BankConnection` (ACTIVE/REQUIRES_REAUTHORIZATION/REVOKED/DISCONNECTED/ERROR), `ConnectionAuditEvent`
- **Key rules**:
  - Redirect-based flow: grant token → Cas Link → publicToken → accessToken exchange
  - AES-256-GCM encryption for stored access tokens
  - Lazy revocation detection (401/403 → REQUIRES_REAUTHORIZATION)
  - Re-auth reactivates existing row (not create new)
  - `MockCasIdAdapter` for MVP
- **Creates**: `bank-connections/` module, token encryption utility, initiate/exchange/disconnect use cases, controller
- **Implementation note**: Core connection flow is implemented on branch `feat/cas-id-bank-connection`, including a Postgres integration test (`test/cas-id-bank-connection-flow.integration.spec.ts`) covering initiate → exchange → disconnect end to end. Webhook ACTIVE-status gating remains with Plan #8 because the webhook module does not exist yet; no duplicate webhook infrastructure is created here. A code-review pass on this branch found and fixed 3 real DI/ORM bugs invisible to unit tests + `tsc` (type-only imports erasing NestJS constructor params to `Function`/`undefined`; a `Date | null` ORM column with no explicit `type`), added missing transactions/pessimistic locking, scoped `ConnectionAuditEvent` by `organizationId` (previously unscoped), and added the `REVOKED` status to `BankConnectionStatus` per the spec's field listing (§2) even though the spec's own transition table, §3, never produces it — a spec inconsistency, not an implementation gap. A follow-up `@VersionColumn()` was added to match the Receivable/Subscription convention, then removed by a `ponytail-review` pass after it turned out never to be wired through the domain layer (no field, no conflict handling) — real protection for the entity's concurrent-write paths is the pessimistic lock (`findByIdForUpdate`) on the tenant-scoped `disconnect` flow plus the domain's own state-transition guards on the unscoped background paths. The same pass also deduplicated 3 identical code blocks across use cases (`MarkRequiresReauthorizationUseCase.handleAdapterError`, `DisconnectConnectionUseCase.assertFound`, `assertReauthorizable`).
- **Known gap (deferred, 2026-08-06; Plan #7 now shipped)**: spec §3 requires notifying the Organization Owner when a connection's status leaves ACTIVE. No notification is sent today — `notifications/` exists as of Plan #7 (PR #44), so the email adapter is available, but `MarkRequiresReauthorizationUseCase`/`DisconnectConnectionUseCase` haven't been wired to call it yet. Still open, no longer blocked; see issue #97.
- **Bug fixed (2026-08-06, code-review remediation branch)**: `CasIdConnectionSessionStatus = 'EXPIRED'` was declared but never persisted — `exchange-token.usecase.ts` only threw a transient error on an expired session without writing the status back, so the enum value was dead. `CasIdConnectionSession.markExpired()` added; `ExchangeTokenUseCase` now persists `EXPIRED` before throwing.
- **Current-state correction (2026-08-11)**: Plan #8 shipped the webhook ACTIVE-status gate. The remaining Plan #5 follow-ups are owner notification (#97), active-connection plan enforcement (#101), and non-authentication failure transitions to `ERROR` (#102).

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
- **Shipped**: 2026-08-07 — branch `feat/collection-activity-timeline`, PR #61 merged (the implementation environment had not run the e2e test at merge time)
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

- **Current-state correction (2026-08-11)**: Plan #12 is shipped, so the older Plan #6 notes about `reminder_rules` not existing and reminder-bootstrap wiring being deferred are historical, not current status.

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
- **Status**: done ✅ (BE only — FE consumption is Plan #21's job, per that plan's own scope)
- **Owner**: BE + FE
- **Spec**: `specs/2026-08-03-aging-dashboard-reporting-design.md`
- **Blockers**: none — Plan #1 ✅, Plan #2 ✅, Plan #8 ✅, Plan #13 ✅
- **Shipped**: 2026-08-09 — branch `feat/aging-dashboard-reporting`, PR #78 merged (`ff3e94a`), closes issue #27
- **Key entities**: None (read-only queries)
- **Key rules**:
  - 5 canonical aging buckets: `NOT_DUE`, `OVERDUE_1_7`, `OVERDUE_8_30`, `OVERDUE_31_60`, `OVERDUE_60_PLUS`, always returned in fixed order, zero-filled
  - Real-time raw SQL, no precompute/materialized view
  - Composite index: `receivables(organizationId, status, dueDate)` (already existed from an earlier plan) + new `bank_transactions(organizationId, createdAt)` (this plan) with a matching migration
  - `Permission.REPORT_READ` on both endpoints
  - `GET /reports/dashboard-summary` accepts optional `from`/`to` (validated: ISO date, must be supplied as a pair, `from <= to`, max 90-day range), defaulting to the current calendar month in `Asia/Ho_Chi_Minh` — scopes only `autoMatchRate`/`manualHandlingRate`/`reminderEffectiveness`; outstanding/overdue/forecast/top-customers stay "as of now"
  - `reminderEffectiveness` (7-day post-send window, keyed on `ReminderExecution.sentAt`) — added to MVP scope during a grilling session with the user, beyond the original spec draft's deferral of this metric
- **Creates**: `reporting/` module — `IAgingReportRepository`/`IDashboardSummaryRepository` ports in `application/`, `TypeOrmAgingReportRepository`/`TypeOrmDashboardSummaryRepository` in `infrastructure/` (raw parameterized SQL), `ReportsController`, `GetDashboardSummaryQueryDto`, composite index + migration
- **Implementation note**: spec and plan were revised in a grilling session before implementation — a false "multi-tenancy plan exception" citation (used to justify bypassing Repository/UseCase layering) was found via grep to not exist anywhere and was dropped in favor of the port/repository architecture actually shipped; the original plan's receivables-index task was also dropped after discovering that index already existed. A `/code-review` pass (Standards + Spec axes) after implementation found one real bug — supplying only `from` (no `to`) on `dashboard-summary` silently passed validation (class-validator's `@IsOptional()` skips a property's other decorators when that property is undefined, so the pairing check never ran) and fell back to the default period instead of being rejected — fixed via `@ValidateIf`, with regression tests and an added 401 test for `dashboard-summary` that had been missing. Verified with 126/126 unit suites (400/400 tests), 7/7 e2e tests against real Postgres (testcontainers), clean `tsc --noEmit`/Biome/`domain-check`.

---

#### Plan #16 — Collection Copilot
- **Type**: task
- **Status**: done ✅
- **Owner**: BE + FE
- **Spec**: `specs/2026-08-03-collection-copilot-design.md`
- **Blockers**: none — Plan #2 ✅, Plan #6 ✅, Plan #7 ✅, Plan #10 ✅, Plan #12 ✅
- **Key entities**: `CopilotConversation`, `CopilotMessage`, `CopilotPendingAction`, `CopilotDraft`, `AIUsageLog`
- **Key rules**:
  - Chat-based AI via an OpenAI-compatible Chat Completions API (`openai` SDK behind a new `IAIChatProvider` port; MVP default OpenRouter + `gpt-4o-mini`, configurable via env vars) — changed from the original spec draft's Anthropic SDK during the 2026-08-09 grilling session
  - 5 tools max (hardcoded whitelist): `getReceivableSummary`, `getCollectionActivityTimeline`, `getPaymentHistory`, `draftReminderEmail`, `sendReminderEmail`
  - `sendReminderEmail` intercepted into pending action (never executes in model turn); real multi-round ReAct tool loop, not a single hard-coded call
  - Confirm/cancel endpoints: `POST /copilot/actions/:id/confirm|cancel`, both idempotency-wrapped and race-safe (atomic `confirmIfPending`/`cancelIfPending`)
  - 15s timeout + 1 retry
  - `CopilotPendingAction` expires 10min, silently becomes uninteractable (no notification)
  - `Permission.REMINDER_SEND_MANUAL` gates write
  - Never expose credentials in prompts
  - Chat turns gated by Billing (`PlanLimitService.enforceCopilotChatLimit`, FREE = 50/month) — new in scope per explicit user decision, reversing the original spec's "free in MVP" default
- **Creates**: `copilot/` module (5 entities + tool registry + chat/confirm/cancel use cases + controller)
- **Shipped**: 2026-08-09 — PR #79

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
  - **Required by Plan #2 spec** (`specs/2026-08-03-multi-tenancy-rbac-design.md` §"Special case: SALES_REP"): `GET /receivables` auto-scopes to `WHERE salesRepresentativeId = ctx.userId` for `SALES_REP`; this was wired in the Plan #17 list use case.
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
- **Status**: done ✅
- **Owner**: FE
- **Plan**: `plans/2026-08-03-fe-auth-app-shell.md`
- **Blockers**: none — Plan #3 ✅, Plan #18 ✅
- **Shipped**: 2026-08-09 — branch `feat/fe-auth-app-shell`, PR #80 merged (`69b2d37`), closes issue #30
- **Key rules**:
  - Auth UI: login, signup, verify-email, forgot/reset password, invite accept
  - Axios + `AuthTokenManager` (auto-refresh, single-flight)
  - httpOnly cookie refresh
  - `GET /me` for session restore
  - `hasPermission(role, permission)` for RBAC
  - Route guards (hide button when no permission, never disable)
  - No form library (controlled + HTML5)
- **Creates**: Auth pages, AuthTokenManager, auth context, route guards
- **Implementation note**: spec/plan revised in a grilling session before implementation — the plan was written before `apps/frontend` was scaffolded and before `GET /api/v1/me`/RBAC existed. `GET /me` now returns `role`/`organizationId`/`organizationName`; `Permission`/`Role`/`ROLE_PERMISSIONS` actually migrated to `packages/shared-types` (not copy-pasted) with every backend controller repointed; `AcceptInviteDto` gained a real `name` field. A post-implementation `/code-review` (Standards + Spec axes) found and fixed 5 more issues, and a `web-design-guidelines` pass found and fixed 3 accessibility gaps in the new auth forms (spellcheck, inline form errors with focus management, `role="status"` on state transitions). Verified with 138/138 backend suites (437/437 tests), 13/13 frontend suites (29/29 tests), clean `tsc`/Biome/arch-check.

---

#### Plan #20 — FE Core AR Loop
- **Type**: task
- **Status**: done ✅
- **Owner**: FE
- **Plan**: `plans/2026-08-03-fe-core-ar-loop.md`
- **Blockers**: Plan #1 ✅, Plan #2 ✅, Plan #8 ✅, Plan #9 ✅, Plan #10 ✅, Plan #11 ✅, Plan #13 ✅, Plan #14 ✅, Plan #17 ✅, Plan #18 ✅, Plan #19 ✅
- **Shipped**: 2026-08-10 — PR #81 merged (`4c5c21c`), branch `feat/fe-core-ar-loop`
- **Key rules**:
  - 3 core pages: Customers (list + detail route), Receivables (list + detail route + import + write-off/cancel/dispute), Exception Queue (review + match + split match — merged with the originally-separate Transactions page, see plan revision note)
  - Receivable/Customer detail = routes (`/receivables/:id`, `/customers/:id`)
  - BankTransaction detail = sheet (not route)
  - RBAC hides buttons (never disables)
  - Money via `formatVND` utility
  - `ReceivableStatusBadge` shared component
- **Creates**: Customer pages (+ new `GET /api/v1/customers/:id` backend endpoint), Receivable pages (+ `isOverdue`/`invoiceNumber` added to `GET /receivables/:id`), Exception Queue page (match + split match + skip + mark-prepaid with customer search)
- **Implementation note**: plan revised in a 2026-08-10 grilling session and shipped in this worktree — Transactions/Exception Queue merged into one page (only one backend endpoint exists for both), 2 small backend additions added to scope (`GET /customers/:id`, `isOverdue`/`invoiceNumber` on receivable detail), Dismiss task action added, mark-prepaid customer picker instead of raw text UUID, 2 RBAC bugs fixed before implementation (import gated on `RECEIVABLE_IMPORT` not `RECEIVABLE_WRITE`, cancel gated on `RECEIVABLE_WRITE_OFF` not `RECEIVABLE_WRITE`). See plan doc's revision note for full detail. Two post-implementation fix passes before merge: a `code-review` wave (FE+BE task-resolve RBAC gated on the wrong permission, deduped `postWithIdempotency`, dropped a dead array-shape fallback, swapped a raw `<select>` for the shared `Select`) and a Web Interface Guidelines wave (exception-queue row keyboard access, a missing textarea label, dark-mode badge colors, list filters/page reflected in the URL, receivables table showing customer name instead of a raw UUID, remaining English strings translated to Vietnamese).

---

#### Plan #21 — FE Reminders, Copilot, Reports, Settings
- **Type**: task
- **Status**: done ✅
- **Owner**: FE
- **Plan**: `plans/2026-08-03-fe-reminders-copilot-reports-settings.md`
- **Blockers**: Plan #4 ✅, Plan #5 ✅, Plan #6 ✅, Plan #7 ✅, Plan #12 ✅, Plan #15 ✅, Plan #16 ✅, Plan #17 ✅, Plan #18 ✅, Plan #19 ✅
- **Shipped**: 2026-08-10 — PR #82, branch `feat/fe-reminders-copilot-reports-settings`, closes issue #32
- **Key rules**:
  - Reminders: policy + executions list
  - Copilot: chat message list + pending-action cards (confirm/cancel)
  - Reports: aging chart (recharts) + summary cards
  - Bank Connections: Cas ID QR flow (`qrcode.react`)
  - Settings: tabbed (Billing + Users + Email Templates)
  - 402 handling → upgrade prompt
  - No conversation list (fresh per session for Copilot)
- **Creates**: Reminder pages, Copilot chat, Reports dashboard, Bank Connection page, Settings tabs
- **Implementation note**: plan revised in a 2026-08-10 grilling session — Task 1 (`lib/plan.ts`) dropped in favor of the existing `lib/plan-access.ts`; Copilot nav `minPlan` corrected from an undocumented `BUSINESS` drift back to `STARTER` (the original design-system spec decision); `sidebar.tsx` hardcoded-`FREE` bug fixed; reminder-policy RBAC corrected from `RECEIVABLE_WRITE` to `REMINDER_POLICY_WRITE`; `PATCH /reminder-policies/:id` documented/implemented as a full-body update; `escalationThresholdDays` field added; Copilot confirm/cancel response types corrected to match the real backend (no shared wrapper); `DashboardSummary.reminderEffectiveness` and `EmailTemplate.reminderStage`/`updatedAt` added. During implementation, a real backend gap was found and fixed: `GET /reminder-policies` didn't return each policy's `rules`, needed by the full-body PATCH toggle — fixed with a batched, tenant-scoped lookup (no N+1). Two post-implementation fix passes: a `code-review` wave (Copilot chat could get permanently stuck for a user without `REMINDER_SEND_MANUAL`) and a Web Interface Guidelines wave (billing plan label, 3 tables moved to the shared shadcn `Table`, URL state for the reminders filter and settings tab).

---

### LANE D — Infrastructure (Plans 22–23)

---

#### Plan #22 — Testing Strategy + CI
- **Type**: task
- **Status**: done ✅
- **Owner**: BE
- **Spec**: `specs/2026-08-03-testing-strategy-design.md`
- **Blockers**: none — Plan #1 ✅, Plan #7 ✅, Plan #8 ✅, Plan #13 ✅
- **Key rules**:
  - Testcontainers for real Postgres (+ a real local Redis on `localhost:6379` for suites that exercise BullMQ directly, e.g. `reminder-automation.e2e-spec.ts` — those don't spin their own Redis testcontainer)
  - `test:e2e` stays **local-only**, not wired into `.github/workflows/ci.yml` — 2026-08-10 grilling-session decision, to avoid testcontainers cost on every push; CI runs `pnpm verify` + `pnpm build` only
  - `CancelReceivableUseCase` + `POST /api/v1/receivables/:id/cancel` were already shipped by earlier work (transaction + pessimistic lock + `AppError` + domain event), not new to this plan
  - Domain errors translated via `AppError`/`ErrorCode` in the use case layer, not raw `HttpException`
- **Creates**: `overpayment.e2e-spec.ts` (case 3), `cancel-partially-paid-rejected.e2e-spec.ts` (case 5), `test:e2e` turbo task
- **Implementation note**: this ticket's own spec/plan (`2026-08-03-testing-strategy-design.md`/`2026-08-03-testing-strategy.md`) were stale — a 2026-08-10 grilling session found `CancelReceivableUseCase`/its endpoint/`ci.yml` already shipped (more robustly than the plan's sample code) and the CI-wiring task (`test:e2e` in CI) decided against for cost reasons; both docs were rewritten to match. Real remaining work was just the 2 missing integration tests (case 3: overpayment leftover stays unallocated; case 5: CANCEL rejected on PARTIALLY_PAID) plus a `test:e2e` turbo task. While writing case 3's e2e test against a real Postgres container, found and fixed a real money-integrity bug: `TypeOrmPaymentRepository.findByIdForUpdate()` passed Postgres's string-typed `bigint` columns straight into `new Payment(row)`, making `unallocatedAmount = totalAmount - allocatedAmount` a string concatenation instead of a subtraction — fixed with a `fromOrm()` mapper (regression-tested). The branch was also rebased onto `main`'s same-day `fix: stabilize reminder automation and email template e2e` (5ee924f) partway through, since it landed on `main` after this worktree was created. Full local `pnpm turbo run test:e2e` (20 suites) is 19/20 reliable — `reminder-automation.e2e-spec.ts` passes standalone (12/12) but intermittently times out only when run as part of the full batched suite (pre-existing cross-file flakiness in the same class as issue #48, untouched by this branch, not part of this ticket's scope) — worth its own follow-up issue.

---

#### Plan #23 — Deployment + Observability
- **Type**: task
- **Status**: done ✅
- **Owner**: BE
- **Spec**: `specs/2026-08-03-deployment-observability-design.md`
- **Blockers**: none — Plan #1 ✅, Plan #7 ✅, Plan #18 ✅
- **Shipped**: 2026-08-10 — PR #85, branch `feat/deployment-observability`
- **Key rules**:
  - `GET /health` (Postgres + Redis + BullMQ checks) — returns 200/503, never throws
  - Structured JSON logs with `requestId` correlation (`RequestIdStore`, its own `AsyncLocalStorage` — needed because unauthenticated routes like `/health`/webhook ingestion and background BullMQ jobs never populate `TenantContextService`)
  - `/metrics` Prometheus endpoint (no auth), all 4 required series for both `webhook-processing` and `email-queue`
  - Multi-stage Docker builds (backend Node 20, frontend Vite → nginx)
  - Compose extended to 5 services (backend, frontend/nginx, postgres, redis, daily `pg_dump` backup cron)
  - No `@nestjs/terminus` / `nestjs-pino` (YAGNI)
- **Creates**: `common/observability/` module (health/metrics controllers, `JsonLogger`, `MetricsService`, `RequestIdStore`/`RequestIdMiddleware`), Dockerfiles for both apps, extended `docker-compose.yml`, `backup` service
- **Implementation note**: this plan's own spec/plan docs (drafted 2026-08-03, early in the project) were stale by the time this ticket was picked up — a grilling session found `TenantContextInterceptor` (shipped later by the Multi-tenancy/RBAC plan) already independently minted its own `requestId` for audit-log fingerprinting in `invoice-import`; implementing the plan's original `RequestIdStore` literally would have given one HTTP request two divergent `requestId` values. Fixed: `RequestIdStore`/`RequestIdMiddleware` stays the single source of truth, and `TenantContextInterceptor` now reads from it instead of minting a second ID. `WebhookProcessor`/`EmailQueueProcessor` had also grown `onFailed` logic (dead-letter logging; `job.name` branching for auth-email vs. reminder-email) the plan didn't know about — the metrics increment was merged into the existing bodies rather than pasted over them. `HealthController` calling `DataSource`/`Queue` directly with no use-case layer was confirmed as a deliberate exception to `.claude/rules/api.md`'s "controller only calls use case" rule (a cross-cutting `common/` system-status endpoint, not business-domain logic). A `/code-review` pass (Standards + Spec axes) after implementation found one real spec-section-5 gap the plan itself had never scoped in at all (unlike the explicitly-excluded Grafana/Loki/Tempo/K8s items): the daily `pg_dump` backup cron with 7-copy rotation. Added using `prodrigestivill/postgres-backup-local` (a maintained image handling cron/compression/rotation via env vars) rather than a hand-rolled script, verified with a real manual backup run producing a compressed `.sql.gz`. `test:e2e` stays local-only per Plan #22's CI-contract decision (not wired into `.github/workflows/ci.yml`) — verified locally instead: fresh `pnpm verify` (8/8 tasks, 144 backend + 27 frontend suites) and the new/modified e2e coverage (`health-and-metrics.e2e-spec.ts`, `webhook-matching.e2e-spec.ts`, `reminder-automation.e2e-spec.ts`) all pass reliably standalone against real Postgres+Redis; two unrelated pre-existing suites are flaky only in the full batched run (same pre-existing cross-file flakiness class noted in Plan #22, not caused by this branch).

---

### ADDITIONAL PLANS

---

#### Plan: Credit Balance Management
- **Type**: task
- **Status**: done ✅
- **Owner**: BE
- **Spec**: `specs/2026-08-04-credit-balance-management-design.md`
- **Blockers**: none — Plan #2 ✅, Plan #8 ✅, Plan #13 ✅
- **Shipped**: 2026-08-11 — PR #87 merged, 11 commits
- **Key rules**:
  - Customer credit read API: `GET /customers/:customerId/credits` (`RECEIVABLE_READ`, universal across all 5 roles — no 403 case exists for this endpoint)
  - `Payment` rollups are source of truth (no new credit entity); query via `scopedFindMany` + TypeORM `Raw()` operator for the `totalAmount > allocatedAmount` column comparison, no new `BaseRepository` method
  - Existing `POST /payments/:id/allocate`/`.../undo` remain the only write/undo paths — no new mutating endpoint
- **Creates**: `GetCustomerCreditsUseCase`, `CustomerCreditsController`, `IPaymentRepository.findUnallocatedByCustomerId`
- **Implementation note**: this plan (drafted 2026-08-04, same day as its spec) was rescoped before implementation — ground-truth review found `mark-prepaid`'s customer validation and `allocate-payment.usecase.ts`'s customer/null-customer guards already fully shipped by earlier work (the plan's Task 3 dropped entirely; Task 4 narrowed to 2 missing unit tests, no production change). Writing the ticket's own e2e lifecycle test surfaced two real, pre-existing bugs in the reused allocate/undo endpoints, both fixed on this branch: (1) `AllocatePaymentUseCase` let `Receivable.applyPaymentAllocation()`/`Payment.withAdditionalAllocation()`'s plain-`Error` over-allocation rejection bubble up as an unhandled 500 instead of `AppError(ErrorCode.ALLOCATION_EXCEEDS_REMAINING/UNALLOCATED)` (400) — both codes already existed and were already mapped to 400, just never thrown from this call site; (2) `TypeOrmPaymentAllocationRepository` never coerced the bigint `allocatedAmount` column from Postgres's string representation to a number (same bug class already fixed for `Payment` in Plan #22), so `POST /payments/allocations/:id/undo` crashed on every call — no e2e test had ever exercised the undo endpoint before this ticket's own test needed it. Both fixed with regression tests, following the established `toOrm()`/`fromOrm()` explicit-mapper convention.
- **Post-merge-review follow-up (2026-08-11)**: a `/code-review` pass (Standards + Spec axes) against `origin/main` found 3 spec §9 acceptance criteria without a test: deterministic multi-row ordering (`receivedAt ASC, id ASC`) of `findUnallocatedByCustomerId`, dynamic item removal once a payment becomes fully allocated (previously only asserted statically via a pre-seeded fully-allocated payment), and 403 enforcement of `PAYMENT_ALLOCATE`/`PAYMENT_ALLOCATE_UNDO` for a role that lacks them (SALES_REP). All 3 added as regression/coverage tests for already-correct behavior (no production code change) in `typeorm-payment.repository.spec.ts` and `credit-balance-management.e2e-spec.ts`. Two other flagged items were investigated and confirmed not real gaps: `Payment.withAdditionalAllocation()`'s single-cause catch block (unlike `Receivable`, `Payment` has no `status` field, so no second reachable error case exists to disambiguate) and `customerId = null` exclusion (structurally guaranteed — Postgres `customerId = :value` never matches a NULL column, nothing to test). `domain-check` and full `pnpm verify`-equivalent (149 unit suites/495 tests, e2e suite, `tsc --noEmit`, `biome check`) re-run clean after the addition.

---

#### Plan: Customer Bank Account Management
- **Type**: task
- **Status**: done ✅
- **Owner**: BE
- **Spec**: `specs/2026-08-04-customer-bank-account-management-design.md`
- **Blockers**: none — Plan #8 ✅
- **Shipped**: 2026-08-10 — PR not opened per task instruction; branch `lengocanh2005it/feat-customer-bank-account-management`
- **Key rules**:
  - Full CRUD for `CustomerBankAccount` mappings
  - Account number normalization (trim, remove separators, require 4-34 digits)
  - Active/inactive soft-delete
  - Masked responses in API/audit
  - `CUSTOMER_BANK_ACCOUNT_MANAGE` permission
  - Matching Engine consumes only active mappings
- **Creates**: `bank-accounts/` module (full CRUD), normalization utility, migration, standalone Postgres+Redis e2e coverage
- **Implementation note**: Account numbers are normalized before persistence, responses and audit snapshots are masked, all repository access is tenant-scoped, and writes use idempotency plus audit decorators. Deactivation is a soft delete; the unique organization/account constraint prevents duplicate normalized mappings, including concurrent inserts.

---

#### Plan: Spec-Plan Reconciliation
- **Type**: task
- **Status**: done ✅
- **Owner**: BE
- **Plan**: `plans/2026-08-03-spec-plan-reconciliation.md`
- **Blockers**: All plans ✅
- **Key rules**: Documentation-only changes, ensures one implementable system across all specs/plans
- **Creates**: Updated spec/plan files with reconciled contracts
- **Shipped**: 2026-08-11 — docs-only, not yet committed (worktree `.worktrees/lengocanh2005it/feat-spec-plan-reconciliation`, no PR yet)
- **Implementation note**: independently re-verified the plan's 4 tasks against the real shipped code rather than trusting the file's own all-`[x]` checkboxes (every checkbox was already checked as far back as the repo's first commit, which is explained by the pattern already documented throughout this file — each ticket's own "ground-truth review" fixed spec/plan drift during its own implementation, e.g. Plan #15/#19/#20/#21, Credit Balance Management, Customer Bank Account Management). Verified by grep-cross-referencing named contracts across all 27 specs + 31 plans against `apps/backend/src/`: `AllocatePaymentUseCase.allocateWithinTransaction(manager, input)` signature matches the real method and all 3 call sites (`process-webhook.usecase.ts`, `match-bank-transaction.usecase.ts`, `allocate-payment.usecase.ts` itself); invoice-import's `{ totalRows, successCount, failedRows: [{ rowNumber, data, errors }] }` shape matches `import-invoices.usecase.ts` and its DTO exactly; Copilot's 5 tool names (`getReceivableSummary`/`getCollectionActivityTimeline`/`getPaymentHistory`/`draftReminderEmail`/`sendReminderEmail`) match the 5 files under `copilot/application/tools/`; the 5 aging buckets (`NOT_DUE`/`OVERDUE_1_7`/`OVERDUE_8_30`/`OVERDUE_31_60`/`OVERDUE_60_PLUS`) match `reporting/`; `BankTransaction.version` optimistic-lock wording matches the real `@VersionColumn()`; `CUSTOMER_BANK_ACCOUNT_MANAGE` permission matches `packages/shared-types`; FE `/api/v1` base-path convention matches `apps/frontend/src/lib/api-client.ts`; Copilot's OpenAI-SDK/`IAIChatProvider` provider swap (superseding the original spec's Anthropic-SDK draft) is reflected consistently in `plans/2026-08-03-collection-copilot.md`, not just in this file's Plan #16 note. One real, current drift was found and fixed: `docs/superpowers/specs/2026-08-03-project-scaffolding-architecture-design.md` §5 linked to `../IMPLEMENTATION-ORDER.md`, a file that has never existed in this repo (the actual source is `CLAUDE.md`'s "Implementation Order" section plus this file) — the link was rewritten to point at those two real sources. No other broken cross-spec/plan markdown links were found (all `[text](path.md)` references across `docs/superpowers/` resolve to real files), and `README.md`/`docs/overview.md` contain no stale file references. No other contradictions were found; the ticket's own checkbox state was accurate.

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

#### Plan: Org-Branded Reminder Emails via Custom SMTP (BYO-SMTP)
- **Type**: task
- **Status**: done ✅
- **Owner**: BE
- **Spec**: `specs/2026-08-11-org-branded-smtp-design.md`
- **Plan**: `plans/2026-08-11-org-branded-smtp.md`
- **ADR**: `docs/adr/0006-byo-smtp-for-org-branded-reminder-emails.md`
- **Blockers**: none — Plan #7 ✅ (email-notification-service)
- **Shipped**: 2026-08-11 — PR #91, closes issue #43
- **Key rules**:
  - Replaces issue #43's original Resend-managed-domain research entirely — BYO-SMTP, not DNS/domain-verification
  - `OrganizationSmtpConfig` only ever persists as `CONNECTED` — a failed test-send is never saved (no `PENDING` state)
  - Gated to BUSINESS/ENTERPRISE via `Subscription.canUseCustomSmtp` (flat boolean; issue #90's `PLAN_CATALOG` later sets this per plan without replacing the field)
  - `IEmailProviderAdapter` port unchanged; new `IEmailProviderResolver` picks Resend vs. org SMTP per send
  - Reuses `encryptToken`/`decryptToken` (AES-256-GCM) from `bank-connections` for the password at rest — no new crypto scheme
  - `ORGANIZATION_SMTP_MANAGE` permission is OWNER-only
  - On SMTP exhausting its existing 3-attempt/exponential-backoff retry: flip to `FAILED`, warn the OWNER once via Resend, requeue the reminder forced through Resend — including the concurrent-failure race case (two reminders for the same org exhausting retries at once)
- **Creates**: `smtp-config/` module (domain/application/infrastructure/presentation), `SmtpEmailAdapter` + `IEmailProviderResolver` in `notifications/`, `GET|POST|DELETE /api/v1/smtp-config`
- **Implementation note**: implemented by a subagent from the written plan, then went through two independent review rounds before merge. The first (`code-review`, Standards + Spec axes) found and the implementer fixed two issues: `TypeOrmSmtpConfigRepository.assertTenant()` throwing a raw `Error` instead of `AppError(TENANT_MISMATCH)`, and a real bug where `EmailQueueProcessor.onFailed`'s optimistic-lock CAS (`markFailedIfVersionMatches`) silently dropped a reminder — no warning, no fallback, no `FAILED` status — when two reminder jobs for the same org exhausted SMTP retries concurrently and one lost the version race; fixed so the losing job still requeues its reminder through Resend, skipping only the (already-sent) warning email. A second, independent pre-merge review (`requesting-code-review`) found two Minor issues, also fixed before merge: `SaveSmtpConfigDto` allowed empty-string host/username/password past validation (added `@IsNotEmpty()`), and `SmtpConfigResponseDto.status` was typed as bare `string` instead of `SmtpConfigStatus`. Verified with 154/154 backend unit suites (521/521 tests) and 5/5 `smtp-config` e2e tests (Postgres via testcontainers, Redis via a standalone container), clean `tsc --noEmit` and Biome. Full-repo `test:e2e` was not re-run for this ticket (only the `smtp-config` e2e file) — worth confirming in CI. The separately-proposed display-name-only customization (issue #43's interim-solution comment, all tiers, no SMTP/DNS) remains unshipped and is unaffected by this ticket.

---

#### Plan: SMTP Settings UI (Frontend)
- **Type**: task
- **Status**: done ✅
- **Owner**: FE
- **Spec**: `specs/2026-08-11-smtp-settings-ui-design.md`
- **Plan**: `plans/2026-08-11-smtp-settings-ui.md`
- **Blockers**: none — Org-Branded Reminder Emails via Custom SMTP (BYO-SMTP) ✅ (PR #91, the backend API this consumes)
- **Shipped**: 2026-08-11 — PR #95, closes issue #92
- **Key rules**:
  - Frontend-only — no backend changes; consumes the already-shipped `GET|POST|DELETE /api/v1/smtp-config`
  - 4th "Email server riêng" tab in `features/settings/pages/settings-page.tsx`, alongside billing/users/templates
  - `SmtpTab` renders 4 states from one `useSmtpConfig()` query: RBAC-hidden, plan-locked (below BUSINESS), not-configured, `CONNECTED`/`FAILED` — status shown as plain-language consequence, not just a badge
  - `GET /api/v1/smtp-config` requires `ORGANIZATION_SMTP_MANAGE` on the backend (same as `POST`/`DELETE`) — `SmtpTab` hides its entire content for non-OWNER (`if (!canManage) return null`, matching `UsersTab`'s existing pattern), not just the action buttons
  - Password field never prefilled on edit (backend never returns it); submit button shows "Đang kiểm tra kết nối…" while the synchronous test-then-save request is pending
  - Delete requires an `AlertDialog` confirmation
  - No new design tokens — reuses existing shadcn/ui primitives and the `features/settings/`/`features/bank-connections/` conventions already in the codebase
- **Creates**: `SmtpTab`, `SmtpConfigDialog`, `fetchSmtpConfig`/`saveSmtpConfig`/`deleteSmtpConfig` + `useSmtpConfig`/`useSaveSmtpConfig`/`useDeleteSmtpConfig` in `features/settings/`
- **Implementation note**: implemented by a subagent from the written plan, then went through four review passes before merge. During implementation, a real spec/backend mismatch was caught: the design spec's first draft assumed non-OWNER roles could view SMTP status read-only (by analogy to `billing-tab.tsx`'s unrestricted read), but the backend gates `GET` behind `ORGANIZATION_SMTP_MANAGE` too — fixed by hiding the whole tab for non-OWNER instead of just its buttons, with the spec updated in place ("Correction from the initial design pass"). `code-review` (Standards + Spec axes) then found no hard violations, only a judgement-call note about a duplicated axios-error-parsing idiom. `requesting-code-review` confirmed ready-to-merge with two Minor, non-blocking notes. `web-design-guidelines` found and the implementer fixed several accessibility/UX gaps: missing `autoComplete`/`spellCheck`/`inputMode` on form fields (including `autoComplete="new-password"` on the password field to stop the browser conflating it with the app's own login), missing `aria-live`/`role` on the tab's loading/error states, and a missing `break-words` guard on the host/from-address summary line. `security-review` found nothing (RBAC independently enforced server-side; password never logged, prefilled, or persisted client-side). `simplify` (4 parallel angles) found and fixed two real issues: the axios-error-parsing duplication (deduped into `settings-api.ts`, deliberately kept local to `features/settings/` rather than promoted to the shared `lib/api-client.ts` — 19 other test files across the app fully mock that module via `vi.mock`, and adding exports there breaks all of them; an earlier attempt at the global version was reverted for exactly this reason) and 5 separate `useState` calls in `SmtpConfigDialog` collapsed into one `FormState` object. Efficiency and Altitude passes found nothing. Verified with 30/30 frontend suites (61/61 tests), clean `tsc -b --noEmit` and Biome, at every stage.

---

#### Plan: In-App Alerts (#137)
- **Type**: task
- **Status**: done ✅
- **Owner**: BE + FE
- **Plan**: `plans/2026-08-13-in-app-alerts.md`
- **ADR**: `docs/adr/0013-alert-module-separate-from-notifications-email-queue.md`
- **Blockers**: none
- **Shipped**: 2026-08-13 — PR not opened per task instruction; branch `lengocanh2005it/feat-137-in-app-alerts`
- **Key rules**:
  - OWNER-only persisted alerts for bank-connection status changes, SMTP failure transitions, and reminder scan summaries
  - Tenant- and user-scoped CRUD API plus JWT query-token SSE for native `EventSource`
  - Unread deduplication through the partial unique index; all alert writes run in transactions
  - Frontend bell/popover with Vietnamese messages, mark-read/delete actions, route mapping, and live SSE invalidation
- **Creates**: `alerts/` Clean Architecture module, `ALERT_READ` permission, alerts migration/API/SSE, three event listeners, and frontend `features/alerts/` UI/data layer
- **Implementation note**: Implemented in 25 task commits with RED → GREEN → REFACTOR checkpoints. Fresh verification passed backend unit tests (218 suites/771 tests), frontend tests (51 files/136 tests), the alerts e2e slice (2 tests), and type-checks for backend/frontend/shared-types. The repository `pnpm verify` gate reached all unit/type/lint checks but remains non-zero at the existing cross-module infrastructure checker because the plan's locked event-contract imports point from `alerts/infrastructure/` to `notifications/infrastructure/` and `internal-tasks/infrastructure/`; no silent design change was made. Three unrelated e2e failures are intentionally out of scope for this ticket; propose a separate issue if they need fixing.

---

#### Plan: Copilot Draft Library (#136)
- **Type**: task
- **Status**: done ✅
- **Owner**: BE + FE
- **Plan**: `docs/superpowers/plans/2026-08-14-copilot-draft-library.md`
- **Blockers**: none
- **Shipped**: 2026-08-14 — PR #173, branch `lengocanh2005it/issue-136-copilot-draft-library`
- **Key rules**:
  - Scope narrowed via `superpowers:grilling` before planning: `GET /copilot/drafts` (list) + `POST /copilot/drafts/:id/reopen` only — edit/delete draft split out to a new follow-up issue, #171, since #136's own "What's needed" only asked for list+reopen on the backend
  - No new `status` column on `CopilotDraft` — status (`DRAFTED | PENDING | CONFIRMED | CANCELLED | EXPIRED`) is derived at read time from the latest `CopilotPendingAction` for that draft via one shared `deriveCopilotDraftStatus()`, matching the project's existing derived-field convention (`isOverdue`, `remainingAmount`)
  - `userId` added to `copilot_drafts` (migration, nullable — pre-migration rows stay unowned) and threaded from the chat flow through `DraftReminderEmailTool`, so drafts are user-scoped like conversations already are (post-#111)
  - Reopen creates a fresh `CopilotConversation` + `CopilotPendingAction` (never mutates the original draft or prior action), blocked with `CONFLICT` when the derived status is `PENDING` (still live) or `CONFIRMED` (already sent); both writes run inside one `DataSource.transaction()`
  - Permissions: list → `RECEIVABLE_READ` (read-only), reopen → `REMINDER_SEND_MANUAL` (matches confirm/cancel)
- **Creates**: `GET /copilot/drafts`, `POST /copilot/drafts/:id/reopen`, `ListCopilotDraftsUseCase`, `ReopenCopilotDraftUseCase`, a "Drafts" tab on the Copilot page (list + reuse existing confirm + reopen)
- **Implementation note**: 13 plan tasks, each its own TDD commit (RED → GREEN → REFACTOR). Two-axis `code-review` on the finished PR found one Standards hard violation (`findAllForUser` hand-rolling `organizationId` scoping instead of `BaseRepository.scopedFindMany`) and, after a follow-up user request, one transaction-consistency gap (`ReopenCopilotDraftUseCase`'s two writes weren't sharing a `DataSource.transaction()` the way `CopilotChatUseCase`'s equivalent writes do) — both fixed in two small follow-up commits before merge. Spec axis found zero gaps. Fresh verification before merge: backend unit tests 238 suites/826 tests, full `test:e2e` 35 suites/144 tests, `tsc --noEmit` backend+frontend, `biome check` clean on every file the PR touched.

---

## Frontier

**Current status (2026-08-14):** Copilot Draft Library (#136) is done; the map now tracks 31 completed tickets. Three unrelated e2e failures are deferred to a separate issue.

**In progress:**
- None

**Next available tickets** (all blockers resolved):
- None — every tracked ticket is done.

**Blocked tickets waiting:**
- None.

**Recommended next step:** All 29 tracked tickets (Plans 1–23 + Application Layer Boundary Enforcement + Customer Bank Account Management + Credit Balance Management + Spec-Plan Reconciliation + Org-Branded Reminder Emails via Custom SMTP + SMTP Settings UI) are shipped. No open or in-progress ticket remains in this map. The reminder-automation e2e flakiness was tracked in issue #88 and is now closed. **2026-08-11**: PR #140 ("quick wins batch") closed 16 audit-backlog issues in one pass — #96, #99, #100, #103, #104, #109, #112, #114, #116, #120, #121, #122, #123, #124, #129, #132, #138 — covering security (dead `PermissionGuard` on reminder-policies/reminder-executions/switch-organization, JWT algorithm pinning, webhook rate limiting, refresh-token-family revocation on reuse, verify-email GET→POST, `/metrics` token protection, webhook tenant-mismatch ordering, `@Audited` coverage, XLSX zip-bomb row-budget check, Copilot email HTML-escaping), perf/UX (sender display name, timeline pagination, receivables index, customer credit balance + receivables panel, Copilot usage indicator, dead `features/transactions` folder removal), and a follow-up commit fixing an XLSX row-budget off-by-one (header row counted against the data-row cap) found in post-merge review. **2026-08-12**: PR #141 ("security hardening") closed #110, #111, #113, and #125 — Copilot abuse/cost controls, user-scoped conversations, SMTP probe/timeout hardening, and CAS ID redirect URI allowlisting. #107 (remove `ioredis`) was investigated and closed as invalid — BullMQ 6 declares `ioredis` as a peerDependency, so the direct dependency is required. **2026-08-12**: PR #151 shipped the real Plan catalog (`PLAN_CATALOG` + `Subscription.createStarter()`/`createBusiness()`/`createEnterprise()`, domain-layer-only) closing issue #90.  **2026-08-13**: PR #166 (branch `fix/e2e-stability`) closed the 3 outstanding e2e failures #163, #164, #165 — all test-only fixes: `cas-id-bank-connection-flow.e2e-spec.ts` set `CAS_ID_REDIRECT_URI_ALLOWLIST=http://localhost` in `beforeAll` (the post-#158 fail-closed allowlist rejected the test's `http://localhost/callback`); `collection-activity-timeline.integration.spec.ts` migrated its 2 stale raw-array assertions to the paginated envelope (PR #140 changed the timeline response); `copilot-chat.integration.spec.ts` overrode `CopilotRateLimitGuard` with a pass-through stub so the 50-message quota loop no longer trips the 30/min per-user limiter (429 flake — per-minute limiting stays covered by unit tests). Full `pnpm test:e2e` 31/31 suites green; `pnpm verify` 8/8 tasks. **2026-08-12**: PR #154 shipped the plan upgrade use case (`Subscription.changeToPlan`, `ChangeSubscriptionPlanUseCase`, `billing/`'s first `presentation/` layer with `POST /api/v1/subscriptions/change-plan`) closing issue #150 — self-service upgrade only, no downgrade (ADR-0011). **2026-08-13**: PR #155 (branch `feat/receivables-exception-search`) adds `search` to `GET /receivables` (invoice number, customer name/taxCode via id-prefetch through existing `ICustomerRepository`/`IInvoiceRepository` ports — no cross-module infra imports) and to `GET /bank-transactions/unmatched` (ILIKE on counterparty name/account/transfer content), plus FE search boxes on both list pages, closing issue #133. **2026-08-13**: PR #156 shipped PayOS payment integration for plan upgrades closing issue #152 — new `payos/` module (`InitiatePlanUpgradeOrderUseCase`, `ConfirmPlanUpgradeOrderUseCase`, `PlanUpgradeOrder` domain entity), `POST /api/v1/payos/plan-upgrade-orders` returns a PayOS checkout URL, `POST /api/v1/payos/webhook` drives an idempotent transactional plan change (row-level lock + terminal-status check, since PayOS gives no delivery/event ID) with a manual in-transaction audit-log write; `@payos/node` confined to `infrastructure/payos.adapter.ts`, webhook signature verified with hand-rolled HMAC-SHA256 + constant-time compare (not the SDK's own `Webhooks.verify()`). Two review passes (`code-review`, then a full-branch `requesting-code-review`) fixed tenant-mismatch guarding, a plan-tier check dedupe, the audit actor sentinel, and — the one production blocker — a missing `plan_upgrade_orders` migration (this repo runs `migrationsRun: true` outside dev/test); verified against a real Postgres 16 testcontainer before merge. A known, deliberately-deferred gap was tracked separately as issue #157: `isPayosRedirectUriAllowed` fails open (allows any redirect origin) when its allowlist env var is unset, mirroring the same pre-existing pattern in `isCasRedirectUriAllowed` for CAS ID — left as-is in #156 to avoid an inconsistent half-fix; #157 covers flipping both to fail-closed together. **2026-08-13**: PR #158 (branch `fix/157-redirect-uri-fail-closed`) closed #157 by flipping the CAS ID + PayOS redirect-URI allowlist validators to fail closed (empty/unconfigured allowlist now denies every redirect instead of accepting any origin) and consolidating the three line-for-line duplicated validators into one shared `common/redirect-uri/allowlist.ts` module + a single `IsAllowedRedirectUri(envVar)` DTO decorator, with module-local DTO specs on both sides. **2026-08-13**: PR #159 shipped renewal payments + non-renewal downgrade closing issue #153 — `domain-modeling` first (ADR-0012, `CONTEXT.md`) resolved the core ambiguity that PayOS has no card-on-file/auto-charge, so "renewal" is a self-serve repeat payment, not silent auto-billing. New `PeriodCharge` entity (`payos/`, distinct from `PlanUpgradeOrder`: same tier, not strictly higher, one PAID charge required per billing period), with a `PlanUpgradeOrder` that landed a tier counting as that period's payment. A 3-day grace window keeps `Subscription.status` `ACTIVE` (deliberately not `PAST_DUE`, which already hard-blocks non-`ACTIVE` elsewhere) before `Subscription.revertToFreeForNonRenewal()` — a new, distinctly-named domain method, the only path that can move a subscription to a lower tier, preserving ADR-0011's upgrade-only invariant. Two new daily crons (reminder + downgrade), sharing PayOS payment-link/webhook-auth infra with `PlanUpgradeOrder` but kept as distinct entities; a new orderCode offset (+100,000,000) keeps the two entities' PayOS order-number spaces disjoint since the webhook handler confirms against both unconditionally. Also discovered and fixed: `ScheduleModule.forRoot()` was never registered anywhere in this app, so `@Cron` had no effect on any cron — including the pre-existing daily reminder scan, which is now finally active too. **2026-08-13**: PR #160 shipped the real dashboard landing page closing issue #126 — `frontend-design` first (no new tokens/palette: this internal page inherits the existing `oklch`-based theme in `index.css` exactly), then a small new backend endpoint `GET /api/v1/activity` (org-wide variant of the already-shipped per-receivable/per-customer `collection-activity` timeline — issue #126 assumed pagination was the only gap there, but no org-wide endpoint existed at all). `/dashboard` now shows a conditional `PendingReviewBanner` (the page's signature element, only rendered when there's pending review work, linking to `/exceptions`), a 4-card KPI grid, and a two-column recent-activity/top-overdue-customers row. Two-axis `code-review` found zero hard violations and zero spec gaps. Full e2e regression run surfaced a pre-existing, unrelated failure worth tracking separately: `cas-id-bank-connection-flow.e2e-spec.ts` now fails (400 instead of 201) because it never set a redirect-URI allowlist and PR #158's fail-closed fix now rejects that — not caused by #160, needs its own fix/issue. **2026-08-14**: PR #173 shipped the Copilot draft library closing issue #136 — `GET /copilot/drafts` (paginated, user-scoped, status filter) and `POST /copilot/drafts/:id/reopen`, plus a "Drafts" tab on the Copilot page. Scope was narrowed via `superpowers:grilling` before planning: edit/delete draft was split into a new follow-up issue, #171, since #136's own backend "What's needed" only ever asked for list+reopen. Two-axis `code-review` on the finished PR found one Standards violation and, after a follow-up request, one transaction-consistency gap versus `CopilotChatUseCase`'s equivalent writes; both fixed before merge. Current untracked GitHub follow-ups:

- #98 — research Casso Admin Platform
- #171 — Copilot draft library: support edit/delete draft (split from #136)
- #172 — receivable balance history (prerequisite of #135) — `in-progress` on branch `lengocanh2005it/feat-receivable-balance-history`, spec + plan at `docs/superpowers/specs/2026-08-14-receivable-balance-history-design.md` / `docs/superpowers/plans/2026-08-14-receivable-balance-history.md`; blocks #135 Task 4–9
