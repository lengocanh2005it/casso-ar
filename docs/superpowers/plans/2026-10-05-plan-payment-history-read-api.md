# Plan Payment History Read API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add a tenant-scoped, paginated `GET /api/v1/payos/payment-history` endpoint for accepted and review-required plan payment receipts.

**Architecture:** `ListPlanPaymentHistoryUseCase` gets `organizationId` from `TenantContextService` and calls a read-page method on the existing history repository port. The TypeORM adapter selects only response data and scopes by organization; the PayOS controller maps it to class DTOs and applies the existing subscription-management permission.

**Tech Stack:** NestJS, TypeORM, class-validator, Jest, Supertest, testcontainers PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-10-05-billing-payment-history-design.md` (API contract, #466).

## Global Constraints

- Use `PaginationDto`: page defaults to 1; limit defaults to 20 and has a maximum of 100.
- Scope every history query by the `organizationId` from `TenantContextService`; do not accept organization IDs from HTTP input.
- Gate the endpoint with `Permission.SUBSCRIPTION_MANAGE`.
- Return class DTOs from `.dto.ts` files; omit tenant ID, source ID, provider evidence, frozen quote, version, and other internal fields.
- Return the received amount as `number | null`; `null` represents legacy history whose amount is unknown.
- Keep the immutable receipt outcome (`ACCEPTED` or `REVIEW_REQUIRED`) distinct from source-order entitlement status.
- Preserve the PayOS order code, including the renewal offset, as its stored decimal string.
- Sort by `confirmedAt DESC, id DESC`; use SQL pagination and return `{ items, total, page, limit }`.

## Review Focus

- Cross-tenant access: derive the organization from the authenticated tenant, and prove an `organizationId` query parameter cannot switch the result set.
- Equal confirmation times: use the ID tie-breaker so pages do not reorder entries with the same timestamp.
- Legacy records: preserve `receivedAmount: null` and `LEGACY_BACKFILL` provenance instead of fabricating an amount.
- Large PayOS order codes: serialize the original order code as a string to avoid JavaScript integer precision loss.
- Access control and query validation: require `SUBSCRIPTION_MANAGE`; enforce the shared page and limit constraints and document their validation error.

---

### Task 1: Application read contract and use case

**Files:**
- Modify: `apps/backend/src/modules/payos/application/plan-payment-history-repository.port.ts`
- Create: `apps/backend/src/modules/payos/application/list-plan-payment-history.usecase.ts`
- Test: `apps/backend/src/modules/payos/application/list-plan-payment-history.usecase.spec.ts`

**Interfaces:**
- `IPlanPaymentHistoryRepository.findPage(query)` consumes `{ organizationId: string; page: number; limit: number }` and returns `{ items: PlanPaymentHistoryListItem[]; total: number }`.
- `PlanPaymentHistoryListItem` carries `sourceType`, `orderCode: string`, `planId`, `receivedAmount: number | null`, `initialOutcome`, `provenance`, and `confirmedAt: Date`.
- `ListPlanPaymentHistoryUseCase.execute({ page, limit })` returns `{ items, total, page, limit }` and has no organization ID in its input.

- [x] **Step 1: Write the failing tenant-scope test**

Create a use-case spec with a mocked repository returning one legacy record and a mocked `TenantContextService` returning `org-a`. Assert the use case returns `{ items, total, page, limit }` and calls `findPage` with exactly `{ organizationId: 'org-a', page: 2, limit: 5 }`.

- [x] **Step 2: Run the unit test and confirm the expected failure**

Run from `apps/backend`: `pnpm test -- list-plan-payment-history.usecase.spec.ts`.

Expected: Jest reports the new use-case module is missing.

- [x] **Step 3: Add the read port and use case**

Add the read item and page-query types to the existing application port. Add `findPage` to `IPlanPaymentHistoryRepository`. Implement the use case so it reads the organization from `TenantContextService`, passes only that organization plus page and limit to the repository, and returns the requested pagination values with the page result.

The application boundary should have this shape:

```typescript
export interface PlanPaymentHistoryPageQuery {
  organizationId: string;
  page: number;
  limit: number;
}

export interface PlanPaymentHistoryListItem {
  sourceType: PlanPaymentHistorySourceType;
  orderCode: string;
  planId: PlanId;
  receivedAmount: number | null;
  initialOutcome: PlanPaymentReceiptOutcome;
  provenance: PlanPaymentHistoryProvenance;
  confirmedAt: Date;
}
```

The use case reads only pagination from request input:

```typescript
const organizationId = this.tenantContext.getOrganizationId();
const result = await this.historyRepo.findPage({
  organizationId,
  page: input.page,
  limit: input.limit,
});
return { ...result, page: input.page, limit: input.limit };
```

- [x] **Step 4: Run the focused unit test and confirm it passes**

Run from `apps/backend`: `pnpm test -- list-plan-payment-history.usecase.spec.ts`.

Expected: the tenant-scope and pagination assertions pass.

- [x] **Step 5: Record the application slice for the endpoint commit**

The use case and its shared repository port cannot be committed as a standalone buildable slice: the TypeORM class implements that port and must add `findPage` in Task 2. Record the completed RED/GREEN result in the SDD ledger, then commit both tasks together after the endpoint e2e test passes.

### Task 2: Tenant-scoped HTTP endpoint and PostgreSQL coverage

**Files:**
- Modify: `apps/backend/src/modules/payos/infrastructure/typeorm-plan-payment-history.repository.ts`
- Modify: `apps/backend/src/modules/payos/payos.module.ts`
- Modify: `apps/backend/src/modules/payos/presentation/payos.controller.ts`
- Modify: `apps/backend/src/modules/payos/presentation/payos.controller.spec.ts`
- Create: `apps/backend/src/modules/payos/presentation/dto/list-plan-payment-history-query.dto.ts`
- Create: `apps/backend/src/modules/payos/presentation/dto/plan-payment-history-response.dto.ts`
- Test: `apps/backend/test/payos-plan-upgrade.e2e-spec.ts`

**Interfaces:**
- The controller receives `ListPlanPaymentHistoryQueryDto extends PaginationDto`; it does not define or read `organizationId`.
- The endpoint returns `{ items, total, page, limit }`; each item includes plan, payment kind, PayOS order code, nullable received amount, initial outcome, provenance, and confirmation time.

- [x] **Step 1: Add the failing real-Postgres endpoint test**

Extend the existing PayOS e2e suite so it reuses its Postgres container and authenticated organization setup. Seed three history rows for organization A (including two with equal `confirmedAt`, one with a null amount and legacy provenance) and one row for organization B. Request page 1 and page 2 for A, including `organizationId=B` in the query string. Assert the result contains only A's entries, reports A's total, follows `confirmedAt DESC, id DESC`, preserves the null amount, provenance, and string order code, and does not expose `organizationId`, `sourceId`, `quotedAmount`, or provider identity fields. Also assert defaults for omitted pagination, reject `limit=101` with `VALIDATION_ERROR`, and return 403 for an authenticated role without `SUBSCRIPTION_MANAGE`.

- [x] **Step 2: Run the e2e test and confirm the expected failure**

Run from `apps/backend`: `pnpm test:e2e -- payos-plan-upgrade.e2e-spec.ts -t "lists tenant-scoped plan payment history"`.

Expected: the new route returns 404 because it has not been added.

- [x] **Step 3: Implement the repository page query**

Use the injected TypeORM repository for a tenant-scoped scalar query and count. Select only response fields, cast the quoted `bigint` order code to SQL text to prevent TypeORM from rounding values above JavaScript's safe integer limit, then map rows explicitly. Apply `confirmedAt DESC, id DESC`, with `skip = (page - 1) * limit` and `take = limit`.

The query retains both the organization predicate and stable database ordering:

```typescript
const historyQuery = this.repository
  .createQueryBuilder('history')
  .select('history.sourceType', 'sourceType')
  .addSelect('history."orderCode"::text', 'orderCode')
  .where('history.organizationId = :organizationId', {
    organizationId: query.organizationId,
  })
  .orderBy('history.confirmedAt', 'DESC')
  .addOrderBy('history.id', 'DESC')
  .skip((query.page - 1) * query.limit)
  .take(query.limit);
```

- [x] **Step 4: Add DTOs, controller route, and provider wiring**

Create a query DTO that extends the shared `PaginationDto`. Create class DTOs with Swagger properties for the item and pagination envelope; expose no ORM or internal fields. Add `ListPlanPaymentHistoryUseCase` to `PayosModule`. Add `GET payment-history` to `PayosController`, decorate it with `@ApiOperation`, `@ApiOkResponse`, `@ApiErrorResponse` for validation/auth/permission failures, and `@RequirePermission(Permission.SUBSCRIPTION_MANAGE)`. Update the controller spec to provide and verify the list use case.

Map the public response explicitly; serialize `confirmedAt` with `toISOString()` and keep the order code as a string:

```typescript
return {
  items: result.items.map((item) => ({
    paymentKind: item.sourceType,
    planId: item.planId,
    orderCode: item.orderCode,
    receivedAmount: item.receivedAmount,
    initialOutcome: item.initialOutcome,
    provenance: item.provenance,
    confirmedAt: item.confirmedAt.toISOString(),
  })),
  total: result.total,
  page: result.page,
  limit: result.limit,
};
```

- [x] **Step 5: Run the focused e2e test and confirm it passes**

Run from `apps/backend`: `pnpm test:e2e -- payos-plan-upgrade.e2e-spec.ts -t "lists tenant-scoped plan payment history"`.

Expected: both pages return only organization A's rows with the documented order and fields; the attempted organization override has no effect.

- [x] **Step 6: Commit the endpoint slice**

```bash
git add apps/backend/src/modules/payos apps/backend/test/payos-plan-upgrade.e2e-spec.ts
git commit -m "feat: expose paginated plan payment history"
```

### Task 3: Full verification and ticket documentation

**Files:**
- Modify: `CONTEXT.md`
- Modify: `docs/wayfinder/feature-map.md`
- Modify: `docs/superpowers/plans/2026-10-05-plan-payment-history-read-api.md`

- [x] **Step 1: Run the PayOS unit tests**

Run from `apps/backend`: `pnpm test -- payos`.

Expected: all matching PayOS unit specs pass.

- [x] **Step 2: Run backend domain and architecture checks**

Run the repository's `/domain-check` procedure, then from the repository root run `pnpm --filter @casso-ar/backend arch-check`.

Expected: domain and architecture checks report no violations.

- [x] **Step 3: Run repository verification**

Run from the repository root: `pnpm verify`.

Expected: lint, type-check, architecture checks, and test suites complete successfully.

- [x] **Step 4: Recheck documentation and the worktree diff**

Run from the repository root: `git diff --check` and `git status --short --branch`.

Expected: no whitespace errors; all ticket changes are on `feat/466-plan-payment-history-read`, with `main` clean.

- [x] **Step 5: Commit the ticket documentation**

```bash
git add CONTEXT.md docs/wayfinder/feature-map.md docs/superpowers/plans/2026-10-05-plan-payment-history-read-api.md
git commit -m "docs: track plan payment history read endpoint"
```
