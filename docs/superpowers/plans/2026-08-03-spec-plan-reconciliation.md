# Spec and Plan Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile all superpower specifications and implementation plans so that their security rules, persistence invariants, API DTOs, module dependencies, and frontend contracts describe one implementable system.

**Architecture:** Keep the existing modular-monolith design and existing specs as the domain authority. Fix plan drift by updating the smallest number of files, and use explicit cross-module seams where a later module is consumed by an earlier one. API response shapes are canonicalized once and referenced by both backend and frontend plans.

**Tech Stack:** Markdown specifications and plans, NestJS/TypeORM/BullMQ conventions already documented in the repository.

## Global Constraints

- Shared-schema tenancy remains mandatory; every business persistence path must be tenant-scoped.
- Persisted rollups remain authoritative for `paidAmount`, `remainingAmount`, and allocation invariants.
- Monetary amounts remain positive integer minor units.
- Signup bootstrap remains atomic for organization, user, membership, subscription, templates, and default reminder rules.
- No plan may remove an interface consumed by another plan without updating all consumers in the same reconciliation.
- This reconciliation changes documentation only; no application source exists in scope.

---

### Task 1: Reconcile domain, tenancy, authentication, billing, and import contracts

**Files:**
- Modify: `docs/superpowers/specs/2026-08-03-domain-core-design.md`
- Modify: `docs/superpowers/specs/2026-08-03-multi-tenancy-rbac-design.md`
- Modify: `docs/superpowers/specs/2026-08-03-authentication-onboarding-design.md`
- Modify: `docs/superpowers/specs/2026-08-03-invoice-import-design.md`
- Modify: `docs/superpowers/plans/2026-08-03-project-scaffolding-and-domain-core.md`
- Modify: `docs/superpowers/plans/2026-08-03-multi-tenancy-rbac.md`
- Modify: `docs/superpowers/plans/2026-08-03-authentication-onboarding.md`
- Modify: `docs/superpowers/plans/2026-08-03-billing-usage-metering.md`
- Modify: `docs/superpowers/plans/2026-08-03-invoice-import.md`

**Interfaces:** Preserve `allocateWithinTransaction(manager, input)`, define `PaymentAllocation` undo/audit semantics, make Membership and permission enforcement explicit, and use the import response `{ totalRows, successCount, failedRows: [{ rowNumber, data, errors }] }` everywhere.

- [x] Align all entity fields and invariants, including positive integer allocation validation and `salesRepresentativeId` ownership semantics.
- [x] Make signup's subscription provider available inside `AuthModule` and include default reminder bootstrap in the documented transaction.
- [x] Keep import's per-row transaction boundary compatible with quota checks by passing the active `EntityManager` through the use-case seam.
- [x] Update affected examples and tests in these plans so no stale DTO or constructor remains.

### Task 2: Reconcile bank connections, webhook matching, audit, disputes, timeline, and reminders

**Files:**
- Modify: `docs/superpowers/specs/2026-08-03-cas-id-bank-connection-design.md`
- Modify: `docs/superpowers/specs/2026-08-03-webhook-matching-engine-design.md`
- Modify: `docs/superpowers/specs/2026-08-03-exception-queue-audit-log-design.md`
- Modify: `docs/superpowers/specs/2026-08-03-dispute-management-design.md`
- Modify: `docs/superpowers/specs/2026-08-03-collection-activity-timeline-design.md`
- Modify: `docs/superpowers/specs/2026-08-03-reminder-automation-design.md`
- Modify: `docs/superpowers/plans/2026-08-03-cas-id-bank-connection.md`
- Modify: `docs/superpowers/plans/2026-08-03-webhook-matching-engine.md`
- Modify: `docs/superpowers/plans/2026-08-03-exception-queue-audit-log.md`
- Modify: `docs/superpowers/plans/2026-08-03-dispute-management.md`
- Modify: `docs/superpowers/plans/2026-08-03-collection-activity-timeline.md`
- Modify: `docs/superpowers/plans/2026-08-03-reminder-automation.md`
- Modify: `docs/superpowers/plans/2026-08-03-internal-task-escalation.md`

**Interfaces:** Keep `WebhookInbox` failure state durable, make `BankConnection` re-auth/lazy-revoke behavior explicit, and make activity/audit writes carry tenant context through async boundaries.

- [x] Reconcile `BankTransaction` statuses/version with exception queue optimistic locking.
- [x] Reconcile `allocateWithinTransaction` and audit constructor contracts across webhook, exception, and timeline plans.
- [x] Separate reminder scanning from out-of-scope escalation, and define idempotent reminder event emission for the timeline.
- [x] Add the missing dispute guard, audit hooks, required bank-account mapping, and webhook failure persistence to the plans/specs.

### Task 3: Reconcile Copilot, reporting, templates, frontend, testing, and observability

**Files:**
- Modify: `docs/superpowers/specs/2026-08-03-collection-copilot-design.md`
- Modify: `docs/superpowers/specs/2026-08-03-aging-dashboard-reporting-design.md`
- Modify: `docs/superpowers/specs/2026-08-03-email-template-management-design.md`
- Modify: `docs/superpowers/specs/2026-08-03-testing-strategy-design.md`
- Modify: `docs/superpowers/plans/2026-08-03-collection-copilot.md`
- Modify: `docs/superpowers/plans/2026-08-03-aging-dashboard-reporting.md`
- Modify: `docs/superpowers/plans/2026-08-03-email-template-management.md`
- Modify: `docs/superpowers/plans/2026-08-03-fe-reminders-copilot-reports-settings.md`
- Modify: `docs/superpowers/plans/2026-08-03-fe-auth-app-shell.md`
- Modify: `docs/superpowers/plans/2026-08-03-frontend-design-system.md`
- Modify: `docs/superpowers/plans/2026-08-03-testing-strategy.md`
- Modify: `docs/superpowers/plans/2026-08-03-deployment-observability.md`

**Interfaces:** Frontend consumes the canonical backend DTOs; Copilot exposes the complete read/action lifecycle including cancel; API base path is one value; integration tests use the services required by the specs.

- [x] Canonicalize Copilot tool names, pending-action DTOs, and confirm/cancel endpoints.
- [x] Canonicalize aging buckets/dashboard fields and email template `bodyHtml`/preview/permission contracts.
- [x] Align frontend API base path and types with backend plans while keeping every FE flow and adding the missing BE task-list endpoint.
- [x] Make Redis, e2e execution, and email queue metrics explicit in testing/observability plans.

### Task 4: Reconcile global order and verify references

**Files:**
- Modify: `docs/superpowers/IMPLEMENTATION-ORDER.md`
- Modify: `OVERVIEW.md`
- Modify: `README.md`

- [x] Reorder or explicitly seam all cross-module dependencies.
- [x] Remove stale claims and add links to the canonical contracts.
- [x] Search all specs/plans for obsolete DTO names, permissions, statuses, and module-order claims.
- [x] Confirm the final diff contains documentation changes only and no unresolved HIGH findings from the original audit.
