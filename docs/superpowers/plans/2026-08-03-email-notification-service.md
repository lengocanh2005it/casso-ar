# Email / Notification Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate all outbound email sending behind one `IEmailProviderAdapter` port with a single real implementation (`ResendEmailAdapter`, using the `resend` npm package). `EmailService.sendReminderEmail` never calls the provider directly — it enqueues into a new `email-queue` (BullMQ); a `EmailQueueProcessor` worker consumes the job, calls `adapter.send()`, and only then marks the send result on the caller's `ReminderExecution` row. On the 3rd failed attempt the job lands in BullMQ's `failed` state (this codebase's Dead Letter Queue equivalent) and `ReminderExecution.status` is set to `FAILED`. This plan also fulfils the Authentication & Onboarding plan's forward promise: it rebinds that plan's `AUTH_EMAIL_SENDER` DI token from the `ConsoleEmailSenderAdapter` stub to a real Resend-backed implementation of the same `IAuthEmailSender` interface, with zero changes to any auth use case.

**Architecture:** New `apps/backend/src/modules/notifications/` module, 3-layer (`application`/`infrastructure`, no `domain/` — there is no new domain entity here, just a provider seam and a queue-backed service, matching how the Webhook plan's `webhooks` module has ports/services without a rich domain class for every concept). Follows the exact BullMQ pattern the Webhook Matching Engine plan established for `webhook-processing`: `@nestjs/bullmq`'s `BullModule.registerQueue`, a `@Processor`/`WorkerHost` consumer class, and `TenantContextService.run()` used inside the worker to open a tenant scope from job data (workers have no JWT to decode).
>
> **Reconciled (2026-08-04 pass):** this plan originally defined two local placeholder ports (`IEmailTemplateRepository.renderForReceivable`, `IReminderExecutionRepository.updateSendResult`) because neither `2026-08-03-email-template-management.md` nor `2026-08-03-reminder-automation.md` had a plan yet. Both now exist. `EmailService.sendReminderEmail` is rewritten to use the REAL `IEmailTemplateRepository`/`RenderEmailTemplateUseCase` from `2026-08-03-email-template-management.md` (fetch the template, build the 7-field render data from the real `Receivable`/`Customer`/`Organization`, render with Handlebars) and the REAL `IReminderExecutionRepository`/`REMINDER_EXECUTION_REPOSITORY` token from `2026-08-03-reminder-automation.md` (not a local reinvention — same `Symbol` instance, imported). `NotificationsModule` now imports `EmailTemplatesModule`, `ReceivablesModule`, `CustomersModule`, `InvoicesModule`, `OrganizationsModule`, and `forwardRef(() => RemindersModule)` (the reminders plan imports `NotificationsModule` back, to call `EmailService` — a standard NestJS circular-module cycle, same pattern as `ReceivablesModule`/`DisputesModule` in `2026-08-03-dispute-management.md`).

**Tech Stack:** `resend` npm package (official Resend Node SDK), `@nestjs/bullmq` + `bullmq` (already installed by the Webhook Matching Engine plan, reused here for a second queue on the same Redis instance), Jest + testcontainers (`GenericContainer('redis:7')`) for the integration test, following `2026-08-03-webhook-matching-engine.md` Task 10's exact pattern.

## Global Constraints

- `EmailProviderAdapter` (`IEmailProviderAdapter` / `EMAIL_PROVIDER_ADAPTER`) is the ONLY seam to the Resend SDK — `EmailService` and `EmailQueueProcessor` never `import { Resend } from 'resend'` directly (spec section 1).
- One real implementation only: `ResendEmailAdapter`. No speculative SES/SendGrid adapter built ahead of need (spec section 1, explicit YAGNI callout in the spec itself).
- `EmailService.sendReminderEmail` enqueues into `email-queue`; it never calls `adapter.send()` synchronously inside the request/caller path (spec section 1, step 2).
- `email-queue` job options: `attempts: 3, backoff: { type: 'exponential', delay: 5000 }` (spec section 2).
- `ReminderExecution.status = SENT` is set ONLY after `adapter.send()` returns a `providerMessageId` — never at enqueue time (spec section 2).
- After the 3rd failed attempt, BullMQ moves the job to its `failed` state (the Dead Letter Queue equivalent here — no separate DLQ infrastructure is introduced) AND `ReminderExecution.status = FAILED` is written by the processor's failure handler (spec section 2).
- `FAILED` (technical send error) is a different status from `SKIPPED` (business decision — already paid/disputed, owned by the Reminder Automation plan) — this plan only ever writes `SENT` or `FAILED`, never `SKIPPED` (spec section 2).
- Naming is fixed by the task brief and must not be renamed: module `apps/backend/src/modules/notifications/`, `EMAIL_PROVIDER_ADAPTER` / `IEmailProviderAdapter`, `ResendEmailAdapter`, `EmailService`, queue name constant `EMAIL_QUEUE = 'email-queue'`, worker class `EmailQueueProcessor`.
- Naming/layering rules from `2026-08-03-project-scaffolding-architecture-design.md` still apply (kebab-case files, PascalCase classes, no float money — not applicable here since this module has no money fields).

---

## File Structure

```
apps/backend/
  package.json                                              -- MODIFY: add `resend` dependency
  src/
    modules/
      notifications/
        application/
          email-provider-adapter.port.ts
          email.service.ts
          email.service.spec.ts
        infrastructure/
          resend-email.adapter.ts
          resend-email.adapter.spec.ts
          email-queue.constants.ts
          email-queue.processor.ts
          email-queue.processor.spec.ts
          resend-auth-email-sender.adapter.ts
        notifications.module.ts
      auth/
        auth.module.ts                                      -- MODIFY: rebind AUTH_EMAIL_SENDER to ResendAuthEmailSenderAdapter
    app.module.ts                                            -- MODIFY: register NotificationsModule
  test/
    email-queue.integration.spec.ts
```

---

### Task 1: `resend` dependency + `EMAIL_QUEUE` registration

**Files:**
- Modify: `apps/backend/package.json`
- Create: `apps/backend/src/modules/notifications/infrastructure/email-queue.constants.ts`
- Create: `apps/backend/src/modules/notifications/notifications.module.ts` (skeleton — extended by later tasks)
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `BullModule.forRoot` already registered globally by the Webhook Matching Engine plan's `apps/backend/src/config/bullmq.config.ts` (Task 4 of that plan) — this task only adds a second `registerQueue` call, it does not touch `BullModule.forRoot`
- Produces: `EMAIL_QUEUE` constant and an empty `NotificationsModule` importable by `AppModule`, used by every later task in this plan

- [ ] **Step 1: Install `resend`**

Run: `pnpm --filter @casso-ledger/backend add resend`

- [ ] **Step 2: Create `apps/backend/src/modules/notifications/infrastructure/email-queue.constants.ts`**

```typescript
export const EMAIL_QUEUE = 'email-queue';
```

- [ ] **Step 3: Create `apps/backend/src/modules/notifications/notifications.module.ts`** (skeleton)

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EMAIL_QUEUE } from './infrastructure/email-queue.constants';

@Module({
  imports: [BullModule.registerQueue({ name: EMAIL_QUEUE })],
})
export class NotificationsModule {}
```

- [ ] **Step 4: Register `NotificationsModule` in `apps/backend/src/app.module.ts`**

Add `NotificationsModule` to the `imports` array (same pattern as every other module registration in the Domain Core / Webhook plans), with `import { NotificationsModule } from './modules/notifications/notifications.module';`.

- [ ] **Step 5: Verify app still boots**

Run: `docker compose up -d redis && pnpm --filter @casso-ledger/backend test:e2e`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/package.json apps/backend/src/modules/notifications apps/backend/src/app.module.ts
git commit -m "chore: scaffold notifications module and register email-queue"
```

---

### Task 2: `EmailProviderAdapter` port + `ResendEmailAdapter`

**Files:**
- Create: `apps/backend/src/modules/notifications/application/email-provider-adapter.port.ts`
- Create: `apps/backend/src/modules/notifications/infrastructure/resend-email.adapter.ts`
- Test: `apps/backend/src/modules/notifications/infrastructure/resend-email.adapter.spec.ts`

**Interfaces:**
- Consumes: `resend` npm package (Task 1)
- Produces: `IEmailProviderAdapter.send(to, subject, html, metadata): Promise<{ providerMessageId }>`, used by Task 5 (`EmailQueueProcessor`) and Task 7 (`ResendAuthEmailSenderAdapter`)

- [ ] **Step 1: Create `apps/backend/src/modules/notifications/application/email-provider-adapter.port.ts`**

```typescript
export interface EmailSendResult {
  providerMessageId: string;
}

export interface IEmailProviderAdapter {
  send(
    to: string,
    subject: string,
    html: string,
    metadata: Record<string, string>,
  ): Promise<EmailSendResult>;
}

export const EMAIL_PROVIDER_ADAPTER = Symbol('EMAIL_PROVIDER_ADAPTER');
```

- [ ] **Step 2: Write failing test for `ResendEmailAdapter`**

Create `apps/backend/src/modules/notifications/infrastructure/resend-email.adapter.spec.ts`:

```typescript
const sendMock = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

import { ResendEmailAdapter } from './resend-email.adapter';

describe('ResendEmailAdapter', () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.RESEND_API_KEY = 'test-api-key';
    process.env.RESEND_FROM_ADDRESS = 'no-reply@casso-ledger.vn';
  });

  it('returns providerMessageId when Resend responds with data.id', async () => {
    sendMock.mockResolvedValue({ data: { id: 'resend-msg-1' }, error: null });

    const adapter = new ResendEmailAdapter();
    const result = await adapter.send(
      'customer@example.com',
      'Payment reminder',
      '<p>You have an invoice due</p>',
      { reminderExecutionId: 'exec-1' },
    );

    expect(result).toEqual({ providerMessageId: 'resend-msg-1' });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'no-reply@casso-ledger.vn',
        to: 'customer@example.com',
        subject: 'Payment reminder',
        html: '<p>You have an invoice due</p>',
      }),
    );
  });

  it('throws when Resend responds with an error', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'invalid API key' } });

    const adapter = new ResendEmailAdapter();
    await expect(
      adapter.send('customer@example.com', 'subject', '<p>html</p>', {}),
    ).rejects.toThrow('Resend send failed: invalid API key');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test resend-email.adapter.spec.ts`
Expected: FAIL — Cannot find module './resend-email.adapter'

- [ ] **Step 4: Create `apps/backend/src/modules/notifications/infrastructure/resend-email.adapter.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';
import { EmailSendResult, IEmailProviderAdapter } from '../application/email-provider-adapter.port';

@Injectable()
export class ResendEmailAdapter implements IEmailProviderAdapter {
  private readonly client: Resend;
  private readonly fromAddress: string;

  constructor() {
    this.client = new Resend(process.env.RESEND_API_KEY ?? '');
    this.fromAddress = process.env.RESEND_FROM_ADDRESS ?? 'no-reply@casso-ledger.vn';
  }

  async send(
    to: string,
    subject: string,
    html: string,
    metadata: Record<string, string>,
  ): Promise<EmailSendResult> {
    const result = await this.client.emails.send({
      from: this.fromAddress,
      to,
      subject,
      html,
      tags: Object.entries(metadata).map(([name, value]) => ({ name, value })),
    });

    if (result.error || !result.data?.id) {
      throw new Error(`Resend send failed: ${result.error?.message ?? 'unknown error'}`);
    }

    return { providerMessageId: result.data.id };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test resend-email.adapter.spec.ts`
Expected: both tests PASS

- [ ] **Step 6: Add `RESEND_API_KEY`/`RESEND_FROM_ADDRESS` to `apps/backend/.env`**

```
RESEND_API_KEY=re_dev_placeholder
RESEND_FROM_ADDRESS=no-reply@casso-ledger.vn
```

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/notifications/application/email-provider-adapter.port.ts apps/backend/src/modules/notifications/infrastructure/resend-email.adapter.ts apps/backend/src/modules/notifications/infrastructure/resend-email.adapter.spec.ts apps/backend/.env
git commit -m "feat: add IEmailProviderAdapter port and ResendEmailAdapter implementation"
```

---

### Task 3: Use the real `IEmailTemplateRepository` and `IReminderExecutionRepository` (no local placeholders)

**Files:**
- Modify: none — the two ports remain owned by their source plans; this task only verifies the shared contracts before importing them.

**Interfaces:**
- Consumes: `IEmailTemplateRepository`/`EMAIL_TEMPLATE_REPOSITORY` from `2026-08-03-email-template-management.md` (`apps/backend/src/modules/email-templates/application/email-template-repository.port.ts`); `IReminderExecutionRepository`/`REMINDER_EXECUTION_REPOSITORY` from `2026-08-03-reminder-automation.md` (`apps/backend/src/modules/reminders/application/reminder-execution-repository.port.ts`)
- Produces: nothing new — this task exists only to confirm the two real ports this plan depends on already have what `EmailService` (Task 4) and `EmailQueueProcessor` (Task 5) need, before wiring imports to them in place of the deleted local placeholders

An earlier version of this plan defined its own throwaway `IEmailTemplateRepository`/`IReminderExecutionRepository` ports locally, shaped to a guess at what those two not-yet-written plans would look like. Both plans have since been written for real. Using the real ports instead means: `EmailService` gets actual Handlebars-rendered content instead of a hand-wavy `renderForReceivable` call, and `ReminderExecution` rows are the same rows `2026-08-03-reminder-automation.md`'s `ReminderSenderService` creates — not a parallel, disconnected concept.

- [ ] **Step 1: Confirm the real `IEmailTemplateRepository`**

`2026-08-03-email-template-management.md` Task 2 defines (`apps/backend/src/modules/email-templates/application/email-template-repository.port.ts`):

```typescript
import { EntityManager } from 'typeorm';

export interface IEmailTemplateRepository {
  findById(id: string): Promise<EmailTemplate | null>;
  findAllForOrganization(): Promise<EmailTemplate[]>;
  save(template: EmailTemplate, manager?: EntityManager): Promise<void>;
  delete(id: string): Promise<void>;
  saveMany(templates: EmailTemplate[], manager: EntityManager): Promise<void>;
}

export const EMAIL_TEMPLATE_REPOSITORY = Symbol('EMAIL_TEMPLATE_REPOSITORY');
```

There is no `renderForReceivable` method — rendering is a separate pure step (`RenderEmailTemplateUseCase.render(template, data)`, same plan's Task 3). `EmailService` (Task 4) calls `findById` to load the template, builds the 7-field render data itself from `Receivable`/`Customer`/`Organization`, then calls `RenderEmailTemplateUseCase.render()`.

- [ ] **Step 2: Confirm the real `IReminderExecutionRepository`**

`2026-08-03-reminder-automation.md` Task 3 defines (`apps/backend/src/modules/reminders/application/reminder-execution-repository.port.ts`):

```typescript
export interface IReminderExecutionRepository {
  findLatestSent(receivableId: string): Promise<ReminderExecution | null>;
  findByKey(receivableId: string, reminderRuleId: string | null, executionDate: Date): Promise<ReminderExecution | null>;
  findById(id: string): Promise<ReminderExecution | null>;
  /** Returns false when another worker already claimed the unique key. */
  insertIfAbsent(execution: ReminderExecution): Promise<boolean>;
  save(execution: ReminderExecution, manager?: EntityManager): Promise<void>;
  updateSendResult(
    id: string,
    status: 'SENT' | 'FAILED',
    providerMessageId: string | null,
  ): Promise<void>;
}

export const REMINDER_EXECUTION_REPOSITORY = Symbol('REMINDER_EXECUTION_REPOSITORY');
```

`updateSendResult`'s signature is exactly what `EmailQueueProcessor` (Task 5) already calls — no code change needed there beyond the import path (Task 5, Step 3 below).

- [ ] **Step 3: Commit**

Nothing to commit for this task — it is a verification/documentation step confirming the cross-plan contract before Tasks 4-6 import from it. If either real port turns out NOT to match the shape above (e.g., a later edit to those plans renamed a method), stop and reconcile the mismatch before proceeding to Task 4.

---

### Task 4: `EmailService` — build render data from real entities, render, enqueue (no synchronous send)

**Files:**
- Create: `apps/backend/src/modules/notifications/application/email.service.ts`
- Test: `apps/backend/src/modules/notifications/application/email.service.spec.ts`
- Modify: `apps/backend/src/modules/notifications/notifications.module.ts` (imports for the repositories below — full wiring happens in Task 6, but note it here since Task 4's test mocks these same dependencies)

**Interfaces:**
- Consumes: `IEmailTemplateRepository`/`EMAIL_TEMPLATE_REPOSITORY` (`2026-08-03-email-template-management.md`), `RenderEmailTemplateUseCase` (same plan), `IReceivableRepository`/`RECEIVABLE_REPOSITORY` and `IInvoiceRepository`/`INVOICE_REPOSITORY` (`2026-08-03-project-scaffolding-and-domain-core.md`, the latter's `findByReceivableId` added by `2026-08-03-webhook-matching-engine.md` Task 8 Step 5), `ICustomerRepository`/`CUSTOMER_REPOSITORY` (Domain Core plan), `IOrganizationRepository`/`ORGANIZATION_REPOSITORY` (`2026-08-03-multi-tenancy-rbac.md`), `email-queue` BullMQ queue (Task 1), `TenantContextService` (Multi-tenancy plan)
- Produces: `EmailService.sendReminderEmail(input): Promise<void>`, used by `2026-08-03-reminder-automation.md`'s `ReminderSenderService` as its sole entry point into this module

`EmailService.sendReminderEmail` uses the canonical `{ receivableId, templateId, reminderExecutionId }` input. The worker must know which `ReminderExecution` row to update after the async send completes; there is no way to derive that id from `receivableId`/`templateId` alone because a receivable can have multiple executions over time. Building the actual render data (customer name/email, invoice number, amounts, due date, days overdue, organization name) from the real domain entities — rather than a single opaque `renderForReceivable()` call — keeps the implementation aligned with the Email Template contract.

- [ ] **Step 1: Write failing test for `EmailService.sendReminderEmail`**

Create `apps/backend/src/modules/notifications/application/email.service.spec.ts`:

```typescript
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { EmailService } from './email.service';
import { Receivable } from '../../receivables/domain/receivable';
import { Customer } from '../../customers/domain/customer';
import { Organization } from '../../organizations/domain/organization';
import { EmailTemplate } from '../../email-templates/domain/email-template';

describe('EmailService', () => {
  function buildDeps() {
    const receivable = new Receivable({
      id: 'rec-1',
      organizationId: 'org-1',
      customerId: 'cust-1',
      invoiceId: 'inv-1',
      originalAmount: 30_000_000,
      paidAmount: 10_000_000,
      dueDate: new Date('2026-08-01'),
      status: ReceivableStatus.PARTIALLY_PAID,
      salesRepresentativeId: 'user-1',
      createdAt: new Date('2026-07-01'),
      closedAt: null,
    });
    const customer = new Customer({
      id: 'cust-1',
      organizationId: 'org-1',
      name: 'Company B',
      taxCode: '0312345678',
      email: 'ap@congtyb.vn',
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 0,
      priority: 1,
      createdAt: new Date('2026-01-01'),
    });
    const organization = new Organization({ id: 'org-1', name: 'Casso Ledger', createdAt: new Date('2026-01-01') });
    const template = new EmailTemplate({
      id: 'tpl-1',
      organizationId: 'org-1',
      name: 'Overdue reminder',
      subject: 'Invoice {{invoiceNumber}} — {{organizationName}}',
      bodyHtml: '<p>{{customerName}}, outstanding {{remainingAmount}}, {{daysOverdue}} days overdue</p>',
      reminderStage: null,
      isDefault: false,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    });

    return {
      templateRepo: { findById: jest.fn().mockResolvedValue(template) },
      receivableRepo: { findById: jest.fn().mockResolvedValue(receivable) },
      customerRepo: { findById: jest.fn().mockResolvedValue(customer) },
      organizationRepo: { findById: jest.fn().mockResolvedValue(organization) },
      invoiceRepo: { findByReceivableId: jest.fn().mockResolvedValue({ invoiceNumber: 'INV-2026-0012' }) },
      queue: { add: jest.fn() },
      tenantContext: { getOrganizationId: jest.fn().mockReturnValue('org-1') },
    };
  }

  it('builds render data from the real Receivable/Customer/Organization/Invoice, renders, and enqueues', async () => {
    const deps = buildDeps();
    const service = new EmailService(
      deps.templateRepo as any,
      deps.receivableRepo as any,
      deps.customerRepo as any,
      deps.organizationRepo as any,
      deps.invoiceRepo as any,
      deps.queue as any,
      deps.tenantContext as any,
    );

    await service.sendReminderEmail({
      receivableId: 'rec-1',
      templateId: 'tpl-1',
      reminderExecutionId: 'exec-1',
    });

    expect(deps.queue.add).toHaveBeenCalledWith(
      'send-reminder-email',
      expect.objectContaining({
        reminderExecutionId: 'exec-1',
        organizationId: 'org-1',
        to: 'ap@congtyb.vn',
        subject: 'Invoice INV-2026-0012 — Casso Ledger',
        html: expect.stringContaining('Company B, outstanding 20000000'),
      }),
      { jobId: 'exec-1', attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test email.service.spec.ts`
Expected: FAIL — Cannot find module './email.service'

- [ ] **Step 3: Create `apps/backend/src/modules/notifications/application/email.service.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  EMAIL_TEMPLATE_REPOSITORY,
  IEmailTemplateRepository,
} from '../../email-templates/application/email-template-repository.port';
import { RenderEmailTemplateUseCase } from '../../email-templates/application/render-email-template.usecase';
import {
  RECEIVABLE_REPOSITORY,
  IReceivableRepository,
} from '../../receivables/application/receivable-repository.port';
import { CUSTOMER_REPOSITORY, ICustomerRepository } from '../../customers/application/customer-repository.port';
import {
  ORGANIZATION_REPOSITORY,
  IOrganizationRepository,
} from '../../organizations/application/organization-repository.port';
import { INVOICE_REPOSITORY, IInvoiceRepository } from '../../invoices/application/invoice-repository.port';
import { EMAIL_QUEUE } from '../infrastructure/email-queue.constants';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

export interface SendReminderEmailInput {
  receivableId: string;
  templateId: string;
  reminderExecutionId: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class EmailService {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY) private readonly templateRepo: IEmailTemplateRepository,
    @Inject(RECEIVABLE_REPOSITORY) private readonly receivableRepo: IReceivableRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customerRepo: ICustomerRepository,
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizationRepo: IOrganizationRepository,
    @Inject(INVOICE_REPOSITORY) private readonly invoiceRepo: IInvoiceRepository,
    @InjectQueue(EMAIL_QUEUE) private readonly queue: Queue,
    private readonly tenantContext: TenantContextService,
  ) {}

  async sendReminderEmail(input: SendReminderEmailInput): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();

    const template = await this.templateRepo.findById(input.templateId);
    if (!template) {
      throw new Error(`EmailTemplate ${input.templateId} not found`);
    }

    const receivable = await this.receivableRepo.findById(input.receivableId);
    if (!receivable) {
      throw new Error(`Receivable ${input.receivableId} not found`);
    }

    const customer = await this.customerRepo.findById(receivable.customerId);
    if (!customer) {
      throw new Error(`Customer ${receivable.customerId} not found`);
    }

    const organization = await this.organizationRepo.findById(organizationId);
    const invoice = await this.invoiceRepo.findByReceivableId(input.receivableId);

    const daysOverdue = Math.max(
      0,
      Math.floor((Date.now() - receivable.dueDate.getTime()) / MS_PER_DAY),
    );

    const rendered = new RenderEmailTemplateUseCase().render(template, {
      customerName: customer.name,
      invoiceNumber: invoice?.invoiceNumber ?? '',
      originalAmount: receivable.originalAmount,
      remainingAmount: receivable.remainingAmount,
      dueDate: receivable.dueDate.toISOString().slice(0, 10),
      daysOverdue,
      organizationName: organization?.name ?? '',
    });

    await this.queue.add(
      'send-reminder-email',
      {
        reminderExecutionId: input.reminderExecutionId,
        receivableId: input.receivableId,
        organizationId,
        to: customer.email,
        subject: rendered.subject,
        html: rendered.bodyHtml,
      },
      {
        jobId: input.reminderExecutionId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );
  }
}
```

`jobId: input.reminderExecutionId` gives BullMQ its own dedup layer — re-calling `sendReminderEmail` for the same execution is a no-op add, matching the idempotency-by-jobId pattern already established in the Webhook plan's `WebhooksController`. `RenderEmailTemplateUseCase` has no constructor dependencies (Handlebars is stateless), so instantiating it directly here is equivalent to injecting it — either is fine; injecting it via Nest DI (add it to the constructor and to `NotificationsModule`'s `providers` in Task 6) is slightly more testable and is what Task 6 registers.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test email.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/notifications/application/email.service.ts apps/backend/src/modules/notifications/application/email.service.spec.ts
git commit -m "feat: add EmailService building render data from real Receivable/Customer/Organization/EmailTemplate"
```

---

### Task 5: `EmailQueueProcessor` — worker, send, and status update

**Files:**
- Create: `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.ts`
- Test: `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.spec.ts`

**Interfaces:**
- Consumes: `IEmailProviderAdapter` (Task 2), the real `IReminderExecutionRepository`/`REMINDER_EXECUTION_REPOSITORY` from `2026-08-03-reminder-automation.md` (Task 3), `TenantContextService` (Multi-tenancy plan)
- Produces: BullMQ worker for `EMAIL_QUEUE` that calls `adapter.send()`, sets `ReminderExecution.status = SENT` with `providerMessageId` on success, and sets `status = FAILED` once the job's final attempt is exhausted

- [ ] **Step 1: Write failing test for successful processing**

Create `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.spec.ts`:

```typescript
import { EmailQueueProcessor } from './email-queue.processor';

function buildJob(overrides: Partial<{ attemptsMade: number; attempts: number }> = {}) {
  return {
    id: 'exec-1',
    data: {
      reminderExecutionId: 'exec-1',
      receivableId: 'rec-1',
      organizationId: 'org-1',
      to: 'customer@example.com',
      subject: 'Payment reminder',
      html: '<p>html</p>',
    },
    attemptsMade: overrides.attemptsMade ?? 1,
    opts: { attempts: overrides.attempts ?? 3 },
  } as any;
}

describe('EmailQueueProcessor', () => {
  it('calls adapter.send() and marks the execution SENT with providerMessageId', async () => {
    const emailProvider = { send: jest.fn().mockResolvedValue({ providerMessageId: 'resend-msg-1' }) };
    const reminderExecutionRepo = { updateSendResult: jest.fn() };
    const tenantContext = { run: jest.fn((_user: unknown, cb: () => Promise<void>) => cb()) };
    const eventEmitter = { emit: jest.fn() };

    const processor = new EmailQueueProcessor(
      emailProvider as any,
      reminderExecutionRepo as any,
      tenantContext as any,
      eventEmitter as any,
    );

    await processor.process(buildJob());

    expect(emailProvider.send).toHaveBeenCalledWith(
      'customer@example.com',
      'Payment reminder',
      '<p>html</p>',
      { reminderExecutionId: 'exec-1' },
    );
    expect(reminderExecutionRepo.updateSendResult).toHaveBeenCalledWith(
      'exec-1',
      'SENT',
      'resend-msg-1',
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith('reminder.sent', {
      reminderExecutionId: 'exec-1',
      receivableId: 'rec-1',
      organizationId: 'org-1',
    });
  });

  it('marks the execution FAILED only when the job has exhausted all attempts', async () => {
    const emailProvider = { send: jest.fn() };
    const reminderExecutionRepo = { updateSendResult: jest.fn() };
    const tenantContext = { run: jest.fn((_user: unknown, cb: () => Promise<void>) => cb()) };
    const eventEmitter = { emit: jest.fn() };

    const processor = new EmailQueueProcessor(
      emailProvider as any,
      reminderExecutionRepo as any,
      tenantContext as any,
      eventEmitter as any,
    );

    await processor.onFailed(buildJob({ attemptsMade: 2, attempts: 3 }));
    expect(reminderExecutionRepo.updateSendResult).not.toHaveBeenCalled();

    await processor.onFailed(buildJob({ attemptsMade: 3, attempts: 3 }));
    expect(reminderExecutionRepo.updateSendResult).toHaveBeenCalledWith('exec-1', 'FAILED', null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test email-queue.processor.spec.ts`
Expected: FAIL — Cannot find module './email-queue.processor'

- [ ] **Step 3: Create `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.ts`**

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EMAIL_QUEUE } from './email-queue.constants';
import {
  EMAIL_PROVIDER_ADAPTER,
  IEmailProviderAdapter,
} from '../application/email-provider-adapter.port';
import {
  IReminderExecutionRepository,
  REMINDER_EXECUTION_REPOSITORY,
} from '../../reminders/application/reminder-execution-repository.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface EmailJobData {
  reminderExecutionId: string;
  receivableId: string;
  organizationId: string;
  to: string;
  subject: string;
  html: string;
}

@Injectable()
@Processor(EMAIL_QUEUE)
export class EmailQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailQueueProcessor.name);

  constructor(
    @Inject(EMAIL_PROVIDER_ADAPTER) private readonly emailProvider: IEmailProviderAdapter,
    @Inject(REMINDER_EXECUTION_REPOSITORY)
    private readonly reminderExecutionRepo: IReminderExecutionRepository,
    private readonly tenantContext: TenantContextService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<void> {
    const { reminderExecutionId, receivableId, organizationId, to, subject, html } = job.data;

    await this.tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      async () => {
        const result = await this.emailProvider.send(to, subject, html, { reminderExecutionId });
        await this.reminderExecutionRepo.updateSendResult(
          reminderExecutionId,
          'SENT',
          result.providerMessageId,
        );
        this.eventEmitter.emit('reminder.sent', { reminderExecutionId, receivableId, organizationId });
      },
    );
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<EmailJobData>): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      return; // more retries scheduled — not a final failure yet
    }

    await this.reminderExecutionRepo.updateSendResult(job.data.reminderExecutionId, 'FAILED', null);
    this.eventEmitter.emit('reminder.failed', {
      reminderExecutionId: job.data.reminderExecutionId,
      receivableId: job.data.receivableId,
      organizationId: job.data.organizationId,
    });
    this.logger.error(
      `Email job ${job.id} failed permanently after ${job.attemptsMade} attempts (reminderExecutionId=${job.data.reminderExecutionId})`,
    );
  }
}
```

Retry/backoff (3 attempts, exponential 5s) is configured at enqueue time in Task 4's `EmailService.sendReminderEmail` — after the final attempt fails, BullMQ moves the job to its `failed` state (this codebase's Dead Letter Queue equivalent, same pattern the Webhook plan documents for `webhook-processing`), and `onFailed` above is BullMQ's `@OnWorkerEvent('failed')` hook firing once per failed attempt; it only writes `FAILED` once `attemptsMade` has reached the configured ceiling, so a mid-retry failure does not prematurely mark the execution as failed.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test email-queue.processor.spec.ts`
Expected: both tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/notifications/infrastructure/email-queue.processor.ts apps/backend/src/modules/notifications/infrastructure/email-queue.processor.spec.ts
git commit -m "feat: add EmailQueueProcessor worker with SENT/FAILED status updates"
```

---

### Task 6: Wire `NotificationsModule` fully

**Files:**
- Modify: `apps/backend/src/modules/notifications/notifications.module.ts`

**Interfaces:**
- Consumes: `ResendEmailAdapter` (Task 2), `EmailService` (Task 4), `EmailQueueProcessor` (Task 5), `EmailTemplatesModule` (`2026-08-03-email-template-management.md`), `ReceivablesModule`/`CustomersModule`/`InvoicesModule` (Domain Core plan), `OrganizationsModule` (Multi-tenancy plan), `RemindersModule` (`2026-08-03-reminder-automation.md`, imported via `forwardRef`)
- Produces: fully wired module — binds `EMAIL_PROVIDER_ADAPTER` to `ResendEmailAdapter`, exports `EmailService` and `EMAIL_PROVIDER_ADAPTER` for Task 7's auth rebind to consume, and re-exports enough for `RemindersModule` to close its side of the `forwardRef` cycle

- [ ] **Step 1: Replace `apps/backend/src/modules/notifications/notifications.module.ts` with the full module**

```typescript
import { forwardRef, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EMAIL_QUEUE } from './infrastructure/email-queue.constants';
import { EMAIL_PROVIDER_ADAPTER } from './application/email-provider-adapter.port';
import { ResendEmailAdapter } from './infrastructure/resend-email.adapter';
import { EmailService } from './application/email.service';
import { EmailQueueProcessor } from './infrastructure/email-queue.processor';
import { EmailTemplatesModule } from '../email-templates/email-templates.module';
import { RenderEmailTemplateUseCase } from '../email-templates/application/render-email-template.usecase';
import { ReceivablesModule } from '../receivables/receivables.module';
import { CustomersModule } from '../customers/customers.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { RemindersModule } from '../reminders/reminders.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: EMAIL_QUEUE }),
    EmailTemplatesModule,
    ReceivablesModule,
    CustomersModule,
    InvoicesModule,
    OrganizationsModule,
    forwardRef(() => RemindersModule),
  ],
  providers: [
    { provide: EMAIL_PROVIDER_ADAPTER, useClass: ResendEmailAdapter },
    RenderEmailTemplateUseCase,
    EmailService,
    EmailQueueProcessor,
  ],
  exports: [EMAIL_PROVIDER_ADAPTER, EmailService],
})
export class NotificationsModule {}
```

`EMAIL_TEMPLATE_REPOSITORY` (from `EmailTemplatesModule`) and `REMINDER_EXECUTION_REPOSITORY` (from `RemindersModule`) are consumed via each module's own export, not rebound here — `NotificationsModule` only imports the modules that already provide them (Nest resolves `@Inject(EMAIL_TEMPLATE_REPOSITORY)` in `EmailService` against `EmailTemplatesModule`'s binding because `EmailTemplatesModule` is in `imports` and exports that token).

- [ ] **Step 2: Add `forwardRef(() => NotificationsModule)` on the `RemindersModule` side**

This half of the cycle is described in `2026-08-03-reminder-automation.md` Task 6, Step 5 — confirm that plan's `RemindersModule` imports `forwardRef(() => NotificationsModule)` so `ReminderSenderService` can inject `EmailService`. Both sides must use `forwardRef` (only one side is not sufficient — NestJS's circular-dependency resolution requires it on both ends of the cycle).

- [ ] **Step 3: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 4: Run the full application boot**

Run: `docker compose up -d postgres redis && pnpm --filter @casso-ledger/backend test:e2e`
Expected: PASS — this is the first point where the `NotificationsModule` ↔ `RemindersModule` `forwardRef` cycle actually gets exercised at boot time; if Nest throws a circular-dependency error here, double check BOTH modules use `forwardRef()` (not just one) and that neither module lists the other in `exports` unnecessarily (only export what a THIRD module needs, not what the two cyclic modules exchange with each other).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/notifications/notifications.module.ts
git commit -m "feat: wire ResendEmailAdapter, EmailService, and EmailQueueProcessor into NotificationsModule with real EmailTemplate/Receivable/Reminder dependencies"
```

---

### Task 7: Rebind `AUTH_EMAIL_SENDER` to a real Resend-backed adapter

**Files:**
- Create: `apps/backend/src/modules/notifications/infrastructure/resend-auth-email-sender.adapter.ts`
- Modify: `apps/backend/src/modules/auth/auth.module.ts`
- Test: `apps/backend/src/modules/notifications/infrastructure/resend-auth-email-sender.adapter.spec.ts`

**Interfaces:**
- Consumes: `IEmailProviderAdapter` (Task 2/6), `IAuthEmailSender` (Authentication & Onboarding plan, `apps/backend/src/modules/auth/application/auth-email-sender.port.ts`)
- Produces: `ResendAuthEmailSenderAdapter implements IAuthEmailSender`, rebound onto `AUTH_EMAIL_SENDER` in `auth.module.ts` in place of `ConsoleEmailSenderAdapter` — no auth use case changes, exactly as that plan's Task 3 Step 8 comment promised

- [ ] **Step 1: Write failing test for `ResendAuthEmailSenderAdapter`**

Create `apps/backend/src/modules/notifications/infrastructure/resend-auth-email-sender.adapter.spec.ts`:

```typescript
import { ResendAuthEmailSenderAdapter } from './resend-auth-email-sender.adapter';

describe('ResendAuthEmailSenderAdapter', () => {
  it('sends a verification email through IEmailProviderAdapter', async () => {
    const emailProvider = { send: jest.fn().mockResolvedValue({ providerMessageId: 'msg-1' }) };
    const adapter = new ResendAuthEmailSenderAdapter(emailProvider as any);

    await adapter.sendVerificationEmail('user@example.com', 'https://app.casso.vn/verify?token=abc');

    expect(emailProvider.send).toHaveBeenCalledWith(
      'user@example.com',
      expect.any(String),
      expect.stringContaining('https://app.casso.vn/verify?token=abc'),
      { emailType: 'AUTH_VERIFICATION' },
    );
  });

  it('sends a password reset email through IEmailProviderAdapter', async () => {
    const emailProvider = { send: jest.fn().mockResolvedValue({ providerMessageId: 'msg-2' }) };
    const adapter = new ResendAuthEmailSenderAdapter(emailProvider as any);

    await adapter.sendPasswordResetEmail('user@example.com', 'https://app.casso.vn/reset?token=xyz');

    expect(emailProvider.send).toHaveBeenCalledWith(
      'user@example.com',
      expect.any(String),
      expect.stringContaining('https://app.casso.vn/reset?token=xyz'),
      { emailType: 'AUTH_PASSWORD_RESET' },
    );
  });

  it('sends an invite email through IEmailProviderAdapter', async () => {
    const emailProvider = { send: jest.fn().mockResolvedValue({ providerMessageId: 'msg-3' }) };
    const adapter = new ResendAuthEmailSenderAdapter(emailProvider as any);

    await adapter.sendInviteEmail('user@example.com', 'https://app.casso.vn/accept?token=inv', 'Company B');

    expect(emailProvider.send).toHaveBeenCalledWith(
      'user@example.com',
      expect.stringContaining('Company B'),
      expect.stringContaining('https://app.casso.vn/accept?token=inv'),
      { emailType: 'AUTH_INVITE' },
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test resend-auth-email-sender.adapter.spec.ts`
Expected: FAIL — Cannot find module './resend-auth-email-sender.adapter'

- [ ] **Step 3: Create `apps/backend/src/modules/notifications/infrastructure/resend-auth-email-sender.adapter.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { IAuthEmailSender } from '../../auth/application/auth-email-sender.port';
import {
  EMAIL_PROVIDER_ADAPTER,
  IEmailProviderAdapter,
} from '../application/email-provider-adapter.port';

@Injectable()
export class ResendAuthEmailSenderAdapter implements IAuthEmailSender {
  constructor(
    @Inject(EMAIL_PROVIDER_ADAPTER) private readonly emailProvider: IEmailProviderAdapter,
  ) {}

  async sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
    await this.emailProvider.send(
      to,
      'Verify your email address',
      `<p>Click the following link to verify your email: <a href="${verifyUrl}">${verifyUrl}</a></p>`,
      { emailType: 'AUTH_VERIFICATION' },
    );
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    await this.emailProvider.send(
      to,
      'Reset your password',
      `<p>Click the following link to reset your password: <a href="${resetUrl}">${resetUrl}</a></p>`,
      { emailType: 'AUTH_PASSWORD_RESET' },
    );
  }

  async sendInviteEmail(to: string, acceptUrl: string, organizationName: string): Promise<void> {
    await this.emailProvider.send(
      to,
      `Invitation to join ${organizationName}`,
      `<p>You are invited to join the organization ${organizationName}. Click the following link to accept: <a href="${acceptUrl}">${acceptUrl}</a></p>`,
      { emailType: 'AUTH_INVITE' },
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test resend-auth-email-sender.adapter.spec.ts`
Expected: all 3 tests PASS

- [ ] **Step 5: Rebind `AUTH_EMAIL_SENDER` in `apps/backend/src/modules/auth/auth.module.ts`**

Modify `apps/backend/src/modules/auth/auth.module.ts`: remove the `ConsoleEmailSenderAdapter` import and its provider entry, import `NotificationsModule` and `ResendAuthEmailSenderAdapter` instead, and rebind the token:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailVerificationTokenOrmEntity } from './infrastructure/email-verification-token.orm-entity';
import { PasswordResetTokenOrmEntity } from './infrastructure/password-reset-token.orm-entity';
import { MembershipInviteOrmEntity } from './infrastructure/membership-invite.orm-entity';
import { RefreshTokenOrmEntity } from './infrastructure/refresh-token.orm-entity';
import { TypeOrmEmailVerificationTokenRepository } from './infrastructure/typeorm-email-verification-token.repository';
import { TypeOrmPasswordResetTokenRepository } from './infrastructure/typeorm-password-reset-token.repository';
import { TypeOrmMembershipInviteRepository } from './infrastructure/typeorm-membership-invite.repository';
import { TypeOrmRefreshTokenRepository } from './infrastructure/typeorm-refresh-token.repository';
import { EMAIL_VERIFICATION_TOKEN_REPOSITORY } from './application/email-verification-token-repository.port';
import { PASSWORD_RESET_TOKEN_REPOSITORY } from './application/password-reset-token-repository.port';
import { MEMBERSHIP_INVITE_REPOSITORY } from './application/membership-invite-repository.port';
import { REFRESH_TOKEN_REPOSITORY } from './application/refresh-token-repository.port';
import { AUTH_EMAIL_SENDER } from './application/auth-email-sender.port';
import { UsersModule } from '../users/users.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ResendAuthEmailSenderAdapter } from '../notifications/infrastructure/resend-auth-email-sender.adapter';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmailVerificationTokenOrmEntity,
      PasswordResetTokenOrmEntity,
      MembershipInviteOrmEntity,
      RefreshTokenOrmEntity,
    ]),
    UsersModule,
    OrganizationsModule,
    NotificationsModule,
  ],
  providers: [
    { provide: EMAIL_VERIFICATION_TOKEN_REPOSITORY, useClass: TypeOrmEmailVerificationTokenRepository },
    { provide: PASSWORD_RESET_TOKEN_REPOSITORY, useClass: TypeOrmPasswordResetTokenRepository },
    { provide: MEMBERSHIP_INVITE_REPOSITORY, useClass: TypeOrmMembershipInviteRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: TypeOrmRefreshTokenRepository },
    { provide: AUTH_EMAIL_SENDER, useClass: ResendAuthEmailSenderAdapter },
  ],
})
export class AuthModule {}
```

(the rest of `auth.module.ts` — every `SignupUseCase`/`LoginUseCase`/etc. provider entry added by later tasks in the Authentication & Onboarding plan — is unchanged; only the `AUTH_EMAIL_SENDER` binding and its imports move)

- [ ] **Step 6: Delete the now-unused stub adapter**

Run: `git rm apps/backend/src/modules/auth/infrastructure/console-email-sender.adapter.ts apps/backend/src/modules/auth/infrastructure/console-email-sender.adapter.spec.ts`

(if a `.spec.ts` for the console stub was written in the Authentication & Onboarding plan; if that plan did not add one, skip the second path)

- [ ] **Step 7: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS — every use case test (`signup.usecase.spec.ts`, etc.) that constructs its use case directly with a mocked `IAuthEmailSender` is unaffected, since the interface did not change, only the DI binding

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/notifications/infrastructure/resend-auth-email-sender.adapter.ts apps/backend/src/modules/notifications/infrastructure/resend-auth-email-sender.adapter.spec.ts apps/backend/src/modules/auth/auth.module.ts
git commit -m "feat: rebind AUTH_EMAIL_SENDER to Resend-backed adapter, replacing the console stub"
```

---

### Task 8: Integration test — enqueue, worker processing, and retry/DLQ (against the real `AppModule`)

**Files:**
- Create: `apps/backend/test/email-queue.integration.spec.ts`

**Interfaces:**
- Consumes: the full `AppModule` (so `EmailTemplatesModule`, `RemindersModule`, `ReceivablesModule`, `CustomersModule`, `OrganizationsModule`, and `NotificationsModule` are wired exactly as in production), real Postgres via `PostgreSqlContainer` AND real Redis via `GenericContainer('redis:7')`, `EMAIL_PROVIDER_ADAPTER` overridden with an in-test fake
- Produces: proof that enqueue → worker processes → `adapter.send()` is called → the REAL `ReminderExecution` row in Postgres is updated, plus a retry/DLQ scenario proving 3 failed attempts land the job in BullMQ's `failed` state and mark that row `FAILED`

Earlier drafts of this test used an isolated `Test.createTestingModule([NotificationsModule])` with in-memory fakes for `EMAIL_TEMPLATE_REPOSITORY`/`REMINDER_EXECUTION_REPOSITORY`, because neither had a real Postgres-backed implementation yet. Both now exist (`2026-08-03-email-template-management.md`, `2026-08-03-reminder-automation.md`), so this test boots the full `AppModule` against real Postgres + Redis and only overrides `EMAIL_PROVIDER_ADAPTER` (there is still no reason to call the real Resend API from a test).

- [ ] **Step 1: Write the successful enqueue → process → status update test**

Create `apps/backend/test/email-queue.integration.spec.ts`:

```typescript
import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/modules/notifications/application/email.service';
import { EMAIL_PROVIDER_ADAPTER } from '../src/modules/notifications/application/email-provider-adapter.port';
import { EMAIL_QUEUE } from '../src/modules/notifications/infrastructure/email-queue.constants';
import { TenantContextService } from '../src/common/tenancy/tenant-context';
import { Role } from '../src/modules/organizations/domain/membership';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { CustomerOrmEntity } from '../src/modules/customers/infrastructure/customer.orm-entity';
import { ReceivableOrmEntity } from '../src/modules/receivables/infrastructure/receivable.orm-entity';
import { EmailTemplateOrmEntity } from '../src/modules/email-templates/infrastructure/email-template.orm-entity';
import { ReminderExecutionOrmEntity } from '../src/modules/reminders/infrastructure/reminder-execution.orm-entity';

class FakeSucceedingEmailProviderAdapter {
  async send() {
    return { providerMessageId: 'resend-msg-success-1' };
  }
}

class FakeFailingEmailProviderAdapter {
  async send(): Promise<never> {
    throw new Error('simulated Resend outage');
  }
}

async function buildTestApp(emailProviderAdapterClass: new () => unknown) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EMAIL_PROVIDER_ADAPTER)
    .useClass(emailProviderAdapterClass as new () => unknown)
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, moduleRef };
}

describe('email-queue (integration)', () => {
  let postgres: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let dataSource: DataSource;

  const organizationId = '00000000-0000-0000-0000-000000000030';
  const customerId = '00000000-0000-0000-0000-000000000031';
  const receivableId = '00000000-0000-0000-0000-000000000032';
  const templateId = '00000000-0000-0000-0000-000000000033';

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:16').start();
    redis = await new GenericContainer('redis:7').withExposedPorts(6379).start();

    process.env.DB_HOST = postgres.getHost();
    process.env.DB_PORT = String(postgres.getMappedPort(5432));
    process.env.DB_USERNAME = postgres.getUsername();
    process.env.DB_PASSWORD = postgres.getPassword();
    process.env.DB_DATABASE = postgres.getDatabase();
    process.env.REDIS_HOST = redis.getHost();
    process.env.REDIS_PORT = String(redis.getMappedPort(6379));

    const seedModuleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const seedApp = seedModuleRef.createNestApplication();
    await seedApp.init();
    dataSource = seedModuleRef.get(DataSource);

    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'Company B',
      taxCode: '0312345678',
      email: 'ap@congtyb.vn',
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 0,
      priority: 1,
      createdAt: new Date(),
    });
    await dataSource.getRepository(ReceivableOrmEntity).save({
      id: receivableId,
      organizationId,
      customerId,
      invoiceId: null,
      originalAmount: 30_000_000,
      paidAmount: 10_000_000,
      dueDate: new Date('2026-08-01'),
      status: ReceivableStatus.PARTIALLY_PAID,
      salesRepresentativeId: '00000000-0000-0000-0000-000000000034',
      createdAt: new Date(),
      closedAt: null,
    });
    await dataSource.getRepository(EmailTemplateOrmEntity).save({
      id: templateId,
      organizationId,
      name: 'Overdue reminder',
      subject: 'Payment reminder — {{organizationName}}',
      bodyHtml: '<p>{{customerName}}, outstanding {{remainingAmount}}</p>',
      reminderStage: null,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await seedApp.close();
  }, 90_000);

  afterAll(async () => {
    await postgres.stop();
    await redis.stop();
  });

  async function seedPendingExecution(id: string): Promise<void> {
    await dataSource.getRepository(ReminderExecutionOrmEntity).save({
      id,
      organizationId,
      receivableId,
      reminderRuleId: '00000000-0000-0000-0000-000000000035',
      executionDate: new Date(),
      sentAt: null,
      status: 'PENDING',
      skipReason: null,
      providerMessageId: null,
      failureReason: null,
      createdAt: new Date(),
    });
  }

  it('enqueues a reminder email, the worker processes it, and the ReminderExecution row is updated to SENT', async () => {
    const executionId = randomUUID();
    await seedPendingExecution(executionId);

    const { app, moduleRef } = await buildTestApp(FakeSucceedingEmailProviderAdapter);
    const tenantContext = moduleRef.get(TenantContextService);
    const emailService = moduleRef.get(EmailService);

    await tenantContext.run(
      { userId: 'user-1', organizationId, role: Role.OWNER },
      () =>
        emailService.sendReminderEmail({
          receivableId,
          templateId,
          reminderExecutionId: executionId,
        }),
    );

    await new Promise((resolve) => setTimeout(resolve, 3000)); // allow the BullMQ worker to process the job

    const row = await dataSource.getRepository(ReminderExecutionOrmEntity).findOne({ where: { id: executionId } });
    expect(row?.status).toBe('SENT');
    expect(row?.providerMessageId).toBe('resend-msg-success-1');

    const queue = moduleRef.get<Queue>(getQueueToken(EMAIL_QUEUE));
    const completedJob = await queue.getJob(executionId);
    expect(await completedJob?.getState()).toBe('completed');

    await app.close();
  }, 15_000);

  it('retries 3 times then lands in BullMQ failed state and marks the ReminderExecution row FAILED', async () => {
    const executionId = randomUUID();
    await seedPendingExecution(executionId);

    const { app, moduleRef } = await buildTestApp(FakeFailingEmailProviderAdapter);
    const tenantContext = moduleRef.get(TenantContextService);
    const emailService = moduleRef.get(EmailService);

    await tenantContext.run(
      { userId: 'user-1', organizationId, role: Role.OWNER },
      () =>
        emailService.sendReminderEmail({
          receivableId,
          templateId,
          reminderExecutionId: executionId,
        }),
    );

    // 3 attempts with exponential backoff starting at 5000ms — allow generous time for all retries
    await new Promise((resolve) => setTimeout(resolve, 20_000));

    const queue = moduleRef.get<Queue>(getQueueToken(EMAIL_QUEUE));
    const job = await queue.getJob(executionId);
    expect(await job?.getState()).toBe('failed');
    expect(job?.attemptsMade).toBe(3);

    const row = await dataSource.getRepository(ReminderExecutionOrmEntity).findOne({ where: { id: executionId } });
    expect(row?.status).toBe('FAILED');
    expect(row?.providerMessageId).toBeNull();

    await app.close();
  }, 30_000);
});
```

- [ ] **Step 2: Run the integration test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- email-queue.integration.spec.ts`
Expected: both tests PASS (the retry test is slow — ~20s wall clock — because it waits out real exponential backoff at 5s/10s/20s; this is intentional so the test exercises the real BullMQ retry timer rather than mocking it away)

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/email-queue.integration.spec.ts
git commit -m "test: add integration test for email-queue enqueue, processing, and retry/DLQ against real AppModule"
```

---

## Self-Review Notes

- **Spec coverage:** `EmailProviderAdapter` isolation, single `ResendEmailAdapter` implementation (spec section 1) → Task 2. Enqueue-not-synchronous-send (spec section 1 step 2) → Task 4. `attempts: 3, backoff: exponential 5000ms` (spec section 2) → Task 4 (`EmailService.sendReminderEmail`). `SENT` only after `providerMessageId` returns (spec section 2) → Task 5 (`process()`). Failed-state = DLQ equivalent + `ReminderExecution.status = FAILED` (spec section 2) → Task 5 (`onFailed()`), proven in Task 8's retry test. `AUTH_EMAIL_SENDER` rebind with zero use-case changes (Authentication & Onboarding plan's forward promise) → Task 7.
- **Reconciled with the real Email Template and Reminder Automation plans (2026-08-04 pass):** this plan originally shipped with two local placeholder ports — `IEmailTemplateRepository.renderForReceivable(templateId, receivableId)` and `IReminderExecutionRepository.updateSendResult(id, status, providerMessageId)` — written before `2026-08-03-email-template-management.md` and `2026-08-03-reminder-automation.md` existed. Both now exist. Task 3 was rewritten from "define placeholder ports" to "confirm the real ports match what Tasks 4-5 need" (they do, with zero changes to `updateSendResult`'s signature — a lucky match, verified rather than assumed). Task 4's `EmailService.sendReminderEmail` was rewritten to fetch the real `EmailTemplate`/`Receivable`/`Customer`/`Organization`/`Invoice` and call the real `RenderEmailTemplateUseCase`, rather than one opaque `renderForReceivable()` call. Task 6's `NotificationsModule` now imports `EmailTemplatesModule`, `ReceivablesModule`, `CustomersModule`, `InvoicesModule`, `OrganizationsModule`, and `forwardRef(() => RemindersModule)` — the last one because `2026-08-03-reminder-automation.md`'s `ReminderSenderService` needs `EmailService` back, a two-way module dependency resolved with NestJS `forwardRef()` on both sides (see that plan's own Task 6, Step 5). Task 8's integration test now boots the full `AppModule` against real Postgres + Redis and seeds real rows, instead of overriding two fakes in an isolated test module — this is a stronger proof (it exercises the actual `forwardRef` cycle at boot time) at the cost of a heavier test (now needs `PostgreSqlContainer` in addition to Redis).
- **Deliberate scope decision:** No SES/SendGrid adapter was scaffolded alongside `ResendEmailAdapter` — the spec itself calls this out as YAGNI (spec section 1's comment), and `IEmailProviderAdapter` is the seam that makes adding one later a pure addition, with no changes to `EmailService`/`EmailQueueProcessor`.
- **Not covered in this plan (by design, per spec section 3):** Bounce/complaint webhook handling from Resend, per-organization custom sending domains, non-email notification channels (Zalo OA, SMS, Teams, Slack) — all explicitly out of scope for the MVP per the target spec.
- **Type/token consistency checked:** `EMAIL_QUEUE = 'email-queue'` (Task 1) is the single source of truth used by both `EmailService`'s `@InjectQueue(EMAIL_QUEUE)` (Task 4) and `EmailQueueProcessor`'s `@Processor(EMAIL_QUEUE)` (Task 5) — matches the pattern established by the Webhook plan's `WEBHOOK_PROCESSING_QUEUE` constant. `EmailJobData` shape produced by `EmailService.sendReminderEmail`'s `queue.add()` call (Task 4) exactly matches the shape `EmailQueueProcessor.process()` destructures (Task 5) and what Task 8's integration test asserts against. `REMINDER_EXECUTION_REPOSITORY`'s `Symbol` (owned by `2026-08-03-reminder-automation.md` Task 3) and `EMAIL_TEMPLATE_REPOSITORY`'s `Symbol` (owned by `2026-08-03-email-template-management.md` Task 2) are each declared in exactly one place and imported everywhere else — this plan does not redeclare either.


