# Copilot chat: streaming + conversation history + xcash-pattern layout

Status: approved for planning
Date: 2026-08-18
Related repos: `E:\xcash-ai` (apps/frontend/src/{pages/copilot,components/copilot,hooks/useCopilot*}) — reference pattern only, not shared code (different stack: React+shadcn here too, so tokens map directly).

## Goal

Bring `apps/frontend/src/features/copilot` closer to the xcash-ai Copilot UX pattern:
sidebar with conversation history, avatar + bubble message layout, a welcome state,
and a streamed (token-by-token) final answer with a stop button — while keeping
casso-ledger's own design tokens (shadcn `bg-primary`/`bg-muted`/etc., not xcash's
palette) and its existing Tabs (`Chat` / `Drafts`) structure unchanged.

## Non-goals

- Do not stream intermediate tool-calling turns individually (no per-tool source
  chips like xcash's `CopilotSourceChips`) — out of scope for v1 (see Approach B,
  rejected).
- Do not change the Drafts tab or its layout.
- Do not add multi-tenant conversation sharing, conversation search, or conversation
  deletion — xcash has these but they were not requested here.

## Current state (baseline)

- Backend `copilot` module: `POST /copilot/conversations/:id/messages` — single
  request/response, no streaming, no conversation listing. `IAIChatProvider` port
  has only `createChatCompletion` (non-streaming OpenAI SDK call).
- `CopilotChatUseCase` runs a tool-calling loop (max 5 iterations) against the model;
  only the last, no-tool-calls response is meant for the user.
- `CopilotConversationOrmEntity` has no `title` column and the repository has no
  "list conversations for a user" method. The frontend generates one random
  `conversationId` per page load (`crypto.randomUUID()`) and never lists or resumes
  past conversations.
- Frontend `CopilotPage`: `Tabs` with `chat`/`drafts`, plain bordered scroll box,
  flat `MessageList` (no avatar, no streaming, no welcome state).

## Design

### 1. Backend — streaming the final answer

- Extend `IAIChatProvider` (`application/ai-chat-provider.port.ts`) with:
  ```ts
  interface AIStreamChunk {
    contentDelta: string | null;
    toolCalls: AIToolCall[] | null; // only populated on the final chunk, if any
    inputTokens: number | null;     // only populated on the final chunk
    outputTokens: number | null;    // only populated on the final chunk
  }
  interface IAIChatProvider {
    createChatCompletion(...): Promise<AIChatCompletionResult>; // unchanged, still used for tool-iteration turns
    streamChatCompletion(messages, tools): AsyncIterable<AIStreamChunk>;
  }
  ```
- `OpenAiChatProviderAdapter.streamChatCompletion` calls
  `client.chat.completions.create({ ..., stream: true })` and yields a chunk per
  SDK stream event, accumulating `tool_calls` deltas and emitting them (plus usage,
  if available from the final chunk) only once the stream ends.
- `CopilotChatUseCase.execute` keeps its existing tool-calling loop
  (`callModelWithRetry`, unchanged, non-streaming) for every iteration that still
  needs a tool call. Add a new method, `executeStreaming`, used by the new
  controller endpoint: it runs the same loop, but the *iteration whose response has
  no `toolCalls`* uses `streamChatCompletion` instead of `createChatCompletion`, and
  yields `contentDelta` chunks through the use case's return type (an async
  generator or callback) so the controller can forward them as SSE `delta` events.
  Tool-iteration turns before that point still just yield a single `status` chunk
  (e.g. `"Đang xử lý…"`), not per-tool detail (per Non-goals).
  The DB write (`appendMessage`) happens once, after the stream completes, inside
  the same transactional pattern already used for the non-streaming path.
- New controller endpoint: `POST /copilot/conversations/:id/messages/stream`
  (`text/event-stream`, same guards/permissions/rate-limit/idempotency as the
  existing `postMessage`). SSE event types: `status` (text), `delta` (text chunk),
  `done` (final `CopilotChatResponseDto` — same shape the non-streaming endpoint
  returns), `error` (error code + message, mirrors `AppError`).
  The existing non-streaming `POST /copilot/conversations/:id/messages` is left
  untouched (still used by, e.g., `reopenDraft` flows if any depend on it).
- `AI_USAGE_LOG_REPOSITORY` logging: log once per turn same as today (on the final
  chunk of the streaming call), not per delta.

### 2. Backend — conversation history

- Migration: add nullable `title varchar` to `copilot_conversations`.
- `ICopilotConversationRepository` gains:
  ```ts
  listByUser(userId: string, page: number, limit: number): Promise<{ items: CopilotConversationSummary[]; total: number }>
  ```
  where `CopilotConversationSummary` includes `id`, `title`, `createdAt`,
  `lastMessageAt` (derived via a join/subquery on `copilot_messages`, not stored).
- Title is set once, at `findOrCreate` time, from the first ~40 chars of the first
  user message (truncate on a word boundary, ellipsis) — no separate rename
  endpoint (out of scope, unlike xcash's rename feature).
- New endpoints on `CopilotController`:
  - `GET /copilot/conversations` — list, paginated, `RequirePermission(RECEIVABLE_READ)`.
  - `GET /copilot/conversations/:id/messages` — full message history for one
    conversation (reuses `conversationRepo.listMessages`, wrapped in a DTO), same
    permission, 403 if `conversation.userId !== currentUser.userId` (matches the
    existing ownership check in `CopilotChatUseCase.execute`).

### 3. Frontend — layout

- `CopilotPage`: within the `chat` tab content, split into a collapsible sidebar
  (`CopilotHistorySidebar`, desktop: fixed column with a collapse toggle; mobile:
  `Sheet` from the left, reusing `@/components/ui/sheet` already in the repo) and
  the chat column. The `Drafts` tab is untouched (still a full-width `TabsContent`,
  no sidebar).
- New components under `features/copilot/components/`:
  - `copilot-welcome-state.tsx` — shown when the active conversation has zero
    messages; replaces the current "Hỏi Copilot về công nợ..." paragraph.
  - `copilot-message-bubble.tsx` — replaces the inline mapping in `message-list.tsx`;
    user bubble unchanged visually (`bg-primary`/`rounded-tr-none`), assistant gets
    a small bot-icon avatar (`lucide-react` `Bot`), and renders a blinking-cursor
    span while `isStreaming`.
  - `copilot-history-sidebar.tsx` — lists conversations from the new `GET
    /copilot/conversations`, highlights the active one, "New chat" button.
- `use-copilot.ts` (`useCopilotChat`) changes:
  - `send()` now calls the new streaming endpoint via `fetch` + a `ReadableStream`
    reader (browser `EventSource` doesn't support POST bodies, so use `fetch` with
    manual SSE line-parsing — this repo doesn't use `EventSource` elsewhere, so no
    existing helper to reuse). Track `streamingContent` and append the final
    message once `done` arrives.
  - Add `stop()` — aborts the in-flight fetch via `AbortController`; the partial
    text already streamed is kept in the transcript, marked (same idea as xcash's
    "Đã dừng").
  - Add a second hook, `useCopilotConversations()`, wrapping the list/switch API
    calls and holding `activeConversationId`.
- Design tokens: reuse existing shadcn classes already used in this file
  (`bg-primary`, `bg-muted`, `text-primary-foreground`, `border`, `text-muted-foreground`)
  — do not port xcash's own hex/token values.

## Data flow (streaming request)

1. User submits → FE POSTs to `/copilot/conversations/:id/messages/stream` with
   `fetch`, reads the response body as a stream, parses SSE lines.
2. Backend: `CopilotChatUseCase.executeStreaming` persists the user message (same
   transaction as today), runs the tool loop; each non-final iteration emits one
   `status` SSE event; the final iteration streams `delta` events as OpenAI returns
   them; at stream end, the assistant message (and pending action, if a
   `sendReminderEmail` call was proposed) is persisted and a `done` event is sent
   with the full `CopilotChatResponseDto`.
3. FE appends deltas into `streamingContent` live; on `done`, replaces it with the
   final persisted message (so IDs/timestamps match the DB) and clears
   `streamingContent`.
4. On abort (`stop()`), FE closes the reader; backend request handler detects the
   client disconnect (Express `req.on('close')`) and stops iterating further
   `delta`s but still persists whatever partial content and pending action were
   produced up to that point, same as `done` would, so a retry/continue is possible
   later — mirrors xcash's `isPartial` message flag.

## Error handling

- Any `AppError` thrown mid-stream (rate limit, plan limit, model timeout after
  retry, tool failure that isn't caught by the per-tool `.catch`) is sent as a
  single `error` SSE event (`{ errorCode, message }`) and the connection ends; FE
  shows the existing `toast.error` pattern, no partial assistant message is
  persisted in that case (mirrors current non-streaming error behavior — nothing
  is saved if `execute()` throws before returning).
- SSE `error` events use the same `ErrorCode` enum as the rest of the API for
  consistency, even though there's no HTTP status code to carry it once the stream
  has started (response headers are already sent as `200 text/event-stream`).

## Testing

- Backend: unit test `OpenAiChatProviderAdapter.streamChatCompletion` chunk
  accumulation (RED test first: assert deltas emitted, tool_calls only on final
  chunk). Unit test `CopilotChatUseCase.executeStreaming` — tool-loop iterations
  unchanged from `execute`'s existing spec coverage; new coverage for: streaming
  only the last iteration, persisting after stream end, abort mid-stream still
  persists partial content. `*.e2e-spec.ts` for the new endpoints
  (`GET /copilot/conversations`, `GET /copilot/conversations/:id/messages`,
  `POST .../messages/stream`) covering tenant isolation (403 on
  cross-user/cross-org conversation access) and idempotency-key reuse.
- Frontend: `copilot-page.spec.tsx` (existing, extend) — welcome state renders with
  no messages; sidebar lists conversations and switches `activeConversationId`;
  `use-copilot.spec` (new) — streaming delta accumulation, stop() aborts and keeps
  partial content, done event replaces streamingContent with persisted message.

## Migration / rollout

- One new TypeORM migration: add `title` column to `copilot_conversations` (nullable,
  backfill not required — existing rows show a title derived at read time as a
  fallback, e.g. "Cuộc trò chuyện" + date, only for rows created before this
  change).
