# Signup Tax-Code Organization Name Auto-Fill Design

> Spec for GitHub issue [#332](https://github.com/lengocanh2005it/casso-ledger/issues/332), the implementation slice of [#331](https://github.com/lengocanh2005it/casso-ledger/issues/331).

## 1. Goal

During signup, use the existing VietQR tax-code lookup to prefill the organization name after the user enters a valid 10- or 13-digit tax code. The field remains editable, and a value typed by the user is never overwritten. Lookup failures remain non-blocking so the user can enter the name manually.

## 2. Existing context

- `ITaxCodeLookupAdapter.lookup(taxCode)` already exists in `modules/tax-verification/` and returns `TaxCodeLookupResult | null` without throwing for not-found, timeout, network, non-OK, or malformed VietQR responses.
- `VietQrTaxCodeLookupAdapter` already provides a 30-day Redis cache and a five-second external-request timeout.
- `SignupUseCase` already performs the authoritative tax-code lookup and `PENDING_REVIEW`/`taxCodeMatched` decision on submit. This feature does not change that behavior.
- `SignupPage` already validates the same tax-code pattern before submit and currently treats organization name and tax code as independent fields.

## 3. Design direction

### 3.1 Backend boundary

Add a small application use case and presentation endpoint inside `tax-verification`:

```text
GET /api/v1/tax-verification/lookup?taxCode=0101234567
  -> TaxVerificationController
  -> LookupTaxCodeUseCase
  -> ITaxCodeLookupAdapter
```

The controller does not call the external adapter directly. `LookupTaxCodeUseCase.execute(taxCode: string)` delegates to the existing port and returns the existing result or `null`.

The endpoint is public because signup has no identity yet. It reuses `AuthCompositeRateLimitGuard`; with no email in the request body, the existing tracker limits the route by IP. The existing global throttler budget remains five requests per 60 seconds. The limit applies to cache hits as well as external lookups.

### 3.2 HTTP contract

Valid lookup:

```json
{ "name": "Công ty TNHH CASSO" }
```

Not found or adapter failure:

```json
{ "name": null }
```

Both are HTTP 200 responses because a missing lookup result is an expected, non-blocking outcome. A tax code that is not exactly 10 or 13 digits receives the standard `VALIDATION_ERROR` response before the adapter is called. The endpoint is documented with `@ApiTags`, `@ApiOperation`, `@ApiOkResponse`, and `@ApiErrorResponse` for validation and rate-limit errors. Query and response DTOs are classes in `.dto.ts` files so Swagger can describe them.

No tenant context, organization ID, database write, migration, or new error code is needed.

### 3.3 Frontend behavior

`SignupPage` calls the endpoint on blur of the tax-code field, only when the trimmed value matches the existing 10/13-digit pattern. Repeated blur events for the same valid code are deduplicated. There is no debounce, retry, loading indicator, or visible lookup error in this slice.

The page tracks three pieces of prefill state:

- whether the user has edited the organization-name field;
- the exact name currently supplied by auto-fill, if any;
- the active lookup/code identity used to ignore stale responses.

The response may populate the name only when the name field is still empty and the user has never edited it. A lookup-created value does not mark the field as user-edited. Any user change, including typing and then clearing the field, marks it as edited and permanently prevents later auto-fill during that form session.

If the tax code changes while the current name is still the previous auto-filled value, that stale value is cleared. A user-edited name is preserved. A response for an older tax code is ignored when a newer code is current. A null or failed lookup leaves the form usable and unchanged apart from clearing a stale auto-filled value when the tax code changed.

The existing signup submit request, client-side tax-code validation, OTP flow, and error handling remain unchanged.

## 4. Error and security behavior

- Invalid query input is rejected by DTO validation.
- The adapter remains the only component that knows VietQR failure semantics; application and presentation layers do not add a second external-error policy.
- Frontend lookup errors, including rate-limit responses, are swallowed for this optional prefill path and never block signup.
- The endpoint is unauthenticated but rate-limited per IP, matching other pre-auth auth endpoints.
- No organization data is returned beyond the resolved business name, and no organization or user is created by lookup.

## 5. Testing strategy

Backend tests use a mocked `ITaxCodeLookupAdapter` and cover:

- the use case forwarding the tax code and returning a resolved name;
- the use case returning `null` without throwing;
- the controller response shape and public/rate-limit/API-doc metadata;
- invalid query input not reaching the adapter.

Frontend tests mock `apiRequest` and cover:

- a valid blurred tax code prefilling an empty organization-name field;
- a name already typed by the user never being overwritten;
- a user-edited-then-cleared name remaining empty;
- a changed tax code clearing only the previous auto-filled value;
- a stale response not overwriting the current code/name state;
- lookup failure or `{ name: null }` leaving signup usable;
- the existing signup submit payload and tax-code validation remaining intact.

No test calls VietQR over the network. Existing adapter tests continue to own the adapter's cache and external-response behavior.

## 6. Out of scope

- Changing `SignupUseCase` tax-code verification or organization status decisions.
- Changing `matchesTaxCodeName`, `Organization`, or any persisted schema.
- Negative caching, background retries, debounce behavior, or a new throttling abstraction.
- A visible “company found” badge, loading state, or manual refresh button.
- Editing/resubmitting pending or rejected organizations after signup.

## 7. Acceptance mapping

| Issue requirement | Design coverage |
| --- | --- |
| Pre-auth endpoint returns VietQR name | Sections 3.1–3.2 |
| Endpoint is rate-limited per IP | Section 3.1 |
| Lookup starts for a complete valid code | Section 3.3 |
| Existing name is never overwritten | Section 3.3 |
| Name remains editable | Section 3.3 |
| Lookup failure is silent and non-blocking | Sections 3.2–3.4 |
| Existing submit verification is unchanged | Sections 2 and 3.3 |
