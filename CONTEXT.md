# Context — Casso Ledger

## What is this?

A B2B SaaS platform for automating accounts receivable management and collection for Vietnamese businesses. It directly connects to real-time bank transaction data through Cas ID/CASSO Balance Hook.

## Product Positioning

*A platform that automates the entire accounts receivable lifecycle based on real-time bank transaction data* — its key differentiator is direct connection to actual cash flow, not merely invoice-list management.

## Core Domain Entities

| Entity | Description | Key Fields |
|--------|-------------|------------|
| **Organization** | Tenant boundary, organization unit | `id`, `name` |
| **User** | Login account belonging to 1+ organization | `id`, `email`, `name` |
| **Membership** | User ↔ Organization link with a role | `userId`, `organizationId`, `role` |
| **Customer** | Customer who owes money | `id`, `organizationId`, `name`, `taxCode`, `creditLimit`, `defaultPaymentTermDays` |
| **Invoice** | Invoice | `id`, `organizationId`, `customerId`, `invoiceNumber`, `totalAmount`, `sourceType` |
| **Receivable** | Amount receivable | `id`, `organizationId`, `customerId`, `originalAmount`, `paidAmount`, `dueDate`, `status` |
| **Payment** | Payment from a bank transaction | `id`, `organizationId`, `customerId`, `totalAmount`, `allocatedAmount`, `payerName` |
| **PaymentAllocation** | Payment → receivable allocation | `id`, `paymentId`, `receivableId`, `allocatedAmount`, `deletedAt` |
| **BankTransaction** | Normalized transaction | `id`, `organizationId`, `status`, `amount`, `referenceCode` |
| **WebhookInbox** | Raw webhook payload | `id`, `providerTransactionId`, `status`, `payload` |
| **Dispute** | Dispute | `id`, `receivableId`, `status` |
| **ReminderPolicy** | Reminder policy by customer group | `id`, `customerGroup`, `escalationThresholdDays` |
| **ReminderExecution** | Reminder sending history | `id`, `reminderRuleId`, `status`, `sentAt` |
| **EmailTemplate** | HTML + Handlebars email template | `id`, `bodyHtml`, `isDefault` |
| **CollectionActivity** | Denormalized, INSERT-only timeline | `id`, `receivableId`, `eventType` |
| **InternalTask** | Internal ESCALATION/MANUAL task | `id`, `receivableId`, `assignedToUserId`, `status` |
| **AuditLog** | Change history, INSERT-only | `id`, `entityType`, `entityId`, `beforeState`, `afterState` |
| **BankConnection** | Bank connection through Cas ID | `id`, `organizationId`, `status`, `accessToken` |
| **Subscription** | Subscription plan | `id`, `organizationId`, `plan`, `status` |
| **PlanUpgradeOrder** | One-off PayOS payment to move a `Subscription` to a strictly higher tier | `id`, `orderCode`, `organizationId`, `targetPlanId`, `status` |
| **PeriodCharge** | The recurring per-billing-period PayOS payment a paid-tier `Subscription` must make to stay on that tier (PayOS has no card-on-file/auto-charge, so this is a distinct concept from `PlanUpgradeOrder` — same tier, not a higher one, and repeats every period). "Renewal" = paying the `PeriodCharge` for the current period | `id`, `orderCode`, `organizationId`, `planId`, `periodStart`, `periodEnd`, `status` |
| **OrganizationSmtpConfig** | Org's own SMTP server for sending org-branded reminder emails (BUSINESS+ only). One per org; only ever exists as `CONNECTED` or `FAILED` — a failed test-send is never persisted | `id`, `organizationId`, `host`, `port`, `username`, `encryptedPassword`, `fromAddress`, `status` |
| **CopilotConversation** | Chat conversation with AI | `id`, `organizationId` |
| **CopilotPendingAction** | Action awaiting user confirmation | `id`, `conversationId`, `status` |

## Receivable State Machine

```
                    ┌─────────────┐
                    │   DRAFT     │ (optional, for import)
                    └──────┬──────┘
                           │ create
                           ▼
                    ┌─────────────┐
            ┌──────│    OPEN     │──────┐
            │      └──────┬──────┘      │
            │             │             │
            │     allocate│      writeOff│
            │             ▼             ▼
            │      ┌──────────┐  ┌────────────┐
            │      │PARTIALLY │  │ WRITTEN_OFF│ (terminal)
            │      │  _PAID   │  └────────────┘
            │      └────┬─────┘
            │           │
            │   allocate│ (remaining = 0)
            │           ▼
            │    ┌──────────┐
            └───▶│   PAID   │ (terminal)
                 └──────────┘

    CANCELLED: only from OPEN/PARTIALLY_PAID when paidAmount = 0
```

## Business Rules (CRITICAL — violation is a bug)

1. **Money:** integers in VND units, do NOT freely use float/decimal
2. **Transactions:** every write that changes an amount/status MUST be inside one DB transaction
3. **Persisted rollup:** `paidAmount` and `allocatedAmount` are updated only inside a transaction with a row lock
4. **Derived fields:** `remainingAmount`, `unallocatedAmount`, `isOverdue`, `isDisputed` — calculated at query time
5. **Tenant isolation:** every query/write must be scoped by `organizationId`
6. **Allocation:** `Payment.customerId` MUST exist and match `Receivable.customerId`
7. **Undo:** soft-delete + audit; do not physically delete
8. **Terminal statuses:** PAID, WRITTEN_OFF, CANCELLED — cannot transition further
9. **Plan tiers:** FREE < STARTER < BUSINESS < ENTERPRISE (strict order). A `Subscription` may only move to a strictly higher tier via `PlanUpgradeOrder` (self-service upgrade); there is no downgrade or cancel action — an org on a paid tier must pay a `PeriodCharge` for the current billing period to keep that tier. If unpaid by the end of a 3-day grace window after period end, the `Subscription` automatically drops to FREE (not a user-triggered downgrade). During the grace window `status` stays `ACTIVE` (see ADR-0012) — `PAST_DUE` keeps its existing meaning of an immediate hard block (`plan-limit.service.ts`), it is not used for renewal grace

## RBAC

5 roles: `OWNER` > `FINANCE_MANAGER` > `ACCOUNTANT` > `SALES_REP` > `VIEWER`

| Permission | OWNER | FINANCE_MGR | ACCOUNTANT | SALES_REP | VIEWER |
|-----------|-------|-------------|------------|-----------|--------|
| RECEIVABLE_READ | ✓ | ✓ | ✓ | ✓ (own) | ✓ |
| RECEIVABLE_WRITE | ✓ | ✓ | ✓ | — | — |
| RECEIVABLE_WRITE_OFF | ✓ | ✓ | — | — | — |
| PAYMENT_ALLOCATE | ✓ | ✓ | ✓ | — | — |
| PAYMENT_ALLOCATE_UNDO | ✓ | ✓ | — | — | — |
| BANK_CONNECTION_MANAGE | ✓ | — | — | — | — |
| SUBSCRIPTION_MANAGE | ✓ | ✓ | — | — | — |
| USER_MANAGE | ✓ | ✓ | — | — | — |

**SALES_REP:** can only view receivables for assigned customers (`WHERE salesRepresentativeId = ctx.userId`)

## API Conventions

- **Prefix:** `/api/v1` for all business APIs
- **Error:** `{ statusCode, errorCode, message, details? }`
- **Idempotency:** `Idempotency-Key` header for POST requests that create or change money/status
- **Health:** `GET /health`, `GET /metrics` (Prometheus)
- **Timezone:** `Asia/Ho_Chi_Minh` for reminder cron/today

## Matching Engine (Webhook → Payment)

```
Score ≥ 90:  Auto payment allocation
Score 60-89: Exception Queue (human review)
Score < 60:  UNMATCHED

Score components:
  referenceCodeScore (0-60) + amountScore (0-20) + customerBankAccountScore (0-10)
  + payerNameScore (0-5) + timingScore (0-5)
```

## Architecture Decisions (ADR)

| ADR | Decision | Rationale |
|-----|----------|-----------|
| 0001 | Shared-schema multi-tenancy | `organizationId` on every table, no RLS in MVP |
| 0002 | Persisted rollup | No runtime `SUM(PaymentAllocation)` |
| 0003 | isDisputed computed | `EXISTS(SELECT 1 FROM disputes WHERE status='OPEN')` |
| 0004 | Reminder scan/send split | Cron enqueues, worker re-checks before sending |
| 0005 | Distinct events per closure audience | `receivable.status-closed` (any terminal status) is separate from `receivable.closed` (PAID-only); don't widen one event to serve two contracts |
| 0006 | BYO-SMTP for org-branded reminder emails | Org supplies own SMTP server (Supabase-style) instead of Resend domain-verification/DNS; sync test-send, reactive failure detection, fallback to Resend — BUSINESS+ only |
| 0010 | Billing gates on persisted Subscription | Advisory-locked checks in-transaction, lazy calendar-month periods |
| 0011 | Plan changes are upgrade-only | No downgrade/cancel action; non-renewal is the only path back to FREE |
| 0012 | PeriodCharge + renewal-reminder cron | PayOS has no auto-charge, so renewal is a self-serve repeat payment; a reminder cron is needed since ADR-0010's "no cron" premise assumed no recurring payment obligation existed |

## Constraints

- Amounts: integers in VND units
- `domain/` does not import NestJS/TypeORM
- `synchronize: true` in MVP, migration-based when needed
- Frontend not yet scaffolded (Plan #18-21)
- Auth not yet implemented (Plan #4)
- Multi-tenancy not yet implemented (Plan #2)
