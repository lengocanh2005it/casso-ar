# Read APIs Completion — Design

## Goal

Add `GET /receivables` (paginated list with filters) and fix `GET /receivables/:id` (include allocations). Follow existing `ListCustomersUseCase` pattern exactly.

## Changes

### 1. Repository ports (`application/`)

**`IReceivableRepository`** — add:
```ts
findPage(
  organizationId: string,
  filters: { status?: string; salesRepresentativeId?: string },
  page: number,
  limit: number,
): Promise<Receivable[]>;

count(
  organizationId: string,
  filters: { status?: string; salesRepresentativeId?: string },
): Promise<number>;
```

**`IPaymentAllocationRepository`** — add:
```ts
findActiveByReceivableId(receivableId: string): Promise<PaymentAllocation[]>;
```
Active = `deletedAt IS NULL`. Used only by the detail view.

**`IDisputeRepository`** — add:
```ts
findOpenDisputesByReceivableIds(
  receivableIds: string[],
): Promise<Map<string, string>>;
```
Returns `Map<receivableId, disputeId>` for open disputes. Avoids N+1 queries in the list endpoint.

### 2. Infrastructure (`infrastructure/`)

**`TypeOrmReceivableRepository`**:
- `findPage` — query builder, optional `WHERE status = :status` and `WHERE salesRepresentativeId = :srId`, `ORDER BY createdAt DESC`, skip/take.
- `count` — same filters, `getCount()`.

**`TypeOrmPaymentAllocationRepository`**:
- `findActiveByReceivableId` — `WHERE receivableId = :id AND deletedAt IS NULL`, order by `allocatedAt DESC`.

**`TypeOrmDisputeRepository`**:
- `findOpenDisputesByReceivableIds` — `WHERE receivableId IN (:ids) AND status = 'OPEN'`, select `receivableId, id`. Return as Map.

**DB migration** — add index on `receivables(salesRepresentativeId)` for filter performance.

### 3. Use case (`application/`)

**`ListReceivablesUseCase`**:
- Inject: `IReceivableRepository`, `IDisputeRepository`, `TenantContextService`
- Input: `{ status?, salesRepresentativeId?, page, limit }`
- Flow:
  1. Get `organizationId` from tenant context
  2. Get current user from tenant context
  3. If role is `SALES_REP`, override `salesRepresentativeId` filter with `currentUser.userId`
  4. Run `findPage` + `count` in parallel
  5. Batch-fetch open disputes for all receivable IDs via `findOpenDisputesByReceivableIds`
  6. Map results to `ReceivableSummaryResponseDto`
- Output: `{ items: ReceivableSummaryResponseDto[], total, page, limit }`

**`GetReceivableUseCase`** — updated to also fetch allocations:
- Add `IPaymentAllocationRepository` injection
- After loading receivable + dispute, call `findActiveByReceivableId`
- Return `{ receivable, isDisputed, disputeId, allocations }`

### 4. DTOs (`presentation/dto/`)

**`ReceivableSummaryResponseDto`**:
```ts
{
  id: string;
  customerId: string;
  invoiceId: string | null;
  invoiceNumber: string | null;  // from invoice lookup
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;       // computed: originalAmount - paidAmount
  dueDate: Date;
  status: ReceivableStatus;
  isOverdue: boolean;            // computed: dueDate < now && !PAID
  isDisputed: boolean;           // from dispute lookup
  disputeId: string | null;      // from dispute lookup
  salesRepresentativeId: string | null;
  createdAt: Date;
}
```

**`PaymentAllocationResponseDto`**:
```ts
{
  id: string;
  paymentId: string;
  allocatedAmount: number;
  allocatedAt: Date;
  allocatedByUserId: string | null;
  deletedAt: Date | null;
  deletedByUserId: string | null;
  undoReason: string | null;
}
```

### 5. Controller (`presentation/`)

**`GET /receivables`**:
- `@RequirePermission(Permission.RECEIVABLE_READ)`
- `@Query() pagination: PaginationDto`
- `@Query('status') status?: string`
- `@Query('salesRepresentativeId') salesRepresentativeId?: string`
- Calls `ListReceivablesUseCase.execute(...)`

**`GET /receivables/:id`** — already exists, no controller changes needed (use case updated to include allocations).

### 6. Module (`receivables.module.ts`)

- Add `PaymentsModule` import (for `PAYMENT_ALLOCATION_REPOSITORY`)
- Register `ListReceivablesUseCase` as provider

## Index

```sql
CREATE INDEX "IDX_receivables_sales_rep" ON "receivables" ("salesRepresentativeId");
```

## Files to modify/create

| File | Action |
|------|--------|
| `receivable-repository.port.ts` | Add `findPage`, `count` |
| `payment-allocation-repository.port.ts` | Add `findActiveByReceivableId` |
| `dispute-repository.port.ts` | Add `findOpenDisputesByReceivableIds` |
| `typeorm-receivable.repository.ts` | Implement `findPage`, `count` |
| `typeorm-payment-allocation.repository.ts` | Implement `findActiveByReceivableId` |
| `typeorm-dispute.repository.ts` | Implement `findOpenDisputesByReceivableIds` |
| `receivable-summary-response.dto.ts` | **New** — list response DTO + mapper |
| `payment-allocation-response.dto.ts` | **New** — allocation response DTO + mapper |
| `list-receivables.usecase.ts` | **New** — list use case |
| `get-receivable.usecase.ts` | Update to include allocations |
| `receivables.controller.ts` | Add `GET /` endpoint |
| `receivables.module.ts` | Add `PaymentsModule`, register `ListReceivablesUseCase` |
| `receivable.orm-entity.ts` | Add index on `salesRepresentativeId` |
| `receivables-migration.ts` | **New** — DB migration for index |
