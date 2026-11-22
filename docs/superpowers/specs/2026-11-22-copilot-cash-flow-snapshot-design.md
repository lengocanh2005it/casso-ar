# Copilot Cash-Flow Snapshot Tool Design

> Child spec of `docs/overview.md`. Extends the Collection Copilot (`2026-08-03-collection-copilot-design.md`) and follows the risk-ranking tool pattern (`2026-11-22-copilot-risk-ranking-design.md`).

## 0. Problem

The Copilot answers receivable/payment/collection questions but cannot answer cash-flow questions: "tháng này thu được bao nhiêu?", "công nợ đang nằm ở nhóm quá hạn nào?", "xu hướng 6 tháng thế nào?".

The data exists in `reporting/` (`GET /reports/dashboard-summary`, `/reports/aging`, `/reports/trend`) but no copilot tool exposes it. The model currently cannot reach that data, and prompting it to estimate numbers would violate the "never invent monetary data" rule.

## 1. Goal & non-goals

**Goal** — add one read-only tool that gives the agent a combined cash-flow snapshot so it can answer dashboard, aging, forecast and trend questions from real, code-computed data.

**Non-goals**
- No new HTTP endpoint, no new table, no migration, no new dependency, no new `ErrorCode`.
- No ML forecasting. `cashForecast` stays the documented naive due-date sum; the tool relays it, never recomputes it.
- No recomputation of any metric in the copilot layer. The tool calls the existing query services and relays their numbers.
- No change to the 7 existing tools, their whitelist entries, or their behavior.
- No automatic sending or any write. This is a read tool.

## 2. Tool contract

Name: `getCashFlowSnapshot`. Registered in `CopilotToolRegistry`; added to `SAFE_TOOL_NAMES` (seven names becomes eight). `requiresReminderPermission: false`.

Input: none (`{}`). No validator needed — the shared `validateSearchAndLimit()` is for the search/limit tools only.

Output:

```typescript
interface CashFlowSnapshot {
  dashboard: {
    totalOutstanding: string;      // integer VND as string (bigint-safe)
    totalOverdue: string;
    overdueRate: number;
    cashForecast: {
      forecast7d: string;
      forecast14d: string;
      forecast30d: string;
    };
    autoMatchRate: number | null;
    manualHandlingRate: number | null;
    reminderEffectiveness: number | null;
    topOverdueCustomers: Array<{
      customerId: string;          // internal — never shown to the user
      customerName: string;
      totalOverdue: string;
    }>;
  };
  aging: Array<{                   // five buckets, fixed order, zero-filled
    bucket:
      | 'NOT_DUE'
      | 'OVERDUE_1_7'
      | 'OVERDUE_8_30'
      | 'OVERDUE_31_60'
      | 'OVERDUE_60_PLUS';
    count: number;
    totalRemaining: string;
  }>;
  trend: {
    months: 6;
    items: Array<{ month: string; outstanding: string | null; collected: string }>;
  };
}
```

No paging, no cursor, no `hasMore`. `ponytail:` the snapshot always fetches all three sections and a fixed 6-month trend even when the question only needs one number. This trades extra tokens for one ReAct call; add narrower tools if prompt cost becomes measurable.

## 3. Data flow

1. Model receives a cash-flow question and calls `getCashFlowSnapshot`.
2. Tool issues `Promise.all([dashboard.getSummary(), aging.getAgingBuckets(), trend.getTrend(6)])`.
3. Each query service reads its own tenant-scoped data via `TenantContextService`:
   - `DashboardSummaryQueryService.getSummary()` — defaults to current calendar month in `Asia/Ho_Chi_Minh`; `topOverdueCustomers` already narrows to the signed-in `SALES_REP` when applicable.
   - `AgingReportQueryService.getAgingBuckets()` — the tool passes no `salesRepresentativeId`; the service already applies the SALES_REP scope internally when one is needed (`getAgingBuckets(salesRepresentativeId?)` — see §5 for the scoping decision).
   - `TrendReportQueryService.getTrend(6)` — last six calendar months in `Asia/Ho_Chi_Minh`, current month included.
4. Tool returns the assembled snapshot; the model paraphrases the numbers in Vietnamese. It never recomputes a rate, never invents an amount, and never shows `customerId` or bucket codes to the user.
5. No draft/send action follows from a cash-flow question; the existing `draftReminderEmail` → pending-action path is unchanged.

## 4. Wiring

- `reporting.module.ts` — add `exports: [AgingReportQueryService, DashboardSummaryQueryService, TrendReportQueryService]`. No new provider; the module already provides all three.
- `copilot.module.ts` — import `ReportingModule`; add `GetCashFlowSnapshotTool` to `providers`.
- `copilot-tool-registry.ts` — add `'getCashFlowSnapshot'` to `SAFE_TOOL_NAMES`; register in the factory with `requiresReminderPermission: false` and an input schema of `{ type: 'object', properties: {}, required: [] }`.
- `copilot-chat.usecase.ts` — inject an optional `GetCashFlowSnapshotTool` constructor argument (after the existing optional `rankReceivablesByRiskTool`) so the 25 existing direct constructions and the streaming spec keep working; add a dispatch case. Missing tool → `AppError(INTERNAL_SERVER_ERROR)` as with the risk tool.
- `SYSTEM_PROMPT` — add one line: use `getCashFlowSnapshot` for cash-flow, aging, forecast, and trend questions; report only returned numbers; do not use it for questions about a specific receivable/customer (other tools cover those). Bump `PROMPT_VERSION` to `copilot-v5`.

Application-layer boundary: the tool lives in `application/tools/`, depends only on other modules' application-layer query services and `TenantContextService` where needed; no infrastructure import, no `@nestjs/common` HTTP exception, no `any`, no concrete SDK.

## 5. SALES_REP scoping — decision

`DashboardSummaryQueryService.getSummary()` reads the current user from `TenantContextService` itself and narrows `topOverdueCustomers` for `Role.SALES_REP`. `AgingReportQueryService.getAgingBuckets(salesRepresentativeId?)` does **not** read the user; its caller must pass the id.

Therefore the copilot tool resolves `TenantContextService.getCurrentUser()` and passes `userId` to `getAgingBuckets()` only when `role === Role.SALES_REP`, otherwise calls it with no argument. This is the same data-scope pattern as `FindOverdueReceivablesTool` and `RankReceivablesByRiskTool` — a scope filter, not a permission gate. `getTrend()` needs no scoping (payments aggregate by organization).

## 6. Error handling

- A query service failure propagates through the existing `toToolErrorPayload()` path; the model summarizes in Vietnamese without repeating the raw error. No partial snapshot.
- No validation errors: the tool takes no input.
- No new `ErrorCode` values; no change to `status-by-error-code.ts`.

## 7. Testing (TDD — RED before GREEN)

**Unit — `get-cash-flow-snapshot.tool.spec.ts`**
- All three query services called exactly once, concurrently via one `Promise.all` (spy call order/count).
- Output shape matches §2 exactly; aging keeps the five-bucket order and zero-fills missing buckets (the service already does this — assert the tool does not reorder).
- SALES_REP: `getAgingBuckets` receives the user id; other roles call it with no argument.
- A failing query service rejects the tool call; no partial snapshot.
- Tool never mutates the returned objects.

**Unit — `copilot-tool-registry.spec.ts`**
- New name accepted; unknown names still throw `AppError`.

**Unit — `copilot-chat.usecase.spec.ts`**
- Prompt contains `getCashFlowSnapshot` guidance; `PROMPT_VERSION` is `copilot-v5`.
- Tool call to `getCashFlowSnapshot` routes to the tool and its result reaches the model.

No e2e: no HTTP contract or schema change. Existing copilot e2e continues to cover the chat path.

## 8. Verification

1. Focused Jest (tool, chat, registry) — green.
2. `pnpm verify` (lint + type-check + full unit suite) — green.
3. `/domain-check` after the backend change — no violations; specifically: query services imported from `reporting/application/`, no infrastructure import, no HTTP exception, tenant scope preserved.
4. Confirm existing 7 tool tests, pending-action tests, and streaming spec unchanged.

## 9. Deliberate simplifications / ceilings

- Fixed 6-month trend; no range parameter.
- All three sections fetched on every call even if the question needs one; narrower tools if token cost matters.
- `cashForecast` is the naive due-date sum, not a prediction — the answer must not describe it as a probability or ML forecast.
- No conversation history summarization of numbers; each answer re-reads a fresh snapshot.
