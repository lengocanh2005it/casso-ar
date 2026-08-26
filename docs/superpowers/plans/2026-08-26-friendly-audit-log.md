# Friendly Audit Log Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render audit details with Vietnamese dates and business-friendly customer/receivable references while retaining raw IDs for technical inspection.

**Architecture:** Keep audit snapshots immutable. Extend the audit list read model with batched, tenant-scoped reference metadata from the customer repository, then let the frontend format values by field and render resolved labels with copyable IDs.

**Tech Stack:** NestJS, TypeORM repository ports, React, TanStack Query, Vitest, Jest, Intl.DateTimeFormat.

## Global Constraints

- Money remains integer VND and no money behavior changes.
- Every backend read remains scoped by the current organization.
- Domain code must not import NestJS or TypeORM.
- Do not use `any` or unsafe casts in production code.
- Immutable `beforeState` and `afterState` are never rewritten.
- No external API calls or writes are added to audit reads.

### Task 1: Add frontend date/reference display tests

**Files:**
- Modify: `apps/frontend/src/features/audit-logs/components/audit-log-tab.spec.tsx`
- Modify: `apps/frontend/src/features/audit-logs/components/audit-log-table.tsx`

**Interfaces:**
- Tests exercise the public `AuditLogTab` rendering behavior.
- The component accepts optional reference metadata on each `AuditLogItem`.

- [ ] **Step 1: Write failing tests** for `createdAt`/`dueDate` formatting and customer-name rendering.
- [ ] **Step 2: Run the focused Vitest file and verify the new assertions fail.**
- [ ] **Step 3: Implement field-aware formatters and reference rendering.**
- [ ] **Step 4: Run the focused Vitest file and verify it passes.**

### Task 2: Add backend batched audit references

**Files:**
- Modify: `apps/backend/src/common/audit/audit-log.ts` or the audit-list response model
- Modify: `apps/backend/src/modules/audit-logs/application/list-audit-logs.usecase.ts`
- Modify: `apps/backend/src/modules/audit-logs/presentation/audit-logs.controller.ts`
- Modify: `apps/backend/src/modules/audit-logs/presentation/dto/list-audit-logs-response.dto.ts`
- Test: `apps/backend/src/modules/audit-logs/application/list-audit-logs.usecase.spec.ts`

**Interfaces:**
- The use case continues to return `{ items, total }`, with each item carrying
  presentation-only references.
- Customer lookup uses the existing tenant-scoped `findByIds` repository port.

- [ ] **Step 1: Write failing use-case tests** for batched customer lookup and a missing-customer fallback.
- [ ] **Step 2: Run the focused Jest file and verify the new assertions fail.**
- [ ] **Step 3: Inject the customer repository, collect unique snapshot IDs, and attach reference metadata without mutating snapshots.**
- [ ] **Step 4: Update response DTO/controller mapping and run the focused Jest file.**
- [ ] **Step 5: Run backend domain-check and type-check.**

### Task 3: Refine labels and regression coverage

**Files:**
- Modify: `apps/frontend/src/features/audit-logs/labels.ts`
- Modify: `apps/frontend/src/features/audit-logs/types.ts`
- Modify: `apps/frontend/src/features/audit-logs/components/audit-log-tab.spec.tsx`

- [ ] **Step 1: Replace generic technical labels with explicit business/technical wording and add reference types.**
- [ ] **Step 2: Update existing UUID assertions to verify copyable fallback behavior.**
- [ ] **Step 3: Run frontend tests and type-check.**

### Task 4: Full verification

- [ ] **Step 1: Run focused frontend and backend tests after all changes.**
- [ ] **Step 2: Run `pnpm verify`.**
- [ ] **Step 3: Inspect the final diff and report only evidence-backed results.**
