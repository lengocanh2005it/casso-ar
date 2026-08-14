# Copilot Draft Edit/Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `PATCH /copilot/drafts/:id` (edit `subject`/`bodyHtml`) and `DELETE /copilot/drafts/:id` (hard delete) let a user manage a Copilot reminder-email draft they own, gated by the same "not currently live" rule as reopen (#136); a "Drafts" tab gets Edit/Delete actions alongside the existing Confirm/Reopen.

**Architecture:** `ReopenCopilotDraftUseCase` (#136) already computes "is this draft safe to mutate right now" — find the draft, check ownership, derive its status, reject `PENDING`/`CONFIRMED` with `CONFLICT`. This plan extracts that exact check into a shared `findMutableDraft()` helper (application layer, plain function — not a use case, since it has no side effect of its own) and refactors Reopen to call it, so `UpdateCopilotDraftUseCase`/`DeleteCopilotDraftUseCase` reuse the identical guard instead of a third copy of the same four lines. `CopilotDraft` gets no new `status`/`deletedAt` column — edit is a normal `save()`, delete is a normal hard `DELETE` row via `BaseRepository.scopedDelete()` (same pattern `EmailTemplate.delete()` already uses in this codebase). Frontend mirrors `EmailTemplatesTab`/`TemplateDialog` (`features/settings/`) exactly: a `Dialog` for edit, an inline `AlertDialog` for delete confirmation.

**Tech Stack:** NestJS 11, TypeORM 1.1 (no migration — no schema change), class-validator, Jest 30, React 19 + TanStack Query (frontend).

**Spec:** GitHub issue #171 (split from #136 during that ticket's `superpowers:grilling` session — #136's own "What's needed" never asked for edit/delete, so this is its own ticket). No separate design doc; the decisions below were reached via a second `superpowers:grilling` session in the conversation that produced this plan and are restated here as the Global Constraints this plan implements.

## Global Constraints

- `PATCH /copilot/drafts/:id` edits only `subject` and `bodyHtml` (both optional, partial update — unset field keeps its current value). `recipientEmail` is never editable through this endpoint.
- Edit and delete are both blocked with `ErrorCode.CONFLICT` when the draft's derived status (`deriveCopilotDraftStatus()`, #136) is `PENDING` (a live pending action still references it) or `CONFIRMED` (the email was already sent — this is now a historical record). Allowed when `DRAFTED`, `CANCELLED`, or `EXPIRED` — the exact same eligibility set `ReopenCopilotDraftUseCase` already uses.
- Ownership check: same as reopen — `draft.userId !== user.userId` (or draft not found) → `ErrorCode.NOT_FOUND`, never `FORBIDDEN` (don't reveal existence of another user's draft).
- Delete is a hard delete (`BaseRepository.scopedDelete()`), no `deletedAt` column — matches `EmailTemplate.delete()`, the closest analog in this codebase. No new migration.
- No `@Audited` on either endpoint — matches every other Copilot endpoint (confirm/cancel/reopen aren't audited either); adding it only here would be an inconsistent one-off within the same module.
- Permissions: both `PATCH /copilot/drafts/:id` and `DELETE /copilot/drafts/:id` → `Permission.REMINDER_SEND_MANUAL` (matches reopen — these are writes on the same manual-reminder draft).
- Every mutating endpoint wraps its handler in `IdempotencyService.execute(endpoint, key, input, callback)` (`.claude/rules/api.md`), exactly like every existing Copilot endpoint.
- `application/` layer code MUST NOT throw `HttpException`/`@nestjs/common` exception classes or import concrete SDKs (AGENTS.md, `.claude/rules/application.md`) — only `AppError`, ports, `TenantContextService`, `@Injectable`/`@Inject`.
- Response DTOs MUST NOT leak `organizationId` or `userId` (AGENTS.md) — reuse the existing `CopilotDraftDto`/`toCopilotDraftDto` from #136 unchanged.
- Domain ↔ ORM translation MUST use the existing explicit `toOrm()`/`toDomain()` mapper in `typeorm-copilot-draft.repository.ts` — never `as`/`as unknown as`.
- Repositories scoped by `organizationId` use `TenantContextService.getOrganizationId()` via `BaseRepository` helpers (`scopedFindOne`/`scopedSaveWithManager`/`scopedDelete`) — no hand-rolled scoping (this was a review finding on #136; stay consistent here).
- TDD RED → GREEN → REFACTOR for every task; Task 2 (refactoring `ReopenCopilotDraftUseCase`) is REFACTOR-only — no new test, its existing spec must stay green unchanged.
- Biome: single quotes, semicolons always, 2-space indent, no trailing commas.

---

### Task 1: Shared `findMutableDraft()` guard

**Files:**
- Create: `apps/backend/src/modules/copilot/application/find-mutable-draft.ts`
- Test: `apps/backend/src/modules/copilot/application/find-mutable-draft.spec.ts`

**Context:** This is a straight extraction of the guard block already inside `ReopenCopilotDraftUseCase.execute()` (`reopen-copilot-draft.usecase.ts:37-58`) — ownership check via `draftRepo.findById`, then `pendingActionRepo.findLatestForDraftIds([draftId])` + `deriveCopilotDraftStatus()` (#136), rejecting `PENDING`/`CONFIRMED`. It's a plain async function (not `@Injectable`) taking the repos as parameters, since it has no DI concerns of its own and three different use cases need to call it.

**Interfaces:**
- Consumes: `ICopilotDraftRepository.findById` (existing), `ICopilotPendingActionRepository.findLatestForDraftIds` (existing, #136), `deriveCopilotDraftStatus` (existing, `derive-draft-status.ts`).
- Produces: `MutableDraft { draft: CopilotDraft; status: CopilotDraftStatus; pendingActionId: string | null }`, `findMutableDraft(draftId: string, userId: string, draftRepo: ICopilotDraftRepository, pendingActionRepo: ICopilotPendingActionRepository): Promise<MutableDraft>` — consumed by Task 2 (Reopen refactor), Task 4 (Update), Task 5 (Delete).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/copilot/application/find-mutable-draft.spec.ts
import { ErrorCode } from '../../../common/errors/error-code';
import type { CopilotDraft } from './draft-repository.port';
import { findMutableDraft } from './find-mutable-draft';
import type { CopilotPendingAction } from './pending-action-repository.port';

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
    id: 'action-1',
    organizationId: 'org-1',
    conversationId: 'conv-1',
    actionType: 'SEND_REMINDER_EMAIL',
    payload: { draftId: 'draft-1', receivableId: 'rec-1' },
    status,
    createdAt: new Date(createdAt),
    resolvedAt: null,
    resolvedByUserId: null,
  };
}

describe('findMutableDraft', () => {
  it('returns the draft, its derived status, and pendingActionId when CANCELLED', async () => {
    const draftRepo = { findById: jest.fn().mockResolvedValue(buildDraft()) };
    const pendingActionRepo = {
      findLatestForDraftIds: jest.fn().mockResolvedValue(
        new Map([['draft-1', buildAction('CANCELLED', '2026-08-14T08:00:00Z')]]),
      ),
    };

    const result = await findMutableDraft(
      'draft-1',
      'user-1',
      draftRepo as never,
      pendingActionRepo as never,
    );

    expect(result.status).toBe('CANCELLED');
    expect(result.pendingActionId).toBe('action-1');
    expect(result.draft.id).toBe('draft-1');
  });

  it('returns DRAFTED with a null pendingActionId when there is no action', async () => {
    const draftRepo = { findById: jest.fn().mockResolvedValue(buildDraft()) };
    const pendingActionRepo = {
      findLatestForDraftIds: jest.fn().mockResolvedValue(new Map()),
    };

    const result = await findMutableDraft(
      'draft-1',
      'user-1',
      draftRepo as never,
      pendingActionRepo as never,
    );

    expect(result.status).toBe('DRAFTED');
    expect(result.pendingActionId).toBeNull();
  });

  it('throws CONFLICT when the draft is PENDING', async () => {
    const draftRepo = { findById: jest.fn().mockResolvedValue(buildDraft()) };
    const pendingActionRepo = {
      findLatestForDraftIds: jest.fn().mockResolvedValue(
        new Map([['draft-1', buildAction('PENDING', '2026-08-14T09:58:00Z')]]),
      ),
    };

    await expect(
      findMutableDraft('draft-1', 'user-1', draftRepo as never, pendingActionRepo as never),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
  });

  it('throws CONFLICT when the draft is CONFIRMED', async () => {
    const draftRepo = { findById: jest.fn().mockResolvedValue(buildDraft()) };
    const pendingActionRepo = {
      findLatestForDraftIds: jest.fn().mockResolvedValue(
        new Map([['draft-1', buildAction('CONFIRMED', '2026-08-14T08:00:00Z')]]),
      ),
    };

    await expect(
      findMutableDraft('draft-1', 'user-1', draftRepo as never, pendingActionRepo as never),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
  });

  it('throws NOT_FOUND when the draft does not exist', async () => {
    const draftRepo = { findById: jest.fn().mockResolvedValue(null) };
    const pendingActionRepo = { findLatestForDraftIds: jest.fn() };

    await expect(
      findMutableDraft('draft-1', 'user-1', draftRepo as never, pendingActionRepo as never),
    ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
    expect(pendingActionRepo.findLatestForDraftIds).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the draft belongs to another user', async () => {
    const draftRepo = {
      findById: jest.fn().mockResolvedValue(buildDraft({ userId: 'someone-else' })),
    };
    const pendingActionRepo = { findLatestForDraftIds: jest.fn() };

    await expect(
      findMutableDraft('draft-1', 'user-1', draftRepo as never, pendingActionRepo as never),
    ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns find-mutable-draft`
Expected: FAIL with "Cannot find module './find-mutable-draft'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/copilot/application/find-mutable-draft.ts
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type CopilotDraftStatus,
  deriveCopilotDraftStatus,
} from './derive-draft-status';
import type {
  CopilotDraft,
  ICopilotDraftRepository,
} from './draft-repository.port';
import type { ICopilotPendingActionRepository } from './pending-action-repository.port';

export interface MutableDraft {
  draft: CopilotDraft;
  status: CopilotDraftStatus;
  pendingActionId: string | null;
}

export async function findMutableDraft(
  draftId: string,
  userId: string,
  draftRepo: ICopilotDraftRepository,
  pendingActionRepo: ICopilotPendingActionRepository,
): Promise<MutableDraft> {
  const draft = await draftRepo.findById(draftId);
  if (!draft || draft.userId !== userId) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy bản nháp email.');
  }

  const latestActions = await pendingActionRepo.findLatestForDraftIds([
    draftId,
  ]);
  const latest = latestActions.get(draftId) ?? null;
  const status = deriveCopilotDraftStatus(latest, new Date());
  if (status === 'PENDING' || status === 'CONFIRMED') {
    throw new AppError(
      ErrorCode.CONFLICT,
      status === 'PENDING'
        ? 'Bản nháp đang có đề xuất gửi email chờ xử lý.'
        : 'Bản nháp email này đã được gửi.',
    );
  }

  return { draft, status, pendingActionId: latest?.id ?? null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPatterns find-mutable-draft`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/copilot/application/find-mutable-draft.ts apps/backend/src/modules/copilot/application/find-mutable-draft.spec.ts
git commit -m "feat: add shared findMutableDraft guard for copilot draft mutations"
```

---

### Task 2: Refactor `ReopenCopilotDraftUseCase` to use `findMutableDraft`

**Files:**
- Modify: `apps/backend/src/modules/copilot/application/reopen-copilot-draft.usecase.ts`

**Context:** REFACTOR-only task — `reopen-copilot-draft.usecase.spec.ts` already exercises this exact guard behavior (its mocks are on `draftRepo.findById`/`pendingActionRepo.findLatestForDraftIds`, the same calls `findMutableDraft` makes), so no new test is written; the existing spec must pass unchanged after this edit.

**Interfaces:**
- Consumes: `findMutableDraft` (Task 1).

- [ ] **Step 1: Replace the inline guard with the shared helper**

```typescript
// apps/backend/src/modules/copilot/application/reopen-copilot-draft.usecase.ts
// Replace the imports of deriveCopilotDraftStatus with findMutableDraft:
import { findMutableDraft } from './find-mutable-draft';
// (remove the now-unused `import { deriveCopilotDraftStatus } from './derive-draft-status';`)

// Replace the body of execute() from the ownership/status check through the
// CONFLICT throw with:
    const { draft } = await findMutableDraft(
      draftId,
      user.userId,
      this.draftRepo,
      this.pendingActionRepo,
    );

// The rest of execute() (the this.dataSource.transaction(...) block) is unchanged.
```

- [ ] **Step 2: Run the existing spec to verify it is still green**

Run: `npx jest --testPathPatterns reopen-copilot-draft.usecase`
Expected: PASS (7 tests, unchanged from #136)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS, no type errors (confirms `deriveCopilotDraftStatus` import removal left no dangling reference)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/copilot/application/reopen-copilot-draft.usecase.ts
git commit -m "refactor: ReopenCopilotDraftUseCase uses the shared findMutableDraft guard"
```

---

### Task 3: `ICopilotDraftRepository.delete()`

**Files:**
- Modify: `apps/backend/src/modules/copilot/application/draft-repository.port.ts`
- Modify: `apps/backend/src/modules/copilot/infrastructure/typeorm-copilot-draft.repository.ts`

**Context:** One-line `BaseRepository.scopedDelete()` wrapper, identical in shape to `TypeOrmEmailTemplateRepository.delete()` (`email-templates/infrastructure/typeorm-email-template.repository.ts:79-83`). Following the precedent set in #136 (Task 4/5 of that plan) for thin `BaseRepository`-wrapper methods with no branching logic: no new unit spec here — Task 8's e2e-spec is this method's test.

**Interfaces:**
- Produces: `ICopilotDraftRepository.delete(id: string): Promise<void>`, `TypeOrmCopilotDraftRepository.delete()` — consumed by Task 5 (`DeleteCopilotDraftUseCase`).

- [ ] **Step 1: Add to the port**

```typescript
// apps/backend/src/modules/copilot/application/draft-repository.port.ts
// add to ICopilotDraftRepository, after findAllForUser:
  delete(id: string): Promise<void>;
```

- [ ] **Step 2: Implement it**

```typescript
// apps/backend/src/modules/copilot/infrastructure/typeorm-copilot-draft.repository.ts
// add as a new method on TypeOrmCopilotDraftRepository, after findAllForUser:
  async delete(id: string): Promise<void> {
    await this.scopedDelete({ id });
  }
```

Note: `scopedDelete`'s parameter type is `FindOptionsWhere<CopilotDraftOrmEntity>`; `{ id }` already matches this shape without a cast (same as `EmailTemplate.delete()`'s usage — check whether that file casts `{ id }` with `as FindOptionsWhere<...>`; if TypeScript accepts `{ id }` directly here without the cast, omit it — the cast there is likely only needed for a wider `where` object in that repository, not this one-field case).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS, no type errors

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/copilot/application/draft-repository.port.ts apps/backend/src/modules/copilot/infrastructure/typeorm-copilot-draft.repository.ts
git commit -m "feat: add delete to copilot draft repository"
```

---

### Task 4: `UpdateCopilotDraftUseCase`

**Files:**
- Create: `apps/backend/src/modules/copilot/application/update-copilot-draft.usecase.ts`
- Test: `apps/backend/src/modules/copilot/application/update-copilot-draft.usecase.spec.ts`

**Interfaces:**
- Consumes: `findMutableDraft` (Task 1), `ICopilotDraftRepository.save` (existing).
- Produces: `UpdateCopilotDraftInput { id: string; subject?: string; bodyHtml?: string }`, `UpdateCopilotDraftUseCase.execute(input: UpdateCopilotDraftInput): Promise<CopilotDraftListItem>` — consumed by Task 6's controller. Reuses `CopilotDraftListItem` from `list-copilot-drafts.usecase.ts` (#136) so the controller can map the result with the existing `toCopilotDraftDto`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/copilot/application/update-copilot-draft.usecase.spec.ts
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { CopilotDraft } from './draft-repository.port';
import type { CopilotPendingAction } from './pending-action-repository.port';
import { UpdateCopilotDraftUseCase } from './update-copilot-draft.usecase';

function buildDraft(overrides: Partial<CopilotDraft> = {}): CopilotDraft {
  return {
    id: 'draft-1',
    organizationId: 'org-1',
    userId: 'user-1',
    receivableId: 'rec-1',
    recipientEmail: 'ap@abc.vn',
    subject: 'Nhắc thanh toán',
    bodyHtml: '<p>cũ</p>',
    createdAt: new Date('2026-08-10T00:00:00Z'),
    ...overrides,
  };
}

function buildDeps(overrides: {
  draft?: CopilotDraft | null;
  latestAction?: CopilotPendingAction | null;
}) {
  const draftRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(
        overrides.draft === undefined ? buildDraft() : overrides.draft,
      ),
    save: jest.fn(),
  };
  const pendingActionRepo = {
    findLatestForDraftIds: jest
      .fn()
      .mockResolvedValue(
        overrides.latestAction
          ? new Map([['draft-1', overrides.latestAction]])
          : new Map(),
      ),
  };
  const tenantContext = {
    getCurrentUser: () => ({
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'ACCOUNTANT',
    }),
  } as unknown as TenantContextService;
  return { draftRepo, pendingActionRepo, tenantContext };
}

describe('UpdateCopilotDraftUseCase', () => {
  it('updates only the provided fields and returns the derived status', async () => {
    const deps = buildDeps({ latestAction: null });
    const useCase = new UpdateCopilotDraftUseCase(
      deps.draftRepo as never,
      deps.pendingActionRepo as never,
      deps.tenantContext,
    );

    const result = await useCase.execute({
      id: 'draft-1',
      subject: 'Tiêu đề mới',
    });

    expect(deps.draftRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'draft-1',
        subject: 'Tiêu đề mới',
        bodyHtml: '<p>cũ</p>',
      }),
    );
    expect(result).toMatchObject({
      id: 'draft-1',
      subject: 'Tiêu đề mới',
      bodyHtml: '<p>cũ</p>',
      status: 'DRAFTED',
      pendingActionId: null,
    });
  });

  it('rejects editing a PENDING draft with CONFLICT', async () => {
    const deps = buildDeps({
      latestAction: {
        id: 'action-1',
        organizationId: 'org-1',
        conversationId: 'conv-1',
        actionType: 'SEND_REMINDER_EMAIL',
        payload: { draftId: 'draft-1', receivableId: 'rec-1' },
        status: 'PENDING',
        createdAt: new Date('2026-08-14T09:58:00Z'),
        resolvedAt: null,
        resolvedByUserId: null,
      },
    });
    const useCase = new UpdateCopilotDraftUseCase(
      deps.draftRepo as never,
      deps.pendingActionRepo as never,
      deps.tenantContext,
    );

    await expect(
      useCase.execute({ id: 'draft-1', subject: 'x' }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
    expect(deps.draftRepo.save).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the draft belongs to another user', async () => {
    const deps = buildDeps({ draft: buildDraft({ userId: 'someone-else' }) });
    const useCase = new UpdateCopilotDraftUseCase(
      deps.draftRepo as never,
      deps.pendingActionRepo as never,
      deps.tenantContext,
    );

    await expect(
      useCase.execute({ id: 'draft-1', subject: 'x' }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns update-copilot-draft.usecase`
Expected: FAIL with "Cannot find module './update-copilot-draft.usecase'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/copilot/application/update-copilot-draft.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  COPILOT_DRAFT_REPOSITORY,
  type ICopilotDraftRepository,
} from './draft-repository.port';
import { findMutableDraft } from './find-mutable-draft';
import type { CopilotDraftListItem } from './list-copilot-drafts.usecase';
import {
  COPILOT_PENDING_ACTION_REPOSITORY,
  type ICopilotPendingActionRepository,
} from './pending-action-repository.port';

export interface UpdateCopilotDraftInput {
  id: string;
  subject?: string;
  bodyHtml?: string;
}

@Injectable()
export class UpdateCopilotDraftUseCase {
  constructor(
    @Inject(COPILOT_DRAFT_REPOSITORY)
    private readonly draftRepo: ICopilotDraftRepository,
    @Inject(COPILOT_PENDING_ACTION_REPOSITORY)
    private readonly pendingActionRepo: ICopilotPendingActionRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: UpdateCopilotDraftInput): Promise<CopilotDraftListItem> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }

    const { draft, status, pendingActionId } = await findMutableDraft(
      input.id,
      user.userId,
      this.draftRepo,
      this.pendingActionRepo,
    );

    const updated = {
      ...draft,
      subject: input.subject ?? draft.subject,
      bodyHtml: input.bodyHtml ?? draft.bodyHtml,
    };
    await this.draftRepo.save(updated);

    return { ...updated, status, pendingActionId };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPatterns update-copilot-draft.usecase`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/copilot/application/update-copilot-draft.usecase.ts apps/backend/src/modules/copilot/application/update-copilot-draft.usecase.spec.ts
git commit -m "feat: add UpdateCopilotDraftUseCase"
```

---

### Task 5: `DeleteCopilotDraftUseCase`

**Files:**
- Create: `apps/backend/src/modules/copilot/application/delete-copilot-draft.usecase.ts`
- Test: `apps/backend/src/modules/copilot/application/delete-copilot-draft.usecase.spec.ts`

**Interfaces:**
- Consumes: `findMutableDraft` (Task 1), `ICopilotDraftRepository.delete` (Task 3).
- Produces: `DeleteCopilotDraftUseCase.execute(id: string): Promise<void>` — consumed by Task 7's controller.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/copilot/application/delete-copilot-draft.usecase.spec.ts
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { CopilotDraft } from './draft-repository.port';
import { DeleteCopilotDraftUseCase } from './delete-copilot-draft.usecase';

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

describe('DeleteCopilotDraftUseCase', () => {
  it('deletes a DRAFTED (orphan) draft', async () => {
    const draftRepo = {
      findById: jest.fn().mockResolvedValue(buildDraft()),
      delete: jest.fn(),
    };
    const pendingActionRepo = {
      findLatestForDraftIds: jest.fn().mockResolvedValue(new Map()),
    };
    const tenantContext = {
      getCurrentUser: () => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'ACCOUNTANT',
      }),
    } as unknown as TenantContextService;
    const useCase = new DeleteCopilotDraftUseCase(
      draftRepo as never,
      pendingActionRepo as never,
      tenantContext,
    );

    await useCase.execute('draft-1');

    expect(draftRepo.delete).toHaveBeenCalledWith('draft-1');
  });

  it('rejects deleting a CONFIRMED draft with CONFLICT and does not delete', async () => {
    const draftRepo = {
      findById: jest.fn().mockResolvedValue(buildDraft()),
      delete: jest.fn(),
    };
    const pendingActionRepo = {
      findLatestForDraftIds: jest.fn().mockResolvedValue(
        new Map([
          [
            'draft-1',
            {
              id: 'action-1',
              organizationId: 'org-1',
              conversationId: 'conv-1',
              actionType: 'SEND_REMINDER_EMAIL' as const,
              payload: { draftId: 'draft-1', receivableId: 'rec-1' },
              status: 'CONFIRMED' as const,
              createdAt: new Date('2026-08-14T08:00:00Z'),
              resolvedAt: new Date('2026-08-14T08:01:00Z'),
              resolvedByUserId: 'user-1',
            },
          ],
        ]),
      ),
    };
    const tenantContext = {
      getCurrentUser: () => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'ACCOUNTANT',
      }),
    } as unknown as TenantContextService;
    const useCase = new DeleteCopilotDraftUseCase(
      draftRepo as never,
      pendingActionRepo as never,
      tenantContext,
    );

    await expect(useCase.execute('draft-1')).rejects.toMatchObject({
      errorCode: ErrorCode.CONFLICT,
    });
    expect(draftRepo.delete).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the draft does not exist', async () => {
    const draftRepo = {
      findById: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
    };
    const pendingActionRepo = { findLatestForDraftIds: jest.fn() };
    const tenantContext = {
      getCurrentUser: () => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'ACCOUNTANT',
      }),
    } as unknown as TenantContextService;
    const useCase = new DeleteCopilotDraftUseCase(
      draftRepo as never,
      pendingActionRepo as never,
      tenantContext,
    );

    await expect(useCase.execute('draft-1')).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns delete-copilot-draft.usecase`
Expected: FAIL with "Cannot find module './delete-copilot-draft.usecase'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/copilot/application/delete-copilot-draft.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  COPILOT_DRAFT_REPOSITORY,
  type ICopilotDraftRepository,
} from './draft-repository.port';
import { findMutableDraft } from './find-mutable-draft';
import {
  COPILOT_PENDING_ACTION_REPOSITORY,
  type ICopilotPendingActionRepository,
} from './pending-action-repository.port';

@Injectable()
export class DeleteCopilotDraftUseCase {
  constructor(
    @Inject(COPILOT_DRAFT_REPOSITORY)
    private readonly draftRepo: ICopilotDraftRepository,
    @Inject(COPILOT_PENDING_ACTION_REPOSITORY)
    private readonly pendingActionRepo: ICopilotPendingActionRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(id: string): Promise<void> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }

    await findMutableDraft(id, user.userId, this.draftRepo, this.pendingActionRepo);
    await this.draftRepo.delete(id);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPatterns delete-copilot-draft.usecase`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/copilot/application/delete-copilot-draft.usecase.ts apps/backend/src/modules/copilot/application/delete-copilot-draft.usecase.spec.ts
git commit -m "feat: add DeleteCopilotDraftUseCase"
```

---

### Task 6: `PATCH /copilot/drafts/:id`

**Files:**
- Create: `apps/backend/src/modules/copilot/presentation/dto/update-copilot-draft.dto.ts`
- Modify: `apps/backend/src/modules/copilot/presentation/copilot.controller.ts`
- Modify: `apps/backend/src/modules/copilot/presentation/copilot.controller.spec.ts`
- Modify: `apps/backend/src/modules/copilot/copilot.module.ts`

**Context:** Mirrors `UpdateEmailTemplateDto` (`email-templates/presentation/dto/update-email-template.dto.ts`) exactly, minus the `@IsAllowedEmailTemplateVariables()` validator — that validator checks for the `{{variable}}` merge-field syntax email templates use; Copilot drafts are already fully rendered per-draft content with no merge fields, so it doesn't apply here.

**Interfaces:**
- Consumes: `UpdateCopilotDraftUseCase` (Task 4), `toCopilotDraftDto` (existing, `copilot-response.dto.ts`, #136).
- Produces: `PATCH /copilot/drafts/:id` → `CopilotDraftDto`.

- [ ] **Step 1: Write the failing test**

Modify `apps/backend/src/modules/copilot/presentation/copilot.controller.spec.ts` — add `updateCopilotDraftUseCase` to `buildController()` (new constructor arg, positioned after `reopenCopilotDraftUseCase` and before `idempotency`, and in the returned object) and a new `it`:

```typescript
  it('wraps update and returns the updated draft', async () => {
    const deps = buildController();
    deps.updateCopilotDraftUseCase.execute.mockResolvedValue({
      id: 'draft-1',
      organizationId: 'org-1',
      userId: 'user-1',
      receivableId: 'receivable-1',
      recipientEmail: 'ap@abc.vn',
      subject: 'Tiêu đề mới',
      bodyHtml: '<p>mới</p>',
      createdAt: new Date('2026-08-14T10:00:00Z'),
      status: 'DRAFTED',
      pendingActionId: null,
    });

    await expect(
      deps.controller.updateDraft(
        'draft-1',
        { subject: 'Tiêu đề mới', bodyHtml: '<p>mới</p>' },
        'update-key',
      ),
    ).resolves.toEqual({
      id: 'draft-1',
      receivableId: 'receivable-1',
      recipientEmail: 'ap@abc.vn',
      subject: 'Tiêu đề mới',
      bodyHtml: '<p>mới</p>',
      status: 'DRAFTED',
      pendingActionId: null,
      createdAt: '2026-08-14T10:00:00.000Z',
    });
    expect(deps.updateCopilotDraftUseCase.execute).toHaveBeenCalledWith({
      id: 'draft-1',
      subject: 'Tiêu đề mới',
      bodyHtml: '<p>mới</p>',
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns presentation/copilot.controller`
Expected: FAIL — `deps.controller.updateDraft` is not a function

- [ ] **Step 3: Write the DTO**

```typescript
// apps/backend/src/modules/copilot/presentation/dto/update-copilot-draft.dto.ts
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateCopilotDraftDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  subject?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  bodyHtml?: string;
}
```

- [ ] **Step 4: Wire the controller endpoint**

Modify `apps/backend/src/modules/copilot/presentation/copilot.controller.ts`:

```typescript
// add Patch to the existing @nestjs/common import list
import { Patch } from '@nestjs/common'; // merge into the existing multi-import

// add to imports
import { UpdateCopilotDraftUseCase } from '../application/update-copilot-draft.usecase';
import { UpdateCopilotDraftDto } from './dto/update-copilot-draft.dto';
import { toCopilotDraftDto } from './dto/copilot-response.dto'; // add alongside the existing named imports from this path

// add to constructor params, after reopenCopilotDraftUseCase
    private readonly updateCopilotDraftUseCase: UpdateCopilotDraftUseCase,

// add as a new controller method, after reopenDraft()
  @Patch('drafts/:id')
  @RequirePermission(Permission.REMINDER_SEND_MANUAL)
  async updateDraft(
    @Param('id') id: string,
    @Body() dto: UpdateCopilotDraftDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.idempotency.execute(
      'PATCH /copilot/drafts/:id',
      idempotencyKey,
      { id, ...dto },
      async () =>
        toCopilotDraftDto(
          await this.updateCopilotDraftUseCase.execute({
            id,
            subject: dto.subject,
            bodyHtml: dto.bodyHtml,
          }),
        ),
    );
  }
```

- [ ] **Step 5: Wire the module provider**

Modify `apps/backend/src/modules/copilot/copilot.module.ts` — add `UpdateCopilotDraftUseCase` import and to the `providers` array, alongside `ReopenCopilotDraftUseCase`.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest --testPathPatterns presentation/copilot.controller`
Expected: PASS (all tests)

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS, no type errors

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/copilot/presentation apps/backend/src/modules/copilot/copilot.module.ts
git commit -m "feat: add PATCH /copilot/drafts/:id"
```

---

### Task 7: `DELETE /copilot/drafts/:id`

**Files:**
- Modify: `apps/backend/src/modules/copilot/presentation/copilot.controller.ts`
- Modify: `apps/backend/src/modules/copilot/presentation/copilot.controller.spec.ts`
- Modify: `apps/backend/src/modules/copilot/copilot.module.ts`

**Interfaces:**
- Consumes: `DeleteCopilotDraftUseCase` (Task 5).
- Produces: `DELETE /copilot/drafts/:id` → `{ success: true }` (matches `EmailTemplatesController.remove()`'s response shape).

- [ ] **Step 1: Write the failing test**

Modify `apps/backend/src/modules/copilot/presentation/copilot.controller.spec.ts` — add `deleteCopilotDraftUseCase` to `buildController()` (constructor arg after `updateCopilotDraftUseCase`, before `idempotency`; and in the returned object) and a new `it`:

```typescript
  it('wraps delete and returns success', async () => {
    const deps = buildController();
    deps.deleteCopilotDraftUseCase.execute.mockResolvedValue(undefined);

    await expect(
      deps.controller.deleteDraft('draft-1', 'delete-key'),
    ).resolves.toEqual({ success: true });
    expect(deps.deleteCopilotDraftUseCase.execute).toHaveBeenCalledWith(
      'draft-1',
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPatterns presentation/copilot.controller`
Expected: FAIL — `deps.controller.deleteDraft` is not a function

- [ ] **Step 3: Wire the controller endpoint**

Modify `apps/backend/src/modules/copilot/presentation/copilot.controller.ts`:

```typescript
// add Delete to the existing @nestjs/common import list (merge into the
// multi-import alongside Patch from Task 6)

// add to imports
import { DeleteCopilotDraftUseCase } from '../application/delete-copilot-draft.usecase';

// add to constructor params, after updateCopilotDraftUseCase
    private readonly deleteCopilotDraftUseCase: DeleteCopilotDraftUseCase,

// add as a new controller method, after updateDraft()
  @Delete('drafts/:id')
  @RequirePermission(Permission.REMINDER_SEND_MANUAL)
  async deleteDraft(
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.idempotency.execute(
      'DELETE /copilot/drafts/:id',
      idempotencyKey,
      { id },
      async () => {
        await this.deleteCopilotDraftUseCase.execute(id);
        return { success: true };
      },
    );
  }
```

- [ ] **Step 4: Wire the module provider**

Modify `apps/backend/src/modules/copilot/copilot.module.ts` — add `DeleteCopilotDraftUseCase` to the `providers` array.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --testPathPatterns presentation/copilot.controller`
Expected: PASS (all tests)

- [ ] **Step 6: Type-check and run the full copilot unit suite**

Run: `npx tsc --noEmit && npx jest --testPathPatterns modules/copilot`
Expected: PASS, no type errors

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/copilot/presentation apps/backend/src/modules/copilot/copilot.module.ts
git commit -m "feat: add DELETE /copilot/drafts/:id"
```

---

### Task 8: e2e coverage — edit and delete against a real Postgres container

**Files:**
- Modify: `apps/backend/test/copilot-drafts.e2e-spec.ts`

**Context:** Extends the existing spec (bootstrap/seed helpers `seedDraft`/`seedAction`, `token`, `organizationId`, `userId` are already set up by #136) rather than a new file — no new container bootstrap needed. This is the real test for Task 3's `delete()` (confirms the row is actually gone from Postgres, not just that the mock was called).

**Interfaces:**
- Consumes: `PATCH /copilot/drafts/:id`, `DELETE /copilot/drafts/:id`.
- Produces: nothing new — final verification checkpoint for Tasks 1–7.

- [ ] **Step 1: Add the tests**

Append to the `describe('Copilot drafts list + reopen (e2e)', ...)` block in `apps/backend/test/copilot-drafts.e2e-spec.ts` (after the existing `it('reopens a CANCELLED draft...')` test, still inside the same `describe`):

```typescript
  it('edits a DRAFTED draft, and blocks editing a PENDING one', async () => {
    const draftId = randomUUID();
    await seedDraft(draftId, new Date('2026-08-14T05:00:00Z'));

    const updateResponse = await request(app?.getHttpServer())
      .patch(`/api/v1/copilot/drafts/${draftId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ subject: 'Tiêu đề đã sửa' })
      .expect(200);

    expect(updateResponse.body.subject).toBe('Tiêu đề đã sửa');
    expect(updateResponse.body.bodyHtml).toBe('<p>body</p>');

    const pendingDraftId = randomUUID();
    await seedDraft(pendingDraftId, new Date('2026-08-14T04:00:00Z'));
    await seedAction(pendingDraftId, 'PENDING', new Date());

    await request(app?.getHttpServer())
      .patch(`/api/v1/copilot/drafts/${pendingDraftId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ subject: 'x' })
      .expect(409);
  });

  it('deletes a CANCELLED draft, and blocks deleting a CONFIRMED one', async () => {
    const cancelledDraftId = randomUUID();
    await seedDraft(cancelledDraftId, new Date('2026-08-14T03:00:00Z'));
    await seedAction(
      cancelledDraftId,
      'CANCELLED',
      new Date('2026-08-14T03:01:00Z'),
    );

    await request(app?.getHttpServer())
      .delete(`/api/v1/copilot/drafts/${cancelledDraftId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .expect(200);

    const remaining = await dataSource
      .getRepository(CopilotDraftOrmEntity)
      .findOne({ where: { id: cancelledDraftId } });
    expect(remaining).toBeNull();

    const confirmedDraftId = randomUUID();
    await seedDraft(confirmedDraftId, new Date('2026-08-14T02:00:00Z'));
    await seedAction(
      confirmedDraftId,
      'CONFIRMED',
      new Date('2026-08-14T02:01:00Z'),
    );

    await request(app?.getHttpServer())
      .delete(`/api/v1/copilot/drafts/${confirmedDraftId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .expect(409);
  });
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- --testPathPatterns copilot-drafts`
Expected: PASS (4 tests) — requires Docker running locally

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/copilot-drafts.e2e-spec.ts
git commit -m "test: add e2e coverage for copilot draft edit and delete"
```

---

### Task 9: FE — `copilot-drafts-api.ts` additions

**Files:**
- Modify: `apps/frontend/src/features/copilot/api/copilot-drafts-api.ts`

**Context:** Same file #136 added `fetchCopilotDrafts`/`reopenCopilotDraft` to — two more thin `apiRequest` wrappers, no branching logic, no new test (matches #136's precedent for this file).

**Interfaces:**
- Produces: `updateCopilotDraft(id: string, input: { subject?: string; bodyHtml?: string }): Promise<CopilotDraft>`, `deleteCopilotDraft(id: string): Promise<{ success: boolean }>` — consumed by Task 10.

- [ ] **Step 1: Add the functions**

```typescript
// apps/frontend/src/features/copilot/api/copilot-drafts-api.ts
// add to the existing file, after reopenCopilotDraft:
export function updateCopilotDraft(
  id: string,
  input: { subject?: string; bodyHtml?: string },
): Promise<CopilotDraft> {
  return apiRequest<CopilotDraft>({
    url: `/api/v1/copilot/drafts/${id}`,
    method: 'PATCH',
    data: input,
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export function deleteCopilotDraft(id: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    url: `/api/v1/copilot/drafts/${id}`,
    method: 'DELETE',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}
```

`CopilotDraft` is already imported in this file's existing import line from `'../types'` — add it to that same named-import list (alongside `CopilotDraftStatus`, `CopilotDraftsPage`, `CopilotPendingAction`).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p apps/frontend`
Expected: PASS, no type errors

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/copilot/api/copilot-drafts-api.ts
git commit -m "feat: add update/delete to copilot drafts API client"
```

---

### Task 10: FE — `useUpdateCopilotDraft`/`useDeleteCopilotDraft` hooks

**Files:**
- Modify: `apps/frontend/src/features/copilot/api/use-copilot-drafts.ts`
- Modify: `apps/frontend/src/features/copilot/api/use-copilot-drafts.spec.tsx`

**Interfaces:**
- Consumes: `updateCopilotDraft`, `deleteCopilotDraft` (Task 9).
- Produces: `useUpdateCopilotDraft()`, `useDeleteCopilotDraft()` — consumed by Task 11.

- [ ] **Step 1: Write the failing tests**

Add to `apps/frontend/src/features/copilot/api/use-copilot-drafts.spec.tsx` (extend the existing imports and add two new `describe` blocks, mirroring the existing `useReopenCopilotDraft` test):

```tsx
// extend the existing import from './use-copilot-drafts':
import {
  useCopilotDrafts,
  useDeleteCopilotDraft,
  useReopenCopilotDraft,
  useUpdateCopilotDraft,
} from './use-copilot-drafts';

// append these describe blocks after the existing useReopenCopilotDraft block:
describe('useUpdateCopilotDraft', () => {
  it('calls updateCopilotDraft with the draft id and input', async () => {
    const updateSpy = vi.spyOn(draftsApi, 'updateCopilotDraft').mockResolvedValue({
      id: 'draft-1',
      receivableId: 'rec-1',
      recipientEmail: 'ap@abc.vn',
      subject: 'Tiêu đề mới',
      bodyHtml: '<p>mới</p>',
      status: 'DRAFTED',
      pendingActionId: null,
      createdAt: '2026-08-14T10:00:00.000Z',
    });

    const { result } = renderHook(() => useUpdateCopilotDraft(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'draft-1',
        input: { subject: 'Tiêu đề mới' },
      });
    });

    expect(updateSpy).toHaveBeenCalledWith('draft-1', { subject: 'Tiêu đề mới' });
  });
});

describe('useDeleteCopilotDraft', () => {
  it('calls deleteCopilotDraft with the draft id', async () => {
    const deleteSpy = vi
      .spyOn(draftsApi, 'deleteCopilotDraft')
      .mockResolvedValue({ success: true });

    const { result } = renderHook(() => useDeleteCopilotDraft(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('draft-1');
    });

    expect(deleteSpy).toHaveBeenCalledWith('draft-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/copilot/api/use-copilot-drafts.spec.tsx`
Expected: FAIL — `useUpdateCopilotDraft`/`useDeleteCopilotDraft` are not exported

- [ ] **Step 3: Write the hooks**

```typescript
// apps/frontend/src/features/copilot/api/use-copilot-drafts.ts
// add to the existing file, after useConfirmCopilotDraft; update the
// import line from './copilot-drafts-api' to also bring in
// updateCopilotDraft and deleteCopilotDraft:
export function useUpdateCopilotDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { subject?: string; bodyHtml?: string };
    }) => updateCopilotDraft(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['copilot-drafts'] });
    },
  });
}

export function useDeleteCopilotDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCopilotDraft,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['copilot-drafts'] });
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/copilot/api/use-copilot-drafts.spec.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/copilot/api/use-copilot-drafts.ts apps/frontend/src/features/copilot/api/use-copilot-drafts.spec.tsx
git commit -m "feat: add useUpdateCopilotDraft and useDeleteCopilotDraft hooks"
```

---

### Task 11: FE — `DraftEditDialog` component

**Files:**
- Create: `apps/frontend/src/features/copilot/components/draft-edit-dialog.tsx`

**Context:** Mirrors `TemplateDialog` (`features/settings/components/template-dialog.tsx`) minus the `name` field (drafts have no name, unlike named email templates) and minus the create branch (drafts are only ever created by the Copilot chat tool, never by this dialog — it's edit-only).

**Interfaces:**
- Consumes: `useUpdateCopilotDraft` (Task 10).
- Produces: `<DraftEditDialog draft={...} open={...} onOpenChange={...} />` — consumed by Task 12.

No test — this is a thin form component with no logic beyond the existing, already-tested `useUpdateCopilotDraft` mutation; `copilot-page.spec.tsx` (Task 12) exercises it through the page.

- [ ] **Step 1: Write the component**

```tsx
// apps/frontend/src/features/copilot/components/draft-edit-dialog.tsx
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateCopilotDraft } from '../api/use-copilot-drafts';
import type { CopilotDraft } from '../types';

export function DraftEditDialog({
  draft,
  open,
  onOpenChange,
}: {
  draft: CopilotDraft | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const update = useUpdateCopilotDraft();

  useEffect(() => {
    if (!open) return;
    setSubject(draft?.subject ?? '');
    setBodyHtml(draft?.bodyHtml ?? '');
  }, [open, draft]);

  function submit() {
    if (!draft) return;
    if (!subject.trim() || !bodyHtml.trim()) {
      toast.error('Vui lòng nhập đầy đủ tiêu đề và nội dung.');
      return;
    }
    update.mutate(
      { id: draft.id, input: { subject, bodyHtml } },
      {
        onSuccess: () => {
          toast.success('Đã cập nhật bản nháp.');
          onOpenChange(false);
        },
        onError: () => toast.error('Không thể cập nhật bản nháp.'),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sửa bản nháp email</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Label className="space-y-1">
            <span>Tiêu đề</span>
            <Input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </Label>
          <Label className="space-y-1">
            <span>Nội dung HTML</span>
            <Textarea
              rows={8}
              value={bodyHtml}
              onChange={(event) => setBodyHtml(event.target.value)}
            />
          </Label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button disabled={update.isPending} onClick={submit}>
            {update.isPending ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p apps/frontend`
Expected: PASS, no type errors

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/copilot/components/draft-edit-dialog.tsx
git commit -m "feat: add DraftEditDialog component"
```

---

### Task 12: FE — wire Edit/Delete into `DraftsList`

**Files:**
- Modify: `apps/frontend/src/features/copilot/components/drafts-list.tsx`
- Modify: `apps/frontend/src/features/copilot/pages/copilot-page.spec.tsx`

**Context:** Mirrors `EmailTemplatesTab`'s per-row Edit button (opens `DraftEditDialog` via `editing` state) + inline `AlertDialog` for delete, exactly. `REOPENABLE` in `drafts-list.tsx` is renamed `MUTABLE_STATUSES` since Global Constraints established edit/delete/reopen all share the identical eligibility set (`DRAFTED`/`CANCELLED`/`EXPIRED`) — one constant now backs all three buttons' visibility instead of three separate copies of the same array.

**Interfaces:**
- Consumes: `useDeleteCopilotDraft` (Task 10), `DraftEditDialog` (Task 11).

- [ ] **Step 1: Write the failing test**

Add to `apps/frontend/src/features/copilot/pages/copilot-page.spec.tsx` (append to the existing `describe('CopilotPage', ...)` block, after the "switches to the Drafts tab" test from #136). This follows the same `apiRequest.mockResolvedValueOnce(...)` queueing pattern as that test — mount fetches usage, opening the Drafts tab fetches the list, then the Edit action's save fetches the PATCH response, then the query invalidation re-fetches the list:

```tsx
  it('edits a draft from the Drafts tab', async () => {
    apiRequest
      .mockResolvedValueOnce(USAGE)
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({
        id: 'draft-1',
        receivableId: 'rec-1',
        recipientEmail: 'ap@abc.vn',
        subject: 'Tiêu đề đã sửa',
        bodyHtml: '<p>...</p>',
        status: 'CANCELLED',
        pendingActionId: null,
        createdAt: '2026-08-14T08:00:00Z',
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'draft-1',
            receivableId: 'rec-1',
            recipientEmail: 'ap@abc.vn',
            subject: 'Tiêu đề đã sửa',
            bodyHtml: '<p>...</p>',
            status: 'CANCELLED',
            pendingActionId: null,
            createdAt: '2026-08-14T08:00:00Z',
          },
        ],
        total: 1,
      });

    renderPage();

    fireEvent.mouseDown(screen.getByRole('tab', { name: /drafts/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/nhắc thanh toán abc company/i),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /sửa|edit/i }));
    const subjectInput = await screen.findByLabelText(/tiêu đề/i);
    fireEvent.change(subjectInput, {
      target: { value: 'Tiêu đề đã sửa' },
    });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/copilot/drafts/draft-1',
          method: 'PATCH',
        }),
      ),
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/copilot/pages/copilot-page.spec.tsx`
Expected: FAIL — no "Sửa"/edit button exists yet on the draft card

- [ ] **Step 3: Update `DraftsList`**

```tsx
// apps/frontend/src/features/copilot/components/drafts-list.tsx
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useConfirmCopilotDraft,
  useCopilotDrafts,
  useDeleteCopilotDraft,
  useReopenCopilotDraft,
} from '../api/use-copilot-drafts';
import type { CopilotDraft, CopilotDraftStatus } from '../types';
import { DraftEditDialog } from './draft-edit-dialog';

const STATUS_LABEL: Record<CopilotDraftStatus, string> = {
  DRAFTED: 'Chưa gửi đề xuất',
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã gửi',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Đã hết hạn',
};

// Reopen, edit, and delete share the same eligibility rule (#171):
// a draft is mutable only when it has no live/sent pending action.
const MUTABLE_STATUSES: CopilotDraftStatus[] = [
  'DRAFTED',
  'CANCELLED',
  'EXPIRED',
];

export function DraftsList({ canSendManual }: { canSendManual: boolean }) {
  const { data, isLoading } = useCopilotDrafts(1);
  const reopen = useReopenCopilotDraft();
  const confirm = useConfirmCopilotDraft();
  const deleteDraft = useDeleteCopilotDraft();
  const [editingDraft, setEditingDraft] = useState<CopilotDraft | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

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
                {MUTABLE_STATUSES.includes(draft.status) && (
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
                {MUTABLE_STATUSES.includes(draft.status) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingDraft(draft);
                      setEditDialogOpen(true);
                    }}
                  >
                    Sửa
                  </Button>
                )}
                {MUTABLE_STATUSES.includes(draft.status) && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive">
                        Xóa
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Xóa bản nháp?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Thao tác này không thể hoàn tác.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Hủy</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            deleteDraft.mutate(draft.id, {
                              onSuccess: () =>
                                toast.success('Đã xóa bản nháp.'),
                              onError: () =>
                                toast.error('Không thể xóa bản nháp.'),
                            });
                          }}
                        >
                          Xác nhận
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      <DraftEditDialog
        draft={editingDraft}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/copilot/pages/copilot-page.spec.tsx`
Expected: PASS (all tests including the new one). If the button-name regex `/sửa|edit/i` doesn't match due to how Testing Library resolves accessible names for a plain-text `Button`, adjust the test's `getByRole('button', { name: ... })` to match "Sửa" literally (the button's actual rendered text) — the regex is a safety net, not the source of truth.

- [ ] **Step 5: Run the full frontend check**

Run: `npx tsc --noEmit -p apps/frontend && npx vitest run src/features/copilot`
Expected: PASS, no type errors

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/copilot/components/drafts-list.tsx apps/frontend/src/features/copilot/pages/copilot-page.spec.tsx
git commit -m "feat: wire edit/delete actions into the Copilot drafts list"
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
