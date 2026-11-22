# Copilot — Risk Ranking Tool Design

> Child spec of `docs/overview.md`. Extends the Collection Copilot (`2026-08-03-collection-copilot-design.md`) with one new read-only tool.

## 0. Problem

`GET /reports/dashboard-summary` exposes `cashForecast` (`forecast7d`/`14d`/`30d`), but that is only `SUM(originalAmount - paidAmount)` for receivables due in the window — a due-date total, not a prediction. There is no per-receivable risk signal the agent can use to answer "khoản nào sắp trễ nợ, nhắc trước cái nào?".

`findOverdueReceivables` already lists overdue items, but it sorts by `dueDate` or `remainingAmount`, has no risk concept, and its keyset cursor only works for `due_date_asc`. Reusing it for ranking would break pagination and change an existing tool's behavior.

This design adds a dedicated deterministic risk-ranking tool. It deliberately does **not** build ML cash-flow forecasting: `docs/wayfinder/feature-map.md` lists "ML-based cash flow forecasting" as out of scope ("rule-based naive forecast only"), and the copilot spec excludes complex ML forecasting. Those decisions stay. The LLM explains; code scores.

## 1. Goal & non-goals

**Goal** — let the Copilot answer "which receivables are about to go overdue / which should we chase first" with a ranked, explained list, then draft a reminder through the existing pending-action flow.

**Non-goals**
- No ML model, no training, no weight learning, no new DB table or migration.
- No automatic sending. The tool is read-only; `draftReminderEmail` → `sendReminderEmail` → user confirm stays unchanged.
- No write to `Receivable`, `Payment`, `PaymentAllocation`, or `Dispute`.
- No change to `findOverdueReceivables` behavior or cursor contract.
- No new HTTP endpoint. The tool is reachable only through the copilot chat turn.

## 2. Tool contract

Name: `rankReceivablesByRisk`. Registered in `CopilotToolRegistry`; added to `SAFE_TOOL_NAMES` (max-six whitelist becomes seven). `requiresReminderPermission: false` — a read tool; no reminder permission needed to see the ranking.

```
input:
  limit?: integer 1..10 (default 10)   // keep page small for the model context
  search?: string                      // optional customer-name / invoice-number filter
```

Output per item:

```typescript
interface RankedReceivable {
  receivableId: string;      // internal — never shown to the user by the model
  customerId: string;        // so the model can chain getReceivableSummary / getPaymentHistory
  customerName: string;
  invoiceNumber: string | null;
  remainingAmount: number;   // integer VND
  dueDate: string;           // ISO-8601
  riskScore: number;         // 0..100
  riskBand: 'HIGH' | 'MEDIUM' | 'LOW';
  reasons: Array<{ code: RiskReasonCode; message: string }>; // message in Vietnamese
}
interface RankResult { items: RankedReceivable[] }
```

No `hasMore`/`nextCursor` — ranking is single-shot by design. `ponytail:` fixed top-N, no paging; add a risk cursor only if ranking pages are ever needed.

**Scope of candidates** — open receivables (`status IN ('OPEN','PARTIALLY_PAID')`) that are either already overdue (`dueDate < now`) or due within the next 7 days in `Asia/Ho_Chi_Minh`. This covers "sắp trễ nợ" (about to be late) as well as already-late; otherwise the new tool would duplicate `findOverdueReceivables`.

## 3. Scoring model (deterministic, code-only)

Signals, all computed in code from data reachable through existing ports. Total capped at 100.

| Signal | Source port | Max points | Rule |
|---|---|---|---|
| Overdue depth | `IReceivableRepository.findOverdueCandidates` (candidate set) + `dueDate` | 30 | `min(30, floor(daysOverdue / 3))`; 0 for not-yet-due items |
| Open dispute | `IDisputeRepository.findOpenDisputesByReceivableIds` | 20 | 20 if a receivable has an open dispute, else 0 |
| Reminder fatigue | `IReminderExecutionRepository.findLatestSentByReceivableIds` | 15 | 5 points if the port returns a prior `SENT` execution for the receivable, else 0. The port exposes only the latest execution, so the observable count is 0 or 1; `min(15, sentCount * 5)` collapses to 0/5. `ponytail:` upgrade to a count query if per-send fatigue granularity is ever needed. |
| Late-payment history | `IPaymentAllocationRepository.findByCustomerIds` | 20 | `min(20, floor(latePaymentRatio * 20))`; "late" = allocation's `allocatedAt` after the matched receivable's `dueDate`. Needs `IReceivableRepository.findByIds` for the allocated receivables' due dates. |
| Unusually large balance | receivable `remainingAmount` | 15 | 15 if `remainingAmount > 3 * customerMedianRemaining`, else proportional `min(15, floor(ratio * 5))`; median over the customer's open receivables via `IReceivableRepository.findOpenByCustomerIds` |

Bands: `HIGH >= 60`, `MEDIUM 30..59`, `LOW < 30`.

`reasons` entries are emitted only for fired signals, each carrying a stable `code` (`OVERDUE_DEPTH`, `OPEN_DISPUTE`, `REMINDER_FATIGUE`, `LATE_PAYMENT_HISTORY`, `LARGE_BALANCE`) and a fixed Vietnamese `message` string (no monetary amounts computed by the model). The model paraphrases these; it never invents a score or a reason.

All money is integer VND. `riskScore` is a unitless integer. No rounding of amounts.

**Batch access, no N+1** — fetch each signal once for the whole candidate set:
- disputes: one `findOpenDisputesByReceivableIds(ids)`;
- reminders: one `findLatestSentByReceivableIds(ids)`;
- payment history: one `IPaymentAllocationRepository.findByCustomerIds(customerIds, limit)` for every distinct customer in the candidate set, then one `findByIds` for the allocated receivables;
- open-receivable medians for the LARGE_BALANCE signal: one `IReceivableRepository.findOpenByCustomerIds(customerIds)` for every distinct customer, grouped in memory.

All ports are tenant-scoped internally via `TenantContextService`; the tool passes the organization id only where the port signature requires it. The two new batch repository methods (`findByCustomerIds`, `findOpenByCustomerIds`) keep the same tenant scoping as the existing methods — `TenantContextService` in `TypeOrmPaymentAllocationRepository`, `BaseRepository.scopedFindMany` in `TypeOrmReceivableRepository` — and add no new `organizationId` handling in the tool.

## 4. Data flow inside the copilot turn

1. User asks "khoản nào sắp trễ nợ / ưu tiên nhắc trước?".
2. Model calls `rankReceivablesByRisk` (read-only).
3. Tool builds the candidate set, gathers signals in batches, scores, sorts by `riskScore DESC` then `dueDate ASC`, returns top-N.
4. Model reads `riskScore`/`riskBand`/`reasons[]` and writes a Vietnamese answer. System prompt gains one line: use `rankReceivablesByRisk` for risk/priority/"sắp trễ" questions; keep the existing ban on exposing UUIDs, tool names, schema field names, and fabricated data.
5. To act, model calls `draftReminderEmail` then `sendReminderEmail` as today → pending action → user confirms → `ConfirmPendingActionUseCase` sends. No change to that path.
6. `MAX_TOOL_ITERATIONS` stays 5; the new tool adds at most one call before drafting.

## 5. Wiring (existing patterns only)

- `application/tools/rank-receivables-by-risk.tool.ts` — `@Injectable()` tool; injects `RECEIVABLE_REPOSITORY`, `DISPUTE_REPOSITORY`, `PAYMENT_ALLOCATION_REPOSITORY`, `REMINDER_EXECUTION_REPOSITORY`, `TenantContextService`, plus customer/invoice repos for names — all ports, no infrastructure imports.
- `copilot-tool-registry.ts` — add the tool name to `SAFE_TOOL_NAMES`; no other registry logic changes.
- `copilot.module.ts` — add one `registry.register(...)` entry in `copilotToolRegistryFactory()` and one provider. Add `DisputesModule` to imports to obtain `DISPUTE_REPOSITORY` (already exported by that module). `REMINDER_EXECUTION_REPOSITORY` is already available via the imported `CommonTokensModule`; `PAYMENT_ALLOCATION_REPOSITORY` via `PaymentsModule`; receivable/customer/invoice repos via their existing module imports.
- `copilot-chat.usecase.ts` — inject the new tool in the tool-call dispatch switch and add the one system-prompt line. No changes to the ReAct loop, token limits, or pending-action handling.

Domain/application boundary: the tool lives in `application/` and depends only on ports and the domain — no `@nestjs/common` exceptions other than `@Injectable()`/`@Inject()`, no concrete SDK, no infrastructure import, no cross-module infrastructure import.

## 6. Error handling

- Invalid `limit` → `AppError(VALIDATION_ERROR, ...)`, same pattern as `FindOverdueReceivablesTool`.
- Missing or empty candidate set → `{ items: [] }`, no error.
- A signal port failing → propagate through the existing `toToolErrorPayload()` path; the model summarizes in Vietnamese without leaking the provider error. No partial-score output.
- No new `ErrorCode` values; no change to `status-by-error-code.ts`.

## 7. Testing (TDD — RED before GREEN)

**Unit — `rank-receivables-by-risk.tool.spec.ts`**
- Deterministic: same fixtures → identical scores; stable tie-break (`riskScore DESC`, `dueDate ASC`).
- Each signal on/off changes the score by exactly its documented points; score capped at 100.
- Band boundaries: 59→MEDIUM, 60→HIGH, 29→LOW, 30→MEDIUM.
- Empty candidate set → empty `items`, no port calls.
- Batch access: disputes called once, reminder executions called once, payment history and open-receivable medians each called once for all distinct customers — never once per customer or per receivable.
- Tenant: candidate query uses the context organization id.

**Unit — `copilot-chat.usecase.spec.ts`**
- Tool registry exposes `rankReceivablesByRisk`.
- Tool call to the new name routes to the tool and its result reaches the model.
- System prompt contains the ranking guidance.

**Unit — `copilot-tool-registry.spec.ts`**
- New name accepted; an unknown name still throws `AppError`.

No e2e test: no HTTP contract, no schema/migration change. Existing copilot e2e continues to cover the chat path.

## 8. Verification

1. Focused Jest suites (tool, copilot-chat, registry) — green.
2. `pnpm verify` (lint + type-check + full unit suite) — green.
3. `/domain-check` after the backend change — no violations.
4. Confirm no new migration and no change to `findOverdueReceivables` / pending-action tests.

## 9. Deliberate simplifications / ceilings

- Fixed weights, no learning. If weights need tuning later, move them to config — not now.
- "Late payment history" matches allocations to receivable due dates via one batch lookup; it approximates "this customer tends to pay late" and can mislabel partial payments. Acceptable for a ranking hint, not a billing decision.
- Candidate window is fixed at 7 days; no dynamic horizon.
- Ranking is single-shot top-N; no cursor.
