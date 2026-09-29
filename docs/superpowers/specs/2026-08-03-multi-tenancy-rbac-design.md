# Multi-tenancy + RBAC Design

> Sub-spec of [docs/overview.md](../../../docs/overview.md). The foundation that all other specs ([Domain Core](2026-08-03-domain-core-design.md), [Webhook/Matching](2026-08-03-webhook-matching-engine-design.md), [Cas ID](2026-08-03-cas-id-bank-connection-design.md), [Reminder](2026-08-03-reminder-automation-design.md)) rely on for tenant isolation and authorization.

## 1. Tenant isolation model

Choose **shared schema** (one database; every business table has an `organizationId` column) instead of schema-per-tenant — simpler to operate, migrate, and back up at internship scale and during the early SaaS stage; schema-per-tenant is only necessary when a large customer requires physical isolation for compliance.

```
Organization
  id, name, createdAt

User
  id, email, passwordHash, createdAt

Membership
  id, organizationId, userId, role (OWNER/FINANCE_MANAGER/ACCOUNTANT/SALES_REP/VIEWER),
  invitedAt, joinedAt, createdAt
```

A `User` may belong to multiple `Organization` records through multiple `Membership` records (with a different role in each org). Every business table (`Customer`, `Invoice`, `Receivable`, `Payment`, `PaymentAllocation`, `BankConnection`, `WebhookInbox`, ...) must have a required `organizationId` column: `NOT NULL`, `FOREIGN KEY` to `organizations.id`, and an index. Every FK between business tables must prevent cross-tenant references in the application and DB; tenant query indexes put `organizationId` first (for example `(organizationId, status, dueDate)`).

### Application-layer isolation enforcement

```
1. AuthGuard validates the JWT and obtains userId + organizationId
   (from the token, or the X-Organization-Id header if the user belongs to multiple orgs) → validate through Membership
2. Attach organizationId to request-scoped context (NestJS request-scoped provider / AsyncLocalStorage)
3. BaseRepository (every business Repository must extend this) automatically adds
   WHERE organizationId = :ctx.organizationId to every query — service code does not write filters manually,
   eliminating the risk of forgetting a filter and exposing cross-organization data
```

Do not use Postgres Row-Level Security in the MVP — NestJS-layer enforcement is sufficient when every query must go through `BaseRepository`; RLS can be added later as a second protection layer if needed.

For webhooks/workers without a JWT: do not use `organizationId` from the payload to choose the tenant. The controller must resolve `BankConnection` by `bankConnectionId`, verify `connection.organizationId`, then use that organization for `WebhookInbox`, `BankTransaction`, the queue job, and `TenantContextService`. Any organizationId included in the payload that differs from the resolved value must be rejected.

## 2. RBAC — static role → permission mapping

Five fixed roles (no dynamic `Role`/`Permission` tables in the DB — hard-coded in code):

```
enum Permission {
  RECEIVABLE_READ, RECEIVABLE_IMPORT, CUSTOMER_READ, EMAIL_TEMPLATE_READ,
  RECEIVABLE_WRITE, RECEIVABLE_WRITE_OFF, RECEIVABLE_DISPUTE,
  PAYMENT_ALLOCATE, PAYMENT_ALLOCATE_UNDO,
  REMINDER_POLICY_WRITE, REMINDER_SEND_MANUAL,
  BANK_CONNECTION_MANAGE,
  SUBSCRIPTION_MANAGE, USER_MANAGE, INTERNAL_TASK_MANAGE,
  REPORT_READ, AUDIT_LOG_READ,
}

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER:           [/* all Permissions */],
  FINANCE_MANAGER: [RECEIVABLE_READ, RECEIVABLE_WRITE, RECEIVABLE_WRITE_OFF, RECEIVABLE_DISPUTE,
                     RECEIVABLE_IMPORT, PAYMENT_ALLOCATE, PAYMENT_ALLOCATE_UNDO,
                     EMAIL_TEMPLATE_READ, CUSTOMER_READ,
                     REMINDER_POLICY_WRITE, REMINDER_SEND_MANUAL, SUBSCRIPTION_MANAGE, USER_MANAGE,
                     INTERNAL_TASK_MANAGE,
                     REPORT_READ, AUDIT_LOG_READ],
  ACCOUNTANT:      [RECEIVABLE_READ, RECEIVABLE_WRITE, RECEIVABLE_DISPUTE,
                     RECEIVABLE_IMPORT, PAYMENT_ALLOCATE, EMAIL_TEMPLATE_READ, CUSTOMER_READ,
                     REMINDER_SEND_MANUAL, INTERNAL_TASK_MANAGE, REPORT_READ],
  SALES_REP:       [RECEIVABLE_READ, RECEIVABLE_IMPORT,
                     REPORT_READ, CUSTOMER_READ],
  VIEWER:          [RECEIVABLE_READ, EMAIL_TEMPLATE_READ, CUSTOMER_READ, REPORT_READ, AUDIT_LOG_READ],
}
```

Use it through a decorator on the controller method, for example `@RequirePermission(Permission.RECEIVABLE_WRITE_OFF)`. `PermissionGuard` checks `ROLE_PERMISSIONS[membership.role]` to allow or deny access.
The payment allocation endpoint requires `@RequirePermission(Permission.PAYMENT_ALLOCATE)`; the undo endpoint requires `@RequirePermission(Permission.PAYMENT_ALLOCATE_UNDO)`. `USER_MANAGE` is available only to OWNER and FINANCE_MANAGER. `INTERNAL_TASK_MANAGE` is granted to FINANCE_MANAGER and ACCOUNTANT to create/resolve/dismiss internal tasks.

### Special case: SALES_REP

The general permission check is insufficient because `SALES_REP` may view only receivables assigned to them, not the entire organization. `Receivable.salesRepresentativeId` is nullable when unassigned; `SALES_REP` cannot read unassigned receivables.

- `CUSTOMER_READ`: a `SALES_REP` may read a customer profile only if at least one receivable for that customer is assigned to them, regardless of receivable status. This does not grant access to other receivables for the same customer.
- `RECEIVABLE_IMPORT`: `SALES_REP` may import invoices; each receivable created by the import is assigned to the importing user.
- `EMAIL_TEMPLATE_READ` is not granted to `SALES_REP`; templates are organization-level settings, and this role cannot send manual reminders.
- `REPORT_READ`: aggregate organization-level metrics remain visible to `SALES_REP` (`/reports/aging`, `/reports/trend`, and aggregate fields in `/reports/dashboard-summary`). Customer-level rows are limited to receivables assigned to that user: `/reports/aging/customers`, `/reports/aging/export`, and `topOverdueCustomers` in `/reports/dashboard-summary`.

Data-scope checks belong in each use case/query, not the shared `PermissionGuard`, which only decides whether a role may perform an action.
Implementation follow-ups: #406 scopes customer list/detail; #407 scopes customer-level aging rows, exports, and dashboard customers.

## 3. Out of scope

- Custom roles/permissions per organization (only needed for a real enterprise requirement).
- Postgres Row-Level Security (can be added later as an additional protection layer).
- SSO / external identity provider for Organization (mentioned in section 10 of the source document for the Enterprise plan; out of scope for the MVP).

## 4. Open questions (do not block implementation)

- When a User is removed from an Organization's Membership — should `salesRepresentativeId` on historical data remain to preserve history, or should it be reassigned?
