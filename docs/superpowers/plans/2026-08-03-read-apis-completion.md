# Read APIs Completion Implementation Plan

> Finalize the read contracts already used by the frontend but not owned by the previous business plans. This is read-only work; it does not create additional domain entities and does not accept `organizationId` from the query/body.

## Contract chung

- Every route uses `JwtAuthGuard` + `PermissionGuard`, with the tenant taken from `TenantContextService`.
- Pagination uses `page >= 1`, `limit` defaults to `20`, and has a maximum of `100`; the list response is `{ items, total, page, limit }`.
- `organizationId` in the URL is used only to identify a resource belonging to the current organization; if it belongs to another tenant, return `404`.
- Aggregate queries are parameterized; do not use the default repository in a transaction because these endpoints are read-only.

## API contracts

| Endpoint | Main response | Owner |
|---|---|---|
| `GET /customers?search=&page=&limit=` | `{ items: Customer[], total, page, limit }` | Customers module |
| `GET /customers/:id/timeline` | `CollectionActivityView[]` (`id`, `receivableId`, `activityType`, `description`, `metadata`, `createdByUserId`, `createdAt`) | Collection Activity |
| `GET /bank-connections` | `{ items: BankConnectionView[], total, page, limit }` (view exposes `id`, `accountNumber`, `bankName`, `status`, `connectedAt`, `lastSyncAt`, `createdAt`; never `encryptedAccessToken`) | Bank Connections |
| `GET /organizations/:id/members` | `{ items: Member[], total, page, limit }` | Organizations |
| `GET /me` | user profile + `subscriptionPlan` | Auth |
| `GET /receivables?page=&limit=` | `{ items: ReceivableSummary[], total, page, limit }` with `paidAmount`, `remainingAmount`, `isOverdue`, `isDisputed`, `disputeId` | Receivables/Dispute |
| `GET /receivables/:id` | receivable detail + `isDisputed: boolean` + `disputeId: string \| null` + `allocations` | Dispute Management + Read APIs |

`GET /bank-transactions/unmatched` and `GET /bank-transactions/pending-review-count` are already owned by the Exception Queue plan; the FE uses those two routes, so do not create the alias `GET /bank-transactions?status=PENDING_REVIEW`.

`ReceivableSummary` uses the fields `id`, `customerId`, `invoiceId`, `invoiceNumber`, `originalAmount`, `paidAmount`, `remainingAmount`, `dueDate`, `status`, `isOverdue`, `isDisputed`, `disputeId`, `salesRepresentativeId`, `createdAt`. The detail adds `allocations`.

## Tasks

- [ ] Add tenant-scoped customer list/detail/timeline query methods and controller routes. `search` match `name`, `taxCode`, `phone`; timeline reads `CollectionActivity` ordered newest first.
- [ ] Add `findPage()` to Bank Connection repository and `GET /bank-connections`; the response does not expose the encrypted access token.
- [ ] Add `findPageByOrganization()` to Membership repository and `GET /organizations/:id/members`; return only `id`, `userId`, `email`, `name`, `role`, `joinedAt`.
- [ ] Extend `/me` query to load the active Subscription and return `subscriptionPlan` (`FREE | STARTER | BUSINESS | ENTERPRISE`), defaulting to `FREE` only when the bootstrap row is absent during migration.
- [ ] Add tenant-scoped `GET /receivables` list with persisted rollups and derived `remainingAmount`/`isOverdue`/`isDisputed`/`disputeId`; dispute fields come from the open-dispute lookup, not a stored column or FE calculation.
- [ ] Reconcile the `GET /receivables/:id` endpoint from Dispute Management so it returns both `isDisputed` and `disputeId` from the open dispute lookup plus payment `allocations`; return `404` when the receivable belongs to another organization.
- [ ] Add one integration test per route for tenant isolation and exact response shape; add pagination/empty-state cases.

## Frontend reconciliation

- FE customers page consumes the customer list and timeline contracts above.
- FE receivables page consumes the tenant-scoped receivable list/detail contracts above, including computed dispute fields.
- FE exceptions page consumes `/bank-transactions/unmatched`; its sidebar badge consumes `/bank-transactions/pending-review-count`.
- FE settings reads `/bank-connections`, `/organizations/:id/members`, and `user.subscriptionPlan` from `/me`.
- No frontend should retain a “BE gap” note for these endpoints after this plan is implemented.


