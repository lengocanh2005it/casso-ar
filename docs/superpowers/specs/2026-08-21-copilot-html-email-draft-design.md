# Copilot HTML email draft with preview/code toggle — Design

- **Issue:** [#300](https://github.com/lengocanh2005it/casso-ledger/issues/300)
- **Date:** 2026-08-21
- **Status:** Approved for planning

## Context

Copilot can already draft a payment-reminder email via the `draftReminderEmail`
tool, but `subject`/`bodyHtml` are built from a fixed Vietnamese template
string interpolated with customer/receivable data
(`apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.ts`).
The frontend Drafts tab (`drafts-list.tsx`) only shows the subject and
recipient — never the HTML body — and the chat message list has no rendering
for the email content at all.

This design replaces the fixed template with Copilot-authored HTML (the LLM
writes `subject`/`bodyHtml` as tool-call arguments) and adds a shared
Preview/HTML-code card, sandboxed against AI-generated markup, reused in both
the chat flow and the Drafts tab.

## Goals

- Copilot (the LLM), not a template, authors the email `subject`/`bodyHtml`.
- `recipientEmail` is still derived server-side from the receivable's
  customer — never trusted from the model.
- AI-generated HTML is sanitized before persistence and rendered in a
  sandboxed preview; the HTML-source view is text-escaped with a copy button.
- The draft card appears inline in chat for *every* turn that produces a
  draft, not only turns that also propose sending.
- No change to the manual-send confirmation flow, tenant isolation,
  permission checks (`REMINDER_SEND_MANUAL`), or plan limits.

## Non-goals

- Rich WYSIWYG editing of the HTML body (edit dialog stays a plain textarea).
- Supporting tools other than `draftReminderEmail` returning inline chat
  cards (out of scope for this issue).
- Retroactively backfilling `drafts` onto historical messages saved before
  this change (old `toolCalls` rows have no `output`; those turns simply
  render without a card, exactly as they do today).

## Backend design

### 1. Tool schema and execution — `draft-reminder-email.tool.ts`

`DRAFT_REMINDER_EMAIL_SCHEMA` gains two required properties:

```ts
subject:  { type: 'string', maxLength: 200,   description: '...' }
bodyHtml: { type: 'string', maxLength: 20000, description: '...' }
```

`DraftReminderEmailTool.execute()`:
- Keeps its existing `receivableId` → `receivable` → `customer` lookups
  (tenant checks unchanged) to derive `recipientEmail` — the model never
  supplies it.
- Validates `subject`/`bodyHtml` are present and within length via a
  `requiredString`-style guard (schema `maxLength` is a hint to the model,
  not an enforced constraint — model output can't be trusted to obey it).
- Runs `bodyHtml` through the new shared `sanitizeEmailHtml()` before
  building the `DraftReminderEmailResult` and before `draftRepo.save()`.
- Drops the `formatVnd`/tone-based template branches and the old
  `escapeHtml` helper (superseded by sanitization of the full body — the
  model interpolates customer name/amount itself now).

### 2. Shared sanitizer — `sanitize-email-html.ts`

New file under `apps/backend/src/modules/copilot/application/` (pure
function, domain-safe — no NestJS/TypeORM import needed, but lives in
`application/` alongside its two callers since it's a copilot-module
concern, not shared across modules):

```ts
export function sanitizeEmailHtml(html: string): string
```

Backed by `sanitize-html` (new dependency — actively maintained, does
exactly this, no existing package in the repo covers it). Allowlist: common
email-safe tags (`p`, `br`, `strong`, `em`, `ul`, `ol`, `li`, `a`, `table`,
`thead`, `tbody`, `tr`, `td`, `th`, `h1`-`h3`, `span`, `div`), `a[href]`
restricted to `http`/`https`/`mailto` schemes, no `on*` attributes, no
`<script>`/`<style>`/`<iframe>`.

Called from both write paths:
- `DraftReminderEmailTool.execute()` (AI-authored HTML).
- `UpdateCopilotDraftUseCase.execute()` (user-edited HTML via
  `DraftEditDialog`) — same rendering surface, same risk, one sanitizer.

### 3. System prompt — `copilot-chat.usecase.ts`

`SYSTEM_PROMPT` gains one instruction: before calling `draftReminderEmail`,
the model must have the receivable's real remaining amount/due date from a
read tool (`getReceivableSummary` or prior conversation context) and must
not invent figures in the email body — extending the existing "only answer
from tool JSON" rule to cover drafted content. This is a soft (prompt-level)
constraint, not enforced in code — consistent with the fact that a draft is
never auto-sent; the user reviews/edits/confirms before anything goes out.

### 4. Persisting draft output on the message — `conversation-repository.port.ts` / `copilot-chat.usecase.ts`

`CopilotMessageRecord.toolCalls` element type gains an `output: unknown`
field:

```ts
toolCalls: Array<{ id: string; name: string; input: unknown; output: unknown }> | null
```

No migration needed — `toolCalls` is already a JSONB column; existing rows
without `output` just deserialize with `output: undefined`.

In `CopilotChatUseCase`, both the non-streaming `execute()` and the
streaming `executeStreaming()` currently persist `toolCalls` only on the
turn-ending message (the `sendCall` branch and the no-more-tool-calls
branch) — intermediate tool-only iterations aren't persisted as a message at
all. That's unchanged; the fix is that whichever branch *does* persist the
message must attach each tool call's already-computed result as `output`.
Concretely: the code already computes `toolResults` (array of `{id, result}`)
before looping again — thread that array through so the final
`appendMessage` call's `toolCalls` includes `output: result` per call,
sourced from whichever iteration produced it. `draftReminderEmail` results
end up attached to whichever assistant message finally gets saved for that
turn (the normal chained-with-send case attaches to the send-proposal
message already; the new "draft only, no send" case attaches to the
final-answer message).

### 5. Response DTO — `copilot-response.dto.ts`

`CopilotMessageDto` gains `drafts: CopilotDraftDto[]`. `toCopilotMessageDto`
filters `message.toolCalls` for `name === 'draftReminderEmail'`, maps each
`output` (shape: `DraftReminderEmailResult`) to a `CopilotDraftDto`-like
object. Since a freshly-created draft has no `status`/`pendingActionId` yet
at the moment the tool ran, those fields default to `'DRAFTED'` and `null`
respectively (matches `derive-draft-status.ts`'s definition of a brand-new
draft with no pending action). No raw `toolCalls` (input/output of
non-draft tools) is exposed — only the filtered `drafts` array.

## Frontend design

### 1. Shared component — `email-draft-preview.tsx`

```tsx
function EmailDraftPreview({ subject, recipientEmail, bodyHtml }: {
  subject: string; recipientEmail: string; bodyHtml: string;
}): JSX.Element
```

- Local state: `mode: 'preview' | 'code'` (shadcn `Tabs` or a two-button
  toggle, consistent with the repo's existing `Tabs` usage in
  `copilot-page.tsx`).
- **Preview**: `<iframe sandbox="" srcDoc={bodyHtml} />` — empty `sandbox`
  disallows scripts, forms, popups, and same-origin access; this is the
  primary XSS defense on the render side, on top of backend sanitization
  (defense in depth per Q3/Q4).
- **HTML code**: `<pre><code>{bodyHtml}</code></pre>` — JSX text content is
  escaped by React automatically, satisfying "HTML source is escaped when
  displayed."
- Copy button: `navigator.clipboard.writeText(bodyHtml)` + toast, following
  the existing `toast.success`/`toast.error` pattern used elsewhere in this
  feature.

### 2. Types — `types.ts`

`CopilotMessage` gains `drafts?: CopilotDraft[]`.

### 3. `message-list.tsx`

For each assistant message with a non-empty `drafts` array, render an
`EmailDraftPreview` per draft below the message bubble.

### 4. `drafts-list.tsx`

Replace the subject/recipient-only header with `EmailDraftPreview` (passing
`draft.subject`, `draft.recipientEmail`, `draft.bodyHtml`), keeping the
existing action buttons (Confirm/Reopen/Sửa/Xóa) below it unchanged.

## Data flow (end to end)

1. User: "Draft a payment reminder for invoice X."
2. Model calls `getReceivableSummary` (real numbers) → then calls
   `draftReminderEmail` with `{ receivableId, tone?, subject, bodyHtml }`.
3. Tool re-derives `recipientEmail` from the customer record, sanitizes
   `bodyHtml`, persists a `CopilotDraft` row, returns
   `{ draftId, receivableId, recipientEmail, subject, bodyHtml }`.
4. `CopilotChatUseCase` attaches that result as `output` on the
   `draftReminderEmail` entry of whichever message ends the turn.
5. `toCopilotMessageDto` surfaces it as `message.drafts[0]`.
6. Frontend renders `EmailDraftPreview` under the assistant's message —
   Preview tab (sandboxed iframe) or HTML-code tab (escaped, copyable).
7. If the model also proposed `sendReminderEmail` in the same turn, the
   existing `PendingActionCard` still appears below, and the existing manual
   confirm flow sends the email — untouched by this change.

## Testing (TDD per module rule)

**Backend** (RED → GREEN per case):
- `sanitize-email-html.spec.ts`: strips `<script>`, `onerror=`,
  `javascript:` href; keeps allowlisted tags/attributes.
- `draft-reminder-email.tool.spec.ts`: rejects missing/oversized
  `subject`/`bodyHtml`; sanitizes before save; still derives
  `recipientEmail` from customer record regardless of any model-supplied
  value (schema no longer accepts one, but guard against a manually
  malformed tool-call payload in tests); still tenant/not-found checks as
  today.
- `update-copilot-draft.usecase.spec.ts`: sanitizes `bodyHtml` on manual
  edit.
- `copilot-chat.usecase.spec.ts`: a turn that calls `draftReminderEmail`
  without `sendReminderEmail` persists a message whose `toolCalls` include
  `output`; `copilot-response.dto.spec.ts` (or inline) confirms
  `toCopilotMessageDto` surfaces it as `drafts` and hides other tools'
  input/output.
- `copilot-drafts.e2e-spec.ts`: extend for the new schema/response shape as
  needed.

**Frontend**:
- `email-draft-preview.spec.tsx` (new): toggle switches rendered content;
  iframe `sandbox` attribute is present and empty; code view text-escapes
  (e.g. a body containing `<script>` renders as visible text, not executed);
  copy button calls clipboard API.
- `drafts-list.spec.tsx` / `message-list.spec.tsx`: extend to assert the
  card renders when `drafts`/`bodyHtml` present.

## Dependency addition

- Backend: `sanitize-html` (+ `@types/sanitize-html` if not bundled) —
  justified per `AGENTS.md` dependency rules: not already in the workspace,
  standard library can't sanitize HTML, actively maintained, small.
