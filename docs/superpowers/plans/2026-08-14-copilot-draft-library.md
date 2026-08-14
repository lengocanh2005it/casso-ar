# Copilot Draft Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /copilot/drafts` (paginated, tenant+user-scoped, status filter) and `POST /copilot/drafts/:id/reopen` let a user list every reminder-email draft Copilot has created for them and bring a cancelled/expired/orphaned one back into an actionable pending state; a "Drafts" tab on the Copilot page surfaces the list with Confirm/Reopen actions.

**Architecture:** `CopilotDraft` stays an immutable content record (no `status` column). Draft status (`DRAFTED | PENDING | CONFIRMED | CANCELLED | EXPIRED`) is *derived* at read time from the most recent `CopilotPendingAction` whose `payload.draftId` matches the draft — computed by a new pure function `deriveCopilotDraftStatus()` shared by the list use case and the reopen use case, so the 10-minute expiry rule lives in exactly one place. `userId` is added to `CopilotDraft` (nullable — pre-migration rows have no owner and simply won't appear in anyone's list) and threaded from `CopilotChatUseCase` through `DraftReminderEmailTool`. Reopening a draft never mutates the draft or any existing `CopilotPendingAction` row — it creates a fresh `CopilotConversation` (via the existing `findOrCreate`) and a fresh `CopilotPendingAction` (via the existing `create`), exactly mirroring what happens when the model calls `sendReminderEmail` during a live chat.

**Tech Stack:** NestJS 11, TypeORM 1.1 (one migration, no new entities), class-validator, Jest 30, React 19 + TanStack Query (frontend).

**Spec:** GitHub issue #136 (this plan implements it) and #171 (edit/delete draft — explicitly out of scope, split out during grilling). No separate design doc exists; the decisions below were reached via `superpowers:grilling` in the conversation that produced this plan and are restated here as the Global Constraints this plan implements.

## Global Constraints

- `userId` is added to `copilot_drafts` (nullable `character varying`, matching the existing `organizationId`/`userId` column style in this table family) — in scope of this ticket, not deferred.
- `CopilotDraft` gets **no** `status` column. Status is always derived from the latest `CopilotPendingAction` for that draft, computed in TypeScript by `deriveCopilotDraftStatus()`.
- Status enum: `DRAFTED` (no pending action ever created) `| PENDING | CONFIRMED | CANCELLED | EXPIRED`. `EXPIRED` is derived at read time (`status === 'PENDING' && now - createdAt > PENDING_ACTION_EXPIRY_MINUTES`), not persisted — mirrors the existing `isOverdue`/`remainingAmount` derived-field pattern (AGENTS.md).
- Reopen creates a **new** `CopilotConversation` + a **new** `CopilotPendingAction` PENDING row pointing at the existing draft. It never edits the draft or any prior pending action.
- Reopen is only allowed when derived status is `CANCELLED`, `EXPIRED`, or `DRAFTED`. `PENDING` (still live) and `CONFIRMED` (already sent) are rejected with `ErrorCode.CONFLICT`.
- Permissions: `GET /copilot/drafts` → `Permission.RECEIVABLE_READ` (read-only, matches `GET /copilot/usage`). `POST /copilot/drafts/:id/reopen` → `Permission.REMINDER_SEND_MANUAL` (matches confirm/cancel — it can lead to sending an email).
- FE scope is list + Confirm (reuses the existing `confirmCopilotAction` API) + Reopen. No edit/delete UI — that's #171.
- `application/` layer code MUST NOT throw `HttpException`/`@nestjs/common` exception classes or import concrete SDKs (AGENTS.md, `.claude/rules/application.md`) — only `AppError`, ports, `TenantContextService`, `@Injectable`/`@Inject`.
- Response DTOs MUST NOT leak `organizationId` or `userId` (AGENTS.md).
- Domain ↔ ORM translation MUST be an explicit `toOrm()`/`toDomain()` mapper — never `as`/`as unknown as` (AGENTS.md, `.claude/rules/infrastructure.md`).
- Repositories scoped by `organizationId` use `TenantContextService.getOrganizationId()`; ownership checks against `userId` are additional application-layer/query filters on top of that, never a replacement for it.
- Every mutating POST wraps its handler in `IdempotencyService.execute(endpoint, key, input, callback)` (`.claude/rules/api.md`), exactly like the existing `confirm`/`cancel` endpoints.
- TDD RED → GREEN → REFACTOR for every task except the migration (AGENTS.md TDD exception for migrations).
- Biome: single quotes, semicolons always, 2-space indent, no trailing commas.
- Money/persisted-rollup/tenant-isolation rules are unchanged and untouched by this plan.

---

### Task 1: Migration — add `userId` to `copilot_drafts`

**Files:**
- Create: `apps/backend/src/database/migrations/20260818000000-add-copilot-drafts-user-id.ts`

**Interfaces:**
- Produces: `copilot_drafts.userId` column (nullable `character varying`) + index `IDX_copilot_drafts_organization_user` on `("organizationId", "userId")` — consumed by Task 2's ORM entity and Task 5's repository query.

No test (migrations are the documented TDD exception in AGENTS.md). Written to match the existing `copilot_drafts` table style in `20260809020000-add-copilot-tables.ts` exactly (same file, same table).

- [ ] **Step 1: Write the migration**

```typescript
// apps/backend/src/database/migrations/20260818000000-add-copilot-drafts-user-id.ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCopilotDraftsUserId20260818000000
  implements MigrationInterface
{
  name = 'AddCopilotDraftsUserId20260818000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "copilot_drafts" ADD COLUMN IF NOT EXISTS "userId" character varying',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_copilot_drafts_organization_user" ON "copilot_drafts" ("organizationId", "userId")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_copilot_drafts_organization_user"',
    );
    await queryRunner.query(
      'ALTER TABLE "copilot_drafts" DROP COLUMN IF EXISTS "userId"',
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/database/migrations/20260818000000-add-copilot-drafts-user-id.ts
git commit -m "feat: add userId column to copilot_drafts"
```

---

### Task 2: Thread `userId` through `CopilotDraft`

**Files:**
- Modify: `apps/backend/src/modules/copilot/application/draft-repository.port.ts`
- Modify: `apps/backend/src/modules/copilot/infrastructure/copilot-draft.orm-entity.ts`
- Modify: `apps/backend/src/modules/copilot/infrastructure/typeorm-copilot-draft.repository.ts`
- Modify: `apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.ts`
- Modify: `apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.spec.ts`
- Modify: `apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts`

**Context:** `CopilotDraft` (`draft-repository.port.ts:1-9`) currently has no `userId`. `DraftReminderEmailTool.execute(input, organizationId)` (`draft-reminder-email.tool.ts:63-66`) is called from `CopilotChatUseCase.executeTool(name, input, organizationId)` (`copilot-chat.usecase.ts:168-172`), itself called from `execute()` where `user.userId` is already in scope (`copilot-chat.usecase.ts:229`, used at both call sites of `executeTool`, lines ~290 and ~334).

**Interfaces:**
- Produces: `CopilotDraft.userId: string | null`; `DraftReminderEmailTool.execute(input, organizationId, userId)`; `CopilotChatUseCase.executeTool(name, input, organizationId, userId)` — consumed by Task 5's `findAllForUser`.

- [ ] **Step 1: Update the failing test first**

Modify `apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.spec.ts` — every `tool.execute(...)` call gains a third argument, and the first test's assertion gains `userId`:

```typescript
// apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.spec.ts
// Replace the first test's call and assertion:
    const result = await tool.execute(
      { receivableId: 'rec-1', tone: 'urgent' },
      'org-1',
      'user-1',
    );

    expect(result.recipientEmail).toBe('ap@abc.vn');
    expect(result.subject).toContain('ABC Company');
    expect(result.bodyHtml).toContain('30.000.000');
    expect(draftRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: result.draftId,
        organizationId: 'org-1',
        userId: 'user-1',
        receivableId: 'rec-1',
        recipientEmail: 'ap@abc.vn',
      }),
    );

// Add 'user-1' as the third argument to every other tool.execute(...) call
// in the file (the three remaining `it` blocks), e.g.:
//   tool.execute({ receivableId: 'missing' }, 'org-1', 'user-1')
//   tool.execute({ receivableId: 'rec-1' }, 'org-1', 'user-1')  (x2)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern draft-reminder-email.tool`
Expected: FAIL — `draftRepo.save` assertion missing `userId`, and/or TS error once Step 3 changes the signature (run again after Step 3 if it fails to compile first).

- [ ] **Step 3: Update the port**

```typescript
// apps/backend/src/modules/copilot/application/draft-repository.port.ts
export interface CopilotDraft {
  id: string;
  organizationId: string;
  userId: string | null;
  receivableId: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
  createdAt: Date;
}

export interface ICopilotDraftRepository {
  save(draft: CopilotDraft): Promise<void>;
  findById(id: string): Promise<CopilotDraft | null>;
  findAllForUser(userId: string): Promise<CopilotDraft[]>;
}

export const COPILOT_DRAFT_REPOSITORY = Symbol('COPILOT_DRAFT_REPOSITORY');
```

(`findAllForUser` is declared here now; implemented in Task 5. Leaving it unimplemented on `TypeOrmCopilotDraftRepository` would fail the `implements` check, so Task 5 must land before this file compiles — do Task 2 and Task 5 in the same PR/session, which this plan's ordering already does.)

- [ ] **Step 4: Update the ORM entity**

```typescript
// apps/backend/src/modules/copilot/infrastructure/copilot-draft.orm-entity.ts
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'copilot_drafts' })
@Index(['organizationId', 'receivableId'])
@Index(['organizationId', 'userId'])
export class CopilotDraftOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column({ type: 'varchar', nullable: true })
  userId: string | null;

  @Column()
  receivableId: string;

  @Column()
  recipientEmail: string;

  @Column()
  subject: string;

  @Column('text')
  bodyHtml: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
```

- [ ] **Step 5: Update the repository mapper**

Modify `apps/backend/src/modules/copilot/infrastructure/typeorm-copilot-draft.repository.ts` — add `userId` to both `toOrm` and `toDomain`:

```typescript
function toOrm(draft: CopilotDraft): CopilotDraftOrmEntity {
  return {
    id: draft.id,
    organizationId: draft.organizationId,
    userId: draft.userId,
    receivableId: draft.receivableId,
    recipientEmail: draft.recipientEmail,
    subject: draft.subject,
    bodyHtml: draft.bodyHtml,
    createdAt: draft.createdAt,
  };
}

function toDomain(row: CopilotDraftOrmEntity): CopilotDraft {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    receivableId: row.receivableId,
    recipientEmail: row.recipientEmail,
    subject: row.subject,
    bodyHtml: row.bodyHtml,
    createdAt: row.createdAt,
  };
}
```

(`findAllForUser` is added to this class in Task 5 — do not add a stub here.)

- [ ] **Step 6: Update `DraftReminderEmailTool`**

Modify `apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.ts`:

```typescript
  async execute(
    input: { receivableId: string; tone?: 'polite' | 'urgent' },
    organizationId: string,
    userId: string,
  ): Promise<DraftReminderEmailResult> {
```

and in the `draftRepo.save(...)` call, add `userId,` alongside `organizationId,`.

- [ ] **Step 7: Thread `userId` through `CopilotChatUseCase`**

Modify `apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts`:

```typescript
  private executeTool(
    name: string,
    input: Record<string, unknown>,
    organizationId: string,
    userId: string,
  ): Promise<unknown> {
    switch (name) {
      // ...unchanged cases for GetReceivableSummaryTool / GetCollectionActivityTimelineTool / GetPaymentHistoryTool...
      case DraftReminderEmailTool.NAME:
        return this.draftReminderEmailTool.execute(
          {
            receivableId: requiredString(input, 'receivableId'),
            tone: input.tone === 'urgent' ? 'urgent' : 'polite',
          },
          organizationId,
          userId,
        );
      // ...unchanged SendReminderEmailTool / default cases...
    }
  }
```

Update both call sites of `this.executeTool(...)` (one inside the `Promise.all` batching non-`sendReminderEmail` tool calls, one inside `toolResults`) to pass `user.userId` as the fourth argument, e.g. `this.executeTool(call.name, call.arguments, user.organizationId, user.userId)`.

- [ ] **Step 8: Run test to verify it passes**

Run: `npx jest --testPathPattern draft-reminder-email.tool`
Expected: PASS (4 tests) — note this will still fail to compile until Task 5 adds `findAllForUser` to `TypeOrmCopilotDraftRepository`; if running Task 2 in isolation, stub it with `async findAllForUser(): Promise<CopilotDraft[]> { return []; }` temporarily and let Task 5 replace it.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/copilot/application/draft-repository.port.ts apps/backend/src/modules/copilot/infrastructure/copilot-draft.orm-entity.ts apps/backend/src/modules/copilot/infrastructure/typeorm-copilot-draft.repository.ts apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.ts apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.spec.ts apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts
git commit -m "feat: thread userId through CopilotDraft creation"
```

---

### Task 3: `deriveCopilotDraftStatus()`

**Files:**
- Create: `apps/backend/src/modules/copilot/application/derive-draft-status.ts`
- Test: `apps/backend/src/modules/copilot/application/derive-draft-status.spec.ts`

**Interfaces:**
- Consumes: `PENDING_ACTION_EXPIRY_MINUTES`, `CopilotPendingActionStatus` (existing, `pending-action-repository.port.ts`).
- Produces: `CopilotDraftStatus = 'DRAFTED' | 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED'`, `deriveCopilotDraftStatus(action: { status: CopilotPendingActionStatus; createdAt: Date } | null, now: Date): CopilotDraftStatus` — consumed by Task 6 (`ListCopilotDraftsUseCase`) and Task 8 (`ReopenCopilotDraftUseCase`).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/copilot/application/derive-draft-status.spec.ts
import { deriveCopilotDraftStatus } from './derive-draft-status';

describe('deriveCopilotDraftStatus', () => {
  const now = new Date('2026-08-14T10:00:00Z');

  it('returns DRAFTED when there is no pending action', () => {
    expect(deriveCopilotDraftStatus(null, now)).toBe('DRAFTED');
  });

  it('returns PENDING when the action is still within the expiry window', () => {
    const action = {
      status: 'PENDING' as const,
      createdAt: new Date('2026-08-14T09:55:00Z'),
    };
    expect(deriveCopilotDraftStatus(action, now)).toBe('PENDING');
  });

  it('returns EXPIRED when a PENDING action is older than the expiry window', () => {
    const action = {
      status: 'PENDING' as const,
      createdAt: new Date('2026-08-14T09:00:00Z'),
    };
    expect(deriveCopilotDraftStatus(action, now)).toBe('EXPIRED');
  });

  it('passes through CONFIRMED, CANCELLED, and already-persisted EXPIRED as-is', () => {
    for (const status of ['CONFIRMED', 'CANCELLED', 'EXPIRED'] as const) {
      expect(
        deriveCopilotDraftStatus({ status, createdAt: now }, now),
      ).toBe(status);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern derive-draft-status`
Expected: FAIL with "Cannot find module './derive-draft-status'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/copilot/application/derive-draft-status.ts
import {
  type CopilotPendingActionStatus,
  PENDING_ACTION_EXPIRY_MINUTES,
} from './pending-action-repository.port';

export type CopilotDraftStatus =
  | 'DRAFTED'
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED';

export function deriveCopilotDraftStatus(
  action: { status: CopilotPendingActionStatus; createdAt: Date } | null,
  now: Date,
): CopilotDraftStatus {
  if (!action) return 'DRAFTED';
  if (
    action.status === 'PENDING' &&
    now.getTime() - action.createdAt.getTime() >
      PENDING_ACTION_EXPIRY_MINUTES * 60_000
  ) {
    return 'EXPIRED';
  }
  return action.status;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern derive-draft-status`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/copilot/application/derive-draft-status.ts apps/backend/src/modules/copilot/application/derive-draft-status.spec.ts
git commit -m "feat: add deriveCopilotDraftStatus"
```

---

### Task 4: `ICopilotPendingActionRepository.findLatestForDraftIds()`

**Files:**
- Modify: `apps/backend/src/modules/copilot/application/pending-action-repository.port.ts`
- Modify: `apps/backend/src/modules/copilot/infrastructure/typeorm-copilot-pending-action.repository.ts`
- Test: `apps/backend/src/modules/copilot/infrastructure/typeorm-copilot-pending-action.repository.spec.ts` (new — this class currently has no spec file; the query-builder JSON-path expression is worth a real-DB check, done in Task 10's e2e-spec, but the batching/"latest wins" logic is pure enough to unit test against a fake query builder is not worth it — see note below)

**Context:** `payload` is `jsonb` with a `draftId` key (`SendReminderEmailPayload`). Postgres's `->>'draftId'` operator extracts it as text; `CopilotPendingActionOrmEntity.id` is `uuid`, `payload` values are plain strings, so the comparison is text-to-text — no cast needed.

**Interfaces:**
- Produces: `ICopilotPendingActionRepository.findLatestForDraftIds(draftIds: string[]): Promise<Map<string, CopilotPendingAction>>` — consumed by Task 6 and Task 8.

**Note on testing this task:** the new method is a thin TypeORM query-builder call with a Postgres-specific JSON operator; a unit test would just be re-asserting the mocked query-builder's fluent chain calls itself, which the codebase's existing repository tests don't do (`typeorm-copilot-pending-action.repository.ts` has no `.spec.ts` today — it's exercised via `confirm-pending-action.usecase.spec.ts`'s mocked port and via `copilot-chat.integration.spec.ts`'s real Postgres container). Follow that established pattern: this task has no new unit spec; **Task 10's e2e-spec is this method's test** (RED there is "the list/reopen endpoints don't reflect a second pending action as latest", GREEN is this implementation). Do not skip Task 10.

- [ ] **Step 1: Update the port**

```typescript
// apps/backend/src/modules/copilot/application/pending-action-repository.port.ts
// add to ICopilotPendingActionRepository, after cancelIfPending:
  findLatestForDraftIds(
    draftIds: string[],
  ): Promise<Map<string, CopilotPendingAction>>;
```

- [ ] **Step 2: Implement it**

```typescript
// apps/backend/src/modules/copilot/infrastructure/typeorm-copilot-pending-action.repository.ts
// add as a new method on TypeOrmCopilotPendingActionRepository:
  async findLatestForDraftIds(
    draftIds: string[],
  ): Promise<Map<string, CopilotPendingAction>> {
    const map = new Map<string, CopilotPendingAction>();
    if (draftIds.length === 0) return map;

    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.ormRepo
      .createQueryBuilder('action')
      .where('action.organizationId = :organizationId', { organizationId })
      .andWhere(`action.payload ->> 'draftId' IN (:...draftIds)`, {
        draftIds,
      })
      .orderBy('action.createdAt', 'ASC')
      .getMany();

    // Ascending order means each later row for the same draftId overwrites
    // the earlier one, leaving the latest action per draft in the map.
    for (const row of rows) {
      map.set(row.payload.draftId, toDomain(row));
    }
    return map;
  }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS, no type errors (the interface is now fully implemented)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/copilot/application/pending-action-repository.port.ts apps/backend/src/modules/copilot/infrastructure/typeorm-copilot-pending-action.repository.ts
git commit -m "feat: add findLatestForDraftIds to pending action repository"
```

---

### Task 5: `ICopilotDraftRepository.findAllForUser()`

**Files:**
- Modify: `apps/backend/src/modules/copilot/infrastructure/typeorm-copilot-draft.repository.ts`

**Context:** Completes the `ICopilotDraftRepository` interface from Task 2 (which declared `findAllForUser` but this class doesn't implement it yet — until this task lands, the codebase does not type-check). Plain `organizationId` + `userId` filter, no JSON logic needed here (that's Task 4, on the other repository).

**Interfaces:**
- Produces: `TypeOrmCopilotDraftRepository.findAllForUser(userId: string): Promise<CopilotDraft[]>`, ordered newest-first — consumed by Task 6 and Task 8.

Same testing note as Task 4: this is a plain TypeORM `.find()` call with no branching logic; it's exercised by Task 10's e2e-spec, not a new unit spec.

- [ ] **Step 1: Implement it**

```typescript
// apps/backend/src/modules/copilot/infrastructure/typeorm-copilot-draft.repository.ts
// add as a new method on TypeOrmCopilotDraftRepository:
  async findAllForUser(userId: string): Promise<CopilotDraft[]> {
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.ormRepo.find({
      where: { organizationId, userId },
      order: { createdAt: 'DESC' },
    });
    return rows.map(toDomain);
  }
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS, no type errors

- [ ] **Step 3: Run the full copilot unit suite**

Run: `npx jest --testPathPattern modules/copilot`
Expected: PASS (all existing + Task 2/3 tests green)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/copilot/infrastructure/typeorm-copilot-draft.repository.ts
git commit -m "feat: add findAllForUser to copilot draft repository"
```

---

### Task 6: `ListCopilotDraftsUseCase`

**Files:**
- Create: `apps/backend/src/modules/copilot/application/list-copilot-drafts.usecase.ts`
- Test: `apps/backend/src/modules/copilot/application/list-copilot-drafts.usecase.spec.ts`

**Context:** Fetches every draft for the current user, joins in each draft's latest pending action, derives status per draft, then filters/paginates **in memory**. Deliberate: avoids duplicating the expiry-window math in SQL (it stays in one place, `deriveCopilotDraftStatus`), and Copilot drafts are a low-volume per-user list (bounded by `PlanLimitService.enforceCopilotChatLimit`'s monthly chat cap), so an in-memory slice is proportionate.

**Interfaces:**
- Consumes: `ICopilotDraftRepository.findAllForUser` (Task 5), `ICopilotPendingActionRepository.findLatestForDraftIds` (Task 4), `deriveCopilotDraftStatus` (Task 3), `TenantContextService.getCurrentUser`.
- Produces: `CopilotDraftListItem` (`CopilotDraft & { status: CopilotDraftStatus; pendingActionId: string | null }`), `ListCopilotDraftsUseCase.execute(page: number, limit: number, status?: CopilotDraftStatus): Promise<{ items: CopilotDraftListItem[]; total: number }>` — consumed by Task 7's controller.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/copilot/application/list-copilot-drafts.usecase.spec.ts
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { CopilotDraft } from './draft-repository.port';
import { ListCopilotDraftsUseCase } from './list-copilot-drafts.usecase';
import type { CopilotPendingAction } from './pending-action-repository.port';

function buildDraft(id: string, createdAt: string): CopilotDraft {
  return {
    id,
    organizationId: 'org-1',
    userId: 'user-1',
    receivableId: `rec-${id}`,
    recipientEmail: 'ap@abc.vn',
    subject: `Draft ${id}`,
    bodyHtml: '<p>body</p>',
    createdAt: new Date(createdAt),
  };
}

function buildAction(
  draftId: string,
  status: CopilotPendingAction['status'],
  createdAt: string,
): CopilotPendingAction {
  return {
    id: `action-${draftId}`,
    organizationId: 'org-1',
    conversationId: 'conv-1',
    actionType: 'SEND_REMINDER_EMAIL',
    payload: { draftId, receivableId: `rec-${draftId}` },
    status,
    createdAt: new Date(createdAt),
    resolvedAt: null,
    resolvedByUserId: null,
  };
}

describe('ListCopilotDraftsUseCase', () => {
  it('derives status per draft, filters by status, and paginates in memory', async () => {
    const drafts = [
      buildDraft('d1', '2026-08-14T10:00:00Z'),
      buildDraft('d2', '2026-08-14T09:00:00Z'),
      buildDraft('d3', '2026-08-14T08:00:00Z'),
    ];
    const draftRepo = {
      findAllForUser: jest.fn().mockResolvedValue(drafts),
    };
    const actionsMap = new Map([
      ['d1', buildAction('d1', 'CANCELLED', '2026-08-14T10:01:00Z')],
      // d2 has no action -> DRAFTED
      ['d3', buildAction('d3', 'CONFIRMED', '2026-08-14T08:01:00Z')],
    ]);
    const pendingActionRepo = {
      findLatestForDraftIds: jest.fn().mockResolvedValue(actionsMap),
    };
    const tenantContext = {
      getCurrentUser: () => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'ACCOUNTANT',
      }),
    } as unknown as TenantContextService;

    const useCase = new ListCopilotDraftsUseCase(
      draftRepo as never,
      pendingActionRepo as never,
      tenantContext,
    );

    const all = await useCase.execute(1, 20);
    expect(all.total).toBe(3);
    expect(all.items.map((item) => [item.id, item.status])).toEqual([
      ['d1', 'CANCELLED'],
      ['d2', 'DRAFTED'],
      ['d3', 'CONFIRMED'],
    ]);
    expect(all.items[0].pendingActionId).toBe('action-d1');
    expect(all.items[1].pendingActionId).toBeNull();

    const filtered = await useCase.execute(1, 20, 'DRAFTED');
    expect(filtered.total).toBe(1);
    expect(filtered.items.map((item) => item.id)).toEqual(['d2']);

    const paged = await useCase.execute(2, 2);
    expect(paged.total).toBe(3);
    expect(paged.items.map((item) => item.id)).toEqual(['d3']);
  });

  it('throws UNAUTHORIZED when there is no current user', async () => {
    const tenantContext = {
      getCurrentUser: () => undefined,
    } as unknown as TenantContextService;
    const useCase = new ListCopilotDraftsUseCase(
      { findAllForUser: jest.fn() } as never,
      { findLatestForDraftIds: jest.fn() } as never,
      tenantContext,
    );

    await expect(useCase.execute(1, 20)).rejects.toMatchObject({
      errorCode: ErrorCode.UNAUTHORIZED,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern list-copilot-drafts.usecase`
Expected: FAIL with "Cannot find module './list-copilot-drafts.usecase'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/copilot/application/list-copilot-drafts.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  type CopilotDraftStatus,
  deriveCopilotDraftStatus,
} from './derive-draft-status';
import {
  COPILOT_DRAFT_REPOSITORY,
  type CopilotDraft,
  type ICopilotDraftRepository,
} from './draft-repository.port';
import {
  COPILOT_PENDING_ACTION_REPOSITORY,
  type ICopilotPendingActionRepository,
} from './pending-action-repository.port';

export interface CopilotDraftListItem extends CopilotDraft {
  status: CopilotDraftStatus;
  pendingActionId: string | null;
}

@Injectable()
export class ListCopilotDraftsUseCase {
  constructor(
    @Inject(COPILOT_DRAFT_REPOSITORY)
    private readonly draftRepo: ICopilotDraftRepository,
    @Inject(COPILOT_PENDING_ACTION_REPOSITORY)
    private readonly pendingActionRepo: ICopilotPendingActionRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    page: number,
    limit: number,
    status?: CopilotDraftStatus,
  ): Promise<{ items: CopilotDraftListItem[]; total: number }> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }

    const drafts = await this.draftRepo.findAllForUser(user.userId);
    const latestActions = await this.pendingActionRepo.findLatestForDraftIds(
      drafts.map((draft) => draft.id),
    );
    const now = new Date();
    const withStatus: CopilotDraftListItem[] = drafts.map((draft) => {
      const action = latestActions.get(draft.id) ?? null;
      return {
        ...draft,
        status: deriveCopilotDraftStatus(action, now),
        pendingActionId: action?.id ?? null,
      };
    });

    // ponytail: filters/paginates in memory after fetching every draft for
    // the user — swap to SQL-side filtering+pagination if a single user
    // accumulates thousands of drafts (bounded today by the monthly copilot
    // chat limit in PlanLimitService).
    const filtered = status
      ? withStatus.filter((item) => item.status === status)
      : withStatus;
    const start = (page - 1) * limit;
    return { items: filtered.slice(start, start + limit), total: filtered.length };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern list-copilot-drafts.usecase`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/copilot/application/list-copilot-drafts.usecase.ts apps/backend/src/modules/copilot/application/list-copilot-drafts.usecase.spec.ts
git commit -m "feat: add ListCopilotDraftsUseCase"
```

---

### Task 7: `GET /copilot/drafts`

**Files:**
- Create: `apps/backend/src/modules/copilot/presentation/dto/copilot-drafts-query.dto.ts`
- Modify: `apps/backend/src/modules/copilot/presentation/dto/copilot-response.dto.ts`
- Modify: `apps/backend/src/modules/copilot/presentation/copilot.controller.ts`
- Modify: `apps/backend/src/modules/copilot/presentation/copilot.controller.spec.ts`
- Modify: `apps/backend/src/modules/copilot/copilot.module.ts`

**Context:** Mirrors `AlertsPaginationDto`/`AlertsController.list()` (`modules/alerts/presentation/dto/alerts-pagination.dto.ts`, `modules/alerts/presentation/alerts.controller.ts:44-49`) — same `page`/`limit` shape, `status` replaces `unreadOnly`.

**Interfaces:**
- Consumes: `ListCopilotDraftsUseCase` (Task 6).
- Produces: `GET /copilot/drafts?page&limit&status` → `{ items: CopilotDraftDto[]; total: number }`.

- [ ] **Step 1: Write the failing test**

Modify `apps/backend/src/modules/copilot/presentation/copilot.controller.spec.ts` — add `listCopilotDraftsUseCase` to `buildController()` and a new `it`:

```typescript
// in buildController(), add:
  const listCopilotDraftsUseCase = { execute: jest.fn() };
// ...and thread it into `new CopilotController(...)` as a new constructor
// argument (see Step 4 for exact position), and into the returned object.

// new test, appended to the describe block:
  it('lists drafts through the query DTO', async () => {
    const deps = buildController();
    deps.listCopilotDraftsUseCase.execute.mockResolvedValue({
      items: [
        {
          id: 'draft-1',
          organizationId: 'org-1',
          userId: 'user-1',
          receivableId: 'receivable-1',
          recipientEmail: 'ap@abc.vn',
          subject: 'Nhắc thanh toán',
          bodyHtml: '<p>...</p>',
          createdAt: new Date('2026-08-14T10:00:00Z'),
          status: 'DRAFTED',
          pendingActionId: null,
        },
      ],
      total: 1,
    });

    await expect(
      deps.controller.listDrafts({ page: 1, limit: 20 }),
    ).resolves.toEqual({
      items: [
        {
          id: 'draft-1',
          receivableId: 'receivable-1',
          recipientEmail: 'ap@abc.vn',
          subject: 'Nhắc thanh toán',
          bodyHtml: '<p>...</p>',
          createdAt: '2026-08-14T10:00:00.000Z',
          status: 'DRAFTED',
          pendingActionId: null,
        },
      ],
      total: 1,
    });
    expect(deps.listCopilotDraftsUseCase.execute).toHaveBeenCalledWith(
      1,
      20,
      undefined,
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern presentation/copilot.controller`
Expected: FAIL — `deps.controller.listDrafts` is not a function

- [ ] **Step 3: Write the query DTO**

```typescript
// apps/backend/src/modules/copilot/presentation/dto/copilot-drafts-query.dto.ts
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { CopilotDraftStatus } from '../../application/derive-draft-status';

const COPILOT_DRAFT_STATUSES: CopilotDraftStatus[] = [
  'DRAFTED',
  'PENDING',
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED',
];

export class CopilotDraftsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsIn(COPILOT_DRAFT_STATUSES)
  status?: CopilotDraftStatus;
}
```

- [ ] **Step 4: Extend the response DTO**

Modify `apps/backend/src/modules/copilot/presentation/dto/copilot-response.dto.ts` — add imports and new exports (leave `CopilotMessageDto`/`CopilotPendingActionDto`/existing functions untouched):

```typescript
import type { CopilotDraftListItem } from '../../application/list-copilot-drafts.usecase';

export interface CopilotDraftDto {
  id: string;
  receivableId: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
  status: CopilotDraftListItem['status'];
  pendingActionId: string | null;
  createdAt: string;
}

export interface CopilotDraftsPageDto {
  items: CopilotDraftDto[];
  total: number;
}

export const toCopilotDraftDto = (
  draft: CopilotDraftListItem,
): CopilotDraftDto => ({
  id: draft.id,
  receivableId: draft.receivableId,
  recipientEmail: draft.recipientEmail,
  subject: draft.subject,
  bodyHtml: draft.bodyHtml,
  status: draft.status,
  pendingActionId: draft.pendingActionId,
  createdAt: draft.createdAt.toISOString(),
});

export const toCopilotDraftsPageResponse = (page: {
  items: CopilotDraftListItem[];
  total: number;
}): CopilotDraftsPageDto => ({
  items: page.items.map(toCopilotDraftDto),
  total: page.total,
});
```

- [ ] **Step 5: Wire the controller endpoint**

Modify `apps/backend/src/modules/copilot/presentation/copilot.controller.ts`:

```typescript
// add to imports
import { Query } from '@nestjs/common'; // add Query to the existing @nestjs/common import list
import { ListCopilotDraftsUseCase } from '../application/list-copilot-drafts.usecase';
import { CopilotDraftsQueryDto } from './dto/copilot-drafts-query.dto';
import {
  // ...existing named imports from './dto/copilot-response.dto'...
  toCopilotDraftsPageResponse,
} from './dto/copilot-response.dto';

// add to constructor params, alongside the existing use cases
    private readonly listCopilotDraftsUseCase: ListCopilotDraftsUseCase,

// add as a new controller method, after usage()
  @Get('drafts')
  @RequirePermission(Permission.RECEIVABLE_READ)
  async listDrafts(@Query() query: CopilotDraftsQueryDto) {
    const page = await this.listCopilotDraftsUseCase.execute(
      query.page,
      query.limit,
      query.status,
    );
    return toCopilotDraftsPageResponse(page);
  }
```

- [ ] **Step 6: Wire the module provider**

Modify `apps/backend/src/modules/copilot/copilot.module.ts` — add `ListCopilotDraftsUseCase` import and to the `providers` array, alongside `GetCopilotUsageUseCase`.

- [ ] **Step 7: Run test to verify it passes**

Run: `npx jest --testPathPattern presentation/copilot.controller`
Expected: PASS (all tests including the new one)

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS, no type errors

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/copilot/presentation apps/backend/src/modules/copilot/copilot.module.ts
git commit -m "feat: add GET /copilot/drafts"
```

---

### Task 8: `ReopenCopilotDraftUseCase`

**Files:**
- Create: `apps/backend/src/modules/copilot/application/reopen-copilot-draft.usecase.ts`
- Test: `apps/backend/src/modules/copilot/application/reopen-copilot-draft.usecase.spec.ts`

**Context:** `ICopilotConversationRepository.findOrCreate(conversationId, userId)` (existing) needs a caller-generated `conversationId` — use `randomUUID()`, exactly like the FE does for a fresh chat session (`apps/frontend/src/features/copilot/api/use-copilot.ts:11`). `ICopilotPendingActionRepository.create(conversationId, payload, manager?)` (existing) creates the new PENDING row.

**Interfaces:**
- Consumes: `ICopilotDraftRepository.findById` (existing), `ICopilotPendingActionRepository.findLatestForDraftIds` (Task 4) + `.create` (existing), `ICopilotConversationRepository.findOrCreate` (existing), `deriveCopilotDraftStatus` (Task 3).
- Produces: `ReopenCopilotDraftUseCase.execute(draftId: string): Promise<{ conversationId: string; pendingAction: CopilotPendingAction }>` — consumed by Task 9's controller.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/copilot/application/reopen-copilot-draft.usecase.spec.ts
import { randomUUID } from 'node:crypto';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { CopilotDraft } from './draft-repository.port';
import type { CopilotPendingAction } from './pending-action-repository.port';
import { ReopenCopilotDraftUseCase } from './reopen-copilot-draft.usecase';

jest.mock('node:crypto', () => ({ randomUUID: jest.fn() }));

function buildDraft(overrides: Partial<CopilotDraft> = {}): CopilotDraft {
  return {
    id: 'draft-1',
    organizationId: 'org-1',
    userId: 'user-1',
    receivableId: 'rec-1',
    recipientEmail: 'ap@abc.vn',
    subject: 'Nhắc thanh toán',
    bodyHtml: '<p>...</p>',
    createdAt: new Date('2026-08-10T00:00:00Z'),
    ...overrides,
  };
}

function buildAction(
  status: CopilotPendingAction['status'],
  createdAt: string,
): CopilotPendingAction {
  return {
    id: 'action-old',
    organizationId: 'org-1',
    conversationId: 'conv-old',
    actionType: 'SEND_REMINDER_EMAIL',
    payload: { draftId: 'draft-1', receivableId: 'rec-1' },
    status,
    createdAt: new Date(createdAt),
    resolvedAt: null,
    resolvedByUserId: null,
  };
}

function buildDeps(overrides: {
  draft?: CopilotDraft | null;
  latestAction?: CopilotPendingAction | null;
}) {
  const draftRepo = {
    findById: jest.fn().mockResolvedValue(
      overrides.draft === undefined ? buildDraft() : overrides.draft,
    ),
  };
  const pendingActionRepo = {
    findLatestForDraftIds: jest.fn().mockResolvedValue(
      overrides.latestAction
        ? new Map([['draft-1', overrides.latestAction]])
        : new Map(),
    ),
    create: jest.fn().mockResolvedValue({
      id: 'new-action-1',
      organizationId: 'org-1',
      conversationId: 'new-conv-1',
      actionType: 'SEND_REMINDER_EMAIL',
      payload: { draftId: 'draft-1', receivableId: 'rec-1' },
      status: 'PENDING',
      createdAt: new Date('2026-08-14T10:00:00Z'),
      resolvedAt: null,
      resolvedByUserId: null,
    }),
  };
  const conversationRepo = {
    findOrCreate: jest.fn().mockResolvedValue({
      id: 'new-conv-1',
      organizationId: 'org-1',
      userId: 'user-1',
      customerId: null,
      createdAt: new Date('2026-08-14T10:00:00Z'),
    }),
  };
  const tenantContext = {
    getCurrentUser: () => ({
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'ACCOUNTANT',
    }),
  } as unknown as TenantContextService;
  return { draftRepo, pendingActionRepo, conversationRepo, tenantContext };
}

describe('ReopenCopilotDraftUseCase', () => {
  beforeEach(() => {
    (randomUUID as jest.Mock).mockReturnValue('new-conv-1');
  });

  it('creates a fresh conversation and pending action for a CANCELLED draft', async () => {
    const deps = buildDeps({ latestAction: buildAction('CANCELLED', '2026-08-14T08:00:00Z') });
    const useCase = new ReopenCopilotDraftUseCase(
      deps.draftRepo as never,
      deps.pendingActionRepo as never,
      deps.conversationRepo as never,
      deps.tenantContext,
    );

    const result = await useCase.execute('draft-1');

    expect(deps.conversationRepo.findOrCreate).toHaveBeenCalledWith(
      'new-conv-1',
      'user-1',
    );
    expect(deps.pendingActionRepo.create).toHaveBeenCalledWith('new-conv-1', {
      draftId: 'draft-1',
      receivableId: 'rec-1',
    });
    expect(result).toEqual({
      conversationId: 'new-conv-1',
      pendingAction: expect.objectContaining({ id: 'new-action-1' }),
    });
  });

  it('allows reopening a draft that has never had a pending action', async () => {
    const deps = buildDeps({ latestAction: null });
    const useCase = new ReopenCopilotDraftUseCase(
      deps.draftRepo as never,
      deps.pendingActionRepo as never,
      deps.conversationRepo as never,
      deps.tenantContext,
    );

    await expect(useCase.execute('draft-1')).resolves.toMatchObject({
      conversationId: 'new-conv-1',
    });
  });

  it('rejects reopening a still-PENDING draft with CONFLICT', async () => {
    const deps = buildDeps({ latestAction: buildAction('PENDING', '2026-08-14T09:58:00Z') });
    const useCase = new ReopenCopilotDraftUseCase(
      deps.draftRepo as never,
      deps.pendingActionRepo as never,
      deps.conversationRepo as never,
      deps.tenantContext,
    );

    await expect(useCase.execute('draft-1')).rejects.toMatchObject({
      errorCode: ErrorCode.CONFLICT,
    });
    expect(deps.pendingActionRepo.create).not.toHaveBeenCalled();
  });

  it('rejects reopening an already-CONFIRMED draft with CONFLICT', async () => {
    const deps = buildDeps({ latestAction: buildAction('CONFIRMED', '2026-08-14T08:00:00Z') });
    const useCase = new ReopenCopilotDraftUseCase(
      deps.draftRepo as never,
      deps.pendingActionRepo as never,
      deps.conversationRepo as never,
      deps.tenantContext,
    );

    await expect(useCase.execute('draft-1')).rejects.toMatchObject({
      errorCode: ErrorCode.CONFLICT,
    });
  });

  it('allows reopening an EXPIRED (derived) draft', async () => {
    const deps = buildDeps({ latestAction: buildAction('PENDING', '2026-08-14T09:00:00Z') });
    const useCase = new ReopenCopilotDraftUseCase(
      deps.draftRepo as never,
      deps.pendingActionRepo as never,
      deps.conversationRepo as never,
      deps.tenantContext,
    );

    await expect(useCase.execute('draft-1')).resolves.toMatchObject({
      conversationId: 'new-conv-1',
    });
  });

  it('throws NOT_FOUND when the draft does not exist', async () => {
    const deps = buildDeps({ draft: null });
    const useCase = new ReopenCopilotDraftUseCase(
      deps.draftRepo as never,
      deps.pendingActionRepo as never,
      deps.conversationRepo as never,
      deps.tenantContext,
    );

    await expect(useCase.execute('draft-1')).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    });
  });

  it('throws NOT_FOUND when the draft belongs to another user', async () => {
    const deps = buildDeps({ draft: buildDraft({ userId: 'someone-else' }) });
    const useCase = new ReopenCopilotDraftUseCase(
      deps.draftRepo as never,
      deps.pendingActionRepo as never,
      deps.conversationRepo as never,
      deps.tenantContext,
    );

    await expect(useCase.execute('draft-1')).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    });
  });
});
```

Note: the 5th test ("EXPIRED derived") reuses a `PENDING` action created at `09:00:00Z` against the `now = new Date('2026-08-14T10:00:00Z')` used by `deriveCopilotDraftStatus` inside the use case (implemented with `new Date()` internally — since the test doesn't mock the clock, this relies on the use case computing `now` at call time; the assertion only needs "more than 10 minutes old" to hold, which `09:00` vs. wall-clock "now" trivially satisfies as long as the test runs after `2026-08-14T09:10:00Z`, i.e. always, since that's in the past relative to any real test run). This mirrors how `ConfirmPendingActionUseCase.isExpired()` is tested today (`confirm-pending-action.usecase.spec.ts`) — no clock injection exists in this codebase for this class of check, so this plan doesn't introduce one either.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern reopen-copilot-draft.usecase`
Expected: FAIL with "Cannot find module './reopen-copilot-draft.usecase'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/copilot/application/reopen-copilot-draft.usecase.ts
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  COPILOT_CONVERSATION_REPOSITORY,
  type ICopilotConversationRepository,
} from './conversation-repository.port';
import { deriveCopilotDraftStatus } from './derive-draft-status';
import {
  COPILOT_DRAFT_REPOSITORY,
  type ICopilotDraftRepository,
} from './draft-repository.port';
import {
  COPILOT_PENDING_ACTION_REPOSITORY,
  type CopilotPendingAction,
  type ICopilotPendingActionRepository,
} from './pending-action-repository.port';

@Injectable()
export class ReopenCopilotDraftUseCase {
  constructor(
    @Inject(COPILOT_DRAFT_REPOSITORY)
    private readonly draftRepo: ICopilotDraftRepository,
    @Inject(COPILOT_PENDING_ACTION_REPOSITORY)
    private readonly pendingActionRepo: ICopilotPendingActionRepository,
    @Inject(COPILOT_CONVERSATION_REPOSITORY)
    private readonly conversationRepo: ICopilotConversationRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    draftId: string,
  ): Promise<{ conversationId: string; pendingAction: CopilotPendingAction }> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }

    const draft = await this.draftRepo.findById(draftId);
    if (!draft || draft.userId !== user.userId) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy bản nháp email.',
      );
    }

    const latestActions = await this.pendingActionRepo.findLatestForDraftIds([
      draftId,
    ]);
    const status = deriveCopilotDraftStatus(
      latestActions.get(draftId) ?? null,
      new Date(),
    );
    if (status === 'PENDING' || status === 'CONFIRMED') {
      throw new AppError(
        ErrorCode.CONFLICT,
        status === 'PENDING'
          ? 'Bản nháp đang có đề xuất gửi email chờ xử lý.'
          : 'Bản nháp email này đã được gửi.',
      );
    }

    const conversation = await this.conversationRepo.findOrCreate(
      randomUUID(),
      user.userId,
    );
    const pendingAction = await this.pendingActionRepo.create(
      conversation.id,
      { draftId: draft.id, receivableId: draft.receivableId },
    );
    return { conversationId: conversation.id, pendingAction };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern reopen-copilot-draft.usecase`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/copilot/application/reopen-copilot-draft.usecase.ts apps/backend/src/modules/copilot/application/reopen-copilot-draft.usecase.spec.ts
git commit -m "feat: add ReopenCopilotDraftUseCase"
```

---

### Task 9: `POST /copilot/drafts/:id/reopen`

**Files:**
- Modify: `apps/backend/src/modules/copilot/presentation/copilot.controller.ts`
- Modify: `apps/backend/src/modules/copilot/presentation/copilot.controller.spec.ts`
- Modify: `apps/backend/src/modules/copilot/copilot.module.ts`

**Interfaces:**
- Consumes: `ReopenCopilotDraftUseCase` (Task 8), `toCopilotPendingActionDto` (existing, `copilot-response.dto.ts`).
- Produces: `POST /copilot/drafts/:id/reopen` → `{ conversationId: string; pendingAction: CopilotPendingActionDto }`.

- [ ] **Step 1: Write the failing test**

Modify `apps/backend/src/modules/copilot/presentation/copilot.controller.spec.ts` — add `reopenCopilotDraftUseCase` to `buildController()` (constructor arg + returned object, alongside `listCopilotDraftsUseCase` from Task 7) and a new `it`:

```typescript
  it('wraps reopen and returns the new conversation and pending action', async () => {
    const deps = buildController();
    deps.reopenCopilotDraftUseCase.execute.mockResolvedValue({
      conversationId: 'new-conv-1',
      pendingAction: {
        id: 'new-action-1',
        organizationId: 'org-1',
        conversationId: 'new-conv-1',
        actionType: 'SEND_REMINDER_EMAIL',
        status: 'PENDING',
        payload: { draftId: 'draft-1', receivableId: 'receivable-1' },
        createdAt: new Date('2026-08-14T10:00:00Z'),
        resolvedAt: null,
        resolvedByUserId: null,
      },
    });

    await expect(
      deps.controller.reopenDraft('draft-1', 'reopen-key'),
    ).resolves.toEqual({
      conversationId: 'new-conv-1',
      pendingAction: {
        id: 'new-action-1',
        actionType: 'SEND_REMINDER_EMAIL',
        status: 'PENDING',
        payload: { draftId: 'draft-1', receivableId: 'receivable-1' },
        createdAt: '2026-08-14T10:00:00.000Z',
        resolvedAt: null,
      },
    });
    expect(deps.reopenCopilotDraftUseCase.execute).toHaveBeenCalledWith(
      'draft-1',
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern presentation/copilot.controller`
Expected: FAIL — `deps.controller.reopenDraft` is not a function

- [ ] **Step 3: Wire the controller endpoint**

Modify `apps/backend/src/modules/copilot/presentation/copilot.controller.ts`:

```typescript
// add to imports
import { ReopenCopilotDraftUseCase } from '../application/reopen-copilot-draft.usecase';

// add to constructor params, alongside listCopilotDraftsUseCase
    private readonly reopenCopilotDraftUseCase: ReopenCopilotDraftUseCase,

// add as a new controller method, after listDrafts()
  @Post('drafts/:id/reopen')
  @RequirePermission(Permission.REMINDER_SEND_MANUAL)
  async reopenDraft(
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.idempotency.execute(
      'POST /copilot/drafts/:id/reopen',
      idempotencyKey,
      { id },
      async () => {
        const result = await this.reopenCopilotDraftUseCase.execute(id);
        return {
          conversationId: result.conversationId,
          pendingAction: toCopilotPendingActionDto(result.pendingAction),
        };
      },
    );
  }
```

Note: this controller now has two `:id`-shaped param routes (`actions/:actionId/confirm` and `drafts/:id/reopen`) plus `conversations/:id/messages` — NestJS resolves these independently by their literal path segments (`actions/`, `drafts/`, `conversations/`), no ordering conflict.

- [ ] **Step 4: Wire the module provider**

Modify `apps/backend/src/modules/copilot/copilot.module.ts` — add `ReopenCopilotDraftUseCase` import and to the `providers` array.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --testPathPattern presentation/copilot.controller`
Expected: PASS (all tests)

- [ ] **Step 6: Type-check and run the full copilot suite**

Run: `npx tsc --noEmit && npx jest --testPathPattern modules/copilot`
Expected: PASS, no type errors

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/copilot/presentation apps/backend/src/modules/copilot/copilot.module.ts
git commit -m "feat: add POST /copilot/drafts/:id/reopen"
```

---

### Task 10: e2e-spec — list and reopen against a real Postgres container

**Files:**
- Create: `apps/backend/test/copilot-drafts.e2e-spec.ts`

**Context:** Mirrors the container/app bootstrap of `apps/backend/test/copilot-chat.integration.spec.ts` (same env vars, same `PostgreSqlContainer`/`GenericContainer` for Redis, same `AppModule`/`configureApp`) and the auth/seed style of `apps/backend/test/alerts.e2e-spec.ts`. This is the real test for Task 4's `findLatestForDraftIds` (Postgres JSON operator) and Task 5's `findAllForUser` — seed rows directly via `dataSource.getRepository(...)` (matching how `copilot-chat.integration.spec.ts` seeds `CustomerOrmEntity`/`ReceivableOrmEntity`), not through the chat flow, so the test doesn't depend on mocking the AI provider.

**Interfaces:**
- Consumes: `AppModule`, `GET /copilot/drafts`, `POST /copilot/drafts/:id/reopen`, `POST /copilot/actions/:id/cancel` (existing).
- Produces: nothing new — this is the final verification checkpoint for Tasks 1–9.

- [ ] **Step 1: Write the e2e spec**

```typescript
// apps/backend/test/copilot-drafts.e2e-spec.ts
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import request from 'supertest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { CopilotDraftOrmEntity } from '../src/modules/copilot/infrastructure/copilot-draft.orm-entity';
import { CopilotPendingActionOrmEntity } from '../src/modules/copilot/infrastructure/copilot-pending-action.orm-entity';
import { Role } from '../src/modules/organizations/domain/membership';
import { MembershipOrmEntity } from '../src/modules/organizations/infrastructure/membership.orm-entity';
import { UserOrmEntity } from '../src/modules/users/infrastructure/user.orm-entity';

describe('Copilot drafts list + reopen (e2e)', () => {
  let postgres: StartedPostgreSqlContainer | undefined;
  let redis: StartedTestContainer | undefined;
  let app: INestApplication | undefined;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let token: string;
  const organizationId = randomUUID();
  const userId = randomUUID();

  beforeAll(async () => {
    [postgres, redis] = await Promise.all([
      new PostgreSqlContainer('postgres:16').start(),
      new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
    ]);
    process.env.DB_HOST = postgres.getHost();
    process.env.DB_PORT = String(postgres.getMappedPort(5432));
    process.env.DB_USERNAME = postgres.getUsername();
    process.env.DB_PASSWORD = postgres.getPassword();
    process.env.DB_DATABASE = postgres.getDatabase();
    process.env.REDIS_HOST = redis.getHost();
    process.env.REDIS_PORT = String(redis.getMappedPort(6379));
    process.env.JWT_SECRET = 'copilot-drafts-e2e-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'copilot-drafts-test-resend-key';
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'copilot-drafts-test-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'copilot-drafts-test-secret';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);

    await dataSource.getRepository(UserOrmEntity).save({
      id: userId,
      email: 'owner@example.com',
      passwordHash: 'hash',
      fullName: 'Owner',
      isEmailVerified: true,
      createdAt: new Date(),
    });
    await dataSource.getRepository(MembershipOrmEntity).save({
      id: randomUUID(),
      userId,
      organizationId,
      role: Role.OWNER,
      createdAt: new Date(),
    });

    token = jwtService.sign(
      { sub: userId, organizationId, role: Role.OWNER },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await postgres?.stop();
    await redis?.stop();
  });

  async function seedDraft(id: string, createdAt: Date) {
    await dataSource.getRepository(CopilotDraftOrmEntity).save({
      id,
      organizationId,
      userId,
      receivableId: randomUUID(),
      recipientEmail: 'ap@abc.vn',
      subject: `Draft ${id}`,
      bodyHtml: '<p>body</p>',
      createdAt,
    });
  }

  async function seedAction(
    draftId: string,
    status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED',
    createdAt: Date,
  ) {
    await dataSource.getRepository(CopilotPendingActionOrmEntity).save({
      id: randomUUID(),
      organizationId,
      conversationId: randomUUID(),
      actionType: 'SEND_REMINDER_EMAIL',
      payload: { draftId, receivableId: randomUUID() },
      status,
      createdAt,
      resolvedAt: status === 'PENDING' ? null : new Date(),
      resolvedByUserId: status === 'PENDING' ? null : userId,
    });
  }

  it('lists drafts with derived status and supports the status filter', async () => {
    const orphanId = randomUUID();
    const cancelledId = randomUUID();
    await seedDraft(orphanId, new Date('2026-08-14T09:00:00Z'));
    await seedDraft(cancelledId, new Date('2026-08-14T08:00:00Z'));
    await seedAction(cancelledId, 'CANCELLED', new Date('2026-08-14T08:01:00Z'));

    const listResponse = await request(app!.getHttpServer())
      .get('/api/v1/copilot/drafts')
      .set('Cookie', [`accessToken=${token}`])
      .expect(200);

    const byId = new Map(
      (listResponse.body.items as Array<{ id: string; status: string }>).map(
        (item) => [item.id, item.status],
      ),
    );
    expect(byId.get(orphanId)).toBe('DRAFTED');
    expect(byId.get(cancelledId)).toBe('CANCELLED');

    const filteredResponse = await request(app!.getHttpServer())
      .get('/api/v1/copilot/drafts')
      .query({ status: 'CANCELLED' })
      .set('Cookie', [`accessToken=${token}`])
      .expect(200);

    expect(
      (filteredResponse.body.items as Array<{ id: string }>).every(
        (item) => item.id !== orphanId,
      ),
    ).toBe(true);
  });

  it('reopens a CANCELLED draft into a new PENDING action, and blocks a PENDING one', async () => {
    const cancelledDraftId = randomUUID();
    await seedDraft(cancelledDraftId, new Date('2026-08-14T07:00:00Z'));
    await seedAction(cancelledDraftId, 'CANCELLED', new Date('2026-08-14T07:01:00Z'));

    const reopenResponse = await request(app!.getHttpServer())
      .post(`/api/v1/copilot/drafts/${cancelledDraftId}/reopen`)
      .set('Cookie', [`accessToken=${token}`])
      .set('Idempotency-Key', randomUUID())
      .expect(201);

    expect(reopenResponse.body.pendingAction.status).toBe('PENDING');
    expect(reopenResponse.body.conversationId).toBeTruthy();

    const pendingDraftId = randomUUID();
    await seedDraft(pendingDraftId, new Date('2026-08-14T06:00:00Z'));
    await seedAction(pendingDraftId, 'PENDING', new Date());

    await request(app!.getHttpServer())
      .post(`/api/v1/copilot/drafts/${pendingDraftId}/reopen`)
      .set('Cookie', [`accessToken=${token}`])
      .set('Idempotency-Key', randomUUID())
      .expect(409);
  });
});
```

Note: if `Cookie`-based auth or the exact cookie name (`accessToken`) doesn't match this codebase's convention, check `apps/backend/test/alerts.e2e-spec.ts` for the exact request-authentication pattern used there (bearer header vs. cookie) and mirror it exactly — this plan's snippet follows the cookie convention seen in `JwtAuthGuard`'s typical NestJS setup, but the authoritative reference is the sibling e2e spec, not this plan.

- [ ] **Step 2: Run it**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- --testPathPattern copilot-drafts`
Expected: PASS (2 tests) — requires Docker running locally

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/copilot-drafts.e2e-spec.ts
git commit -m "test: add e2e coverage for copilot drafts list and reopen"
```

---

### Task 11: FE — `copilot-drafts-api.ts` + types

**Files:**
- Modify: `apps/frontend/src/features/copilot/types.ts`
- Create: `apps/frontend/src/features/copilot/api/copilot-drafts-api.ts`

**Context:** Mirrors `apps/frontend/src/features/alerts/api/alerts-api.ts`'s `fetchAlerts(page, limit, unreadOnly)` shape and `apps/frontend/src/features/copilot/api/copilot-api.ts`'s existing `apiRequest` usage (same file's `confirmCopilotAction`/`cancelCopilotAction` are reused as-is by Task 12 — no changes needed there).

**Interfaces:**
- Produces: `CopilotDraftStatus`, `CopilotDraft` (FE type), `CopilotDraftsPage`; `fetchCopilotDrafts(page, limit, status?): Promise<CopilotDraftsPage>`, `reopenCopilotDraft(id): Promise<{ conversationId: string; pendingAction: CopilotPendingAction }>` — consumed by Task 12.

No test — this file is a thin `apiRequest` wrapper with no branching logic, matching `copilot-api.ts`'s existing untested style (this codebase's FE `*-api.ts` files are exercised through the hooks that call them, e.g. `use-alerts.spec.tsx`-style tests on the hook, done in Task 12).

- [ ] **Step 1: Add the types**

```typescript
// apps/frontend/src/features/copilot/types.ts
// append to the existing file:
export type CopilotDraftStatus =
  | 'DRAFTED'
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface CopilotDraft {
  id: string;
  receivableId: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
  status: CopilotDraftStatus;
  pendingActionId: string | null;
  createdAt: string;
}

export interface CopilotDraftsPage {
  items: CopilotDraft[];
  total: number;
}
```

- [ ] **Step 2: Write the API functions**

```typescript
// apps/frontend/src/features/copilot/api/copilot-drafts-api.ts
import { apiRequest } from '@/lib/api-client';
import type {
  CopilotDraftsPage,
  CopilotDraftStatus,
  CopilotPendingAction,
} from '../types';

export function fetchCopilotDrafts(
  page: number,
  limit: number,
  status?: CopilotDraftStatus,
): Promise<CopilotDraftsPage> {
  return apiRequest<CopilotDraftsPage>({
    url: '/api/v1/copilot/drafts',
    method: 'GET',
    params: { page, limit, ...(status ? { status } : {}) },
  });
}

export function reopenCopilotDraft(
  id: string,
): Promise<{ conversationId: string; pendingAction: CopilotPendingAction }> {
  return apiRequest<{
    conversationId: string;
    pendingAction: CopilotPendingAction;
  }>({
    url: `/api/v1/copilot/drafts/${id}/reopen`,
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p apps/frontend`
Expected: PASS, no type errors

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/copilot/types.ts apps/frontend/src/features/copilot/api/copilot-drafts-api.ts
git commit -m "feat: add copilot drafts API client"
```

---

### Task 12: FE — `useCopilotDrafts` hook + `DraftsList` component

**Files:**
- Create: `apps/frontend/src/features/copilot/api/use-copilot-drafts.ts`
- Create: `apps/frontend/src/features/copilot/api/use-copilot-drafts.spec.tsx`
- Create: `apps/frontend/src/features/copilot/components/drafts-list.tsx`

**Context:** Mirrors `apps/frontend/src/features/alerts/api/use-alerts.ts`'s `useQuery`/`useMutation` split. Confirm reuses the existing `confirmCopilotAction` from `copilot-api.ts` (Task 11 doesn't touch it) — a draft's `pendingActionId` (present only when status is `PENDING`) is what gets passed to it.

**Interfaces:**
- Consumes: `fetchCopilotDrafts`, `reopenCopilotDraft` (Task 11), `confirmCopilotAction` (existing, `copilot-api.ts`).
- Produces: `useCopilotDrafts(page, status?)`, `useReopenCopilotDraft()`, `useConfirmCopilotDraft()` hooks; `<DraftsList />` component — consumed by Task 13.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/features/copilot/api/use-copilot-drafts.spec.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as copilotApi from './copilot-api';
import * as draftsApi from './copilot-drafts-api';
import {
  useCopilotDrafts,
  useReopenCopilotDraft,
} from './use-copilot-drafts';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useCopilotDrafts', () => {
  it('fetches the drafts page for the given page/status', async () => {
    const fetchSpy = vi
      .spyOn(draftsApi, 'fetchCopilotDrafts')
      .mockResolvedValue({ items: [], total: 0 });

    const { result } = renderHook(() => useCopilotDrafts(1, 'CANCELLED'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith(1, 20, 'CANCELLED');
  });
});

describe('useReopenCopilotDraft', () => {
  it('calls reopenCopilotDraft with the draft id', async () => {
    const reopenSpy = vi
      .spyOn(draftsApi, 'reopenCopilotDraft')
      .mockResolvedValue({
        conversationId: 'conv-1',
        pendingAction: {
          id: 'action-1',
          actionType: 'SEND_REMINDER_EMAIL',
          status: 'PENDING',
          payload: { draftId: 'draft-1', receivableId: 'rec-1' },
          createdAt: '2026-08-14T10:00:00.000Z',
          resolvedAt: null,
        },
      });

    const { result } = renderHook(() => useReopenCopilotDraft(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('draft-1');
    });

    expect(reopenSpy).toHaveBeenCalledWith('draft-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/copilot/api/use-copilot-drafts.spec.tsx`
Expected: FAIL with "Cannot find module './use-copilot-drafts'"

- [ ] **Step 3: Write the hook**

```typescript
// apps/frontend/src/features/copilot/api/use-copilot-drafts.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CopilotDraftStatus } from '../types';
import { confirmCopilotAction } from './copilot-api';
import { fetchCopilotDrafts, reopenCopilotDraft } from './copilot-drafts-api';

export function useCopilotDrafts(page = 1, status?: CopilotDraftStatus) {
  return useQuery({
    queryKey: ['copilot-drafts', page, status],
    queryFn: () => fetchCopilotDrafts(page, 20, status),
  });
}

export function useReopenCopilotDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reopenCopilotDraft,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['copilot-drafts'] });
    },
  });
}

export function useConfirmCopilotDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: confirmCopilotAction,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['copilot-drafts'] });
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/copilot/api/use-copilot-drafts.spec.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the `DraftsList` component**

```tsx
// apps/frontend/src/features/copilot/components/drafts-list.tsx
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useConfirmCopilotDraft,
  useCopilotDrafts,
  useReopenCopilotDraft,
} from '../api/use-copilot-drafts';
import type { CopilotDraftStatus } from '../types';

const STATUS_LABEL: Record<CopilotDraftStatus, string> = {
  DRAFTED: 'Chưa gửi đề xuất',
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã gửi',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Đã hết hạn',
};

const REOPENABLE: CopilotDraftStatus[] = ['DRAFTED', 'CANCELLED', 'EXPIRED'];

export function DraftsList({ canSendManual }: { canSendManual: boolean }) {
  const { data, isLoading } = useCopilotDrafts(1);
  const reopen = useReopenCopilotDraft();
  const confirm = useConfirmCopilotDraft();

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Đang tải…</p>;
  }

  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Chưa có bản nháp email nào.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((draft) => (
        <Card key={draft.id}>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">{draft.subject}</CardTitle>
            <Badge variant="secondary">{STATUS_LABEL[draft.status]}</Badge>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">{draft.recipientEmail}</p>
            {canSendManual && (
              <div className="flex gap-2">
                {draft.status === 'PENDING' && draft.pendingActionId && (
                  <Button
                    size="sm"
                    disabled={confirm.isPending}
                    onClick={() => {
                      if (!draft.pendingActionId) return;
                      confirm.mutate(draft.pendingActionId, {
                        onSuccess: () =>
                          toast.success('Đã gửi email nhắc thanh toán.'),
                        onError: () =>
                          toast.error('Không thể gửi email nhắc thanh toán.'),
                      });
                    }}
                  >
                    Confirm
                  </Button>
                )}
                {REOPENABLE.includes(draft.status) && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={reopen.isPending}
                    onClick={() => {
                      reopen.mutate(draft.id, {
                        onError: () =>
                          toast.error('Không thể mở lại bản nháp này.'),
                      });
                    }}
                  >
                    Reopen
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p apps/frontend`
Expected: PASS, no type errors

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/copilot/api/use-copilot-drafts.ts apps/frontend/src/features/copilot/api/use-copilot-drafts.spec.tsx apps/frontend/src/features/copilot/components/drafts-list.tsx
git commit -m "feat: add useCopilotDrafts hook and DraftsList component"
```

---

### Task 13: FE — wire `DraftsList` into the Copilot page via Tabs

**Files:**
- Modify: `apps/frontend/src/features/copilot/pages/copilot-page.tsx`
- Modify: `apps/frontend/src/features/copilot/pages/copilot-page.spec.tsx`

**Context:** `copilot-page.tsx` currently renders the chat UI directly with no tabs. `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` (`@/components/ui/tabs`) are already used elsewhere (`settings-page.tsx`). `canSendManual` is already computed in this file and gets passed to `DraftsList` too.

**Interfaces:**
- Consumes: `<DraftsList canSendManual />` (Task 12).
- Produces: a "Drafts" tab on the Copilot page.

- [ ] **Step 1: Write the failing test**

The existing file mocks `apiRequest` globally via `vi.mock('@/lib/api-client', ...)` and queues responses in call order with `apiRequest.mockResolvedValueOnce(...)` — the first call on mount is always `useCopilotUsage`'s `GET /copilot/usage` (triggered by `<UsageIndicator />`). Radix `Tabs.Content` doesn't mount inactive panels by default, so `DraftsList`'s `GET /copilot/drafts` only fires once the Drafts tab is clicked — add it as the second queued response. Add this test to the existing `describe('CopilotPage', ...)` block in `apps/frontend/src/features/copilot/pages/copilot-page.spec.tsx`:

```tsx
  it('switches to the Drafts tab and lists drafts from the API', async () => {
    apiRequest.mockResolvedValueOnce(USAGE).mockResolvedValueOnce({
      items: [
        {
          id: 'draft-1',
          receivableId: 'rec-1',
          recipientEmail: 'ap@abc.vn',
          subject: 'Nhắc thanh toán ABC Company',
          bodyHtml: '<p>...</p>',
          status: 'CANCELLED',
          pendingActionId: null,
          createdAt: '2026-08-14T08:00:00Z',
        },
      ],
      total: 1,
    });

    renderPage();

    fireEvent.click(screen.getByRole('tab', { name: /drafts/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/nhắc thanh toán abc company/i),
      ).toBeInTheDocument(),
    );
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/v1/copilot/drafts' }),
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/copilot/pages/copilot-page.spec.tsx`
Expected: FAIL — no `tab` role named "Drafts" exists yet

- [ ] **Step 3: Wire the tabs**

```tsx
// apps/frontend/src/features/copilot/pages/copilot-page.tsx
// add import
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DraftsList } from '../components/drafts-list';

// replace the body's outer <div className="flex h-full min-h-0 flex-col p-4 sm:p-6"> ...
// return with a Tabs-wrapped version. The header row (title + UsageIndicator)
// stays outside the tabs; the chat panel + input form move inside a "chat"
// TabsContent, and a new "drafts" TabsContent renders <DraftsList />:
  return (
    <div className="flex h-full min-h-0 flex-col p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold sm:text-2xl">Copilot</h1>
        <UsageIndicator />
      </div>
      <Tabs defaultValue="chat" className="min-h-0 flex-1">
        <TabsList>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="drafts">Drafts</TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-lg border p-4">
            <MessageList messages={messages} />
            {pendingAction && canSendManual && (
              <PendingActionCard
                action={pendingAction}
                busy={busy}
                onConfirm={() => void confirm()}
                onCancel={() => void cancel()}
              />
            )}
          </div>
          <form onSubmit={onSubmit} className="mt-3 flex gap-2">
            <Input
              aria-label="Enter question"
              placeholder="Hỏi về công nợ…"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={isSending || blockedByPendingAction}
            />
            <Button
              type="submit"
              disabled={isSending || blockedByPendingAction || !draft.trim()}
            >
              {isSending ? 'Đang suy nghĩ…' : 'Send'}
            </Button>
          </form>
        </TabsContent>
        <TabsContent value="drafts" className="overflow-y-auto">
          <DraftsList canSendManual={canSendManual} />
        </TabsContent>
      </Tabs>
    </div>
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/copilot/pages/copilot-page.spec.tsx`
Expected: PASS (all tests including the new one)

- [ ] **Step 5: Run the full frontend check**

Run: `npx tsc --noEmit -p apps/frontend && npx vitest run src/features/copilot`
Expected: PASS, no type errors

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/copilot/pages/copilot-page.tsx apps/frontend/src/features/copilot/pages/copilot-page.spec.tsx
git commit -m "feat: add Drafts tab to the Copilot page"
```

---

## Final Verification

After all tasks:

```bash
pnpm --filter @casso-ledger/backend test
pnpm --filter @casso-ledger/backend test:e2e
npx tsc --noEmit
npx biome check --write .
```

Then run the `domain-check` skill (AGENTS.md requirement after any backend change) before opening the PR, per `superpowers:verification-before-completion`.
