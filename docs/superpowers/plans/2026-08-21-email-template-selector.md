# Email Template Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users select reminder email templates by human-readable names instead of entering UUIDs.

**Architecture:** Reuse the existing email-template query and API contract. The selector stores the selected template's existing UUID, while the UI displays the template name and default/reminder-stage context. No database or backend changes.

**Tech Stack:** React, TanStack Query, Radix Select, Vitest, Testing Library.

**Spec:** GitHub issue #289.

## Global Constraints

- Keep `emailTemplateId` as the submitted backend field.
- Load up to 100 organization-scoped templates through the existing endpoint.
- Do not add a template-code column, migration, dependency, or manual UUID fallback.
- Preserve an existing unavailable UUID while editing and require a valid replacement before saving.

---

### Task 1: Add the selector behavior test

**Files:**
- Create: `apps/frontend/src/features/reminders/components/policy-dialog.spec.tsx`

- [x] **Step 1: Write the failing test**

Render `PolicyDialog` with one available template, open the selector, choose the template, click `Lưu chính sách`, and assert the create mutation receives `emailTemplateId: 'template-1'` while the visible option uses the template name.

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend exec vitest run src/features/reminders/components/policy-dialog.spec.tsx`

Expected: FAIL because the dialog currently renders a free-text input and does not query templates.

### Task 2: Reuse the template query with the selector

**Files:**
- Modify: `apps/frontend/src/features/settings/api/settings-api.ts`
- Modify: `apps/frontend/src/features/reminders/components/policy-dialog.tsx`

- [x] **Step 1: Request up to 100 templates**

Change `fetchEmailTemplates()` to request `/api/v1/email-templates?limit=100`.

- [x] **Step 2: Replace the UUID input**

Call `useEmailTemplates(open && canWrite)`. Render a Radix `Select` for each rule whose value remains `rule.emailTemplateId`; render options using template name, reminder stage when distinct, and `(Mặc định)` for default templates.

- [x] **Step 3: Handle states and unavailable existing IDs**

Show loading, error, and empty messages; disable adding rules and saving until templates are available. If an existing rule's UUID is absent, render it as `Mẫu không còn khả dụng` and block saving until the user selects a current template.

### Task 3: Expand focused tests and verify

**Files:**
- Modify: `apps/frontend/src/features/reminders/components/policy-dialog.spec.tsx`
- Modify: `apps/frontend/src/features/settings/api/settings-api.spec.ts` if the request URL is covered there

- [x] **Step 1: Add state and compatibility tests**

Cover loading/error/empty states, preservation of an unavailable existing UUID, and the `limit=100` request URL.

- [x] **Step 2: Run focused tests**

Run: `pnpm --filter @casso-ledger/frontend exec vitest run src/features/reminders/components/policy-dialog.spec.tsx src/features/settings/api/settings-api.spec.ts`

Expected: PASS.

- [x] **Step 3: Run frontend type-check and lint**

Run: `pnpm --filter @casso-ledger/frontend type-check` and `pnpm --filter @casso-ledger/frontend lint`

Expected: both exit 0.

- [x] **Step 4: Run the repository verification commands**

Run: `pnpm verify`

Expected: lint, type-check, tests, and architecture checks exit 0.
