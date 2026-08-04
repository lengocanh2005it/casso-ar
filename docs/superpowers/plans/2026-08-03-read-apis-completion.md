# Read APIs Completion Implementation Plan

> Chốt các read contract mà frontend đã dùng nhưng các plan nghiệp vụ trước chưa sở hữu. Đây là read-only work; không tạo thêm domain entity và không nhận `organizationId` từ query/body.

## Contract chung

- Mọi route dùng `JwtAuthGuard` + `PermissionGuard`, tenant lấy từ `TenantContextService`.
- Pagination dùng `page >= 1`, `limit` mặc định `20`, tối đa `100`; response list là `{ items, total, page, limit }`.
- `organizationId` trong URL chỉ được dùng để xác định resource của organization hiện tại; nếu khác tenant hiện tại trả `404`.
- Query aggregate được parameterized; không dùng repository mặc định trong transaction vì các endpoint này read-only.

## API contracts

| Endpoint | Response chính | Owner |
|---|---|---|
| `GET /customers?search=&page=&limit=` | `{ items: Customer[], total, page, limit }` | Customers module |
| `GET /customers/:id/timeline` | `CollectionActivityView[]` (`id`, `receivableId`, `activityType`, `description`, `metadata`, `createdByUserId`, `createdAt`) | Collection Activity |
| `GET /bank-connections` | `{ items: BankConnectionView[], total, page, limit }` (view exposes `id`, `accountNumber`, `bankName`, `status`, `connectedAt`, `lastSyncAt`, `createdAt`; never `encryptedAccessToken`) | Bank Connections |
| `GET /organizations/:id/members` | `{ items: Member[], total, page, limit }` | Organizations |
| `GET /me` | user profile + `subscriptionPlan` | Auth |
| `GET /receivables?page=&limit=` | `{ items: ReceivableSummary[], total, page, limit }` with `paidAmount`, `remainingAmount`, `isOverdue`, `isDisputed`, `disputeId` | Receivables/Dispute |
| `GET /receivables/:id` | receivable detail + `isDisputed: boolean` + `disputeId: string \| null` + `allocations` | Dispute Management + Read APIs |

`GET /bank-transactions/unmatched` và `GET /bank-transactions/pending-review-count` đã do Exception Queue plan sở hữu; FE dùng hai route đó, không tạo alias `GET /bank-transactions?status=PENDING_REVIEW`.

`ReceivableSummary` dùng các field `id`, `customerId`, `invoiceId`, `invoiceNumber`, `originalAmount`, `paidAmount`, `remainingAmount`, `dueDate`, `status`, `isOverdue`, `isDisputed`, `disputeId`, `salesRepresentativeId`, `createdAt`. Detail bổ sung `allocations`.

## Tasks

- [ ] Add tenant-scoped customer list/detail/timeline query methods and controller routes. `search` match `name`, `taxCode`, `phone`; timeline reads `CollectionActivity` ordered newest first.
- [ ] Add `findPage()` to Bank Connection repository and `GET /bank-connections`; response không expose encrypted access token.
- [ ] Add `findPageByOrganization()` to Membership repository and `GET /organizations/:id/members`; chỉ trả `id`, `userId`, `email`, `name`, `role`, `joinedAt`.
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


