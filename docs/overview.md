# CASSO Accounts Receivable Automation — Project Overview

## 1. Product Introduction

- **Project title (VI):** Building a platform for automated management and collection of corporate receivables based on real-time bank transaction data.
- **Project title (EN):** Design and Development of a Real-Time Accounts Receivable Automation Platform.
- **Product:** A B2B SaaS platform built by CASSO. The system helps businesses track receivables, automatically remind customers to pay, connect bank accounts through Cas ID, receive transaction data from CASSO Balance Hook, automatically match transactions to receivables, and close receivables when paid in full.
- **Positioning:** *A platform that automates the entire accounts-receivable lifecycle using real-time bank transaction data* — the key differentiator is direct connection to actual cash flow, not merely invoice-list management.

## 2. Users

| Audience | Role |
|---|---|
| **CASSO** | Builds and operates the platform; provides bank-data connections; manages subscription/billing; collects SaaS fees. |
| **Businesses (CASSO customers)** | Direct product users: manage receivables, configure reminder schedules, monitor transactions, handle exceptions, and view reports. |
| **Business roles** | AR accountant, chief accountant, finance staff, customer-facing sales staff, finance manager, business owner/CEO. |
| **Businesses' end customers** | Individuals/businesses that owe money; they do not log in, but receive reminder emails, invoice information, and payment-confirmation receipts. |
| **Cas ID** | The **consent and bank-account connection layer** — connects bank accounts, verifies/grants data access, manages authorizations, and revokes access. It is **NOT SSO** for this product and does not replace AR Automation's login system. |

## 3. Problem & Value

Current manual collection process (10 condensed steps):

1. Issue invoice / record receivable → 2. Track due dates in Excel → 3. Review due/overdue invoices → 4. Email/call each customer → 5. Log into multiple bank accounts to check funds → 6. Read transfer references → 7. Match transactions to invoices → 8. Update paid amounts → 9. Stop reminders when fully paid → 10. Compile management reports.

**Problems:** time spent checking banks; reminders are easy to forget; customers use incorrect transfer references, pay partially, or pay multiple invoices in one transaction; paid customers still receive reminders; collection cash flow is hard to forecast; reminder history is missing.

**Value:** reduce accounting time; record payments automatically when money arrives; reduce reminders sent to customers who have paid; increase on-time collection; reduce overdue receivables; prioritize work; forecast collections over 7/14/30 days; create a commercializable SaaS product for CASSO.

## 4. General Business Flow

```text
Create invoice / receivable (manually or by Excel/CSV import)
        ↓
Configure reminder schedule by customer group (VIP/REGULAR) + number of days from dueDate
        ↓
Connect bank account through Cas ID (OAuth-style, QR scan)
        ↓
CASSO Balance Hook sends transaction webhook
        ↓
Authenticate → WebhookInbox (idempotent) → Normalizer → Matching Engine
        ↓
┌────────────────────────┬───────────────────────┬────────────────┐
│ score ≥ 90             │ score 60–89           │ score < 60     │
│ Auto payment allocation│ Exception Queue       │ UNMATCHED      │
└────────────────────────┴───────────────────────┴────────────────┘
        ↓
Update paidAmount → close receivable when fully paid (PAID), cancel remaining reminders
        ↓
Aging reports / collection forecasts / Copilot accounting assistance
```

## 5. Business Example

Example from [domain-core spec section 5](docs/superpowers/specs/2026-08-03-domain-core-design.md):

```text
Invoice INV-2026-0012: 50.000.000 VND, due 20/08/2026
→ Receivable R1 (status OPEN, originalAmount 50.000.000)

Payment P1: 30.000.000 (payerName "Company B")
→ PaymentAllocation P1 → R1: 30.000.000
→ R1.paidAmount = 30.000.000, remainingAmount = 20.000.000 → PARTIALLY_PAID

Payment P2: 25.000.000
→ PaymentAllocation P2 → R1: 20.000.000 (only the remaining amount needed)
→ P2.unallocatedAmount = 5.000.000 → retained as Company B's credit balance
→ R1.paidAmount = 50.000.000, remainingAmount = 0 → PAID (terminal)
→ Cancel remaining reminder, send confirmation email
```

## 6. Functional Modules

| Module | Spec |
|---|---|
| Organization / Multi-tenancy | [multi-tenancy-rbac-design](docs/superpowers/specs/2026-08-03-multi-tenancy-rbac-design.md) |
| Customer | [domain-core-design](docs/superpowers/specs/2026-08-03-domain-core-design.md) |
| Invoice | [domain-core-design](docs/superpowers/specs/2026-08-03-domain-core-design.md) + [invoice-import-design](docs/superpowers/specs/2026-08-03-invoice-import-design.md) |
| Receivable | [domain-core-design](docs/superpowers/specs/2026-08-03-domain-core-design.md) |
| Reminder | [reminder-automation-design](docs/superpowers/specs/2026-08-03-reminder-automation-design.md) |
| Email template | [email-template-management-design](docs/superpowers/specs/2026-08-03-email-template-management-design.md) |
| Cas ID / bank connection | [cas-id-bank-connection-design](docs/superpowers/specs/2026-08-03-cas-id-bank-connection-design.md) |
| Webhook + matching | [webhook-matching-engine-design](docs/superpowers/specs/2026-08-03-webhook-matching-engine-design.md) |
| Payment allocation | [domain-core-design](docs/superpowers/specs/2026-08-03-domain-core-design.md) |
| Exception queue + Audit log | [exception-queue-audit-log-design](docs/superpowers/specs/2026-08-03-exception-queue-audit-log-design.md) |
| Aging / reporting | [aging-dashboard-reporting-design](docs/superpowers/specs/2026-08-03-aging-dashboard-reporting-design.md) |
| Dispute | [dispute-management-design](docs/superpowers/specs/2026-08-03-dispute-management-design.md) |
| Collection activity | [collection-activity-timeline-design](docs/superpowers/specs/2026-08-03-collection-activity-timeline-design.md) |
| Internal task | [internal-task-escalation-design](docs/superpowers/specs/2026-08-03-internal-task-escalation-design.md) |
| Copilot | [collection-copilot-design](docs/superpowers/specs/2026-08-03-collection-copilot-design.md) |
| Auth | [authentication-onboarding-design](docs/superpowers/specs/2026-08-03-authentication-onboarding-design.md) |
| Billing | [billing-usage-metering-design](docs/superpowers/specs/2026-08-03-billing-usage-metering-design.md) |
| Frontend / Scaffolding / Testing / Deployment | [frontend-design-system](docs/superpowers/specs/2026-08-03-frontend-design-system.md) · [project-scaffolding-architecture-design](docs/superpowers/specs/2026-08-03-project-scaffolding-architecture-design.md) · [testing-strategy-design](docs/superpowers/specs/2026-08-03-testing-strategy-design.md) · [deployment-observability-design](docs/superpowers/specs/2026-08-03-deployment-observability-design.md) |

Details for each module (entities, business rules, and designed states) are in the corresponding spec.

## 7. AI — Collection Copilot

Designed according to the [collection-copilot spec](docs/superpowers/specs/2026-08-03-collection-copilot-design.md) — **tool-based chat**, not two fixed actions:

```
Tools (read-only, return precomputed structured data, not raw SQL):
  getReceivableSummary(customerId)
  getCollectionActivityTimeline(customerId, limit)
  getPaymentHistory(customerId, limit)

Tools (actions, confirmation required):
  draftReminderEmail(receivableId, tone?) → create draft, DO NOT send
  sendReminderEmail({draftId, receivableId}) → suggestion only; only the code-only confirm endpoint actually sends
```

**Single chat-turn flow:**

1. User sends a message → the model calls 0..N read tools to obtain context.
2. The model proposes `sendReminderEmail` → **never run it during the model turn**: intercept it as a `CopilotPendingAction` returned to the UI as a confirmation card.
3. User clicks "Confirm" → FE calls `POST /api/v1/copilot/actions/:id/confirm`; clicking cancel calls `POST /api/v1/copilot/actions/:id/cancel` → **code-only endpoints** (do not pass through the LLM); only confirmation executes email sending through EmailService.

**Required guardrails:** hard 15s timeout per model turn, at most 1 retry; pending action expires after 10 minutes (`EXPIRED`); every request records `AIUsageLog`; do not put accessToken/credentials in the prompt; tools return only data within the user's `organizationId`; only users with `REMINDER_SEND_MANUAL` see the action; write-off/allocate/dispute **never** have Copilot tools — a hard boundary.

## 8. Scope & Out of Scope

**Architecture:** modular monolith — one process, separable into services if needed later.

**Excluded from MVP scope (following section 9 of the original document):**

- Full microservices; Kafka (BullMQ is sufficient); production-grade Kubernetes.
- ML-based cash flow forecasting (retain rule-based naive forecast for 7/14/30 days); general chatbot.
- CASSO Admin portal; complete customer portal for end customers.
- Zalo OA/SMS at the same time; multi-provider production ERP/CRM connectors.
- Complex multi-currency; automatic transfers/collections; system-wide event sourcing.
- SSO/OAuth social login, 2FA/MFA (later Enterprise).

## 9. Pricing & Billing Model

Theo [billing-usage-metering spec](docs/superpowers/specs/2026-08-03-billing-usage-metering-design.md):

**2 metric gate MVP:**

```
receivablesThisMonth  = COUNT(Receivable WHERE organizationId=? AND createdAt within period)
activeBankConnections = COUNT(BankConnection WHERE organizationId=? AND status='ACTIVE')
```

- Count **at write time from source tables** (`receivables`, `bank_connections`) — there is **no usage-tracking table** (`UsageRecord`/`UsageAggregate`).
- Hard-block in the same create transaction: over the limit → `402 "Plan limit {planName} reached; upgrade to continue"` (applies to `POST /receivables` and `POST /bank-connections/cas-id/sessions/:id/exchange`).
- `Subscription` snapshots both limits; there is no `Plan` catalog table in the MVP; signup always creates `Subscription(ACTIVE, FREE)` in the same transaction.

**Reference plans (brainstorm pricing, not official):**

| Plan | Receivable/month | Bank connection | Notes |
|---|---|---|---|
| FREE | 50 | 1 | Basic dashboard, Excel import |
| STARTER | 500 | 2 | Automatic reminders, basic matching, partial payments |
| BUSINESS | 5.000 | Many | Custom reminder policies, Exception Queue, advanced reporting |
| ENTERPRISE | Custom | Custom | SSO, multiple legal entities, SLA (out of MVP) |

Out of scope: overage billing, grace period, automatic billing invoices through CASSO.

## 10. Authorization

5 fixed roles according to [multi-tenancy spec section 2](docs/superpowers/specs/2026-08-03-multi-tenancy-rbac-design.md) (hardcoded in code, with no dynamic Role/Permission tables):

| Permission | OWNER | FINANCE_MANAGER | ACCOUNTANT | SALES_REP | VIEWER |
|---|---|---|---|---|---|
| RECEIVABLE_READ | ✔ | ✔ | ✔ | ✔ (limited) | ✔ |
| RECEIVABLE_WRITE | ✔ | ✔ | ✔ | — | — |
| RECEIVABLE_WRITE_OFF | ✔ | ✔ | — | — | — |
| RECEIVABLE_DISPUTE | ✔ | ✔ | ✔ | — | — |
| PAYMENT_ALLOCATE / UNDO | ✔ | ✔ / ✔ | ✔ / — | — | — |
| REMINDER_POLICY_WRITE | ✔ | ✔ | — | — | — |
| REMINDER_SEND_MANUAL | ✔ | ✔ | ✔ | — | — |
| BANK_CONNECTION_MANAGE | ✔ | — | — | — | — |
| SUBSCRIPTION_MANAGE / USER_MANAGE | ✔ | — / ✔ | — | — | — |
| REPORT_READ | ✔ | ✔ | ✔ | ✔ | ✔ |
| AUDIT_LOG_READ | ✔ | ✔ | — | — | ✔ |

- Permission checks happen on the **backend through** `@RequirePermission(Permission.X)` and `PermissionGuard`.
- **The FE hides buttons when permission is missing** (does not disable them) through `hasPermission(role, permission)` from `shared-types` (`ROLE_PERMISSIONS` is shared by BE/FE).
- **SALES_REP exception:** can view only receivables for assigned customers — filter `WHERE salesRepresentativeId = ctx.userId` at the **Service layer**, outside the shared PermissionGuard.
- The JWT payload embeds `role` (effective for at most 15 minutes after a role change; delay is accepted).

## 11. Technical Architecture

According to the [project-scaffolding spec](docs/superpowers/specs/2026-08-03-project-scaffolding-architecture-design.md) and [deployment spec](docs/superpowers/specs/2026-08-03-deployment-observability-design.md):

```
casso-ledger/ (pnpm + Turborepo)
  apps/backend/     NestJS 10 modular monolith (API + BullMQ worker in the same process)
  apps/frontend/    React 19 + Vite + Tailwind v4 + shadcn/ui ("new-york"/"neutral")
                    + TanStack Query + React Router 7 + sonner + recharts + qrcode.react
  packages/shared-types/   status enums, Permission/ROLE_PERMISSIONS, DTO shapes shared by BE/FE
```

**Four-layer Clean Architecture for each BE module** (`domain/application/infrastructure/presentation`):

- `domain/`: plain TS entities, state machine, domain errors — **does not import NestJS/TypeORM**.
- `application/`: use-case + port interface (`I<Entity>Repository`, `EmailProviderAdapter`, `CasIdIntegrationAdapter`).
- `infrastructure/`: TypeORM repositories and concrete adapters (Resend, mock/real Cas ID).
- `presentation/`: controller, DTO, DI wiring. Dependency: `presentation → application → domain`, `infrastructure → application`.

**Core stack:** PostgreSQL 16 (shared-schema, TypeORM) + Redis/BullMQ (queue, daily cron); Jest + testcontainers (real Postgres/Redis for integration tests); Biome (format+lint, replacing ESLint/Prettier); Docker Compose 4 services (backend, frontend/nginx, postgres, redis); `GET /health` (503 if a dependency fails), `GET /metrics` (Prometheus, 4 required series), structured JSON logs to stdout.

**Webhook flow (according to the [webhook spec](docs/superpowers/specs/2026-08-03-webhook-matching-engine-design.md)):**

```text
CASSO Balance Hook (POST /webhooks/casso-balance-hook)
  → authenticate client ID + secret key headers (constant-time compare), invalid → 401
  → insert WebhookInbox, unique(providerTransactionId); duplicate → immediate 200, no further processing
  → Queue (BullMQ) → Transaction Normalizer → Matching Engine
  → score ≥ 90: automatic Payment Allocation
  → score 60–89: Exception Queue
  → score < 60: status = UNMATCHED
```

## 12. Important Design Decisions

Only decisions finalized in the specs are listed:

| # | Decision | Details |
|---|---|---|
| 1 | Balance is a rollup | `paidAmount`/`allocatedAmount` are rollups updated **in the same transaction** as allocation/undo; `remainingAmount`/`unallocatedAmount` are derived fields calculated at query time. No service modifies rollups independently. ([domain-core section 2](docs/superpowers/specs/2026-08-03-domain-core-design.md), ADR 0002) |
| 2 | Receivable status | `DRAFT/OPEN/PARTIALLY_PAID/PAID/WRITTEN_OFF/CANCELLED`. `OVERDUE` and `isDisputed` are **computed flags, NOT statuses**. Terminal: `PAID/WRITTEN_OFF/CANCELLED`; `CANCELLED` is valid only when `paidAmount == 0` (once money has arrived, only WRITTEN_OFF is allowed). ([domain-core section 3](docs/superpowers/specs/2026-08-03-domain-core-design.md), ADR 0003) |
| 3 | Money & transaction | Amounts are integer VND (no float); every allocation/write-off/undo runs in **1 locked DB transaction**; allocations exceeding `remainingAmount` are blocked at DB and application layers; Exception Queue uses optimistic lock `version`. ([domain-core section 4](docs/superpowers/specs/2026-08-03-domain-core-design.md), [exception-queue section 1](docs/superpowers/specs/2026-08-03-exception-queue-audit-log-design.md)) |
| 4 | Webhook idempotency | `unique(providerTransactionId)` on `WebhookInbox`; duplicate → 200 no-op; processing errors → retry with backoff up to N times, then **DLQ**. Negative transactions (refunds) do not enter matching. ([webhook section 4](docs/superpowers/specs/2026-08-03-webhook-matching-engine-design.md)) |
| 5 | Email | Sent through **Resend + BullMQ queue** (`attempts: 3`, exponential backoff); worker updates `ReminderExecution` (`SENT` only with `providerMessageId`); Copilot confirmation **does not pass through the LLM**. ([email-notification sections 1-2](docs/superpowers/specs/2026-08-03-email-notification-service-design.md)) |
| 6 | Signup bootstrap | Organization + User + Membership(OWNER) + Subscription(FREE) + **4 default email templates** + default reminder rules created in **1 transaction**. ([auth section 2](docs/superpowers/specs/2026-08-03-authentication-onboarding-design.md), [email-template section 2](docs/superpowers/specs/2026-08-03-email-template-management-design.md)) |
| 7 | Scoring matching | `referenceCodeScore` (0-60) + `amountScore` (0-20) + `customerBankAccountScore` (0-10) + `payerNameScore` (0-5) + `timingScore` (0-5); threshold ≥90 auto / 60-89 exception / <60 unmatched. ([webhook section 3](docs/superpowers/specs/2026-08-03-webhook-matching-engine-design.md)) |
| 8 | Tenant isolation | Shared-schema + `BaseRepository` automatically adds `organizationId`; no RLS in the MVP. ([multi-tenancy section 1](docs/superpowers/specs/2026-08-03-multi-tenancy-rbac-design.md), ADR 0001) |
| 9 | Reporting | Real-time raw SQL, **no precomputation**; index `Receivable(organizationId, status, dueDate)`. ([aging section 1](docs/superpowers/specs/2026-08-03-aging-dashboard-reporting-design.md)) |
| 10 | Reminder race | Split cron scanning (enqueue) from actual sending (re-check fresh state before sending). Cron/"today" uses fixed timezone `Asia/Ho_Chi_Minh`, not server time. ([reminder section 3](docs/superpowers/specs/2026-08-03-reminder-automation-design.md), ADR 0004) |
| 11 | API conventions | Errors return `{ statusCode, errorCode, message, details? }`; FE-called `POST` requests that create or change money/status receive the `Idempotency-Key` header (except webhooks, which already have `providerTransactionId`). ([project-scaffolding section 5](docs/superpowers/specs/2026-08-03-project-scaffolding-architecture-design.md)) |

## 13. Data Model Summary

List of main entities (field details/ERD are in each spec; no ERD is drawn here):

| Entity | One-line description |
|---|---|
| `Organization` / `User` / `Membership` | Tenant + login account + multi-organization membership with role (OWNER/FINANCE_MANAGER/ACCOUNTANT/SALES_REP/VIEWER). ([multi-tenancy](docs/superpowers/specs/2026-08-03-multi-tenancy-rbac-design.md)) |
| `Customer` | Customer who owes money: taxCode, email, phone, payment terms, credit limit, `customerGroup` (VIP/REGULAR). |
| `Invoice` | Invoice: `invoiceNumber`, `totalAmount`, `sourceType` (MANUAL/IMPORT/API/ERP), 1–N Receivable. |
| `Receivable` | Receivable: `originalAmount`, `paidAmount` (rollup), `dueDate`, status, `ownerUserId`. |
| `Payment` | Payment from a bank transaction: `totalAmount`, `allocatedAmount` (rollup), `payerName`; remainder = credit balance. |
| `PaymentAllocation` | Payment → Receivable allocation; source of truth for history; soft-deleted on undo. |
| `BankTransaction` | Normalized transaction: status UNMATCHED/PENDING_REVIEW/MATCHED, `version` (optimistic lock). |
| `MatchingCandidate` | Matching candidate + 5 score components + `totalScore`. |
| `WebhookInbox` | Raw payload, `unique(providerTransactionId)`, status RECEIVED/PROCESSED/FAILED, retryCount. |
| `Dispute` | Dispute OPEN/RESOLVED; `isDisputed` = EXISTS(OPEN). |
| `ReminderPolicy` / `ReminderRule` / `ReminderExecution` | Reminder policy by customerGroup + offsetDays; execution PENDING/SENT/FAILED/SKIPPED (skipReason: ALREADY_PAID/DISPUTED/RATE_LIMITED). |
| `EmailTemplate` | HTML + Handlebars, `isDefault` (seed, do not delete), 7 system variables. |
| `CollectionActivity` | Timeline denormalized; INSERT-only. |
| `InternalTask` | Internal ESCALATION/MANUAL task, status OPEN/DONE/DISMISSED. |
| `AuditLog` | `@Audited` + interceptor, before/afterState jsonb, INSERT-only. |
| `BankConnection` / `CasIdConnectionSession` / `ConnectionAuditEvent` | Bank connection: accessToken encrypted at rest, 6 statuses (ACTIVE/REQUIRES_REAUTHORIZATION/...), connection-event audit. |
| `Subscription` | FREE/STARTER/BUSINESS/ENTERPRISE plan + 2 limit snapshots + current period. |
| `CopilotConversation` / `CopilotMessage` / `CopilotPendingAction` / `AIUsageLog` | Chat conversation, pending action (SEND_REMINDER_EMAIL, EXPIRED after 10 minutes), model-usage log. |
| Token entities | `EmailVerificationToken`, `PasswordResetToken`, `MembershipInvite`, `RefreshToken` — all store hashes (SHA-256), never plaintext. ([auth section 1](docs/superpowers/specs/2026-08-03-authentication-onboarding-design.md)) |

## 14. User Interface

**10 navigation items** according to [FE design spec section 2](docs/superpowers/specs/2026-08-03-frontend-design-system.md):

```
/dashboard · /customers · /receivables · /bank-connections · /transactions
/exceptions (badge = count PENDING_REVIEW) · /reminders · /copilot · /reports · /settings
```

- Design token CASSO/payOS: primary `#16AB64` (oklch), font "Be Vietnam Pro", shadcn/ui "new-york"/"neutral", lucide icons, light + dark.
- **Dedicated routes** for details: `/receivables/:id`, `/customers/:id` (3 tabs: payments/timeline/tasks; allocations are included in `GET /receivables/:id`, with no separate endpoint).
- **Matching workspace** as list + detail sheet: 5 score-breakdown rows, primary candidate highlighted, "Match receivable" button opens the match dialog.
- **Exception Queue:** split-match multiple receivables in one submission with `version`; skip; mark-prepaid (credit balance).
- **Copilot:** chat message list + input; when `pendingAction` exists, show a **confirmation card (Confirm/Cancel)** — confirm/cancel does not return to the LLM. Copilot navigation is gated to the STARTER plan (show a lock icon, do not hide it).
- RBAC FE: `hasPermission()` hides buttons; detailed route-gating is only for `/settings`; the users tab (invite) is limited to OWNER/FINANCE_MANAGER.
- `dashboard` (reports): aging chart (recharts) + summary cards; settings includes billing/static plan + users + email templates CRUD/preview.

## 15. Key Performance Indicators (KPIs)

- **Auto-match rate** — percentage of transactions automatically matched to receivables.
- **Manual handling rate** — percentage of transactions requiring accountant handling (Exception Queue) = 1 − auto-match rate.
- **Match accuracy** — percentage of correct auto-match results.
- **Average collection time** — average time from invoice issuance to full payment.
- **DSO (Days Sales Outstanding)** — average number of days to collect after sale.
- **Overdue rate** — percentage of overdue receivables.
- **Reminder effectiveness** — percentage of customers paying after a reminder email (follow-up metric, not in the MVP dashboard).
- **Recovered overdue amount** — overdue amount recovered.
- **Email delivery rate** — percentage of successfully sent emails (SENT / total executions).
- **Time saved** — manual time reduced for accounting staff.
- **Forecast accuracy** — collection forecast accuracy (7/14/30 days).

## 16. Non-functional requirements

- **Security:** TLS for all connections; encrypt sensitive data (accessToken at rest, never log plaintext); do not store unnecessary bank credentials; RBAC + tenant isolation; rate limiting `/auth/*` (5 requests/minute by IP+email); constant-time webhook auth comparison; audit log; minimum consent scope; do not use Cas ID as SSO.
- **Reliability:** webhooks are not lost (inbox before processing); retry backoff; DLQ for failed jobs; idempotency unique keys (webhook: `providerTransactionId`; FE-called API: `Idempotency-Key` header); DB transactions for all money/status changes; backup: daily `pg_dump` cron, retain the 7 most recent copies ([deployment section 5](docs/superpowers/specs/2026-08-03-deployment-observability-design.md)).
- **Performance:** real-time queries with the correct index (`Receivable(organizationId, status, dueDate)`) — **no precomputation** at MVP scale; matching runs asynchronously through a queue; paginate every list (`page/limit`, maximum 100).
- **Observability:** structured JSON logs to stdout (timestamp, level, organizationId, userId, requestId); `/metrics` Prometheus (HTTP duration, webhook duration, BullMQ failed/backlog); `/health` returns 503 when a dependency fails; defer distributed tracing (single-process modular monolith).
- **Compliance:** retention policy; data export; delete/redact data upon valid request; history of financial-information changes (AuditLog INSERT-only).

## 17. Risks

- **Incorrect matching** → auto-match only when score ≥ 90; show an explanation (5 score components); undo allocation; audit log; human review for uncertain cases.
- **Cas ID access revoked** → lazy detection (401/403 → REQUIRES_REAUTHORIZATION); alert Owner; stop accepting new transactions for a connection that is not ACTIVE; preserve history; reauthorize by QR; do not automatically substitute another account.
- **Data permissions too broad** → least privilege, request only reconciliation data, show scopes before granting access, make revocation possible, retain consent history.
- **Customer email harassment** → `minIntervalDays` rate limit, policies by customer group, pause during disputes.
- **Paid customers still receive reminders** → near-real-time processing, worker re-checks status immediately before sending, cancel unsent executions when PAID.
- **Inconsistent data from multiple sources** → canonical data model, adapter abstraction, per-row import validation.
- **Incorrect billing** → count at write time from source tables in the same transaction (prevent races), audit trail.
- **Businesses do not want to replace accounting software** → position the product as an automation/integration layer, not a replacement accounting system.

## 18. References

Official Cas ID / CASSO documentation, accessed in 08/2026:

- [Cas ID – Business data wallet](https://cas.so/cas-id/)
- [CASSO Docs – Connect a bank account by scanning a QR code in the Cas ID app](https://docs.casso.vn/huong-dan/ket-noi-tai-khoan-ngan-hang-thong-qua-cas-id)
- [CASSO Developer](https://developer.casso.vn/)
- [Cas ID on Google Play](https://play.google.com/store/apps/details?id=vn.bankhub.mobile&hl=vi)
- [Balance Hook](https://cas.so/product/balance-hook) — payload, header authentication, real-time balances.
- [Cas ID Quickstart](https://cas.so/quickstart) — OAuth-style grant/exchange token flow.

API details (QR-generation endpoint, callback, scope, access-revocation event) must be confirmed with the Developer Portal / internal technical documentation before production deployment — `MockCasIdAdapter` is currently used for demo/test.

## 19. Conclusion

The project combines an Accounts Receivable domain, real Cas ID/Balance Hook integration, webhook idempotency and payment matching, email automation, and a Copilot with guardrails and human-in-the-loop — deep enough to demonstrate system-design ability and complete a demo vertical slice quickly.

The product's core is not merely sending payment-reminder emails: **the system knows which receivables need reminders, when to remind, who should receive notifications, which money has arrived, which transaction belongs to which receivable, and when to stop the entire reminder process.** All these decisions have been finalized in the specs/plans in `docs/superpowers/`; this document is only the overview entry point for the whole project.
