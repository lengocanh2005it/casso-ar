# MVP Feature Checklist

Cross-check between the proposed MVP checklist and the current implementation in the codebase.
See `docs/overview.md` for the full picture (business flow, KPIs, NFRs...).

## Core MVP

| # | Feature | Status | Location |
|---|---|---|---|
| 1 | Receivable / Invoice management (create invoice/receivable, amount, customer, due date, status) | ✅ | `modules/invoices`, `modules/receivables`, enum `ReceivableStatus` (`DRAFT/OPEN/PARTIALLY_PAID/PAID/WRITTEN_OFF/CANCELLED`) |
| 2 | Receive transactions from CASSO (webhook, validation, idempotency, save transaction) | ✅ | `modules/webhooks` — `receive-webhook.usecase.ts`, `process-webhook.usecase.ts`; dedup via `unique(providerTransactionId)` on `webhook_inbox` |
| 3 | Auto reconciliation (match by invoice code, transfer content, amount, customer/reference) | ✅ | `modules/webhooks/application/matching-engine.service.ts` — scores `referenceCodeScore + amountScore + customerBankAccountScore + payerNameScore + timingScore` |
| 4 | Partial payment (multiple payments → PARTIALLY_PAID → PAID) | ✅ | `modules/payments` — `allocate-payment.usecase.ts`, `paidAmount`/`allocatedAmount` rollup updated in one locked DB transaction |
| 5 | Unmatched Transaction / Exception Queue (manual match) | ✅ | `modules/exception-queue` — match/skip/mark-prepaid, including batch variants |
| 6 | Payment Allocation (payment → receivable, paid/outstanding amount) | ✅ | `PaymentAllocation` entity; `remainingAmount`/`unallocatedAmount` are derived fields computed at query time |
| 7 | Aging / AR Dashboard (not yet due, 1–7, 8–30, >30 days, total outstanding) | ✅ (finer-grained buckets) | `modules/reporting` — actual buckets `OVERDUE_1_7 / OVERDUE_8_30 / OVERDUE_31_60 / OVERDUE_60_PLUS` + `dashboard-summary-query.service.ts` |
| 8 | Automatic Reminder (before due, on due, overdue; auto-stop when PAID) | ✅ | `modules/reminders` — `reminder-scheduler.service.ts`, `reminder-sender.service.ts`; candidate reader only picks up `OPEN/PARTIALLY_PAID`, skips with reason `ALREADY_PAID` for `PAID/WRITTEN_OFF/CANCELLED` |
| 9 | Transaction & Reconciliation History (who matched, auto/manual, when, which invoice) | ✅ | `modules/receivable-balance-history` — records `changeSource`, `actorType`, `actorUserId`, `actorDisplayName`, `reasonCode`, `transitionReferenceId` for every transition |
| 10 | Audit Log (status history, manual overrides, reconciliation changes) | ✅ (coverage not yet 100%, see issue [#261](https://github.com/lengocanh2005it/casso-ledger/issues/261)) | `common/audit/` — `@Audited()` decorator + interceptor, INSERT-only `AuditLog` |

## Beyond MVP (not in the original checklist)

| Feature | Location |
|---|---|
| RBAC with 5 roles (OWNER/FINANCE_MANAGER/ACCOUNTANT/SALES_REP/VIEWER) | `common/rbac`, `@RequirePermission()` |
| Billing / Subscription (FREE/STARTER/BUSINESS/ENTERPRISE, quota gating) | `modules/billing`, `modules/payos` |
| Dispute management | `modules/disputes` |
| Manageable email templates (Handlebars, preview, CRUD) | `modules/email-templates` |
| Custom SMTP config (per organization) | `modules/smtp-config` |
| Bulk invoice import (Excel/CSV) | `modules/invoice-import` |
| Collection activity timeline | `modules/collection-activity` |
| Internal task / escalation | `modules/internal-tasks` |
| In-app notifications / alerts | `modules/notifications`, `modules/alerts` |
| Collection Copilot (tool-based AI chat, human-in-the-loop confirmation before sending email) | `modules/copilot` |
| Separate operator/admin console (lock org, block member, resend/revoke invite) with its own audit trail | `modules/admin`, `OperatorAuditLog` |
| Trend report / forecast (7/14/30 days) | `modules/reporting` — `trend-report-query.service.ts` |
| Manual webhook inbox reprocess | `modules/webhooks/presentation/webhook-inbox.controller.ts` |

## Source

Verified directly against the source code on 2026-08-19. For per-module business rules/state machines, see the corresponding spec in `docs/superpowers/specs/`.
