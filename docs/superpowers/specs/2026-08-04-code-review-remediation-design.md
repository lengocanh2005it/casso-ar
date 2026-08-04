# Whole-Repo Code Review Remediation Design

**Goal:** Correct all actionable findings from the whole-repository review while preserving the existing Clean Architecture boundaries and limiting scope to the reviewed gaps.

## Scope

- Normalize backend error responses to the repository error envelope.
- Enforce tenant ownership on transactional saves and reject conflicting tenant identifiers.
- Add the missing Invoice domain/infrastructure module required by the domain-core contract.
- Add Organization persistence and tenant-safe database constraints needed by the shared-schema model.
- Add idempotency for POST operations that create resources or mutate money/status.
- Support selecting a valid tenant with `X-Organization-Id`.
- Repair the frontend mobile Sheet and align plan-access vocabulary/gating.
- Add focused unit and integration regression tests.

The open feature plans (#3–#23) remain out of scope; this change supplies only the foundation needed by the reviewed findings.

## Architecture

Backend changes stay in the existing layers: domain types and rules remain framework-free; application ports/use cases own behavior; TypeORM entities/repositories remain in infrastructure; controllers and global exception/validation wiring remain in presentation/common. Tenant context remains the single source of request organization identity, and every money/status write keeps one transaction boundary.

Idempotency is implemented as a small shared infrastructure concern keyed by `(organizationId, endpoint, key)`. The key record and business write are committed in the same transaction; a repeated key returns the stored response metadata instead of executing the write again.

## Data integrity

- `organizationId` is non-null on tenant-owned rows.
- Rollup constraints enforce non-negative values and upper bounds.
- Cross-tenant references are rejected at the application boundary and constrained in the database where both tenant columns are available.
- Existing deliberately deferred architecture is not expanded into unrelated onboarding/billing features.

## Error handling

All HTTP exceptions are mapped to stable `ErrorCode` values and Vietnamese user-facing messages. Validation errors retain field details. Unknown errors map to a generic internal error without leaking implementation details.

## Frontend

The Sheet owns open state and supports trigger/content/close semantics required by the mobile sidebar. Plan access uses `FREE`, `STARTER`, `BUSINESS`, and `ENTERPRISE`; locked navigation is derived from the current plan and remains visible.

## Verification

Each behavior gets a failing regression test first, followed by focused tests, type checks, lint, build, and the full available test suite. Database constraints and transaction/idempotency behavior are verified against Postgres integration tests.
