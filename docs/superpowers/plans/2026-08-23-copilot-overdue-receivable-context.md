# Copilot Overdue Receivable Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow Collection Copilot to discover overdue receivables from a generic reminder request, show at most 20 human-readable candidates, resolve a later customer/invoice selection through a fresh lookup, and create the existing reminder draft only when exactly one candidate remains.

**Architecture:** Add one read-only application-layer tool, `findOverdueReceivables`. It uses the existing tenant context plus customer and invoice repository ports, and a narrow overdue-candidate query method on `IReceivableRepository`. Existing summary, draft, confirmation, send, frontend, and persistence contracts remain unchanged.

**Tech Stack:** NestJS 11, TypeScript strict mode, TypeORM 1.1, PostgreSQL, Jest, testcontainers, existing `TenantContextService`, repository ports, `AppError`, and Copilot's existing OpenAI-compatible tool loop.

## Global Constraints

- Work only in the Orca worktree `C:/Users/PC ASUS/orca/workspaces/casso-ledger/fix-copilot-overdue-context-320` on branch `lengocanh2005it/fix-copilot-overdue-context-320`.
- Follow RED → GREEN → REFACTOR for every new behavior. Each red test must fail for the missing behavior before production code is added.
- Overdue means `OPEN` or `PARTIALLY_PAID`, `dueDate < referenceDate`, and `originalAmount - paidAmount > 0`. Do not add an `OVERDUE` status, entity, table, migration, or persisted selection state.
- Every receivable, customer, and invoice lookup must be organization-scoped. A `SALES_REP` lookup must additionally use `salesRepresentativeId = currentUser.userId`.
- Money remains integer VND. The tool returns `remainingAmount` as the persisted-rollup calculation already exposed by the `Receivable` domain entity.
- The read tool does not require `REMINDER_SEND_MANUAL`; `draftReminderEmail` keeps its existing permission gate and tenant checks.
- Keep `getReceivableSummary`, `ListReceivablesUseCase`, `findOverdueByThreshold`, reminder confirmation, reminder sending, quick suggestions, and public Copilot response DTOs unchanged except for the minimum wiring/prompt changes required by this feature.
- Do not expose `receivableId` in human-facing assistant text or public response DTOs. It may remain in the internal tool result so the model can call `draftReminderEmail`.
- Do not add a dependency. Do not add frontend code, an HTTP endpoint, a database migration, or a general Copilot search abstraction.
- Use explicit repository-to-domain mapping and explicit selected columns in new TypeORM queries. No production `any`, unsafe domain/ORM casts, `console.log`, or cross-layer infrastructure imports.

---

## File Map

Modify:

- `docs/wayfinder/feature-map.md` — mark issue #320 in progress when implementation starts; mark it done only after the PR is merged, with the shipped date and PR reference.
- `apps/backend/src/modules/receivables/application/receivable-repository.port.ts` — add the narrow overdue-candidate filter contract.
- `apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.ts` — implement the tenant-scoped, role-filterable overdue query.
- `apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.spec.ts` — verify query predicates, ordering, limit, selection, and tenant mismatch protection.
- `apps/backend/src/modules/copilot/application/tools/copilot-read-tools.spec.ts` — cover the new read tool beside the existing read-tool tests.
- `apps/backend/src/modules/copilot/application/copilot-tool-registry.ts` — add the new read tool to the hardcoded allowlist.
- `apps/backend/src/modules/copilot/application/copilot-tool-registry.spec.ts` — verify registration and permission visibility.
- `apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts` — inject and dispatch the tool; validate optional arguments; update the authoritative-data prompt.
- `apps/backend/src/modules/copilot/application/copilot-chat.usecase.spec.ts` — update dependency fixtures and cover non-streaming dispatch.
- `apps/backend/src/modules/copilot/application/copilot-chat.usecase.streaming.spec.ts` — update the streaming dependency fixture and read-tool registry.
- `apps/backend/src/modules/copilot/copilot.module.ts` — import `InvoicesModule`, register the provider, and register its schema.
- `apps/backend/test/copilot-chat.integration.spec.ts` — cover generic discovery, fresh selection, no-match behavior, tenant scope, and draft data.

Create:

- `apps/backend/src/modules/copilot/application/tools/find-overdue-receivables.tool.ts` — application-layer tool, input/output types, validation, search resolution, batch enrichment, and role filtering.

Do not modify:

- `apps/frontend/src/features/copilot/components/copilot-welcome-state.tsx` — existing quick suggestions are already generic.
- `apps/backend/src/modules/copilot/presentation/dto/*` — tool calls are already hidden from the public response DTO.
- Database migrations and ORM entities — no schema change is required.

---

### Task 1: Add the narrow overdue-candidate repository query

**Files:**

- Modify: `apps/backend/src/modules/receivables/application/receivable-repository.port.ts`
- Modify: `apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.ts`
- Test: `apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.spec.ts`
- Modify: `docs/wayfinder/feature-map.md` at implementation start

**Interface:**

```typescript
export interface OverdueReceivableFilters {
  organizationId: string;
  referenceDate: Date;
  salesRepresentativeId?: string;
  customerIdIn?: string[];
  invoiceIdIn?: string[];
  limit: number;
}

export interface IReceivableRepository {
  findOverdueCandidates(
    filters: OverdueReceivableFilters,
  ): Promise<Receivable[]>;
}
```

- [ ] **Step 1: Mark issue #320 in progress.** Add the issue to the appropriate current follow-up section of `docs/wayfinder/feature-map.md` with the plan path, status `in-progress`, owner `BE`, and blocker `none`. Do not change the completed Plan #16 status.

- [ ] **Step 2: Write the failing repository test.** Extend `typeorm-receivable.repository.spec.ts` with a query-builder test that calls `findOverdueCandidates` using `org-1`, a fixed reference date, `SALES_REP` user `user-1`, both ID filters, and `limit: 20`. The fake builder must expose `select`, `where`, `andWhere`, `setParameters`, `orderBy`, `addOrderBy`, `take`, and `getMany` so the test can assert the exact query contract.

The assertions must prove that the query includes:

```text
organizationId = org-1
status IN (OPEN, PARTIALLY_PAID)
dueDate < referenceDate
originalAmount > paidAmount
salesRepresentativeId = user-1
(customerId IN (...) OR invoiceId IN (...))
ORDER BY dueDate ASC, id ASC
LIMIT 20
```

It must also assert that the selected columns are only the fields needed by `Receivable` (`id`, `organizationId`, `customerId`, `invoiceId`, `originalAmount`, `paidAmount`, `dueDate`, `status`, `salesRepresentativeId`, `createdAt`, `closedAt`, `version`) and that returned ORM rows are mapped to `Receivable` instances. Add a separate red test for an organization mismatch, matching the existing `findOverdueByThreshold` guard.

- [ ] **Step 3: Run the red test.**

Run:

```bash
pnpm --filter @casso-ledger/backend exec jest src/modules/receivables/infrastructure/typeorm-receivable.repository.spec.ts --runInBand
```

Expected failure: `findOverdueCandidates` is not present in the repository contract/implementation.

- [ ] **Step 4: Add the port contract.** Add `OverdueReceivableFilters` and `findOverdueCandidates` to `receivable-repository.port.ts`. Do not alter the signatures or behavior of `findOverdueByThreshold`, `findPage`, or `count`.

- [ ] **Step 5: Implement the TypeORM query.** In `typeorm-receivable.repository.ts`:

  - Compare the explicit `filters.organizationId` with `TenantContextService.getOrganizationId()` and throw `TENANT_MISMATCH` on mismatch, matching the existing repository behavior.
  - Build a QueryBuilder with the explicit selected columns and the four overdue predicates above.
  - Add the sales-representative predicate only when `salesRepresentativeId` is present.
  - Treat `customerIdIn` and `invoiceIdIn` as OR branches. When both arrays are supplied but empty, force a no-result predicate so a search miss cannot fall through to an unfiltered query.
  - Order by `dueDate ASC`, then `id ASC`, and apply `take(filters.limit)`.
  - Map rows through the existing `toDomain` function.
  - Leave `findOverdueByThreshold` and its callers untouched.

- [ ] **Step 6: Run the repository tests and refactor only if needed.**

Run:

```bash
pnpm --filter @casso-ledger/backend exec jest src/modules/receivables/infrastructure/typeorm-receivable.repository.spec.ts --runInBand
```

Expected result: all tests pass, including the existing threshold, cursor, mapper, and invoice-ID tests.

- [ ] **Step 7: Commit the repository slice.**

```bash
git add docs/wayfinder/feature-map.md apps/backend/src/modules/receivables/application/receivable-repository.port.ts apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.ts apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.spec.ts
git commit -m "feat: query overdue receivable candidates for Copilot"
```

---

### Task 2: Implement `findOverdueReceivables` as an application read tool

**Files:**

- Create: `apps/backend/src/modules/copilot/application/tools/find-overdue-receivables.tool.ts`
- Test: `apps/backend/src/modules/copilot/application/tools/copilot-read-tools.spec.ts`

**Contracts:**

```typescript
export interface FindOverdueReceivablesInput {
  search?: string;
  limit?: number;
}

export interface OverdueReceivableCandidate {
  receivableId: string;
  customerName: string;
  invoiceNumber: string | null;
  remainingAmount: number;
  dueDate: string;
}

export interface FindOverdueReceivablesResult {
  items: OverdueReceivableCandidate[];
}
```

- [ ] **Step 1: Write the first failing unit test.** Add a test with two overdue `Receivable` instances, two customer rows, and one invoice row. Mock `TenantContextService.getCurrentUser()` as a finance manager and assert that the result contains both candidates with the real remaining amounts, ISO due dates, customer names, invoice number, and `null` for the receivable without an invoice.

- [ ] **Step 2: Add the remaining failing tests before implementation.** Cover these behaviors in `copilot-read-tools.spec.ts`:

  - no search defaults to `limit: 20` and asks the repository for both `OPEN`/`PARTIALLY_PAID` overdue candidates through the new filter;
  - customer-name search calls `findIdsBySearch(organizationId, search)` and invoice-number search calls `findIdsByInvoiceNumberSearch(organizationId, search)` in parallel, then passes both ID sets to the receivable repository;
  - a search with no matching customer or invoice returns `{ items: [] }` without querying all receivables;
  - a supplied `limit` above 20, below 1, or non-integer throws `AppError` with `ErrorCode.VALIDATION_ERROR`;
  - `Role.SALES_REP` passes the current user ID as `salesRepresentativeId`, while a finance manager does not add that filter;
  - enrichment uses one batched customer lookup and one batched invoice lookup, rather than a query per candidate;
  - the organization ID passed to every search and receivable lookup is the current tenant ID.

- [ ] **Step 3: Run the red tool tests.**

Run:

```bash
pnpm --filter @casso-ledger/backend exec jest src/modules/copilot/application/tools/copilot-read-tools.spec.ts --runInBand
```

Expected failure: the new class/file does not exist.

- [ ] **Step 4: Implement the smallest application-layer tool.** The constructor must inject only these ports/services:

```typescript
@Inject(RECEIVABLE_REPOSITORY)
private readonly receivableRepo: IReceivableRepository,
@Inject(CUSTOMER_REPOSITORY)
private readonly customerRepo: ICustomerRepository,
@Inject(INVOICE_REPOSITORY)
private readonly invoiceRepo: IInvoiceRepository,
private readonly tenantContext: TenantContextService,
```

The `execute` method must:

  - read `organizationId`, `userId`, and `role` from the current tenant context;
  - normalize a whitespace-only search to no search and use `20` when no limit is supplied;
  - resolve customer and invoice IDs with the existing ports only when a search is present;
  - return early on a search miss;
  - call `findOverdueCandidates` with `referenceDate` supplied by the optional testable `now` argument, the current organization, the role filter, and the resolved ID filters;
  - batch-enrich all returned customer IDs and non-null invoice IDs;
  - return candidates in repository order, preserving the oldest-due-first deterministic order;
  - serialize `dueDate` with `toISOString()` and preserve `invoiceNumber: null` when `invoiceId` is null;
  - use a human-readable fallback customer label if a legacy row has no customer enrichment, without exposing the customer UUID.

The tool performs no writes and opens no transaction.

- [ ] **Step 5: Run the tool tests and refactor.**

Run:

```bash
pnpm --filter @casso-ledger/backend exec jest src/modules/copilot/application/tools/copilot-read-tools.spec.ts --runInBand
```

Expected result: the new and existing Copilot read-tool tests pass. Keep the tool as one class; do not extract a search service, formatter, or selection state object.

- [ ] **Step 6: Commit the tool slice.**

```bash
git add apps/backend/src/modules/copilot/application/tools/find-overdue-receivables.tool.ts apps/backend/src/modules/copilot/application/tools/copilot-read-tools.spec.ts
git commit -m "feat: add Copilot overdue receivable lookup tool"
```

---

### Task 3: Wire the tool into Copilot and update authoritative-data behavior

**Files:**

- Modify: `apps/backend/src/modules/copilot/copilot.module.ts`
- Modify: `apps/backend/src/modules/copilot/application/copilot-tool-registry.ts`
- Modify: `apps/backend/src/modules/copilot/application/copilot-tool-registry.spec.ts`
- Modify: `apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts`
- Modify: `apps/backend/src/modules/copilot/application/copilot-chat.usecase.spec.ts`
- Modify: `apps/backend/src/modules/copilot/application/copilot-chat.usecase.streaming.spec.ts`

- [ ] **Step 1: Write failing registry and dispatch tests.**

  - Add `findOverdueReceivables` to the registry test fixtures and assert it appears for both `getTools(true)` and `getTools(false)`, while reminder write tools remain hidden for `getTools(false)`.
  - Add a Copilot chat unit case where the model calls `findOverdueReceivables` and assert the injected tool receives the optional search and limit values.
  - Add an invalid optional-argument case asserting `VALIDATION_ERROR` rather than silently defaulting an invalid value.

- [ ] **Step 2: Run the red tests.**

Run:

```bash
pnpm --filter @casso-ledger/backend exec jest src/modules/copilot/application/copilot-tool-registry.spec.ts src/modules/copilot/application/copilot-chat.usecase.spec.ts --runInBand
```

Expected failure: the safe allowlist, registry fixtures, constructor, and `executeTool` switch do not know the new tool.

- [ ] **Step 3: Register the tool and its schema.**

In `copilot-tool-registry.ts`, add the new name to `SAFE_TOOL_NAMES`. In `copilot.module.ts`:

  - import `InvoicesModule` directly because the new tool injects `INVOICE_REPOSITORY`;
  - import and provide `FindOverdueReceivablesTool`;
  - register a read-only schema with optional `search: string` and `limit: integer, minimum: 1, maximum: 20`, with no required properties.

The registry description must tell the model that the tool returns overdue receivables suitable for choosing a reminder target.

- [ ] **Step 4: Dispatch and validate the tool in `CopilotChatUseCase`.**

  - Inject `FindOverdueReceivablesTool` beside the existing read tools.
  - Add a `findOverdueReceivables` switch case that validates optional `search` and `limit` types before calling the tool. A non-string search, non-number limit, non-integer limit, or out-of-range limit must become `AppError(ErrorCode.VALIDATION_ERROR, ...)`.
  - Keep organization/user arguments for `draftReminderEmail` unchanged. The new read tool gets tenant data from `TenantContextService`, so the chat use case must not add a second organization parameter to its port.
  - Update the existing prompt sentence so `findOverdueReceivables` is also an authoritative source for the real remaining amount and due date before drafting.
  - Add prompt guidance that a generic result with zero items must not draft, one item may draft, and multiple items must be shown as a numbered human-readable list; a result of 20 remains ambiguous and must be narrowed by customer name or invoice number.
  - Add prompt guidance not to show internal UUIDs and to display `Chưa có số hóa đơn` when `invoiceNumber` is null.
  - Do not change `toAiHistory`, `toCopilotMessageDto`, `sendReminderEmail` interception, or draft permission behavior. A later chat turn naturally re-queries by the human-readable value because the existing conversation history already carries tool results.

- [ ] **Step 5: Update test dependency builders.** Add the new mock tool to every direct `new CopilotChatUseCase(...)` call in the non-streaming and streaming specs, and register it in both test registry builders. Do not weaken the existing tests by replacing the concrete constructor with a broad fake.

- [ ] **Step 6: Run the focused Copilot unit suite.**

Run:

```bash
pnpm --filter @casso-ledger/backend exec jest src/modules/copilot/application --runInBand
```

Expected result: registry, chat-loop, streaming, and read-tool tests pass. Refactor only duplicated test setup needed by the new constructor argument.

- [ ] **Step 7: Commit the Copilot wiring slice.**

```bash
git add apps/backend/src/modules/copilot/copilot.module.ts apps/backend/src/modules/copilot/application
git commit -m "feat: wire overdue receivable discovery into Copilot"
```

---

### Task 4: Add end-to-end chat regression coverage

**Files:**

- Modify: `apps/backend/test/copilot-chat.integration.spec.ts`

- [ ] **Step 1: Extend only the existing fixture helpers.** Add the minimum helper data needed to create a second customer, optional invoice, and overdue receivable in the fixture organization. Keep the current default fixture intact so existing confirmation/quota tests remain valid. Add the `CopilotDraftOrmEntity` and `InvoiceOrmEntity` imports only if the new assertions need them.

- [ ] **Step 2: Add the generic multi-candidate test.** Mock the AI provider so the first completion calls `findOverdueReceivables` without arguments and the next completion returns a final Vietnamese response. Assert that the second model call received two structured candidates containing customer name, invoice number/null, remaining amount, and due date in oldest-due-first order. Assert the HTTP response does not expose the internal `toolCalls` field; the scripted assistant content must not include a receivable UUID.

- [ ] **Step 3: Add the fresh-selection-to-draft test.** Use the same conversation for two chat turns:

  1. The generic turn returns multiple candidates and no draft.
  2. The selection turn causes a fresh `findOverdueReceivables` call with the human-readable customer name or invoice number, then calls `draftReminderEmail` with the selected `receivableId`, then returns a final answer.

Assert that:

  - the second lookup receives the search value rather than relying on a persisted selection state;
  - exactly one `CopilotDraftOrmEntity` exists;
  - the stored draft has the selected receivable ID, the real customer email, and body content containing the real remaining amount and due date supplied by the test model;
  - no reminder execution or email send occurs during drafting.

- [ ] **Step 4: Add the no-match test.** Mock an empty `findOverdueReceivables` result for a generic request or selection search. Assert a successful Vietnamese no-result response, no draft row, no pending action, and no reminder execution.

- [ ] **Step 5: Add tenant and permission regression assertions.** Verify that the lookup tool is present for a Copilot user without `REMINDER_SEND_MANUAL`, while `draftReminderEmail` remains absent from that user's model tool list. Seed a separate organization with a similarly named customer and assert the current tenant's lookup payload does not contain the other organization's candidate. Keep the existing draft tenant checks and confirmation tests unchanged.

- [ ] **Step 6: Run the focused integration test.**

Run:

```bash
pnpm --filter @casso-ledger/backend exec jest --config ./test/jest-e2e.json copilot-chat.integration.spec.ts --runInBand
```

Expected result: all existing Copilot integration tests and the new discovery/selection tests pass against PostgreSQL and Redis testcontainers.

- [ ] **Step 7: Commit the integration slice.**

```bash
git add apps/backend/test/copilot-chat.integration.spec.ts
git commit -m "test: cover Copilot overdue receivable selection flow"
```

---

### Task 5: Verify the branch and prepare the handoff

**Files:**

- Modify: `docs/wayfinder/feature-map.md` only when the ticket is actually merged; add `Status: done`, `Shipped: <date>`, and the PR reference at that point.

- [ ] **Step 1: Run the complete relevant backend tests.**

```bash
pnpm --filter @casso-ledger/backend test -- --runInBand
pnpm --filter @casso-ledger/backend test:e2e -- --runInBand
```

- [ ] **Step 2: Run type checking and repository verification.**

```bash
pnpm --filter @casso-ledger/backend type-check
pnpm verify
```

- [ ] **Step 3: Run the repository domain check after backend changes.** Use the repository's `/domain-check` skill/instruction and fix every reported violation before claiming the branch is ready.

- [ ] **Step 4: Run final hygiene checks.**

```bash
git diff --check main...HEAD
git status --short --branch
```

Confirm there are no `.env` files staged, no generated artifacts, no frontend changes, no migration files, and no uncommitted production changes outside the mapped files.

- [ ] **Step 5: Request review before merging.** Use `requesting-code-review` after the verification commands pass. Do not merge or mark the feature-map item done until the user reviews the branch and the PR is merged.

## Expected Scope

The implementation should add one application tool, one repository query method, Copilot registry/module/use-case wiring, focused unit tests, and Copilot chat integration tests. It should not add a new domain entity, current-state balance column, HTTP contract, migration, frontend component, pagination UI, selection table, or general-purpose search service.
