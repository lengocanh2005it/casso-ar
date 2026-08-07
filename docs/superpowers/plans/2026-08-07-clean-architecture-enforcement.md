# Clean Architecture Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make backend Clean Architecture boundaries fail deterministically in `arch-check`, remove the current production violations, and add a repository-local PR review skill.

**Architecture:** Dependency-cruiser will enforce fixed layer-to-layer edges. A small Node script will enforce the relational rule that a module cannot import another module's infrastructure. Application code will depend on ports for queueing and cross-module data access; infrastructure will provide adapters and ORM queries.

**Tech Stack:** NestJS 11, TypeScript 6, dependency-cruiser 18, Node built-in test runner, pnpm workspace, Claude Code local markdown skills.

## Global Constraints

- Domain code MUST NOT import NestJS/TypeORM or another layer.
- Application code MUST depend on ports and domain types, not concrete SDK/infrastructure adapters.
- Infrastructure repositories MUST scope organization-owned reads by `organizationId`.
- Domain-to-ORM translation MUST use explicit mappers; do not add unsafe casts.
- Production code MUST NOT use `any` or `as unknown as`.
- Preserve existing webhook queue retry settings and matching behavior.
- Exclude `*.spec.ts` from production architecture boundary checks because tests live beside source files.
- Keep module root files as composition roots; own-module infrastructure wiring remains allowed.

---

### Task 1: Add deterministic architecture boundary checks

**Files:**
- Modify: `apps/backend/.dependency-cruiser.cjs`
- Modify: `apps/backend/package.json`
- Create: `apps/backend/scripts/check-cross-module-infrastructure.mjs`
- Create: `apps/backend/scripts/check-cross-module-infrastructure.test.mjs`

**Interfaces:**
- Produces `findCrossModuleInfrastructureViolations(sourceRoot)` for the Node test and CLI.
- The CLI exits `0` when no production cross-module infrastructure import exists and `1` with file/line/import details otherwise.

- [ ] **Step 1: Write the failing script test**

Create in-memory source fixtures for an allowed same-module infrastructure import, a forbidden cross-module import, and a test-file import. Assert only the cross-module production import is reported.

- [ ] **Step 2: Run the script test and verify RED**

Run: `node --test scripts/check-cross-module-infrastructure.test.mjs`

Expected: FAIL because the checker module does not exist.

- [ ] **Step 3: Implement the minimal checker**

Walk `src/modules/*` production `.ts` files, parse static relative `import`/`export ... from` specifiers, resolve source paths, compare source and target module names, and report targets under a different module's `infrastructure/` directory. Preserve line numbers in diagnostics.

- [ ] **Step 4: Run the script test and verify GREEN**

Run: `node --test scripts/check-cross-module-infrastructure.test.mjs`

Expected: all fixture tests pass.

- [ ] **Step 5: Add fixed layer rules and wire the checker**

Add severity `error` rules for:

```text
domain       → application, infrastructure, presentation
application  → infrastructure, presentation
presentation → infrastructure
```

Each `from` rule must exclude `*.spec.ts`. Add `node scripts/check-cross-module-infrastructure.mjs` and the Node test to `arch-check` after the existing application exception check.

- [ ] **Step 6: Run the checker against the baseline**

Run: `pnpm --filter @casso-ledger/backend arch-check`

Expected: FAIL with only the known production violations listed in the design document. Do not weaken the rules to make the baseline pass.

- [ ] **Step 7: Commit the enforcement gate**

```bash
git add apps/backend/.dependency-cruiser.cjs apps/backend/package.json apps/backend/scripts
git commit -m "chore: enforce clean architecture boundaries"
```

### Task 2: Port webhook queueing out of application

**Files:**
- Create: `apps/backend/src/modules/webhooks/application/webhook-job-queue.port.ts`
- Create: `apps/backend/src/modules/webhooks/infrastructure/bullmq-webhook-job-queue.adapter.ts`
- Modify: `apps/backend/src/modules/webhooks/application/receive-webhook.usecase.ts`
- Modify: `apps/backend/src/modules/webhooks/application/receive-webhook.usecase.spec.ts`
- Modify: `apps/backend/src/modules/webhooks/webhooks.module.ts`
- Test: `apps/backend/src/modules/webhooks/infrastructure/bullmq-webhook-job-queue.adapter.spec.ts`

**Interfaces:**
- `IWebhookJobQueue.enqueue(input: { webhookInboxId: string; organizationId: string; jobId: string }): Promise<void>`.
- `WEBHOOK_JOB_QUEUE` is a Symbol DI token.
- `BullMqWebhookJobQueue` owns BullMQ injection, queue name, retry count, and exponential backoff.

- [ ] **Step 1: Add the port and update the use-case test double**

Define the port, change the test double from `add` to `enqueue`, and update the constructor call. Run the focused test to observe the expected RED until production code is changed.

Run: `pnpm --filter @casso-ledger/backend test -- receive-webhook.usecase.spec.ts --runInBand`

- [ ] **Step 2: Move queue mechanics into the infrastructure adapter**

Implement `BullMqWebhookJobQueue` with the existing job name, `jobId`, five attempts, and 5-second exponential backoff. Keep `WEBHOOK_PROCESSING_QUEUE` in infrastructure.

- [ ] **Step 3: Wire the adapter and make the use case port-only**

Register `{ provide: WEBHOOK_JOB_QUEUE, useClass: BullMqWebhookJobQueue }` in `WebhooksModule`. Remove `@nestjs/bullmq`, `bullmq`, and the infrastructure queue-constant imports from `ReceiveWebhookUseCase`.

- [ ] **Step 4: Add the adapter regression test and run focused GREEN checks**

Assert `Queue.add` receives the exact job payload and retry options. Run:

```bash
pnpm --filter @casso-ledger/backend test -- receive-webhook.usecase.spec.ts bullmq-webhook-job-queue.adapter.spec.ts --runInBand
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/webhooks
git commit -m "refactor: port webhook queue from application"
```

### Task 3: Remove invoice-to-receivable infrastructure coupling

**Files:**
- Modify: `apps/backend/src/modules/receivables/application/receivable-repository.port.ts`
- Modify: `apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.ts`
- Modify: `apps/backend/src/modules/receivables/infrastructure/typeorm-receivable.repository.spec.ts`
- Modify: `apps/backend/src/modules/invoices/application/invoice-repository.port.ts`
- Modify: `apps/backend/src/modules/invoices/infrastructure/typeorm-invoice.repository.ts`
- Modify: `apps/backend/src/modules/invoices/infrastructure/typeorm-invoice.repository.spec.ts`
- Modify: `apps/backend/src/modules/webhooks/application/matching-engine.service.ts`
- Modify: `apps/backend/src/modules/webhooks/application/matching-engine.service.spec.ts`

**Interfaces:**
- `IReceivableRepository.findInvoiceIdsByReceivableIds(ids: string[]): Promise<Map<string, string>>`.
- `IInvoiceRepository.findByIds(ids: string[]): Promise<Map<string, Invoice>>`.
- The matching service composes those ports into the existing `Map<receivableId, Invoice>` without changing scoring behavior.

- [ ] **Step 1: Add failing repository/service expectations**

Move the existing repository test expectation to a receivable relation lookup and an invoice-by-id lookup. Update matching tests to mock both ports. Run the focused tests and verify RED because the new methods do not yet exist.

- [ ] **Step 2: Implement tenant-scoped receivable relation lookup**

Query `ReceivableOrmEntity` only inside `TypeOrmReceivableRepository`, selecting `id` and `invoiceId` with the current organization ID. Return only non-null invoice links.

- [ ] **Step 3: Implement tenant-scoped invoice batch lookup**

Add `findByIds` to `TypeOrmInvoiceRepository`, remove its `ReceivableOrmEntity` import and manager query, and retain the organization scope on invoice reads.

- [ ] **Step 4: Compose the two ports in `MatchingEngineService`**

Add one private helper to load invoices for receivable IDs and use it at both existing call sites. Preserve the two-query batch behavior and all five scoring components.

- [ ] **Step 5: Run focused GREEN checks**

Run:

```bash
pnpm --filter @casso-ledger/backend test -- typeorm-receivable.repository.spec.ts typeorm-invoice.repository.spec.ts matching-engine.service.spec.ts --runInBand
pnpm --filter @casso-ledger/backend type-check
```

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/receivables apps/backend/src/modules/invoices apps/backend/src/modules/webhooks/application/matching-engine.service.ts apps/backend/src/modules/webhooks/application/matching-engine.service.spec.ts
git commit -m "refactor: remove cross-module ORM coupling"
```

### Task 4: Move auth email adapter into its owning module

**Files:**
- Create: `apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.ts`
- Delete: `apps/backend/src/modules/notifications/infrastructure/resend-auth-email-sender.adapter.ts`
- Modify: `apps/backend/src/modules/auth/auth.module.ts`
- Test: `apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.spec.ts` if the moved adapter has existing coverage to relocate

- [ ] **Step 1: Move the adapter without changing its public behavior**

Keep the `IAuthEmailSender` port, notifications `IEmailProviderAdapter` port, safe-send behavior, subjects, HTML, and metadata unchanged. Update `AuthModule` to import the adapter from its own infrastructure.

- [ ] **Step 2: Run auth-focused tests and architecture checks**

Run:

```bash
pnpm --filter @casso-ledger/backend test -- auth --runInBand
pnpm --filter @casso-ledger/backend arch-check
```

Expected: the cross-module infrastructure violation is gone; the remaining invoice violation is the only expected production failure until Task 3 is complete.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/auth apps/backend/src/modules/notifications
git commit -m "refactor: keep auth email adapter in auth module"
```

### Task 5: Add the local PR review skill

**Files:**
- Create: `.claude/skills/clean-architecture-review.md`
- Modify: `.claude/commands/review.md`

- [ ] **Step 1: Write the skill instructions**

Document PR-base resolution, deterministic commands, layer-by-layer checks, flow tracing, severity format, evidence requirements, and the distinction between verified failures and unavailable test infrastructure. Keep the skill review-only unless the user explicitly requests fixes.

- [ ] **Step 2: Update `/review` to review committed PR changes**

Replace the staged-only diff instruction with `git diff <merge-base>...HEAD` for PR review, while retaining support for staged/unstaged local changes. Route backend changes through the new local skill and the generic code-review skill.

- [ ] **Step 3: Validate the skill documentation**

Run: `git diff --check`

Then manually verify that the skill does not duplicate `domain-check` rules and that every command path matches the repository scripts.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/clean-architecture-review.md .claude/commands/review.md
git commit -m "docs: add clean architecture PR review skill"
```

### Task 6: Full verification and handoff

**Files:**
- Modify: none unless verification exposes a defect.

- [ ] **Step 1: Prove the architecture gate fails on a deliberate violation**

Temporarily add one forbidden production import in a throwaway source file, run `pnpm --filter @casso-ledger/backend arch-check`, record the non-zero result, then revert the throwaway change with `apply_patch`. Repeat only if the first check does not exercise each rule family.

- [ ] **Step 2: Run fresh backend verification**

Run:

```bash
pnpm --filter @casso-ledger/shared-types build
pnpm --filter @casso-ledger/backend arch-check
pnpm --filter @casso-ledger/backend type-check
pnpm --filter @casso-ledger/backend test -- --runInBand
pnpm --filter @casso-ledger/backend build
git diff --check
```

- [ ] **Step 3: Inspect the final diff and status**

Run: `git diff main...HEAD --stat; git status --short --branch`

Expected: only the architecture-enforcement scope is changed and the worktree is clean.

- [ ] **Step 4: Commit any final verification-only documentation if needed**

Use a conventional `docs:` or `chore:` message only when a tracked documentation correction is required; do not create an empty commit.
