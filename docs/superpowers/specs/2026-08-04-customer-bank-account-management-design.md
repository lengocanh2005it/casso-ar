# Customer Bank Account Management Design

**Date:** 2026-08-04  
**Status:** Proposed  
**Scope:** Backend API and persistence only; no new FE screen in this change

## 1. Goal

Provide an explicit, tenant-safe way to create, inspect, edit, and deactivate a customer's bank-account mapping so the Webhook/Matching Engine can consume real master data instead of relying on a seed-only setup.

The feature extends the `BankAccountsModule` already introduced by `2026-08-03-webhook-matching-engine.md`. It does not remove or change any existing FE API flow.

## 2. Problem and boundary

The Matching Engine needs to resolve an incoming normalized counterparty account number to a `customerId`. The existing webhook plan defines the `CustomerBankAccount` entity and a read repository port, but it leaves creation to a future management flow or test seed.

This design owns the management side of that mapping:

- CRUD-like API for one customer's mappings.
- Tenant isolation and customer ownership validation.
- Normalization and uniqueness of account numbers.
- Soft deactivation so historical mappings remain auditable.
- Permission and audit coverage.

This design does not own:

- Bank connection/OAuth management, which remains in the Cas ID plan.
- Webhook authentication, queue processing, or matching scores, which remain in the Webhook/Matching Engine plan.
- Customer creation or deletion.
- Bank name, account-holder name, primary-account selection, or payment allocation.
- A new FE page. A later FE plan may consume these APIs without changing their contract.

## 3. Design options

### Option A — Extend the existing `BankAccountsModule` (recommended)

Add application use cases and a controller to the module already responsible for `CustomerBankAccount` persistence. Keep the existing repository token so the Matching Engine and management API share one source of truth.

**Trade-off:** Requires a small RBAC extension and updates to the existing webhook plan, but avoids duplicate entities, repositories, and uniqueness rules.

### Option B — Seed/admin-only setup

Keep the module read-only at runtime and create mappings through a seed script or direct database administration.

**Trade-off:** Smallest initial implementation, but operators cannot safely correct a mapping without database access. This does not satisfy production management needs.

### Option C — Store one or more accounts directly on `Customer`

Add account fields or a customer-owned JSON array.

**Trade-off:** Avoids a module boundary but weakens relational uniqueness, auditability, and the Matching Engine's lookup path. Rejected.

## 4. Domain model

`CustomerBankAccount` remains a tenant-owned mapping:

```typescript
interface CustomerBankAccountProps {
  id: string;
  organizationId: string;
  customerId: string;
  accountNumber: string; // normalized, never parsed as a number
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

The database table remains `customer_bank_accounts`.

Required constraints:

- `organizationId`, `customerId`, and normalized `accountNumber` are required.
- Unique constraint on `(organizationId, accountNumber)` applies to active and inactive rows. This prevents an old mapping from being silently reassigned to another customer.
- `customerId` must reference a customer in the current organization.
- `isActive` defaults to `true`.
- Deactivation is soft; there is no hard-delete path in this feature.

An account number is normalized before validation and persistence:

1. Require a string input.
2. Trim leading/trailing whitespace.
3. Remove spaces and hyphens used as visual separators.
4. Require the result to match `^[0-9]{4,34}$`.
5. Preserve leading zeroes.

The same normalization function must be used by the management write path and the Matching Engine lookup path. A normalization mismatch is a correctness bug, not a caller concern.

## 5. HTTP API

All endpoints require the existing JWT authentication and tenant context. `organizationId` is never accepted from the request body or used as a tenant selector.

### 5.1 List mappings

```http
GET /customers/:customerId/bank-accounts
```

Permission: `RECEIVABLE_READ`.

Response `200`:

```json
{
  "items": [
    {
      "id": "cba-1",
      "customerId": "cust-1",
      "accountNumberMasked": "******2233",
      "isActive": true,
      "createdAt": "2026-08-04T10:00:00.000Z",
      "updatedAt": "2026-08-04T10:00:00.000Z"
    }
  ],
  "total": 1
}
```

The list includes inactive rows so an operator can see and reactivate an existing mapping instead of attempting to create a duplicate. Results are ordered by `createdAt DESC`; pagination is deliberately out of scope because a customer is expected to have a small number of mappings.

### 5.2 Create mapping

```http
POST /customers/:customerId/bank-accounts
Content-Type: application/json

{ "accountNumber": "0011 0022-33" }
```

Permission: `CUSTOMER_BANK_ACCOUNT_MANAGE`.

Response: `201` with the masked resource shape from the list endpoint.

Rules:

- Resolve `customerId` inside the current tenant. A missing customer returns `404`.
- Persist only the normalized account number.
- A duplicate `(organizationId, accountNumber)` returns `409`; the caller must reactivate or update the existing row explicitly.
- The returned DTO never contains the raw account number.

### 5.3 Update or reactivate mapping

```http
PATCH /customers/:customerId/bank-accounts/:id
Content-Type: application/json

{ "accountNumber": "0011002233", "isActive": true }
```

Permission: `CUSTOMER_BANK_ACCOUNT_MANAGE`.

Both fields are optional, but at least one must be provided. `customerId` is immutable; moving a mapping to another customer requires deactivating the old row and creating a new row.

Rules:

- The row and path `customerId` must belong to the current tenant; otherwise return `404`.
- Re-normalize and validate `accountNumber` when supplied.
- The database unique constraint remains the final race-safe duplicate check; a conflict returns `409`.
- Re-enabling a row makes it eligible for matching immediately after the transaction commits.

Response: `200` with the masked resource shape.

### 5.4 Deactivate mapping

```http
DELETE /customers/:customerId/bank-accounts/:id
```

Permission: `CUSTOMER_BANK_ACCOUNT_MANAGE`.

The endpoint sets `isActive = false` and returns `204`. It is idempotent for an already inactive row. It never deletes the row and never changes historical bank transactions or audit entries.

## 6. Authorization and tenant isolation

Add `Permission.CUSTOMER_BANK_ACCOUNT_MANAGE` to the existing static RBAC map:

- `OWNER`: allowed.
- `FINANCE_MANAGER`: allowed.
- `ACCOUNTANT`: allowed.
- `SALES_REP`: not allowed to create, update, or deactivate mappings.
- `VIEWER`: not allowed to create, update, or deactivate mappings.

List access uses `RECEIVABLE_READ`, consistent with the existing customer/receivable read surface. The response is masked, and the service must still validate that the requested customer is visible within the tenant. If the existing Sales Rep ownership rule applies to customer reads, the same rule applies here; no cross-customer lookup is introduced.

Every repository query is tenant-scoped through `TenantContextService`/`BaseRepository`. The controller and DTOs must not expose an `organizationId` input. A customer or mapping from another organization is indistinguishable from a missing resource and returns `404`.

## 7. Matching Engine integration

The existing read contract stays the single source of truth:

```typescript
findByAccountNumber(accountNumber: string): Promise<CustomerBankAccount | null>;
```

Its implementation must:

- Normalize the lookup input with the same function as the management API.
- Restrict the query to the current organization.
- Restrict the query to `isActive = true`.
- Return the mapped `customerId` or `null`.

The Matching Engine must not infer a customer from `BankConnection.accountIdentity`, webhook `organizationId`, account-holder text, or an inactive mapping.

## 8. Validation, errors, and sensitive data

Use the project's existing DTO validation and NestJS exception conventions:

| Condition | HTTP result |
|---|---:|
| Missing/invalid account number | `400` |
| Missing customer or mapping in current tenant | `404` |
| Role lacks required permission | `403` |
| Duplicate normalized account number in organization | `409` |
| Malformed UUID/path identifier | `400` |

Security requirements:

- Never return the raw account number from these endpoints.
- Never write the raw account number to application logs, audit snapshots, exception messages, or test output that is committed as a fixture.
- Use a deterministic mask that preserves only the last four digits; if the normalized value has four digits, mask all digits.
- Audit snapshots contain `accountNumberMasked`, not `accountNumber`.

## 9. Audit behavior

Use the existing `@Audited`/`AuditContextService` mechanism. Add these action types:

- `CUSTOMER_BANK_ACCOUNT_CREATE`
- `CUSTOMER_BANK_ACCOUNT_UPDATE`
- `CUSTOMER_BANK_ACCOUNT_DEACTIVATE`

The audited entity type is `CustomerBankAccount`. For update/deactivate, capture masked before/after state. Audit insertion and the domain write must be in the same request transaction boundary used by the existing audit implementation; a failed write must not create a success audit event.

## 10. Application boundaries

The feature adds management use cases to `BankAccountsModule` without creating a second repository token:

- `ListCustomerBankAccountsUseCase` — read all rows for one tenant-scoped customer.
- `CreateCustomerBankAccountUseCase` — validate customer, normalize, enforce duplicate rule, save, audit.
- `UpdateCustomerBankAccountUseCase` — validate row/customer, normalize optional account number, update active state, save, audit.
- `DeactivateCustomerBankAccountUseCase` — validate row/customer, set inactive, save, audit.

The controller adapts HTTP DTOs to these use cases. It must not contain normalization, uniqueness, tenant, or audit business rules.

The existing `CustomerBankAccount` domain class, ORM entity, repository token, and `BankAccountsModule` from the webhook plan are extended rather than duplicated. The Customers module is consumed through its existing read repository/service to validate customer ownership; the Customers module does not depend back on BankAccountsModule.

## 11. Testing and acceptance criteria

Unit tests must prove:

- normalization removes separators and preserves leading zeroes;
- invalid/non-string/too-short/too-long values are rejected;
- duplicate normalized values are rejected within one organization;
- the same account number is allowed in two organizations;
- an inactive row is not returned by Matching Engine lookup;
- reactivation makes the row matchable;
- customer ID is immutable on update;
- raw account numbers do not appear in response or audit snapshot DTOs.

Integration tests must prove:

- an authenticated allowed role can create, list, update, reactivate, and deactivate a mapping;
- an unauthorized role receives `403` for write endpoints;
- a customer/mapping from another organization returns `404`;
- `DELETE` is soft and idempotent;
- a created active mapping is resolved by the existing Matching Engine repository path;
- a duplicate race is rejected by the database constraint as `409`.

Acceptance is complete when the new management API and the existing Matching Engine use the same tenant-scoped table and normalization function, all raw account values remain out of HTTP/audit/log output, and the corresponding spec/plan references are updated without removing existing FE routes.

## 12. Out of scope and follow-ups

- FE bank-account management screen.
- Bank metadata and account-holder verification.
- Customer credit-balance allocation.
- Hard deletion, historical remapping, or bulk import.
- Custom per-organization permissions.
