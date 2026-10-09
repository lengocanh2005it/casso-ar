# Reports: Customer Aging and Historical Trend

**Status:** design agreed in grilling session

**Related issues:** #135, prerequisite #172

## Context

The reporting module already provides global aging buckets, an aging CSV export, dashboard summary metrics, top-10 overdue customers, and optimistic cash forecasts. The current Reports page already renders the global aging table and chart.

Issue #135 is therefore a focused extension, not a replacement of the existing Reports flow:

1. Add a paginated customer-level aging breakdown with search and bucket filtering.
2. Add a monthly outstanding/collected trend to the same Reports page.

The historical `outstanding` series depends on #172's append-only `receivable_balance_history`. The report must not reconstruct historical balances with a runtime `SUM(payment_allocations)` query because persisted rollups are the source of truth for current balances and the repository forbids that runtime aggregation.

## Goals

- Let a user find the customers carrying the largest current receivable balances.
- Let a user inspect aging buckets per customer without leaving Reports.
- Show monthly collected cash and historical outstanding balance for 3, 6, or 12 months.
- Preserve tenant isolation, `REPORT_READ` authorization, existing reporting patterns, and the existing Reports page.

## Non-goals

- No new history storage in this issue; #172 owns the history model and write path.
- No custom date ranges.
- No multi-select bucket filters, sort selector, customer drill-down, or new Reports route.
- No change to the existing forecast logic or dashboard summary semantics.
- No ML or customer-specific forecast model.

## Domain and metric definitions

### Current customer aging

The customer aging report uses the same five canonical buckets as the existing global aging report:

- `NOT_DUE`
- `OVERDUE_1_7`
- `OVERDUE_8_30`
- `OVERDUE_31_60`
- `OVERDUE_60_PLUS`

It includes only customers with a positive current balance in `OPEN` or `PARTIALLY_PAID` receivables. Each returned customer has all five bucket amounts; missing buckets are zero. A customer is included by a bucket filter only when that bucket's amount is positive.

The default ordering is total remaining amount descending, then customer name ascending. The current global report's persisted `paidAmount` rollup remains the source for this current-state query.

### Historical trend

The trend contains one point per calendar month in `Asia/Ho_Chi_Minh`:

- `collected`: the sum of `payments.totalAmount` grouped by `receivedAt`. This represents cash received, including cash not yet allocated to a receivable.
- `outstanding`: the receivable balance at the end of each month, read from the history query supplied by #172. The current month is evaluated at query time because it is incomplete.

The selected range includes the current month:

- `months=3`: current month plus the two previous months.
- `months=6`: current month plus the five previous months.
- `months=12`: current month plus the eleven previous months.

Months with no collected payments return `collected: 0`. If the history model has no data before its rollout point, those older points return `outstanding: null`; they must not be changed to zero or reconstructed by summing payment allocations. The frontend renders a visible data-gap note for those points.

## Backend API

### `GET /api/v1/reports/aging/customers`

Query parameters:

```ts
interface CustomerAgingQuery {
  page?: number; // default 1, minimum 1
  limit?: number; // default 20, maximum 100
  search?: string; // name, tax code, or phone; max search length applies
  bucket?: AgingBucket; // one canonical bucket; omitted means all buckets
}
```

Response:

```ts
interface CustomerAgingResponse {
  items: Array<{
    customerId: string;
    customerName: string;
    taxCode: string;
    buckets: Array<{
      bucket: AgingBucket;
      totalRemaining: string;
    }>;
    totalRemaining: string;
  }>;
  total: number;
  page: number;
  limit: number;
}
```

All VND amount fields in these report responses use exact base-10 integer strings at every size (ADR-0035).

The `buckets` array always contains the five buckets in canonical order. The response omits internal `organizationId` and ORM/version fields.

Search is case-insensitive and partial, matching the existing customer list behavior across `name`, `taxCode`, and `phone`. Search is applied before grouping; the bucket predicate is applied to the grouped customer/bucket totals before pagination. Both are evaluated in the database. The query is parameterized and tenant-scoped.

The endpoint requires `JwtAuthGuard`, `PermissionGuard`, and `@RequirePermission(Permission.REPORT_READ)`.

### `GET /api/v1/reports/trend`

Query parameters:

```ts
interface TrendQuery {
  months?: 3 | 6 | 12; // default 12
}
```

Response:

```ts
interface ReportsTrendResponse {
  months: 3 | 6 | 12;
  items: Array<{
    month: string; // YYYY-MM in Asia/Ho_Chi_Minh
    outstanding: string | null;
    collected: string;
  }>;
}
```

The response contains exactly the selected number of points, ordered oldest to newest. Invalid `months` values use the existing validation error shape. The endpoint requires the same authentication, authorization, and tenant scoping as the other Reports endpoints.

The trend repository consumes the historical-balance query from #172 through an application port. It does not import the history ORM entity directly and does not aggregate `payment_allocations` at runtime.

## Frontend behavior

The existing Reports page gains two sections; no new route is introduced.

### Customer aging section

- Search input for customer name, tax code, or phone.
- Single-select bucket filter: all, not due, 1–7, 8–30, 31–60, 60+.
- Table columns: customer, tax code, five bucket amounts, total remaining.
- Each bucket cell displays VND amount only.
- Filter changes reset page to 1.
- Pagination uses the existing `page`/`limit` convention and defaults to 20 rows.
- The table keeps all five bucket columns even when one bucket filter is active.
- URL search parameters preserve search, bucket, page, and trend months across refresh/share.
- Empty state distinguishes “no customers with current receivables” from an API error.

### Trend section

- Preset selector: 3, 6, or 12 months; default 12.
- Two-line Recharts chart with `outstanding` and `collected` on one VND axis.
- Tooltip displays the Vietnamese month label and VND values.
- The current month is labeled as partial/as-of-now.
- A null historical `outstanding` point creates a visible gap and a short explanatory note; it is not rendered as zero.
- Loading and error states follow existing Reports-page patterns.

## Architecture

The existing `reporting/` Clean Architecture module is extended:

- `presentation/`: query DTOs and controller methods only.
- `application/`: query services and repository ports for customer aging and trend.
- `infrastructure/`: parameterized PostgreSQL reporting queries and explicit raw-row mapping.
- `domain/`: no new domain entity for #135; the history domain/storage belongs to #172.
- `frontend/features/reports/`: API types/functions/hooks and focused table/chart components, reusing existing table, select, pagination, URL-state, and formatting patterns.

No external API is called inside a report query. Report reads are non-mutating; history writes remain transactional under #172.

## Testing

Backend unit tests cover:

- DTO validation for pagination, search length, bucket, and `months`.
- Customer aging query-service ordering, zero-filled buckets, tenant context, and repository delegation.
- Trend query-service default/preset handling and null pre-history points.
- Controller authorization and response mapping.

Postgres integration coverage covers:

- Customer search across name/tax code/phone.
- Bucket filtering before pagination and stable ordering.
- Tenant isolation.
- Monthly collected grouping and zero-filled months.
- Consumption of history-backed outstanding values and preservation of pre-history `null` values.

Frontend tests cover:

- API parameter construction.
- URL state for search, bucket, page, and months.
- Resetting page when search/filter changes.
- Table rendering of all five bucket columns and VND amounts.
- Trend preset changes, two series, and null-point gaps/notice.
- Loading, error, and empty states.

## Rollout and dependency

1. Implement and verify #172's history model and transactional write path.
2. Implement #135's report APIs and frontend against the history query port.
3. Do not expose historical `outstanding` trend data before #172 is available.

History coverage begins at the #172 rollout point. The Reports UI must communicate unavailable pre-history months rather than presenting misleading values.
