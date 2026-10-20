# Same-Customer Receivable Combination Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suggest complete exact-sum groups of at least two same-customer receivables for an unallocated transfer, without allocating until the operator confirms through the existing split flow.

**Architecture:** Add a pure bounded subset-sum search and a tenant-scoped read endpoint in `exception-queue`. The endpoint returns all groups only when candidate, work, and result bounds allow a complete search. The Exception Queue dialog displays the groups and can prefill the existing allocation inputs.

**Search bounds:** 100 open receivable candidates, 100,000 candidate examinations, and 20 returned groups. If any bound prevents proving completeness, the result is incomplete with no groups.

**Tech Stack:** NestJS, TypeORM, React, TanStack Query, Jest, Vitest.

## Global Constraints

- Use integer VND amounts only.
- Scope receivable queries to the current `organizationId`.
- Suggestions remain read-only; matching uses the existing transactional allocation use case.
- If a search bound prevents a complete result set, return no suggestions and report the incomplete state.
- Use existing DTO, Swagger, React Query, and split-match patterns; add no dependency.

**Source spec:** GitHub issue #503, approved during the `grill-with-docs` discussion.

---

### Task 1: Bounded exact-sum search

**Files:**
- Create: `apps/backend/src/modules/exception-queue/application/receivable-combination-search.ts`
- Test: `apps/backend/src/modules/exception-queue/application/receivable-combination-search.spec.ts`

- [x] Add focused tests for exact groups, two-or-more members, deterministic ordering, and candidate, work, and result bounds returning no partial groups.
- [x] Run the focused spec and observe the expected failures.
- [x] Implement a deterministic bounded search with explicit candidate, search-work, and result limits.
- [x] Run the focused spec and confirm it passes.

### Task 2: Tenant-scoped query and API

**Files:**
- Modify: `apps/backend/src/modules/receivables/application/receivable-repository.port.ts`
- Modify: `apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.ts`
- Modify: `apps/backend/src/modules/exception-queue/application/unmatched-bank-transactions-query.service.ts`
- Create: `apps/backend/src/modules/exception-queue/application/receivable-combination-suggestions-query.spec.ts`
- Modify: `apps/backend/src/modules/exception-queue/presentation/exception-queue.controller.ts`
- Modify: `apps/backend/src/modules/exception-queue/presentation/dto/exception-queue-response.dto.ts`
- Create: query DTO and focused repository/controller specs as needed.

- [x] Add a bounded, deterministically ordered lookup for one customer's open and partially paid receivables, scoped by the tenant context.
- [x] Test unique customer scope, missing transaction, non-actionable transaction, and exact-group behavior through the query service; test overflow in the search unit.
- [x] Add a documented, permission-protected `GET /bank-transactions/:id/combination-suggestions` endpoint with an optional operator-selected `customerId`.
- [x] Return a clear customer-required, complete, or incomplete state; never return partial suggestions after any bound is exceeded.
- [x] Run focused backend specs and type-check. Domain-check and full verification are in Task 4.

### Task 3: Exception Queue suggestions and operator confirmation

**Files:**
- Modify: `apps/frontend/src/features/exceptions/types.ts`
- Modify: `apps/frontend/src/features/exceptions/api/exceptions-api.ts`
- Modify: `apps/frontend/src/features/exceptions/api/use-exceptions.ts`
- Modify: `apps/frontend/src/features/exceptions/components/split-match-dialog.tsx`
- Modify: `apps/frontend/src/features/exceptions/components/split-match-dialog.spec.tsx`

- [x] Add a query for the unique candidate customer or the customer selected in the dialog.
- [x] Show every complete group with each receivable's full remaining balance; show a distinct incomplete-search message when applicable.
- [x] Selecting a group prefills existing allocation fields only; the operator still confirms with the existing match action.
- [x] Test explicit customer scope for multi-customer candidates, suggestion prefill, and the incomplete-search message.
- [x] Run focused frontend specs and type-check.

### Task 4: Verify, review, and finish

**Files:**
- Modify: `GLOSSARY.md`
- Modify: `docs/wayfinder/feature-map.md`
- Modify: this plan as steps complete.

- [ ] Run the backend integration test (attempted; Testcontainers could not find a Docker runtime).
- [x] Run full `pnpm verify` and `domain-check`.
- [ ] Run Standards and Spec code review against the feature branch diff and address findings.
- [ ] Mark #503 done in the feature map with shipped date and PR reference after the PR exists.
- [ ] Commit the completed implementation on the issue worktree branch.
