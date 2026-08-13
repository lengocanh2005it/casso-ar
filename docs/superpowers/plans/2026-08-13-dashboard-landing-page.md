# Dashboard Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare `<h1>Dashboard</h1>` placeholder at `/dashboard` with a real landing page: a conditional action banner when there's pending review work, a 4-card KPI grid, a recent-activity feed (new backend endpoint), and a top-overdue-customers list — all reusing already-shipped data except the new activity endpoint.

**Architecture:** Backend: one new read method on the already-shipped `CollectionActivityModule` (org-wide variant of the existing per-receivable/per-customer timeline pattern) exposed as `GET /api/v1/activity`. Frontend: a new `features/dashboard/` slice (types, api, hooks, components) assembled into `DashboardPage`, following Plan #18 conventions exactly — no new design tokens, no new dependencies.

**Tech Stack:** NestJS 11, TypeORM 1.1 (backend); React 19, TanStack Query, Vitest + Testing Library, shadcn/ui, lucide-react (frontend).

## Global Constraints

- Money: integers in VND units, format via `formatVND()` — never a new formatter (AGENTS.md, `.claude/rules/frontend.md`).
- Every query scoped by `organizationId` via `TenantContextService.getOrganizationId()` — never passed as a param (AGENTS.md).
- `application/` throws only `AppError`, never `HttpException` (`.claude/rules/application.md`).
- CRUD repositories extend `BaseRepository` (`.claude/rules/infrastructure.md`) — `TypeOrmCollectionActivityRepository` already does.
- File/class naming: kebab-case files, PascalCase classes (AGENTS.md).
- Backend tests: `npx jest`, Jest 30. Frontend tests: `npx vitest run`, Vitest — **do not confuse the two test runners or their mock syntax** (`jest.fn()` vs `vi.fn()`/`vi.hoisted`).
- No new dependencies: no date-fns on the frontend (not currently a dependency there; reuse `formatDate()` from `lib/format.ts`), no new Vietnamese activity-type label map (the existing `ReceivableTimeline` component prints raw `activityType` strings as-is — match that precedent exactly, don't invent translations).
- Frontend feature structure: `features/<feature>/{pages,components,hooks,api}` + barrel `index.ts` (`.claude/rules/frontend.md`).

---

### Task 1: `findByOrganizationId` on `ICollectionActivityRepository`

**Files:**
- Modify: `apps/backend/src/modules/collection-activity/application/collection-activity-repository.port.ts`
- Modify: `apps/backend/src/modules/collection-activity/infrastructure/typeorm-collection-activity.repository.ts`
- Test: `apps/backend/src/modules/collection-activity/infrastructure/typeorm-collection-activity.repository.spec.ts` (new file — no dedicated spec currently exists for this repository; it's only exercised via the controller's e2e coverage today, but this new org-wide method deserves a direct test since it has no `id` filter to isolate it, unlike the existing two methods)

**Interfaces:**
- Consumes: `TenantContextService.getOrganizationId()` (via `BaseRepository`'s `this.tenantContext`), `CollectionActivityOrmEntity`, `CollectionActivity` domain entity, `CollectionActivityPage` (existing type: `{ items: CollectionActivity[]; total: number }`).
- Produces: `findByOrganizationId(page: number, limit: number): Promise<CollectionActivityPage>` on both `ICollectionActivityRepository` and `TypeOrmCollectionActivityRepository`.

This repo's TypeORM repository specs do **not** use a real Postgres testcontainer — they mock the injected `Repository` with plain `jest.fn()` and instantiate a real `TenantContextService` directly (`new TenantContextService()`), running the call inside `tenantContext.run(...)`. See `apps/backend/src/modules/customers/infrastructure/typeorm-customer.repository.spec.ts` for the exact convention — copy its shape, not a testcontainer setup.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/collection-activity/infrastructure/typeorm-collection-activity.repository.spec.ts
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import { CollectionActivityType } from '../common/collection-activity-types';
import { CollectionActivity } from '../domain/collection-activity';
import { TypeOrmCollectionActivityRepository } from './typeorm-collection-activity.repository';

function buildActivity(
  id: string,
  createdAt: Date,
  organizationId = 'org-1',
): CollectionActivity {
  return new CollectionActivity({
    id,
    organizationId,
    receivableId: 'rec-1',
    customerId: 'cust-1',
    activityType: CollectionActivityType.PAYMENT_RECEIVED,
    description: 'x',
    metadata: {},
    createdByUserId: null,
    createdAt,
  });
}

describe('TypeOrmCollectionActivityRepository', () => {
  it('findByOrganizationId scopes by the current tenant, orders newest first, and paginates', async () => {
    const rows = [
      { ...buildActivity('act-2', new Date('2026-08-02')) },
      { ...buildActivity('act-1', new Date('2026-08-01')) },
    ];
    const ormRepo = {
      findAndCount: jest.fn().mockResolvedValue([rows, 2]),
    };
    const tenantContext = new TenantContextService();
    const repo = new TypeOrmCollectionActivityRepository(
      ormRepo as any,
      tenantContext,
    );

    const result = await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      () => repo.findByOrganizationId(1, 20),
    );

    expect(ormRepo.findAndCount).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      order: { createdAt: 'DESC' },
      skip: 0,
      take: 20,
    });
    expect(result.total).toBe(2);
    expect(result.items.map((i) => i.id)).toEqual(['act-2', 'act-1']);
  });

  it('computes skip from page and limit', async () => {
    const ormRepo = { findAndCount: jest.fn().mockResolvedValue([[], 0]) };
    const tenantContext = new TenantContextService();
    const repo = new TypeOrmCollectionActivityRepository(
      ormRepo as any,
      tenantContext,
    );

    await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      () => repo.findByOrganizationId(3, 10),
    );

    expect(ormRepo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns "typeorm-collection-activity.repository.spec"` (from `apps/backend`)
Expected: FAIL — `repo.findByOrganizationId is not a function`

- [ ] **Step 3: Add the port method**

```typescript
// apps/backend/src/modules/collection-activity/application/collection-activity-repository.port.ts
// Add to ICollectionActivityRepository, after findByCustomerId:
  findByOrganizationId(
    page: number,
    limit: number,
  ): Promise<CollectionActivityPage>;
```

- [ ] **Step 4: Implement it**

```typescript
// apps/backend/src/modules/collection-activity/infrastructure/typeorm-collection-activity.repository.ts
// Add this method to TypeOrmCollectionActivityRepository, after findByCustomerId:
  async findByOrganizationId(
    page: number,
    limit: number,
  ): Promise<CollectionActivityPage> {
    const organizationId = this.tenantContext.getOrganizationId();
    const [rows, total] = await this.ormRepo.findAndCount({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: rows.map(toDomain), total };
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --testPathPatterns "typeorm-collection-activity.repository.spec"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/collection-activity/application/collection-activity-repository.port.ts apps/backend/src/modules/collection-activity/infrastructure/typeorm-collection-activity.repository.ts apps/backend/src/modules/collection-activity/infrastructure/typeorm-collection-activity.repository.spec.ts
git commit -m "feat: findByOrganizationId on ICollectionActivityRepository"
```

---

### Task 2: `GetOrganizationTimelineUseCase`

**Files:**
- Create: `apps/backend/src/modules/collection-activity/application/get-organization-timeline.usecase.ts`
- Test: `apps/backend/src/modules/collection-activity/application/get-organization-timeline.usecase.spec.ts`

**Interfaces:**
- Consumes: `ICollectionActivityRepository.findByOrganizationId` (Task 1), `TimelinePage` (existing type, exported from `get-receivable-timeline.usecase.ts`: `{ items: CollectionActivity[]; total: number; page: number; limit: number }`).
- Produces: `GetOrganizationTimelineUseCase.execute(page: number, limit: number): Promise<TimelinePage>`.

Structurally identical to `GetCustomerTimelineUseCase` — same shape, no `id` parameter.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/collection-activity/application/get-organization-timeline.usecase.spec.ts
import {
  CollectionActivity,
  CollectionActivityType,
} from '../domain/collection-activity';
import { GetOrganizationTimelineUseCase } from './get-organization-timeline.usecase';

describe('GetOrganizationTimelineUseCase', () => {
  it('passes page and limit down to the repository and returns the envelope', async () => {
    const activityRepo = {
      create: jest.fn(),
      findByReceivableId: jest.fn(),
      findByCustomerId: jest.fn(),
      findByOrganizationId: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };

    const useCase = new GetOrganizationTimelineUseCase(activityRepo as any);
    const result = await useCase.execute(2, 25);

    expect(activityRepo.findByOrganizationId).toHaveBeenCalledWith(2, 25);
    expect(result).toEqual({ items: [], total: 0, page: 2, limit: 25 });
  });

  it('returns activities across the whole organization', async () => {
    const activities = [
      new CollectionActivity({
        id: 'act-1',
        organizationId: 'org-1',
        receivableId: 'rec-1',
        customerId: 'cust-1',
        activityType: CollectionActivityType.PAYMENT_RECEIVED,
        description: 'x',
        metadata: {},
        createdByUserId: null,
        createdAt: new Date('2026-08-03'),
      }),
    ];
    const activityRepo = {
      create: jest.fn(),
      findByReceivableId: jest.fn(),
      findByCustomerId: jest.fn(),
      findByOrganizationId: jest
        .fn()
        .mockResolvedValue({ items: activities, total: 1 }),
    };

    const useCase = new GetOrganizationTimelineUseCase(activityRepo as any);
    const result = await useCase.execute(1, 20);

    expect(result.items).toBe(activities);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns "get-organization-timeline.usecase.spec"` (from `apps/backend`)
Expected: FAIL — `Cannot find module './get-organization-timeline.usecase'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/collection-activity/application/get-organization-timeline.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import {
  COLLECTION_ACTIVITY_REPOSITORY,
  ICollectionActivityRepository,
} from './collection-activity-repository.port';
import type { TimelinePage } from './get-receivable-timeline.usecase';

@Injectable()
export class GetOrganizationTimelineUseCase {
  constructor(
    @Inject(COLLECTION_ACTIVITY_REPOSITORY)
    private readonly activityRepo: ICollectionActivityRepository,
  ) {}

  async execute(page: number, limit: number): Promise<TimelinePage> {
    const result = await this.activityRepo.findByOrganizationId(page, limit);
    return { ...result, page, limit };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPatterns "get-organization-timeline.usecase.spec"`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/collection-activity/application/get-organization-timeline.usecase.ts apps/backend/src/modules/collection-activity/application/get-organization-timeline.usecase.spec.ts
git commit -m "feat: GetOrganizationTimelineUseCase"
```

---

### Task 3: `GET /api/v1/activity` route + module wiring

**Files:**
- Modify: `apps/backend/src/modules/collection-activity/presentation/collection-activity.controller.ts`
- Modify: `apps/backend/src/modules/collection-activity/collection-activity.module.ts`
- Test: `apps/backend/src/modules/collection-activity/presentation/collection-activity.controller.spec.ts` (new — the controller has no dedicated unit spec today; add one since we're adding branching to it)

**Interfaces:**
- Consumes: `GetOrganizationTimelineUseCase` (Task 2), existing `PaginationDto` (`common/dto/pagination.dto.ts`), existing `toCollectionActivityResponse` mapper.
- Produces: `GET /api/v1/activity?page=&limit=` → `{ items: CollectionActivityResponseDto[]; total: number; page: number; limit: number }`, requires `RECEIVABLE_READ` permission (same as the other two timeline routes).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/collection-activity/presentation/collection-activity.controller.spec.ts
import { CollectionActivity } from '../domain/collection-activity';
import { CollectionActivityType } from '../common/collection-activity-types';
import { CollectionActivityController } from './collection-activity.controller';

describe('CollectionActivityController', () => {
  function buildController() {
    const recordManualActivityUseCase = { execute: jest.fn() } as any;
    const getReceivableTimelineUseCase = { execute: jest.fn() } as any;
    const getCustomerTimelineUseCase = { execute: jest.fn() } as any;
    const getOrganizationTimelineUseCase = { execute: jest.fn() } as any;
    const tenantContext = {
      getCurrentUser: jest.fn().mockReturnValue({ userId: 'u1' }),
    } as any;
    const idempotency = {
      execute: jest.fn((_key, _headerKey, _dto, fn) => fn()),
    } as any;

    const controller = new CollectionActivityController(
      recordManualActivityUseCase,
      getReceivableTimelineUseCase,
      getCustomerTimelineUseCase,
      getOrganizationTimelineUseCase,
      tenantContext,
      idempotency,
    );
    return { controller, getOrganizationTimelineUseCase };
  }

  it('organizationTimeline maps use case output through toCollectionActivityResponse', async () => {
    const { controller, getOrganizationTimelineUseCase } = buildController();
    getOrganizationTimelineUseCase.execute.mockResolvedValue({
      items: [
        new CollectionActivity({
          id: 'act-1',
          organizationId: 'org-1',
          receivableId: 'rec-1',
          customerId: 'cust-1',
          activityType: CollectionActivityType.PAYMENT_RECEIVED,
          description: 'x',
          metadata: {},
          createdByUserId: null,
          createdAt: new Date('2026-08-03'),
        }),
      ],
      total: 1,
      page: 1,
      limit: 20,
    });

    const result = await controller.organizationTimeline({ page: 1, limit: 20 });

    expect(getOrganizationTimelineUseCase.execute).toHaveBeenCalledWith(1, 20);
    expect(result.items).toEqual([
      expect.objectContaining({ id: 'act-1', description: 'x' }),
    ]);
    expect(result.total).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns "collection-activity.controller.spec"` (from `apps/backend`)
Expected: FAIL — constructor arity mismatch (controller doesn't accept `getOrganizationTimelineUseCase` yet, and `organizationTimeline` doesn't exist)

- [ ] **Step 3: Update the controller**

```typescript
// apps/backend/src/modules/collection-activity/presentation/collection-activity.controller.ts
// Add this import alongside the other use case imports:
import { GetOrganizationTimelineUseCase } from '../application/get-organization-timeline.usecase';

// Update the constructor to accept it (insert after getCustomerTimelineUseCase):
  constructor(
    private readonly recordManualActivityUseCase: RecordManualActivityUseCase,
    private readonly getReceivableTimelineUseCase: GetReceivableTimelineUseCase,
    private readonly getCustomerTimelineUseCase: GetCustomerTimelineUseCase,
    private readonly getOrganizationTimelineUseCase: GetOrganizationTimelineUseCase,
    private readonly tenantContext: TenantContextService,
    private readonly idempotency: IdempotencyService,
  ) {}

// Add this new route, after the existing customerTimeline() method:
  @Get('activity')
  @RequirePermission(Permission.RECEIVABLE_READ)
  async organizationTimeline(@Query() pagination: PaginationDto) {
    const result = await this.getOrganizationTimelineUseCase.execute(
      pagination.page,
      pagination.limit,
    );
    return {
      items: result.items.map(toCollectionActivityResponse),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }
```

- [ ] **Step 4: Wire the use case into the module**

```typescript
// apps/backend/src/modules/collection-activity/collection-activity.module.ts
// Add this import:
import { GetOrganizationTimelineUseCase } from './application/get-organization-timeline.usecase';

// Add GetOrganizationTimelineUseCase to `providers` (after GetCustomerTimelineUseCase):
    GetOrganizationTimelineUseCase,

// providers array should now read:
  providers: [
    {
      provide: COLLECTION_ACTIVITY_REPOSITORY,
      useClass: TypeOrmCollectionActivityRepository,
    },
    RecordManualActivityUseCase,
    GetReceivableTimelineUseCase,
    GetCustomerTimelineUseCase,
    GetOrganizationTimelineUseCase,
    CollectionActivityListener,
  ],
```

(No `exports` change needed — nothing outside this module consumes `GetOrganizationTimelineUseCase` directly; the frontend calls it over HTTP.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --testPathPatterns "collection-activity.controller.spec"`
Expected: PASS

- [ ] **Step 6: Run the full collection-activity suite to confirm nothing broke**

Run: `npx jest --testPathPatterns "collection-activity"` (from `apps/backend`)
Expected: PASS — all existing + new tests

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit` (from `apps/backend`)
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/collection-activity/presentation/collection-activity.controller.ts apps/backend/src/modules/collection-activity/presentation/collection-activity.controller.spec.ts apps/backend/src/modules/collection-activity/collection-activity.module.ts
git commit -m "feat: wire GET /api/v1/activity (org-wide recent activity)"
```

---

### Task 4: e2e test for `GET /api/v1/activity`

**Files:**
- Create: `apps/backend/test/organization-activity.e2e-spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-3, via a real HTTP request against a real Postgres testcontainer.

Find an existing `*.e2e-spec.ts` in `apps/backend/test/` that seeds a receivable + records a manual activity (there should be one covering `POST /receivables/:id/activities` or `GET /receivables/:id/timeline`) and copy its `beforeAll`/`setUpOrg`-style bootstrap exactly — every e2e spec in this repo follows the same `PostgreSqlContainer` + JWT-signing setup (see `apps/backend/test/payos-plan-upgrade.e2e-spec.ts` from a prior ticket, or any receivables e2e spec, for the shape).

- [ ] **Step 1: Write the test**

```typescript
// apps/backend/test/organization-activity.e2e-spec.ts
// Bootstrap (container, app, dataSource, jwtService, setUpOrg helper) copied
// from an existing e2e spec in this repo — see note above. The body below
// assumes `app`, `dataSource`, and a `setUpOrg(organizationId, role)` -> { token }
// helper already exist from that copied boilerplate.

import { CollectionActivityOrmEntity } from '../src/modules/collection-activity/infrastructure/collection-activity.orm-entity';

// Inside the describe block, add:
it('GET /api/v1/activity returns only this organization's activities, newest first', async () => {
  const organizationId = '00000000-0000-4000-8000-000000000701';
  const { token } = await setUpOrg(organizationId, 'OWNER');
  const otherOrgId = '00000000-0000-4000-8000-000000000702';
  await setUpOrg(otherOrgId, 'OWNER');

  await dataSource.getRepository(CollectionActivityOrmEntity).save([
    {
      id: '00000000-0000-4000-8000-000000000801',
      organizationId,
      receivableId: 'rec-1',
      customerId: 'cust-1',
      activityType: 'PAYMENT_RECEIVED',
      description: 'older',
      metadata: {},
      createdByUserId: null,
      createdAt: new Date('2026-08-01T00:00:00Z'),
    },
    {
      id: '00000000-0000-4000-8000-000000000802',
      organizationId,
      receivableId: 'rec-1',
      customerId: 'cust-1',
      activityType: 'EMAIL_SENT',
      description: 'newer',
      metadata: {},
      createdByUserId: null,
      createdAt: new Date('2026-08-02T00:00:00Z'),
    },
    {
      id: '00000000-0000-4000-8000-000000000803',
      organizationId: otherOrgId,
      receivableId: 'rec-9',
      customerId: 'cust-9',
      activityType: 'PAYMENT_RECEIVED',
      description: 'other org',
      metadata: {},
      createdByUserId: null,
      createdAt: new Date('2026-08-03T00:00:00Z'),
    },
  ]);

  const res = await request(app.getHttpServer())
    .get('/api/v1/activity')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  expect(res.body.total).toBe(2);
  expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([
    '00000000-0000-4000-8000-000000000802',
    '00000000-0000-4000-8000-000000000801',
  ]);
});
```

- [ ] **Step 2: Run it**

Run: `npx jest --config ./test/jest-e2e.json --testPathPatterns "organization-activity"` (from `apps/backend`)
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/organization-activity.e2e-spec.ts
git commit -m "test: e2e coverage for GET /api/v1/activity"
```

---

### Task 5: Frontend `dashboard/` feature — types + API + hooks

**Files:**
- Create: `apps/frontend/src/features/dashboard/types.ts`
- Create: `apps/frontend/src/features/dashboard/api/dashboard-api.ts`
- Create: `apps/frontend/src/features/dashboard/api/use-organization-activity.ts`
- Test: `apps/frontend/src/features/dashboard/api/dashboard-api.spec.ts`

**Interfaces:**
- Consumes: `apiRequest<T>` (`@/lib/api-client`).
- Produces:
  ```typescript
  export interface OrganizationActivityItem {
    id: string;
    receivableId: string;
    customerId: string;
    activityType: string;
    description: string;
    createdAt: string;
  }
  export interface OrganizationActivityPage {
    items: OrganizationActivityItem[];
    total: number;
    page: number;
    limit: number;
  }
  export function fetchOrganizationActivity(page?: number): Promise<OrganizationActivityPage>;
  export function useOrganizationActivity(): UseQueryResult<OrganizationActivityPage>;
  ```

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/dashboard/api/dashboard-api.spec.ts
import { describe, expect, it, vi } from 'vitest';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

import { fetchOrganizationActivity } from './dashboard-api';

describe('fetchOrganizationActivity', () => {
  it('calls GET /api/v1/activity with page and a fixed limit', async () => {
    apiRequest.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10 });

    await fetchOrganizationActivity(1);

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/activity',
      method: 'GET',
      params: { page: 1, limit: 10 },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/dashboard/api/dashboard-api.spec.ts` (from `apps/frontend`)
Expected: FAIL — `Cannot find module './dashboard-api'`

- [ ] **Step 3: Write the types and API function**

```typescript
// apps/frontend/src/features/dashboard/types.ts
export interface OrganizationActivityItem {
  id: string;
  receivableId: string;
  customerId: string;
  activityType: string;
  description: string;
  createdAt: string;
}

export interface OrganizationActivityPage {
  items: OrganizationActivityItem[];
  total: number;
  page: number;
  limit: number;
}
```

```typescript
// apps/frontend/src/features/dashboard/api/dashboard-api.ts
import { apiRequest } from '@/lib/api-client';
import type { OrganizationActivityPage } from '../types';

export function fetchOrganizationActivity(
  page = 1,
): Promise<OrganizationActivityPage> {
  return apiRequest<OrganizationActivityPage>({
    url: '/api/v1/activity',
    method: 'GET',
    params: { page, limit: 10 },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/dashboard/api/dashboard-api.spec.ts`
Expected: PASS

- [ ] **Step 5: Add the hook** (no dedicated test — a one-line `useQuery` wrapper, exercised through Task 8's page-level test)

```typescript
// apps/frontend/src/features/dashboard/api/use-organization-activity.ts
import { useQuery } from '@tanstack/react-query';
import { fetchOrganizationActivity } from './dashboard-api';

export function useOrganizationActivity() {
  return useQuery({
    queryKey: ['dashboard', 'activity'],
    queryFn: () => fetchOrganizationActivity(1),
  });
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc -b --noEmit` (from `apps/frontend`)
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/dashboard/types.ts apps/frontend/src/features/dashboard/api
git commit -m "feat: dashboard activity feed API + hook"
```

---

### Task 6: `PendingReviewBanner` component (the signature element)

**Files:**
- Create: `apps/frontend/src/features/dashboard/components/pending-review-banner.tsx`
- Test: `apps/frontend/src/features/dashboard/components/pending-review-banner.spec.tsx`

**Interfaces:**
- Consumes: `pendingCount: number` (prop — the page assembles this from `useReviewCount()`, this component stays a pure display component so it's trivially testable).
- Produces: `PendingReviewBanner({ pendingCount }: { pendingCount: number })` — renders `null` when `pendingCount === 0`; otherwise an actionable banner linking to `/exceptions`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/dashboard/components/pending-review-banner.spec.tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PendingReviewBanner } from './pending-review-banner';

describe('PendingReviewBanner', () => {
  it('renders nothing when there is no pending work', () => {
    const { container } = render(
      <MemoryRouter>
        <PendingReviewBanner pendingCount={0} />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the count and a link to the exception queue when work is pending', () => {
    render(
      <MemoryRouter>
        <PendingReviewBanner pendingCount={12} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/12/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Xử lý ngay/i })).toHaveAttribute(
      'href',
      '/exceptions',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/dashboard/components/pending-review-banner.spec.tsx` (from `apps/frontend`)
Expected: FAIL — `Cannot find module './pending-review-banner'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/features/dashboard/components/pending-review-banner.tsx
import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function PendingReviewBanner({
  pendingCount,
}: {
  pendingCount: number;
}) {
  if (pendingCount === 0) return null;

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-primary/30 bg-accent px-4 py-3">
      <div className="flex items-center gap-3">
        <AlertTriangle className="size-5 shrink-0 text-primary" />
        <p className="text-sm text-accent-foreground">
          <span className="font-semibold tabular-nums">{pendingCount}</span>{' '}
          giao dịch đang chờ đối soát.
        </p>
      </div>
      <Button asChild size="sm">
        <Link to="/exceptions">Xử lý ngay</Link>
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/dashboard/components/pending-review-banner.spec.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/dashboard/components/pending-review-banner.tsx apps/frontend/src/features/dashboard/components/pending-review-banner.spec.tsx
git commit -m "feat: PendingReviewBanner (dashboard signature element)"
```

---

### Task 7: `RecentActivityFeed` component

**Files:**
- Create: `apps/frontend/src/features/dashboard/components/recent-activity-feed.tsx`
- Test: `apps/frontend/src/features/dashboard/components/recent-activity-feed.spec.tsx`

**Interfaces:**
- Consumes: `OrganizationActivityItem[]` (prop — again a pure display component, data comes from `useOrganizationActivity()` at the page level), `formatDate` (`@/lib/format`).
- Produces: `RecentActivityFeed({ items }: { items: OrganizationActivityItem[] })`.

This mirrors `ReceivableTimeline`'s exact rendering approach (raw `activityType` string, no translation map — see Global Constraints).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/dashboard/components/recent-activity-feed.spec.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RecentActivityFeed } from './recent-activity-feed';

describe('RecentActivityFeed', () => {
  it('shows an empty state when there is no activity', () => {
    render(<RecentActivityFeed items={[]} />);
    expect(screen.getByText('Chưa có hoạt động.')).toBeTruthy();
  });

  it('renders each activity with its type, description, and date', () => {
    render(
      <RecentActivityFeed
        items={[
          {
            id: 'act-1',
            receivableId: 'rec-1',
            customerId: 'cust-1',
            activityType: 'PAYMENT_RECEIVED',
            description: 'Nhận thanh toán 5.000.000 ₫',
            createdAt: '2026-08-13T00:00:00Z',
          },
        ]}
      />,
    );
    expect(screen.getByText('PAYMENT_RECEIVED')).toBeTruthy();
    expect(screen.getByText('Nhận thanh toán 5.000.000 ₫')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/dashboard/components/recent-activity-feed.spec.tsx` (from `apps/frontend`)
Expected: FAIL — `Cannot find module './recent-activity-feed'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/features/dashboard/components/recent-activity-feed.tsx
import { formatDate } from '@/lib/format';
import type { OrganizationActivityItem } from '../types';

export function RecentActivityFeed({
  items,
}: {
  items: OrganizationActivityItem[];
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Chưa có hoạt động.</p>;
  }

  return (
    <ol className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="font-medium">{item.activityType}</span>
            <time className="shrink-0 text-xs text-muted-foreground">
              {formatDate(item.createdAt)}
            </time>
          </div>
          <p className="mt-0.5 text-muted-foreground">{item.description}</p>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/dashboard/components/recent-activity-feed.spec.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/dashboard/components/recent-activity-feed.tsx apps/frontend/src/features/dashboard/components/recent-activity-feed.spec.tsx
git commit -m "feat: RecentActivityFeed component"
```

---

### Task 8: Assemble `DashboardPage`

**Files:**
- Modify: `apps/frontend/src/features/dashboard/pages/dashboard-page.tsx`
- Modify: `apps/frontend/src/features/dashboard/index.ts` (barrel — confirm it still just re-exports the page; no change expected but verify)
- Test: `apps/frontend/src/features/dashboard/pages/dashboard-page.spec.tsx`

**Interfaces:**
- Consumes: `useReviewCount` (`@/features/exceptions/api/use-review-count`), `useDashboardSummary` (`@/features/reports/api/use-reports`), `useOrganizationActivity` (Task 5), `PendingReviewBanner` (Task 6), `RecentActivityFeed` (Task 7), `formatVND` (`@/lib/format`), shadcn `Card`/`CardHeader`/`CardTitle`/`CardContent`.
- Produces: `DashboardPage()` — the full assembled page.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/dashboard/pages/dashboard-page.spec.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './dashboard-page';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DashboardPage', () => {
  it('shows KPI cards, the pending-review banner, and top overdue customers once data loads', async () => {
    apiRequest.mockImplementation(({ url }: { url: string }) => {
      if (url === '/api/v1/bank-transactions/pending-review-count') {
        return Promise.resolve({ count: 7 });
      }
      if (url === '/api/v1/reports/dashboard-summary') {
        return Promise.resolve({
          totalOutstanding: 100_000_000,
          totalOverdue: 30_000_000,
          overdueRate: 0.3,
          cashForecast: { forecast7d: 0, forecast14d: 0, forecast30d: 0 },
          topOverdueCustomers: [
            { customerId: 'c1', customerName: 'Công ty A', totalOverdue: 20_000_000 },
          ],
          autoMatchRate: null,
          manualHandlingRate: null,
          reminderEffectiveness: null,
        });
      }
      if (url === '/api/v1/activity') {
        return Promise.resolve({ items: [], total: 0, page: 1, limit: 10 });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('100.000.000 ₫')).toBeTruthy(),
    );
    expect(screen.getByText(/7/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Xử lý ngay/i })).toBeTruthy();
    expect(screen.getByText('Công ty A')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/dashboard/pages/dashboard-page.spec.tsx` (from `apps/frontend`)
Expected: FAIL — the placeholder page has none of this content

- [ ] **Step 3: Write the page**

```typescript
// apps/frontend/src/features/dashboard/pages/dashboard-page.tsx
import { useReviewCount } from '@/features/exceptions/api/use-review-count';
import { useDashboardSummary } from '@/features/reports/api/use-reports';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatVND } from '@/lib/format';
import { useOrganizationActivity } from '../api/use-organization-activity';
import { PendingReviewBanner } from '../components/pending-review-banner';
import { RecentActivityFeed } from '../components/recent-activity-feed';

function formatRate(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const reviewCountQuery = useReviewCount();
  const summaryQuery = useDashboardSummary();
  const activityQuery = useOrganizationActivity();

  const pendingCount = reviewCountQuery.data ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">TỔNG QUAN</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Trang chủ
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Việc cần làm hôm nay.
        </p>
      </div>

      <PendingReviewBanner pendingCount={pendingCount} />

      {summaryQuery.isPending ? (
        <p>Đang tải…</p>
      ) : summaryQuery.isError || !summaryQuery.data ? (
        <p className="text-destructive">Không thể tải dữ liệu tổng quan.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Tổng công nợ còn lại"
              value={formatVND(summaryQuery.data.totalOutstanding)}
            />
            <MetricCard
              label="Công nợ quá hạn"
              value={formatVND(summaryQuery.data.totalOverdue)}
            />
            <MetricCard
              label="Tỷ lệ quá hạn"
              value={formatRate(summaryQuery.data.overdueRate)}
            />
            <MetricCard
              label="Cần đối soát"
              value={String(pendingCount)}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Hoạt động gần đây</CardTitle>
              </CardHeader>
              <CardContent>
                {activityQuery.isPending ? (
                  <p className="text-sm text-muted-foreground">Đang tải…</p>
                ) : activityQuery.isError || !activityQuery.data ? (
                  <p className="text-sm text-destructive">
                    Không thể tải hoạt động.
                  </p>
                ) : (
                  <RecentActivityFeed items={activityQuery.data.items} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Khách hàng quá hạn nhiều nhất</CardTitle>
              </CardHeader>
              <CardContent>
                {summaryQuery.data.topOverdueCustomers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Chưa có khách hàng quá hạn.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {summaryQuery.data.topOverdueCustomers.map((customer) => (
                      <div
                        key={customer.customerId}
                        className="flex items-center justify-between gap-4 text-sm"
                      >
                        <span className="truncate">
                          {customer.customerName}
                        </span>
                        <span className="shrink-0 font-medium tabular-nums">
                          {formatVND(customer.totalOverdue)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/dashboard/pages/dashboard-page.spec.tsx`
Expected: PASS

- [ ] **Step 5: Verify the barrel export still works**

Read `apps/frontend/src/features/dashboard/index.ts` — it should still be exactly:

```typescript
export * from './pages/dashboard-page';
```

No change needed (the export name `DashboardPage` is unchanged). If it somehow differs, fix it to match.

- [ ] **Step 6: Type-check**

Run: `npx tsc -b --noEmit` (from `apps/frontend`)
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/dashboard/pages/dashboard-page.tsx apps/frontend/src/features/dashboard/pages/dashboard-page.spec.tsx
git commit -m "feat: assemble the real dashboard landing page (closes #126)"
```

---

### Task 9: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Backend full unit suite**

Run: `npx jest` (from `apps/backend`)
Expected: PASS, full suite

- [ ] **Step 2: Backend type-check**

Run: `npx tsc --noEmit` (from `apps/backend`)
Expected: PASS

- [ ] **Step 3: Backend e2e (at least the new one + the full suite if Docker/testcontainers is available)**

Run: `npx jest --config ./test/jest-e2e.json --testPathPatterns "organization-activity"` (from `apps/backend`)
Expected: PASS
Then, if time/Docker permits: `npx jest --config ./test/jest-e2e.json` (full e2e suite) — confirm nothing else regressed.

- [ ] **Step 4: Backend arch-check**

Run: `npm run arch-check` (from `apps/backend`)
Expected: PASS

- [ ] **Step 5: Frontend full unit suite**

Run: `npx vitest run` (from `apps/frontend`)
Expected: PASS, full suite

- [ ] **Step 6: Frontend type-check**

Run: `npx tsc -b --noEmit` (from `apps/frontend`)
Expected: PASS

- [ ] **Step 7: Biome, full repo**

Run: `npx biome check --write .` (from repo root)
Expected: clean (only unrelated pre-existing warnings, if any — do not fix files outside this plan's scope)

- [ ] **Step 8: Manual smoke check** (frontend-design's own quality floor: responsive, keyboard focus, reduced motion)

Run: `pnpm dev` (or the frontend's own dev script) and open `/dashboard` in a browser:
- Confirm the banner appears/disappears correctly by checking with a seeded org that has pending review items vs. one that doesn't.
- Resize to mobile width — the KPI grid should collapse to 1-2 columns (already handled by the existing `sm:grid-cols-2 lg:grid-cols-4` classes, matching the Reports page).
- Tab through the page — the `Link`/`Button` in `PendingReviewBanner` must show a visible focus ring (shadcn's `Button`/`Link` styling already provides this; just confirm it isn't accidentally suppressed).

Stop the dev server when done.

## Explicitly Out of Scope

- No new Vietnamese activity-type label map — raw `activityType` strings render as-is, matching `ReceivableTimeline`'s existing precedent (see Global Constraints).
- No pagination UI on the dashboard's recent-activity feed — it always shows the first page (10 items), matching a landing page's "glance" role. The endpoint itself is paginated (Task 1-3) for future reuse, but the dashboard only ever requests page 1.
- No new design tokens, fonts, or color palette — this page inherits the existing app-wide `oklch`-based theme from `src/index.css` exactly.
- No cash-forecast, auto-match-rate, or reminder-effectiveness cards on the dashboard — those stay Reports-page-only; the dashboard's 4 cards are deliberately a curated subset (outstanding, overdue, overdue rate, pending review), not the full 9-card grid.
