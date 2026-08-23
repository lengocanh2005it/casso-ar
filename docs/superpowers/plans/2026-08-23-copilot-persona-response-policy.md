# Casso Ledger Copilot Persona and Response Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a consistent Casso Ledger Copilot identity and Vietnamese-first enterprise response policy across normal and streaming conversations.

**Architecture:** Keep the existing single `SYSTEM_PROMPT` in `CopilotChatUseCase` as the policy boundary. Both `execute()` and `executeStreaming()` already send that prompt; extend it with identity, language, tone, terminology, grounding, clarification, and user-facing safety rules without changing tool contracts or adding a response-rewriting layer.

**Tech Stack:** NestJS application use case, TypeScript, Jest, existing AI provider port, Markdown documentation.

## Global Constraints

- Keep one shared system prompt for both normal and streaming Copilot paths.
- Vietnamese is the default response language; switch to English only after an explicit user request.
- Use the exact product identity `Casso Ledger Copilot` and the approved accounts-receivable/collections purpose.
- Use a professional, neutral enterprise tone; avoid unnecessary `tôi`; prefer the approved Vietnamese domain vocabulary.
- Use only read-tool JSON and conversation facts; never invent ledger data.
- Never expose UUIDs, tool names, schema fields, raw provider errors, or implementation details in user-facing text.
- Keep internal IDs in tool payloads when required for later tool calls; do not display them.
- Missing customer/receivable context must produce a Vietnamese clarification asking for customer name or invoice number; do not guess or draft.
- Keep the prompt-only enforcement boundary; do not add an output sanitizer, new tool, repository port, dependency, or domain model.
- Increment `PROMPT_VERSION` from `copilot-v1` to `copilot-v2`.
- Follow RED → GREEN → REFACTOR and commit each completed task with a conventional commit message.

---

### Task 1: Add failing persona-policy regression tests

**Files:**
- Modify: `apps/backend/src/modules/copilot/application/copilot-chat.usecase.spec.ts` in the existing `describe('CopilotChatUseCase')` block

**Interfaces:**
- Consumes: existing `CopilotChatUseCase`, `buildDeps()`, `buildRegistry()`, and mocked `aiProvider.createChatCompletion`
- Produces: deterministic assertions over the first provider call's `role: 'system'` message; no production API changes

- [ ] **Step 1: Write the failing identity/language test**

Use the existing test constructor pattern and a mocked completion with no tool calls. Execute a greeting or English input, then inspect the first provider call:

```typescript
const messages = aiProvider.createChatCompletion.mock.calls[0][0] as Array<{
  role: string;
  content: string | null;
}>;
const systemMessage = messages.find((message) => message.role === 'system');

expect(systemMessage?.content).toContain('Casso Ledger Copilot');
expect(systemMessage?.content).toContain('Vietnamese');
expect(systemMessage?.content).toContain('only when the user explicitly asks');
```

Name the test `includes Casso Ledger identity and Vietnamese-default language policy in the system message` and use `userMessage: 'hi'` so the regression represents the acceptance criterion.

- [ ] **Step 2: Write the failing tone/safety test**

Add a second test named `includes enterprise tone, domain vocabulary, and user-facing safety policy`. Assert the system prompt contains the approved vocabulary (`công nợ`, `khoản phải thu`, `thanh toán`, `quá hạn`, `khách hàng`, `email nhắc thanh toán`), the neutral enterprise tone rule, the no-`tôi` rule, and the no-UUID/tool/schema/provider-error rule.

- [ ] **Step 3: Write the failing missing-context test**

Add a third test named `requires Vietnamese clarification before drafting without receivable context`. Assert the system prompt instructs the model to ask for a customer name or invoice number, not guess, and not create a reminder draft without real data.

- [ ] **Step 4: Run the focused tests and verify RED**

Run:

```bash
pnpm --filter @casso-ledger/backend exec jest src/modules/copilot/application/copilot-chat.usecase.spec.ts --runInBand
```

Expected: the existing suite runs, and the three new assertions fail because the current prompt has no Casso Ledger identity, Vietnamese-default policy, enterprise vocabulary/safety rules, or missing-context clarification rule.

- [ ] **Step 5: Commit the RED tests**

```bash
git add apps/backend/src/modules/copilot/application/copilot-chat.usecase.spec.ts
git commit -m "test: specify Copilot persona and response policy"
```

### Task 2: Implement the shared response policy

**Files:**
- Modify: `apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts:46-54`

**Interfaces:**
- Consumes: the failing assertions from Task 1 and the existing overdue-email safety rules
- Produces: `PROMPT_VERSION = 'copilot-v2'` and one expanded `SYSTEM_PROMPT` used by both `execute()` and `executeStreaming()`

- [ ] **Step 1: Update the prompt version**

Change:

```typescript
const PROMPT_VERSION = 'copilot-v1';
```

to:

```typescript
const PROMPT_VERSION = 'copilot-v2';
```

- [ ] **Step 2: Add the minimum policy clauses to `SYSTEM_PROMPT`**

Keep the existing reminder-confirmation, real-amount/date, overdue-result, and unsupported-operation rules. Add clauses equivalent to these, using the existing array-and-`join(' ')` style:

```typescript
'You are Casso Ledger Copilot, the Casso Ledger assistant for accounts receivable and collections. When asked who you are, identify yourself by that exact name and explain your purpose in Vietnamese.',
'Vietnamese is the default response language, including greetings and English-language input. Switch to English only when the user explicitly asks for English.',
'Use a professional, neutral enterprise tone. Avoid unnecessary first-person phrasing such as "tôi". Prefer the terms công nợ, khoản phải thu, thanh toán, quá hạn, khách hàng, and email nhắc thanh toán.',
'Use only structured JSON returned by read tools and facts already present in the conversation. Never invent customer, receivable, invoice, amount, due-date, payment-history, or recipient data.',
'If the user asks to prepare a reminder without identifying a customer or receivable, ask in Vietnamese for the customer name or invoice number; do not guess, select an arbitrary receivable, or create a draft.',
'Never expose internal UUIDs, tool names, schema field names, raw provider errors, or implementation details in user-facing text. Summarize recoverable tool errors in Vietnamese without repeating technical error messages.',
```

Do not alter tool schemas, `toToolErrorPayload`, retry behavior, or frontend code.

- [ ] **Step 3: Run the focused tests and verify GREEN**

Run:

```bash
pnpm --filter @casso-ledger/backend exec jest src/modules/copilot/application/copilot-chat.usecase.spec.ts --runInBand
```

Expected: the complete Copilot chat use-case suite passes, including all three new policy tests.

- [ ] **Step 4: Run the streaming regression suite**

Run:

```bash
pnpm --filter @casso-ledger/backend exec jest src/modules/copilot/application/copilot-chat.usecase.streaming.spec.ts --runInBand
```

Expected: all existing streaming tests pass; no second prompt or streaming-specific policy path is introduced because `executeStreaming()` already uses the shared `SYSTEM_PROMPT`.

- [ ] **Step 5: Refactor only if the tests remain green**

Keep the prompt clauses readable and grouped by identity/language, tone, grounding/safety, and existing tool rules. Do not extract a prompt builder or add a sanitizer for this issue.

- [ ] **Step 6: Commit the implementation**

```bash
git add apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts apps/backend/src/modules/copilot/application/copilot-chat.usecase.spec.ts
git commit -m "feat: establish Copilot persona and response policy"
```

## Final verification checklist

After Task 2, run from the issue worktree:

```bash
pnpm --filter @casso-ledger/backend exec jest src/modules/copilot/application/copilot-chat.usecase.spec.ts src/modules/copilot/application/copilot-chat.usecase.streaming.spec.ts --runInBand
pnpm verify
git diff --check main...HEAD
```

Run the repository `domain-check` skill because the changed file is backend code. Confirm the check reports no new money, tenant-isolation, architecture, transaction, unsafe-cast, or derived-field violations. Run `code-review` against `main` before opening the PR, and report any Docker-dependent integration limitation separately rather than claiming those tests passed.
