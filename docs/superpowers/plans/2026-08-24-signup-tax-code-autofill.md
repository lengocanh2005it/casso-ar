# Signup Tax-Code Organization Name Auto-Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the existing VietQR tax-code lookup to the public signup form and safely prefill an empty organization-name field without changing signup verification behavior.

**Architecture:** Add a `LookupTaxCodeUseCase` and public `TaxVerificationController` inside the existing `tax-verification` module. The controller validates the query, applies the existing pre-auth rate-limit guard, and delegates to `ITaxCodeLookupAdapter`; it never calls VietQR directly. Extend `SignupPage` with a blur-triggered lookup and explicit user-edited/auto-filled/request-identity state so stale or optional lookup results cannot overwrite user input.

**Tech Stack:** NestJS 11, class-validator/class-transformer, Nest Swagger, `@nestjs/throttler`, TypeORM-backed Nest application test harness, React 19, Vitest, Testing Library, existing Axios `apiRequest` helper, pnpm/Turbo.

## Global Constraints

- Use the existing `ITaxCodeLookupAdapter`; do not add a second VietQR client, cache, retry policy, or dependency.
- Lookup is public and rate-limited by IP at the existing global budget of 5 requests per 60 seconds.
- Return HTTP 200 with `{ name: string | null }` for both a resolved name and an expected null lookup result.
- Reject tax-code query values unless they match `^\d{10}(\d{3})?$`; invalid input uses the existing `VALIDATION_ERROR` envelope.
- Keep `SignupUseCase` tax-code matching, `PENDING_REVIEW`, `taxCodeMatched`, organization persistence, and all migrations unchanged.
- Controllers call application use cases only; external adapters remain behind application ports.
- Response/query DTOs are classes in `.dto.ts` files and controllers include the required Swagger decorators.
- Production code uses strict TypeScript without `any`, unsafe casts, or new packages.
- Follow RED → GREEN → REFACTOR for each behavior and run focused tests before broader verification.
- No test calls VietQR over the network; mock `ITaxCodeLookupAdapter` or frontend `apiRequest`.

---

## File Map

### Backend

- Create: `apps/backend/src/modules/tax-verification/application/lookup-tax-code.usecase.ts` — application boundary that delegates a tax-code lookup to the existing port.
- Test: `apps/backend/src/modules/tax-verification/application/lookup-tax-code.usecase.spec.ts` — resolved and null adapter outcomes.
- Create: `apps/backend/src/modules/tax-verification/presentation/dto/tax-code-lookup-query.dto.ts` — validated query parameter DTO.
- Create: `apps/backend/src/modules/tax-verification/presentation/dto/tax-code-lookup-response.dto.ts` — Swagger-visible `{ name: string | null }` response DTO.
- Create: `apps/backend/src/modules/tax-verification/presentation/tax-verification.controller.ts` — public, rate-limited HTTP endpoint and response mapping.
- Test: `apps/backend/test/auth-flow.e2e-spec.ts` — HTTP contract, validation, unauthenticated access, null result, and rate-limit regression using the existing Postgres app harness.
- Modify: `apps/backend/src/modules/tax-verification/tax-verification.module.ts` — register the use case and controller.

### Frontend

- Modify: `apps/frontend/src/features/auth/pages/signup-page.tsx` — blur lookup, prefill state, stale-response protection, and silent failure handling.
- Modify: `apps/frontend/src/features/auth/pages/signup-page.spec.tsx` — focused behavior tests for prefill, preservation, stale responses, and failure behavior.

No database, shared-types, adapter, signup-use-case, API-client, or package-manifest changes are planned.

## Interfaces

### Backend application use case

```typescript
export class LookupTaxCodeUseCase {
  constructor(
    @Inject(TAX_CODE_LOOKUP_ADAPTER)
    private readonly taxCodeLookup: ITaxCodeLookupAdapter,
  ) {}

  execute(taxCode: string): Promise<TaxCodeLookupResult | null>;
}
```

### HTTP contract

```text
GET /api/v1/tax-verification/lookup?taxCode=0101234567
200 { "name": "Công ty TNHH CASSO" }
200 { "name": null }
400 { statusCode: 400, errorCode: "VALIDATION_ERROR", ... }
429 { statusCode: 429, errorCode: "RATE_LIMIT_EXCEEDED", ... }
```

### Frontend lookup response

```typescript
interface TaxCodeLookupResponse {
  name: string | null;
}
```

The frontend calls `apiRequest<TaxCodeLookupResponse>` directly with the existing API client; no new client abstraction is needed.

## Task 1: Add the application lookup use case

**Files:**
- Create: `apps/backend/src/modules/tax-verification/application/lookup-tax-code.usecase.spec.ts`
- Create: `apps/backend/src/modules/tax-verification/application/lookup-tax-code.usecase.ts`

**Interfaces:**
- Consumes: `TAX_CODE_LOOKUP_ADAPTER` and `ITaxCodeLookupAdapter` from `tax-code-lookup.port.ts`.
- Produces: `LookupTaxCodeUseCase.execute(taxCode: string): Promise<TaxCodeLookupResult | null>` for the controller.

- [ ] **Step 1: Write the failing use-case test for a resolved name.**

Create a mock adapter with `lookup: jest.fn()` and construct the use case directly. Assert that `execute('0101234567')` returns `{ name: 'Công ty TNHH CASSO' }` and forwards the exact tax code to the adapter.

```typescript
it('returns the adapter result for a tax code', async () => {
  const adapter = {
    lookup: jest.fn().mockResolvedValue({ name: 'Công ty TNHH CASSO' }),
  };
  const useCase = new LookupTaxCodeUseCase(adapter);

  await expect(useCase.execute('0101234567')).resolves.toEqual({
    name: 'Công ty TNHH CASSO',
  });
  expect(adapter.lookup).toHaveBeenCalledWith('0101234567');
});
```

- [ ] **Step 2: Add the failing null-result test.**

Assert that an adapter result of `null` resolves to `null` and does not throw. This locks the existing adapter contract at the application boundary.

- [ ] **Step 3: Run the focused test and verify RED.**

Run:

```bash
pnpm --filter @casso-ledger/backend exec jest src/modules/tax-verification/application/lookup-tax-code.usecase.spec.ts --runInBand
```

Expected: FAIL because `lookup-tax-code.usecase.ts` and `LookupTaxCodeUseCase` do not exist yet.

- [ ] **Step 4: Implement the smallest use case.**

Create the `@Injectable()` class, inject `TAX_CODE_LOOKUP_ADAPTER` as a value import for the token and a type import for the interface/result, and return `this.taxCodeLookup.lookup(taxCode)` without trimming, caching, retrying, or catching errors.

- [ ] **Step 5: Run the focused test and verify GREEN.**

Run the same Jest command. Expected: both resolved-name and null-result tests PASS.

- [ ] **Step 6: Refactor only if the test exposes duplication.**

Keep the use case as a one-method application boundary; do not add a service interface or helper with one implementation.

- [ ] **Step 7: Commit the vertical slice.**

```bash
git add apps/backend/src/modules/tax-verification/application/lookup-tax-code.usecase.ts apps/backend/src/modules/tax-verification/application/lookup-tax-code.usecase.spec.ts
git commit -m "feat: add tax-code lookup use case"
```

## Task 2: Add the HTTP contract tests first

**Files:**
- Modify: `apps/backend/test/auth-flow.e2e-spec.ts`

**Interfaces:**
- Consumes: the existing `TAX_CODE_LOOKUP_ADAPTER` override and `configureApp()` global prefix/validation setup.
- Produces: failing HTTP tests for `GET /api/v1/tax-verification/lookup` that the controller must satisfy.

- [ ] **Step 1: Make the e2e adapter mock controllable.**

Replace the inline adapter object in `beforeAll` with a named `taxCodeLookup` mock whose `lookup` function defaults to `{ name: 'Company B' }`. Keep the existing signup flow behavior unchanged.

- [ ] **Step 2: Write the failing success/null/validation tests.**

Add tests that:

```typescript
it('returns the resolved organization name without authentication', async () => {
  taxCodeLookup.lookup.mockResolvedValueOnce({ name: 'Company B' });

  await request(app.getHttpServer())
    .get('/api/v1/tax-verification/lookup')
    .query({ taxCode: '0123456789' })
    .expect(200)
    .expect({ name: 'Company B' });
});

it('returns null when the tax code is not resolved', async () => {
  taxCodeLookup.lookup.mockResolvedValueOnce(null);

  await request(app.getHttpServer())
    .get('/api/v1/tax-verification/lookup')
    .query({ taxCode: '0123456789' })
    .expect(200)
    .expect({ name: null });
});

it('rejects an invalid tax-code query before calling the adapter', async () => {
  taxCodeLookup.lookup.mockClear();

  const response = await request(app.getHttpServer())
    .get('/api/v1/tax-verification/lookup')
    .query({ taxCode: '123' })
    .expect(400);

  expect(response.body).toMatchObject({
    statusCode: 400,
    errorCode: 'VALIDATION_ERROR',
  });
  expect(taxCodeLookup.lookup).not.toHaveBeenCalled();
});
```

Keep the rate-limit test last because the shared app instance retains throttler counters for the route.

- [ ] **Step 3: Add the failing per-IP rate-limit test.**

Send five valid GET requests from the same test client/IP, then assert the sixth returns 429 with `errorCode: 'RATE_LIMIT_EXCEEDED'`. Do not add a new throttler configuration; the test must prove the existing global 5/60s budget is applied to the new route.

- [ ] **Step 4: Run the focused e2e file and verify RED.**

Run with Docker available:

```bash
pnpm --filter @casso-ledger/backend exec jest --config ./test/jest-e2e.json ./test/auth-flow.e2e-spec.ts --runInBand
```

Expected: the new requests fail because the route/controller is not registered yet. Existing auth-flow tests should remain green or fail only at the new route assertions.

## Task 3: Implement the public tax-verification endpoint

**Files:**
- Create: `apps/backend/src/modules/tax-verification/presentation/dto/tax-code-lookup-query.dto.ts`
- Create: `apps/backend/src/modules/tax-verification/presentation/dto/tax-code-lookup-response.dto.ts`
- Create: `apps/backend/src/modules/tax-verification/presentation/tax-verification.controller.ts`
- Modify: `apps/backend/src/modules/tax-verification/tax-verification.module.ts`

**Interfaces:**
- Consumes: `LookupTaxCodeUseCase` from Task 1 and `AuthCompositeRateLimitGuard` from the existing auth pre-auth guard.
- Produces: public `GET /api/v1/tax-verification/lookup` with `{ name: string | null }`.

- [ ] **Step 1: Define the query DTO.**

Create `TaxCodeLookupQueryDto` with `@IsString()` and `@Matches(/^\d{10}(\d{3})?$/, { message: 'Mã số thuế phải gồm 10 hoặc 13 chữ số.' })`. Add `@ApiProperty({ type: String, example: '0101234567' })`; this is a query DTO and must use the `.dto.ts` suffix.

- [ ] **Step 2: Define the response DTO.**

Create `TaxCodeLookupResponseDto` as a class with `name: string | null` and `@ApiProperty({ type: String, nullable: true, example: 'Công ty TNHH CASSO' })`.

- [ ] **Step 3: Add the controller and metadata.**

Implement:

```typescript
@ApiTags('tax-verification')
@Controller('tax-verification')
export class TaxVerificationController {
  constructor(private readonly lookupTaxCode: LookupTaxCodeUseCase) {}

  @Get('lookup')
  @Public()
  @UseGuards(AuthCompositeRateLimitGuard)
  @ApiOperation({ summary: 'Look up an organization name by tax code' })
  @ApiOkResponse({ type: TaxCodeLookupResponseDto })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR, ErrorCode.RATE_LIMIT_EXCEEDED)
  async lookup(
    @Query() query: TaxCodeLookupQueryDto,
  ): Promise<TaxCodeLookupResponseDto> {
    const result = await this.lookupTaxCode.execute(query.taxCode);
    return { name: result?.name ?? null };
  }
}
```

Use value imports for the controller, DTO, guard, decorator, and token classes used at runtime; use `import type` only for erased types. Do not inject `ITaxCodeLookupAdapter` into the controller.

- [ ] **Step 4: Wire the module.**

Add `LookupTaxCodeUseCase` to `providers` and `TaxVerificationController` to `controllers` in `TaxVerificationModule`. Keep `TAX_CODE_LOOKUP_ADAPTER` as the only exported integration token; the controller and use case are module-internal.

- [ ] **Step 5: Run the e2e file and verify GREEN.**

Run the Task 2 command. Expected: resolved name, null result, validation envelope, unauthenticated access, and 429 rate-limit assertions PASS.

- [ ] **Step 6: Run the backend module-focused unit tests.**

```bash
pnpm --filter @casso-ledger/backend exec jest src/modules/tax-verification --runInBand
```

Expected: the new use-case tests and existing VietQR adapter tests PASS.

- [ ] **Step 7: Commit the backend endpoint.**

```bash
git add apps/backend/src/modules/tax-verification apps/backend/test/auth-flow.e2e-spec.ts
git commit -m "feat: expose public tax-code lookup"
```

## Task 4: Add failing frontend prefill tests

**Files:**
- Modify: `apps/frontend/src/features/auth/pages/signup-page.spec.tsx`

**Interfaces:**
- Consumes: the existing `apiRequest` Vitest mock and `SignupPage` form.
- Produces: failing tests for blur-triggered prefill and all user-input/race/error acceptance criteria.

- [ ] **Step 1: Add a reusable render helper without changing production code.**

Extract the repeated `AuthProvider`/`MemoryRouter` render setup into a local `renderSignupPage()` helper only if it reduces duplication for the new tests. Keep the existing tests' assertions and routes unchanged.

- [ ] **Step 2: Write the successful prefill test.**

Mock the first `apiRequest` call to resolve `{ name: 'Công ty TNHH CASSO' }`, enter `0101234567` in the tax-code field, fire `blur`, and assert the organization-name input value becomes `Công ty TNHH CASSO`. Assert the lookup request uses:

```typescript
{
  url: '/api/v1/tax-verification/lookup?taxCode=0101234567',
  method: 'GET',
}
```

- [ ] **Step 3: Write the preservation tests.**

Cover both cases:

1. The user types `Tên tự nhập` before tax-code blur; a resolved lookup must not change it.
2. The user types a name and clears it; a later lookup must leave the field empty.

- [ ] **Step 4: Write the changed-code and stale-response tests.**

Use deferred promises to simulate code A resolving after code B. Assert that the response for A never appears after B is current. Also assert that changing away from a previous auto-filled name clears that auto-filled value, while a manually edited name remains unchanged.

- [ ] **Step 5: Write the silent-failure tests.**

Mock both a rejected lookup request and `{ name: null }`. Assert there is no lookup error message, the organization-name field remains usable, and the signup submit button still works with a manually entered name.

- [ ] **Step 6: Run the focused frontend test and verify RED.**

```bash
pnpm --filter @casso-ledger/frontend exec vitest run src/features/auth/pages/signup-page.spec.tsx
```

Expected: the new prefill tests fail because the page has no blur lookup or prefill state yet; existing signup/OTP tests remain green.

## Task 5: Implement safe signup auto-fill

**Files:**
- Modify: `apps/frontend/src/features/auth/pages/signup-page.tsx`

**Interfaces:**
- Consumes: the backend contract from Task 3 via existing `apiRequest`.
- Produces: blur-triggered prefill that preserves user edits and ignores stale responses.

- [ ] **Step 1: Add the minimum state and current-value refs.**

Import `useRef` and keep the existing `organizationName`/`taxCode` state for rendering. Add refs for values that the async lookup must read after `await`:

```typescript
const organizationNameRef = useRef('');
const taxCodeRef = useRef('');
const organizationNameUserEditedRef = useRef(false);
const autoFilledOrganizationNameRef = useRef<string | null>(null);
const lookupSequence = useRef(0);
const lastLookupTaxCode = useRef<string | null>(null);
```

Keep these refs local to `SignupPage`; do not add a shared hook or API service for one consumer. The refs prevent a request started before a user edit from reading stale React closure values after it resolves.

- [ ] **Step 2: Protect organization-name changes.**

Route the organization-name input through a handler that updates `organizationNameRef`, marks `organizationNameUserEditedRef.current = true`, clears `autoFilledOrganizationNameRef.current`, and updates React state. The auto-fill setter must update both `organizationNameRef.current` and React state without marking the value user-edited.

- [ ] **Step 3: Handle tax-code changes.**

Route the tax-code input through a handler that:

1. compares `organizationNameRef.current` with `autoFilledOrganizationNameRef.current`;
2. clears the name and auto-fill marker only when the name is still the previous auto-filled value and `organizationNameUserEditedRef.current` is false;
3. clears `lastLookupTaxCode` when the code changes so a code changed away and back can be looked up again;
4. updates `taxCodeRef.current` and React state.

Do not clear a user-entered name.

- [ ] **Step 4: Add the blur lookup.**

Implement an `onTaxCodeBlur` handler that trims the code, exits unless it matches `TAX_CODE_PATTERN`, and exits for the same code already looked up. Increment `lookupSequence.current`, set `lastLookupTaxCode.current = code` before the request, store the request code in a local constant, and call:

```typescript
apiRequest<{ name: string | null }>({
  url: `/api/v1/tax-verification/lookup?taxCode=${encodeURIComponent(code)}`,
  method: 'GET',
});
```

When the request resolves, read the refs and apply the name only if all of these remain true:

- its sequence is still current;
- `taxCodeRef.current.trim()` equals the request code;
- `organizationNameUserEditedRef.current` is false;
- `organizationNameRef.current.trim()` is empty.

If the response name is non-null, set both `organizationNameRef.current`/`autoFilledOrganizationNameRef.current` and the rendered `organizationName` state. Catch and ignore lookup errors. Do not add a toast, inline error, retry, debounce, or spinner.

- [ ] **Step 5: Attach the handler without changing submit behavior.**

Add `onBlur={onTaxCodeBlur}` to the existing tax-code input and replace only the two field `onChange` callbacks. Leave `onSubmit`, payload shape, tax-code validation, OTP transition, and existing error rendering unchanged.

- [ ] **Step 6: Run the focused frontend tests and verify GREEN.**

```bash
pnpm --filter @casso-ledger/frontend exec vitest run src/features/auth/pages/signup-page.spec.tsx
```

Expected: all existing and new signup-page tests PASS.

- [ ] **Step 7: Run frontend type-check and lint.**

```bash
pnpm --filter @casso-ledger/frontend type-check
pnpm --filter @casso-ledger/frontend lint
```

Expected: both commands exit 0 with no new diagnostics.

- [ ] **Step 8: Commit the frontend vertical slice.**

```bash
git add apps/frontend/src/features/auth/pages/signup-page.tsx apps/frontend/src/features/auth/pages/signup-page.spec.tsx
git commit -m "feat: auto-fill organization name from tax code"
```

## Task 6: Run full verification and architectural checks

**Files:**
- No additional files; verify the committed backend/frontend changes and the existing design spec.

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: evidence that the feature is complete without domain-layer, API-doc, type, lint, or regression violations.

- [ ] **Step 1: Run the backend focused suite again.**

```bash
pnpm --filter @casso-ledger/backend exec jest src/modules/tax-verification --runInBand
```

- [ ] **Step 2: Run the frontend focused suite again.**

```bash
pnpm --filter @casso-ledger/frontend exec vitest run src/features/auth/pages/signup-page.spec.tsx
```

- [ ] **Step 3: Run the backend domain check.**

Run the repository's `/domain-check` skill after the backend change. Confirm there are no violations for domain imports, unsafe production casts, tenant isolation, money handling, transactions, persisted rollups, or derived fields.

- [ ] **Step 4: Run the repository verification gate.**

```bash
pnpm verify
```

Expected: lint, type-check, tests, dependency-cruiser, application-boundary checks, cross-module checks, and controller-doc checks all pass.

- [ ] **Step 5: Run the e2e regression when Docker is available.**

```bash
pnpm --filter @casso-ledger/backend exec jest --config ./test/jest-e2e.json ./test/auth-flow.e2e-spec.ts --runInBand
```

Expected: the tax-code lookup HTTP tests and existing auth-flow tests pass against real Postgres. If Docker is unavailable, report that exact limitation rather than claiming e2e verification.

- [ ] **Step 6: Inspect the final diff and status.**

```bash
git diff origin/main...HEAD --check
git status --short --branch
```

Confirm only the spec, plan, backend lookup endpoint/tests, and frontend signup behavior/tests are present. Do not include `.env`, generated output, or unrelated worktree changes.

## Completion Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-24-signup-tax-code-autofill.md`.

Execution choices:

1. **Subagent-driven execution (recommended):** dispatch a fresh subagent per task and review after each task using `superpowers:subagent-driven-development`.
2. **Inline execution:** execute the tasks in this session using `superpowers:executing-plans` with checkpoints.
