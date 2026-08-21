# Copilot HTML Email Draft (Preview/Code Toggle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Copilot's fixed-template reminder-email HTML with LLM-authored `subject`/`bodyHtml`, sanitize it on every write path, and render it in the chat and Drafts tab as a card with a Preview (sandboxed) / HTML-code (escaped, copyable) toggle — without touching the manual-send confirmation flow.

**Architecture:** Backend: `draftReminderEmail` tool schema gains `subject`/`bodyHtml` as model-supplied arguments; the tool stops composing text and instead validates length, re-derives `recipientEmail` from the customer record (never from the model), sanitizes `bodyHtml` via a new shared `sanitizeEmailHtml()`, and persists. `CopilotChatUseCase` threads each successful `draftReminderEmail` result through to whichever assistant message ends the turn, as `output` on that message's `toolCalls`. `CopilotMessageDto` surfaces those as a narrow `drafts` array (not raw `toolCalls`). Frontend: a new shared `EmailDraftPreview` component (sandboxed `<iframe>` for Preview, escaped `<pre>` for HTML-code, copy button) renders under chat messages and inside the Drafts tab.

**Tech Stack:** NestJS 11 / TypeORM (backend), React 19 + Vite + vitest + Testing Library (frontend), `sanitize-html` (new backend dependency).

**Spec:** `docs/superpowers/specs/2026-08-21-copilot-html-email-draft-design.md`

## Global Constraints

- Money stays integer VND — untouched by this feature (no money fields involved).
- Every write inside a DB transaction where one already wraps the call (unchanged — no new transactional writes are introduced beyond the existing ones).
- Tenant isolation: `DraftReminderEmailTool` keeps its existing `organizationId` checks on `receivable`/`customer`; nothing in this plan removes them.
- `recipientEmail` is always tool-derived from `customer.email` — never accepted as model/tool-call input.
- `subject` maxLength 200, `bodyHtml` maxLength 20000 (enforced in code, not just schema hints).
- No email is ever auto-sent by this change — `sendReminderEmail`/`PendingActionCard`/manual confirm flow is untouched.
- `import type` for pure types; value import for classes used in DI/constructor params (existing repo convention).
- Response DTOs must not leak internal fields — `CopilotMessageDto.drafts` exposes only draft data, never raw `toolCalls` input/output of other tools.
- TDD: RED → GREEN → REFACTOR for every behavior change in this plan.

---

## File Structure

**Backend — create:**
- `apps/backend/src/modules/copilot/application/sanitize-email-html.ts`
- `apps/backend/src/modules/copilot/application/sanitize-email-html.spec.ts`

**Backend — modify:**
- `apps/backend/package.json` (add `sanitize-html`, `@types/sanitize-html`)
- `apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.ts`
- `apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.spec.ts`
- `apps/backend/src/modules/copilot/copilot.module.ts`
- `apps/backend/src/modules/copilot/application/update-copilot-draft.usecase.ts`
- `apps/backend/src/modules/copilot/application/update-copilot-draft.usecase.spec.ts`
- `apps/backend/src/modules/copilot/application/conversation-repository.port.ts`
- `apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts`
- `apps/backend/src/modules/copilot/application/copilot-chat.usecase.spec.ts`
- `apps/backend/src/modules/copilot/presentation/dto/copilot-response.dto.ts`
- `apps/backend/test/copilot-drafts.e2e-spec.ts`

**Frontend — create:**
- `apps/frontend/src/features/copilot/components/email-draft-preview.tsx`
- `apps/frontend/src/features/copilot/components/email-draft-preview.spec.tsx`

**Frontend — modify:**
- `apps/frontend/src/features/copilot/types.ts`
- `apps/frontend/src/features/copilot/components/message-list.tsx`
- `apps/frontend/src/features/copilot/components/drafts-list.tsx`

---

## Task 1: `sanitizeEmailHtml` shared sanitizer

**Files:**
- Create: `apps/backend/src/modules/copilot/application/sanitize-email-html.ts`
- Test: `apps/backend/src/modules/copilot/application/sanitize-email-html.spec.ts`
- Modify: `apps/backend/package.json`

**Interfaces:**
- Produces: `sanitizeEmailHtml(html: string): string` — used by Task 2 (`DraftReminderEmailTool`) and Task 4 (`UpdateCopilotDraftUseCase`).

- [ ] **Step 1: Add the `sanitize-html` dependency**

```bash
cd apps/backend && pnpm add sanitize-html && pnpm add -D @types/sanitize-html
```

- [ ] **Step 2: Write the failing test**

Create `apps/backend/src/modules/copilot/application/sanitize-email-html.spec.ts`:

```ts
import { sanitizeEmailHtml } from './sanitize-email-html';

describe('sanitizeEmailHtml', () => {
  it('strips script tags entirely', () => {
    const result = sanitizeEmailHtml(
      '<p>Hello</p><script>alert(1)</script>',
    );
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert(1)');
    expect(result).toContain('<p>Hello</p>');
  });

  it('strips event-handler attributes', () => {
    const result = sanitizeEmailHtml('<img src="x" onerror="alert(1)">');
    expect(result).not.toContain('onerror');
  });

  it('strips javascript: URLs from links', () => {
    const result = sanitizeEmailHtml(
      '<a href="javascript:alert(1)">click</a>',
    );
    expect(result).not.toContain('javascript:');
  });

  it('keeps http(s) and mailto links intact', () => {
    const result = sanitizeEmailHtml(
      '<a href="https://example.com">site</a> <a href="mailto:a@b.com">mail</a>',
    );
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('href="mailto:a@b.com"');
  });

  it('keeps common email-safe formatting tags', () => {
    const result = sanitizeEmailHtml(
      '<p>Kính gửi,</p><p>Số tiền: <strong>1.000.000 VND</strong></p><ul><li>Mục 1</li></ul>',
    );
    expect(result).toContain('<strong>1.000.000 VND</strong>');
    expect(result).toContain('<li>Mục 1</li>');
  });

  it('strips style and iframe tags', () => {
    const result = sanitizeEmailHtml(
      '<style>body{color:red}</style><iframe src="https://evil.example"></iframe><p>ok</p>',
    );
    expect(result).not.toContain('<style');
    expect(result).not.toContain('<iframe');
    expect(result).toContain('<p>ok</p>');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPattern sanitize-email-html`
Expected: FAIL with "Cannot find module './sanitize-email-html'"

- [ ] **Step 4: Write the minimal implementation**

Create `apps/backend/src/modules/copilot/application/sanitize-email-html.ts`:

```ts
import sanitizeHtml from 'sanitize-html';

// AI-generated (and user-edited) email bodies are free-form HTML that gets
// rendered in a preview iframe and, eventually, in a real recipient's email
// client — this is the single sanitize path both write sites (the
// draftReminderEmail tool and manual draft edits) route through.
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      'ul',
      'ol',
      'li',
      'a',
      'table',
      'thead',
      'tbody',
      'tr',
      'td',
      'th',
      'h1',
      'h2',
      'h3',
      'span',
      'div',
    ],
    allowedAttributes: {
      a: ['href'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    disallowedTagsMode: 'discard',
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPattern sanitize-email-html`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/backend/package.json apps/backend/pnpm-lock.yaml apps/backend/src/modules/copilot/application/sanitize-email-html.ts apps/backend/src/modules/copilot/application/sanitize-email-html.spec.ts
git commit -m "feat: add shared email HTML sanitizer for Copilot drafts"
```

---

## Task 2: `DraftReminderEmailTool` accepts model-authored subject/bodyHtml

**Files:**
- Modify: `apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.ts`
- Modify: `apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.spec.ts` (full rewrite of the composing-related tests)

**Interfaces:**
- Consumes: `sanitizeEmailHtml(html: string): string` from Task 1.
- Produces: `DraftReminderEmailTool.execute(input: { receivableId: string; subject: string; bodyHtml: string }, organizationId: string, userId: string): Promise<DraftReminderEmailResult>` — used by Task 3 (`copilot.module.ts` schema, unchanged shape) and Task 5 (`CopilotChatUseCase.executeTool`). `DraftReminderEmailResult` keeps its existing shape: `{ draftId: string; receivableId: string; recipientEmail: string; subject: string; bodyHtml: string }`.

- [ ] **Step 1: Write the failing tests (replace the whole spec file)**

Replace `apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.spec.ts`:

```ts
import { ErrorCode } from '../../../../common/errors/error-code';
import type { Customer } from '../../../customers/domain/customer';
import { CustomerGroup } from '../../../customers/domain/customer-group';
import { Receivable } from '../../../receivables/domain/receivable';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { DraftReminderEmailTool } from './draft-reminder-email.tool';

function buildReceivable(): Receivable {
  return new Receivable({
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
    version: 1,
  });
}

function buildCustomer(): Customer {
  return {
    id: 'cust-1',
    organizationId: 'org-1',
    name: 'ABC Company',
    taxCode: '0101234567',
    email: 'ap@abc.vn',
    phone: '0900000000',
    defaultPaymentTermDays: 30,
    creditLimit: 100_000_000,
    priority: 1,
    customerGroup: CustomerGroup.REGULAR,
    createdAt: new Date('2026-01-01'),
  };
}

function buildTool(overrides: {
  receivable?: Receivable | null;
  customer?: Customer | null;
  save?: jest.Mock;
}) {
  const receivableRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(
        overrides.receivable === undefined
          ? buildReceivable()
          : overrides.receivable,
      ),
  };
  const customerRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(
        overrides.customer === undefined ? buildCustomer() : overrides.customer,
      ),
  };
  const draftRepo = { save: overrides.save ?? jest.fn() };
  return {
    tool: new DraftReminderEmailTool(
      receivableRepo as any,
      customerRepo as any,
      draftRepo as any,
    ),
    receivableRepo,
    customerRepo,
    draftRepo,
  };
}

describe('DraftReminderEmailTool', () => {
  it('persists the model-authored subject/bodyHtml with a tool-derived recipientEmail', async () => {
    const { tool, draftRepo } = buildTool({});

    const result = await tool.execute(
      {
        receivableId: 'rec-1',
        subject: 'Nhắc thanh toán khoản phải thu',
        bodyHtml: '<p>Kính gửi ABC Company, còn lại 30.000.000 VND.</p>',
      },
      'org-1',
      'user-1',
    );

    expect(result.recipientEmail).toBe('ap@abc.vn');
    expect(result.subject).toBe('Nhắc thanh toán khoản phải thu');
    expect(result.bodyHtml).toBe(
      '<p>Kính gửi ABC Company, còn lại 30.000.000 VND.</p>',
    );
    expect(draftRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: result.draftId,
        organizationId: 'org-1',
        userId: 'user-1',
        receivableId: 'rec-1',
        recipientEmail: 'ap@abc.vn',
        subject: 'Nhắc thanh toán khoản phải thu',
      }),
    );
  });

  it('sanitizes bodyHtml before persisting and returning it', async () => {
    const { tool } = buildTool({});

    const result = await tool.execute(
      {
        receivableId: 'rec-1',
        subject: 'Nhắc thanh toán',
        bodyHtml: '<p>Hello</p><script>alert(1)</script>',
      },
      'org-1',
      'user-1',
    );

    expect(result.bodyHtml).not.toContain('<script');
    expect(result.bodyHtml).toContain('<p>Hello</p>');
  });

  it('throws VALIDATION_ERROR when subject is missing', async () => {
    const { tool } = buildTool({});

    await expect(
      tool.execute(
        { receivableId: 'rec-1', subject: '', bodyHtml: '<p>ok</p>' } as any,
        'org-1',
        'user-1',
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VALIDATION_ERROR });
  });

  it('throws VALIDATION_ERROR when bodyHtml is missing', async () => {
    const { tool } = buildTool({});

    await expect(
      tool.execute(
        { receivableId: 'rec-1', subject: 'Subject', bodyHtml: '' } as any,
        'org-1',
        'user-1',
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VALIDATION_ERROR });
  });

  it('throws VALIDATION_ERROR when subject exceeds 200 characters', async () => {
    const { tool } = buildTool({});

    await expect(
      tool.execute(
        {
          receivableId: 'rec-1',
          subject: 'x'.repeat(201),
          bodyHtml: '<p>ok</p>',
        },
        'org-1',
        'user-1',
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VALIDATION_ERROR });
  });

  it('throws VALIDATION_ERROR when bodyHtml exceeds 20000 characters', async () => {
    const { tool } = buildTool({});

    await expect(
      tool.execute(
        {
          receivableId: 'rec-1',
          subject: 'Subject',
          bodyHtml: '<p>' + 'x'.repeat(20_000) + '</p>',
        },
        'org-1',
        'user-1',
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VALIDATION_ERROR });
  });

  it('throws RECEIVABLE_NOT_FOUND when the receivable is unavailable', async () => {
    const { tool } = buildTool({ receivable: null });

    await expect(
      tool.execute(
        { receivableId: 'missing', subject: 'Subject', bodyHtml: '<p>ok</p>' },
        'org-1',
        'user-1',
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.RECEIVABLE_NOT_FOUND });
  });

  it('throws TENANT_MISMATCH when the receivable belongs to another organization', async () => {
    const otherOrgReceivable = buildReceivable();
    otherOrgReceivable.organizationId = 'org-2';
    const { tool } = buildTool({ receivable: otherOrgReceivable });

    await expect(
      tool.execute(
        { receivableId: 'rec-1', subject: 'Subject', bodyHtml: '<p>ok</p>' },
        'org-1',
        'user-1',
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.TENANT_MISMATCH });
  });

  it('throws NOT_FOUND when the receivable customer is unavailable', async () => {
    const { tool } = buildTool({ customer: null });

    await expect(
      tool.execute(
        { receivableId: 'rec-1', subject: 'Subject', bodyHtml: '<p>ok</p>' },
        'org-1',
        'user-1',
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend && npx jest --testPathPattern draft-reminder-email.tool`
Expected: FAIL — the new tests fail because `execute()` still expects `{ receivableId, tone? }` and composes its own `subject`/`bodyHtml` instead of accepting them.

- [ ] **Step 3: Rewrite the tool implementation**

Replace `apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../../common/errors/app-error';
import { ErrorCode } from '../../../../common/errors/error-code';
import {
  CUSTOMER_REPOSITORY,
  type ICustomerRepository,
} from '../../../customers/application/customer-repository.port';
import type { IReceivableRepository } from '../../../receivables/application/receivable-repository.port';
import { RECEIVABLE_REPOSITORY } from '../../../receivables/application/receivable-repository.port';
import { sanitizeEmailHtml } from '../sanitize-email-html';
import type { CopilotJsonSchema } from '../copilot-tool-registry';
import {
  COPILOT_DRAFT_REPOSITORY,
  type ICopilotDraftRepository,
} from '../draft-repository.port';

const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_HTML_LENGTH = 20_000;

export const DRAFT_REMINDER_EMAIL_SCHEMA: CopilotJsonSchema = {
  type: 'object',
  properties: {
    receivableId: {
      type: 'string',
      description: 'The receivable UUID to draft a reminder for',
    },
    subject: {
      type: 'string',
      maxLength: MAX_SUBJECT_LENGTH,
      description:
        'The email subject line, written in Vietnamese, based on real receivable data',
    },
    bodyHtml: {
      type: 'string',
      maxLength: MAX_BODY_HTML_LENGTH,
      description:
        'The email body as HTML, written in Vietnamese, using the real remaining amount and due date from a prior read tool call',
    },
  },
  required: ['receivableId', 'subject', 'bodyHtml'],
};

export interface DraftReminderEmailResult {
  draftId: string;
  receivableId: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
}

export interface DraftReminderEmailInput {
  receivableId: string;
  subject: string;
  bodyHtml: string;
}

@Injectable()
export class DraftReminderEmailTool {
  static readonly NAME = 'draftReminderEmail';

  constructor(
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    @Inject(COPILOT_DRAFT_REPOSITORY)
    private readonly draftRepo: ICopilotDraftRepository,
  ) {}

  async execute(
    input: DraftReminderEmailInput,
    organizationId: string,
    userId: string,
  ): Promise<DraftReminderEmailResult> {
    if (!input.subject || input.subject.length > MAX_SUBJECT_LENGTH) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        `Tiêu đề email phải có từ 1 đến ${MAX_SUBJECT_LENGTH} ký tự.`,
      );
    }
    if (!input.bodyHtml || input.bodyHtml.length > MAX_BODY_HTML_LENGTH) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        `Nội dung email phải có từ 1 đến ${MAX_BODY_HTML_LENGTH} ký tự.`,
      );
    }

    const receivable = await this.receivableRepo.findById(input.receivableId);
    if (!receivable) {
      throw new AppError(
        ErrorCode.RECEIVABLE_NOT_FOUND,
        'Không tìm thấy khoản phải thu.',
      );
    }
    if (receivable.organizationId !== organizationId) {
      throw new AppError(
        ErrorCode.TENANT_MISMATCH,
        'Khoản phải thu không thuộc tổ chức hiện tại.',
      );
    }

    const customer = await this.customerRepo.findById(receivable.customerId);
    if (!customer) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy khách hàng của khoản phải thu này.',
      );
    }
    if (customer.organizationId !== organizationId) {
      throw new AppError(
        ErrorCode.TENANT_MISMATCH,
        'Khách hàng không thuộc tổ chức hiện tại.',
      );
    }

    const subject = input.subject.trim();
    const bodyHtml = sanitizeEmailHtml(input.bodyHtml);
    const draftId = randomUUID();

    await this.draftRepo.save({
      id: draftId,
      organizationId,
      userId,
      receivableId: receivable.id,
      recipientEmail: customer.email,
      subject,
      bodyHtml,
      createdAt: new Date(),
    });

    return {
      draftId,
      receivableId: receivable.id,
      recipientEmail: customer.email,
      subject,
      bodyHtml,
    };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/backend && npx jest --testPathPattern draft-reminder-email.tool`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.ts apps/backend/src/modules/copilot/application/tools/draft-reminder-email.tool.spec.ts
git commit -m "feat: draftReminderEmail tool accepts model-authored subject/bodyHtml"
```

---

## Task 3: Wire the updated schema in `copilot.module.ts`

**Files:**
- Modify: `apps/backend/src/modules/copilot/copilot.module.ts:83-95`

**Interfaces:**
- Consumes: `DraftReminderEmailTool.NAME` (unchanged: `'draftReminderEmail'`).

- [ ] **Step 1: Update the inline schema registration**

In `copilotToolRegistryFactory()`, replace the `draftReminderEmail` registration block:

```ts
  registry.register({
    name: DraftReminderEmailTool.NAME,
    description:
      'Create a reminder email draft (subject + HTML body, written in Vietnamese using real receivable data) without sending it.',
    inputSchema: {
      type: 'object',
      properties: {
        receivableId: { type: 'string' },
        subject: { type: 'string', maxLength: 200 },
        bodyHtml: { type: 'string', maxLength: 20000 },
      },
      required: ['receivableId', 'subject', 'bodyHtml'],
    },
    requiresReminderPermission: true,
  });
```

(This replaces the previous version that had `receivableId`/`tone` and no `subject`/`bodyHtml`.)

- [ ] **Step 2: Type-check**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/copilot/copilot.module.ts
git commit -m "feat: register subject/bodyHtml on the draftReminderEmail tool schema"
```

---

## Task 4: Sanitize `bodyHtml` on manual draft edits

**Files:**
- Modify: `apps/backend/src/modules/copilot/application/update-copilot-draft.usecase.ts`
- Modify: `apps/backend/src/modules/copilot/application/update-copilot-draft.usecase.spec.ts`

**Interfaces:**
- Consumes: `sanitizeEmailHtml(html: string): string` from Task 1.

- [ ] **Step 1: Read the existing spec file to find its mock structure**

Run: `cat apps/backend/src/modules/copilot/application/update-copilot-draft.usecase.spec.ts`

(Confirm the shape of `findMutableDraft`'s mocked dependencies before adding a test, so the new test reuses the same mock-building helpers already in the file rather than inventing a new pattern.)

- [ ] **Step 2: Write the failing test**

Add to `apps/backend/src/modules/copilot/application/update-copilot-draft.usecase.spec.ts` (inside the existing `describe` block, following the file's existing pattern for constructing the use case and its mocks):

```ts
  it('sanitizes bodyHtml before saving a manual edit', async () => {
    const { useCase, draftRepo } = buildUseCase();

    await useCase.execute({
      id: 'draft-1',
      bodyHtml: '<p>Hello</p><script>alert(1)</script>',
    });

    expect(draftRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyHtml: expect.not.stringContaining('<script'),
      }),
      expect.anything(),
    );
  });
```

(Adjust `buildUseCase()`/`draftRepo` to match whatever helper names the existing file already uses — read Step 1's output before writing this.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPattern update-copilot-draft.usecase`
Expected: FAIL — `bodyHtml` is saved unsanitized today, so the new assertion fails.

- [ ] **Step 4: Sanitize in the use case**

In `apps/backend/src/modules/copilot/application/update-copilot-draft.usecase.ts`, add the import and sanitize on write:

```ts
import { sanitizeEmailHtml } from './sanitize-email-html';
```

Change the `updated` object construction:

```ts
      const updated = {
        ...draft,
        subject: input.subject ?? draft.subject,
        bodyHtml:
          input.bodyHtml !== undefined
            ? sanitizeEmailHtml(input.bodyHtml)
            : draft.bodyHtml,
      };
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPattern update-copilot-draft.usecase`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/copilot/application/update-copilot-draft.usecase.ts apps/backend/src/modules/copilot/application/update-copilot-draft.usecase.spec.ts
git commit -m "feat: sanitize bodyHtml on manual Copilot draft edits"
```

---

## Task 5: Persist tool-call `output` on `CopilotMessageRecord`

**Files:**
- Modify: `apps/backend/src/modules/copilot/application/conversation-repository.port.ts`

**Interfaces:**
- Produces: `CopilotMessageRecord.toolCalls: Array<{ id: string; name: string; input: unknown; output: unknown }> | null` — used by Task 6 (`CopilotChatUseCase`) and Task 7 (`copilot-response.dto.ts`).

This is a type-only change (the `toolCalls` column is already JSONB — see design doc §4), so it's a configuration-style edit with no isolated behavior to test; Task 6's tests exercise it end-to-end.

- [ ] **Step 1: Widen the type**

In `apps/backend/src/modules/copilot/application/conversation-repository.port.ts`, change:

```ts
  toolCalls: Array<{ id: string; name: string; input: unknown }> | null;
```

to:

```ts
  toolCalls: Array<{
    id: string;
    name: string;
    input: unknown;
    output: unknown;
  }> | null;
```

- [ ] **Step 2: Type-check**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: errors at every call site that builds a `toolCalls` array without `output` — these are exactly the sites Task 6 fixes next. Confirm the errors point only to `copilot-chat.usecase.ts` (and nowhere in infrastructure, since the repository passes `row.toolCalls` through untyped-JSONB, not reconstructing the shape).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/copilot/application/conversation-repository.port.ts
git commit -m "feat: widen CopilotMessageRecord.toolCalls with an output field"
```

(This commit intentionally leaves `apps/backend` mid-typecheck-red — Task 6 is the fix. If your workflow requires every commit to type-check, squash Tasks 5 and 6 into one commit instead of committing here.)

---

## Task 6: Thread `draftReminderEmail` results onto the persisted message

**Files:**
- Modify: `apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts`
- Modify: `apps/backend/src/modules/copilot/application/copilot-chat.usecase.spec.ts`

**Interfaces:**
- Consumes: `DraftReminderEmailResult` type from `./tools/draft-reminder-email.tool` (Task 2); `CopilotMessageRecord.toolCalls[].output` (Task 5).
- Consumes (new tool input shape): `DraftReminderEmailTool.execute` now requires `{ receivableId, subject, bodyHtml }` (Task 2) instead of `{ receivableId, tone? }`.
- Produces: assistant messages saved via `conversationRepo.appendMessage` now include `output` on every `toolCalls` entry, and any `draftReminderEmail` result produced anywhere in the turn is included on whichever message ends that turn — even turns where `sendReminderEmail` is never called.

- [ ] **Step 1: Write the failing test — draft-only turn persists the draft as message output**

Add to `apps/backend/src/modules/copilot/application/copilot-chat.usecase.spec.ts` (new `it` in the existing `describe` block, reusing `buildRegistry()`/`buildDeps()`):

```ts
  it('attaches a draftReminderEmail result as output on the final message when no send is proposed', async () => {
    const aiProvider = { createChatCompletion: jest.fn() };
    aiProvider.createChatCompletion
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'tool-1',
            name: 'draftReminderEmail',
            arguments: {
              receivableId: 'rec-1',
              subject: 'Nhắc thanh toán',
              bodyHtml: '<p>Nội dung</p>',
            },
          },
        ],
        inputTokens: 10,
        outputTokens: 5,
      })
      .mockResolvedValueOnce({
        content: 'Đã tạo bản nháp cho bạn.',
        toolCalls: [],
        inputTokens: 5,
        outputTokens: 5,
      });
    const deps = buildDeps();
    deps.draftTool.execute.mockResolvedValue({
      draftId: 'draft-1',
      receivableId: 'rec-1',
      recipientEmail: 'ap@abc.vn',
      subject: 'Nhắc thanh toán',
      bodyHtml: '<p>Nội dung</p>',
    });
    const useCase = new CopilotChatUseCase(
      aiProvider as any,
      buildRegistry(),
      deps.summaryTool as any,
      deps.timelineTool as any,
      deps.paymentHistoryTool as any,
      deps.draftTool as any,
      deps.conversationRepo as any,
      deps.pendingActionRepo as any,
      deps.usageLogRepo as any,
      deps.planLimitService as any,
      deps.dataSource as any,
      deps.tenantContext as any,
    );

    const result = await useCase.execute({
      conversationId: 'conversation-1',
      userMessage: 'Draft a reminder for rec-1',
    });

    expect(result.pendingAction).toBeNull();
    expect(result.message.toolCalls).toEqual([
      expect.objectContaining({
        id: 'tool-1',
        name: 'draftReminderEmail',
        output: expect.objectContaining({ draftId: 'draft-1' }),
      }),
    ]);
  });

  it('includes an earlier-round draftReminderEmail output alongside a later sendReminderEmail proposal', async () => {
    const aiProvider = { createChatCompletion: jest.fn() };
    aiProvider.createChatCompletion
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'tool-1',
            name: 'draftReminderEmail',
            arguments: {
              receivableId: 'rec-1',
              subject: 'Nhắc thanh toán',
              bodyHtml: '<p>Nội dung</p>',
            },
          },
        ],
        inputTokens: 10,
        outputTokens: 5,
      })
      .mockResolvedValueOnce({
        content: 'Đề xuất gửi.',
        toolCalls: [
          {
            id: 'tool-2',
            name: 'sendReminderEmail',
            arguments: { draftId: 'draft-1', receivableId: 'rec-1' },
          },
        ],
        inputTokens: 20,
        outputTokens: 8,
      });
    const deps = buildDeps();
    deps.draftTool.execute.mockResolvedValue({
      draftId: 'draft-1',
      receivableId: 'rec-1',
      recipientEmail: 'ap@abc.vn',
      subject: 'Nhắc thanh toán',
      bodyHtml: '<p>Nội dung</p>',
    });
    deps.pendingActionRepo.create.mockResolvedValue({
      id: 'action-1',
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      actionType: 'SEND_REMINDER_EMAIL',
      status: 'PENDING',
      payload: { draftId: 'draft-1', receivableId: 'rec-1' },
      createdAt: new Date('2026-08-21T10:00:00Z'),
      resolvedAt: null,
      resolvedByUserId: null,
    });
    const useCase = new CopilotChatUseCase(
      aiProvider as any,
      buildRegistry(),
      deps.summaryTool as any,
      deps.timelineTool as any,
      deps.paymentHistoryTool as any,
      deps.draftTool as any,
      deps.conversationRepo as any,
      deps.pendingActionRepo as any,
      deps.usageLogRepo as any,
      deps.planLimitService as any,
      deps.dataSource as any,
      deps.tenantContext as any,
    );

    const result = await useCase.execute({
      conversationId: 'conversation-1',
      userMessage: 'Draft then send for rec-1',
    });

    expect(result.pendingAction).toMatchObject({ id: 'action-1' });
    expect(result.message.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'tool-1',
          name: 'draftReminderEmail',
          output: expect.objectContaining({ draftId: 'draft-1' }),
        }),
        expect.objectContaining({ id: 'tool-2', name: 'sendReminderEmail' }),
      ]),
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend && npx jest --testPathPattern copilot-chat.usecase`
Expected: FAIL — today's `execute()` never attaches `output`, and the draft-only turn's `draftReminderEmail` call is dropped entirely (never persisted), so `result.message.toolCalls` is `null`/missing the draft entry.

- [ ] **Step 3: Update `executeTool` to pass the model-authored subject/bodyHtml**

In `apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts`, update the `DraftReminderEmailTool.NAME` case inside `executeTool()`:

```ts
      case DraftReminderEmailTool.NAME:
        return this.draftReminderEmailTool.execute(
          {
            receivableId: requiredString(input, 'receivableId'),
            subject: requiredString(input, 'subject'),
            bodyHtml: requiredString(input, 'bodyHtml'),
          },
          organizationId,
          userId,
        );
```

- [ ] **Step 4: Add a draft-result type guard**

Add near the top of the file (after the existing helper functions, before the `CopilotChatUseCase` class), importing the result type:

```ts
import type { DraftReminderEmailResult } from './tools/draft-reminder-email.tool';
```

```ts
function isDraftReminderEmailResult(
  name: string,
  result: unknown,
): result is DraftReminderEmailResult {
  return (
    name === DraftReminderEmailTool.NAME &&
    typeof result === 'object' &&
    result !== null &&
    'draftId' in result
  );
}
```

- [ ] **Step 5: Thread draft outputs through `execute()`**

In `execute()`, declare an accumulator right after `const tools = ...` and before the `for` loop:

```ts
    const draftToolCalls: Array<{
      id: string;
      name: string;
      input: unknown;
      output: unknown;
    }> = [];
```

Replace the `sendCall` branch's batched-execution block (the `Promise.all` that runs non-send tool calls and discards their result via `.catch(() => undefined)`) with one that captures outputs:

```ts
      if (sendCall) {
        const draftId = requiredString(sendCall.arguments, 'draftId');
        const receivableId = requiredString(sendCall.arguments, 'receivableId');
        const batchedResults = await Promise.all(
          response.toolCalls
            .filter((call) => call.name !== SendReminderEmailTool.NAME)
            .map(async (call) => ({
              call,
              result: await this.executeTool(
                call.name,
                call.arguments,
                user.organizationId,
                user.userId,
              ).catch(() => null),
            })),
        );
        const outputByCallId = new Map(
          batchedResults.map(({ call, result }) => [call.id, result]),
        );
        const { pendingAction, saved } = await this.dataSource.transaction(
          async (manager) => {
            const action = await this.pendingActionRepo.create(
              input.conversationId,
              { draftId, receivableId },
              manager,
            );
            const message = await this.conversationRepo.appendMessage(
              {
                conversationId: input.conversationId,
                role: 'ASSISTANT',
                content: response.content ?? '',
                toolCalls: [
                  ...draftToolCalls,
                  ...response.toolCalls.map((call) => ({
                    id: call.id,
                    name: call.name,
                    input: call.arguments,
                    output: outputByCallId.get(call.id) ?? null,
                  })),
                ],
                createdAt: new Date(),
              },
              manager,
            );
            return { pendingAction: action, saved: message };
          },
        );
        return { message: saved, pendingAction };
      }
```

Replace the no-more-tool-calls branch:

```ts
      if (response.toolCalls.length === 0) {
        const saved = await this.conversationRepo.appendMessage({
          conversationId: input.conversationId,
          role: 'ASSISTANT',
          content: response.content ?? '',
          toolCalls: draftToolCalls.length > 0 ? draftToolCalls : null,
          createdAt: new Date(),
        });
        return { message: saved, pendingAction: null };
      }
```

Replace the loop-continuation block (the one that computes `toolResults` and pushes to `messages`) to also record successful drafts:

```ts
      const toolResults = await Promise.all(
        response.toolCalls.map(async (call) => ({
          id: call.id,
          result: await this.executeTool(
            call.name,
            call.arguments,
            user.organizationId,
            user.userId,
          ).catch((error: unknown) => toToolErrorPayload(error)),
        })),
      );
      for (const call of response.toolCalls) {
        const toolResult = toolResults.find((r) => r.id === call.id);
        if (
          toolResult &&
          isDraftReminderEmailResult(call.name, toolResult.result)
        ) {
          draftToolCalls.push({
            id: call.id,
            name: call.name,
            input: call.arguments,
            output: toolResult.result,
          });
        }
      }
      messages.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls,
      });
      for (const toolResult of toolResults) {
        messages.push({
          role: 'tool',
          content: JSON.stringify(toolResult.result),
          toolCallId: toolResult.id,
        });
      }
```

- [ ] **Step 6: Mirror the same change in `executeStreaming()`**

Apply the identical pattern to `executeStreaming()`, substituting the local `content`/`toolCalls` variables for `response.content`/`response.toolCalls`:

Declare the accumulator after `const toolSpecs = ...` and before the `for` loop:

```ts
      const draftToolCalls: Array<{
        id: string;
        name: string;
        input: unknown;
        output: unknown;
      }> = [];
```

Replace the `sendCall` branch's batched-execution block:

```ts
        if (sendCall) {
          const draftId = requiredString(sendCall.arguments, 'draftId');
          const receivableId = requiredString(
            sendCall.arguments,
            'receivableId',
          );
          const batchedResults = await Promise.all(
            toolCalls
              .filter((call) => call.name !== SendReminderEmailTool.NAME)
              .map(async (call) => ({
                call,
                result: await this.executeTool(
                  call.name,
                  call.arguments,
                  user.organizationId,
                  user.userId,
                ).catch(() => null),
              })),
          );
          const outputByCallId = new Map(
            batchedResults.map(({ call, result }) => [call.id, result]),
          );
          const { pendingAction, saved } = await this.dataSource.transaction(
            async (manager) => {
              const action = await this.pendingActionRepo.create(
                input.conversationId,
                { draftId, receivableId },
                manager,
              );
              const message = await this.conversationRepo.appendMessage(
                {
                  conversationId: input.conversationId,
                  role: 'ASSISTANT',
                  content,
                  toolCalls: [
                    ...draftToolCalls,
                    ...toolCalls.map((call) => ({
                      id: call.id,
                      name: call.name,
                      input: call.arguments,
                      output: outputByCallId.get(call.id) ?? null,
                    })),
                  ],
                  createdAt: new Date(),
                },
                manager,
              );
              return { pendingAction: action, saved: message };
            },
          );
          yield { type: 'done', message: saved, pendingAction };
          return;
        }
```

Replace the no-more-tool-calls branch:

```ts
        if (toolCalls.length === 0) {
          const saved = await this.conversationRepo.appendMessage({
            conversationId: input.conversationId,
            role: 'ASSISTANT',
            content,
            toolCalls: draftToolCalls.length > 0 ? draftToolCalls : null,
            createdAt: new Date(),
          });
          yield { type: 'done', message: saved, pendingAction: null };
          return;
        }
```

Replace the loop-continuation block:

```ts
        const toolResults = await Promise.all(
          toolCalls.map(async (call) => ({
            id: call.id,
            result: await this.executeTool(
              call.name,
              call.arguments,
              user.organizationId,
              user.userId,
            ).catch((error: unknown) => toToolErrorPayload(error)),
          })),
        );
        for (const call of toolCalls) {
          const toolResult = toolResults.find((r) => r.id === call.id);
          if (
            toolResult &&
            isDraftReminderEmailResult(call.name, toolResult.result)
          ) {
            draftToolCalls.push({
              id: call.id,
              name: call.name,
              input: call.arguments,
              output: toolResult.result,
            });
          }
        }
        messages.push({
          role: 'assistant',
          content: content || null,
          toolCalls,
        });
        for (const toolResult of toolResults) {
          messages.push({
            role: 'tool',
            content: JSON.stringify(toolResult.result),
            toolCallId: toolResult.id,
          });
        }
```

- [ ] **Step 7: Update the system prompt**

Replace `SYSTEM_PROMPT`:

```ts
const SYSTEM_PROMPT = [
  'You are an AI assistant for collections accounting (Collection Copilot).',
  'You may ONLY answer based on structured JSON data returned by read tools — do not invent figures.',
  'If the user wants to send a reminder email, call draftReminderEmail first to create a draft, then call sendReminderEmail to propose sending it — the user must separately confirm the actual send; you do not send it yourself.',
  'Before calling draftReminderEmail, you must already have the real remaining amount and due date for the receivable from a prior getReceivableSummary call (or from data already in this conversation) — write the subject and bodyHtml yourself, in Vietnamese, using only those real figures; never invent an amount or date.',
  'You have neither permission nor tools to write off receivables, allocate payments, or handle disputes — if the user asks, direct them to the standard interface.',
].join(' ');
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd apps/backend && npx jest --testPathPattern copilot-chat.usecase`
Expected: PASS (all existing tests plus the two new ones — existing tests are unaffected since they never assert `toolCalls` is exactly `null`/a bare array without `output`, except where `expect.objectContaining` was already used).

- [ ] **Step 9: Type-check the whole backend**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: PASS — this also resolves the Task 5 red state.

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/modules/copilot/application/copilot-chat.usecase.ts apps/backend/src/modules/copilot/application/copilot-chat.usecase.spec.ts
git commit -m "feat: persist draftReminderEmail output on the turn's assistant message"
```

---

## Task 7: Surface `drafts` on `CopilotMessageDto`

**Files:**
- Modify: `apps/backend/src/modules/copilot/presentation/dto/copilot-response.dto.ts`
- Test: add a new spec file `apps/backend/src/modules/copilot/presentation/dto/copilot-response.dto.spec.ts`

**Interfaces:**
- Consumes: `CopilotMessageRecord.toolCalls[].output` (Task 5/6), `DraftReminderEmailResult` shape (Task 2).
- Produces: `CopilotMessageDto.drafts: CopilotMessageDraftDto[]` where `CopilotMessageDraftDto = { draftId: string; receivableId: string; recipientEmail: string; subject: string; bodyHtml: string }` — used by Task 11/12 (frontend) via the JSON response.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/copilot/presentation/dto/copilot-response.dto.spec.ts`:

```ts
import { toCopilotMessageDto } from './copilot-response.dto';
import type { CopilotMessageRecord } from '../../application/conversation-repository.port';

function buildMessage(
  overrides: Partial<CopilotMessageRecord> = {},
): CopilotMessageRecord {
  return {
    id: 'message-1',
    organizationId: 'org-1',
    conversationId: 'conversation-1',
    role: 'ASSISTANT',
    content: 'Đã tạo bản nháp.',
    toolCalls: null,
    createdAt: new Date('2026-08-21T10:00:00Z'),
    ...overrides,
  };
}

describe('toCopilotMessageDto', () => {
  it('returns an empty drafts array when there are no tool calls', () => {
    const dto = toCopilotMessageDto(buildMessage());
    expect(dto.drafts).toEqual([]);
  });

  it('surfaces a draftReminderEmail output as a drafts entry', () => {
    const dto = toCopilotMessageDto(
      buildMessage({
        toolCalls: [
          {
            id: 'tool-1',
            name: 'draftReminderEmail',
            input: { receivableId: 'rec-1' },
            output: {
              draftId: 'draft-1',
              receivableId: 'rec-1',
              recipientEmail: 'ap@abc.vn',
              subject: 'Nhắc thanh toán',
              bodyHtml: '<p>Nội dung</p>',
            },
          },
        ],
      }),
    );

    expect(dto.drafts).toEqual([
      {
        draftId: 'draft-1',
        receivableId: 'rec-1',
        recipientEmail: 'ap@abc.vn',
        subject: 'Nhắc thanh toán',
        bodyHtml: '<p>Nội dung</p>',
      },
    ]);
  });

  it('does not surface other tools as drafts', () => {
    const dto = toCopilotMessageDto(
      buildMessage({
        toolCalls: [
          {
            id: 'tool-1',
            name: 'getReceivableSummary',
            input: { customerId: 'cust-1' },
            output: { overdueCount: 2 },
          },
        ],
      }),
    );

    expect(dto.drafts).toEqual([]);
    expect(dto).not.toHaveProperty('toolCalls');
  });

  it('ignores a malformed draftReminderEmail output instead of throwing', () => {
    const dto = toCopilotMessageDto(
      buildMessage({
        toolCalls: [
          {
            id: 'tool-1',
            name: 'draftReminderEmail',
            input: {},
            output: { error: 'something failed' },
          },
        ],
      }),
    );

    expect(dto.drafts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPattern copilot-response.dto`
Expected: FAIL — `CopilotMessageDto`/`toCopilotMessageDto` has no `drafts` field yet.

- [ ] **Step 3: Implement `drafts` on the DTO**

In `apps/backend/src/modules/copilot/presentation/dto/copilot-response.dto.ts`, add near the top (after existing imports):

```ts
export class CopilotMessageDraftDto {
  draftId: string;
  receivableId: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
}

function isDraftReminderEmailOutput(
  output: unknown,
): output is CopilotMessageDraftDto {
  return (
    typeof output === 'object' &&
    output !== null &&
    'draftId' in output &&
    'receivableId' in output &&
    'recipientEmail' in output &&
    'subject' in output &&
    'bodyHtml' in output
  );
}
```

Add `drafts: CopilotMessageDraftDto[];` to `CopilotMessageDto`:

```ts
export class CopilotMessageDto {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
  isPartial: boolean;
  drafts: CopilotMessageDraftDto[];
}
```

Update `toCopilotMessageDto`:

```ts
export const toCopilotMessageDto = (
  message: CopilotMessageRecord,
): CopilotMessageDto => ({
  id: message.id,
  role: message.role === 'TOOL' ? 'ASSISTANT' : message.role,
  content: message.content,
  createdAt: message.createdAt.toISOString(),
  isPartial: message.isPartial ?? false,
  drafts: (message.toolCalls ?? [])
    .filter((call) => call.name === 'draftReminderEmail')
    .map((call) => call.output)
    .filter(isDraftReminderEmailOutput),
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPattern copilot-response.dto`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full backend unit suite**

Run: `cd apps/backend && npx jest`
Expected: PASS — confirms nothing else (controller spec, conversation repo spec) broke from the DTO/type changes.

- [ ] **Step 6: Type-check**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/copilot/presentation/dto/copilot-response.dto.ts apps/backend/src/modules/copilot/presentation/dto/copilot-response.dto.spec.ts
git commit -m "feat: surface draftReminderEmail output as CopilotMessageDto.drafts"
```

---

## Task 8: e2e coverage for sanitization on the update endpoint

**Files:**
- Modify: `apps/backend/test/copilot-drafts.e2e-spec.ts`

**Interfaces:**
- Consumes: `PATCH /api/v1/copilot/drafts/:id` (existing endpoint, unchanged route/shape — only its sanitize behavior changes per Task 4).

- [ ] **Step 1: Read the existing "edits a DRAFTED draft" test for its exact seed/request pattern**

Run: `sed -n '1,60p;200,230p' apps/backend/test/copilot-drafts.e2e-spec.ts`

(Confirms the `seedDraft`/`request(app.getHttpServer())` helpers already in scope, so the new test follows the same style.)

- [ ] **Step 2: Write the failing test**

Add a new case immediately after the existing `it('edits a DRAFTED draft, and blocks editing a PENDING one', ...)` block in `apps/backend/test/copilot-drafts.e2e-spec.ts`:

```ts
  it('sanitizes bodyHtml on a manual edit', async () => {
    const draftId = randomUUID();
    await seedDraft(draftId, new Date('2026-08-14T02:00:00Z'));

    const updateResponse = await request(app?.getHttpServer())
      .patch(`/api/v1/copilot/drafts/${draftId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ bodyHtml: '<p>Hello</p><script>alert(1)</script>' })
      .expect(200);

    expect(updateResponse.body.bodyHtml).not.toContain('<script');
    expect(updateResponse.body.bodyHtml).toContain('<p>Hello</p>');
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/backend && npx jest --config ./test/jest-e2e.json --testPathPattern copilot-drafts`
Expected: FAIL before Task 4's fix is present — since Task 4 is already implemented earlier in this plan, this should actually PASS already; run it to confirm no regression instead of expecting red. If it fails, re-check that Task 4's `sanitizeEmailHtml` call landed in `update-copilot-draft.usecase.ts`.

- [ ] **Step 4: Confirm it passes**

Run: `cd apps/backend && npx jest --config ./test/jest-e2e.json --testPathPattern copilot-drafts`
Expected: PASS (this test, plus all prior tests in the file, unaffected).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/test/copilot-drafts.e2e-spec.ts
git commit -m "test: cover bodyHtml sanitization on the draft update e2e endpoint"
```

---

## Task 9: `EmailDraftPreview` frontend component

**Files:**
- Create: `apps/frontend/src/features/copilot/components/email-draft-preview.tsx`
- Create: `apps/frontend/src/features/copilot/components/email-draft-preview.spec.tsx`

**Interfaces:**
- Produces: `EmailDraftPreview({ subject, recipientEmail, bodyHtml }: { subject: string; recipientEmail: string; bodyHtml: string }): JSX.Element` — used by Task 11 (`message-list.tsx`) and Task 12 (`drafts-list.tsx`).

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/copilot/components/email-draft-preview.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailDraftPreview } from './email-draft-preview';

const bodyHtml = '<p>Kính gửi ABC, còn lại 1.000.000 VND.</p><script>alert(1)</script>';

describe('EmailDraftPreview', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders the subject and recipient', () => {
    render(
      <EmailDraftPreview
        subject="Nhắc thanh toán"
        recipientEmail="ap@abc.vn"
        bodyHtml={bodyHtml}
      />,
    );
    expect(screen.getByText('Nhắc thanh toán')).toBeInTheDocument();
    expect(screen.getByText('ap@abc.vn')).toBeInTheDocument();
  });

  it('renders the HTML body inside a sandboxed iframe by default', () => {
    render(
      <EmailDraftPreview
        subject="Nhắc thanh toán"
        recipientEmail="ap@abc.vn"
        bodyHtml={bodyHtml}
      />,
    );
    const iframe = screen.getByTitle('Xem trước email') as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    expect(iframe.getAttribute('sandbox')).toBe('');
    expect(iframe.srcdoc).toBe(bodyHtml);
  });

  it('switches to escaped HTML-code view and back', async () => {
    const user = userEvent.setup();
    render(
      <EmailDraftPreview
        subject="Nhắc thanh toán"
        recipientEmail="ap@abc.vn"
        bodyHtml={bodyHtml}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /html/i }));

    expect(screen.queryByTitle('Xem trước email')).not.toBeInTheDocument();
    expect(screen.getByText(bodyHtml)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /preview/i }));
    expect(screen.getByTitle('Xem trước email')).toBeInTheDocument();
  });

  it('copies the HTML source to the clipboard', async () => {
    const user = userEvent.setup();
    render(
      <EmailDraftPreview
        subject="Nhắc thanh toán"
        recipientEmail="ap@abc.vn"
        bodyHtml={bodyHtml}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /html/i }));
    await user.click(screen.getByRole('button', { name: /sao chép/i }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(bodyHtml);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/frontend && npx vitest run email-draft-preview`
Expected: FAIL with "Cannot find module './email-draft-preview'"

- [ ] **Step 3: Write the component**

Create `apps/frontend/src/features/copilot/components/email-draft-preview.tsx`:

```tsx
import { Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function EmailDraftPreview({
  subject,
  recipientEmail,
  bodyHtml,
}: {
  subject: string;
  recipientEmail: string;
  bodyHtml: string;
}) {
  const [mode, setMode] = useState<'preview' | 'code'>('preview');

  async function copyHtml() {
    try {
      await navigator.clipboard.writeText(bodyHtml);
      toast.success('Đã sao chép mã HTML.');
    } catch {
      toast.error('Không thể sao chép mã HTML.');
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="break-words text-sm">{subject}</CardTitle>
        <p className="break-words text-xs text-muted-foreground">
          {recipientEmail}
        </p>
      </CardHeader>
      <CardContent>
        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as 'preview' | 'code')}
        >
          <div className="flex items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="code">HTML code</TabsTrigger>
            </TabsList>
            {mode === 'code' && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void copyHtml()}
              >
                <Copy className="size-3.5" aria-hidden="true" />
                Sao chép
              </Button>
            )}
          </div>
          <TabsContent value="preview">
            <iframe
              title="Xem trước email"
              sandbox=""
              srcDoc={bodyHtml}
              className="h-64 w-full rounded-md border bg-white"
            />
          </TabsContent>
          <TabsContent value="code">
            <pre className="max-h-64 overflow-auto rounded-md border bg-muted p-3 text-xs">
              <code>{bodyHtml}</code>
            </pre>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/frontend && npx vitest run email-draft-preview`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/copilot/components/email-draft-preview.tsx apps/frontend/src/features/copilot/components/email-draft-preview.spec.tsx
git commit -m "feat: add EmailDraftPreview with sandboxed preview/HTML-code toggle"
```

---

## Task 10: Add `drafts` to the frontend `CopilotMessage` type

**Files:**
- Modify: `apps/frontend/src/features/copilot/types.ts`

**Interfaces:**
- Produces: `CopilotMessage.drafts?: Array<{ draftId: string; receivableId: string; recipientEmail: string; subject: string; bodyHtml: string }>` — used by Task 11 (`message-list.tsx`).

Type-only change; verified by Task 11's test (no isolated test needed here — matches the file's existing style, which has no `types.spec.ts`).

- [ ] **Step 1: Update `CopilotMessage`**

In `apps/frontend/src/features/copilot/types.ts`, replace:

```ts
export interface CopilotMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
  isPartial?: boolean;
}
```

with:

```ts
export interface CopilotMessageDraft {
  draftId: string;
  receivableId: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
}

export interface CopilotMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
  isPartial?: boolean;
  drafts?: CopilotMessageDraft[];
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: PASS (the field is optional, so no existing message-literal call site breaks — e.g. `use-copilot.ts`'s locally-constructed user/partial messages never set `drafts`, which is fine).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/copilot/types.ts
git commit -m "feat: add drafts field to the frontend CopilotMessage type"
```

---

## Task 11: Render `EmailDraftPreview` in the chat message list

**Files:**
- Modify: `apps/frontend/src/features/copilot/components/message-list.tsx`
- Test: create `apps/frontend/src/features/copilot/components/message-list.spec.tsx`

**Interfaces:**
- Consumes: `CopilotMessage.drafts` (Task 10), `EmailDraftPreview` (Task 9).

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/copilot/components/message-list.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MessageList } from './message-list';

describe('MessageList', () => {
  it('renders an EmailDraftPreview card for a message carrying a draft', () => {
    render(
      <MessageList
        messages={[
          {
            id: 'message-1',
            role: 'ASSISTANT',
            content: 'Đã tạo bản nháp cho bạn.',
            createdAt: '2026-08-21T10:00:00Z',
            drafts: [
              {
                draftId: 'draft-1',
                receivableId: 'rec-1',
                recipientEmail: 'ap@abc.vn',
                subject: 'Nhắc thanh toán',
                bodyHtml: '<p>Nội dung</p>',
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText('Đã tạo bản nháp cho bạn.')).toBeInTheDocument();
    expect(screen.getByText('Nhắc thanh toán')).toBeInTheDocument();
    expect(screen.getByText('ap@abc.vn')).toBeInTheDocument();
  });

  it('renders no draft card for a message without drafts', () => {
    render(
      <MessageList
        messages={[
          {
            id: 'message-1',
            role: 'ASSISTANT',
            content: 'Chào bạn.',
            createdAt: '2026-08-21T10:00:00Z',
          },
        ]}
      />,
    );

    expect(screen.queryByTitle('Xem trước email')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/frontend && npx vitest run message-list`
Expected: FAIL — the current `MessageList` never renders draft content.

- [ ] **Step 3: Update `MessageList`**

Replace `apps/frontend/src/features/copilot/components/message-list.tsx`:

```tsx
import type { CopilotMessage } from '../types';
import { CopilotMessageBubble } from './copilot-message-bubble';
import { EmailDraftPreview } from './email-draft-preview';

export function MessageList({
  messages,
  streamingContent,
}: {
  messages: CopilotMessage[];
  streamingContent?: string;
}) {
  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <div key={message.id} className="space-y-2">
          <CopilotMessageBubble message={message} />
          {message.drafts?.map((draft) => (
            <EmailDraftPreview
              key={draft.draftId}
              subject={draft.subject}
              recipientEmail={draft.recipientEmail}
              bodyHtml={draft.bodyHtml}
            />
          ))}
        </div>
      ))}
      {streamingContent && (
        <CopilotMessageBubble
          message={{ role: 'ASSISTANT', content: streamingContent }}
          isStreaming
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/frontend && npx vitest run message-list`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/copilot/components/message-list.tsx apps/frontend/src/features/copilot/components/message-list.spec.tsx
git commit -m "feat: render EmailDraftPreview cards under chat messages with drafts"
```

---

## Task 12: Reuse `EmailDraftPreview` in the Drafts tab

**Files:**
- Modify: `apps/frontend/src/features/copilot/components/drafts-list.tsx`
- Test: create `apps/frontend/src/features/copilot/components/drafts-list.spec.tsx`

**Interfaces:**
- Consumes: `EmailDraftPreview` (Task 9), `useCopilotDrafts`/`useConfirmCopilotDraft`/`useReopenCopilotDraft`/`useDeleteCopilotDraft` (existing, unchanged).

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/copilot/components/drafts-list.spec.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftsList } from './drafts-list';
import * as draftsApi from '../api/copilot-drafts-api';

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('DraftsList', () => {
  beforeEach(() => {
    vi.spyOn(draftsApi, 'fetchCopilotDrafts').mockResolvedValue({
      items: [
        {
          id: 'draft-1',
          receivableId: 'rec-1',
          recipientEmail: 'ap@abc.vn',
          subject: 'Nhắc thanh toán',
          bodyHtml: '<p>Nội dung</p>',
          status: 'DRAFTED',
          pendingActionId: null,
          createdAt: '2026-08-21T10:00:00Z',
        },
      ],
      total: 1,
    });
  });

  it('renders the draft body inside an EmailDraftPreview card', async () => {
    renderWithClient(<DraftsList canSendManual={false} />);

    expect(await screen.findByText('Nhắc thanh toán')).toBeInTheDocument();
    expect(screen.getByText('ap@abc.vn')).toBeInTheDocument();
    expect(screen.getByTitle('Xem trước email')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/frontend && npx vitest run drafts-list`
Expected: FAIL — the current `DraftsList` renders subject as plain `CardTitle` text with no iframe/preview.

- [ ] **Step 3: Update `DraftsList`**

In `apps/frontend/src/features/copilot/components/drafts-list.tsx`, add the import:

```ts
import { EmailDraftPreview } from './email-draft-preview';
```

Replace the `<Card key={draft.id}>...</Card>` header/body structure. The current code is:

```tsx
          <Card key={draft.id}>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="min-w-0 break-words text-sm">
                {draft.subject}
              </CardTitle>
              <Badge variant="secondary">{STATUS_LABEL[draft.status]}</Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="break-words text-muted-foreground">
                {draft.recipientEmail}
              </p>
              {canSendManual && (
```

Replace it with (keeping the same `Card`/`Badge`/action-button structure, but delegating subject+recipient+body to `EmailDraftPreview` and keeping the status badge above it):

```tsx
          <Card key={draft.id}>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="min-w-0 break-words text-sm">
                Bản nháp
              </CardTitle>
              <Badge variant="secondary">{STATUS_LABEL[draft.status]}</Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <EmailDraftPreview
                subject={draft.subject}
                recipientEmail={draft.recipientEmail}
                bodyHtml={draft.bodyHtml}
              />
              {canSendManual && (
```

(Everything from `{canSendManual && (` through the end of the `CardContent`/`Card` stays exactly as it is today — only the header/body above it changes.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/frontend && npx vitest run drafts-list`
Expected: PASS

- [ ] **Step 5: Run the full frontend test suite**

Run: `cd apps/frontend && npx vitest run`
Expected: PASS — confirms `copilot-page.spec.tsx` and other existing specs still pass with the changed `DraftsList` markup.

- [ ] **Step 6: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/copilot/components/drafts-list.tsx apps/frontend/src/features/copilot/components/drafts-list.spec.tsx
git commit -m "feat: reuse EmailDraftPreview in the Copilot Drafts tab"
```

---

## Task 13: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Backend full suite**

Run: `cd apps/backend && npx jest`
Expected: PASS, all suites.

- [ ] **Step 2: Backend type-check**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Backend e2e** (requires Docker for testcontainers)

Run: `cd apps/backend && pnpm test:e2e`
Expected: PASS, including the new Task 8 case.

- [ ] **Step 4: Frontend full suite**

Run: `cd apps/frontend && npx vitest run`
Expected: PASS, all suites.

- [ ] **Step 5: Frontend type-check**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Repo-wide verify**

Run: `pnpm verify`
Expected: PASS (lint + type-check + test across the workspace).

- [ ] **Step 7: Domain check**

Run the `domain-check` skill per `AGENTS.md` ("after any backend code change") and fix any violations it reports before proceeding.

- [ ] **Step 8: Manual smoke check (frontend)**

Run: `cd apps/frontend && pnpm dev` (or the repo's usual dev-server command), open the Copilot page, ask "Draft a payment reminder for an overdue invoice" for a seeded receivable, and confirm: the assistant reply shows an `EmailDraftPreview` card; Preview renders the HTML visually; HTML-code tab shows escaped source with a working copy button; the Drafts tab shows the same draft with the same toggle; no email is sent without the separate Confirm step.

No commit for this task (verification only).
