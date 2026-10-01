# Copilot Overdue Receivable Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` for inline execution, or `superpowers:subagent-driven-development` if the user chooses subagent-driven execution. Steps use checkbox syntax for tracking.

**Goal:** Show no more than 10 overdue receivables in one Copilot answer and let the user fetch the next page by asking “xem tiếp”.

**Architecture:** Keep one row per receivable. Add keyset pagination to the existing tenant-scoped repository query ordered by `(dueDate, id)`. The Copilot tool returns at most 10 items, `hasMore`, and an internal cursor; the use case preserves search and cursor arguments across continuation tool calls and instructs the model to keep pagination metadata private. Set Copilot's per-call output budget to 2,048 tokens.

**Tech Stack:** NestJS, TypeScript, TypeORM, OpenAI-compatible chat provider, Jest, pnpm.

## Global Constraints

- Work only in `D:\casso-ledger\.worktrees\feat\351-copilot-ui-audit`, branch `feat/351-copilot-ui-audit`; never edit `main`.
- Follow TDD for behavior changes: add one regression test, run it red, implement the smallest change, and run it green.
- Scope every repository query by `organizationId` and preserve sales-representative scoping.
- Keep domain code free of NestJS and TypeORM imports; use the existing repository port and explicit TypeORM query.
- Keep one row per receivable; do not aggregate amounts by customer or return all results in one model response.
- Use `hasMore` and a keyset cursor; do not add an exact-count query or frontend table.
- Apply `maxOutputTokens: 2048` to both Copilot model-call paths; keep the shared adapter's default at 1,024 for other callers.
- Do not add dependencies. Run focused tests, `pnpm verify`, and the repository `domain-check` before completion.
- The existing assertion cleanup in `apps/backend/src/modules/copilot/application/copilot-chat.usecase.spec.ts` is committed before implementation; build later regression coverage on top of that baseline.

---

### Task 1: Add keyset paging to the overdue-receivable tool

**Files:**
- Modify: `apps/backend/src/modules/receivables/application/receivable-repository.port.ts`
- Modify: `apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.ts`
- Test: `apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.spec.ts`
- Modify: `apps/backend/src/modules/copilot/application/tools/find-overdue-receivables.tool.ts`
- Test: `apps/backend/src/modules/copilot/application/tools/copilot-read-tools.spec.ts`

**Interfaces:**
- `OverdueReceivableFilters` gains optional `after?: { dueDate: Date; id: string }`.
- `FindOverdueReceivablesInput` gains optional `cursor?: { dueDate: string; receivableId: string }`; `limit` defaults to 10 and is valid only from 1 through 10.
- `FindOverdueReceivablesResult` becomes `{ items: OverdueReceivableCandidate[]; hasMore: boolean; nextCursor: { dueDate: string; receivableId: string } | null }`.
- The repository continues to return `Receivable[]`; the tool requests `limit + 1`, returns only the first `limit`, and derives `hasMore` and `nextCursor` from the extra row.

- [ ] **Step 1: Write the failing repository cursor test.** In `typeorm-receivable.repository.spec.ts`, add a query-builder mock like the existing `findOverdueCandidates` test and call the repository with `limit: 11` (the tool supplies page size 10 plus one look-ahead row) and `after: { dueDate: new Date('2026-09-01T00:00:00.000Z'), id: 'rcv-10' }`.

```typescript
expect(qb.andWhere).toHaveBeenCalledWith(
  '(r.dueDate > :afterDueDate OR (r.dueDate = :afterDueDate AND r.id > :afterId))',
  {
    afterDueDate: new Date('2026-09-01T00:00:00.000Z'),
    afterId: 'rcv-10',
  },
);
expect(qb.where).toHaveBeenCalledWith(
  'r.organizationId = :organizationId',
  { organizationId: 'org-1' },
);
expect(qb.orderBy).toHaveBeenCalledWith('r.dueDate', 'ASC');
expect(qb.addOrderBy).toHaveBeenCalledWith('r.id', 'ASC');
expect(qb.take).toHaveBeenCalledWith(11);
```
- [ ] **Step 2: Run the repository test and confirm the expected failure.**

Run: `pnpm --filter @casso-ar/backend exec jest --runInBand --runTestsByPath src/modules/receivables/infrastructure/typeorm-receivable.repository.spec.ts`

Expected: the new cursor-filter assertion fails because the repository does not yet apply `after`.

- [ ] **Step 3: Add the repository cursor filter.** Extend `OverdueReceivableFilters` with `after`; add the parenthesized due-date/ID keyset predicate before the existing ordering and limit in `findOverdueCandidates`.

```typescript
if (filters.after) {
  qb.andWhere(
    '(r.dueDate > :afterDueDate OR (r.dueDate = :afterDueDate AND r.id > :afterId))',
    {
      afterDueDate: filters.after.dueDate,
      afterId: filters.after.id,
    },
  );
}
```

- [ ] **Step 4: Run the repository test and confirm it passes.**

Run: `pnpm --filter @casso-ar/backend exec jest --runInBand --runTestsByPath src/modules/receivables/infrastructure/typeorm-receivable.repository.spec.ts`

Expected: all repository tests pass, including organization filtering and stable cursor ordering.

- [ ] **Step 5: Write failing tool tests.** In `copilot-read-tools.spec.ts`, update existing expectations from `limit: 20` to `limit: 11` for the default page and assert the public result has 10 items maximum. Add a case using 11 existing-style `Receivable` fixtures to prove the 11th fetched row sets `hasMore: true` but is not returned, and the cursor comes from row 10:

```typescript
const candidates = Array.from({ length: 11 }, (_, index) =>
  new Receivable({
    ...rec1,
    id: `rec-${index + 1}`,
    dueDate: new Date(Date.UTC(2026, 7, index + 1)),
  }),
);
receivableRepo.findOverdueCandidates.mockResolvedValue(candidates);
const result = await tenantContext.run(
  { userId: 'u-1', organizationId: 'org-1', role: Role.FINANCE_MANAGER },
  () => tool.execute({}, fixedNow),
);

expect(receivableRepo.findOverdueCandidates).toHaveBeenCalledWith(
  expect.objectContaining({ limit: 11 }),
);
expect(result.items).toHaveLength(10);
expect(result.hasMore).toBe(true);
expect(result.nextCursor).toEqual({
  dueDate: candidates[9].dueDate.toISOString(),
  receivableId: 'rec-10',
});
```

Also cover a final page with fewer than 10 rows and an empty search result; both return `hasMore: false` and `nextCursor: null`. Keep limit validation at 1–10 and assert 0, 11, and non-integers fail. The standalone tool accepts a typed cursor, while malformed model-provided cursor values are rejected at the use-case trust boundary in Task 2.
- [ ] **Step 6: Run the tool tests and confirm the expected failure.**

Run: `pnpm --filter @casso-ar/backend exec jest --runInBand --runTestsByPath src/modules/copilot/application/tools/copilot-read-tools.spec.ts`

Expected: the new page-size, cursor, and result-shape assertions fail because the tool currently returns only `items` and allows up to 20.

- [ ] **Step 7: Implement bounded tool paging.** Default `limit` to 10; retain the caller's validated limit from 1–10; pass the parsed cursor to the repository; request one extra row; return only the first page, `hasMore`, and a `nextCursor` only when more rows exist. Derive the cursor from the last displayed row, not the extra row. Keep customer/invoice search resolution and tenant/sales-representative filtering unchanged. Empty-search and no-result returns must use the same result shape `{ items: [], hasMore: false, nextCursor: null }`.

```typescript
const pageSize = input.limit ?? 10;
const fetched = await this.receivableRepo.findOverdueCandidates({
  organizationId,
  referenceDate: now,
  salesRepresentativeId,
  customerIdIn,
  invoiceIdIn,
  after: input.cursor
    ? { dueDate: new Date(input.cursor.dueDate), id: input.cursor.receivableId }
    : undefined,
  limit: pageSize + 1,
});
const hasMore = fetched.length > pageSize;
const page = fetched.slice(0, pageSize);
const last = page.at(-1);
const nextCursor = hasMore && last
  ? { dueDate: last.dueDate.toISOString(), receivableId: last.id }
  : null;
```

Map customer and invoice details only for `page`, then return `{ items, hasMore, nextCursor }`. Use this same shape for empty-result exits.

- [ ] **Step 8: Run the tool tests and confirm they pass.**

Run: `pnpm --filter @casso-ar/backend exec jest --runInBand --runTestsByPath src/modules/copilot/application/tools/copilot-read-tools.spec.ts`

Expected: all tool tests pass, including empty search results and boundary validation.

- [ ] **Step 9: Commit the repository/tool slice.**

Run these commands in order:

```bash
git add apps/backend/src/modules/receivables/application/receivable-repository.port.ts apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.ts apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.spec.ts apps/backend/src/modules/copilot/application/tools/find-overdue-receivables.tool.ts apps/backend/src/modules/copilot/application/tools/copilot-read-tools.spec.ts
git commit -m "feat: paginate overdue receivables"
```

Expected: commit contains only the repository and tool paging changes.

### Task 2: Continue pages through Copilot chat

**Files:**
- Modify: `apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts`
- Test: `apps/backend/src/modules/copilot/application/copilot-chat.usecase.spec.ts`
- Test: `apps/backend/src/modules/copilot/application/copilot-chat.usecase.streaming.spec.ts`
- Test: `apps/backend/src/modules/copilot/infrastructure/openai-chat-provider.adapter.spec.ts`

**Interfaces:**
- The registered tool schema accepts `cursor: { dueDate: string; receivableId: string }` and a `limit` no greater than 10.
- `CopilotChatUseCase.executeTool` validates and forwards the cursor and search term to `FindOverdueReceivablesTool.execute`.
- Both `createChatCompletion` and `streamChatCompletion` receive `{ maxOutputTokens: 2048 }`.

- [ ] **Step 1: Inspect the committed baseline assertion** in `copilot-chat.usecase.spec.ts`. Preserve it; add the new regression assertions without reverting or staging unrelated changes.
- [ ] **Step 2: Write failing use-case tests.** In the existing overdue-tool dispatch test, pass `cursor: { dueDate: '2026-09-01T00:00:00.000Z', receivableId: 'rcv-10' }` in the provider tool call and assert the same cursor and search reach `FindOverdueReceivablesTool.execute`. Add invalid-cursor coverage (missing/non-string ID, invalid date) and prompt-policy assertions. The prompt must tell Copilot to use the most recent matching `nextCursor` on “xem tiếp”, preserve the search, show at most 10, offer continuation only when `hasMore` is true, and never show cursor/IDs. Update the existing all-call token assertions from 4,096 to 2,048 and retain streaming's equivalent assertion.
- [ ] **Step 3: Run focused tests and confirm they fail for the missing behavior.**

Run: `pnpm --filter @casso-ar/backend exec jest --runInBand --runTestsByPath src/modules/copilot/application/copilot-chat.usecase.spec.ts src/modules/copilot/application/copilot-chat.usecase.streaming.spec.ts src/modules/copilot/infrastructure/openai-chat-provider.adapter.spec.ts`

Expected: cursor arguments are not forwarded and the prompt/token assertions fail.

- [ ] **Step 4: Implement continuation guidance and cursor forwarding.** Add this optional property to `FIND_OVERDUE_RECEIVABLES_SCHEMA`:

```typescript
cursor: {
  type: 'object',
  properties: {
    dueDate: { type: 'string', description: 'ISO-8601 due date from the previous page.' },
    receivableId: { type: 'string', description: 'Internal continuation key.' },
  },
  required: ['dueDate', 'receivableId'],
},
```

Update tool and use-case limit validation to 1–10; validate cursor shape/date in `executeTool`; forward `search`, `limit`, and cursor into the tool. Add this local type guard so untrusted provider arguments are narrowed without a cast:

```typescript
function isValidOverdueCursor(
  value: unknown,
): value is { dueDate: string; receivableId: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return (
    'dueDate' in value &&
    typeof value.dueDate === 'string' &&
    Number.isFinite(Date.parse(value.dueDate)) &&
    'receivableId' in value &&
    typeof value.receivableId === 'string' &&
    value.receivableId.length > 0
  );
}
```

Replace the prompt's 20-result instruction with: “List at most the returned 10 overdue receivables. If `hasMore` is true, say more results are available and invite the user to say ‘xem tiếp’; do not state an exact total. When the user asks to continue, call `findOverdueReceivables` with the `nextCursor` and search term from the most recent matching result. Never show the cursor or internal IDs.” Set `MAX_OUTPUT_TOKENS = 2048`; keep the shared adapter fallback at 1,024 and verify its existing adapter test continues to cover that default.

```typescript
case FindOverdueReceivablesTool.NAME: {
  // Keep the existing search and limit validation, with max limit 10.
  const cursor = input.cursor;
  if (cursor !== undefined && !isValidOverdueCursor(cursor)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Cursor không hợp lệ.');
  }
  return this.findOverdueReceivablesTool.execute({
    search: search !== undefined ? search : undefined,
    limit: limit !== undefined ? limit : undefined,
    cursor,
  });
}
```

- [ ] **Step 5: Run focused tests and confirm they pass.**

Run: `pnpm --filter @casso-ar/backend exec jest --runInBand --runTestsByPath src/modules/copilot/application/copilot-chat.usecase.spec.ts src/modules/copilot/application/copilot-chat.usecase.streaming.spec.ts src/modules/copilot/infrastructure/openai-chat-provider.adapter.spec.ts`

Expected: all focused tests pass; the use case supplies 2,048 for both call paths and adapter callers without an override still use the shared 1,024 default.

- [ ] **Step 6: Commit the Copilot continuation slice.**

Run these commands in order:

```bash
git add apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts apps/backend/src/modules/copilot/application/copilot-chat.usecase.spec.ts apps/backend/src/modules/copilot/application/copilot-chat.usecase.streaming.spec.ts apps/backend/src/modules/copilot/infrastructure/openai-chat-provider.adapter.spec.ts
git commit -m "feat: continue Copilot overdue lists"
```

Expected: commit contains only the Copilot continuation and token-budget changes.

### Task 3: Verify the full flow and update the pull request

**Files:**
- No additional source files unless verification identifies a defect.

- [ ] **Step 1: Run the repository checks.** Run `pnpm verify`, then open `.claude/skills/domain-check.md` and run its prescribed backend domain check; fix violations before proceeding.
- [ ] **Step 2: Exercise the local UI.** In the worktree app at `http://localhost:5174/copilot`, ask for overdue receivables and confirm the first response lists no more than 10, includes the “xem tiếp” prompt when `hasMore` is true, and contains no cursor/internal ID. Send “xem tiếp” and confirm the next response starts after the previous dueDate/ID cursor and does not repeat rows. The seeded dataset contains 20 rows, so verify both pages and the final `hasMore: false` behavior.
- [ ] **Step 3: Push both verified commits to `feat/351-copilot-ui-audit` and confirm PR #443 references the new head SHA.** Do not merge the PR.

Expected: `pnpm verify` exits 0; first and second local chat pages each show at most 10 records with no duplicates, and the final page offers no further continuation.
