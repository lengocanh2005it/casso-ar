# Collection Copilot (AI Agent) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a chat-based AI Copilot that lets an accountant ask free-form questions about receivables/customers and, after explicit in-chat confirmation, send a single kind of reminder email — nothing else. The model (Claude, via `@anthropic-ai/sdk`) only ever sees pre-computed structured JSON from existing repositories (never raw DB rows) and a hardcoded, non-extensible tool whitelist. The one write-capable tool (`sendReminderEmail`) is never executed inside the model's turn — it is intercepted into a `CopilotPendingAction` and only runs from a separate, non-LLM confirm endpoint that calls the existing `EmailService.sendReminderEmail`.

**Architecture:** New `apps/backend/src/modules/copilot/` module (3-layer: `application`/`infrastructure`/`presentation`, no rich `domain/` — same shape as the Notifications module, since there's no business rule to encode beyond orchestration). `CopilotToolRegistry` is a hardcoded allowlist class (`SAFE_TOOL_NAMES`) that physically cannot register a tool outside that list. `CopilotChatUseCase` runs the per-turn tool loop against `@anthropic-ai/sdk`'s `client.messages.create` (mocked in unit tests, never called for real in this plan's own test suite); any `tool_use` block named `sendReminderEmail` halts the loop and creates a `CopilotPendingAction` instead of executing anything. Separate `ConfirmPendingActionUseCase` and `CancelPendingActionUseCase`, reached only via `POST /api/v1/copilot/actions/:id/confirm` and `POST /api/v1/copilot/actions/:id/cancel`, are pure code — they never touch the Anthropic client; only the confirm path calls `EmailService.sendReminderEmail` (from `2026-08-03-email-notification-service.md`). They reuse the REAL `EMAIL_TEMPLATE_REPOSITORY`/`REMINDER_EXECUTION_REPOSITORY` bindings already provided by `2026-08-03-email-template-management.md`/`2026-08-03-reminder-automation.md` (imported into `CopilotModule` directly, no circular dependency) by creating one throwaway `EmailTemplate` row (the draft's literal composed content) and one `ReminderExecution` row (`reminderRuleId: null`, marking a manual send) before calling `EmailService` — not a parallel Copilot-owned pair of tables.

**Tech Stack:** `@anthropic-ai/sdk` (model `claude-opus-5`), NestJS, TypeORM, `BaseRepository`/`TenantContextService`/`PermissionGuard` from `2026-08-03-multi-tenancy-rbac.md`, `IReceivableRepository`/`ICustomerRepository` from `2026-08-03-project-scaffolding-and-domain-core.md`, `EmailService` from `2026-08-03-email-notification-service.md`, Jest + `@testcontainers/postgresql` for the integration test (same pattern as `2026-08-03-project-scaffolding-and-domain-core.md` Task 14 and `2026-08-03-multi-tenancy-rbac.md` Task 9).

## Global Constraints

- **Hard action-whitelist boundary — quoted directly from the target spec (section 2):** *"More sensitive actions — write-off, payment allocation, dispute — must always be performed through the regular UI; no tool allows Copilot to call these actions, even after confirmation. This is a hard boundary and must not be expanded without a separate decision."* In code: `CopilotToolRegistry.SAFE_TOOL_NAMES` is a hardcoded, non-configurable array containing exactly `getReceivableSummary`, `getCollectionActivityTimeline`, `getPaymentHistory`, `draftReminderEmail`, `sendReminderEmail`. `register()` throws for any other name. There is no DI-based extensibility point, no config flag, and no code path — including confirm/cancel endpoints — that can invoke a write-off, payment-allocation, or dispute use case. This is proven by unit tests that must never be weakened or deleted.
- **The model never executes a write directly.** `sendReminderEmail` is declared to Claude as a tool so it can *propose* sending, but `CopilotChatUseCase` intercepts any `tool_use` block named `sendReminderEmail` and creates a `CopilotPendingAction` instead of running anything — it never adds a `tool_result` for it and never lets the loop continue past it (spec section 1, "Key point"). The only code path that calls `EmailService.sendReminderEmail` is `ConfirmPendingActionUseCase`, reached by `POST /api/v1/copilot/actions/:id/confirm`, which never calls the Anthropic client; `CancelPendingActionUseCase` only marks the action `CANCELLED`.
- **Structured data only, never raw rows.** Every read tool returns a small, pre-shaped JSON object (`totalOutstanding`, `maxOverdueDays`, `averageLateDays`, etc.) computed by application code from domain entities — never a serialized ORM row or raw SQL result (spec section 1).
- **Tenant scoping is automatic, not optional.** Every repository call a tool makes goes through `IReceivableRepository`/`ICustomerRepository`, which are `BaseRepository`-backed and read `organizationId` from `TenantContextService` — no tool ever accepts or forwards an `organizationId` parameter (spec section 4, and `2026-08-03-multi-tenancy-rbac.md`).
- **Hard per-turn timeout, one retry, no exceptions.** Each call to `client.messages.create` has a 15-second hard timeout; on timeout there is at most one automatic retry, then the turn fails and is reported to the caller (spec section 4).
- **`AIUsageLog` is written for every model call, success or failure.** No code path that calls the Anthropic client is allowed to skip logging (spec section 4).
- **`CopilotPendingAction` expires after 10 minutes.** `ConfirmPendingActionUseCase` rejects (and marks `EXPIRED`) any confirm attempt on a pending action older than `PENDING_ACTION_EXPIRY_MINUTES = 10`, even if the user clicks confirm late (spec section 4).
- **`Permission.REMINDER_SEND_MANUAL` gates the write action, not `RECEIVABLE_READ`.** Chatting (read-only Q&A) requires `Permission.RECEIVABLE_READ`; seeing/triggering `sendReminderEmail` in chat and calling the confirm/cancel endpoints requires `Permission.REMINDER_SEND_MANUAL` — both already exist in `2026-08-03-multi-tenancy-rbac.md`'s `Permission` enum, no new permission is added (spec section 4).
- **No credentials in prompts or tool responses.** No tool response, draft, or system prompt ever includes a `BankConnection` access token or any other credential (spec section 4).
- **No new tools beyond this plan's five**, and no dynamic/DB-driven tool registration — the whitelist is a compile-time constant, which is what makes the boundary auditable.
- Naming/layering rules from `2026-08-03-project-scaffolding-architecture-design.md` apply (kebab-case files, PascalCase classes, `application` never imports `infrastructure` types except via ports).

---

## File Structure

```
apps/backend/src/
  modules/
    copilot/
      application/
        conversation-repository.port.ts
        pending-action-repository.port.ts
        ai-usage-log-repository.port.ts
        copilot-tool-registry.ts
        copilot-tool-registry.spec.ts
        tools/
          get-receivable-summary.tool.ts
          get-collection-activity-timeline.tool.ts
          get-payment-history.tool.ts
          draft-reminder-email.tool.ts
          send-reminder-email.tool.ts
        anthropic-client.provider.ts
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
        typeorm-ai-usage-log.repository.ts
      presentation/
        dto/post-copilot-message.dto.ts
        dto/copilot-response.dto.ts
        copilot.controller.ts
      copilot.module.ts                                            -- imports EmailTemplatesModule, RemindersModule, NotificationsModule
  modules/receivables/application/receivable-repository.port.ts   -- MODIFY: add findByCustomerId
  modules/receivables/infrastructure/typeorm-receivable.repository.ts  -- MODIFY: implement findByCustomerId
  app.module.ts                                                    -- MODIFY: register CopilotModule
test/
  copilot-chat.integration.spec.ts
```

---

### Task 1: `IReceivableRepository.findByCustomerId` (shared prerequisite)

**Files:**
- Modify: `apps/backend/src/modules/receivables/application/receivable-repository.port.ts`
- Modify: `apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.ts`
- Test: `apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.spec.ts`

**Interfaces:**
- Consumes: `BaseRepository` (`2026-08-03-multi-tenancy-rbac.md` Task 5), `TenantContextService`
- Produces: `IReceivableRepository.findByCustomerId(customerId): Promise<Receivable[]>`, consumed by Task 4's `getReceivableSummary` tool

The Copilot's receivable summary tool has no customer-scoped aggregate method to call yet — `IReceivableRepository` only exposes single-row lookups. This task adds the one list method it needs.

- [ ] **Step 1: Write failing test**

Create `apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.spec.ts`:

```typescript
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { TypeOrmReceivableRepository } from './typeorm-receivable.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';

describe('TypeOrmReceivableRepository.findByCustomerId', () => {
  it('scopes the query by both customerId and the current organizationId', async () => {
    const tenantContext = new TenantContextService();
    const row = {
      id: 'rec-1',
      organizationId: 'org-1',
      customerId: 'cust-1',
      invoiceId: null,
      originalAmount: 1_000_000,
      paidAmount: 0,
      dueDate: new Date('2026-07-01'),
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: 'user-1',
      createdAt: new Date('2026-06-01'),
      closedAt: null,
    };
    const ormRepo = { find: jest.fn().mockResolvedValue([row]) };
    const repo = new TypeOrmReceivableRepository(ormRepo as any, tenantContext);

    const result = await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.ACCOUNTANT },
      () => repo.findByCustomerId('cust-1'),
    );

    expect(ormRepo.find).toHaveBeenCalledWith({
      where: { customerId: 'cust-1', organizationId: 'org-1' },
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('rec-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test typeorm-receivable.repository.spec.ts`
Expected: FAIL — `findByCustomerId` does not exist on `TypeOrmReceivableRepository`

- [ ] **Step 3: Modify `apps/backend/src/modules/receivables/application/receivable-repository.port.ts`**

```typescript
import { EntityManager } from 'typeorm';
import { Receivable } from '../domain/receivable';

export interface IReceivableRepository {
  findById(id: string): Promise<Receivable | null>;
  findByIdForUpdate(id: string, manager: EntityManager): Promise<Receivable | null>;
  findByCustomerId(customerId: string): Promise<Receivable[]>;
  save(receivable: Receivable, manager?: EntityManager): Promise<void>;
}

export const RECEIVABLE_REPOSITORY = Symbol('RECEIVABLE_REPOSITORY');
```

- [ ] **Step 4: Modify `apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.ts`** — add the method to the existing class

```typescript
  async findByCustomerId(customerId: string): Promise<Receivable[]> {
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.ormRepo.find({ where: { customerId, organizationId } });
    return rows.map((row) => new Receivable(row));
  }
```

(`this.ormRepo` and `this.tenantContext` are the `protected` members `BaseRepository` already exposes — same access pattern as this class's existing `findByIdForUpdate`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test typeorm-receivable.repository.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/receivables/application/receivable-repository.port.ts apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.ts apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.spec.ts
git commit -m "feat: add IReceivableRepository.findByCustomerId for Copilot read tools"
```

---

### Task 2: Copilot entities — conversation, message, pending action, draft, AI usage log

**Files:**
- Create: `apps/backend/src/modules/copilot/infrastructure/copilot-conversation.orm-entity.ts`
- Create: `apps/backend/src/modules/copilot/infrastructure/copilot-message.orm-entity.ts`
- Create: `apps/backend/src/modules/copilot/infrastructure/copilot-pending-action.orm-entity.ts`
- Create: `apps/backend/src/modules/copilot/infrastructure/copilot-draft.orm-entity.ts`
- Create: `apps/backend/src/modules/copilot/infrastructure/ai-usage-log.orm-entity.ts`
- Create: `apps/backend/src/modules/copilot/application/conversation-repository.port.ts`
- Create: `apps/backend/src/modules/copilot/application/pending-action-repository.port.ts`
- Create: `apps/backend/src/modules/copilot/application/ai-usage-log-repository.port.ts`
- Create: `apps/backend/src/modules/copilot/infrastructure/typeorm-copilot-conversation.repository.ts`
- Create: `apps/backend/src/modules/copilot/infrastructure/typeorm-copilot-pending-action.repository.ts`
- Create: `apps/backend/src/modules/copilot/infrastructure/typeorm-ai-usage-log.repository.ts`

**Interfaces:**
- Consumes: `BaseRepository`, `TenantContextService` (`2026-08-03-multi-tenancy-rbac.md`)
- Produces: `ICopilotConversationRepository`, `ICopilotPendingActionRepository`, `IAIUsageLogRepository` — consumed by every later task in this plan

**Persistence decision — normalized rows, not one jsonb blob per conversation:** `CopilotMessage` is one row per message (role `USER`/`ASSISTANT`/`TOOL`), not a single `messages jsonb` column on `CopilotConversation`. Justification: (1) `AIUsageLog` already needs a row per model call for audit — a per-message table keeps the same granularity instead of mixing two persistence styles in one module; (2) every other entity in this codebase (`Receivable`, `Payment`, `PaymentAllocation`, …) is a normalized TypeORM entity, not an embedded document — a jsonb blob here would be the only exception in the codebase; (3) a single growing jsonb column write-amplifies on every turn (rewrite the whole conversation to append one message) where an `INSERT` does not.

- [ ] **Step 1: Create `apps/backend/src/modules/copilot/infrastructure/copilot-conversation.orm-entity.ts`**

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

`id` is a `@PrimaryColumn` (not generated) because `CopilotChatUseCase` auto-creates the conversation row the first time a client posts to a given conversation id — see Task 7's note on lazy conversation creation.

- [ ] **Step 2: Create `apps/backend/src/modules/copilot/infrastructure/copilot-message.orm-entity.ts`**

```typescript
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type CopilotMessageRole = 'USER' | 'ASSISTANT' | 'TOOL';

@Entity({ name: 'copilot_messages' })
@Index(['conversationId', 'createdAt'])
export class CopilotMessageOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

- [ ] **Step 3: Create `apps/backend/src/modules/copilot/infrastructure/copilot-pending-action.orm-entity.ts`**

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

- [ ] **Step 4: Create `apps/backend/src/modules/copilot/infrastructure/copilot-draft.orm-entity.ts`**

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

`CopilotDraftOrmEntity` is what `draftReminderEmail` writes and what `ConfirmPendingActionUseCase` (Task 8) reads back to build a real, throwaway `EmailTemplate` row once the user confirms — see Task 8's note. The canonical field is `bodyHtml`, matching the Email Template contract.

- [ ] **Step 5: Create `apps/backend/src/modules/copilot/infrastructure/ai-usage-log.orm-entity.ts`**

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

- [ ] **Step 6: Create the three ports**

`apps/backend/src/modules/copilot/application/conversation-repository.port.ts`:

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
  appendMessage(message: Omit<CopilotMessageRecord, 'id'>): Promise<CopilotMessageRecord>;
}

export const COPILOT_CONVERSATION_REPOSITORY = Symbol('COPILOT_CONVERSATION_REPOSITORY');
```

`apps/backend/src/modules/copilot/application/pending-action-repository.port.ts`:

```typescript
import {
  CopilotPendingActionStatus,
  SendReminderEmailPayload,
} from '../infrastructure/copilot-pending-action.orm-entity';

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
  save(action: CopilotPendingAction): Promise<void>;
  cancelIfPending(id: string, resolvedByUserId: string): Promise<CopilotPendingAction | null>;
}

export const COPILOT_PENDING_ACTION_REPOSITORY = Symbol('COPILOT_PENDING_ACTION_REPOSITORY');
```

`apps/backend/src/modules/copilot/application/ai-usage-log-repository.port.ts`:

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

- [ ] **Step 7: Create the three TypeORM implementations**

`apps/backend/src/modules/copilot/infrastructure/typeorm-copilot-conversation.repository.ts`:

```typescript
import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CopilotConversation,
  CopilotMessageRecord,
  ICopilotConversationRepository,
} from '../application/conversation-repository.port';
import { CopilotConversationOrmEntity } from './copilot-conversation.orm-entity';
import { CopilotMessageOrmEntity } from './copilot-message.orm-entity';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Injectable()
export class TypeOrmCopilotConversationRepository
  extends BaseRepository<CopilotConversationOrmEntity>
  implements ICopilotConversationRepository
{
  constructor(
    @InjectRepository(CopilotConversationOrmEntity) repo: Repository<CopilotConversationOrmEntity>,
    @InjectRepository(CopilotMessageOrmEntity)
    private readonly messageRepo: Repository<CopilotMessageOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findOrCreate(conversationId: string, userId: string): Promise<CopilotConversation> {
    const existing = await this.scopedFindOne({ id: conversationId } as any);
    if (existing) return existing;

    const organizationId = this.tenantContext.getOrganizationId();
    const conversation: CopilotConversationOrmEntity = {
      id: conversationId,
      organizationId,
      userId,
      customerId: null,
      createdAt: new Date(),
    };
    await this.ormRepo.save(conversation);
    return conversation;
  }

  async listMessages(conversationId: string): Promise<CopilotMessageRecord[]> {
    const conversation = await this.scopedFindOne({ id: conversationId } as any);
    if (!conversation) return [];
    return this.messageRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
  }

  async appendMessage(message: Omit<CopilotMessageRecord, 'id'>): Promise<CopilotMessageRecord> {
    const row: CopilotMessageOrmEntity = { id: randomUUID(), ...message };
    await this.messageRepo.save(row);
    return row;
  }
}
```

`apps/backend/src/modules/copilot/infrastructure/typeorm-copilot-pending-action.repository.ts`:

```typescript
import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CopilotPendingAction,
  ICopilotPendingActionRepository,
} from '../application/pending-action-repository.port';
import {
  CopilotPendingActionOrmEntity,
  SendReminderEmailPayload,
} from './copilot-pending-action.orm-entity';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Injectable()
export class TypeOrmCopilotPendingActionRepository
  extends BaseRepository<CopilotPendingActionOrmEntity>
  implements ICopilotPendingActionRepository
{
  constructor(
    @InjectRepository(CopilotPendingActionOrmEntity)
    repo: Repository<CopilotPendingActionOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async create(
    conversationId: string,
    payload: SendReminderEmailPayload,
  ): Promise<CopilotPendingAction> {
    const organizationId = this.tenantContext.getOrganizationId();
    const action: CopilotPendingActionOrmEntity = {
      id: randomUUID(),
      organizationId,
      conversationId,
      actionType: 'SEND_REMINDER_EMAIL',
      payload,
      status: 'PENDING',
      createdAt: new Date(),
      resolvedAt: null,
      resolvedByUserId: null,
    };
    await this.ormRepo.save(action);
    return action;
  }

  async findById(id: string): Promise<CopilotPendingAction | null> {
    return this.scopedFindOne({ id } as any);
  }

  async save(action: CopilotPendingAction): Promise<void> {
    await this.scopedSave(action as CopilotPendingActionOrmEntity);
  }

  async cancelIfPending(id: string, resolvedByUserId: string): Promise<CopilotPendingAction | null> {
    const result = await this.ormRepo
      .createQueryBuilder()
      .update(CopilotPendingActionOrmEntity)
      .set({ status: 'CANCELLED', resolvedAt: new Date(), resolvedByUserId })
      .where('id = :id AND "organizationId" = :organizationId AND status = :status', {
        id,
        organizationId: this.tenantContext.getOrganizationId(),
        status: 'PENDING',
      })
      .returning('*')
      .execute();
    return result.affected ? (result.raw[0] as CopilotPendingAction) : null;
  }
}
```

`apps/backend/src/modules/copilot/infrastructure/typeorm-ai-usage-log.repository.ts`:

```typescript
import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AIUsageLogEntry, IAIUsageLogRepository } from '../application/ai-usage-log-repository.port';
import { AIUsageLogOrmEntity } from './ai-usage-log.orm-entity';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Injectable()
export class TypeOrmAIUsageLogRepository implements IAIUsageLogRepository {
  constructor(
    @InjectRepository(AIUsageLogOrmEntity) private readonly repo: Repository<AIUsageLogOrmEntity>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async log(entry: AIUsageLogEntry): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    await this.repo.save({ id: randomUUID(), organizationId, createdAt: new Date(), ...entry });
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/copilot/infrastructure apps/backend/src/modules/copilot/application/conversation-repository.port.ts apps/backend/src/modules/copilot/application/pending-action-repository.port.ts apps/backend/src/modules/copilot/application/ai-usage-log-repository.port.ts
git commit -m "feat: add Copilot entities, ports, and TypeORM repositories"
```

---

### Task 3: `CopilotToolRegistry` — the hardcoded, auditable whitelist

**Files:**
- Create: `apps/backend/src/modules/copilot/application/copilot-tool-registry.ts`
- Test: `apps/backend/src/modules/copilot/application/copilot-tool-registry.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `CopilotToolRegistry.getTools(canSendReminders): Anthropic.Tool[]`, `CopilotToolRegistry.register(tool)` — consumed by Task 4-6's tools and Task 7's `CopilotChatUseCase`

This is the module's single most important file — the code that makes the write-action boundary a compile-time fact rather than a runtime policy. Write it, and its test, before any tool implementation exists.

- [ ] **Step 1: Write the failing allowlist test**

Create `apps/backend/src/modules/copilot/application/copilot-tool-registry.spec.ts`:

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

    const names = registry.getTools(true).map((tool) => tool.name);

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

    // and none of them ever became visible to the model
    expect(registry.getTools(true).map((t) => t.name)).toHaveLength(0);
  });

  it('hides sendReminderEmail and draftReminderEmail from users without REMINDER_SEND_MANUAL', () => {
    const registry = new CopilotToolRegistry();
    registry.register(fakeTool('getReceivableSummary'));
    registry.register(fakeTool('getCollectionActivityTimeline'));
    registry.register(fakeTool('getPaymentHistory'));
    registry.register(fakeTool('draftReminderEmail', true));
    registry.register(fakeTool('sendReminderEmail', true));

    const names = registry.getTools(false).map((tool) => tool.name);

    expect(names).toEqual(['getReceivableSummary', 'getCollectionActivityTimeline', 'getPaymentHistory']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test copilot-tool-registry.spec.ts`
Expected: FAIL — Cannot find module './copilot-tool-registry'

- [ ] **Step 3: Create `apps/backend/src/modules/copilot/application/copilot-tool-registry.ts`**

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

export interface AnthropicToolShape {
  name: string;
  description: string;
  input_schema: CopilotJsonSchema;
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

  getTools(canSendReminders: boolean): AnthropicToolShape[] {
    return Array.from(this.tools.values())
      .filter((tool) => canSendReminders || !tool.requiresReminderPermission)
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      }));
  }

  getToolNames(canSendReminders: boolean): string[] {
    return this.getTools(canSendReminders).map((tool) => tool.name);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test copilot-tool-registry.spec.ts`
Expected: all 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/copilot/application/copilot-tool-registry.ts apps/backend/src/modules/copilot/application/copilot-tool-registry.spec.ts
git commit -m "feat: add CopilotToolRegistry with a hardcoded, test-proven safe tool allowlist"
```

---

### Task 4: Read-only tools — `getReceivableSummary`, `getCollectionActivityTimeline`, `getPaymentHistory`

**Files:**
- Create: `apps/backend/src/modules/copilot/application/tools/get-receivable-summary.tool.ts`
- Create: `apps/backend/src/modules/copilot/application/tools/get-collection-activity-timeline.tool.ts`
- Create: `apps/backend/src/modules/copilot/application/tools/get-payment-history.tool.ts`
- Test: `apps/backend/src/modules/copilot/application/tools/copilot-read-tools.spec.ts`

**Interfaces:**
- Consumes: `IReceivableRepository.findByCustomerId` (Task 1), Collection Activity's read port, Payment History's read port, and `ICustomerRepository` (`2026-08-03-project-scaffolding-and-domain-core.md`)
- Produces: `GetReceivableSummaryTool.execute(input)`, `GetCollectionActivityTimelineTool.execute(input)`, and `GetPaymentHistoryTool.execute(input)` — pre-shaped JSON, consumed by Task 7's `CopilotChatUseCase`

All three tools take `customerId` and the timeline/history tools also take bounded `limit`; no `organizationId` parameter exists because the repositories are `BaseRepository`-backed and scope every query to `TenantContextService.getOrganizationId()` automatically. The timeline tool delegates to Collection Activity's read port and the payment-history tool delegates to Domain Core's payment-history read port; neither tool queries raw tables directly.

- [ ] **Step 1: Create `apps/backend/src/modules/copilot/application/tools/get-receivable-summary.tool.ts`**

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
    const receivables = await this.receivableRepo.findByCustomerId(input.customerId);
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

Create `apps/backend/src/modules/copilot/application/tools/copilot-read-tools.spec.ts`:

```typescript
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Receivable } from '../../../receivables/domain/receivable';
import { GetReceivableSummaryTool } from './get-receivable-summary.tool';
import { GetCollectionActivityTimelineTool } from './get-collection-activity-timeline.tool';
import { GetPaymentHistoryTool } from './get-payment-history.tool';

function receivable(overrides: Partial<Parameters<typeof Receivable.prototype.constructor>[0]> & {
  originalAmount: number;
  paidAmount: number;
  dueDate: Date;
}) {
  return new Receivable({
    id: 'rec',
    organizationId: 'org-1',
    customerId: 'cust-1',
    invoiceId: null,
    status: ReceivableStatus.OPEN,
    salesRepresentativeId: 'user-1',
    createdAt: new Date('2026-01-01'),
    closedAt: null,
    ...overrides,
  } as any);
}

describe('Copilot read tools', () => {
  it('computes the canonical receivable summary', async () => {
    const today = new Date('2026-08-03');
    const receivables = [
      receivable({ originalAmount: 10_000_000, paidAmount: 0, dueDate: new Date('2026-07-24') }), // 10 days late
      receivable({ originalAmount: 20_000_000, paidAmount: 5_000_000, dueDate: new Date('2026-07-04') }), // 30 days late
      receivable({ originalAmount: 5_000_000, paidAmount: 0, dueDate: new Date('2026-09-01') }), // not due yet
    ];
    const receivableRepo = { findByCustomerId: jest.fn().mockResolvedValue(receivables) };

    const tool = new GetReceivableSummaryTool(receivableRepo as any);
    const result = await tool.execute({ customerId: 'cust-1' }, today);

    expect(result.customerId).toBe('cust-1');
    expect(result.overdueCount).toBe(2);
    expect(result.totalOutstanding).toBe(10_000_000 + 15_000_000);
    expect(result.totalOverdue).toBe(10_000_000 + 15_000_000);
    expect(result.maxOverdueDays).toBe(30);
    expect(result.averageLateDays).toBe(20);
  });

  it('delegates timeline and payment history with a bounded limit', async () => {
    const timeline = { getByCustomerId: jest.fn().mockResolvedValue([{ id: 'activity-1' }]) };
    const payments = { getByCustomerId: jest.fn().mockResolvedValue([{ id: 'payment-1' }]) };
    const timelineTool = new GetCollectionActivityTimelineTool(timeline as any);
    const paymentTool = new GetPaymentHistoryTool(payments as any);

    await expect(timelineTool.execute({ customerId: 'cust-1', limit: 50 })).resolves.toEqual({
      customerId: 'cust-1',
      items: [{ id: 'activity-1' }],
    });
    await expect(paymentTool.execute({ customerId: 'cust-1', limit: 50 })).resolves.toEqual({
      customerId: 'cust-1',
      items: [{ id: 'payment-1' }],
    });
    expect(timeline.getByCustomerId).toHaveBeenCalledWith('cust-1', 50);
    expect(payments.getByCustomerId).toHaveBeenCalledWith('cust-1', 50);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test copilot-read-tools.spec.ts`
Expected: FAIL — the three canonical tool classes do not exist

- [ ] **Step 4: Create `apps/backend/src/modules/copilot/application/tools/get-collection-activity-timeline.tool.ts` and `get-payment-history.tool.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { CopilotJsonSchema } from '../copilot-tool-registry';

export const GET_COLLECTION_ACTIVITY_TIMELINE_SCHEMA: CopilotJsonSchema = {
  type: 'object',
  properties: {
    customerId: { type: 'string' },
    limit: { type: 'integer', minimum: 1, maximum: 50 },
  },
  required: ['customerId'],
};

const MAX_LIMIT = 50;

@Injectable()
export class GetCollectionActivityTimelineTool {
  static readonly NAME = 'getCollectionActivityTimeline';

  constructor(@Inject('COLLECTION_ACTIVITY_READ_PORT') private readonly reader: {
    getByCustomerId(customerId: string, limit: number): Promise<unknown[]>;
  }) {}

  async execute(input: { customerId: string; limit?: number }) {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), MAX_LIMIT);
    return { customerId: input.customerId, items: await this.reader.getByCustomerId(input.customerId, limit) };
  }
}
```

Create `get-payment-history.tool.ts` with the same bounded-input adapter shape and exact public name:

```typescript
export const GET_PAYMENT_HISTORY_SCHEMA: CopilotJsonSchema = {
  type: 'object',
  properties: {
    customerId: { type: 'string' },
    limit: { type: 'integer', minimum: 1, maximum: 50 },
  },
  required: ['customerId'],
};

@Injectable()
export class GetPaymentHistoryTool {
  static readonly NAME = 'getPaymentHistory';

  constructor(@Inject('PAYMENT_HISTORY_READ_PORT') private readonly reader: {
    getByCustomerId(customerId: string, limit: number): Promise<unknown[]>;
  }) {}

  async execute(input: { customerId: string; limit?: number }) {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), MAX_LIMIT);
    return { customerId: input.customerId, items: await this.reader.getByCustomerId(input.customerId, limit) };
  }
}
```

The two string tokens above are existing read-only ports owned by Collection Activity and Domain Core/Payments; register their existing providers in `CopilotModule`. Do not create Copilot-owned repositories or expose raw ORM rows. All three tools return only the documented structured DTOs and never accept `organizationId`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test copilot-read-tools.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/copilot/application/tools/get-receivable-summary.tool.ts apps/backend/src/modules/copilot/application/tools/get-collection-activity-timeline.tool.ts apps/backend/src/modules/copilot/application/tools/get-payment-history.tool.ts apps/backend/src/modules/copilot/application/tools/copilot-read-tools.spec.ts
git commit -m "feat: add canonical Copilot read tools"
```

---

### Task 5: `draftReminderEmail` tool

**Files:**
- Create: `apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.ts`
- Test: `apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.spec.ts`

**Interfaces:**
- Consumes: `IReceivableRepository.findById`, `ICustomerRepository.findById`, `CopilotDraftOrmEntity` (Task 2)
- Produces: `DraftReminderEmailTool.execute(input)` → `{ draftId, receivableId, recipientEmail, subject, bodyHtml }`, read back by `ConfirmPendingActionUseCase` (Task 8) once the user confirms

`draftReminderEmail` never sends anything — it composes the email deterministically from structured `Receivable`/`Customer` data (never letting the model invent the amount) and persists it as a `CopilotDraftOrmEntity` row. Sending it for real is entirely Task 8's job.

- [ ] **Step 1: Write failing test**

Create `apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.spec.ts`:

```typescript
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Receivable } from '../../../receivables/domain/receivable';
import { Customer } from '../../../customers/domain/customer';
import { DraftReminderEmailTool } from './draft-reminder-email.tool';

describe('DraftReminderEmailTool', () => {
  it('composes a draft from structured Receivable + Customer data and persists it', async () => {
    const receivable = new Receivable({
      id: 'rec-1',
      organizationId: 'org-1',
      customerId: 'cust-1',
      invoiceId: null,
      originalAmount: 50_000_000,
      paidAmount: 20_000_000,
      dueDate: new Date('2026-07-20'),
      status: ReceivableStatus.PARTIALLY_PAID,
      salesRepresentativeId: 'user-1',
      createdAt: new Date('2026-06-20'),
      closedAt: null,
    });
    const customer = new Customer({
      id: 'cust-1',
      organizationId: 'org-1',
      name: 'ABC Company',
      taxCode: '0101234567',
      email: 'ap@abc.vn',
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      createdAt: new Date('2026-01-01'),
    });
    const receivableRepo = { findById: jest.fn().mockResolvedValue(receivable) };
    const customerRepo = { findById: jest.fn().mockResolvedValue(customer) };
    const draftRepo = { save: jest.fn() };

    const tool = new DraftReminderEmailTool(receivableRepo as any, customerRepo as any, draftRepo as any);
    const result = await tool.execute({ receivableId: 'rec-1', tone: 'urgent' }, 'org-1');

    expect(result.recipientEmail).toBe('ap@abc.vn');
    expect(result.subject).toContain('ABC Company');
    expect(result.bodyHtml).toContain('30.000.000');
    expect(draftRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: result.draftId,
        organizationId: 'org-1',
        receivableId: 'rec-1',
        recipientEmail: 'ap@abc.vn',
      }),
    );
  });

  it('throws when the receivable does not exist in the current organization', async () => {
    const receivableRepo = { findById: jest.fn().mockResolvedValue(null) };
    const customerRepo = { findById: jest.fn() };
    const draftRepo = { save: jest.fn() };
    const tool = new DraftReminderEmailTool(receivableRepo as any, customerRepo as any, draftRepo as any);

    await expect(tool.execute({ receivableId: 'missing' }, 'org-1')).rejects.toThrow('Receivable not found');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test draft-reminder-email.tool.spec.ts`
Expected: FAIL — Cannot find module './draft-reminder-email.tool'

- [ ] **Step 3: Create `apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.ts`**

```typescript
import { randomUUID } from 'crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../../receivables/application/receivable-repository.port';
import {
  ICustomerRepository,
  CUSTOMER_REPOSITORY,
} from '../../../customers/application/customer-repository.port';
import { CopilotDraftOrmEntity } from '../../infrastructure/copilot-draft.orm-entity';
import { CopilotJsonSchema } from '../copilot-tool-registry';

export const DRAFT_REMINDER_EMAIL_SCHEMA: CopilotJsonSchema = {
  type: 'object',
  properties: {
    receivableId: { type: 'string', description: 'The receivable UUID to draft a reminder for' },
    tone: {
      type: 'string',
      enum: ['polite', 'urgent'],
      description: 'Tone of the reminder email; defaults to polite',
    },
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
    private readonly draftRepo: { save(draft: CopilotDraftOrmEntity): Promise<void> },
  ) {}

  async execute(
    input: { receivableId: string; tone?: 'polite' | 'urgent' },
    organizationId: string,
  ): Promise<DraftReminderEmailResult> {
    const receivable = await this.receivableRepo.findById(input.receivableId);
    if (!receivable) {
      throw new NotFoundException('Receivable not found');
    }
    const customer = await this.customerRepo.findById(receivable.customerId);
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const tone = input.tone ?? 'polite';
    const remaining = formatVnd(receivable.remainingAmount);
    const dueDate = receivable.dueDate.toISOString().slice(0, 10);

    const subject =
      tone === 'urgent'
        ? `[Urgent payment reminder] ${customer.name} - ${remaining} remaining`
        : `Payment reminder - ${customer.name}`;

    const bodyHtml =
      tone === 'urgent'
        ? `<p>Dear ${customer.name},</p><p>Your receivable is past due (due date: ${dueDate}). Remaining amount: <strong>${remaining}</strong>. Please pay as soon as possible.</p>`
        : `<p>Dear ${customer.name},</p><p>This is a reminder about the receivable due on ${dueDate}; the remaining amount is <strong>${remaining}</strong>. Thank you.</p>`;

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
Expected: both tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.ts apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.spec.ts
git commit -m "feat: add draftReminderEmail tool"
```

`CopilotDraftOrmEntity` stores the fully-composed draft (subject/html with customer name and amounts already substituted, not Handlebars variables) purely for display back to the accountant in chat and for `ConfirmPendingActionUseCase` (Task 8) to read when the user confirms — it is not, and no longer needs to pretend to be, an `IEmailTemplateRepository` implementation. See Task 8 for how a confirmed draft actually reaches `EmailService`.

---

### Task 6: `sendReminderEmail` tool (proposal-only, schema metadata)

**Files:**
- Create: `apps/backend/src/modules/copilot/application/tools/send-reminder-email.tool.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `SendReminderEmailTool` (schema-only — its "execute" path is deliberately never called from the chat loop, see below), the tool name `CopilotChatUseCase` (Task 7) watches for to create a `CopilotPendingAction`

`SendReminderEmailTool` here is schema metadata only, registered so the model can name it — `CopilotChatUseCase` (Task 7) never calls anything on this class; seeing a `tool_use` block named `sendReminderEmail` is the signal to create a `CopilotPendingAction` and stop, per Global Constraints. The class that actually touches `EmailService` is `ConfirmPendingActionUseCase` (Task 8), which is reached only via the confirm endpoint and never via the model. Unlike an earlier version of this plan, no Copilot-owned `ReminderExecution`/`EmailTemplate` stand-ins are created in this task — Task 8 now writes directly into the REAL tables owned by `2026-08-03-reminder-automation.md` and `2026-08-03-email-template-management.md`.

- [ ] **Step 1: Create `apps/backend/src/modules/copilot/application/tools/send-reminder-email.tool.ts`**

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
 * Metadata only. This class has no execute() on purpose: a tool_use block
 * named "sendReminderEmail" is intercepted by CopilotChatUseCase and turned
 * into a CopilotPendingAction — it is never invoked as a normal tool call in
 * the same model turn (see Global Constraints and ConfirmPendingActionUseCase
 * in Task 8, the only class that actually calls EmailService).
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

### Task 7: `AnthropicClient` provider + `CopilotChatUseCase`

**Files:**
- Modify: `apps/backend/package.json` (add `@anthropic-ai/sdk`)
- Create: `apps/backend/src/modules/copilot/application/anthropic-client.provider.ts`
- Create: `apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts`
- Test: `apps/backend/src/modules/copilot/application/copilot-chat.usecase.spec.ts`

**Interfaces:**
- Consumes: `CopilotToolRegistry` (Task 3), the five tools (Tasks 4-6), `ICopilotConversationRepository`/`ICopilotPendingActionRepository`/`IAIUsageLogRepository` (Task 2), `TenantContextService`, `ROLE_PERMISSIONS`
- Produces: `CopilotChatUseCase.execute(input): Promise<CopilotChatResult>`, consumed by Task 9's controller

`CopilotChatUseCase` is the only class in this plan that calls the Anthropic client — every unit test in this task mocks `@anthropic-ai/sdk` with `jest.mock('@anthropic-ai/sdk', ...)`, the same pattern `2026-08-03-email-notification-service.md` uses for `jest.mock('resend', ...)`; no test in this plan ever makes a real network call to Anthropic.

- [ ] **Step 1: Install `@anthropic-ai/sdk`**

Run: `pnpm --filter @casso-ledger/backend add @anthropic-ai/sdk`

- [ ] **Step 2: Create `apps/backend/src/modules/copilot/application/anthropic-client.provider.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';

export const ANTHROPIC_CLIENT = Symbol('ANTHROPIC_CLIENT');

export function anthropicClientFactory(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });
}
```

- [ ] **Step 3: Write failing tests for `CopilotChatUseCase`**

Create `apps/backend/src/modules/copilot/application/copilot-chat.usecase.spec.ts`:

```typescript
const messagesCreateMock = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: messagesCreateMock },
  }));
});

import { CopilotChatUseCase } from './copilot-chat.usecase';
import { CopilotToolRegistry } from './copilot-tool-registry';
import { GetReceivableSummaryTool } from './tools/get-receivable-summary.tool';
import { GetCollectionActivityTimelineTool } from './tools/get-collection-activity-timeline.tool';
import { GetPaymentHistoryTool } from './tools/get-payment-history.tool';
import { DraftReminderEmailTool } from './tools/draft-reminder-email.tool';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';

function buildRegistry() {
  const registry = new CopilotToolRegistry();
  registry.register({
    name: 'getReceivableSummary',
    description: 'x',
    inputSchema: { type: 'object', properties: {}, required: [] },
    requiresReminderPermission: false,
  });
  registry.register({
    name: 'getCollectionActivityTimeline',
    description: 'x',
    inputSchema: { type: 'object', properties: {}, required: [] },
    requiresReminderPermission: false,
  });
  registry.register({
    name: 'getPaymentHistory',
    description: 'x',
    inputSchema: { type: 'object', properties: {}, required: [] },
    requiresReminderPermission: false,
  });
  registry.register({
    name: 'draftReminderEmail',
    description: 'x',
    inputSchema: { type: 'object', properties: {}, required: [] },
    requiresReminderPermission: true,
  });
  registry.register({
    name: 'sendReminderEmail',
    description: 'x',
    inputSchema: { type: 'object', properties: {}, required: [] },
    requiresReminderPermission: true,
  });
  return registry;
}

describe('CopilotChatUseCase', () => {
  beforeEach(() => messagesCreateMock.mockReset());

  it('answers a read-only question with a structured tool result and never touches EmailService', async () => {
    messagesCreateMock
      .mockResolvedValueOnce({
        content: [
          { type: 'tool_use', id: 'tu_1', name: 'getReceivableSummary', input: { customerId: 'cust-1' } },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 100, output_tokens: 20 },
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Customer cust-1 currently has 2 overdue invoices.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 150, output_tokens: 40 },
      });

    const summaryTool = { execute: jest.fn().mockResolvedValue({ overdueCount: 2 }) };
    const timelineTool = { execute: jest.fn() };
    const paymentHistoryTool = { execute: jest.fn() };
    const draftTool = { execute: jest.fn() };
    const conversationRepo = {
      findOrCreate: jest.fn().mockResolvedValue({ id: 'conv-1' }),
      listMessages: jest.fn().mockResolvedValue([]),
      appendMessage: jest.fn().mockImplementation((m) => Promise.resolve({ id: 'm-1', ...m })),
    };
    const pendingActionRepo = { create: jest.fn() };
    const usageLogRepo = { log: jest.fn() };
    const tenantContext = { getCurrentUser: () => ({ userId: 'u1', organizationId: 'org-1', role: Role.ACCOUNTANT }) };

    const useCase = new CopilotChatUseCase(
      buildRegistry(),
      summaryTool as unknown as GetReceivableSummaryTool,
      timelineTool as unknown as GetCollectionActivityTimelineTool,
      paymentHistoryTool as unknown as GetPaymentHistoryTool,
      draftTool as unknown as DraftReminderEmailTool,
      conversationRepo as any,
      pendingActionRepo as any,
      usageLogRepo as any,
      tenantContext as unknown as TenantContextService,
    );

    const result = await useCase.execute({ conversationId: 'conv-1', userMessage: 'How overdue is customer cust-1?' });

    expect(result.pendingAction).toBeNull();
    expect(result.message.content).toContain('overdue');
    expect(summaryTool.execute).toHaveBeenCalledWith({ customerId: 'cust-1' });
    expect(pendingActionRepo.create).not.toHaveBeenCalled();
    expect(usageLogRepo.log).toHaveBeenCalledTimes(2);
  });

  it('halts on sendReminderEmail and creates a CopilotPendingAction instead of executing anything', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [
        { type: 'text', text: 'This is a reminder email draft.' },
        {
          type: 'tool_use',
          id: 'tu_2',
          name: 'sendReminderEmail',
          input: { draftId: 'draft-1', receivableId: 'rec-1' },
        },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 200, output_tokens: 50 },
    });

    const summaryTool = { execute: jest.fn() };
    const timelineTool = { execute: jest.fn() };
    const paymentHistoryTool = { execute: jest.fn() };
    const draftTool = { execute: jest.fn() };
    const conversationRepo = {
      findOrCreate: jest.fn().mockResolvedValue({ id: 'conv-1' }),
      listMessages: jest.fn().mockResolvedValue([]),
      appendMessage: jest.fn().mockImplementation((m) => Promise.resolve({ id: 'm-1', ...m })),
    };
    const pendingActionRepo = {
      create: jest
        .fn()
        .mockResolvedValue({
          id: 'pa-1',
          actionType: 'SEND_REMINDER_EMAIL',
          status: 'PENDING',
          payload: { draftId: 'draft-1', receivableId: 'rec-1' },
          createdAt: new Date('2026-08-03T10:00:00Z'),
          resolvedAt: null,
        }),
    };
    const usageLogRepo = { log: jest.fn() };
    const tenantContext = {
      getCurrentUser: () => ({ userId: 'u1', organizationId: 'org-1', role: Role.FINANCE_MANAGER }),
    };

    const useCase = new CopilotChatUseCase(
      buildRegistry(),
      summaryTool as unknown as GetReceivableSummaryTool,
      timelineTool as unknown as GetCollectionActivityTimelineTool,
      paymentHistoryTool as unknown as GetPaymentHistoryTool,
      draftTool as unknown as DraftReminderEmailTool,
      conversationRepo as any,
      pendingActionRepo as any,
      usageLogRepo as any,
      tenantContext as unknown as TenantContextService,
    );

    const result = await useCase.execute({ conversationId: 'conv-1', userMessage: 'Send the reminder email for draft-1' });

    expect(result.pendingAction).toEqual({
      id: 'pa-1',
      actionType: 'SEND_REMINDER_EMAIL',
      status: 'PENDING',
      payload: { draftId: 'draft-1', receivableId: 'rec-1' },
      createdAt: '2026-08-03T10:00:00.000Z',
      resolvedAt: null,
    });
    expect(pendingActionRepo.create).toHaveBeenCalledWith('conv-1', { draftId: 'draft-1', receivableId: 'rec-1' });
    expect(messagesCreateMock).toHaveBeenCalledTimes(1); // loop halted — no second turn was sent
    expect(usageLogRepo.log).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test copilot-chat.usecase.spec.ts`
Expected: FAIL — Cannot find module './copilot-chat.usecase'

- [ ] **Step 5: Create `apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_CLIENT } from './anthropic-client.provider';
import { CopilotToolRegistry } from './copilot-tool-registry';
import { GetReceivableSummaryTool } from './tools/get-receivable-summary.tool';
import { GetCollectionActivityTimelineTool } from './tools/get-collection-activity-timeline.tool';
import { GetPaymentHistoryTool } from './tools/get-payment-history.tool';
import { DraftReminderEmailTool } from './tools/draft-reminder-email.tool';
import {
  ICopilotConversationRepository,
  COPILOT_CONVERSATION_REPOSITORY,
} from './conversation-repository.port';
import {
  CopilotPendingAction,
  ICopilotPendingActionRepository,
  COPILOT_PENDING_ACTION_REPOSITORY,
} from './pending-action-repository.port';
import { IAIUsageLogRepository, AI_USAGE_LOG_REPOSITORY } from './ai-usage-log-repository.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { ROLE_PERMISSIONS } from '../../../common/rbac/role-permissions.map';
import { Permission } from '../../../common/rbac/permission.enum';
import {
  CopilotMessageDto,
  CopilotPendingActionDto,
  toCopilotMessageDto,
  toCopilotPendingActionDto,
} from '../presentation/dto/copilot-response.dto';

const MODEL = 'claude-opus-5';
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

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
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
    private readonly toolRegistry: CopilotToolRegistry,
    private readonly getReceivableSummaryTool: GetReceivableSummaryTool,
    private readonly getCollectionActivityTimelineTool: GetCollectionActivityTimelineTool,
    private readonly getPaymentHistoryTool: GetPaymentHistoryTool,
    private readonly draftReminderEmailTool: DraftReminderEmailTool,
    @Inject(COPILOT_CONVERSATION_REPOSITORY)
    private readonly conversationRepo: ICopilotConversationRepository,
    @Inject(COPILOT_PENDING_ACTION_REPOSITORY)
    private readonly pendingActionRepo: ICopilotPendingActionRepository,
    @Inject(AI_USAGE_LOG_REPOSITORY) private readonly usageLogRepo: IAIUsageLogRepository,
    private readonly tenantContext: TenantContextService,
    @Inject(ANTHROPIC_CLIENT) private readonly anthropic?: Anthropic,
  ) {}

  private async callModel(
    tools: ReturnType<CopilotToolRegistry['getTools']>,
    messages: Anthropic.MessageParam[],
    conversationId: string,
  ): Promise<Anthropic.Message> {
    const start = Date.now();
    try {
      const response = await withTimeout(
        this.anthropic!.messages.create({
          model: MODEL,
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          tools,
          messages,
        }) as unknown as Promise<Anthropic.Message>,
        MODEL_CALL_TIMEOUT_MS,
      );
      await this.usageLogRepo.log({
        conversationId,
        model: MODEL,
        promptVersion: PROMPT_VERSION,
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
        latencyMs: Date.now() - start,
        toolCallsCount: response.content.filter((b: any) => b.type === 'tool_use').length,
        isError: false,
      });
      return response;
    } catch (error) {
      await this.usageLogRepo.log({
        conversationId,
        model: MODEL,
        promptVersion: PROMPT_VERSION,
        inputTokens: null,
        outputTokens: null,
        latencyMs: Date.now() - start,
        toolCallsCount: 0,
        isError: true,
      });
      throw error;
    }
  }

  private async callModelWithRetry(
    tools: ReturnType<CopilotToolRegistry['getTools']>,
    messages: Anthropic.MessageParam[],
    conversationId: string,
  ): Promise<Anthropic.Message> {
    try {
      return await this.callModel(tools, messages, conversationId);
    } catch (error) {
      return this.callModel(tools, messages, conversationId); // exactly one automatic retry
    }
  }

  private async executeReadOrDraftTool(block: ToolUseBlock, organizationId: string): Promise<unknown> {
    switch (block.name) {
      case GetReceivableSummaryTool.NAME:
        return this.getReceivableSummaryTool.execute(block.input as { customerId: string });
      case GetCollectionActivityTimelineTool.NAME:
        return this.getCollectionActivityTimelineTool.execute(
          block.input as { customerId: string; limit?: number },
        );
      case GetPaymentHistoryTool.NAME:
        return this.getPaymentHistoryTool.execute(block.input as { customerId: string; limit?: number });
      case DraftReminderEmailTool.NAME:
        return this.draftReminderEmailTool.execute(
          block.input as { receivableId: string; tone?: 'polite' | 'urgent' },
          organizationId,
        );
      case 'sendReminderEmail':
        throw new Error('sendReminderEmail must be intercepted before normal tool execution');
      default:
        throw new Error(`Unknown Copilot tool "${block.name}"`);
    }
  }

  async execute(input: CopilotChatInput): Promise<CopilotChatResult> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new Error('CopilotChatUseCase requires an authenticated tenant context');
    }
    const canSendReminders = ROLE_PERMISSIONS[user.role].includes(Permission.REMINDER_SEND_MANUAL);

    await this.conversationRepo.findOrCreate(input.conversationId, user.userId);
    await this.conversationRepo.appendMessage({
      conversationId: input.conversationId,
      role: 'USER',
      content: input.userMessage,
      toolCalls: null,
      createdAt: new Date(),
    });

    const history = await this.conversationRepo.listMessages(input.conversationId);
    const messages: Anthropic.MessageParam[] = history.map((m) => ({
      role: m.role === 'ASSISTANT' ? 'assistant' : 'user',
      content: m.content,
    }));

    const tools = this.toolRegistry.getTools(canSendReminders);

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
      const response = await this.callModelWithRetry(tools, messages, input.conversationId);

      const textBlocks = response.content.filter((b: any): b is Anthropic.TextBlock => b.type === 'text');
      const toolUseBlocks = response.content.filter(
        (b: any): b is ToolUseBlock => b.type === 'tool_use',
      );
      const combinedText = textBlocks.map((b) => b.text).join('\n');

      const sendBlock = toolUseBlocks.find((b) => b.name === 'sendReminderEmail');
      if (sendBlock) {
        const draftId = sendBlock.input.draftId as string;
        const receivableId = sendBlock.input.receivableId as string;
        if (!draftId || !receivableId) {
          throw new Error('sendReminderEmail requires draftId and receivableId');
        }
        const pendingAction = await this.pendingActionRepo.create(input.conversationId, {
          draftId,
          receivableId,
        });
        await this.conversationRepo.appendMessage({
          conversationId: input.conversationId,
          role: 'ASSISTANT',
          content: combinedText,
          toolCalls: toolUseBlocks.map((b) => ({ id: b.id, name: b.name, input: b.input })),
          createdAt: new Date(),
        });
        return {
          message: toCopilotMessageDto({ id: 'assistant', role: 'ASSISTANT', content: combinedText, createdAt: new Date() }),
          pendingAction: toCopilotPendingActionDto(pendingAction),
        };
      }

      if (toolUseBlocks.length === 0) {
        await this.conversationRepo.appendMessage({
          conversationId: input.conversationId,
          role: 'ASSISTANT',
          content: combinedText,
          toolCalls: null,
          createdAt: new Date(),
        });
        return {
          message: toCopilotMessageDto({ id: 'assistant', role: 'ASSISTANT', content: combinedText, createdAt: new Date() }),
          pendingAction: null,
        };
      }

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => ({
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: JSON.stringify(await this.executeReadOrDraftTool(block, user.organizationId)),
        })),
      );

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
    }

    throw new Error('Copilot exceeded the maximum number of tool-use iterations for a single turn');
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test copilot-chat.usecase.spec.ts`
Expected: both tests PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/package.json apps/backend/src/modules/copilot/application/anthropic-client.provider.ts apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts apps/backend/src/modules/copilot/application/copilot-chat.usecase.spec.ts
git commit -m "feat: add CopilotChatUseCase — mocked Anthropic tool loop that halts on sendReminderEmail"
```

---

### Task 8: `ConfirmPendingActionUseCase` — creates a real `EmailTemplate` + `ReminderExecution`, then calls `EmailService`

**Files:**
- Create: `apps/backend/src/modules/copilot/application/confirm-pending-action.usecase.ts`
- Test: `apps/backend/src/modules/copilot/application/confirm-pending-action.usecase.spec.ts`
- Modify: `apps/backend/src/modules/copilot/copilot.module.ts` (import `EmailTemplatesModule`, `RemindersModule`, `NotificationsModule`, register `TypeOrmModule.forFeature([CopilotDraftOrmEntity])` if not already present from Task 5)

**Interfaces:**
- Consumes: `ICopilotPendingActionRepository` (Task 2), `CopilotDraftOrmEntity` (Task 5, read directly via `@InjectRepository`), the REAL `IEmailTemplateRepository`/`EMAIL_TEMPLATE_REPOSITORY` (`2026-08-03-email-template-management.md`), the REAL `IReminderExecutionRepository`/`REMINDER_EXECUTION_REPOSITORY` and `ReminderExecution` domain class (`2026-08-03-reminder-automation.md`, whose `reminderRuleId` is nullable specifically so this use case can write `null` here), `EmailService` (`2026-08-03-email-notification-service.md`)
- Produces: `ConfirmPendingActionUseCase.execute(pendingActionId, resolvedByUserId)`, consumed by Task 9's controller

Earlier drafts of this plan had a `ConfirmPendingActionUseCase` calling a Copilot-owned "`ICopilotReminderExecutionRepository`" that faked being `IReminderExecutionRepository`, and a `templateId` that was really just the `draftId` interpreted by a Copilot-owned fake `IEmailTemplateRepository`. Both of those real ports now have real, bound implementations (`2026-08-03-email-template-management.md`, `2026-08-03-reminder-automation.md`) — a second, parallel binding of the same DI tokens is not how NestJS DI works and was never going to function as designed. This task now creates one throwaway `EmailTemplate` row (its `subject`/`bodyHtml` are the draft's ALREADY-composed literal text — no `{{variable}}` syntax, so `EmailService`'s Handlebars render step is a harmless no-op pass-through) and one real `ReminderExecution` row (`reminderRuleId: null`, marking it as a manual/ad-hoc send, not a rule-matched one), then calls `EmailService.sendReminderEmail` exactly as `2026-08-03-reminder-automation.md`'s own `ReminderSenderService` does.

- [ ] **Step 1: Write failing tests**

Create `apps/backend/src/modules/copilot/application/confirm-pending-action.usecase.spec.ts`:

```typescript
import { ConfirmPendingActionUseCase } from './confirm-pending-action.usecase';

function pendingAction(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'pa-1',
    organizationId: 'org-1',
    conversationId: 'conv-1',
    actionType: 'SEND_REMINDER_EMAIL' as const,
    payload: { draftId: 'draft-1', receivableId: 'rec-1' },
    status: 'PENDING' as const,
    createdAt: new Date(),
    resolvedAt: null,
    resolvedByUserId: null,
    ...overrides,
  };
}

function buildDraft() {
  return { id: 'draft-1', receivableId: 'rec-1', recipientEmail: 'ap@abc.vn', subject: 'Payment reminder - ABC Company', bodyHtml: '<p>Dear ABC Company...</p>' };
}

describe('ConfirmPendingActionUseCase', () => {
  it('creates an EmailTemplate + ReminderExecution and calls EmailService.sendReminderEmail exactly once, then marks the action CONFIRMED', async () => {
    const action = pendingAction();
    const pendingActionRepo = { findById: jest.fn().mockResolvedValue(action), save: jest.fn() };
    const draftOrmRepo = { findOne: jest.fn().mockResolvedValue(buildDraft()) };
    const emailTemplateRepo = { save: jest.fn().mockResolvedValue(undefined) };
    const reminderExecutionRepo = { save: jest.fn().mockResolvedValue(undefined) };
    const emailService = { sendReminderEmail: jest.fn().mockResolvedValue(undefined) };

    const useCase = new ConfirmPendingActionUseCase(
      pendingActionRepo as any,
      draftOrmRepo as any,
      emailTemplateRepo as any,
      reminderExecutionRepo as any,
      emailService as any,
    );

    await useCase.execute('pa-1', 'user-1');

    expect(emailTemplateRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Payment reminder - ABC Company', isDefault: false }),
    );
    const savedTemplate = emailTemplateRepo.save.mock.calls[0][0];

    expect(reminderExecutionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ receivableId: 'rec-1', reminderRuleId: null, status: 'PENDING' }),
    );
    const savedExecution = reminderExecutionRepo.save.mock.calls[0][0];

    expect(emailService.sendReminderEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendReminderEmail).toHaveBeenCalledWith({
      receivableId: 'rec-1',
      templateId: savedTemplate.id,
      reminderExecutionId: savedExecution.id,
    });
    expect(pendingActionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CONFIRMED', resolvedByUserId: 'user-1' }),
    );
  });

  it('rejects and marks EXPIRED when confirmed more than 10 minutes after creation, and never calls EmailService', async () => {
    const staleAction = pendingAction({ createdAt: new Date(Date.now() - 11 * 60 * 1000) });
    const pendingActionRepo = { findById: jest.fn().mockResolvedValue(staleAction), save: jest.fn() };
    const draftOrmRepo = { findOne: jest.fn() };
    const emailTemplateRepo = { save: jest.fn() };
    const reminderExecutionRepo = { save: jest.fn() };
    const emailService = { sendReminderEmail: jest.fn() };

    const useCase = new ConfirmPendingActionUseCase(
      pendingActionRepo as any,
      draftOrmRepo as any,
      emailTemplateRepo as any,
      reminderExecutionRepo as any,
      emailService as any,
    );

    await expect(useCase.execute('pa-1', 'user-1')).rejects.toThrow('expired');
    expect(pendingActionRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'EXPIRED' }));
    expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
  });

  it('rejects a pending action that is already CONFIRMED or CANCELLED without calling EmailService', async () => {
    const alreadyConfirmed = pendingAction({ status: 'CONFIRMED' });
    const pendingActionRepo = { findById: jest.fn().mockResolvedValue(alreadyConfirmed), save: jest.fn() };
    const draftOrmRepo = { findOne: jest.fn() };
    const emailTemplateRepo = { save: jest.fn() };
    const reminderExecutionRepo = { save: jest.fn() };
    const emailService = { sendReminderEmail: jest.fn() };

    const useCase = new ConfirmPendingActionUseCase(
      pendingActionRepo as any,
      draftOrmRepo as any,
      emailTemplateRepo as any,
      reminderExecutionRepo as any,
      emailService as any,
    );

    await expect(useCase.execute('pa-1', 'user-1')).rejects.toThrow();
    expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test confirm-pending-action.usecase.spec.ts`
Expected: FAIL — Cannot find module './confirm-pending-action.usecase'

- [ ] **Step 3: Create `apps/backend/src/modules/copilot/application/confirm-pending-action.usecase.ts`**

```typescript
import { randomUUID } from 'crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ICopilotPendingActionRepository,
  COPILOT_PENDING_ACTION_REPOSITORY,
} from './pending-action-repository.port';
import { CopilotDraftOrmEntity } from '../infrastructure/copilot-draft.orm-entity';
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
    @InjectRepository(CopilotDraftOrmEntity)
    private readonly draftOrmRepo: Repository<CopilotDraftOrmEntity>,
    @Inject(EMAIL_TEMPLATE_REPOSITORY) private readonly emailTemplateRepo: IEmailTemplateRepository,
    @Inject(REMINDER_EXECUTION_REPOSITORY)
    private readonly reminderExecutionRepo: IReminderExecutionRepository,
    private readonly emailService: EmailService,
  ) {}

  async execute(pendingActionId: string, resolvedByUserId: string): Promise<{ reminderExecutionId: string }> {
    const action = await this.pendingActionRepo.findById(pendingActionId);
    if (!action) {
      throw new NotFoundException('Pending action not found');
    }
    if (action.status !== 'PENDING') {
      throw new BadRequestException(`Pending action is already ${action.status}`);
    }

    const ageMs = Date.now() - action.createdAt.getTime();
    if (ageMs > PENDING_ACTION_EXPIRY_MINUTES * 60 * 1000) {
      await this.pendingActionRepo.save({ ...action, status: 'EXPIRED' });
      throw new BadRequestException('Pending action has expired — please ask the Copilot to draft a new reminder');
    }

    const draft = await this.draftOrmRepo.findOne({ where: { id: action.payload.draftId } });
    if (!draft) {
      throw new NotFoundException(`Copilot draft ${action.payload.draftId} not found`);
    }

    const now = new Date();

    // Throwaway EmailTemplate: subject/bodyHtml are the draft's ALREADY-substituted literal
    // text (no {{variable}} tokens) — EmailService's Handlebars render step is a no-op
    // pass-through for it. This is what lets a Copilot-confirmed send reuse the exact same
    // EmailService/EmailQueueProcessor pipeline as a rule-based reminder, instead of a
    // parallel one.
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

    // The ONLY call to EmailService.sendReminderEmail in this entire module — pure code, no LLM involved.
    await this.emailService.sendReminderEmail({
      receivableId: action.payload.receivableId,
      templateId: template.id,
      reminderExecutionId: execution.id,
    });

    await this.pendingActionRepo.save({
      ...action,
      status: 'CONFIRMED',
      resolvedAt: new Date(),
      resolvedByUserId,
    });

    return { reminderExecutionId: execution.id };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test confirm-pending-action.usecase.spec.ts`
Expected: all 3 tests PASS

- [ ] **Step 5: Wire the new module dependencies into `CopilotModule`**

Modify `apps/backend/src/modules/copilot/copilot.module.ts` — add `EmailTemplatesModule`, `RemindersModule` (via `forwardRef` is NOT needed here — `CopilotModule` is not imported back by either of them, so this is a normal one-directional import), and `NotificationsModule` to `imports`, alongside whatever `TypeOrmModule.forFeature([CopilotDraftOrmEntity, ...])` Task 2/5 already registered.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/copilot/application/confirm-pending-action.usecase.ts apps/backend/src/modules/copilot/application/confirm-pending-action.usecase.spec.ts apps/backend/src/modules/copilot/copilot.module.ts
git commit -m "feat: add ConfirmPendingActionUseCase creating a real EmailTemplate + ReminderExecution before calling EmailService"
```

---

### Task 8b: `CancelPendingActionUseCase` — pure cancellation path

**Files:**
- Create: `apps/backend/src/modules/copilot/application/cancel-pending-action.usecase.ts`
- Test: `apps/backend/src/modules/copilot/application/cancel-pending-action.usecase.spec.ts`

The cancel endpoint must not call Anthropic, `EmailService`, `EmailTemplateRepository`, or `ReminderExecutionRepository`. It only atomically transitions an unexpired `PENDING` action to `CANCELLED`; `CONFIRMED`, `CANCELLED`, and `EXPIRED` actions are rejected. The repository update must use a conditional status check so two concurrent confirm/cancel requests cannot both win.

```typescript
@Injectable()
export class CancelPendingActionUseCase {
  constructor(
    @Inject(COPILOT_PENDING_ACTION_REPOSITORY)
    private readonly pendingActionRepo: ICopilotPendingActionRepository,
  ) {}

  async execute(pendingActionId: string, resolvedByUserId: string): Promise<CopilotPendingActionDto> {
    const action = await this.pendingActionRepo.findById(pendingActionId);
    if (!action) throw new NotFoundException('Pending action not found');
    if (action.status !== 'PENDING') throw new BadRequestException(`Pending action is already ${action.status}`);
    if (Date.now() - action.createdAt.getTime() > PENDING_ACTION_EXPIRY_MINUTES * 60 * 1000) {
      await this.pendingActionRepo.save({ ...action, status: 'EXPIRED' });
      throw new BadRequestException('Pending action has expired');
    }
    const cancelled = await this.pendingActionRepo.cancelIfPending(pendingActionId, resolvedByUserId);
    if (!cancelled) throw new BadRequestException('Pending action is no longer pending');
    return toCopilotPendingActionDto(cancelled);
  }
}
```

Add `cancelIfPending(id, resolvedByUserId)` to `ICopilotPendingActionRepository`; its SQL/TypeORM update must include `WHERE id = :id AND status = 'PENDING'`. Test the happy path, expiry, already-confirmed rejection, and the race returning `null`.

---

### Task 9: `CopilotController`, cancel endpoint, `CopilotModule` wiring

**Files:**
- Create: `apps/backend/src/modules/copilot/presentation/dto/copilot-response.dto.ts`
- Create: `apps/backend/src/modules/copilot/presentation/dto/post-copilot-message.dto.ts`
- Create: `apps/backend/src/modules/copilot/presentation/copilot.controller.ts`
- Create: `apps/backend/src/modules/copilot/copilot.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `CopilotChatUseCase` (Task 7), `ConfirmPendingActionUseCase`/`CancelPendingActionUseCase` (Tasks 8/8b), `JwtAuthGuard`/`PermissionGuard`/`RequirePermission` (`2026-08-03-multi-tenancy-rbac.md`)
- Produces: `POST /api/v1/copilot/conversations/:id/messages`, `POST /api/v1/copilot/actions/:actionId/confirm`, `POST /api/v1/copilot/actions/:id/cancel`

- [ ] **Step 1: Create `apps/backend/src/modules/copilot/presentation/dto/copilot-response.dto.ts`**

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

export interface CopilotTurnResponseDto {
  message: CopilotMessageDto;
  pendingAction: CopilotPendingActionDto | null;
}

export interface CopilotActionResponseDto {
  action: CopilotPendingActionDto;
  reminderExecutionId?: string;
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

- [ ] **Step 2: Create `apps/backend/src/modules/copilot/presentation/dto/post-copilot-message.dto.ts`**

```typescript
import { IsNotEmpty, IsString } from 'class-validator';

export class PostCopilotMessageDto {
  @IsString()
  @IsNotEmpty()
  content: string;
}
```

- [ ] **Step 3: Create `apps/backend/src/modules/copilot/presentation/copilot.controller.ts`**

```typescript
import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
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

@Controller('copilot')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class CopilotController {
  constructor(
    private readonly copilotChatUseCase: CopilotChatUseCase,
    private readonly confirmPendingActionUseCase: ConfirmPendingActionUseCase,
    private readonly cancelPendingActionUseCase: CancelPendingActionUseCase,
  ) {}

  @Post('conversations/:id/messages')
  @RequirePermission(Permission.RECEIVABLE_READ)
  async postMessage(@Param('id') conversationId: string, @Body() dto: PostCopilotMessageDto) {
    return this.copilotChatUseCase.execute({ conversationId, userMessage: dto.content });
  }

  @Post('actions/:actionId/confirm')
  @RequirePermission(Permission.REMINDER_SEND_MANUAL)
  async confirm(@Param('actionId') actionId: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.confirmPendingActionUseCase.execute(actionId, user.userId);
  }

  @Post('actions/:actionId/cancel')
  @RequirePermission(Permission.REMINDER_SEND_MANUAL)
  async cancel(@Param('actionId') actionId: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.cancelPendingActionUseCase.execute(actionId, user.userId);
  }
}
```

`postMessage` is gated by `Permission.RECEIVABLE_READ` only — chatting (including seeing a drafted reminder in the assistant's text) requires just read access; `CopilotChatUseCase` itself decides per-message, via `ROLE_PERMISSIONS`, whether the `draftReminderEmail`/`sendReminderEmail` tools are even visible to the model for this user (Task 7). Only the confirm endpoint — the one that can trigger an actual send — is gated by `Permission.REMINDER_SEND_MANUAL`.

- [ ] **Step 4: Create `apps/backend/src/modules/copilot/copilot.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CopilotConversationOrmEntity } from './infrastructure/copilot-conversation.orm-entity';
import { CopilotMessageOrmEntity } from './infrastructure/copilot-message.orm-entity';
import { CopilotPendingActionOrmEntity } from './infrastructure/copilot-pending-action.orm-entity';
import { AIUsageLogOrmEntity } from './infrastructure/ai-usage-log.orm-entity';
import { TypeOrmCopilotConversationRepository } from './infrastructure/typeorm-copilot-conversation.repository';
import { TypeOrmCopilotPendingActionRepository } from './infrastructure/typeorm-copilot-pending-action.repository';
import { TypeOrmAIUsageLogRepository } from './infrastructure/typeorm-ai-usage-log.repository';
import { COPILOT_CONVERSATION_REPOSITORY } from './application/conversation-repository.port';
import { COPILOT_PENDING_ACTION_REPOSITORY } from './application/pending-action-repository.port';
import { AI_USAGE_LOG_REPOSITORY } from './application/ai-usage-log-repository.port';
import { ANTHROPIC_CLIENT, anthropicClientFactory } from './application/anthropic-client.provider';
import { CopilotToolRegistry } from './application/copilot-tool-registry';
import { GET_RECEIVABLE_SUMMARY_SCHEMA, GetReceivableSummaryTool } from './application/tools/get-receivable-summary.tool';
import {
  GET_COLLECTION_ACTIVITY_TIMELINE_SCHEMA,
  GetCollectionActivityTimelineTool,
} from './application/tools/get-collection-activity-timeline.tool';
import { GET_PAYMENT_HISTORY_SCHEMA, GetPaymentHistoryTool } from './application/tools/get-payment-history.tool';
import {
  DRAFT_REMINDER_EMAIL_SCHEMA,
  DraftReminderEmailTool,
} from './application/tools/draft-reminder-email.tool';
import {
  SEND_REMINDER_EMAIL_SCHEMA,
  SendReminderEmailTool,
} from './application/tools/send-reminder-email.tool';
import { CopilotChatUseCase } from './application/copilot-chat.usecase';
import { ConfirmPendingActionUseCase } from './application/confirm-pending-action.usecase';
import { CancelPendingActionUseCase } from './application/cancel-pending-action.usecase';
import { CopilotController } from './presentation/copilot.controller';
import { ReceivablesModule } from '../receivables/receivables.module';
import { CustomersModule } from '../customers/customers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailTemplatesModule } from '../email-templates/email-templates.module';
import { RemindersModule } from '../reminders/reminders.module';
import { CopilotDraftOrmEntity } from './infrastructure/copilot-draft.orm-entity';

function copilotToolRegistryFactory(): CopilotToolRegistry {
  const registry = new CopilotToolRegistry();
  registry.register({
    name: GetReceivableSummaryTool.NAME,
    description: 'Summarize a customer receivable using precomputed structured data.',
    inputSchema: GET_RECEIVABLE_SUMMARY_SCHEMA,
    requiresReminderPermission: false,
  });
  registry.register({
    name: GetCollectionActivityTimelineTool.NAME,
    description: 'A customer\'s collection activity history.',
    inputSchema: GET_COLLECTION_ACTIVITY_TIMELINE_SCHEMA,
    requiresReminderPermission: false,
  });
  registry.register({
    name: GetPaymentHistoryTool.NAME,
    description: 'A customer\'s payment history.',
    inputSchema: GET_PAYMENT_HISTORY_SCHEMA,
    requiresReminderPermission: false,
  });
  registry.register({
    name: DraftReminderEmailTool.NAME,
    description: 'Create a payment reminder email draft for a receivable — do NOT send the email.',
    inputSchema: DRAFT_REMINDER_EMAIL_SCHEMA,
    requiresReminderPermission: true,
  });
  registry.register({
    name: SendReminderEmailTool.NAME,
    description: 'Propose sending a previously created reminder email draft — the user must separately confirm the actual send.',
    inputSchema: SEND_REMINDER_EMAIL_SCHEMA,
    requiresReminderPermission: true,
  });
  return registry;
}

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CopilotConversationOrmEntity,
      CopilotMessageOrmEntity,
      CopilotPendingActionOrmEntity,
      CopilotDraftOrmEntity,
      AIUsageLogOrmEntity,
    ]),
    ReceivablesModule,
    CustomersModule,
    NotificationsModule,
    EmailTemplatesModule,
    RemindersModule,
  ],
  controllers: [CopilotController],
  providers: [
    { provide: COPILOT_CONVERSATION_REPOSITORY, useClass: TypeOrmCopilotConversationRepository },
    { provide: COPILOT_PENDING_ACTION_REPOSITORY, useClass: TypeOrmCopilotPendingActionRepository },
    { provide: AI_USAGE_LOG_REPOSITORY, useClass: TypeOrmAIUsageLogRepository },
    { provide: ANTHROPIC_CLIENT, useFactory: anthropicClientFactory },
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

`EmailTemplatesModule`/`RemindersModule` are imported directly (no `forwardRef` needed) because neither of those modules imports `CopilotModule` back — the cycle from `2026-08-03-email-notification-service.md`'s reconciliation is strictly between `NotificationsModule` and `RemindersModule`; `CopilotModule` sits outside it as a normal consumer of all three.

- [ ] **Step 5: Verify tool registration**

Confirm the last `registry.register(...)` call in `copilotToolRegistryFactory` uses `SendReminderEmailTool.NAME` and does not require a cast:

```typescript
  registry.register({
    name: SendReminderEmailTool.NAME,
    description: 'Propose sending a previously created reminder email draft — the user must separately confirm the actual send.',
    inputSchema: SEND_REMINDER_EMAIL_SCHEMA,
    requiresReminderPermission: true,
  });
```

- [ ] **Step 6: Register `CopilotModule` in `apps/backend/src/app.module.ts`**

Add `CopilotModule` to the `imports` array, with `import { CopilotModule } from './modules/copilot/copilot.module';`.

- [ ] **Step 7: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/copilot/presentation apps/backend/src/modules/copilot/copilot.module.ts apps/backend/src/app.module.ts
git commit -m "feat: wire CopilotController, CopilotModule, and register it in AppModule"
```

---

### Task 10: Integration test — read-only Q&A sends no email; send-reminder flow calls `EmailService.sendReminderEmail` exactly once

**Files:**
- Create: `apps/backend/test/copilot-chat.integration.spec.ts`

**Interfaces:**
- Consumes: full `AppModule` (Tasks 1-9), real Postgres + Redis via testcontainers (`AppModule` boots `BullMQ`/`NotificationsModule` regardless of Copilot, so both containers are required here — same pattern as `2026-08-03-email-notification-service.md` Task 8), mocked `@anthropic-ai/sdk` (never a real API call), mocked `EMAIL_PROVIDER_ADAPTER` (so no real Resend call happens either)
- Produces: verified end-to-end proof of the two scenarios required by this task, asserted against the REAL `reminder_executions` table (owned by `2026-08-03-reminder-automation.md`) filtered to this test's `receivableId` — not a Copilot-only table

- [ ] **Step 1: Write the integration test**

Create `apps/backend/test/copilot-chat.integration.spec.ts`:

```typescript
const messagesCreateMock = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: messagesCreateMock },
  }));
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { AppModule } from '../src/app.module';
import { EMAIL_PROVIDER_ADAPTER } from '../src/modules/notifications/application/email-provider-adapter.port';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import { OrganizationOrmEntity } from '../src/modules/organizations/infrastructure/organization.orm-entity';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { ReminderExecutionOrmEntity } from '../src/modules/reminders/infrastructure/reminder-execution.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';

describe('Collection Copilot (integration)', () => {
  let postgres: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let token: string;

  const organizationId = '00000000-0000-0000-0000-0000000000a1';
  const customerId = '00000000-0000-0000-0000-0000000000a2';
  const receivableId = '00000000-0000-0000-0000-0000000000a3';

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:16').start();
    redis = await new GenericContainer('redis:7').withExposedPorts(6379).start();
    process.env.DB_HOST = postgres.getHost();
    process.env.DB_PORT = String(postgres.getMappedPort(5432));
    process.env.DB_USERNAME = postgres.getUsername();
    process.env.DB_PASSWORD = postgres.getPassword();
    process.env.DB_NAME = postgres.getDatabase();
    process.env.REDIS_HOST = redis.getHost();
    process.env.REDIS_PORT = String(redis.getMappedPort(6379));

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_PROVIDER_ADAPTER)
      .useValue({ send: jest.fn().mockResolvedValue({ providerMessageId: 'resend-msg-copilot-1' }) })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);

    await dataSource.getRepository(OrganizationOrmEntity).save({
      id: organizationId,
      name: 'Casso QA',
      createdAt: new Date(),
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      id: '00000000-0000-0000-0000-0000000000a9',
      organizationId,
      userId: 'user-1',
      role: Role.FINANCE_MANAGER,
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
    });
    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'QA Company',
      taxCode: '000',
      email: 'qa@example.com',
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      createdAt: new Date(),
    });
    await dataSource.getRepository(ReceivableOrmEntity).save({
      id: receivableId,
      organizationId,
      customerId,
      invoiceId: null,
      originalAmount: 20_000_000,
      paidAmount: 0,
      dueDate: new Date('2026-07-01'),
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: 'user-1',
      createdAt: new Date('2026-06-01'),
      closedAt: null,
      version: 1,
    });

    token = jwtService.sign({ userId: 'user-1', organizationId, role: Role.FINANCE_MANAGER });
  }, 60_000);

  afterEach(() => messagesCreateMock.mockReset());

  afterAll(async () => {
    await app.close();
    await redis.stop();
    await postgres.stop();
  });

  it('answers a read-only question with structured data and sends no email', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'tu_1',
          name: 'getReceivableSummary',
          input: { customerId },
        },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'This customer currently has an overdue receivable.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 20, output_tokens: 10 },
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/copilot/conversations/00000000-0000-0000-0000-0000000000b1/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'How overdue is this customer?' })
      .expect(201);

    expect(response.body.pendingAction).toBeNull();
    expect(response.body.message.content).toContain('overdue');

    const executions = await dataSource.getRepository(ReminderExecutionOrmEntity).find({ where: { receivableId } });
    expect(executions).toHaveLength(0);
  });

  it('drafts then proposes a reminder; only the confirm endpoint calls EmailService.sendReminderEmail, exactly once', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [
        { type: 'tool_use', id: 'tu_2', name: 'draftReminderEmail', input: { receivableId, tone: 'polite' } },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 30, output_tokens: 10 },
    });
    messagesCreateMock.mockResolvedValueOnce({
      content: [
        { type: 'text', text: 'This is a draft; would you like to send it?' },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 40, output_tokens: 15 },
    });

    const draftResponse = await request(app.getHttpServer())
      .post('/api/v1/copilot/conversations/00000000-0000-0000-0000-0000000000b2/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Draft a reminder email for QA Company' })
      .expect(201);

    expect(draftResponse.body.pendingAction).toBeNull();
    expect(draftResponse.body.message.content).toContain('draft');

    // Extract the draftId the tool call produced via a fresh model turn that asks to send it.
    const draftRow = await dataSource.query(
      `SELECT id FROM copilot_drafts WHERE "receivableId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
      [receivableId],
    );
    const draftId = draftRow[0].id;

    messagesCreateMock.mockResolvedValueOnce({
      content: [
        { type: 'text', text: 'Proposing to send the reminder email.' },
        {
          type: 'tool_use',
          id: 'tu_3',
          name: 'sendReminderEmail',
          input: { draftId, receivableId },
        },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 50, output_tokens: 20 },
    });

    const sendResponse = await request(app.getHttpServer())
      .post('/api/v1/copilot/conversations/00000000-0000-0000-0000-0000000000b2/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'That is right, send the reminder email now' })
      .expect(201);

    expect(sendResponse.body.pendingAction).not.toBeNull();
    expect(messagesCreateMock).toHaveBeenCalledTimes(3); // 1 for the draft turn, 1 for its final text, 1 for the send-proposal turn — loop halted before any 4th call
    const executionsBeforeConfirm = await dataSource
      .getRepository(ReminderExecutionOrmEntity)
      .find({ where: { receivableId } });
    expect(executionsBeforeConfirm).toHaveLength(0); // proposing never executes anything

    const pendingActionId = sendResponse.body.pendingAction.id;
    await request(app.getHttpServer())
      .post(`/api/v1/copilot/actions/${pendingActionId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const executionsAfterConfirm = await dataSource
      .getRepository(ReminderExecutionOrmEntity)
      .find({ where: { receivableId } });
    expect(executionsAfterConfirm).toHaveLength(1); // ConfirmPendingActionUseCase creates this row (reminderRuleId: null) before calling EmailService
    expect(executionsAfterConfirm[0].reminderRuleId).toBeNull();

    // Confirming twice must not be allowed — the second confirm 400s and no second execution row is created.
    await request(app.getHttpServer())
      .post(`/api/v1/copilot/actions/${pendingActionId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    const executionsAfterSecondConfirm = await dataSource
      .getRepository(ReminderExecutionOrmEntity)
      .find({ where: { receivableId } });
    expect(executionsAfterSecondConfirm).toHaveLength(1);
  });

  it('cancels a proposed reminder without creating an execution', async () => {
    const before = await dataSource
      .getRepository(ReminderExecutionOrmEntity)
      .count({ where: { receivableId } });
    const draftRow = await dataSource.query(
      `SELECT id FROM copilot_drafts WHERE "receivableId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
      [receivableId],
    );
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'tu_cancel', name: 'sendReminderEmail', input: { draftId: draftRow[0].id, receivableId } }],
      stop_reason: 'tool_use',
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/copilot/conversations/00000000-0000-0000-0000-0000000000b3/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Do not send this email' })
      .expect(201);
    const pendingActionId = response.body.pendingAction.id;

    await request(app.getHttpServer())
      .post(`/api/v1/copilot/actions/${pendingActionId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const after = await dataSource
      .getRepository(ReminderExecutionOrmEntity)
      .count({ where: { receivableId } });
    expect(after).toBe(before);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- copilot-chat.integration.spec.ts`
Expected: all three tests PASS. The read-only test proves no send, the confirm test proves exactly one execution and rejects a second confirm, and the cancel test proves cancellation creates no execution.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/copilot-chat.integration.spec.ts
git commit -m "test: add end-to-end proof that Copilot sends reminders only via confirm, never mid-chat"
```

---

## Self-Review Notes

### Reconciliation contract (authoritative)

The tool classes and registry names in this plan must resolve to these exact public names before implementation is considered complete:

```typescript
type CopilotReadToolName =
  | 'getReceivableSummary'
  | 'getCollectionActivityTimeline'
  | 'getPaymentHistory';

type CopilotActionToolName = 'draftReminderEmail' | 'sendReminderEmail';

interface GetCollectionActivityTimelineInput { customerId: string; limit?: number }
interface GetPaymentHistoryInput { customerId: string; limit?: number }
interface CopilotTurnResponseDto {
  message: CopilotMessageRecord;
  pendingAction: CopilotPendingAction | null;
}
```

`getCollectionActivityTimeline` delegates to the Collection Activity read port and `getPaymentHistory` delegates to the Payment history read port; they are required public tools, not optional follow-up tools. Only the five names in `SAFE_TOOL_NAMES` may be registered or returned in the HTTP DTO.

- **Spec coverage:** Hardcoded, test-proven tool whitelist (spec section 2) → Task 3. Structured-data-only read tools (spec section 1) → Task 4. Draft-then-confirm flow where the model never executes the write (spec section 1 "Key point") → Tasks 5-8, proven end-to-end in Task 10. `AIUsageLog` on every call including errors, 15s timeout + 1 retry (spec section 4) → Task 7's `CopilotChatUseCase.callModel`/`callModelWithRetry`. `CopilotPendingAction` 10-minute expiry (spec section 4) → Task 8. `Permission.REMINDER_SEND_MANUAL` gating both tool visibility and the confirm endpoint (spec section 4) → Tasks 7 and 9. No credentials in prompts/tool responses (spec section 4) → every tool in Tasks 4-6 only ever returns `Receivable`/`Customer`/draft fields, never a `BankConnection` field.
- **Read-tool ownership:** `getReceivableSummary` adapts the receivable/customer read port, `getCollectionActivityTimeline` adapts the Collection Activity read port, and `getPaymentHistory` adapts the payment-history read port. The Copilot module owns only tool registration and tenant/permission guards; it does not duplicate any domain query or introduce a second persistence contract.
- **Reconciled with the real Email Template and Reminder Automation plans (2026-08-04 pass):** an earlier version of this plan bound its own `CopilotEmailTemplateRepository`/`TypeOrmCopilotReminderExecutionRepository` to `NotificationsModule`'s then-unbound `EMAIL_TEMPLATE_REPOSITORY`/`REMINDER_EXECUTION_REPOSITORY` tokens, on the theory that no real implementation existed yet. Both `2026-08-03-email-template-management.md` and `2026-08-03-reminder-automation.md` now exist and are already bound into `NotificationsModule` by `2026-08-03-email-notification-service.md`'s own reconciliation — a second `useClass` for the same token was never actually going to work (NestJS resolves one provider per token per module graph, not "whichever module registered it last"), so this was fixed at the design level, not patched around. `ConfirmPendingActionUseCase` (Task 8) now creates one throwaway real `EmailTemplate` row (the draft's already-composed subject/bodyHtml, no `{{}}` tokens, so `RenderEmailTemplateUseCase` is a harmless pass-through) and one real `ReminderExecution` row (`reminderRuleId: null` — reminder-automation.md's Task 2 made this field nullable specifically for this case), then calls `EmailService.sendReminderEmail` exactly as a rule-based reminder would. `CopilotModule` now imports `EmailTemplatesModule`/`RemindersModule` directly (no `forwardRef`, no cycle — neither module imports `CopilotModule` back).
- **Lazy conversation creation:** the task brief specifies only `POST /api/v1/copilot/conversations/:id/messages`, no separate create-conversation endpoint. `ICopilotConversationRepository.findOrCreate` (Task 2) auto-creates the conversation row scoped to the caller's organization and user id the first time a client posts to a given conversation id, rather than requiring a prior `POST /api/v1/copilot/conversations`. If a future plan wants an explicit "list my conversations" UI, add a `GET /api/v1/copilot/conversations` endpoint and a `findByUserId` method — no changes needed to the auto-create behavior.
- **Billing/usage-metering gating was left out on purpose:** the target spec's own "Open questions" section (section 6) leaves "should the daily chat-turn limit follow Usage Metering or remain free in the MVP?" explicitly open and unresolved by the spec author. Per this task's instruction to only add plan-gating "if the spec clearly calls for it," this plan treats Copilot chat as free/ungated in the MVP and does not touch `2026-08-03-billing-usage-metering.md`. Wiring a per-organization daily chat-turn cap is a natural follow-up once that open question is resolved — the natural seam is `CopilotChatUseCase.execute`, which already logs every call to `AIUsageLog` and could check a daily count there before calling the model.
- **Type/token consistency checked:** `EmailService.sendReminderEmail`'s exact signature `{ receivableId, templateId, reminderExecutionId }` (from `2026-08-03-email-notification-service.md` Task 4) is used verbatim in `ConfirmPendingActionUseCase` (Task 8) — no signature drift. `IReceivableRepository`/`ICustomerRepository`'s post-multi-tenancy-plan shape (`findById(id)`, no `organizationId` parameter) is used throughout Tasks 4-6, matching `2026-08-03-multi-tenancy-rbac.md` Task 6's migration exactly. `EmailTemplate`/`ReminderExecution` domain classes and their real `EMAIL_TEMPLATE_REPOSITORY`/`REMINDER_EXECUTION_REPOSITORY` tokens (Task 8) are imported from their owning modules, not redeclared — `ReminderExecution`'s `reminderRuleId: string | null` widening is consumed here exactly as `2026-08-03-reminder-automation.md`'s own Self-Review Notes describe it.


