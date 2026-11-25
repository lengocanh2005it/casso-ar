# Copilot Exact-sum Receivable Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only Copilot tool that surfaces exact-sum receivable groups for one actionable Exception Queue transfer, in Vietnamese, with no allocation performed by Copilot.

**Architecture:** New tool in `copilot/application/tools` calls `UnmatchedBankTransactionsQueryService.combinationSuggestions()` — the same bounded exact-sum search used by Exception Queue. Customer name is resolved by a small internal exact-name lookup over the tenant-scoped customer repository. Tool output is trimmed to business fields; internal IDs never reach the user. Registry gets a `PAYMENT_ALLOCATE` gate matching the Exception Queue endpoints.

**Tech Stack:** NestJS 11, TypeORM 1.1, Jest 30, Biome 2, TypeScript 6.

## Global Constraints

- Money: integer VND. Never float or decimal.
- Every query scoped by `organizationId` from `TenantContextService`.
- No `any`, no `as unknown as` in production code; explicit mappers only.
- No new HTTP endpoint, no new database column, no new pending-action type.
- No write path. Copilot must never allocate, match, or change status.
- Value imports for classes used in DI/decorators.
- Files kebab-case, classes PascalCase, functions camelCase.
- Test behavior through public interfaces (tool `execute`, registry `getTools`, chat dispatch), not private methods.
- TDD: observe a failing test before production code for each slice.
- Use glossary term **Exact-sum receivable group**, never “unmatched transactions” in user-facing text.

---

### Task 1: Tool schema, dispatch, and trimmed result

**Files:**
- Create: `apps/backend/src/modules/copilot/application/tools/get-receivable-combination-suggestions.tool.ts`
- Create: `apps/backend/src/modules/copilot/application/tools/get-receivable-combination-suggestions.tool.spec.ts`
- Modify: `apps/backend/src/modules/copilot/application/copilot-tool-registry.ts`
- Modify: `apps/backend/src/modules/copilot/application/copilot-tool-registry.spec.ts`
- Modify: `apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts`
- Modify: `apps/backend/src/modules/copilot/copilot.module.ts`
- Modify: `apps/backend/src/modules/customers/application/customer-repository.port.ts`
- Modify: `apps/backend/src/modules/customers/infrastructure/typeorm-customer.repository.ts`

**Interfaces:**
- Consumes: `UnmatchedBankTransactionsQueryService.combinationSuggestions(bankTransactionId: string, selectedCustomerId?: string): Promise<ReceivableCombinationSuggestionsView>` with statuses `COMPLETE | INCOMPLETE | CUSTOMER_REQUIRED` and groups of `{ receivables: Array<{ receivableId, customerId, customerName, invoiceNumber, remainingAmount, dueDate }> }`.
- Produces: `GetReceivableCombinationSuggestionsTool.NAME = 'getReceivableCombinationSuggestions'`, input `{ bankTransactionId: unknown; customerName?: unknown }`, result `{ status, groups: Array<{ receivables: Array<{ invoiceNumber, faceAmount, remainingAmount }> }> }`. No IDs in result. `faceAmount` comes from the receivable entity (`originalAmount`), `remainingAmount` from the suggestion view.

- [ ] **Step 1: Write the failing schema/dispatch test**

```ts
it('declares the tool schema and forwards the transfer id', async () => {
  expect(GetReceivableCombinationSuggestionsTool.NAME).toBe('getReceivableCombinationSuggestions');
  const tool = buildTool();
  await runInTenant(() => tool.execute({ bankTransactionId: 'bt-1' }));
  expect(queryService.combinationSuggestions).toHaveBeenCalledWith('bt-1', undefined);
});
```

- [ ] **Step 2: Run to observe RED**

Run: `cd D:/casso-ledger/.claude/worktrees/feat+513-copilot-exact-sum-groups && pnpm --filter @casso-ar/backend exec jest --testPathPatterns get-receivable-combination-suggestions --runInBand`
Expected: module not found.

- [ ] **Step 3: Implement tool, register allowlist, gate, dispatch**

Create the tool with `validateBankTransactionId` (required non-empty string) and `validateCustomerName` (optional string, trimmed, bounded by `MAX_SEARCH_LENGTH`). Use `tenantContext.getOrganizationId()` fail-fast before query. Map view to result with no IDs. Add `requiresPaymentAllocatePermission?: boolean` to `CopilotToolDefinition`, filter in `getTools(canSendReminders, canAllocatePayments)` using the existing registry pattern. Thread the allowed-name Set already present in `executeTool` — this new tool is included automatically because the Set derives from `getTools`. Wire query service and tenant context in both modules.

- [ ] **Step 4: Run focused spec GREEN**

Run same command as Step 2. Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add Copilot exact-sum group read tool"
```

---

### Task 2: Customer-name resolution and query statuses

**Files:**
- Modify: `apps/backend/src/modules/copilot/application/tools/get-receivable-combination-suggestions.tool.ts`
- Modify: `apps/backend/src/modules/copilot/application/tools/get-receivable-combination-suggestions.tool.spec.ts`

**Interfaces:**
- Consumes: `ICustomerRepository.findIdsByExactName(organizationId: string, exactName: string, limit: number): Promise<string[]>` (tenant-scoped, SQL-level exact match, limit 2).
- Produces: on `CUSTOMER_REQUIRED` with a supplied `customerName`, resolves at most two exact name matches; returns `customer_required` with no groups when zero or multiple. On `INCOMPLETE`, returns `incomplete`. On `COMPLETE`, returns groups (possibly empty).

- [ ] **Step 1: Write failing status tests**

```ts
it('reports incomplete searches distinctly from empty complete searches', async () => {
  const { tool } = buildTool({ status: 'INCOMPLETE', combinations: [] });
  const result = await runInTenant(() => tool.execute({ bankTransactionId: 'bt-1' }));
  expect(result.status).toBe('incomplete');
  expect(result.groups).toEqual([]);
});
```

Add tests for: unique exact customer name resolves to `customerId`; no match and duplicate exact names both leave `customer_required`; `CUSTOMER_REQUIRED` with no name returns `customer_required`; `COMPLETE` with groups returns trimmed groups.

- [ ] **Step 2: Run to observe RED**

Run: focused spec command from Task 1. Expected: assertion failures for missing behavior.

- [ ] **Step 3: Implement resolution**

When `combinationSuggestions` returns `CUSTOMER_REQUIRED` and `customerName` supplied: call `findIdsByExactName(orgId, normalizedLowerTrimmedName, 2)` — a bounded, tenant-scoped, SQL-level exact-name lookup. Exactly one id → re-call `combinationSuggestions(bankTransactionId, matchId)`. Zero or two (ambiguous) → return `{ status: 'customer_required', groups: [] }`. No new endpoint.

When the view status is `INCOMPLETE` or `COMPLETE`, map directly to lowercase status and groups. On `NOT_FOUND`/`CONFLICT` AppError from the query service, return `{ status: 'unavailable', groups: [] }` so the model gets a tool result, not an exception.

- [ ] **Step 4: Run focused spec GREEN**

Run same command. Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: resolve customer scope for exact-sum groups"
```

---

### Task 3: System prompt and end-to-end chat wiring

**Files:**
- Modify: `apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts`
- Modify: `apps/backend/src/modules/copilot/application/copilot-chat.usecase.spec.ts`

**Interfaces:**
- Consumes: result shapes from Task 1/2.
- Produces: prompt rules and dispatch case for the new tool. No change to pending-action types.

- [ ] **Step 1: Write failing prompt/dispatch tests**

```ts
it('teaches three exact-sum statuses without exposing IDs', async () => {
  expect(SYSTEM_PROMPT).toContain('getReceivableCombinationSuggestions');
  expect(SYSTEM_PROMPT).toContain('không phải là phân bổ');
  expect(SYSTEM_PROMPT).toContain('không hiển thị mã nội bộ');
});
```

Add a dispatch test where the model emits `getReceivableCombinationSuggestions`; assert the tool executes and the chat path stays green.

- [ ] **Step 2: Run to observe RED**

Run: `pnpm --filter @casso-ar/backend exec jest --testPathPatterns copilot-chat.usecase --runInBand`
Expected: prompt assertions fail.

- [ ] **Step 3: Add prompt rules and dispatch**

Prompt: when asked which receivables can be combined for an Exception Queue transfer, call the tool; explain that remaining balances sum exactly to transfer amount; list invoice, amount, remaining balance; never claim the transfer belongs to the customer unless reference/payer data proves it; `customer_required` asks for exact customer name; `incomplete` says search could not finish and directs to Exception Queue; empty `complete` says no exact-sum group found; never expose internal IDs; this is a suggestion, not an allocation; any allocation must be done in Exception Queue UI. Bump `PROMPT_VERSION` to `copilot-v7`.

- [ ] **Step 4: Run focused specs GREEN**

Run command from Step 2. Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: wire exact-sum groups into Copilot chat"
```

---

### Task 4: Full verification

- [ ] **Step 1:** `pnpm --filter @casso-ar/backend exec jest --runInBand` — full backend unit suite.
- [ ] **Step 2:** `npx tsc --noEmit -p apps/backend/tsconfig.json`
- [ ] **Step 3:** `pnpm --filter @casso-ar/backend arch-check`
- [ ] **Step 4:** `npx biome check apps/backend/src/modules/copilot` 
- [ ] **Step 5:** `/domain-check` skill and fix violations.
- [ ] **Step 6:** e2e tests if Docker available.
