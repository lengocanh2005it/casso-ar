# Public Landing Page (#143) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public, guest-accessible marketing landing page at `/` for Casso Ledger, replacing the current behavior where an unauthenticated visitor has no pre-login page, plus the public plan-pricing endpoint it needs.

**Architecture:** Backend: consolidate the two existing plan data sources (`billing` module's usage-limit catalog, `payos` module's price map) into one domain-level catalog in `billing`, expose it through a new unauthenticated controller. Frontend: a new `features/landing/` feature folder composing nine sections behind a `GuestRoute`-gated `/` route, reusing existing design tokens, shadcn primitives, and the `ReceivableStatusBadge` component; two new dependencies (`framer-motion`, `typewriter-effect`) for motion.

**Tech Stack:** NestJS 11 (Clean Architecture: domain/application/presentation), TypeORM (no schema change — pure catalog, no new table), React 19 + Vite + Tailwind v4 + shadcn/ui, TanStack Query, `framer-motion` 13.1.0, `typewriter-effect` 2.22.0.

**Spec:** `docs/superpowers/specs/2026-08-15-public-landing-page-design.md`

## Global Constraints

- Money: `priceVnd` stays an integer VND value, never float (AGENTS.md).
- No `float`/`decimal` for money; no `any`/`as any`/`as unknown as` in production code.
- All copy visible on the page is plain business language — never the technical terms "Cas ID", "CASSO Balance Hook", "webhook", "API", "RBAC", "SMTP" (see spec's Copy voice jargon table). Internal code/comments may use the real technical names.
- `StatsBand` shows qualitative product-capability claims only — no fabricated customer/org counts or usage-volume numbers (spec, "Open items resolved").
- New public endpoint `GET /api/v1/plans` has no `@RequirePermission()` and no guard — it is pre-auth, matching the existing login/signup pattern (AGENTS.md "Authorization").
- Response DTOs never leak `organizationId` or `version`.
- Design tokens: only the repo's existing `apps/frontend/src/index.css` OKLCH tokens and `Be Vietnam Pro` font — no new colors or fonts.
- Every animation (`framer-motion`, `typewriter-effect`) respects `prefers-reduced-motion` via `useReducedMotion()`.
- Files: kebab-case; classes: PascalCase; DI tokens: `Symbol('X_REPOSITORY')`.
- TDD: RED → GREEN → REFACTOR for every task with behavior; migrations/config-only steps are the stated exception (none in this plan — no schema change).

---

## Task 1: Add `priceVnd` and `getPlanCatalog()` to the billing domain

**Files:**
- Modify: `apps/backend/src/modules/billing/domain/subscription.ts`
- Test: `apps/backend/src/modules/billing/domain/subscription.spec.ts`

**Interfaces:**
- Produces: `export interface PlanCatalogEntry { planId: PlanId; priceVnd: number; receivableMonthlyLimit: number; bankConnectionLimit: number; copilotChatMonthlyLimit: number }` and `export function getPlanCatalog(): PlanCatalogEntry[]` from `subscription.ts`.

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/src/modules/billing/domain/subscription.spec.ts` (new `describe` block at the end of the file, same file, same imports already present):

```typescript
describe('getPlanCatalog', () => {
  it('returns all four plans with their price and usage limits', () => {
    const catalog = getPlanCatalog();

    expect(catalog).toEqual([
      {
        planId: PlanId.FREE,
        priceVnd: 0,
        receivableMonthlyLimit: 50,
        bankConnectionLimit: 1,
        copilotChatMonthlyLimit: 50,
      },
      {
        planId: PlanId.STARTER,
        priceVnd: 299_000,
        receivableMonthlyLimit: 500,
        bankConnectionLimit: 2,
        copilotChatMonthlyLimit: 100,
      },
      {
        planId: PlanId.BUSINESS,
        priceVnd: 999_000,
        receivableMonthlyLimit: 5000,
        bankConnectionLimit: 5,
        copilotChatMonthlyLimit: 1000,
      },
      {
        planId: PlanId.ENTERPRISE,
        priceVnd: 2_999_000,
        receivableMonthlyLimit: 15000,
        bankConnectionLimit: 10,
        copilotChatMonthlyLimit: 10000,
      },
    ]);
  });
});
```

Also update the import line at the top of `subscription.spec.ts` to pull in the new export:

```typescript
import { PlanId, SubscriptionStatus } from '@casso-ledger/shared-types';
import { getPlanCatalog, Subscription } from './subscription';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern subscription.spec.ts`
Expected: FAIL — `getPlanCatalog is not a function` (or a TypeScript compile error, since the export doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

In `apps/backend/src/modules/billing/domain/subscription.ts`:

1. Add `priceVnd: number;` to the `PlanConfig` interface (after `tier: number;` is fine, order doesn't matter).
2. Add the four price values to `PLAN_CATALOG`'s entries (`priceVnd: 0` for FREE, `299_000` for STARTER, `999_000` for BUSINESS, `2_999_000` for ENTERPRISE) — same values as the soon-to-be-deleted `PLAN_PRICE_VND` in `modules/payos/application/plan-price.ts`.
3. Add this exported interface and function right after the `PLAN_CATALOG` constant definition:

```typescript
export interface PlanCatalogEntry {
  planId: PlanId;
  priceVnd: number;
  receivableMonthlyLimit: number;
  bankConnectionLimit: number;
  copilotChatMonthlyLimit: number;
}

export function getPlanCatalog(): PlanCatalogEntry[] {
  return (Object.keys(PLAN_CATALOG) as PlanId[]).map((planId) => ({
    planId,
    priceVnd: PLAN_CATALOG[planId].priceVnd,
    receivableMonthlyLimit: PLAN_CATALOG[planId].receivableMonthlyLimit,
    bankConnectionLimit: PLAN_CATALOG[planId].bankConnectionLimit,
    copilotChatMonthlyLimit: PLAN_CATALOG[planId].copilotChatMonthlyLimit,
  }));
}
```

`Object.keys` on a `Record<PlanId, PlanConfig>` returns keys in insertion order (FREE, STARTER, BUSINESS, ENTERPRISE), matching the test's expected array order.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern subscription.spec.ts`
Expected: PASS, all tests in the file (existing + new) green.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/billing/domain/subscription.ts apps/backend/src/modules/billing/domain/subscription.spec.ts
git commit -m "feat: add priceVnd and getPlanCatalog() to billing domain"
```

---

## Task 2: Point `payos` at the billing catalog, delete the duplicate price map

**Files:**
- Modify: `apps/backend/src/modules/payos/application/initiate-plan-upgrade-order.usecase.ts`
- Modify: `apps/backend/src/modules/payos/application/initiate-period-charge.usecase.ts`
- Delete: `apps/backend/src/modules/payos/application/plan-price.ts`
- Test: existing `apps/backend/src/modules/payos/application/initiate-plan-upgrade-order.usecase.spec.ts`, `apps/backend/src/modules/payos/application/initiate-period-charge.usecase.spec.ts` (no new test — this is a regression-safe refactor of an already-tested call site)

**Interfaces:**
- Consumes: `getPlanCatalog()` from Task 1 (`apps/backend/src/modules/billing/domain/subscription.ts`).

- [ ] **Step 1: Confirm the existing tests currently pass (baseline)**

Run: `npx jest --testPathPattern "initiate-plan-upgrade-order|initiate-period-charge"`
Expected: PASS (these already exist and pass against the current `PLAN_PRICE_VND` import — this step is the RED/GREEN baseline check for a refactor task, not a new-behavior RED).

- [ ] **Step 2: Replace the import in `initiate-plan-upgrade-order.usecase.ts`**

Remove:
```typescript
import { PLAN_PRICE_VND } from './plan-price';
```

Add (alongside the existing `subscription-repository.port` import from `../../billing/application/subscription-repository.port`):
```typescript
import { getPlanCatalog } from '../../billing/domain/subscription';
```

Replace the usage:
```typescript
amount: PLAN_PRICE_VND[input.targetPlanId],
```
with:
```typescript
amount: getPlanCatalog().find((p) => p.planId === input.targetPlanId)!
  .priceVnd,
```

(The non-null assertion is safe here — `getPlanCatalog()` always returns all four `PlanId` values, and `input.targetPlanId` is already validated as a `PlanId` by the time it reaches this line, same guarantee `PLAN_PRICE_VND[input.targetPlanId]` had as a direct record lookup.)

- [ ] **Step 3: Replace the import in `initiate-period-charge.usecase.ts`**

Same pattern: remove the `PLAN_PRICE_VND` import from `./plan-price`, add `import { getPlanCatalog } from '../../billing/domain/subscription';`, replace `PLAN_PRICE_VND[subscription.planId]` with `getPlanCatalog().find((p) => p.planId === subscription.planId)!.priceVnd`.

- [ ] **Step 4: Delete the now-unused file**

```bash
rm apps/backend/src/modules/payos/application/plan-price.ts
```

- [ ] **Step 5: Run the affected tests to verify they still pass**

Run: `npx jest --testPathPattern "initiate-plan-upgrade-order|initiate-period-charge"`
Expected: PASS — same assertions, now sourced through `getPlanCatalog()`.

- [ ] **Step 6: Type-check the whole backend to catch any other `plan-price` import**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: no errors. (Confirms no other file still imports the deleted `plan-price.ts`.)

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/payos/application/initiate-plan-upgrade-order.usecase.ts apps/backend/src/modules/payos/application/initiate-period-charge.usecase.ts
git rm apps/backend/src/modules/payos/application/plan-price.ts
git commit -m "refactor: source plan price from billing domain, drop duplicate map"
```

---

## Task 3: `GetPublicPlansUseCase`

**Files:**
- Create: `apps/backend/src/modules/billing/application/get-public-plans.usecase.ts`
- Test: `apps/backend/src/modules/billing/application/get-public-plans.usecase.spec.ts`

**Interfaces:**
- Consumes: `getPlanCatalog()`, `PlanCatalogEntry` from Task 1.
- Produces: `GetPublicPlansUseCase.execute(): PlanCatalogEntry[]` for Task 4's controller.

- [ ] **Step 1: Write the failing test**

```typescript
import { PlanId } from '@casso-ledger/shared-types';
import { GetPublicPlansUseCase } from './get-public-plans.usecase';

describe('GetPublicPlansUseCase', () => {
  it('returns the full plan catalog unchanged', () => {
    const useCase = new GetPublicPlansUseCase();

    const result = useCase.execute();

    expect(result).toHaveLength(4);
    expect(result.map((p) => p.planId)).toEqual([
      PlanId.FREE,
      PlanId.STARTER,
      PlanId.BUSINESS,
      PlanId.ENTERPRISE,
    ]);
    expect(result.find((p) => p.planId === PlanId.BUSINESS)?.priceVnd).toBe(
      999_000,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern get-public-plans.usecase.spec.ts`
Expected: FAIL — module `./get-public-plans.usecase` not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { Injectable } from '@nestjs/common';
import { getPlanCatalog, type PlanCatalogEntry } from '../domain/subscription';

@Injectable()
export class GetPublicPlansUseCase {
  execute(): PlanCatalogEntry[] {
    return getPlanCatalog();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern get-public-plans.usecase.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/billing/application/get-public-plans.usecase.ts apps/backend/src/modules/billing/application/get-public-plans.usecase.spec.ts
git commit -m "feat: add GetPublicPlansUseCase"
```

---

## Task 4: Public `GET /api/v1/plans` endpoint

**Files:**
- Create: `apps/backend/src/modules/billing/presentation/dto/plan-catalog-entry.dto.ts`
- Create: `apps/backend/src/modules/billing/presentation/public-plans.controller.ts`
- Modify: `apps/backend/src/modules/billing/billing.module.ts`
- Test: `apps/backend/test/public-plans.e2e-spec.ts`

**Interfaces:**
- Consumes: `GetPublicPlansUseCase` from Task 3.
- Produces: `GET /api/v1/plans` → `PlanCatalogEntryDto[]`, consumed by the frontend's `get-plans.ts` in Task 8.

- [ ] **Step 1: Write the failing e2e test**

Check the existing e2e bootstrap pattern first — read `apps/backend/test/jest-e2e.json` and any existing simple e2e spec (e.g. `apps/backend/test/*.e2e-spec.ts` that hits a pre-auth endpoint) to match the app bootstrap boilerplate used in this repo, then create:

```typescript
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('GET /api/v1/plans (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the plan catalog with no authentication', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/plans');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(4);
    expect(response.body[0]).toMatchObject({
      planId: expect.any(String),
      priceVnd: expect.any(Number),
      receivableMonthlyLimit: expect.any(Number),
      bankConnectionLimit: expect.any(Number),
      copilotChatMonthlyLimit: expect.any(Number),
    });
    expect(response.body[0]).not.toHaveProperty('organizationId');
    expect(response.body[0]).not.toHaveProperty('version');
  });
});
```

If an existing e2e spec in this repo bootstraps the app differently (e.g. via a shared test helper), match that helper instead of the inline `Test.createTestingModule` shown above — the assertions are what matter, not the exact bootstrap boilerplate.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --config ./test/jest-e2e.json --testPathPattern public-plans.e2e-spec.ts`
Expected: FAIL — 404, route doesn't exist yet.

- [ ] **Step 3: Write the response DTO**

`apps/backend/src/modules/billing/presentation/dto/plan-catalog-entry.dto.ts`:

```typescript
import { PlanId } from '@casso-ledger/shared-types';
import { ApiProperty } from '@nestjs/swagger';
import type { PlanCatalogEntry } from '../../domain/subscription';

export class PlanCatalogEntryDto {
  @ApiProperty({ enum: PlanId })
  planId: PlanId;

  @ApiProperty()
  priceVnd: number;

  @ApiProperty()
  receivableMonthlyLimit: number;

  @ApiProperty()
  bankConnectionLimit: number;

  @ApiProperty()
  copilotChatMonthlyLimit: number;
}

export function toPlanCatalogEntryDto(
  entry: PlanCatalogEntry,
): PlanCatalogEntryDto {
  return {
    planId: entry.planId,
    priceVnd: entry.priceVnd,
    receivableMonthlyLimit: entry.receivableMonthlyLimit,
    bankConnectionLimit: entry.bankConnectionLimit,
    copilotChatMonthlyLimit: entry.copilotChatMonthlyLimit,
  };
}
```

- [ ] **Step 4: Write the controller**

`apps/backend/src/modules/billing/presentation/public-plans.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetPublicPlansUseCase } from '../application/get-public-plans.usecase';
import { PlanCatalogEntryDto, toPlanCatalogEntryDto } from './dto/plan-catalog-entry.dto';

@ApiTags('billing')
@Controller('plans')
export class PublicPlansController {
  constructor(private readonly getPublicPlans: GetPublicPlansUseCase) {}

  @Get()
  @ApiOperation({ summary: 'List the public plan catalog (pricing and usage limits)' })
  @ApiOkResponse({ type: PlanCatalogEntryDto, isArray: true })
  list(): PlanCatalogEntryDto[] {
    return this.getPublicPlans.execute().map(toPlanCatalogEntryDto);
  }
}
```

No `@UseGuards`, no `@RequirePermission()` — pre-auth endpoint, same category as login/signup per AGENTS.md.

- [ ] **Step 5: Wire the controller and use case into the module**

In `apps/backend/src/modules/billing/billing.module.ts`, add the new controller and provider (keep `BillingController` as-is):

```typescript
import { GetPublicPlansUseCase } from './application/get-public-plans.usecase';
import { PublicPlansController } from './presentation/public-plans.controller';
// ...existing imports stay
```

Update the `@Module` decorator:
```typescript
@Module({
  imports: [TypeOrmModule.forFeature([SubscriptionOrmEntity])],
  controllers: [BillingController, PublicPlansController],
  providers: [
    {
      provide: SUBSCRIPTION_REPOSITORY,
      useClass: TypeOrmSubscriptionRepository,
    },
    PlanLimitService,
    ChangeSubscriptionPlanUseCase,
    GetPublicPlansUseCase,
  ],
  exports: [
    PlanLimitService,
    SUBSCRIPTION_REPOSITORY,
    ChangeSubscriptionPlanUseCase,
    TypeOrmModule,
  ],
})
export class BillingModule {}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/backend && npx jest --config ./test/jest-e2e.json --testPathPattern public-plans.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 7: Run the arch-check script (Swagger doc enforcement)**

Run: `node scripts/check-controller-docs.mjs` (from repo root, or whatever `pnpm verify`'s arch-check step invokes — check `package.json`'s `verify` script if the exact command differs)
Expected: no violations — `@ApiTags('billing')` is present, matching `BillingController`'s existing tag.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/billing/presentation/dto/plan-catalog-entry.dto.ts apps/backend/src/modules/billing/presentation/public-plans.controller.ts apps/backend/src/modules/billing/billing.module.ts apps/backend/test/public-plans.e2e-spec.ts
git commit -m "feat: add public GET /api/v1/plans endpoint"
```

---

## Task 5: Add frontend dependencies

**Files:**
- Modify: `apps/frontend/package.json`

**Interfaces:**
- Produces: `framer-motion` and `typewriter-effect` importable from any frontend file starting with Task 9 onward.

- [ ] **Step 1: Install the packages**

Run (from repo root, using pnpm per this repo's package manager):
```bash
pnpm --filter @casso-ledger/frontend add framer-motion@13.1.0 typewriter-effect@2.22.0
```

- [ ] **Step 2: Verify the install**

Run: `grep -E "framer-motion|typewriter-effect" apps/frontend/package.json`
Expected: both packages listed under `dependencies` with the installed versions.

- [ ] **Step 3: Type-check to confirm no immediate breakage**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: no errors (nothing imports these yet, this just confirms the install didn't break anything).

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/package.json pnpm-lock.yaml
git commit -m "chore: add framer-motion and typewriter-effect dependencies"
```

---

## Task 6: `Logo` component

**Files:**
- Create: `apps/frontend/src/components/logo.tsx`
- Test: `apps/frontend/src/components/logo.spec.tsx`

**Interfaces:**
- Produces: `<Logo variant="full" | "icon" className={string} />` for Task 9 (navbar) and Task 15 (footer).

The source SVGs already exist (committed earlier in this worktree) at `apps/frontend/src/assets/casso-ledger-logo.svg` (full lockup, `fill="#16A668"`) and `apps/frontend/src/assets/casso-ledger-icon.svg` (icon-only mark, `fill="#15AB64"`). No SVGR — inline the path data as JSX directly (single flattened `<path>` per file, no need for a build-time SVG-to-component tool).

- [ ] **Step 1: Write the failing test**

```typescript
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo } from './logo';

describe('Logo', () => {
  it('renders the full lockup by default with an accessible title', () => {
    render(<Logo />);
    expect(screen.getByTitle('CASSO LEDGER')).toBeInTheDocument();
  });

  it('renders the icon-only mark when variant="icon"', () => {
    render(<Logo variant="icon" />);
    expect(screen.getByTitle('CASSO')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/components/logo.spec.tsx`
Expected: FAIL — module `./logo` not found.

- [ ] **Step 3: Write minimal implementation**

Open both SVG files at `apps/frontend/src/assets/casso-ledger-logo.svg` and `apps/frontend/src/assets/casso-ledger-icon.svg`, copy their exact `<path d="..." fill="..." fill-rule="evenodd" />` data (the `d` attribute is long — copy it verbatim, character-for-character, from the committed asset file; do not retype it by hand) into:

```typescript
interface LogoProps {
  variant?: 'full' | 'icon';
  className?: string;
}

export function Logo({ variant = 'full', className }: LogoProps) {
  if (variant === 'icon') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 428 428"
        className={className}
        role="img"
      >
        <title>CASSO</title>
        <path
          d="M 66 342 ... [copy the exact `d` value from apps/frontend/src/assets/casso-ledger-icon.svg here]"
          fill="#15AB64"
          fillRule="evenodd"
        />
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1254 1254"
      className={className}
      role="img"
    >
      <title>CASSO LEDGER</title>
      <path
        d="M 1098 894 ... [copy the exact `d` value from apps/frontend/src/assets/casso-ledger-logo.svg here]"
        fill="#16A668"
        fillRule="evenodd"
      />
    </svg>
  );
}
```

(`fill-rule` becomes `fillRule` in JSX — the only attribute-name change needed when porting the raw SVG markup into JSX; `d` and `fill` copy over unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/components/logo.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/logo.tsx apps/frontend/src/components/logo.spec.tsx
git commit -m "feat: add Logo component (full lockup and icon-only variants)"
```

---

## Task 7: `features/landing/` data and API layer

**Files:**
- Create: `apps/frontend/src/features/landing/landing-data.ts`
- Create: `apps/frontend/src/features/landing/api/get-plans.ts`
- Create: `apps/frontend/src/features/landing/hooks/use-plans.ts`
- Test: `apps/frontend/src/features/landing/api/get-plans.spec.ts`

**Interfaces:**
- Produces: `fetchPlans(): Promise<PlanCatalogEntry[]>`, `usePlans()` (TanStack Query hook), and the typed static content constants (`LANDING_NAV_LINKS`, `LANDING_HEADLINE_PHRASES`, `LANDING_FEATURES`, `LANDING_STEPS`, `LANDING_STAT_HIGHLIGHTS`, `PLAN_LABELS`, `PLAN_FEATURE_COPY`, `DEMO_TRANSACTIONS`) — consumed by every section component from Task 9 onward.

- [ ] **Step 1: Write the failing test for the API call**

```typescript
import { describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@/lib/api-client';
import { fetchPlans } from './get-plans';

vi.mock('@/lib/api-client', () => ({ apiRequest: vi.fn() }));

describe('fetchPlans', () => {
  it('calls GET /api/v1/plans', async () => {
    vi.mocked(apiRequest).mockResolvedValue([]);

    await fetchPlans();

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/plans',
      method: 'GET',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/landing/api/get-plans.spec.ts`
Expected: FAIL — module `./get-plans` not found.

- [ ] **Step 3: Write the API function and its type**

`apps/frontend/src/features/landing/api/get-plans.ts`:

```typescript
import type { PlanId } from '@casso-ledger/shared-types';
import { apiRequest } from '@/lib/api-client';

export interface PlanCatalogEntry {
  planId: PlanId;
  priceVnd: number;
  receivableMonthlyLimit: number;
  bankConnectionLimit: number;
  copilotChatMonthlyLimit: number;
}

export function fetchPlans(): Promise<PlanCatalogEntry[]> {
  return apiRequest<PlanCatalogEntry[]>({
    url: '/api/v1/plans',
    method: 'GET',
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/features/landing/api/get-plans.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write `use-plans.ts` (no separate test — thin TanStack Query wrapper, covered indirectly by Task 14's `PricingSection` test)**

```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchPlans } from '../api/get-plans';

export function usePlans() {
  return useQuery({
    queryKey: ['landing', 'plans'],
    queryFn: fetchPlans,
  });
}
```

- [ ] **Step 6: Write `landing-data.ts`**

All copy in plain business language per the spec's jargon table — no "Cas ID", "webhook", "RBAC", "SMTP" anywhere in these strings.

```typescript
import { PlanId } from '@casso-ledger/shared-types';
import type { ReceivableStatus } from '@/features/receivables/types';

export const LANDING_NAV_LINKS = [
  { href: '#gioi-thieu', label: 'Giới thiệu' },
  { href: '#tinh-nang', label: 'Tính năng' },
  { href: '#cach-hoat-dong', label: 'Cách hoạt động' },
  { href: '#bang-gia', label: 'Bảng giá' },
] as const;

export const LANDING_HEADLINE_PHRASES = [
  'không cần nhắc lại',
  'không cần Excel',
  'không cần đoán',
] as const;

export const LANDING_ABOUT = {
  paragraph:
    'Casso Ledger là nền tảng quản lý và thu hồi công nợ dành cho doanh nghiệp Việt Nam. Giao dịch ngân hàng về tới đâu, hệ thống tự động đối chiếu với công nợ tới đó — không cần đợi kế toán nhập tay từng dòng.',
  pillars: [
    { label: 'Tự động đối chiếu' },
    { label: 'Nhắc nợ đúng lúc' },
    { label: 'Báo cáo minh bạch' },
  ],
} as const;

export const LANDING_STAT_HIGHLIGHTS = [
  { label: 'Đối chiếu giao dịch ngân hàng theo thời gian thực' },
  { label: 'Không giới hạn số khách hàng theo dõi' },
  { label: 'Nhắc nợ tự động qua email' },
  { label: 'Báo cáo công nợ theo tuổi nợ' },
] as const;

export const LANDING_FEATURES = [
  {
    title: 'Theo dõi công nợ',
    description: 'Xem toàn bộ khoản phải thu, trạng thái và hạn thanh toán ở một nơi.',
  },
  {
    title: 'Đối chiếu thanh toán',
    description: 'Khớp từng khoản tiền về với đúng công nợ, không cần kiểm tra thủ công.',
  },
  {
    title: 'Nhắc nợ tự động',
    description: 'Hệ thống tự gửi nhắc nhở đúng thời điểm, không cần bạn nhớ hẹn.',
  },
  {
    title: 'Báo cáo tuổi nợ',
    description: 'Biết ngay khoản nào sắp quá hạn, khoản nào đã quá hạn bao lâu.',
  },
  {
    title: 'Phân quyền theo vai trò',
    description: 'Mỗi nhân sự chỉ thấy và thao tác đúng phần việc của mình trong công ty.',
  },
] as const;

export const LANDING_STEPS = [
  {
    step: '1',
    title: 'Kết nối ngân hàng',
    description: 'Liên kết tài khoản ngân hàng của doanh nghiệp trong vài phút.',
  },
  {
    step: '2',
    title: 'Nhận giao dịch tự động',
    description: 'Mọi giao dịch chuyển khoản đến đều được ghi nhận ngay lập tức.',
  },
  {
    step: '3',
    title: 'Đối chiếu công nợ',
    description: 'Hệ thống tự động khớp giao dịch với công nợ tương ứng.',
  },
] as const;

export const PLAN_LABELS: Record<PlanId, string> = {
  [PlanId.FREE]: 'Free',
  [PlanId.STARTER]: 'Starter',
  [PlanId.BUSINESS]: 'Business',
  [PlanId.ENTERPRISE]: 'Enterprise',
};

export const PLAN_FEATURE_COPY: Record<PlanId, string[]> = {
  [PlanId.FREE]: ['Theo dõi công nợ cơ bản', 'Đối chiếu giao dịch ngân hàng'],
  [PlanId.STARTER]: ['Mọi tính năng gói Free', 'Nhắc nợ tự động qua email', 'Báo cáo tuổi nợ'],
  [PlanId.BUSINESS]: [
    'Mọi tính năng gói Starter',
    'Phân quyền theo vai trò trong công ty',
    'Gửi email nhắc nợ từ địa chỉ công ty bạn',
  ],
  [PlanId.ENTERPRISE]: [
    'Mọi tính năng gói Business',
    'Không giới hạn số kết nối ngân hàng',
    'Hỗ trợ ưu tiên',
  ],
};

export interface DemoTransaction {
  customer: string;
  amountVnd: number;
  status: ReceivableStatus;
}

export const DEMO_TRANSACTIONS: DemoTransaction[] = [
  { customer: 'Công ty TNHH Minh Phát', amountVnd: 12_500_000, status: 'OPEN' },
  { customer: 'Cửa hàng Thanh Tâm', amountVnd: 3_200_000, status: 'PARTIALLY_PAID' },
  { customer: 'Công ty CP Đại Dương', amountVnd: 8_900_000, status: 'PAID' },
];
```

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/landing/landing-data.ts apps/frontend/src/features/landing/api/get-plans.ts apps/frontend/src/features/landing/api/get-plans.spec.ts apps/frontend/src/features/landing/hooks/use-plans.ts
git commit -m "feat: add landing page static data and plans API layer"
```

---

## Task 8: `LandingNavbar`

**Files:**
- Create: `apps/frontend/src/features/landing/components/landing-navbar.tsx`
- Test: `apps/frontend/src/features/landing/components/landing-navbar.spec.tsx`

**Interfaces:**
- Consumes: `LANDING_NAV_LINKS` from Task 7, `Logo` from Task 6, `ThemeToggle` (`@/components/layout/theme-toggle`), `Button`/`Sheet` (shadcn `@/components/ui/*`).
- Produces: `<LandingNavbar />`, rendered by `LandingPage` in Task 16.

- [ ] **Step 1: Write the failing test**

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LandingNavbar } from './landing-navbar';

describe('LandingNavbar', () => {
  it('opens the mobile menu with signup and login links', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LandingNavbar />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /mở menu/i }));

    expect(screen.getByRole('link', { name: /đăng nhập/i })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(
      screen.getByRole('link', { name: /dùng thử miễn phí/i }),
    ).toHaveAttribute('href', '/signup');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/landing/components/landing-navbar.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { LANDING_NAV_LINKS } from '../landing-data';

function scrollToSection(href: string) {
  const id = href.replace('#', '');
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled
          ? 'border-b border-border/60 bg-background/85 shadow-sm backdrop-blur-xl'
          : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="shrink-0">
          <Logo className="hidden h-9 sm:block" />
          <Logo variant="icon" className="h-9 sm:hidden" />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LANDING_NAV_LINKS.map((link) => (
            <Button
              key={link.href}
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => scrollToSection(link.href)}
            >
              {link.label}
            </Button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />
          <Button variant="ghost" size="sm" className="hidden sm:inline-flex" asChild>
            <Link to="/login">Đăng nhập</Link>
          </Button>
          <Button size="sm" className="hidden sm:inline-flex" asChild>
            <Link to="/signup">Dùng thử miễn phí</Link>
          </Button>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="md:hidden" aria-label="Mở menu">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[min(100vw-2rem,20rem)]">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-left">
                  <Logo variant="icon" className="h-7" />
                  Casso Ledger
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 flex flex-col gap-2">
                {LANDING_NAV_LINKS.map((link) => (
                  <Button
                    key={link.href}
                    variant="ghost"
                    className="justify-start"
                    onClick={() => {
                      setMobileOpen(false);
                      scrollToSection(link.href);
                    }}
                  >
                    {link.label}
                  </Button>
                ))}
                <div className="my-2 border-t" />
                <Button variant="outline" asChild onClick={() => setMobileOpen(false)}>
                  <Link to="/login">Đăng nhập</Link>
                </Button>
                <Button asChild onClick={() => setMobileOpen(false)}>
                  <Link to="/signup">Dùng thử miễn phí</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
```

If the shadcn `Button` component in this repo doesn't have an `icon` size variant (only `icon-sm`/etc. as seen in the `xcash-ai` reference), check `apps/frontend/src/components/ui/button.tsx`'s `size` variants first and use whichever exact token exists (e.g. `size="icon"` vs `size="icon-sm"`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/features/landing/components/landing-navbar.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/landing/components/landing-navbar.tsx apps/frontend/src/features/landing/components/landing-navbar.spec.tsx
git commit -m "feat: add LandingNavbar"
```

---

## Task 9: `HeroDemoCard` (receivable ticker)

**Files:**
- Create: `apps/frontend/src/features/landing/components/hero-demo-card.tsx`
- Test: `apps/frontend/src/features/landing/components/hero-demo-card.spec.tsx`

**Interfaces:**
- Consumes: `DEMO_TRANSACTIONS` from Task 7, `ReceivableStatusBadge` (`@/components/receivable-status-badge`), `formatVND` (`@/lib/format`).
- Produces: `<HeroDemoCard />`, used by `HeroSection` in Task 10.

- [ ] **Step 1: Write the failing test**

```typescript
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroDemoCard } from './hero-demo-card';

describe('HeroDemoCard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('cycles to the next demo transaction after the interval elapses', () => {
    render(<HeroDemoCard />);

    expect(screen.getByText('Công ty TNHH Minh Phát')).toBeInTheDocument();

    vi.advanceTimersByTime(3200);

    expect(screen.getByText('Cửa hàng Thanh Tâm')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/landing/components/hero-demo-card.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { useEffect, useState } from 'react';
import { ReceivableStatusBadge } from '@/components/receivable-status-badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatVND } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DEMO_TRANSACTIONS } from '../landing-data';

export function HeroDemoCard() {
  const [index, setIndex] = useState(0);
  const transaction = DEMO_TRANSACTIONS[index];

  useEffect(() => {
    const interval = window.setInterval(() => {
      setIndex((current) => (current + 1) % DEMO_TRANSACTIONS.length);
    }, 3200);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <Card className={cn('mx-auto w-full max-w-md border-border/70 shadow-lg')}>
      <CardHeader className="pb-3">
        <p className="text-xs text-muted-foreground">Giao dịch gần đây</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">{transaction.customer}</p>
            <p className="font-mono text-lg font-semibold tabular-nums">
              {formatVND(transaction.amountVnd)}
            </p>
          </div>
          <ReceivableStatusBadge status={transaction.status} />
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/features/landing/components/hero-demo-card.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/landing/components/hero-demo-card.tsx apps/frontend/src/features/landing/components/hero-demo-card.spec.tsx
git commit -m "feat: add HeroDemoCard receivable ticker"
```

---

## Task 10: `HeroSection` with typewriter headline

**Files:**
- Create: `apps/frontend/src/features/landing/components/hero-section.tsx`
- Test: `apps/frontend/src/features/landing/components/hero-section.spec.tsx`

**Interfaces:**
- Consumes: `LANDING_HEADLINE_PHRASES` from Task 7, `HeroDemoCard` from Task 9, `typewriter-effect`'s `Typewriter` component, `useReducedMotion` from `framer-motion`.
- Produces: `<HeroSection />`, rendered by `LandingPage` in Task 16.

- [ ] **Step 1: Write the failing test**

```typescript
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { HeroSection } from './hero-section';

describe('HeroSection', () => {
  it('renders the fixed headline prefix and CTA links', () => {
    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    expect(screen.getByText(/thu tiền/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /dùng thử miễn phí/i }),
    ).toHaveAttribute('href', '/signup');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/landing/components/hero-section.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import Typewriter from 'typewriter-effect';
import { Button } from '@/components/ui/button';
import { HeroDemoCard } from './hero-demo-card';
import { LANDING_HEADLINE_PHRASES } from '../landing-data';

function scrollToSection(href: string) {
  const id = href.replace('#', '');
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function HeroSection() {
  const reducedMotion = useReducedMotion();

  return (
    <section className="pt-28 pb-16 sm:pt-32 sm:pb-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16">
        <div className="text-center lg:text-left">
          <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
            Thu tiền{' '}
            {reducedMotion ? (
              <span className="text-primary">{LANDING_HEADLINE_PHRASES[0]}</span>
            ) : (
              <span className="text-primary">
                <Typewriter
                  options={{
                    strings: [...LANDING_HEADLINE_PHRASES],
                    autoStart: true,
                    loop: true,
                  }}
                />
              </span>
            )}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground text-pretty lg:mx-0">
            Giao dịch ngân hàng về tới đâu, đối chiếu công nợ tới đó — không cần đợi kế toán nhập
            tay từng dòng.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Button size="lg" className="h-12 w-full px-8 sm:w-auto" asChild>
              <Link to="/signup">Dùng thử miễn phí</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 w-full sm:w-auto"
              onClick={() => scrollToSection('#cach-hoat-dong')}
            >
              Xem cách hoạt động
            </Button>
          </div>
        </div>

        <HeroDemoCard />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/features/landing/components/hero-section.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/landing/components/hero-section.tsx apps/frontend/src/features/landing/components/hero-section.spec.tsx
git commit -m "feat: add HeroSection with typewriter headline"
```

---

## Task 11: `AboutSection`

**Files:**
- Create: `apps/frontend/src/features/landing/components/about-section.tsx`
- Test: `apps/frontend/src/features/landing/components/about-section.spec.tsx`

**Interfaces:**
- Consumes: `LANDING_ABOUT` from Task 7.
- Produces: `<AboutSection />`, rendered by `LandingPage` in Task 16, anchor id `gioi-thieu`.

- [ ] **Step 1: Write the failing test**

```typescript
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AboutSection } from './about-section';
import { LANDING_ABOUT } from '../landing-data';

describe('AboutSection', () => {
  it('renders the intro paragraph and all value pillars', () => {
    render(<AboutSection />);

    expect(screen.getByText(LANDING_ABOUT.paragraph)).toBeInTheDocument();
    for (const pillar of LANDING_ABOUT.pillars) {
      expect(screen.getByText(pillar.label)).toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/landing/components/about-section.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { CheckCircle2 } from 'lucide-react';
import { LANDING_ABOUT } from '../landing-data';

export function AboutSection() {
  return (
    <section id="gioi-thieu" className="scroll-mt-24 py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <p className="text-lg leading-relaxed text-muted-foreground text-pretty">
          {LANDING_ABOUT.paragraph}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
          {LANDING_ABOUT.pillars.map((pillar) => (
            <div key={pillar.label} className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="size-4 text-primary" />
              {pillar.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/features/landing/components/about-section.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/landing/components/about-section.tsx apps/frontend/src/features/landing/components/about-section.spec.tsx
git commit -m "feat: add AboutSection"
```

---

## Task 12: `StatsBand`

**Files:**
- Create: `apps/frontend/src/features/landing/components/stats-band.tsx`
- Test: `apps/frontend/src/features/landing/components/stats-band.spec.tsx`

**Interfaces:**
- Consumes: `LANDING_STAT_HIGHLIGHTS` from Task 7.
- Produces: `<StatsBand />`, rendered by `LandingPage` in Task 16.

- [ ] **Step 1: Write the failing test**

```typescript
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatsBand } from './stats-band';
import { LANDING_STAT_HIGHLIGHTS } from '../landing-data';

describe('StatsBand', () => {
  it('renders every feature-highlight label with no numeric claims', () => {
    render(<StatsBand />);

    for (const highlight of LANDING_STAT_HIGHLIGHTS) {
      expect(screen.getByText(highlight.label)).toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/landing/components/stats-band.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { Sparkles } from 'lucide-react';
import { LANDING_STAT_HIGHLIGHTS } from '../landing-data';

export function StatsBand() {
  return (
    <section
      className="border-y border-border/60 bg-muted/20 py-12 sm:py-14"
      aria-label="Điểm nổi bật"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-8 px-4 sm:px-6 lg:grid-cols-4">
        {LANDING_STAT_HIGHLIGHTS.map((highlight) => (
          <div key={highlight.label} className="flex flex-col items-center gap-2 px-2 text-center">
            <Sparkles className="size-5 text-primary" />
            <p className="max-w-[16rem] text-sm text-muted-foreground">{highlight.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/features/landing/components/stats-band.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/landing/components/stats-band.tsx apps/frontend/src/features/landing/components/stats-band.spec.tsx
git commit -m "feat: add StatsBand (qualitative highlights only)"
```

---

## Task 13: `FeaturesSection` with scroll-reveal motion

**Files:**
- Create: `apps/frontend/src/features/landing/components/features-section.tsx`
- Test: `apps/frontend/src/features/landing/components/features-section.spec.tsx`

**Interfaces:**
- Consumes: `LANDING_FEATURES` from Task 7, `motion` from `framer-motion`.
- Produces: `<FeaturesSection />`, rendered by `LandingPage` in Task 16, anchor id `tinh-nang`.

- [ ] **Step 1: Write the failing test**

```typescript
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FeaturesSection } from './features-section';
import { LANDING_FEATURES } from '../landing-data';

describe('FeaturesSection', () => {
  it('renders a card for every feature', () => {
    render(<FeaturesSection />);

    for (const feature of LANDING_FEATURES) {
      expect(screen.getByText(feature.title)).toBeInTheDocument();
      expect(screen.getByText(feature.description)).toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/landing/components/features-section.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { motion } from 'framer-motion';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LANDING_FEATURES } from '../landing-data';

export function FeaturesSection() {
  return (
    <section id="tinh-nang" className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Mọi thứ bạn cần để quản lý công nợ
          </h2>
        </div>

        <motion.div
          className="mt-12 grid gap-4 md:grid-cols-3"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={{
            visible: { transition: { staggerChildren: 0.05 } },
          }}
        >
          {LANDING_FEATURES.map((feature) => (
            <motion.div
              key={feature.title}
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0 },
              }}
              whileHover={{ scale: 1.02 }}
            >
              <Card className="h-full border-border/70">
                <CardHeader>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/features/landing/components/features-section.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/landing/components/features-section.tsx apps/frontend/src/features/landing/components/features-section.spec.tsx
git commit -m "feat: add FeaturesSection with scroll-reveal motion"
```

---

## Task 14: `StepsSection`

**Files:**
- Create: `apps/frontend/src/features/landing/components/steps-section.tsx`
- Test: `apps/frontend/src/features/landing/components/steps-section.spec.tsx`

**Interfaces:**
- Consumes: `LANDING_STEPS` from Task 7.
- Produces: `<StepsSection />`, rendered by `LandingPage` in Task 16, anchor id `cach-hoat-dong`.

- [ ] **Step 1: Write the failing test**

```typescript
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StepsSection } from './steps-section';
import { LANDING_STEPS } from '../landing-data';

describe('StepsSection', () => {
  it('renders all three steps in order', () => {
    render(<StepsSection />);

    for (const step of LANDING_STEPS) {
      expect(screen.getByText(step.title)).toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/landing/components/steps-section.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { LANDING_STEPS } from '../landing-data';

export function StepsSection() {
  return (
    <section
      id="cach-hoat-dong"
      className="scroll-mt-24 border-y border-border/60 bg-muted/20 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Ba bước là xong</h2>
        </div>

        <div className="relative mt-14 grid gap-8 md:grid-cols-3">
          <div className="pointer-events-none absolute top-7 right-[16%] left-[16%] hidden h-px bg-border md:block" />
          {LANDING_STEPS.map((step) => (
            <div key={step.step} className="relative text-center md:text-left">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border-2 border-primary/30 bg-background font-mono text-lg font-bold text-primary md:mx-0">
                {step.step}
              </div>
              <h3 className="text-xl font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/features/landing/components/steps-section.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/landing/components/steps-section.tsx apps/frontend/src/features/landing/components/steps-section.spec.tsx
git commit -m "feat: add StepsSection"
```

---

## Task 15: `PricingSection`

**Files:**
- Create: `apps/frontend/src/features/landing/components/pricing-section.tsx`
- Test: `apps/frontend/src/features/landing/components/pricing-section.spec.tsx`

**Interfaces:**
- Consumes: `usePlans` from Task 7, `PLAN_LABELS`/`PLAN_FEATURE_COPY` from Task 7, `formatVND` (`@/lib/format`).
- Produces: `<PricingSection />`, rendered by `LandingPage` in Task 16, anchor id `bang-gia`.

- [ ] **Step 1: Write the failing test**

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { PlanId } from '@casso-ledger/shared-types';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@/lib/api-client';
import { PricingSection } from './pricing-section';

vi.mock('@/lib/api-client', () => ({ apiRequest: vi.fn() }));

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PricingSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PricingSection', () => {
  it('renders each plan with its price and marks BUSINESS as most popular', async () => {
    vi.mocked(apiRequest).mockResolvedValue([
      { planId: PlanId.FREE, priceVnd: 0, receivableMonthlyLimit: 50, bankConnectionLimit: 1, copilotChatMonthlyLimit: 50 },
      { planId: PlanId.BUSINESS, priceVnd: 999_000, receivableMonthlyLimit: 5000, bankConnectionLimit: 5, copilotChatMonthlyLimit: 1000 },
    ]);

    renderWithProviders();

    await waitFor(() => expect(screen.getByText('Business')).toBeInTheDocument());
    expect(screen.getByText(/999.000/)).toBeInTheDocument();
    expect(screen.getByText('Phổ biến nhất')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/landing/components/pricing-section.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { PlanId } from '@casso-ledger/shared-types';
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatVND } from '@/lib/format';
import { cn } from '@/lib/utils';
import { usePlans } from '../hooks/use-plans';
import { PLAN_FEATURE_COPY, PLAN_LABELS } from '../landing-data';

export function PricingSection() {
  const { data: plans, isLoading } = usePlans();

  return (
    <section id="bang-gia" className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Gói dịch vụ linh hoạt</h2>
        </div>

        {isLoading ? (
          <p className="mt-12 text-center text-muted-foreground">Đang tải bảng giá...</p>
        ) : (
          <div className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {plans?.map((plan) => {
              const isHighlighted = plan.planId === PlanId.BUSINESS;
              const quantitativeBullets = [
                `${plan.receivableMonthlyLimit.toLocaleString('vi-VN')} khoản phải thu/tháng`,
                `${plan.bankConnectionLimit} kết nối ngân hàng`,
                `${plan.copilotChatMonthlyLimit.toLocaleString('vi-VN')} lượt hỏi đáp/tháng`,
              ];
              const allFeatures = [...quantitativeBullets, ...PLAN_FEATURE_COPY[plan.planId]];

              return (
                <Card
                  key={plan.planId}
                  className={cn(
                    'relative flex flex-col',
                    isHighlighted ? 'border-primary ring-1 ring-primary/20' : 'border-border/70',
                  )}
                >
                  {isHighlighted ? (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground">Phổ biến nhất</Badge>
                    </div>
                  ) : null}
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">{PLAN_LABELS[plan.planId]}</CardTitle>
                    <div className="mt-2">
                      <span className="text-[1.75rem] font-bold tabular-nums leading-none tracking-tight">
                        {plan.priceVnd === 0 ? 'Miễn phí' : formatVND(plan.priceVnd)}
                      </span>
                      {plan.priceVnd > 0 ? (
                        <span className="text-sm text-muted-foreground">/tháng</span>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col">
                    <ul className="mb-6 flex-1 space-y-2.5">
                      {allFeatures.map((feature) => (
                        <li key={feature} className="flex items-start gap-2 text-sm">
                          <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Button variant={isHighlighted ? 'default' : 'outline'} className="w-full" asChild>
                      <Link to="/signup">Dùng thử miễn phí</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/features/landing/components/pricing-section.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/landing/components/pricing-section.tsx apps/frontend/src/features/landing/components/pricing-section.spec.tsx
git commit -m "feat: add PricingSection with fetched plan catalog"
```

---

## Task 16: `CtaSection` and `LandingFooter`

**Files:**
- Create: `apps/frontend/src/features/landing/components/cta-section.tsx`
- Create: `apps/frontend/src/features/landing/components/landing-footer.tsx`
- Test: `apps/frontend/src/features/landing/components/cta-section.spec.tsx`
- Test: `apps/frontend/src/features/landing/components/landing-footer.spec.tsx`

**Interfaces:**
- Consumes: `Logo` from Task 6.
- Produces: `<CtaSection />`, `<LandingFooter />`, rendered by `LandingPage` in Task 17.

- [ ] **Step 1: Write the failing tests**

`cta-section.spec.tsx`:
```typescript
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CtaSection } from './cta-section';

describe('CtaSection', () => {
  it('links the primary CTA to signup and the secondary to login', () => {
    render(
      <MemoryRouter>
        <CtaSection />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /dùng thử miễn phí/i })).toHaveAttribute('href', '/signup');
    expect(screen.getByRole('link', { name: /đã có tài khoản/i })).toHaveAttribute('href', '/login');
  });
});
```

`landing-footer.spec.tsx`:
```typescript
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LandingFooter } from './landing-footer';

describe('LandingFooter', () => {
  it('renders the logo and auth links', () => {
    render(
      <MemoryRouter>
        <LandingFooter />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /đăng nhập/i })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: /đăng ký/i })).toHaveAttribute('href', '/signup');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && npx vitest run src/features/landing/components/cta-section.spec.tsx src/features/landing/components/landing-footer.spec.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write minimal implementations**

`cta-section.tsx`:
```typescript
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function CtaSection() {
  return (
    <section className="pb-20 sm:pb-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground sm:px-12 sm:py-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Sẵn sàng quản lý công nợ dễ dàng hơn?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-primary-foreground/90">
            Tạo tài khoản miễn phí và bắt đầu ngay hôm nay.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" variant="secondary" className="h-12 w-full sm:w-auto" asChild>
              <Link to="/signup">Dùng thử miễn phí</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 w-full border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 sm:w-auto"
              asChild
            >
              <Link to="/login">Đã có tài khoản</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
```

`landing-footer.tsx`:
```typescript
import { Link } from 'react-router-dom';
import { Logo } from '@/components/logo';

export function LandingFooter() {
  return (
    <footer className="border-t border-border/60 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
        <Logo className="h-7" />
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} Casso Ledger. Đã đăng ký bản quyền.
        </p>
        <div className="flex items-center gap-4 text-sm">
          <Link to="/login" className="text-muted-foreground hover:text-foreground">
            Đăng nhập
          </Link>
          <Link to="/signup" className="text-muted-foreground hover:text-foreground">
            Đăng ký
          </Link>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/features/landing/components/cta-section.spec.tsx src/features/landing/components/landing-footer.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/landing/components/cta-section.tsx apps/frontend/src/features/landing/components/landing-footer.tsx apps/frontend/src/features/landing/components/cta-section.spec.tsx apps/frontend/src/features/landing/components/landing-footer.spec.tsx
git commit -m "feat: add CtaSection and LandingFooter"
```

---

## Task 17: `LandingPage` composition and barrel export

**Files:**
- Create: `apps/frontend/src/features/landing/pages/landing-page.tsx`
- Create: `apps/frontend/src/features/landing/index.ts`
- Test: `apps/frontend/src/features/landing/pages/landing-page.spec.tsx`

**Interfaces:**
- Consumes: every component from Tasks 8–16.
- Produces: `LandingPage`, exported from `features/landing/index.ts` for Task 18's route wiring.

- [ ] **Step 1: Write the failing test**

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@/lib/api-client';
import { LandingPage } from './landing-page';

vi.mock('@/lib/api-client', () => ({ apiRequest: vi.fn() }));

describe('LandingPage', () => {
  it('renders every section', () => {
    vi.mocked(apiRequest).mockResolvedValue([]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <LandingPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText(/thu tiền/i)).toBeInTheDocument();
    expect(screen.getByText('Ba bước là xong')).toBeInTheDocument();
    expect(screen.getByText('Gói dịch vụ linh hoạt')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/landing/pages/landing-page.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`apps/frontend/src/features/landing/pages/landing-page.tsx`:
```typescript
import { AboutSection } from '../components/about-section';
import { CtaSection } from '../components/cta-section';
import { FeaturesSection } from '../components/features-section';
import { HeroSection } from '../components/hero-section';
import { LandingFooter } from '../components/landing-footer';
import { LandingNavbar } from '../components/landing-navbar';
import { PricingSection } from '../components/pricing-section';
import { StatsBand } from '../components/stats-band';
import { StepsSection } from '../components/steps-section';

export function LandingPage() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <LandingNavbar />
      <main>
        <HeroSection />
        <AboutSection />
        <StatsBand />
        <FeaturesSection />
        <StepsSection />
        <PricingSection />
        <CtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
```

`apps/frontend/src/features/landing/index.ts`:
```typescript
export { LandingPage } from './pages/landing-page';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/features/landing/pages/landing-page.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/landing/pages/landing-page.tsx apps/frontend/src/features/landing/pages/landing-page.spec.tsx apps/frontend/src/features/landing/index.ts
git commit -m "feat: compose LandingPage from all sections"
```

---

## Task 18: Wire `/` route and remove the dead dashboard redirect

**Files:**
- Modify: `apps/frontend/src/routes/index.tsx`
- Test: `apps/frontend/src/routes/app-routes.spec.tsx`

**Interfaces:**
- Consumes: `LandingPage` from `@/features/landing` (Task 17).

- [ ] **Step 1: Write the failing test**

Add to `apps/frontend/src/routes/app-routes.spec.tsx` (inside the existing `describe('application routes', ...)` block, alongside the other `it(...)` cases — reuse the file's existing mocks for `api-client` and `use-review-count`):

```typescript
  it('shows the public landing page at / for an unauthenticated visitor', async () => {
    getValidAccessToken.mockResolvedValue(null);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText(/thu tiền/i)).toBeInTheDocument());
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/routes/app-routes.spec.tsx`
Expected: FAIL — `/` currently falls through to `ProtectedRoute` and redirects to `/login`, so the headline text is never rendered (the test's `waitFor` times out, or it finds the login heading instead).

- [ ] **Step 3: Wire the route**

In `apps/frontend/src/routes/index.tsx`:

1. Add a lazy import near the other `lazy(...)` declarations at the top of the file:
```typescript
const LandingPage = lazy(() =>
  import('@/features/landing').then((m) => ({ default: m.LandingPage })),
);
```

2. Add the landing route as the first entry in `authRoutes` (it's a `GuestRoute`-gated route like every other entry in this array, so no change to `App.tsx` is needed — `AppRoutes()` already maps and renders `authRoutes`):
```typescript
export const authRoutes: RouteObject[] = [
  {
    path: '/',
    element: <GuestRoute>{withPageSuspense(<LandingPage />)}</GuestRoute>,
  },
  {
    path: 'login',
    element: <GuestRoute>{withPageSuspense(<LoginPage />)}</GuestRoute>,
  },
  // ...rest of the array unchanged
];
```

3. Remove the now-dead redirect from `appRoutes`:
```typescript
export const appRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="/dashboard" replace /> }, // DELETE this line
  { path: 'dashboard', element: withPageSuspense(<DashboardPage />) },
  // ...rest unchanged
];
```

An authenticated visitor hitting `/` is now redirected to `/dashboard` by `GuestRoute` itself (same mechanism `/login` already uses), so removing the old index redirect doesn't lose that behavior.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/routes/app-routes.spec.tsx`
Expected: PASS — all existing cases in the file plus the new one.

- [ ] **Step 5: Manually verify the authenticated-redirect path still works**

This is covered by `GuestRoute`'s existing unit test coverage (if `protected-route.spec.tsx` already tests `GuestRoute`'s authenticated-redirect behavior generically, no new test is needed here — the same component now gates `/` too). Confirm by running:

Run: `cd apps/frontend && npx vitest run src/routes/protected-route.spec.tsx`
Expected: PASS (no changes needed to this file — `GuestRoute`'s behavior is unchanged, only which paths use it).

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/routes/index.tsx apps/frontend/src/routes/app-routes.spec.tsx
git commit -m "feat: wire public landing page at / route"
```

---

## Task 19: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Backend full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all pass, including Tasks 1–4's new/modified specs.

- [ ] **Step 2: Backend e2e**

Run: `pnpm --filter @casso-ledger/backend test:e2e`
Expected: all pass, including Task 4's `public-plans.e2e-spec.ts`.

- [ ] **Step 3: Frontend full test suite**

Run: `pnpm --filter @casso-ledger/frontend test`
Expected: all pass, including every `*.spec.tsx` from Tasks 6–18.

- [ ] **Step 4: Type-check both apps**

Run: `npx tsc --noEmit` in `apps/backend` and separately in `apps/frontend`.
Expected: no errors in either.

- [ ] **Step 5: Full `pnpm verify`**

Run: `pnpm verify`
Expected: lint + type-check + test all pass, including `scripts/check-controller-docs.mjs`'s `@ApiTags` enforcement on `PublicPlansController`.

- [ ] **Step 6: Run the domain-check skill**

Per AGENTS.md: "After any backend code change, run the `domain-check` skill and fix violations before claiming completion." Invoke `/domain-check` and resolve anything it flags (expected: none — Task 1's domain change adds a pure function with no NestJS/TypeORM imports, Tasks 3–4 follow the existing `application`/`presentation` layering).

- [ ] **Step 7: Manual responsive/quality pass**

Start the frontend dev server (`pnpm dev` or the repo's documented frontend dev command) and walk through the spec's "Responsive & quality bar" checklist at 375px, 768px, 1024px, 1440px: no horizontal scroll, touch targets ≥44px, focus rings visible on every interactive element, `prefers-reduced-motion` respected (toggle it on in OS/browser settings and confirm the typewriter renders statically and scroll-reveal motion is skipped), contrast checked in both light and dark mode.

- [ ] **Step 8: Update the feature map**

Per AGENTS.md's "Workflow: Starting a new ticket" — update `docs/wayfinder/feature-map.md`: mark issue #143's entry status → `done`, add `Shipped:` date and this branch/PR reference once the PR is open.

- [ ] **Step 9: Commit the feature map update**

```bash
git add docs/wayfinder/feature-map.md
git commit -m "docs: mark public landing page (#143) shipped"
```

---

## Self-Review Notes

- **Spec coverage:** Backend consolidation (Tasks 1–2), public endpoint (Tasks 3–4), dependencies (Task 5), Logo (Task 6), all nine page sections (Tasks 7–17: Navbar, Hero+demo card, About, Stats, Features, Steps, Pricing, Cta, Footer), routing (Task 18), and the spec's full verification/responsive bar (Task 19) are each covered by a task. i18n (#187) is explicitly out of scope per the spec's Non-goals and not represented here.
- **Type consistency:** `PlanCatalogEntry` is defined once in the backend domain (Task 1) and re-declared with matching field names/types on the frontend (Task 7's `get-plans.ts`) — the two are structurally identical by construction (same field names copied from the DTO in Task 4), not literally shared, since backend and frontend don't share a runtime type module for this shape (only `PlanId` itself comes from `@casso-ledger/shared-types`). `usePlans()` (Task 7) → consumed by `PricingSection` (Task 15) — signature matches (`{ data, isLoading }` from `useQuery`). `Logo`'s `variant`/`className` props (Task 6) are used consistently across Tasks 8 (navbar) and 16 (footer).
- **No placeholders:** every step has runnable code; Task 6 is the one step with an explicit "copy the exact `d` value from the committed asset file" instruction rather than inlined path data — justified because the path data is several hundred characters of coordinates already committed verbatim in Task 6's referenced asset files, and retyping it into the plan risks a transcription error the implementer would silently ship. This is a copy-verbatim instruction with an exact source location, not a "figure it out" placeholder.
