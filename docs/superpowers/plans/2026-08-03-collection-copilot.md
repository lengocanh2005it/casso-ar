# Collection Copilot (AI Agent) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a chat-based AI Copilot that lets an accountant ask free-form questions about receivables/customers and, after explicit in-chat confirmation, send a single kind of reminder email — nothing else. The model only ever sees pre-computed structured JSON from existing repositories (never raw DB rows) and a hardcoded, non-extensible tool whitelist. The one write-capable tool (`sendReminderEmail`) is never executed inside the model's turn — it is intercepted into a `CopilotPendingAction` and only runs from a separate, non-LLM confirm endpoint that calls the existing `EmailService.sendReminderEmail`.

**Revision note (2026-08-09, grilling session):** This plan was rewritten end-to-end after a grilling session found the original draft stale/broken against the current codebase and the user's own product decisions. Summary of what changed (details inline per task):

- **Provider swap**: `@anthropic-ai/sdk` → OpenAI-compatible `openai` SDK (MVP default: OpenRouter, model `gpt-4o-mini`, configurable via env vars), behind a new `IAIChatProvider` port so the concrete SDK never leaks into `application/` — the original plan imported `@anthropic-ai/sdk` directly into `CopilotChatUseCase`, itself a violation of `.claude/rules/application.md` independent of the provider swap.
- **Real bugs fixed before implementation**: `NotFoundException`/`BadRequestException` used directly in `application/` (3 files) instead of `AppError`; `EmailTemplate` construction missing the now-required `version` field; `DraftReminderEmailTool`'s third constructor parameter had no DI token (would crash at Nest boot); `ConfirmPendingActionUseCase` read `Repository<CopilotDraftOrmEntity>` directly via `@InjectRepository` in `application/` (zero precedent anywhere else in the codebase — grepped).
- **Real gaps fixed**: original Task 1 (`IReceivableRepository.findByCustomerId`) was redundant — `findOpenByCustomerId` already exists and covers `getReceivableSummary`'s needs, so it's dropped. `getCollectionActivityTimeline`/`getPaymentHistory` referenced fictional ports (`'COLLECTION_ACTIVITY_READ_PORT'`/`'PAYMENT_HISTORY_READ_PORT'`) that don't exist — the real `GetCustomerTimelineUseCase` has no `limit` parameter (added here) and there is no customer-scoped payment-history query anywhere in the codebase at all (added here, in the Payments module, joining `PaymentAllocation` through `Receivable.customerId`).
- **Correctness gaps fixed**: `/confirm` had a read-then-write race (two concurrent confirms could both pass the PENDING check and both call `EmailService`) — fixed with an atomic `confirmIfPending()` mirroring the already-correct `cancelIfPending()`. Neither `/confirm` nor `/cancel` was wrapped in `IdempotencyService.execute()`, unlike every other side-effecting POST endpoint in this codebase — fixed.
- **New in scope, per explicit user decision**: Copilot chat turns are now gated by Billing/Usage Metering (`PlanLimitService`), FREE plan = 50 turns/month — the spec's own "open question" on this is resolved in favor of gating, mirroring `enforceReceivableLimit` exactly.

**Architecture:** New `apps/backend/src/modules/copilot/` module (3-layer: `application`/`infrastructure`/`presentation`, no rich `domain/` — same shape as the Notifications module, since there's no business rule to encode beyond orchestration). `CopilotToolRegistry` is a hardcoded allowlist class (`SAFE_TOOL_NAMES`) that physically cannot register a tool outside that list. `CopilotChatUseCase` runs the per-turn tool loop against `IAIChatProvider` (a port; the real implementation wraps the `openai` SDK, mocked in every unit test — no test in this plan ever makes a real network call); any tool call named `sendReminderEmail` halts the loop and creates a `CopilotPendingAction` instead of executing anything. Separate `ConfirmPendingActionUseCase` and `CancelPendingActionUseCase`, reached only via `POST /api/v1/copilot/actions/:id/confirm` and `POST /api/v1/copilot/actions/:id/cancel`, are pure code — they never touch the AI provider; only the confirm path calls `EmailService.sendReminderEmail`. They reuse the REAL `EMAIL_TEMPLATE_REPOSITORY`/`REMINDER_EXECUTION_REPOSITORY` bindings already provided by the Email Template Management and Reminder Automation plans (imported into `CopilotModule` directly, no circular dependency) by creating one throwaway `EmailTemplate` row (the draft's literal composed content) and one `ReminderExecution` row (`reminderRuleId: null`, marking a manual send) before calling `EmailService` — not a parallel Copilot-owned pair of tables.

**Tech Stack:** `openai` SDK (Chat Completions API, tool-calling), NestJS 11, TypeORM 1.1, `BaseRepository`/`TenantContextService`/`PermissionGuard`/`IdempotencyService` (existing common infra), `IReceivableRepository`/`ICustomerRepository`/`ICollectionActivityRepository`/`IPaymentAllocationRepository`, `EmailService`, `PlanLimitService`, Jest + `@testcontainers/postgresql` + `@testcontainers/redis` for the integration test.

## Global Constraints

- **Hard action-whitelist boundary — quoted directly from the target spec (section 2):** *"More sensitive actions — write-off, payment allocation, dispute — must always be performed through the regular UI; no tool allows Copilot to call these actions, even after confirmation. This is a hard boundary and must not be expanded without a separate decision."* In code: `CopilotToolRegistry.SAFE_TOOL_NAMES` is a hardcoded, non-configurable array containing exactly `getReceivableSummary`, `getCollectionActivityTimeline`, `getPaymentHistory`, `draftReminderEmail`, `sendReminderEmail`. `register()` throws for any other name. There is no DI-based extensibility point, no config flag, and no code path — including confirm/cancel endpoints — that can invoke a write-off, payment-allocation, or dispute use case. This is proven by unit tests that must never be weakened or deleted.
- **The model never executes a write directly.** `sendReminderEmail` is declared to the model as a tool so it can *propose* sending, but `CopilotChatUseCase` intercepts any tool call named `sendReminderEmail` and creates a `CopilotPendingAction` instead of running anything — it never adds a tool result for it and never lets the loop continue past it. The only code path that calls `EmailService.sendReminderEmail` is `ConfirmPendingActionUseCase`, reached by `POST /api/v1/copilot/actions/:id/confirm`, which never calls the AI provider; `CancelPendingActionUseCase` only marks the action `CANCELLED`.
- **Structured data only, never raw rows.** Every read tool returns a small, pre-shaped JSON object (`totalOutstanding`, `maxOverdueDays`, `averageLateDays`, etc.) computed by application code from domain entities — never a serialized ORM row or raw SQL result.
- **Tenant scoping is automatic, not optional.** Every repository call a tool makes goes through repositories that are `BaseRepository`-backed and read `organizationId` from `TenantContextService` — no tool ever accepts or forwards an `organizationId` parameter.
- **Hard per-turn timeout, one retry, no exceptions.** Each call to the AI provider has a 15-second hard timeout; on timeout there is at most one automatic retry, then the turn fails and is reported to the caller.
- **`AIUsageLog` is written for every model call, success or failure.** No code path that calls the AI provider is allowed to skip logging.
- **`CopilotPendingAction` expires after 10 minutes.** `ConfirmPendingActionUseCase`/`CancelPendingActionUseCase` reject (and mark `EXPIRED`) any attempt on a pending action older than `PENDING_ACTION_EXPIRY_MINUTES = 10`. On expiry the action simply becomes uninteractable — no separate user notification.
- **`Permission.REMINDER_SEND_MANUAL` gates the write action, not `RECEIVABLE_READ`.** Chatting (read-only Q&A) requires `Permission.RECEIVABLE_READ`; seeing/triggering `sendReminderEmail` in chat and calling the confirm/cancel endpoints requires `Permission.REMINDER_SEND_MANUAL` — both already exist in the `Permission` enum, no new permission is added.
- **No credentials in prompts or tool responses.** No tool response, draft, or system prompt ever includes a `BankConnection` access token or any other credential.
- **No new tools beyond this plan's five**, and no dynamic/DB-driven tool registration — the whitelist is a compile-time constant, which is what makes the boundary auditable.
- **The AI SDK never leaks into `application/`.** `CopilotChatUseCase` depends only on `IAIChatProvider` (a port); the concrete `openai`-SDK-backed adapter lives in `infrastructure/`.
- **Every `application/` error is `AppError`, never a `@nestjs/common` HTTP exception class.** `RECEIVABLE_NOT_FOUND` for a missing receivable, `NOT_FOUND` for a missing customer/pending action/draft, `CONFLICT` for a pending action in the wrong state (already resolved or expired).
- **Side-effecting POST endpoints go through `IdempotencyService.execute()`**, matching every other write endpoint in this codebase — `/confirm` and `/cancel` are not exceptions.
- **Copilot chat turns are gated by `PlanLimitService`**, exactly like `enforceReceivableLimit` — FREE plan = 50 turns/month, one turn = one user message, checked+persisted inside one short transaction that never spans the AI provider call.
- Naming/layering rules (kebab-case files, PascalCase classes, `application` never imports `infrastructure` types except via ports) apply throughout.

---

## File Structure

```
apps/backend/src/
  modules/
    copilot/
      application/
        conversation-repository.port.ts
        pending-action-repository.port.ts
        draft-repository.port.ts
        ai-usage-log-repository.port.ts
        ai-chat-provider.port.ts
        copilot-tool-registry.ts
        copilot-tool-registry.spec.ts
        tools/
          get-receivable-summary.tool.ts
          get-collection-activity-timeline.tool.ts
          get-payment-history.tool.ts
          draft-reminder-email.tool.ts
          send-reminder-email.tool.ts
        copilot-chat.usecase.ts
        copilot-chat.usecase.spec.ts
        confirm-pending-action.usecase.ts
        confirm-pending-action.usecase.spec.ts
        cancel-pending-action.usecase.ts
        cancel-pending-action.usecase.spec.ts
      infrastructure/
        copilot-conversation.orm-entity.ts
        copilot-message.orm-entity.ts
        copilot-pending-action.orm-entity.ts
        copilot-draft.orm-entity.ts
        ai-usage-log.orm-entity.ts
        typeorm-copilot-conversation.repository.ts
        typeorm-copilot-pending-action.repository.ts
        typeorm-copilot-draft.repository.ts
        typeorm-ai-usage-log.repository.ts
        openai-chat-provider.adapter.ts
      presentation/
        dto/post-copilot-message.dto.ts
        dto/copilot-response.dto.ts
        copilot.controller.ts
      copilot.module.ts                                            -- imports EmailTemplatesModule, RemindersModule, NotificationsModule, BillingModule
  modules/
    collection-activity/
      application/collection-activity-repository.port.ts          -- MODIFY: findByCustomerId(customerId, limit)
      application/get-customer-timeline.usecase.ts                -- MODIFY: execute(customerId, limit)
      infrastructure/typeorm-collection-activity.repository.ts    -- MODIFY: implement limit
    payments/
      application/payment-allocation-repository.port.ts           -- MODIFY: add findByCustomerId(customerId, limit)
      infrastructure/typeorm-payment-allocation.repository.ts     -- MODIFY: implement (join through receivables)
    billing/
      domain/subscription.ts                                       -- MODIFY: add copilotChatMonthlyLimit
      application/subscription-repository.port.ts                  -- MODIFY: add countCopilotChatTurnsInPeriod
      application/plan-limit.service.ts                             -- MODIFY: add enforceCopilotChatLimit
      infrastructure/typeorm-subscription.repository.ts             -- MODIFY: implement countCopilotChatTurnsInPeriod
  app.module.ts                                                    -- MODIFY: register CopilotModule
test/
  copilot-chat.integration.spec.ts
```

---

### Task 1: `getCollectionActivityTimeline`'s real backing — add `limit` to `GetCustomerTimelineUseCase`

**Files:**
- Modify: `apps/backend/src/modules/collection-activity/application/collection-activity-repository.port.ts`
- Modify: `apps/backend/src/modules/collection-activity/application/get-customer-timeline.usecase.ts`
- Modify: `apps/backend/src/modules/collection-activity/infrastructure/typeorm-collection-activity.repository.ts`
- Test: extend `get-customer-timeline.usecase.spec.ts` (or create if it doesn't exist yet)

**Interfaces:**
- Consumes: `BaseRepository`/`TenantContextService`
- Produces: `GetCustomerTimelineUseCase.execute(customerId, limit): Promise<CollectionActivity[]>`, consumed by Task 5's `GetCollectionActivityTimelineTool` — this is the REAL port the read tool delegates to, replacing the original plan's fictional `'COLLECTION_ACTIVITY_READ_PORT'` string token

`findByCustomerId` currently returns every activity row for a customer, unbounded — Collection Activity is INSERT-only (spec: never updated/deleted), so this grows without bound over a customer's lifetime. Add `limit` at the query layer (`ORDER BY createdAt DESC, LIMIT`) rather than fetching everything and slicing in the caller.

- [ ] **Step 1: Write failing test**

Extend/create `apps/backend/src/modules/collection-activity/application/get-customer-timeline.usecase.spec.ts`:

```typescript
import { GetCustomerTimelineUseCase } from './get-customer-timeline.usecase';

describe('GetCustomerTimelineUseCase', () => {
  it('passes a caller-supplied limit down to the repository', async () => {
    const activityRepo = { findByCustomerId: jest.fn().mockResolvedValue([]) };
    const useCase = new GetCustomerTimelineUseCase(activityRepo as any);

    await useCase.execute('cust-1', 25);

    expect(activityRepo.findByCustomerId).toHaveBeenCalledWith('cust-1', 25);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test get-customer-timeline.usecase.spec.ts`
Expected: FAIL — `execute` doesn't accept a second argument / repo mock isn't called with `limit`

- [ ] **Step 3: Modify `collection-activity-repository.port.ts`**

```typescript
export interface ICollectionActivityRepository {
  create(activity: CollectionActivity, manager?: EntityManager): Promise<void>;
  findByReceivableId(receivableId: string): Promise<CollectionActivity[]>;
  findByCustomerId(customerId: string, limit: number): Promise<CollectionActivity[]>;
}
```

- [ ] **Step 4: Modify `get-customer-timeline.usecase.ts`**

```typescript
async execute(customerId: string, limit: number): Promise<CollectionActivity[]> {
  return this.activityRepo.findByCustomerId(customerId, limit);
}
```

- [ ] **Step 5: Modify `typeorm-collection-activity.repository.ts`** — add `order: { createdAt: 'DESC' }, take: limit` to the existing `findByCustomerId` query (same `BaseRepository`/tenant-scoped shape it already uses).

- [ ] **Step 6: Run test to verify it passes; run the full collection-activity test suite to confirm no other caller of `findByCustomerId` broke**

Run: `pnpm --filter @casso-ledger/backend test collection-activity`
Expected: all PASS (check whether any other caller of `findByCustomerId` exists and needs a `limit` argument added — grep before assuming there's exactly one)

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/collection-activity
git commit -m "feat: add limit to GetCustomerTimelineUseCase/findByCustomerId to bound Copilot's timeline reads"
```

---

### Task 2: `getPaymentHistory`'s real backing — new `IPaymentAllocationRepository.findByCustomerId`

**Files:**
- Modify: `apps/backend/src/modules/payments/application/payment-allocation-repository.port.ts`
- Modify: `apps/backend/src/modules/payments/infrastructure/typeorm-payment-allocation.repository.ts`
- Test: `apps/backend/src/modules/payments/infrastructure/typeorm-payment-allocation.repository.spec.ts` (extend or create)

**Interfaces:**
- Consumes: `BaseRepository`/`TenantContextService`
- Produces: `IPaymentAllocationRepository.findByCustomerId(customerId, limit): Promise<PaymentAllocation[]>`, consumed by Task 5's `GetPaymentHistoryTool` — there is no existing customer-scoped payment query anywhere in the codebase; `PaymentAllocation` has no `customerId` column, so this joins through `receivables.customerId`.

- [ ] **Step 1: Write failing test**

```typescript
describe('TypeOrmPaymentAllocationRepository.findByCustomerId', () => {
  it('joins through receivables, excludes soft-deleted allocations, orders by allocatedAt desc, and scopes by organizationId + limit', async () => {
    // assert the query builder is called with a join on receivableId -> receivables.customerId,
    // "deletedAt IS NULL", organizationId scoping, ORDER BY "allocatedAt" DESC, and a LIMIT
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test typeorm-payment-allocation.repository.spec.ts`
Expected: FAIL — `findByCustomerId` does not exist

- [ ] **Step 3: Modify `payment-allocation-repository.port.ts`**

```typescript
export interface IPaymentAllocationRepository {
  findByIdForUpdate(id: string, manager: EntityManager): Promise<PaymentAllocation | null>;
  save(allocation: PaymentAllocation, manager: EntityManager): Promise<void>;
  findByReceivableId(receivableId: string): Promise<PaymentAllocation[]>;
  findByCustomerId(customerId: string, limit: number): Promise<PaymentAllocation[]>;
}
```

- [ ] **Step 4: Implement in `typeorm-payment-allocation.repository.ts`**

```typescript
async findByCustomerId(customerId: string, limit: number): Promise<PaymentAllocation[]> {
  const organizationId = this.tenantContext.getOrganizationId();
  const rows = await this.ormRepo
    .createQueryBuilder('allocation')
    .innerJoin('receivables', 'receivable', 'receivable.id = allocation."receivableId"')
    .where('allocation."organizationId" = :organizationId', { organizationId })
    .andWhere('receivable."customerId" = :customerId', { customerId })
    .andWhere('allocation."deletedAt" IS NULL')
    .orderBy('allocation."allocatedAt"', 'DESC')
    .take(limit)
    .getMany();
  return rows.map((row) => new PaymentAllocation(row));
}
```

(Verify the exact TypeORM query-builder idiom already used elsewhere in this repository/module before writing this — match existing style rather than inventing a new one.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test typeorm-payment-allocation.repository.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/payments/application/payment-allocation-repository.port.ts apps/backend/src/modules/payments/infrastructure/typeorm-payment-allocation.repository.ts
git commit -m "feat: add IPaymentAllocationRepository.findByCustomerId for Copilot's payment-history tool"
```

---

### Task 3: Billing gate — `Subscription.copilotChatMonthlyLimit` + `PlanLimitService.enforceCopilotChatLimit`

**Files:**
- Modify: `apps/backend/src/modules/billing/domain/subscription.ts`
- Modify: `apps/backend/src/modules/billing/application/subscription-repository.port.ts`
- Modify: `apps/backend/src/modules/billing/application/plan-limit.service.ts`
- Modify: `apps/backend/src/modules/billing/infrastructure/typeorm-subscription.repository.ts`
- Test: extend `plan-limit.service.spec.ts` / `subscription.spec.ts`

**Interfaces:**
- Consumes: existing `ISubscriptionRepository`/`Subscription` (Billing plan)
- Produces: `PlanLimitService.enforceCopilotChatLimit(manager): Promise<void>`, consumed by Task 8's `CopilotChatUseCase`

Mirrors `enforceReceivableLimit` exactly — same lock/roll-period/status-check/count/compare shape, same `AppError(ErrorCode.PLAN_LIMIT_EXCEEDED, ...)` on violation (already mapped to HTTP 402).

- [ ] **Step 1: Write failing tests** — one for `Subscription.isCopilotChatLimitReached`, one for `PlanLimitService.enforceCopilotChatLimit` (happy path under the limit, throws `PLAN_LIMIT_EXCEEDED` at the limit, throws when subscription status isn't ACTIVE) — copy the shape of the existing `enforceReceivableLimit` tests file-for-file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @casso-ledger/backend test billing`
Expected: FAIL — method doesn't exist

- [ ] **Step 3: Modify `subscription.ts`**

```typescript
// ponytail: FREE only — see the existing note on this catalog.
const FREE_PLAN_LIMITS = { receivableMonthlyLimit: 50, bankConnectionLimit: 1, copilotChatMonthlyLimit: 50 };

// add copilotChatMonthlyLimit to SubscriptionProps, the class, and createFree()

isCopilotChatLimitReached(chatTurnsThisMonth: number): boolean {
  return chatTurnsThisMonth >= this.copilotChatMonthlyLimit;
}
```

- [ ] **Step 4: Modify `subscription-repository.port.ts`** — add `countCopilotChatTurnsInPeriod(organizationId, periodStart, periodEnd, manager): Promise<number>`.

- [ ] **Step 5: Implement in `typeorm-subscription.repository.ts`** — same raw-SQL-by-table-name shape as the existing `countReceivablesInPeriod`:

```typescript
async countCopilotChatTurnsInPeriod(
  organizationId: string,
  periodStart: Date,
  periodEnd: Date,
  manager: EntityManager,
): Promise<number> {
  const rows: Array<{ count: string }> = await manager.query(
    'SELECT COUNT(*) as count FROM copilot_messages WHERE "organizationId" = $1 AND role = \'USER\' AND "createdAt" >= $2 AND "createdAt" < $3',
    [organizationId, periodStart, periodEnd],
  );
  return Number(rows[0]?.count ?? 0);
}
```

Note: `CopilotMessageOrmEntity` (Task 4) does not have an `organizationId` column in the original entity sketch — add one here (it needs to, both for this count query and for tenant-safety of the messages table itself; every other table in this codebase carries `organizationId` directly).

- [ ] **Step 6: Modify `plan-limit.service.ts`** — add `enforceCopilotChatLimit(manager: EntityManager): Promise<void>`, structured identically to `enforceReceivableLimit` (lock+roll+status-check, then count via `countCopilotChatTurnsInPeriod`, then `isCopilotChatLimitReached` → `throwPlanLimitExceeded`).

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @casso-ledger/backend test billing`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/billing
git commit -m "feat: gate Copilot chat turns behind PlanLimitService (FREE = 50/month)"
```

---

### Task 4: Copilot entities, ports, and TypeORM repositories

**Files:**
- Create: `apps/backend/src/modules/copilot/infrastructure/copilot-conversation.orm-entity.ts`
- Create: `apps/backend/src/modules/copilot/infrastructure/copilot-message.orm-entity.ts`
- Create: `apps/backend/src/modules/copilot/infrastructure/copilot-pending-action.orm-entity.ts`
- Create: `apps/backend/src/modules/copilot/infrastructure/copilot-draft.orm-entity.ts`
- Create: `apps/backend/src/modules/copilot/infrastructure/ai-usage-log.orm-entity.ts`
- Create: `apps/backend/src/modules/copilot/application/conversation-repository.port.ts`
- Create: `apps/backend/src/modules/copilot/application/pending-action-repository.port.ts`
- Create: `apps/backend/src/modules/copilot/application/draft-repository.port.ts`
- Create: `apps/backend/src/modules/copilot/application/ai-usage-log-repository.port.ts`
- Create: `apps/backend/src/modules/copilot/infrastructure/typeorm-copilot-conversation.repository.ts`
- Create: `apps/backend/src/modules/copilot/infrastructure/typeorm-copilot-pending-action.repository.ts`
- Create: `apps/backend/src/modules/copilot/infrastructure/typeorm-copilot-draft.repository.ts`
- Create: `apps/backend/src/modules/copilot/infrastructure/typeorm-ai-usage-log.repository.ts`

**Interfaces:**
- Consumes: `BaseRepository`, `TenantContextService`
- Produces: `ICopilotConversationRepository`, `ICopilotPendingActionRepository`, `ICopilotDraftRepository`, `IAIUsageLogRepository` — consumed by every later task

**Persistence decision — normalized rows, not one jsonb blob per conversation:** `CopilotMessage` is one row per message (role `USER`/`ASSISTANT`/`TOOL`), not a single `messages jsonb` column on `CopilotConversation`. Justification: (1) `AIUsageLog` already needs a row per model call for audit — a per-message table keeps the same granularity; (2) every other entity in this codebase is a normalized TypeORM entity, not an embedded document; (3) `PlanLimitService.enforceCopilotChatLimit` (Task 3) counts `copilot_messages` rows directly by SQL — a jsonb blob can't be counted this way without deserializing every row.

**`ICopilotDraftRepository` is new versus the original plan draft** — the original plan had no port for `CopilotDraftOrmEntity` at all and instead let two different call sites (`DraftReminderEmailTool`, `ConfirmPendingActionUseCase`) reach for it in two different, both-broken ways (an untyped constructor param with no DI token, and a raw `@InjectRepository` inside `application/`). This task adds the port so both later tasks consume one correct thing.

- [ ] **Step 1: Create `copilot-conversation.orm-entity.ts`**

```typescript
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'copilot_conversations' })
export class CopilotConversationOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  userId: string;

  @Column({ nullable: true })
  customerId: string | null;

  @Column()
  createdAt: Date;
}
```

`id` is a `@PrimaryColumn` (not generated) because `CopilotChatUseCase` auto-creates the conversation row the first time a client posts to a given conversation id — there is no separate create-conversation endpoint (spec only defines `POST /conversations/:id/messages`).

- [ ] **Step 2: Create `copilot-message.orm-entity.ts`** — note the added `organizationId` column (Task 3's usage-count query needs it; every other table in this codebase carries it directly rather than joining to find it):

```typescript
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type CopilotMessageRole = 'USER' | 'ASSISTANT' | 'TOOL';

@Entity({ name: 'copilot_messages' })
@Index(['conversationId', 'createdAt'])
@Index(['organizationId', 'role', 'createdAt'])
export class CopilotMessageOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  conversationId: string;

  @Column({ type: 'varchar' })
  role: CopilotMessageRole;

  @Column('text')
  content: string;

  @Column({ type: 'jsonb', nullable: true })
  toolCalls: Array<{ id: string; name: string; input: unknown }> | null;

  @Column()
  createdAt: Date;
}
```

- [ ] **Step 3: Create `copilot-pending-action.orm-entity.ts`**

```typescript
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type CopilotPendingActionStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';

export interface SendReminderEmailPayload {
  draftId: string;
  receivableId: string;
}

@Entity({ name: 'copilot_pending_actions' })
export class CopilotPendingActionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  conversationId: string;

  @Column({ type: 'varchar' })
  actionType: 'SEND_REMINDER_EMAIL';

  @Column({ type: 'jsonb' })
  payload: SendReminderEmailPayload;

  @Column({ type: 'varchar' })
  status: CopilotPendingActionStatus;

  @Column()
  createdAt: Date;

  @Column({ nullable: true })
  resolvedAt: Date | null;

  @Column({ nullable: true })
  resolvedByUserId: string | null;
}
```

- [ ] **Step 4: Create `copilot-draft.orm-entity.ts`**

```typescript
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'copilot_drafts' })
export class CopilotDraftOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  receivableId: string;

  @Column()
  recipientEmail: string;

  @Column()
  subject: string;

  @Column('text')
  bodyHtml: string;

  @Column()
  createdAt: Date;
}
```

`bodyHtml`/`subject` here are the FINAL, already-substituted text (customer name/amounts already filled in, no `{{variable}}` tokens) — this is what `ConfirmPendingActionUseCase` (Task 9) reads back to build a real, throwaway `EmailTemplate` row once the user confirms.

- [ ] **Step 5: Create `ai-usage-log.orm-entity.ts`**

```typescript
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'ai_usage_logs' })
export class AIUsageLogOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  conversationId: string;

  @Column()
  model: string;

  @Column()
  promptVersion: string;

  @Column({ type: 'int', nullable: true })
  inputTokens: number | null;

  @Column({ type: 'int', nullable: true })
  outputTokens: number | null;

  @Column({ type: 'int' })
  latencyMs: number;

  @Column({ type: 'int' })
  toolCallsCount: number;

  @Column({ default: false })
  isError: boolean;

  @Column()
  createdAt: Date;
}
```

- [ ] **Step 6: Create the four ports** (`conversation-repository.port.ts`, `pending-action-repository.port.ts`, `draft-repository.port.ts`, `ai-usage-log-repository.port.ts`), following the shapes below. All errors on invalid state are `AppError`, never a `@nestjs/common` exception class.

`conversation-repository.port.ts`:

```typescript
export interface CopilotConversation {
  id: string;
  organizationId: string;
  userId: string;
  customerId: string | null;
  createdAt: Date;
}

export interface CopilotMessageRecord {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT' | 'TOOL';
  content: string;
  toolCalls: Array<{ id: string; name: string; input: unknown }> | null;
  createdAt: Date;
}

export interface ICopilotConversationRepository {
  findOrCreate(conversationId: string, userId: string): Promise<CopilotConversation>;
  listMessages(conversationId: string): Promise<CopilotMessageRecord[]>;
  appendMessage(message: Omit<CopilotMessageRecord, 'id'>, manager?: EntityManager): Promise<CopilotMessageRecord>;
}

export const COPILOT_CONVERSATION_REPOSITORY = Symbol('COPILOT_CONVERSATION_REPOSITORY');
```

(`appendMessage` takes an optional `manager` — Task 8's plan-limit-check-and-persist-user-message step must run inside one short transaction.)

`pending-action-repository.port.ts`:

```typescript
export interface CopilotPendingAction {
  id: string;
  organizationId: string;
  conversationId: string;
  actionType: 'SEND_REMINDER_EMAIL';
  payload: SendReminderEmailPayload;
  status: CopilotPendingActionStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
}

export interface ICopilotPendingActionRepository {
  create(conversationId: string, payload: SendReminderEmailPayload): Promise<CopilotPendingAction>;
  findById(id: string): Promise<CopilotPendingAction | null>;
  markExpired(id: string): Promise<void>;
  confirmIfPending(id: string, resolvedByUserId: string): Promise<CopilotPendingAction | null>;
  cancelIfPending(id: string, resolvedByUserId: string): Promise<CopilotPendingAction | null>;
}

export const COPILOT_PENDING_ACTION_REPOSITORY = Symbol('COPILOT_PENDING_ACTION_REPOSITORY');
```

(No generic `save()` — every mutation is one of the three named, intention-revealing methods: `markExpired`, `confirmIfPending`, `cancelIfPending`. `confirmIfPending`/`cancelIfPending` are atomic conditional updates — see Task 9's note on the confirm-race fix.)

`draft-repository.port.ts`:

```typescript
export interface CopilotDraft {
  id: string;
  organizationId: string;
  receivableId: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
  createdAt: Date;
}

export interface ICopilotDraftRepository {
  save(draft: CopilotDraft): Promise<void>;
  findById(id: string): Promise<CopilotDraft | null>;
}

export const COPILOT_DRAFT_REPOSITORY = Symbol('COPILOT_DRAFT_REPOSITORY');
```

`ai-usage-log-repository.port.ts`:

```typescript
export interface AIUsageLogEntry {
  conversationId: string;
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  toolCallsCount: number;
  isError: boolean;
}

export interface IAIUsageLogRepository {
  log(entry: AIUsageLogEntry): Promise<void>;
}

export const AI_USAGE_LOG_REPOSITORY = Symbol('AI_USAGE_LOG_REPOSITORY');
```

- [ ] **Step 7: Implement the four TypeORM repositories** in `infrastructure/`, `BaseRepository`-backed where they read/write tenant-scoped rows (Conversation, PendingAction, Draft), following `typeorm-copilot-conversation.repository.ts`'s existing shape from the original draft for `findOrCreate`/`listMessages`/`appendMessage`. `TypeOrmCopilotPendingActionRepository.confirmIfPending`/`cancelIfPending` both use the same `createQueryBuilder().update().set().where('id = :id AND "organizationId" = :organizationId AND status = :status')...returning('*')` shape — copy `cancelIfPending`'s exact structure for `confirmIfPending`, only the `set()` status differs (`'CONFIRMED'` vs `'CANCELLED'`). `TypeOrmCopilotDraftRepository` is the simplest of the four (no status machine, just `save`/`findById`).

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/copilot/infrastructure apps/backend/src/modules/copilot/application/conversation-repository.port.ts apps/backend/src/modules/copilot/application/pending-action-repository.port.ts apps/backend/src/modules/copilot/application/draft-repository.port.ts apps/backend/src/modules/copilot/application/ai-usage-log-repository.port.ts
git commit -m "feat: add Copilot entities, ports (including the missing draft port), and TypeORM repositories"
```

---

### Task 5: `CopilotToolRegistry` — the hardcoded, auditable whitelist

**Files:**
- Create: `apps/backend/src/modules/copilot/application/copilot-tool-registry.ts`
- Test: `apps/backend/src/modules/copilot/application/copilot-tool-registry.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `CopilotToolRegistry.getTools(canSendReminders): OpenAiToolShape[]`, `CopilotToolRegistry.register(tool)` — consumed by the tools (Task 6-8) and `CopilotChatUseCase` (Task 10)

This is the module's single most important file — the code that makes the write-action boundary a compile-time fact rather than a runtime policy. Write it, and its test, before any tool implementation exists.

- [ ] **Step 1: Write the failing allowlist test** (unchanged from the original draft's intent — only the output shape's field names differ, see Step 3):

```typescript
import { CopilotToolRegistry, CopilotToolDefinition } from './copilot-tool-registry';

function fakeTool(name: string, requiresReminderPermission = false): CopilotToolDefinition {
  return {
    name,
    description: `fake tool ${name}`,
    inputSchema: { type: 'object', properties: {}, required: [] },
    requiresReminderPermission,
  };
}

describe('CopilotToolRegistry', () => {
  it('only ever returns tools from the hardcoded safe allowlist', () => {
    const registry = new CopilotToolRegistry();
    registry.register(fakeTool('getReceivableSummary'));
    registry.register(fakeTool('getCollectionActivityTimeline'));
    registry.register(fakeTool('getPaymentHistory'));
    registry.register(fakeTool('draftReminderEmail', true));
    registry.register(fakeTool('sendReminderEmail', true));

    const names = registry.getTools(true).map((tool) => tool.function.name);

    expect(names.sort()).toEqual(
      [
        'draftReminderEmail',
        'getCollectionActivityTimeline',
        'getPaymentHistory',
        'getReceivableSummary',
        'sendReminderEmail',
      ].sort(),
    );
    names.forEach((name) => {
      expect(CopilotToolRegistry.SAFE_TOOL_NAMES).toContain(name);
    });
  });

  it('throws when registering a tool whose name is outside the safe allowlist — proves write-off/allocate/dispute tools cannot be exposed', () => {
    const registry = new CopilotToolRegistry();

    expect(() => registry.register(fakeTool('writeOffReceivable'))).toThrow(
      /not in the Copilot safe tool allowlist/,
    );
    expect(() => registry.register(fakeTool('allocatePayment'))).toThrow();
    expect(() => registry.register(fakeTool('disputeReceivable'))).toThrow();
    expect(registry.getTools(true)).toHaveLength(0);
  });

  it('hides sendReminderEmail and draftReminderEmail from users without REMINDER_SEND_MANUAL', () => {
    const registry = new CopilotToolRegistry();
    registry.register(fakeTool('getReceivableSummary'));
    registry.register(fakeTool('getCollectionActivityTimeline'));
    registry.register(fakeTool('getPaymentHistory'));
    registry.register(fakeTool('draftReminderEmail', true));
    registry.register(fakeTool('sendReminderEmail', true));

    const names = registry.getTools(false).map((tool) => tool.function.name);

    expect(names).toEqual(['getReceivableSummary', 'getCollectionActivityTimeline', 'getPaymentHistory']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test copilot-tool-registry.spec.ts`
Expected: FAIL — Cannot find module './copilot-tool-registry'

- [ ] **Step 3: Create `copilot-tool-registry.ts`** — shape the output as OpenAI's Chat Completions tool format (`{ type: 'function', function: { name, description, parameters } }`), not Anthropic's `{ name, description, input_schema }`:

```typescript
import { Injectable } from '@nestjs/common';

export interface CopilotJsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
}

export interface CopilotToolDefinition {
  name: string;
  description: string;
  inputSchema: CopilotJsonSchema;
  /** true for draftReminderEmail/sendReminderEmail — hidden from users lacking Permission.REMINDER_SEND_MANUAL */
  requiresReminderPermission: boolean;
}

export interface OpenAiToolShape {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: CopilotJsonSchema;
  };
}

/**
 * The entire write-action boundary lives here: this array is the ONLY thing
 * that decides which tool names may ever be registered. There is no config
 * flag, no DB table, no DI extension point — adding a tool means editing
 * this file and its own test, on purpose, so the boundary stays auditable in
 * a single diff. write-off / payment-allocate / dispute tools are — and must
 * remain — permanently absent from this list (see Global Constraints).
 */
@Injectable()
export class CopilotToolRegistry {
  static readonly SAFE_TOOL_NAMES = [
    'getReceivableSummary',
    'getCollectionActivityTimeline',
    'getPaymentHistory',
    'draftReminderEmail',
    'sendReminderEmail',
  ] as const;

  private readonly tools = new Map<string, CopilotToolDefinition>();

  register(tool: CopilotToolDefinition): void {
    if (!(CopilotToolRegistry.SAFE_TOOL_NAMES as readonly string[]).includes(tool.name)) {
      throw new Error(
        `Tool "${tool.name}" is not in the Copilot safe tool allowlist (${CopilotToolRegistry.SAFE_TOOL_NAMES.join(', ')}). ` +
          'Adding a new tool requires editing CopilotToolRegistry.SAFE_TOOL_NAMES directly — this is intentional.',
      );
    }
    this.tools.set(tool.name, tool);
  }

  getTools(canSendReminders: boolean): OpenAiToolShape[] {
    return Array.from(this.tools.values())
      .filter((tool) => canSendReminders || !tool.requiresReminderPermission)
      .map((tool) => ({
        type: 'function' as const,
        function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
      }));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test copilot-tool-registry.spec.ts`
Expected: all 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/copilot/application/copilot-tool-registry.ts apps/backend/src/modules/copilot/application/copilot-tool-registry.spec.ts
git commit -m "feat: add CopilotToolRegistry (OpenAI tool-calling shape) with a hardcoded, test-proven safe tool allowlist"
```

---

### Task 6: Read-only tools — `getReceivableSummary`, `getCollectionActivityTimeline`, `getPaymentHistory`

**Files:**
- Create: `apps/backend/src/modules/copilot/application/tools/get-receivable-summary.tool.ts`
- Create: `apps/backend/src/modules/copilot/application/tools/get-collection-activity-timeline.tool.ts`
- Create: `apps/backend/src/modules/copilot/application/tools/get-payment-history.tool.ts`
- Test: `apps/backend/src/modules/copilot/application/tools/copilot-read-tools.spec.ts`

**Interfaces:**
- Consumes: `IReceivableRepository.findOpenByCustomerId` (already exists — no new method), `GetCustomerTimelineUseCase` (Task 1, now with `limit`), `IPaymentAllocationRepository.findByCustomerId` (Task 2)
- Produces: `GetReceivableSummaryTool.execute(input)`, `GetCollectionActivityTimelineTool.execute(input)`, `GetPaymentHistoryTool.execute(input)` — pre-shaped JSON, consumed by Task 10's `CopilotChatUseCase`

All three tools take `customerId`; the timeline/history tools also take a bounded `limit`. No tool accepts `organizationId` — every underlying repository call is `TenantContextService`-scoped automatically.

- [ ] **Step 1: Create `get-receivable-summary.tool.ts`** — uses the EXISTING `findOpenByCustomerId`, not a new method:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import {
  IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../../receivables/application/receivable-repository.port';
import { CopilotJsonSchema } from '../copilot-tool-registry';

export const GET_RECEIVABLE_SUMMARY_SCHEMA: CopilotJsonSchema = {
  type: 'object',
  properties: { customerId: { type: 'string', description: 'The customer UUID to summarize' } },
  required: ['customerId'],
};

export interface ReceivableSummaryDto {
  customerId: string;
  totalOutstanding: number;
  totalOverdue: number;
  overdueCount: number;
  maxOverdueDays: number;
  averageLateDays: number;
}

@Injectable()
export class GetReceivableSummaryTool {
  static readonly NAME = 'getReceivableSummary';

  constructor(
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivableRepo: IReceivableRepository,
  ) {}

  async execute(input: { customerId: string }, now: Date = new Date()): Promise<ReceivableSummaryDto> {
    const receivables = await this.receivableRepo.findOpenByCustomerId(input.customerId);
    const overdue = receivables.filter((receivable) => receivable.isOverdue(now));
    const lateDays = overdue.map((receivable) =>
      Math.floor((now.getTime() - receivable.dueDate.getTime()) / (24 * 60 * 60 * 1000)),
    );
    return {
      customerId: input.customerId,
      totalOutstanding: receivables.reduce((sum, receivable) => sum + receivable.remainingAmount, 0),
      totalOverdue: overdue.reduce((sum, receivable) => sum + receivable.remainingAmount, 0),
      overdueCount: overdue.length,
      maxOverdueDays: lateDays.length ? Math.max(...lateDays) : 0,
      averageLateDays: lateDays.length
        ? Math.round(lateDays.reduce((sum, days) => sum + days, 0) / lateDays.length)
        : 0,
    };
  }
}
```

- [ ] **Step 2: Write failing tests for all three canonical read tools**

```typescript
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Receivable } from '../../../receivables/domain/receivable';
import { GetReceivableSummaryTool } from './get-receivable-summary.tool';
import { GetCollectionActivityTimelineTool } from './get-collection-activity-timeline.tool';
import { GetPaymentHistoryTool } from './get-payment-history.tool';

function receivable(overrides: { originalAmount: number; paidAmount: number; dueDate: Date }) {
  return new Receivable({
    id: 'rec',
    organizationId: 'org-1',
    customerId: 'cust-1',
    invoiceId: null,
    status: ReceivableStatus.OPEN,
    salesRepresentativeId: 'user-1',
    createdAt: new Date('2026-01-01'),
    closedAt: null,
    version: 1,
    ...overrides,
  } as any);
}

describe('Copilot read tools', () => {
  it('computes the canonical receivable summary from findOpenByCustomerId', async () => {
    const today = new Date('2026-08-03');
    const receivables = [
      receivable({ originalAmount: 10_000_000, paidAmount: 0, dueDate: new Date('2026-07-24') }), // 10 days late
      receivable({ originalAmount: 20_000_000, paidAmount: 5_000_000, dueDate: new Date('2026-07-04') }), // 30 days late
      receivable({ originalAmount: 5_000_000, paidAmount: 0, dueDate: new Date('2026-09-01') }), // not due yet
    ];
    const receivableRepo = { findOpenByCustomerId: jest.fn().mockResolvedValue(receivables) };

    const tool = new GetReceivableSummaryTool(receivableRepo as any);
    const result = await tool.execute({ customerId: 'cust-1' }, today);

    expect(receivableRepo.findOpenByCustomerId).toHaveBeenCalledWith('cust-1');
    expect(result.overdueCount).toBe(2);
    expect(result.totalOutstanding).toBe(10_000_000 + 15_000_000);
    expect(result.totalOverdue).toBe(10_000_000 + 15_000_000);
    expect(result.maxOverdueDays).toBe(30);
    expect(result.averageLateDays).toBe(20);
  });

  it('delegates timeline to GetCustomerTimelineUseCase with a bounded limit', async () => {
    const timelineUseCase = { execute: jest.fn().mockResolvedValue([{ id: 'activity-1' }]) };
    const timelineTool = new GetCollectionActivityTimelineTool(timelineUseCase as any);

    await expect(timelineTool.execute({ customerId: 'cust-1', limit: 50 })).resolves.toEqual({
      customerId: 'cust-1',
      items: [{ id: 'activity-1' }],
    });
    expect(timelineUseCase.execute).toHaveBeenCalledWith('cust-1', 50);
  });

  it('delegates payment history to IPaymentAllocationRepository.findByCustomerId with a bounded limit', async () => {
    const allocationRepo = { findByCustomerId: jest.fn().mockResolvedValue([{ id: 'alloc-1' }]) };
    const paymentTool = new GetPaymentHistoryTool(allocationRepo as any);

    await expect(paymentTool.execute({ customerId: 'cust-1', limit: 50 })).resolves.toEqual({
      customerId: 'cust-1',
      items: [{ id: 'alloc-1' }],
    });
    expect(allocationRepo.findByCustomerId).toHaveBeenCalledWith('cust-1', 50);
  });

  it('clamps an out-of-range limit into [1, 50] for both bounded tools', async () => {
    const timelineUseCase = { execute: jest.fn().mockResolvedValue([]) };
    const timelineTool = new GetCollectionActivityTimelineTool(timelineUseCase as any);

    await timelineTool.execute({ customerId: 'cust-1', limit: 500 });
    expect(timelineUseCase.execute).toHaveBeenCalledWith('cust-1', 50);

    await timelineTool.execute({ customerId: 'cust-1' });
    expect(timelineUseCase.execute).toHaveBeenCalledWith('cust-1', 20);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test copilot-read-tools.spec.ts`
Expected: FAIL — the three canonical tool classes do not exist

- [ ] **Step 4: Create `get-collection-activity-timeline.tool.ts` and `get-payment-history.tool.ts`** — inject the REAL use case/port, not a fictional string-token adapter:

```typescript
import { Injectable } from '@nestjs/common';
import { GetCustomerTimelineUseCase } from '../../../collection-activity/application/get-customer-timeline.usecase';
import { CopilotJsonSchema } from '../copilot-tool-registry';

export const GET_COLLECTION_ACTIVITY_TIMELINE_SCHEMA: CopilotJsonSchema = {
  type: 'object',
  properties: {
    customerId: { type: 'string' },
    limit: { type: 'integer', minimum: 1, maximum: 50 },
  },
  required: ['customerId'],
};

const MIN_LIMIT = 1;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, MIN_LIMIT), MAX_LIMIT);
}

@Injectable()
export class GetCollectionActivityTimelineTool {
  static readonly NAME = 'getCollectionActivityTimeline';

  constructor(private readonly getCustomerTimeline: GetCustomerTimelineUseCase) {}

  async execute(input: { customerId: string; limit?: number }) {
    const items = await this.getCustomerTimeline.execute(input.customerId, clampLimit(input.limit));
    return { customerId: input.customerId, items };
  }
}
```

```typescript
import { Inject, Injectable } from '@nestjs/common';
import {
  IPaymentAllocationRepository,
  PAYMENT_ALLOCATION_REPOSITORY,
} from '../../../payments/application/payment-allocation-repository.port';
import { CopilotJsonSchema } from '../copilot-tool-registry';

export const GET_PAYMENT_HISTORY_SCHEMA: CopilotJsonSchema = {
  type: 'object',
  properties: {
    customerId: { type: 'string' },
    limit: { type: 'integer', minimum: 1, maximum: 50 },
  },
  required: ['customerId'],
};

const MIN_LIMIT = 1;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, MIN_LIMIT), MAX_LIMIT);
}

@Injectable()
export class GetPaymentHistoryTool {
  static readonly NAME = 'getPaymentHistory';

  constructor(
    @Inject(PAYMENT_ALLOCATION_REPOSITORY)
    private readonly allocationRepo: IPaymentAllocationRepository,
  ) {}

  async execute(input: { customerId: string; limit?: number }) {
    const items = await this.allocationRepo.findByCustomerId(input.customerId, clampLimit(input.limit));
    return { customerId: input.customerId, items };
  }
}
```

Both tools return only the documented structured DTOs and never accept `organizationId`; neither introduces a second persistence contract — they adapt an existing use case and an existing (Task 2's) repository method.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test copilot-read-tools.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/copilot/application/tools/get-receivable-summary.tool.ts apps/backend/src/modules/copilot/application/tools/get-collection-activity-timeline.tool.ts apps/backend/src/modules/copilot/application/tools/get-payment-history.tool.ts apps/backend/src/modules/copilot/application/tools/copilot-read-tools.spec.ts
git commit -m "feat: add canonical Copilot read tools against the real repositories/use cases"
```

---

### Task 7: `draftReminderEmail` tool

**Files:**
- Create: `apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.ts`
- Test: `apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.spec.ts`

**Interfaces:**
- Consumes: `IReceivableRepository.findById`, `ICustomerRepository.findById`, `ICopilotDraftRepository` (Task 4's port — NOT an untyped inline object, fixing the original plan's DI-crash bug)
- Produces: `DraftReminderEmailTool.execute(input, organizationId)` → `{ draftId, receivableId, recipientEmail, subject, bodyHtml }`, read back by `ConfirmPendingActionUseCase` (Task 9)

`draftReminderEmail` never sends anything — it composes the email deterministically from structured `Receivable`/`Customer` data (never letting the model invent the amount) and persists it via `ICopilotDraftRepository`. Errors are `AppError`, never `NotFoundException`.

- [ ] **Step 1: Write failing test**

```typescript
import { ErrorCode } from '../../../../common/errors/error-code';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Receivable } from '../../../receivables/domain/receivable';
import type { Customer } from '../../../customers/domain/customer';
import { CustomerGroup } from '../../../customers/domain/customer-group';
import { DraftReminderEmailTool } from './draft-reminder-email.tool';

describe('DraftReminderEmailTool', () => {
  it('composes a draft from structured Receivable + Customer data and persists it via ICopilotDraftRepository', async () => {
    const receivable = new Receivable({
      id: 'rec-1', organizationId: 'org-1', customerId: 'cust-1', invoiceId: null,
      originalAmount: 50_000_000, paidAmount: 20_000_000, dueDate: new Date('2026-07-20'),
      status: ReceivableStatus.PARTIALLY_PAID, salesRepresentativeId: 'user-1',
      createdAt: new Date('2026-06-20'), closedAt: null, version: 1,
    });
    // Customer is a plain data interface (no constructor) — build a literal, not `new Customer(...)`.
    const customer: Customer = {
      id: 'cust-1', organizationId: 'org-1', name: 'ABC Company', taxCode: '0101234567',
      email: 'ap@abc.vn', phone: '0900000000', defaultPaymentTermDays: 30,
      creditLimit: 100_000_000, priority: 1, customerGroup: CustomerGroup.REGULAR, createdAt: new Date('2026-01-01'),
    };
    const receivableRepo = { findById: jest.fn().mockResolvedValue(receivable) };
    const customerRepo = { findById: jest.fn().mockResolvedValue(customer) };
    const draftRepo = { save: jest.fn() };

    const tool = new DraftReminderEmailTool(receivableRepo as any, customerRepo as any, draftRepo as any);
    const result = await tool.execute({ receivableId: 'rec-1', tone: 'urgent' }, 'org-1');

    expect(result.recipientEmail).toBe('ap@abc.vn');
    expect(result.subject).toContain('ABC Company');
    expect(result.bodyHtml).toContain('30.000.000');
    expect(draftRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: result.draftId, organizationId: 'org-1', receivableId: 'rec-1', recipientEmail: 'ap@abc.vn' }),
    );
  });

  it('throws AppError(RECEIVABLE_NOT_FOUND) when the receivable does not exist in the current organization', async () => {
    const receivableRepo = { findById: jest.fn().mockResolvedValue(null) };
    const customerRepo = { findById: jest.fn() };
    const draftRepo = { save: jest.fn() };
    const tool = new DraftReminderEmailTool(receivableRepo as any, customerRepo as any, draftRepo as any);

    await expect(tool.execute({ receivableId: 'missing' }, 'org-1')).rejects.toMatchObject({
      errorCode: ErrorCode.RECEIVABLE_NOT_FOUND,
    });
  });

  it('throws AppError(NOT_FOUND) when the receivable\'s customer is missing', async () => {
    const receivable = new Receivable({
      id: 'rec-1', organizationId: 'org-1', customerId: 'missing-cust', invoiceId: null,
      originalAmount: 1, paidAmount: 0, dueDate: new Date(), status: ReceivableStatus.OPEN,
      salesRepresentativeId: 'user-1', createdAt: new Date(), closedAt: null, version: 1,
    });
    const receivableRepo = { findById: jest.fn().mockResolvedValue(receivable) };
    const customerRepo = { findById: jest.fn().mockResolvedValue(null) };
    const draftRepo = { save: jest.fn() };
    const tool = new DraftReminderEmailTool(receivableRepo as any, customerRepo as any, draftRepo as any);

    await expect(tool.execute({ receivableId: 'rec-1' }, 'org-1')).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test draft-reminder-email.tool.spec.ts`
Expected: FAIL — Cannot find module './draft-reminder-email.tool'

- [ ] **Step 3: Create `draft-reminder-email.tool.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../../common/errors/app-error';
import { ErrorCode } from '../../../../common/errors/error-code';
import {
  IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../../receivables/application/receivable-repository.port';
import {
  ICustomerRepository,
  CUSTOMER_REPOSITORY,
} from '../../../customers/application/customer-repository.port';
import { ICopilotDraftRepository, COPILOT_DRAFT_REPOSITORY } from '../draft-repository.port';
import { CopilotJsonSchema } from '../copilot-tool-registry';

export const DRAFT_REMINDER_EMAIL_SCHEMA: CopilotJsonSchema = {
  type: 'object',
  properties: {
    receivableId: { type: 'string', description: 'The receivable UUID to draft a reminder for' },
    tone: { type: 'string', enum: ['polite', 'urgent'], description: 'Tone of the reminder email; defaults to polite' },
  },
  required: ['receivableId'],
};

export interface DraftReminderEmailResult {
  draftId: string;
  receivableId: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
}

function formatVnd(amount: number): string {
  return amount.toLocaleString('vi-VN') + ' VND';
}

@Injectable()
export class DraftReminderEmailTool {
  static readonly NAME = 'draftReminderEmail';

  constructor(
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivableRepo: IReceivableRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customerRepo: ICustomerRepository,
    @Inject(COPILOT_DRAFT_REPOSITORY) private readonly draftRepo: ICopilotDraftRepository,
  ) {}

  async execute(
    input: { receivableId: string; tone?: 'polite' | 'urgent' },
    organizationId: string,
  ): Promise<DraftReminderEmailResult> {
    const receivable = await this.receivableRepo.findById(input.receivableId);
    if (!receivable) {
      throw new AppError(ErrorCode.RECEIVABLE_NOT_FOUND, 'Không tìm thấy khoản phải thu.');
    }
    const customer = await this.customerRepo.findById(receivable.customerId);
    if (!customer) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy khách hàng của khoản phải thu này.');
    }

    const tone = input.tone ?? 'polite';
    const remaining = formatVnd(receivable.remainingAmount);
    const dueDate = receivable.dueDate.toISOString().slice(0, 10);

    const subject =
      tone === 'urgent'
        ? `[Nhắc thanh toán khẩn] ${customer.name} - còn lại ${remaining}`
        : `Nhắc thanh toán - ${customer.name}`;

    const bodyHtml =
      tone === 'urgent'
        ? `<p>Kính gửi ${customer.name},</p><p>Khoản phải thu đã quá hạn (hạn thanh toán: ${dueDate}). Số tiền còn lại: <strong>${remaining}</strong>. Vui lòng thanh toán sớm nhất có thể.</p>`
        : `<p>Kính gửi ${customer.name},</p><p>Đây là thư nhắc về khoản phải thu đến hạn ngày ${dueDate}; số tiền còn lại là <strong>${remaining}</strong>. Cảm ơn.</p>`;

    const draftId = randomUUID();
    await this.draftRepo.save({
      id: draftId,
      organizationId,
      receivableId: receivable.id,
      recipientEmail: customer.email,
      subject,
      bodyHtml,
      createdAt: new Date(),
    });

    return { draftId, receivableId: receivable.id, recipientEmail: customer.email, subject, bodyHtml };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test draft-reminder-email.tool.spec.ts`
Expected: all 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.ts apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.spec.ts
git commit -m "feat: add draftReminderEmail tool against ICopilotDraftRepository, throwing AppError"
```

---

### Task 8: `sendReminderEmail` tool (proposal-only, schema metadata)

**Files:**
- Create: `apps/backend/src/modules/copilot/application/tools/send-reminder-email.tool.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `SendReminderEmailTool` (schema-only — its "execute" path is deliberately never called from the chat loop), the tool name `CopilotChatUseCase` (Task 10) watches for to create a `CopilotPendingAction`

`SendReminderEmailTool` here is schema metadata only, registered so the model can name it — `CopilotChatUseCase` (Task 10) never calls anything on this class; seeing a tool call named `sendReminderEmail` is the signal to create a `CopilotPendingAction` and stop, per Global Constraints. The class that actually touches `EmailService` is `ConfirmPendingActionUseCase` (Task 9), which is reached only via the confirm endpoint and never via the model.

- [ ] **Step 1: Create `send-reminder-email.tool.ts`**

```typescript
import { CopilotJsonSchema } from '../copilot-tool-registry';

export const SEND_REMINDER_EMAIL_SCHEMA: CopilotJsonSchema = {
  type: 'object',
  properties: {
    draftId: { type: 'string', description: 'The draftId returned by a prior draftReminderEmail call' },
    receivableId: { type: 'string', description: 'The receivable UUID associated with the draft' },
  },
  required: ['draftId', 'receivableId'],
};

/**
 * Metadata only. This class has no execute() on purpose: a tool call named
 * "sendReminderEmail" is intercepted by CopilotChatUseCase and turned into a
 * CopilotPendingAction — it is never invoked as a normal tool call in the
 * same model turn (see Global Constraints and ConfirmPendingActionUseCase in
 * Task 9, the only class that actually calls EmailService).
 */
export class SendReminderEmailTool {
  static readonly NAME = 'sendReminderEmail';
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/modules/copilot/application/tools/send-reminder-email.tool.ts
git commit -m "feat: add proposal-only sendReminderEmail tool schema"
```

---

### Task 9: `ConfirmPendingActionUseCase` (atomic, race-safe) + `CancelPendingActionUseCase`

**Files:**
- Create: `apps/backend/src/modules/copilot/application/confirm-pending-action.usecase.ts`
- Create: `apps/backend/src/modules/copilot/application/cancel-pending-action.usecase.ts`
- Test: `confirm-pending-action.usecase.spec.ts`, `cancel-pending-action.usecase.spec.ts`

**Interfaces:**
- Consumes: `ICopilotPendingActionRepository`/`ICopilotDraftRepository` (Task 4), the REAL `IEmailTemplateRepository`/`IReminderExecutionRepository`/`ReminderExecution` (Email Template Management / Reminder Automation plans), `EmailService` (Email Notification Service plan)
- Produces: `ConfirmPendingActionUseCase.execute(pendingActionId, resolvedByUserId): Promise<{ reminderExecutionId: string }>`, `CancelPendingActionUseCase.execute(pendingActionId, resolvedByUserId): Promise<CopilotPendingActionDto>`, consumed by Task 11's controller

**Race fix (2026-08-09):** the original plan's confirm flow read the pending action, checked `status === 'PENDING'`, did async work, then wrote `status = 'CONFIRMED'` — two concurrent confirm requests could both pass the read-check before either write landed, both calling `EmailService.sendReminderEmail` and creating two `ReminderExecution` rows. Fixed by claiming the action FIRST via an atomic `confirmIfPending()` conditional `UPDATE ... WHERE status = 'PENDING'` (mirroring the already-correct `cancelIfPending`), before any side effect — only the request that wins the atomic claim proceeds.

- [ ] **Step 1: Write failing tests for `ConfirmPendingActionUseCase`**

```typescript
import { ErrorCode } from '../../../common/errors/error-code';
import { ConfirmPendingActionUseCase } from './confirm-pending-action.usecase';

function pendingAction(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'pa-1', organizationId: 'org-1', conversationId: 'conv-1',
    actionType: 'SEND_REMINDER_EMAIL' as const,
    payload: { draftId: 'draft-1', receivableId: 'rec-1' },
    status: 'PENDING' as const, createdAt: new Date(), resolvedAt: null, resolvedByUserId: null,
    ...overrides,
  };
}

function buildDraft() {
  return { id: 'draft-1', organizationId: 'org-1', receivableId: 'rec-1', recipientEmail: 'ap@abc.vn', subject: 'Nhắc thanh toán - ABC Company', bodyHtml: '<p>Kính gửi ABC Company...</p>', createdAt: new Date() };
}

describe('ConfirmPendingActionUseCase', () => {
  it('atomically claims the pending action, creates an EmailTemplate + ReminderExecution, calls EmailService.sendReminderEmail exactly once', async () => {
    const claimed = pendingAction();
    const pendingActionRepo = { findById: jest.fn(), confirmIfPending: jest.fn().mockResolvedValue(claimed) };
    const draftRepo = { findById: jest.fn().mockResolvedValue(buildDraft()) };
    const emailTemplateRepo = { save: jest.fn().mockResolvedValue(undefined) };
    const reminderExecutionRepo = { save: jest.fn().mockResolvedValue(undefined) };
    const emailService = { sendReminderEmail: jest.fn().mockResolvedValue(undefined) };

    const useCase = new ConfirmPendingActionUseCase(
      pendingActionRepo as any, draftRepo as any, emailTemplateRepo as any, reminderExecutionRepo as any, emailService as any,
    );

    await useCase.execute('pa-1', 'user-1');

    expect(pendingActionRepo.confirmIfPending).toHaveBeenCalledWith('pa-1', 'user-1');
    const savedTemplate = emailTemplateRepo.save.mock.calls[0][0];
    expect(savedTemplate).toMatchObject({ subject: 'Nhắc thanh toán - ABC Company', isDefault: false, version: 1 });
    const savedExecution = reminderExecutionRepo.save.mock.calls[0][0];
    expect(savedExecution).toMatchObject({ receivableId: 'rec-1', reminderRuleId: null, status: 'PENDING' });
    expect(emailService.sendReminderEmail).toHaveBeenCalledWith({
      receivableId: 'rec-1', templateId: savedTemplate.id, reminderExecutionId: savedExecution.id,
    });
  });

  it('rejects with CONFLICT when the atomic claim fails because the action is already resolved, and never calls EmailService', async () => {
    const pendingActionRepo = { findById: jest.fn(), confirmIfPending: jest.fn().mockResolvedValue(null) };
    const draftRepo = { findById: jest.fn() };
    const emailTemplateRepo = { save: jest.fn() };
    const reminderExecutionRepo = { save: jest.fn() };
    const emailService = { sendReminderEmail: jest.fn() };

    const useCase = new ConfirmPendingActionUseCase(
      pendingActionRepo as any, draftRepo as any, emailTemplateRepo as any, reminderExecutionRepo as any, emailService as any,
    );

    await expect(useCase.execute('pa-1', 'user-1')).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
    expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
  });

  it('rejects with CONFLICT and marks EXPIRED when the atomically-claimed action is older than 10 minutes, and never calls EmailService', async () => {
    const claimed = pendingAction({ createdAt: new Date(Date.now() - 11 * 60 * 1000) });
    const pendingActionRepo = { findById: jest.fn(), confirmIfPending: jest.fn().mockResolvedValue(claimed), markExpired: jest.fn() };
    const draftRepo = { findById: jest.fn() };
    const emailTemplateRepo = { save: jest.fn() };
    const reminderExecutionRepo = { save: jest.fn() };
    const emailService = { sendReminderEmail: jest.fn() };

    const useCase = new ConfirmPendingActionUseCase(
      pendingActionRepo as any, draftRepo as any, emailTemplateRepo as any, reminderExecutionRepo as any, emailService as any,
    );

    await expect(useCase.execute('pa-1', 'user-1')).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
    expect(pendingActionRepo.markExpired).toHaveBeenCalledWith('pa-1');
    expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
  });
});
```

Why `confirmIfPending` is called even in the expiry case: the atomic claim must win FIRST (removing any race against a concurrent cancel/confirm), and only THEN is the claimed row's age checked — checking age before claiming would reopen the original TOCTOU gap.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test confirm-pending-action.usecase.spec.ts`
Expected: FAIL — Cannot find module './confirm-pending-action.usecase'

- [ ] **Step 3: Create `confirm-pending-action.usecase.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  ICopilotPendingActionRepository,
  COPILOT_PENDING_ACTION_REPOSITORY,
} from './pending-action-repository.port';
import { ICopilotDraftRepository, COPILOT_DRAFT_REPOSITORY } from './draft-repository.port';
import {
  IEmailTemplateRepository,
  EMAIL_TEMPLATE_REPOSITORY,
} from '../../email-templates/application/email-template-repository.port';
import { EmailTemplate } from '../../email-templates/domain/email-template';
import {
  IReminderExecutionRepository,
  REMINDER_EXECUTION_REPOSITORY,
} from '../../reminders/application/reminder-execution-repository.port';
import { ReminderExecution, ReminderExecutionStatus } from '../../reminders/domain/reminder-execution';
import { EmailService } from '../../notifications/application/email.service';

export const PENDING_ACTION_EXPIRY_MINUTES = 10;

@Injectable()
export class ConfirmPendingActionUseCase {
  constructor(
    @Inject(COPILOT_PENDING_ACTION_REPOSITORY)
    private readonly pendingActionRepo: ICopilotPendingActionRepository,
    @Inject(COPILOT_DRAFT_REPOSITORY) private readonly draftRepo: ICopilotDraftRepository,
    @Inject(EMAIL_TEMPLATE_REPOSITORY) private readonly emailTemplateRepo: IEmailTemplateRepository,
    @Inject(REMINDER_EXECUTION_REPOSITORY)
    private readonly reminderExecutionRepo: IReminderExecutionRepository,
    private readonly emailService: EmailService,
  ) {}

  async execute(pendingActionId: string, resolvedByUserId: string): Promise<{ reminderExecutionId: string }> {
    // Atomic claim FIRST — this is the only thing standing between two
    // concurrent confirm clicks and a double-send. Only the caller that wins
    // this UPDATE proceeds past this line.
    const action = await this.pendingActionRepo.confirmIfPending(pendingActionId, resolvedByUserId);
    if (!action) {
      throw new AppError(ErrorCode.CONFLICT, 'Đề xuất gửi email đã được xử lý hoặc không còn hiệu lực.');
    }

    const ageMs = Date.now() - action.createdAt.getTime();
    if (ageMs > PENDING_ACTION_EXPIRY_MINUTES * 60 * 1000) {
      await this.pendingActionRepo.markExpired(pendingActionId);
      throw new AppError(ErrorCode.CONFLICT, 'Đề xuất gửi email đã hết hạn — vui lòng yêu cầu Copilot soạn lại.');
    }

    const draft = await this.draftRepo.findById(action.payload.draftId);
    if (!draft) {
      throw new AppError(ErrorCode.NOT_FOUND, `Không tìm thấy bản nháp email ${action.payload.draftId}.`);
    }

    const now = new Date();

    // Throwaway EmailTemplate: subject/bodyHtml are the draft's ALREADY-substituted
    // literal text (no {{variable}} tokens) — EmailService's Handlebars render step
    // is a no-op pass-through for it. This is what lets a Copilot-confirmed send
    // reuse the exact same EmailService/EmailQueueProcessor pipeline as a
    // rule-based reminder, instead of a parallel one.
    const template = new EmailTemplate({
      id: randomUUID(),
      organizationId: action.organizationId,
      name: `Copilot draft ${draft.id}`,
      subject: draft.subject,
      bodyHtml: draft.bodyHtml,
      reminderStage: null,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    await this.emailTemplateRepo.save(template);

    const execution = new ReminderExecution({
      id: randomUUID(),
      organizationId: action.organizationId,
      receivableId: action.payload.receivableId,
      reminderRuleId: null,
      executionDate: now,
      sentAt: null,
      status: ReminderExecutionStatus.PENDING,
      skipReason: null,
      providerMessageId: null,
      failureReason: null,
      createdAt: now,
    });
    await this.reminderExecutionRepo.save(execution);

    // The ONLY call to EmailService.sendReminderEmail in this entire module — pure code, no AI involved.
    await this.emailService.sendReminderEmail({
      receivableId: action.payload.receivableId,
      templateId: template.id,
      reminderExecutionId: execution.id,
    });

    return { reminderExecutionId: execution.id };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test confirm-pending-action.usecase.spec.ts`
Expected: all 3 tests PASS

- [ ] **Step 5: Write failing tests + implement `CancelPendingActionUseCase`** — same atomic-claim-first shape, no `EmailService`/`EmailTemplateRepository`/`ReminderExecutionRepository` dependency at all:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  ICopilotPendingActionRepository,
  COPILOT_PENDING_ACTION_REPOSITORY,
} from './pending-action-repository.port';
import { CopilotPendingActionDto, toCopilotPendingActionDto } from '../presentation/dto/copilot-response.dto';
import { PENDING_ACTION_EXPIRY_MINUTES } from './confirm-pending-action.usecase';

@Injectable()
export class CancelPendingActionUseCase {
  constructor(
    @Inject(COPILOT_PENDING_ACTION_REPOSITORY)
    private readonly pendingActionRepo: ICopilotPendingActionRepository,
  ) {}

  async execute(pendingActionId: string, resolvedByUserId: string): Promise<CopilotPendingActionDto> {
    const cancelled = await this.pendingActionRepo.cancelIfPending(pendingActionId, resolvedByUserId);
    if (!cancelled) {
      throw new AppError(ErrorCode.CONFLICT, 'Đề xuất gửi email đã được xử lý hoặc không còn hiệu lực.');
    }
    if (Date.now() - cancelled.createdAt.getTime() > PENDING_ACTION_EXPIRY_MINUTES * 60 * 1000) {
      await this.pendingActionRepo.markExpired(pendingActionId);
      throw new AppError(ErrorCode.CONFLICT, 'Đề xuất gửi email đã hết hạn.');
    }
    return toCopilotPendingActionDto(cancelled);
  }
}
```

Test the happy path, the race (`cancelIfPending` returns `null` → `CONFLICT`), and expiry-after-claim (mirrors Confirm's 3rd test).

- [ ] **Step 6: Run the full test file set to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test cancel-pending-action.usecase.spec.ts confirm-pending-action.usecase.spec.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/copilot/application/confirm-pending-action.usecase.ts apps/backend/src/modules/copilot/application/confirm-pending-action.usecase.spec.ts apps/backend/src/modules/copilot/application/cancel-pending-action.usecase.ts apps/backend/src/modules/copilot/application/cancel-pending-action.usecase.spec.ts
git commit -m "feat: add race-safe Confirm/CancelPendingActionUseCase (atomic claim before any side effect), AppError throughout"
```

---

### Task 10: `IAIChatProvider` port + OpenAI-backed adapter + `CopilotChatUseCase` (the agent loop)

**Files:**
- Modify: `apps/backend/package.json` (add `openai`)
- Create: `apps/backend/src/modules/copilot/application/ai-chat-provider.port.ts`
- Create: `apps/backend/src/modules/copilot/infrastructure/openai-chat-provider.adapter.ts`
- Create: `apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts`
- Test: `apps/backend/src/modules/copilot/application/copilot-chat.usecase.spec.ts`

**Interfaces:**
- Consumes: `IAIChatProvider` (this task's own new port — `CopilotChatUseCase` never imports the `openai` SDK directly), `CopilotToolRegistry` (Task 5), the five tools (Tasks 6-8), `ICopilotConversationRepository`/`ICopilotPendingActionRepository`/`IAIUsageLogRepository` (Task 4), `PlanLimitService.enforceCopilotChatLimit` (Task 3), `TenantContextService`, `ROLE_PERMISSIONS`, `DataSource` (for the short limit-check transaction)
- Produces: `CopilotChatUseCase.execute(input): Promise<CopilotChatResult>`, consumed by Task 11's controller

**This is the module's core agent loop — get the ReAct shape right, not a single hard-coded tool call:**

```
1. User message arrives.
2. Inside ONE short DB transaction: enforce the Billing chat-turn limit (Task 3),
   find-or-create the conversation, persist the user's message. Commit.
   (No AI provider call happens inside this transaction — external calls never
   run inside a DB transaction, per this repo's transaction-scope rule.)
3. Load full message history; build the OpenAI-format `messages` array
   (system prompt + history), and the tool list scoped by the caller's
   Permission.REMINDER_SEND_MANUAL.
4. LOOP (up to MAX_TOOL_ITERATIONS):
   a. Call IAIChatProvider.createChatCompletion(messages, tools) — 15s
      timeout, exactly one automatic retry on failure. Log to AIUsageLog
      unconditionally (success AND failure/timeout).
   b. If the response has no tool calls → this is the final answer. Persist
      it as an ASSISTANT message, return { message, pendingAction: null }.
   c. If one of the tool calls is named "sendReminderEmail" → STOP THE LOOP
      immediately. Do not execute any further tool calls from this response.
      Create a CopilotPendingAction from its arguments, persist the
      assistant's message (with its tool_calls recorded for history), and
      return { message, pendingAction }.
   d. Otherwise, execute every read/draft tool call in the response
      (getReceivableSummary / getCollectionActivityTimeline /
      getPaymentHistory / draftReminderEmail), append the assistant message
      (with its tool_calls) AND one role:'tool' result message per tool
      call to the in-memory `messages` array, and go to step 4a again — this
      is what makes it a real multi-round loop, not a single call-and-done.
5. If MAX_TOOL_ITERATIONS is exhausted without a final answer or a
   sendReminderEmail interception, throw (surfaced to the user as an error,
   not silently truncated).
```

- [ ] **Step 1: Install `openai`**

Run: `pnpm --filter @casso-ledger/backend add openai`

- [ ] **Step 2: Create `ai-chat-provider.port.ts`** — the port `CopilotChatUseCase` depends on; no `openai` types leak past this file's boundary into `application/`'s other files (this file itself may reference the SDK's types for the shared vocabulary, but nothing else in `application/` imports `openai` directly):

```typescript
export interface AIToolCall {
  id: string;
  name: string;
  /** Already-parsed JSON — the adapter is responsible for parsing the provider's raw string arguments and throwing a clear error on malformed JSON. */
  arguments: Record<string, unknown>;
}

export interface AIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  toolCalls?: AIToolCall[];
  toolCallId?: string; // set when role === 'tool'
}

export interface AIToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AIChatCompletionResult {
  content: string | null;
  toolCalls: AIToolCall[];
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface IAIChatProvider {
  createChatCompletion(messages: AIChatMessage[], tools: AIToolSpec[]): Promise<AIChatCompletionResult>;
}

export const AI_CHAT_PROVIDER = Symbol('AI_CHAT_PROVIDER');
```

- [ ] **Step 3: Create `openai-chat-provider.adapter.ts`** in `infrastructure/` — the ONLY file in this module that imports the `openai` SDK:

```typescript
import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import {
  AIChatCompletionResult,
  AIChatMessage,
  AIToolSpec,
  IAIChatProvider,
} from '../application/ai-chat-provider.port';

@Injectable()
export class OpenAiChatProviderAdapter implements IAIChatProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.AI_PROVIDER_API_KEY ?? '',
      baseURL: process.env.AI_PROVIDER_BASE_URL, // e.g. https://openrouter.ai/api/v1 — omit for the real OpenAI API
    });
    this.model = process.env.AI_PROVIDER_MODEL ?? 'gpt-4o-mini';
  }

  async createChatCompletion(messages: AIChatMessage[], tools: AIToolSpec[]): Promise<AIChatCompletionResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((m) => this.toOpenAiMessage(m)),
      tools: tools.length
        ? tools.map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.parameters } }))
        : undefined,
      tool_choice: tools.length ? 'auto' : undefined,
    });

    const choice = response.choices[0];
    const rawToolCalls = choice.message.tool_calls ?? [];

    return {
      content: choice.message.content,
      toolCalls: rawToolCalls.map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: this.parseArguments(call.function.arguments, call.function.name),
      })),
      inputTokens: response.usage?.prompt_tokens ?? null,
      outputTokens: response.usage?.completion_tokens ?? null,
    };
  }

  private parseArguments(raw: string, toolName: string): Record<string, unknown> {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error(`Copilot model returned malformed JSON arguments for tool "${toolName}"`);
    }
  }

  private toOpenAiMessage(message: AIChatMessage): OpenAI.Chat.ChatCompletionMessageParam {
    if (message.role === 'tool') {
      return { role: 'tool', tool_call_id: message.toolCallId ?? '', content: message.content ?? '' };
    }
    if (message.role === 'assistant' && message.toolCalls?.length) {
      return {
        role: 'assistant',
        content: message.content,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function' as const,
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        })),
      };
    }
    return { role: message.role, content: message.content ?? '' } as OpenAI.Chat.ChatCompletionMessageParam;
  }
}
```

- [ ] **Step 4: Write failing tests for `CopilotChatUseCase`** — mock `IAIChatProvider` (the port, not the SDK) so these tests exercise the loop's decision logic, not HTTP/SDK plumbing:

```typescript
import { CopilotChatUseCase } from './copilot-chat.usecase';
import { CopilotToolRegistry } from './copilot-tool-registry';
import { GetReceivableSummaryTool } from './tools/get-receivable-summary.tool';
import { GetCollectionActivityTimelineTool } from './tools/get-collection-activity-timeline.tool';
import { GetPaymentHistoryTool } from './tools/get-payment-history.tool';
import { DraftReminderEmailTool } from './tools/draft-reminder-email.tool';
import { Role } from '../../organizations/domain/membership';

function buildRegistry() {
  const registry = new CopilotToolRegistry();
  registry.register({ name: 'getReceivableSummary', description: 'x', inputSchema: { type: 'object', properties: {}, required: [] }, requiresReminderPermission: false });
  registry.register({ name: 'getCollectionActivityTimeline', description: 'x', inputSchema: { type: 'object', properties: {}, required: [] }, requiresReminderPermission: false });
  registry.register({ name: 'getPaymentHistory', description: 'x', inputSchema: { type: 'object', properties: {}, required: [] }, requiresReminderPermission: false });
  registry.register({ name: 'draftReminderEmail', description: 'x', inputSchema: { type: 'object', properties: {}, required: [] }, requiresReminderPermission: true });
  registry.register({ name: 'sendReminderEmail', description: 'x', inputSchema: { type: 'object', properties: {}, required: [] }, requiresReminderPermission: true });
  return registry;
}

function buildDeps(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    summaryTool: { execute: jest.fn() },
    timelineTool: { execute: jest.fn() },
    paymentHistoryTool: { execute: jest.fn() },
    draftTool: { execute: jest.fn() },
    conversationRepo: {
      findOrCreate: jest.fn().mockResolvedValue({ id: 'conv-1' }),
      listMessages: jest.fn().mockResolvedValue([]),
      appendMessage: jest.fn().mockImplementation((m) => Promise.resolve({ id: 'm-1', ...m })),
    },
    pendingActionRepo: { create: jest.fn() },
    usageLogRepo: { log: jest.fn() },
    planLimitService: { enforceCopilotChatLimit: jest.fn() },
    dataSource: { transaction: jest.fn().mockImplementation((cb) => cb({})) },
    tenantContext: { getCurrentUser: () => ({ userId: 'u1', organizationId: 'org-1', role: Role.FINANCE_MANAGER }) },
    ...overrides,
  };
}

describe('CopilotChatUseCase', () => {
  it('loops across multiple tool rounds before answering — first getReceivableSummary, then getCollectionActivityTimeline, then a final answer', async () => {
    const aiProvider = { createChatCompletion: jest.fn() };
    aiProvider.createChatCompletion
      .mockResolvedValueOnce({ content: null, toolCalls: [{ id: 't1', name: 'getReceivableSummary', arguments: { customerId: 'cust-1' } }], inputTokens: 10, outputTokens: 5 })
      .mockResolvedValueOnce({ content: null, toolCalls: [{ id: 't2', name: 'getCollectionActivityTimeline', arguments: { customerId: 'cust-1', limit: 10 } }], inputTokens: 20, outputTokens: 8 })
      .mockResolvedValueOnce({ content: 'Customer cust-1 has 2 overdue invoices and 3 recent activities.', toolCalls: [], inputTokens: 30, outputTokens: 15 });

    const deps = buildDeps();
    deps.summaryTool.execute.mockResolvedValue({ overdueCount: 2 });
    deps.timelineTool.execute.mockResolvedValue({ items: [1, 2, 3] });

    const useCase = new CopilotChatUseCase(
      aiProvider as any, buildRegistry(), deps.summaryTool as any, deps.timelineTool as any,
      deps.paymentHistoryTool as any, deps.draftTool as any, deps.conversationRepo as any,
      deps.pendingActionRepo as any, deps.usageLogRepo as any, deps.planLimitService as any,
      deps.dataSource as any, deps.tenantContext as any,
    );

    const result = await useCase.execute({ conversationId: 'conv-1', userMessage: 'How is customer cust-1 doing?' });

    expect(result.pendingAction).toBeNull();
    expect(result.message.content).toContain('overdue');
    expect(aiProvider.createChatCompletion).toHaveBeenCalledTimes(3); // proves this is a real multi-round loop
    expect(deps.summaryTool.execute).toHaveBeenCalledWith({ customerId: 'cust-1' });
    expect(deps.timelineTool.execute).toHaveBeenCalledWith({ customerId: 'cust-1', limit: 10 });
    expect(deps.pendingActionRepo.create).not.toHaveBeenCalled();
    expect(deps.usageLogRepo.log).toHaveBeenCalledTimes(3);
    expect(deps.planLimitService.enforceCopilotChatLimit).toHaveBeenCalledTimes(1);
  });

  it('halts on sendReminderEmail and creates a CopilotPendingAction instead of executing anything or calling the model again', async () => {
    const aiProvider = { createChatCompletion: jest.fn() };
    aiProvider.createChatCompletion.mockResolvedValueOnce({
      content: 'Proposing to send.',
      toolCalls: [{ id: 't3', name: 'sendReminderEmail', arguments: { draftId: 'draft-1', receivableId: 'rec-1' } }],
      inputTokens: 40, outputTokens: 12,
    });

    const deps = buildDeps();
    deps.pendingActionRepo.create.mockResolvedValue({
      id: 'pa-1', actionType: 'SEND_REMINDER_EMAIL', status: 'PENDING',
      payload: { draftId: 'draft-1', receivableId: 'rec-1' }, createdAt: new Date('2026-08-03T10:00:00Z'), resolvedAt: null,
    });

    const useCase = new CopilotChatUseCase(
      aiProvider as any, buildRegistry(), deps.summaryTool as any, deps.timelineTool as any,
      deps.paymentHistoryTool as any, deps.draftTool as any, deps.conversationRepo as any,
      deps.pendingActionRepo as any, deps.usageLogRepo as any, deps.planLimitService as any,
      deps.dataSource as any, deps.tenantContext as any,
    );

    const result = await useCase.execute({ conversationId: 'conv-1', userMessage: 'Send the reminder for draft-1' });

    expect(result.pendingAction).toMatchObject({ id: 'pa-1', status: 'PENDING' });
    expect(deps.pendingActionRepo.create).toHaveBeenCalledWith('conv-1', { draftId: 'draft-1', receivableId: 'rec-1' });
    expect(aiProvider.createChatCompletion).toHaveBeenCalledTimes(1); // loop halted — no second round
    expect(deps.usageLogRepo.log).toHaveBeenCalledTimes(1);
  });

  it('rejects the turn with PLAN_LIMIT_EXCEEDED before ever calling the AI provider, when the org is over its monthly chat quota', async () => {
    const aiProvider = { createChatCompletion: jest.fn() };
    const deps = buildDeps();
    deps.planLimitService.enforceCopilotChatLimit.mockRejectedValue(
      Object.assign(new Error('over limit'), { errorCode: 'PLAN_LIMIT_EXCEEDED' }),
    );

    const useCase = new CopilotChatUseCase(
      aiProvider as any, buildRegistry(), deps.summaryTool as any, deps.timelineTool as any,
      deps.paymentHistoryTool as any, deps.draftTool as any, deps.conversationRepo as any,
      deps.pendingActionRepo as any, deps.usageLogRepo as any, deps.planLimitService as any,
      deps.dataSource as any, deps.tenantContext as any,
    );

    await expect(useCase.execute({ conversationId: 'conv-1', userMessage: 'hi' })).rejects.toMatchObject({ errorCode: 'PLAN_LIMIT_EXCEEDED' });
    expect(aiProvider.createChatCompletion).not.toHaveBeenCalled();
  });

  it('retries exactly once on a provider timeout, then logs and rethrows on a second failure', async () => {
    const aiProvider = { createChatCompletion: jest.fn() };
    aiProvider.createChatCompletion.mockRejectedValueOnce(new Error('timeout')).mockRejectedValueOnce(new Error('timeout again'));
    const deps = buildDeps();

    const useCase = new CopilotChatUseCase(
      aiProvider as any, buildRegistry(), deps.summaryTool as any, deps.timelineTool as any,
      deps.paymentHistoryTool as any, deps.draftTool as any, deps.conversationRepo as any,
      deps.pendingActionRepo as any, deps.usageLogRepo as any, deps.planLimitService as any,
      deps.dataSource as any, deps.tenantContext as any,
    );

    await expect(useCase.execute({ conversationId: 'conv-1', userMessage: 'hi' })).rejects.toThrow('timeout again');
    expect(aiProvider.createChatCompletion).toHaveBeenCalledTimes(2); // exactly one retry
    expect(deps.usageLogRepo.log).toHaveBeenCalledTimes(2); // both attempts logged, including the failure
    expect(deps.usageLogRepo.log.mock.calls.every(([entry]) => entry.isError || entry === deps.usageLogRepo.log.mock.calls[0][0])).toBeTruthy();
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test copilot-chat.usecase.spec.ts`
Expected: FAIL — Cannot find module './copilot-chat.usecase'

- [ ] **Step 6: Create `copilot-chat.usecase.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AI_CHAT_PROVIDER, type IAIChatProvider, type AIChatMessage } from './ai-chat-provider.port';
import { CopilotToolRegistry } from './copilot-tool-registry';
import { GetReceivableSummaryTool } from './tools/get-receivable-summary.tool';
import { GetCollectionActivityTimelineTool } from './tools/get-collection-activity-timeline.tool';
import { GetPaymentHistoryTool } from './tools/get-payment-history.tool';
import { DraftReminderEmailTool } from './tools/draft-reminder-email.tool';
import { ICopilotConversationRepository, COPILOT_CONVERSATION_REPOSITORY } from './conversation-repository.port';
import { ICopilotPendingActionRepository, COPILOT_PENDING_ACTION_REPOSITORY } from './pending-action-repository.port';
import { IAIUsageLogRepository, AI_USAGE_LOG_REPOSITORY } from './ai-usage-log-repository.port';
import { PlanLimitService } from '../../billing/application/plan-limit.service';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { ROLE_PERMISSIONS } from '../../../common/rbac/role-permissions.map';
import { Permission } from '../../../common/rbac/permission.enum';
import { CopilotMessageDto, CopilotPendingActionDto, toCopilotMessageDto, toCopilotPendingActionDto } from '../presentation/dto/copilot-response.dto';

const PROMPT_VERSION = 'copilot-v1';
const MODEL_CALL_TIMEOUT_MS = 15_000;
const MAX_TOOL_ITERATIONS = 5;

const SYSTEM_PROMPT = [
  'You are an AI assistant for collections accounting (Collection Copilot).',
  'You may ONLY answer based on structured JSON data returned by read tools — do not invent figures.',
  'If the user wants to send a reminder email, call draftReminderEmail first to create a draft, then call sendReminderEmail to propose sending it — the user must separately confirm the actual send; you do not send it yourself.',
  'You have neither permission nor tools to write off receivables, allocate payments, or handle disputes — if the user asks, direct them to the standard interface.',
].join(' ');

export interface CopilotChatInput {
  conversationId: string;
  userMessage: string;
}

export interface CopilotChatResult {
  message: CopilotMessageDto;
  pendingAction: CopilotPendingActionDto | null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Copilot model call timed out')), ms)),
  ]);
}

@Injectable()
export class CopilotChatUseCase {
  constructor(
    @Inject(AI_CHAT_PROVIDER) private readonly aiProvider: IAIChatProvider,
    private readonly toolRegistry: CopilotToolRegistry,
    private readonly getReceivableSummaryTool: GetReceivableSummaryTool,
    private readonly getCollectionActivityTimelineTool: GetCollectionActivityTimelineTool,
    private readonly getPaymentHistoryTool: GetPaymentHistoryTool,
    private readonly draftReminderEmailTool: DraftReminderEmailTool,
    @Inject(COPILOT_CONVERSATION_REPOSITORY) private readonly conversationRepo: ICopilotConversationRepository,
    @Inject(COPILOT_PENDING_ACTION_REPOSITORY) private readonly pendingActionRepo: ICopilotPendingActionRepository,
    @Inject(AI_USAGE_LOG_REPOSITORY) private readonly usageLogRepo: IAIUsageLogRepository,
    private readonly planLimitService: PlanLimitService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  private async callModel(messages: AIChatMessage[], tools: ReturnType<CopilotToolRegistry['getTools']>, conversationId: string) {
    const start = Date.now();
    try {
      const response = await withTimeout(
        this.aiProvider.createChatCompletion(
          messages,
          tools.map((t) => ({ name: t.function.name, description: t.function.description, parameters: t.function.parameters })),
        ),
        MODEL_CALL_TIMEOUT_MS,
      );
      await this.usageLogRepo.log({
        conversationId, model: process.env.AI_PROVIDER_MODEL ?? 'gpt-4o-mini', promptVersion: PROMPT_VERSION,
        inputTokens: response.inputTokens, outputTokens: response.outputTokens,
        latencyMs: Date.now() - start, toolCallsCount: response.toolCalls.length, isError: false,
      });
      return response;
    } catch (error) {
      await this.usageLogRepo.log({
        conversationId, model: process.env.AI_PROVIDER_MODEL ?? 'gpt-4o-mini', promptVersion: PROMPT_VERSION,
        inputTokens: null, outputTokens: null, latencyMs: Date.now() - start, toolCallsCount: 0, isError: true,
      });
      throw error;
    }
  }

  private async callModelWithRetry(messages: AIChatMessage[], tools: ReturnType<CopilotToolRegistry['getTools']>, conversationId: string) {
    try {
      return await this.callModel(messages, tools, conversationId);
    } catch {
      return this.callModel(messages, tools, conversationId); // exactly one automatic retry
    }
  }

  private async executeReadOrDraftTool(name: string, input: Record<string, unknown>, organizationId: string): Promise<unknown> {
    switch (name) {
      case GetReceivableSummaryTool.NAME:
        return this.getReceivableSummaryTool.execute(input as { customerId: string });
      case GetCollectionActivityTimelineTool.NAME:
        return this.getCollectionActivityTimelineTool.execute(input as { customerId: string; limit?: number });
      case GetPaymentHistoryTool.NAME:
        return this.getPaymentHistoryTool.execute(input as { customerId: string; limit?: number });
      case DraftReminderEmailTool.NAME:
        return this.draftReminderEmailTool.execute(input as { receivableId: string; tone?: 'polite' | 'urgent' }, organizationId);
      case 'sendReminderEmail':
        throw new Error('sendReminderEmail must be intercepted before normal tool execution');
      default:
        throw new Error(`Unknown Copilot tool "${name}"`);
    }
  }

  async execute(input: CopilotChatInput): Promise<CopilotChatResult> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new Error('CopilotChatUseCase requires an authenticated tenant context');
    }
    const canSendReminders = ROLE_PERMISSIONS[user.role].includes(Permission.REMINDER_SEND_MANUAL);

    // Step 2 of the loop description: one short transaction, no AI provider
    // call inside it — plan-limit check + persisting the user's message only.
    await this.dataSource.transaction(async (manager) => {
      await this.planLimitService.enforceCopilotChatLimit(manager);
      await this.conversationRepo.findOrCreate(input.conversationId, user.userId);
      await this.conversationRepo.appendMessage(
        { conversationId: input.conversationId, role: 'USER', content: input.userMessage, toolCalls: null, createdAt: new Date() },
        manager,
      );
    });

    const history = await this.conversationRepo.listMessages(input.conversationId);
    const messages: AIChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.map((m): AIChatMessage => ({
        role: m.role === 'ASSISTANT' ? 'assistant' : m.role === 'TOOL' ? 'tool' : 'user',
        content: m.content,
      })),
    ];

    const tools = this.toolRegistry.getTools(canSendReminders);

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
      const response = await this.callModelWithRetry(messages, tools, input.conversationId);

      const sendCall = response.toolCalls.find((call) => call.name === 'sendReminderEmail');
      if (sendCall) {
        const draftId = sendCall.arguments.draftId as string | undefined;
        const receivableId = sendCall.arguments.receivableId as string | undefined;
        if (!draftId || !receivableId) {
          throw new Error('sendReminderEmail requires draftId and receivableId');
        }
        const pendingAction = await this.pendingActionRepo.create(input.conversationId, { draftId, receivableId });
        const saved = await this.conversationRepo.appendMessage({
          conversationId: input.conversationId, role: 'ASSISTANT', content: response.content ?? '',
          toolCalls: response.toolCalls.map((c) => ({ id: c.id, name: c.name, input: c.arguments })), createdAt: new Date(),
        });
        return { message: toCopilotMessageDto(saved), pendingAction: toCopilotPendingActionDto(pendingAction) };
      }

      if (response.toolCalls.length === 0) {
        const saved = await this.conversationRepo.appendMessage({
          conversationId: input.conversationId, role: 'ASSISTANT', content: response.content ?? '', toolCalls: null, createdAt: new Date(),
        });
        return { message: toCopilotMessageDto(saved), pendingAction: null };
      }

      const toolResults = await Promise.all(
        response.toolCalls.map(async (call) => ({
          id: call.id,
          result: await this.executeReadOrDraftTool(call.name, call.arguments, user.organizationId),
        })),
      );

      messages.push({
        role: 'assistant', content: response.content,
        toolCalls: response.toolCalls.map((c) => ({ id: c.id, name: c.name, arguments: c.arguments })),
      });
      for (const { id, result } of toolResults) {
        messages.push({ role: 'tool', content: JSON.stringify(result), toolCallId: id });
      }
    }

    throw new Error('Copilot exceeded the maximum number of tool-use iterations for a single turn');
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test copilot-chat.usecase.spec.ts`
Expected: all 4 tests PASS

- [ ] **Step 8: Commit**

```bash
git add apps/backend/package.json apps/backend/src/modules/copilot/application/ai-chat-provider.port.ts apps/backend/src/modules/copilot/infrastructure/openai-chat-provider.adapter.ts apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts apps/backend/src/modules/copilot/application/copilot-chat.usecase.spec.ts
git commit -m "feat: add IAIChatProvider port + OpenAI adapter, and a real multi-round CopilotChatUseCase agent loop"
```

---

### Task 11: `CopilotController` (idempotency-wrapped), `CopilotModule` wiring

**Files:**
- Create: `apps/backend/src/modules/copilot/presentation/dto/copilot-response.dto.ts`
- Create: `apps/backend/src/modules/copilot/presentation/dto/post-copilot-message.dto.ts`
- Create: `apps/backend/src/modules/copilot/presentation/copilot.controller.ts`
- Create: `apps/backend/src/modules/copilot/copilot.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `CopilotChatUseCase` (Task 10), `ConfirmPendingActionUseCase`/`CancelPendingActionUseCase` (Task 9), `JwtAuthGuard`/`PermissionGuard`/`RequirePermission`, `IdempotencyService`
- Produces: `POST /api/v1/copilot/conversations/:id/messages`, `POST /api/v1/copilot/actions/:actionId/confirm`, `POST /api/v1/copilot/actions/:id/cancel`

**Idempotency (2026-08-09 fix):** the original plan didn't wrap `/confirm`/`/cancel` in `IdempotencyService.execute()` despite both being side-effecting POSTs — every other write endpoint in this codebase does. Both now require an `Idempotency-Key` header, matching `receivables.controller.ts`/`payments.controller.ts`'s existing pattern exactly. `/messages` is also side-effecting (it persists messages and counts against the Billing quota) and gets the same treatment.

- [ ] **Step 1: Create `copilot-response.dto.ts`**

```typescript
import { CopilotMessageRecord } from '../../application/conversation-repository.port';
import { CopilotPendingAction } from '../../application/pending-action-repository.port';

export interface CopilotMessageDto {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
}

export interface CopilotPendingActionDto {
  id: string;
  actionType: 'SEND_REMINDER_EMAIL';
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
  payload: { draftId: string; receivableId: string };
  createdAt: string;
  resolvedAt: string | null;
}

export const toCopilotMessageDto = (message: CopilotMessageRecord): CopilotMessageDto => ({
  id: message.id,
  role: message.role === 'TOOL' ? 'ASSISTANT' : message.role,
  content: message.content,
  createdAt: message.createdAt.toISOString(),
});

export const toCopilotPendingActionDto = (action: CopilotPendingAction): CopilotPendingActionDto => ({
  id: action.id,
  actionType: action.actionType,
  status: action.status,
  payload: action.payload,
  createdAt: action.createdAt.toISOString(),
  resolvedAt: action.resolvedAt?.toISOString() ?? null,
});
```

- [ ] **Step 2: Create `post-copilot-message.dto.ts`**

```typescript
import { IsNotEmpty, IsString } from 'class-validator';

export class PostCopilotMessageDto {
  @IsString()
  @IsNotEmpty()
  content: string;
}
```

- [ ] **Step 3: Create `copilot.controller.ts`** — every handler wrapped with `IdempotencyService.execute`, following `receivables.controller.ts`'s exact idiom:

```typescript
import { Body, Controller, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CopilotChatUseCase } from '../application/copilot-chat.usecase';
import { ConfirmPendingActionUseCase } from '../application/confirm-pending-action.usecase';
import { CancelPendingActionUseCase } from '../application/cancel-pending-action.usecase';
import { PostCopilotMessageDto } from './dto/post-copilot-message.dto';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { Permission } from '../../../common/rbac/permission.enum';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';

@Controller('copilot')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class CopilotController {
  constructor(
    private readonly copilotChatUseCase: CopilotChatUseCase,
    private readonly confirmPendingActionUseCase: ConfirmPendingActionUseCase,
    private readonly cancelPendingActionUseCase: CancelPendingActionUseCase,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('conversations/:id/messages')
  @RequirePermission(Permission.RECEIVABLE_READ)
  async postMessage(
    @Param('id') conversationId: string,
    @Body() dto: PostCopilotMessageDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.idempotency.execute(
      `POST /copilot/conversations/${conversationId}/messages`,
      idempotencyKey,
      dto,
      () => this.copilotChatUseCase.execute({ conversationId, userMessage: dto.content }),
    );
  }

  @Post('actions/:actionId/confirm')
  @RequirePermission(Permission.REMINDER_SEND_MANUAL)
  async confirm(
    @Param('actionId') actionId: string,
    @Req() req: Request,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.idempotency.execute(
      'POST /copilot/actions/:id/confirm',
      idempotencyKey,
      { actionId },
      () => this.confirmPendingActionUseCase.execute(actionId, user.userId),
    );
  }

  @Post('actions/:actionId/cancel')
  @RequirePermission(Permission.REMINDER_SEND_MANUAL)
  async cancel(
    @Param('actionId') actionId: string,
    @Req() req: Request,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.idempotency.execute(
      'POST /copilot/actions/:id/cancel',
      idempotencyKey,
      { actionId },
      () => this.cancelPendingActionUseCase.execute(actionId, user.userId),
    );
  }
}
```

`IdempotencyService.execute<T>(endpoint: string, key: string | undefined, input: unknown, operation: () => Promise<T>)` — 4 params, `endpoint` is a fixed per-route string identifier (not the URL params), `key` is `string | undefined` (optional header, lowercase `idempotency-key`), matching `receivables.controller.ts`'s exact live signature (verified against source during this revision, corrected from an earlier 3-param guess).

`postMessage` is gated by `Permission.RECEIVABLE_READ` only — chatting (including seeing a drafted reminder in the assistant's text) requires just read access; `CopilotChatUseCase` itself decides per-message, via `ROLE_PERMISSIONS`, whether the `draftReminderEmail`/`sendReminderEmail` tools are even visible to the model for this user. Only the confirm endpoint — the one that can trigger an actual send — is gated by `Permission.REMINDER_SEND_MANUAL`.

- [ ] **Step 4: Create `copilot.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CopilotConversationOrmEntity } from './infrastructure/copilot-conversation.orm-entity';
import { CopilotMessageOrmEntity } from './infrastructure/copilot-message.orm-entity';
import { CopilotPendingActionOrmEntity } from './infrastructure/copilot-pending-action.orm-entity';
import { CopilotDraftOrmEntity } from './infrastructure/copilot-draft.orm-entity';
import { AIUsageLogOrmEntity } from './infrastructure/ai-usage-log.orm-entity';
import { TypeOrmCopilotConversationRepository } from './infrastructure/typeorm-copilot-conversation.repository';
import { TypeOrmCopilotPendingActionRepository } from './infrastructure/typeorm-copilot-pending-action.repository';
import { TypeOrmCopilotDraftRepository } from './infrastructure/typeorm-copilot-draft.repository';
import { TypeOrmAIUsageLogRepository } from './infrastructure/typeorm-ai-usage-log.repository';
import { OpenAiChatProviderAdapter } from './infrastructure/openai-chat-provider.adapter';
import { COPILOT_CONVERSATION_REPOSITORY } from './application/conversation-repository.port';
import { COPILOT_PENDING_ACTION_REPOSITORY } from './application/pending-action-repository.port';
import { COPILOT_DRAFT_REPOSITORY } from './application/draft-repository.port';
import { AI_USAGE_LOG_REPOSITORY } from './application/ai-usage-log-repository.port';
import { AI_CHAT_PROVIDER } from './application/ai-chat-provider.port';
import { CopilotToolRegistry } from './application/copilot-tool-registry';
import { GET_RECEIVABLE_SUMMARY_SCHEMA, GetReceivableSummaryTool } from './application/tools/get-receivable-summary.tool';
import { GET_COLLECTION_ACTIVITY_TIMELINE_SCHEMA, GetCollectionActivityTimelineTool } from './application/tools/get-collection-activity-timeline.tool';
import { GET_PAYMENT_HISTORY_SCHEMA, GetPaymentHistoryTool } from './application/tools/get-payment-history.tool';
import { DRAFT_REMINDER_EMAIL_SCHEMA, DraftReminderEmailTool } from './application/tools/draft-reminder-email.tool';
import { SEND_REMINDER_EMAIL_SCHEMA, SendReminderEmailTool } from './application/tools/send-reminder-email.tool';
import { CopilotChatUseCase } from './application/copilot-chat.usecase';
import { ConfirmPendingActionUseCase } from './application/confirm-pending-action.usecase';
import { CancelPendingActionUseCase } from './application/cancel-pending-action.usecase';
import { CopilotController } from './presentation/copilot.controller';
import { ReceivablesModule } from '../receivables/receivables.module';
import { CustomersModule } from '../customers/customers.module';
import { CollectionActivityModule } from '../collection-activity/collection-activity.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailTemplatesModule } from '../email-templates/email-templates.module';
import { RemindersModule } from '../reminders/reminders.module';
import { BillingModule } from '../billing/billing.module';

function copilotToolRegistryFactory(): CopilotToolRegistry {
  const registry = new CopilotToolRegistry();
  registry.register({ name: GetReceivableSummaryTool.NAME, description: 'Summarize a customer receivable using precomputed structured data.', inputSchema: GET_RECEIVABLE_SUMMARY_SCHEMA, requiresReminderPermission: false });
  registry.register({ name: GetCollectionActivityTimelineTool.NAME, description: "A customer's collection activity history.", inputSchema: GET_COLLECTION_ACTIVITY_TIMELINE_SCHEMA, requiresReminderPermission: false });
  registry.register({ name: GetPaymentHistoryTool.NAME, description: "A customer's payment history.", inputSchema: GET_PAYMENT_HISTORY_SCHEMA, requiresReminderPermission: false });
  registry.register({ name: DraftReminderEmailTool.NAME, description: 'Create a payment reminder email draft for a receivable — do NOT send the email.', inputSchema: DRAFT_REMINDER_EMAIL_SCHEMA, requiresReminderPermission: true });
  registry.register({ name: SendReminderEmailTool.NAME, description: 'Propose sending a previously created reminder email draft — the user must separately confirm the actual send.', inputSchema: SEND_REMINDER_EMAIL_SCHEMA, requiresReminderPermission: true });
  return registry;
}

@Module({
  imports: [
    TypeOrmModule.forFeature([CopilotConversationOrmEntity, CopilotMessageOrmEntity, CopilotPendingActionOrmEntity, CopilotDraftOrmEntity, AIUsageLogOrmEntity]),
    ReceivablesModule,
    CustomersModule,
    CollectionActivityModule,
    PaymentsModule,
    NotificationsModule,
    EmailTemplatesModule,
    RemindersModule,
    BillingModule,
  ],
  controllers: [CopilotController],
  providers: [
    { provide: COPILOT_CONVERSATION_REPOSITORY, useClass: TypeOrmCopilotConversationRepository },
    { provide: COPILOT_PENDING_ACTION_REPOSITORY, useClass: TypeOrmCopilotPendingActionRepository },
    { provide: COPILOT_DRAFT_REPOSITORY, useClass: TypeOrmCopilotDraftRepository },
    { provide: AI_USAGE_LOG_REPOSITORY, useClass: TypeOrmAIUsageLogRepository },
    { provide: AI_CHAT_PROVIDER, useClass: OpenAiChatProviderAdapter },
    { provide: CopilotToolRegistry, useFactory: copilotToolRegistryFactory },
    GetReceivableSummaryTool,
    GetCollectionActivityTimelineTool,
    GetPaymentHistoryTool,
    DraftReminderEmailTool,
    CopilotChatUseCase,
    ConfirmPendingActionUseCase,
    CancelPendingActionUseCase,
  ],
})
export class CopilotModule {}
```

(Confirm the exact export names of `CollectionActivityModule`/`PaymentsModule`/`BillingModule` before wiring — this plan assumes the same `<Domain>Module` naming convention every other module in this file structure already uses; verify rather than guess.)

`EmailTemplatesModule`/`RemindersModule`/`BillingModule` are imported directly (no `forwardRef` needed) because none of them imports `CopilotModule` back.

- [ ] **Step 5: Register `CopilotModule` in `app.module.ts`**

- [ ] **Step 6: Add the new env vars to `.env.example`** — `AI_PROVIDER_API_KEY`, `AI_PROVIDER_BASE_URL`, `AI_PROVIDER_MODEL` (placeholder values, per this repo's `.env.example` convention).

- [ ] **Step 7: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/copilot/presentation apps/backend/src/modules/copilot/copilot.module.ts apps/backend/src/app.module.ts apps/backend/.env.example
git commit -m "feat: wire CopilotController (idempotency-wrapped) + CopilotModule, register it in AppModule"
```

---

### Task 12: Integration test — multi-round tool loop, confirm/cancel, quota, idempotency

**Files:**
- Create: `apps/backend/test/copilot-chat.integration.spec.ts`

**Interfaces:**
- Consumes: full `AppModule` (Tasks 1-11), real Postgres + Redis via testcontainers, mocked `IAIChatProvider` (bound via `.overrideProvider(AI_CHAT_PROVIDER)`, never a real network call), mocked `EMAIL_PROVIDER_ADAPTER`
- Produces: end-to-end proof of the scenarios below, asserted against the REAL `reminder_executions` table

- [ ] **Step 1: Write the integration test covering:**
  1. A read-only question that triggers 2 tool rounds (e.g. `getReceivableSummary` then `getCollectionActivityTimeline`) before the final answer — asserts `reminderExecutions` stays empty and the mocked provider was called exactly 3 times (2 tool rounds + 1 final).
  2. Draft → propose-send → confirm: asserts exactly one `ReminderExecution` row is created, `reminderRuleId` is `null`, and a second confirm attempt on the same action 409s via `AppError(CONFLICT)` without creating a second row.
  3. Draft → propose-send → cancel: asserts no `ReminderExecution` row is created and a second cancel attempt 409s.
  4. Sending the SAME `Idempotency-Key` header on two concurrent `/confirm` requests for the same action: asserts only one `ReminderExecution` row exists and `EmailService.sendReminderEmail`-equivalent evidence (the mocked email adapter) was invoked once — proves the atomic `confirmIfPending` claim, not just `IdempotencyService`, is what prevents the double-send (this test should race two real concurrent HTTP requests, not two sequential ones, to actually exercise the fix from Task 9).
  5. Sending 51 chat messages within the same billing period on a FREE-plan organization: the 51st returns 402 `PLAN_LIMIT_EXCEEDED` and the mocked AI provider is never called for that 51st request.

- [ ] **Step 2: Run the integration test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- copilot-chat.integration.spec.ts`
Expected: all scenarios PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/copilot-chat.integration.spec.ts
git commit -m "test: add end-to-end proof of Copilot's multi-round loop, race-safe confirm, and chat-quota gate"
```

---

## Self-Review Notes

- **Spec coverage:** Hardcoded, test-proven tool whitelist (spec section 2) → Task 5. Structured-data-only read tools (spec section 1) → Task 6, now against real repositories/use cases instead of fictional ports. Draft-then-confirm flow where the model never executes the write (spec section 1 "Key point") → Tasks 7-9, proven end-to-end in Task 12, now race-safe. `AIUsageLog` on every call including errors, 15s timeout + 1 retry → Task 10. `CopilotPendingAction` 10-minute expiry → Task 9. `Permission.REMINDER_SEND_MANUAL` gating both tool visibility and the confirm/cancel endpoints → Tasks 10 and 11. No credentials in prompts/tool responses → every tool in Tasks 6-8 only ever returns `Receivable`/`Customer`/draft fields, never a `BankConnection` field. Provider choice and chat-turn gating (spec section 6, both resolved 2026-08-09) → Task 10 and Task 3 respectively.
- **Architecture correctness (this revision's main fix):** `application/` depends only on ports throughout — `IAIChatProvider` (Task 10), `ICopilotDraftRepository` (Task 4), `IPaymentAllocationRepository`/`ICollectionActivityRepository` (Tasks 1-2). The `openai` SDK is imported in exactly one file (`infrastructure/openai-chat-provider.adapter.ts`). No `@nestjs/common` HTTP exception classes remain in `application/` — every error path is `AppError`. No `application/` file injects a raw TypeORM `Repository<T>`.
- **Race/idempotency correctness:** `confirmIfPending`/`cancelIfPending` are the only mutators of `CopilotPendingAction.status`, both atomic conditional updates claimed BEFORE any side effect — the double-send TOCTOU from the original draft cannot recur. `/messages`, `/confirm`, `/cancel` all require `Idempotency-Key` and are wrapped in `IdempotencyService.execute`, matching every other side-effecting POST endpoint in this codebase.
- **No speculative scope:** the original plan's Task 1 (`IReceivableRepository.findByCustomerId`) is gone — `findOpenByCustomerId` already existed and covers `getReceivableSummary`'s exact need. The two genuinely-new repository methods added (Tasks 1-2 of this revision) exist because the capabilities they provide (bounded timeline reads, customer-scoped payment history) had no real backing anywhere in the codebase — not because more surface area seemed nice to have.
- **Type/token consistency:** `EmailService.sendReminderEmail`'s exact signature `{ receivableId, templateId, reminderExecutionId }` is used verbatim in `ConfirmPendingActionUseCase` (Task 9) — verified against the live source, no drift. `EmailTemplate`'s constructor now includes the required `version: 1` field the original draft omitted (verified against the live `EmailTemplateProps` interface, which added `version` after this plan was first drafted). `ReminderExecutionProps`'s shape was verified to match Task 9's construction exactly, no changes needed there.
