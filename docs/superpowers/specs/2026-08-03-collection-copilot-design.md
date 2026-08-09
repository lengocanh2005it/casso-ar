# Collection Copilot (AI Agent) Design

> Child spec of [docs/overview.md](../../../docs/overview.md), dependent on [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md) and [2026-08-03-reminder-automation-design.md](2026-08-03-reminder-automation-design.md) (email sending reuses the existing EmailService/EmailTemplate).

## 0. Scope note compared with the original document

The original document (section 8.4) recommends *not* building a "general chatbot" or complex agent within the demo scope. This spec **deliberately expands** it as requested: a chat Copilot that lets accounting ask free-form questions about receivables, with a tool-calling model (including one action tool: send a reminder email), rather than the two fixed actions in the original. To preserve the original guardrail principle (AI must not decide risky financial operations), write actions are strictly limited in section 3.

## 1. Copilot chat architecture & tool whitelist

```
CollectionCopilotAgent
  tools (read-only):
    getReceivableSummary(customerId)          → precomputed structured data (not raw DB)
    getCollectionActivityTimeline(customerId, limit)
    getPaymentHistory(customerId, limit)
  tools (action, confirmation required):
    draftReminderEmail(receivableId, tone?)    → create draft, DO NOT send
    sendReminderEmail({ draftId, receivableId }) → proposal only; the confirm endpoint actually sends
```

Read tools return only **structured data precomputed by the backend** (for example, `totalOutstanding`, `maxOverdueDays`, `averageLateDays`, not raw SQL rows), preserving the original principle: AI explains the data in prose and does not calculate monetary amounts itself.

### Single-chat-turn processing loop

```
1. User message → Agent (model + tool definitions above)
2. Model may call 0..N read tools to gather context before responding
3. If the model wants to execute sendReminderEmail → DO NOT run it immediately,
   return a "pending action" for the UI to display as a confirmation card (Confirm / Cancel)
4. User clicks "Confirm" → FE calls POST /api/v1/copilot/actions/:actionId/confirm
   → backend creates ReminderExecution and calls EmailService (does NOT go through the model again)
5. User clicks "Cancel" → FE calls POST /api/v1/copilot/actions/:actionId/cancel
   → backend changes the pending action to CANCELLED, does not create an execution, and does not send email
```

Key point: the write action (`sendReminderEmail`) never runs in the same model call—the model only proposes it, and a separate confirmation endpoint (pure code, no LLM) executes it. This preserves the rule that "AI only creates drafts/proposals; the user approves before sending" even though the interface is free-form chat.

The `sendReminderEmail({ draftId, receivableId })` above is the model-facing tool contract. On confirmation, the backend resolves `draftId`, uses `receivableId` from the payload to create `ReminderExecution(reminderRuleId=null, status=PENDING)`, creates an `EmailTemplate`, then calls EmailService using the standard contract `sendReminderEmail({ receivableId, templateId, reminderExecutionId })`; these are not two signatures of the same service.

## 1.1. HTTP contracts

The backend uses the global prefix `/api/v1`; `/health` and `/metrics` are process-level probes outside the prefix.

```typescript
interface CopilotMessageDto {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
}

interface CopilotPendingActionDto {
  id: string;
  actionType: 'SEND_REMINDER_EMAIL';
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
  payload: { draftId: string; receivableId: string };
  createdAt: string;
  resolvedAt: string | null;
}

interface CopilotTurnResponseDto {
  message: CopilotMessageDto;
  pendingAction: CopilotPendingActionDto | null;
}

interface CopilotActionResponseDto {
  action: CopilotPendingActionDto;
  reminderExecutionId?: string;
}
```

`POST /api/v1/copilot/conversations/:id/messages` returns `CopilotTurnResponseDto`; the two confirm/cancel endpoints return `CopilotActionResponseDto`. The FE uses these DTOs exactly and does not accept `message` as a string or a payload missing `receivableId`.

## 2. Action whitelist

Only **sending a reminder email** may be executed through chat (after confirmation):
- Low risk and does not change financial state (`Receivable`/`Payment`/`PaymentAllocation`).
- More sensitive actions—write-off, payment allocation, and disputes—**must always be performed through the normal UI**. No tool lets Copilot call these actions, even after confirmation. This is a hard boundary and must not be expanded without a separate decision.

## 3. Entities

```
CopilotConversation
  id, organizationId, userId, customerId (nullable — may ask general questions),
  createdAt

CopilotMessage
  id, conversationId, role (USER/ASSISTANT/TOOL), content,
  toolCalls (jsonb, nullable), createdAt

CopilotPendingAction
  id, conversationId, actionType (SEND_REMINDER_EMAIL),
  payload (jsonb — e.g. { draftId, receivableId }),
  status (PENDING/CONFIRMED/CANCELLED/EXPIRED),
  createdAt, resolvedAt, resolvedByUserId

AIUsageLog
  id, organizationId, conversationId, model, promptVersion,
  inputTokens, outputTokens, latencyMs, toolCallsCount, createdAt
```

## 4. Required guardrails

```
- Timeout: each model call has a hard timeout (e.g. 15s); on timeout → return an error to the UI,
  with at most 1 automatic retry and no infinite retries.
- Structured output: tools return JSON with a validated schema, not raw SQL results directly to the model.
- CopilotPendingAction expires after N minutes (e.g. 10 minutes) if unresolved
  → status=EXPIRED; late confirm/cancel requests are rejected and do not create an execution.
- Every request to the model is recorded in AIUsageLog (model, prompt version, tokens, latency) for cost auditing
  — without exception; errors/timeouts are logged too.
- Do not put the BankConnection accessToken or any sensitive credential into the prompt or tool response.
- Every data-reading tool returns results only within the current user's organizationId scope
  (apply the BaseRepository/tenant context from the Multi-tenancy spec — see
  [2026-08-03-multi-tenancy-rbac-design.md](2026-08-03-multi-tenancy-rbac-design.md)).
- Only users with Permission.REMINDER_SEND_MANUAL can see/activate the sendReminderEmail action in chat.
```

## 5. Out of scope

- Any write tool other than sending reminder emails (write-off, allocation, dispute)—a fixed hard boundary that cannot expand without a separate user decision.
- Indefinite storage or summarization of long multi-turn conversations—not needed in the MVP.
- Complex ML cash-flow forecasting—out of scope (section 8.4 of the original document).

## 6. Resolved decisions (2026-08-09, grilling session)

- **Model provider**: OpenAI-compatible Chat Completions API via the `openai` npm SDK, `baseURL` configurable via env var (`AI_PROVIDER_BASE_URL`, `AI_PROVIDER_API_KEY`, `AI_PROVIDER_MODEL`) so the same code targets OpenAI directly or an OpenAI-compatible gateway (e.g. OpenRouter) without a branching adapter. MVP default: OpenRouter, model `gpt-4o-mini`. `CopilotChatUseCase` (application layer) depends on a new `IAIChatProvider` port; the concrete OpenAI-SDK client lives in `infrastructure/` — the SDK must never be imported directly into `application/` (matches the `ITokenSigner` pattern already used for JWT signing).
- **Tool-calling shape**: OpenAI's Chat Completions tool-calling contract, not Anthropic's — `tools: [{ type: 'function', function: { name, description, parameters } }]`, `tool_choice: 'auto'`; a response's `choices[0].message.tool_calls` (array of `{ id, function: { name, arguments: <JSON string> } }`) replaces Anthropic's `content` array of `tool_use` blocks. The agent loop is a standard multi-round ReAct loop (ask → the model decides 0..N tool calls → execute → feed `role: 'tool'` results back → repeat) up to `MAX_TOOL_ITERATIONS`, not a single hard-coded tool call. `gpt-4o-mini` has no separate reasoning/"thinking" trace to surface (unlike o-series or Claude extended thinking) — the loop itself, not a reasoning trace, is the agent's "thinking."
- **`sendReminderEmail` interception**: unchanged in spirit — a response containing a `tool_calls` entry named `sendReminderEmail` halts the loop immediately (no `tool` role result is ever appended for it, and no further model call happens in this turn); other tool calls in the same response (if the model batched them) are still executed and their results appended, but the turn still ends at the pending-action return, matching section 1's "Key point."
- **`CopilotPendingAction` expiry**: simply disappears from the UI / becomes uninteractable (confirm/cancel both reject with `CONFLICT` after expiry) — no separate notification. Consistent with this being a low-stakes, easily-redraftable action (the user just asks Copilot to draft again).
- **Usage limiting**: chat turns ARE gated by Billing/Usage Metering, following the exact same pattern as `PlanLimitService.enforceReceivableLimit` — one FREE-plan field `copilotChatMonthlyLimit = 50` (1 "turn" = 1 user message sent, counted via `AIUsageLog`/`CopilotMessage` rows in the current billing period, not per underlying model call — a turn's tool loop may call the model 1-5 times, an internal detail that must not leak into the user-facing quota). Enforced inside a short DB transaction wrapping only the limit check + persisting the user's message — never around the model call itself (external API calls must never run inside a DB transaction, per this repo's transaction-scope rule).
