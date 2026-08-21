# Frontend Long-Content Layout Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent horizontal overflow in the six frontend areas named by issue #294 while preserving complete chat/prose content and keeping compact identifiers accessible when truncated.

**Architecture:** Keep the fix at the existing component boundaries. Apply Tailwind `min-w-0`, `break-words`, and `truncate` utilities directly to the flex/text nodes that currently allow intrinsic content width to escape; use `title` on compact truncated values. No shared abstraction, dependency, API, or backend change is needed.

**Tech Stack:** React 19, Tailwind CSS 4 utilities, shadcn/ui components already in the repo, Vitest, and Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-21-long-content-layout-design.md`

## Global Constraints

- No backend, API, schema, payload, or dependency changes.
- Copilot messages, transfer content, and timeline descriptions remain complete and are wrapped, never truncated.
- Provider IDs, receivable IDs, account numbers, template names, and preview subjects use one-line `truncate` with the original value retained in the DOM and exposed through `title`.
- `break-all` is reserved for machine-generated tokens; prose and names use `break-words`.
- Empty transfer content keeps the existing `Không có nội dung` fallback; metadata fallback is `—` only where the existing contract permits a missing value.
- Use existing Tailwind utilities and shadcn components; do not add a helper or design-system component.
- TDD is mandatory: write each regression test, run it to observe the expected failure, implement the smallest CSS/markup change, and run the focused test again.
- Use the existing Vitest + Testing Library conventions; do not add pixel measurements or browser viewport tests.

---

### Task 1: Harden Copilot message and chat-column sizing

**Files:**
- Modify: `apps/frontend/src/features/copilot/components/copilot-message-bubble.tsx`
- Modify: `apps/frontend/src/features/copilot/components/copilot-message-bubble.spec.tsx`
- Modify: `apps/frontend/src/features/copilot/pages/copilot-page.tsx`
- Modify: `apps/frontend/src/features/copilot/pages/copilot-page.spec.tsx`

**Interfaces:**
- Consumes: existing `CopilotMessageBubble`, `MessageList`, and `CopilotPage` markup.
- Produces: complete Copilot messages that wrap long unbroken content and a center chat flex child that can shrink below its intrinsic content width.

- [ ] **Step 1: Add the failing message-bubble regression test**

Append to `apps/frontend/src/features/copilot/components/copilot-message-bubble.spec.tsx`:

```tsx
  it('wraps a long unbroken assistant value without truncating it', () => {
    const content = `https://example.com/${'transaction-id-'.repeat(12)}`;
    render(
      <CopilotMessageBubble
        message={{ role: 'ASSISTANT', content, isPartial: false }}
      />,
    );

    expect(screen.getByText(content)).toHaveClass('break-words');
    expect(screen.getByText(content)).toHaveTextContent(content);
  });
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run from the worktree root:

```bash
cd apps/frontend && pnpm exec vitest run src/features/copilot/components/copilot-message-bubble.spec.tsx
```

Expected: FAIL because the assistant paragraph does not yet have the `break-words` class.

- [ ] **Step 3: Add the minimal message-bubble sizing classes**

In `copilot-message-bubble.tsx`:

```tsx
  return (
    <div className="flex min-w-0 items-start gap-2">
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Bot className="size-3.5" aria-hidden="true" />
      </div>
      <div className="min-w-0 max-w-[80%]">
        <p className="break-words whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm">
```

Add `break-words` to the user paragraph as well, keeping its complete content and existing visual classes:

```tsx
        <p className="max-w-[80%] break-words rounded-lg rounded-tr-none bg-primary px-3 py-2 text-sm text-primary-foreground">
```

- [ ] **Step 4: Run the message-bubble test and verify it passes**

Run:

```bash
cd apps/frontend && pnpm exec vitest run src/features/copilot/components/copilot-message-bubble.spec.tsx
```

Expected: PASS.

- [ ] **Step 5: Add the failing chat-column sizing regression test**

Append to `apps/frontend/src/features/copilot/pages/copilot-page.spec.tsx`:

```tsx
  it('allows the chat column to shrink inside the Copilot flex layout', async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/hỏi copilot về công nợ/i)).toBeInTheDocument(),
    );

    expect(
      document.querySelector('.min-w-0.flex-1.flex-col'),
    ).toBeInTheDocument();
  });
```

- [ ] **Step 6: Run the page test and verify the expected failure**

Run:

```bash
cd apps/frontend && pnpm exec vitest run src/features/copilot/pages/copilot-page.spec.tsx
```

Expected: FAIL because the center chat column currently has `flex-1 flex-col` without `min-w-0`.

- [ ] **Step 7: Add the minimal page sizing classes**

In `copilot-page.tsx`, add `min-w-0` to both the existing three-column row and the center chat column:

```tsx
          <div className="flex min-w-0 min-h-0 flex-1 flex-col">
```

Keep the existing `min-h-0`/`flex-1` behavior and add no new layout wrapper. Update the row containing both sidebars and the chat column to:

```tsx
        <div className="flex min-h-0 min-w-0 flex-1 gap-3">
```

- [ ] **Step 8: Run the focused Copilot tests**

Run:

```bash
cd apps/frontend && pnpm exec vitest run src/features/copilot/components/copilot-message-bubble.spec.tsx src/features/copilot/pages/copilot-page.spec.tsx
```

Expected: PASS, with all existing Copilot behavior tests still green.

- [ ] **Step 9: Commit the Copilot layout slice**

```bash
git add apps/frontend/src/features/copilot/components/copilot-message-bubble.tsx apps/frontend/src/features/copilot/components/copilot-message-bubble.spec.tsx apps/frontend/src/features/copilot/pages/copilot-page.tsx apps/frontend/src/features/copilot/pages/copilot-page.spec.tsx
git commit -m "fix: prevent long Copilot content overflow"
```

### Task 2: Harden split-match dialog identifiers and mobile actions

**Files:**
- Modify: `apps/frontend/src/features/exceptions/components/split-match-dialog.tsx`
- Modify: `apps/frontend/src/features/exceptions/components/split-match-dialog.spec.tsx`

**Interfaces:**
- Consumes: existing `BankTransaction`, candidate allocation rows, and dialog action handlers.
- Produces: compact truncated provider/receivable IDs with full-value titles, wrapped transfer content, and a mobile-safe action group.

- [ ] **Step 1: Add the failing long-ID/action-layout regression test**

Append to `split-match-dialog.spec.tsx`:

```tsx
  it('keeps long identifiers accessible without widening the dialog actions', async () => {
    const providerTransactionId = `provider-${'x'.repeat(80)}`;
    const receivableId = `receivable-${'y'.repeat(80)}`;
    apiRequest.mockResolvedValue([
      { ...candidates[0], receivableId },
    ]);
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <SplitMatchDialog
          tx={{ ...tx, providerTransactionId }}
          open
          onOpenChange={vi.fn()}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText('80/100')).toBeInTheDocument());

    const providerId = screen.getByText(providerTransactionId);
    const receivable = screen.getByText(receivableId);
    expect(providerId).toHaveClass('truncate');
    expect(providerId).toHaveAttribute('title', providerTransactionId);
    expect(receivable).toHaveClass('truncate');
    expect(receivable).toHaveAttribute('title', receivableId);
    expect(screen.getByRole('button', { name: /ghi nhận công nợ/i }).parentElement).toHaveClass('flex-col');
  });
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run:

```bash
cd apps/frontend && pnpm exec vitest run src/features/exceptions/components/split-match-dialog.spec.tsx
```

Expected: FAIL because the title/ID nodes do not have `truncate`/`title`, and the action group is not mobile-stacked.

- [ ] **Step 3: Add the minimal dialog markup classes**

Use separate inline/block spans so the visible text remains in the DOM while the compact identifiers can shrink:

```tsx
          <DialogTitle className="min-w-0 pr-6">
            Xử lý giao dịch{' '}
            <span
              className="inline-block max-w-full truncate align-bottom"
              title={tx.providerTransactionId}
            >
              {tx.providerTransactionId}
            </span>{' '}
            — {formatVND(tx.amount)}
          </DialogTitle>
```

For each candidate row, make the ID flex child shrinkable:

```tsx
              <span
                className="min-w-0 flex-1 truncate text-sm"
                title={candidate.receivableId}
              >
                {candidate.receivableId}
              </span>
```

Keep transfer content as full prose with its existing `break-words` class. Change the action wrapper to:

```tsx
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
cd apps/frontend && pnpm exec vitest run src/features/exceptions/components/split-match-dialog.spec.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the split-match layout slice**

```bash
git add apps/frontend/src/features/exceptions/components/split-match-dialog.tsx apps/frontend/src/features/exceptions/components/split-match-dialog.spec.tsx
git commit -m "fix: contain long exception identifiers"
```

### Task 3: Wrap receivable timeline activity text

**Files:**
- Modify: `apps/frontend/src/features/receivables/components/receivable-timeline.tsx`
- Modify: `apps/frontend/src/features/receivables/components/receivable-timeline.spec.tsx`

**Interfaces:**
- Consumes: existing `ReceivableTimeline` query result and activity formatting.
- Produces: activity descriptions that wrap long tokens without changing the displayed activity data.

- [ ] **Step 1: Add the failing long-description regression test**

Append to `receivable-timeline.spec.tsx`:

```tsx
  it('wraps a long unbroken activity description', async () => {
    const description = `transfer-${'z'.repeat(100)}`;
    fetchReceivableTimeline.mockResolvedValue({
      items: [
        {
          id: 'act-long',
          receivableId: 'rec-1',
          customerId: 'cust-1',
          activityType: 'PAYMENT_RECEIVED',
          description,
          metadata: {},
          createdByUserId: null,
          createdAt: '2026-08-13T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });

    renderTimeline();

    const activity = await screen.findByText(description);
    expect(activity).toHaveClass('break-words');
    expect(activity).toHaveTextContent(description);
  });
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run:

```bash
cd apps/frontend && pnpm exec vitest run src/features/receivables/components/receivable-timeline.spec.tsx
```

Expected: FAIL because the description paragraph does not yet have `break-words`.

- [ ] **Step 3: Add the minimal wrapping classes**

Change the timeline header and description to allow the text side to shrink and wrap:

```tsx
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
            <span className="min-w-0 break-words font-medium">
              {formatActivityType(item.activityType)}
            </span>
            <time className="shrink-0 text-sm text-muted-foreground">
              {formatDate(item.createdAt)}
            </time>
          </div>
          <p className="mt-1 break-words text-sm">{item.description}</p>
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
cd apps/frontend && pnpm exec vitest run src/features/receivables/components/receivable-timeline.spec.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the timeline layout slice**

```bash
git add apps/frontend/src/features/receivables/components/receivable-timeline.tsx apps/frontend/src/features/receivables/components/receivable-timeline.spec.tsx
git commit -m "fix: wrap long receivable activity text"
```

### Task 4: Keep template preview headings compact and accessible

**Files:**
- Modify: `apps/frontend/src/features/settings/components/template-preview-dialog.tsx`
- Create: `apps/frontend/src/features/settings/components/template-preview-dialog.spec.tsx`

**Interfaces:**
- Consumes: existing `TemplatePreviewDialog`, `EmailTemplate`, and `usePreviewTemplate` mutation.
- Produces: compact template name/subject headings with full-value native access and a preview container that can shrink.

- [ ] **Step 1: Write the failing component test**

Create `template-preview-dialog.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TemplatePreviewDialog } from './template-preview-dialog';

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock('../api/use-settings', () => ({
  usePreviewTemplate: () => ({
    mutate,
    isPending: false,
    isError: false,
    data: {
      subject: `Subject-${'s'.repeat(80)}`,
      bodyHtml: '<p>Preview</p>',
    },
  }),
}));

describe('TemplatePreviewDialog', () => {
  it('keeps long template headings compact while retaining their full values', () => {
    const name = `Template-${'n'.repeat(80)}`;
    const subject = `Subject-${'s'.repeat(80)}`;

    render(
      <TemplatePreviewDialog
        template={{
          id: 'template-1',
          name,
          subject,
          bodyHtml: '<p>Body</p>',
          isDefault: false,
          createdAt: '2026-08-01',
          updatedAt: '2026-08-01',
          attachments: [],
        }}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText(name)).toHaveClass('truncate');
    expect(screen.getByText(name)).toHaveAttribute('title', name);
    expect(screen.getByText(subject)).toHaveClass('truncate');
    expect(screen.getByText(subject)).toHaveAttribute('title', subject);
  });
});
```

- [ ] **Step 2: Run the new test and verify the expected failure**

Run:

```bash
cd apps/frontend && pnpm exec vitest run src/features/settings/components/template-preview-dialog.spec.tsx
```

Expected: FAIL because the dialog headings do not yet have `truncate` or `title`.

- [ ] **Step 3: Add the minimal heading/container classes**

In `template-preview-dialog.tsx`, use full text nodes with native title access:

```tsx
        <DialogHeader className="min-w-0">
          <DialogTitle>Xem trước mẫu email</DialogTitle>
          <DialogDescription
            className="min-w-0 truncate"
            title={template?.name ?? '—'}
          >
            {template?.name ?? '—'}
          </DialogDescription>
        </DialogHeader>
```

Make the preview wrapper shrinkable and truncate the preview subject with its original value:

```tsx
        {preview.data && (
          <div className="min-w-0 space-y-3 rounded-lg border p-4">
            <h3
              className="truncate font-medium"
              title={preview.data.subject}
            >
              {preview.data.subject}
            </h3>
```

- [ ] **Step 4: Run the new test and verify it passes**

Run:

```bash
cd apps/frontend && pnpm exec vitest run src/features/settings/components/template-preview-dialog.spec.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the template preview layout slice**

```bash
git add apps/frontend/src/features/settings/components/template-preview-dialog.tsx apps/frontend/src/features/settings/components/template-preview-dialog.spec.tsx
git commit -m "fix: contain long email template headings"
```

### Task 5: Contain long Casso Flow account values

**Files:**
- Modify: `apps/frontend/src/features/bank-connections/components/casso-flow-account-picker.tsx`
- Modify: `apps/frontend/src/features/bank-connections/components/casso-flow-account-picker.spec.tsx`

**Interfaces:**
- Consumes: existing `CassoFlowAccountPreview` account rows and selection behavior.
- Produces: one-line account-number truncation with full-value title access and wrapped bank/holder names, without changing selected account numbers sent to `onConfirm`.

- [ ] **Step 1: Add the failing account-value regression test**

Append to `casso-flow-account-picker.spec.tsx`:

```tsx
  it('contains long account numbers and wraps long account-holder names', async () => {
    const accountNumber = `9704${'1'.repeat(70)}`;
    const accountHolderName = `NGUYEN VAN ${'A'.repeat(70)}`;
    const onPreview = vi.fn().mockResolvedValue({
      businessId: 'biz-1',
      accounts: [
        {
          accountNumber,
          bankName: 'VPBank',
          accountHolderName,
          status: 'AVAILABLE',
        },
      ],
    });

    render(
      <CassoFlowAccountPicker
        onPreview={onPreview}
        onConfirm={vi.fn().mockResolvedValue({ connected: [], skipped: [] })}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Casso Flow API Key/i), {
      target: { value: 'test-key' },
    });
    fireEvent.click(screen.getByRole('button', { name: /xem tài khoản/i }));

    const account = await screen.findByText(accountNumber);
    expect(account).toHaveClass('truncate');
    expect(account).toHaveAttribute('title', accountNumber);
    expect(screen.getByText(accountHolderName)).toHaveClass('break-words');
  });
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run:

```bash
cd apps/frontend && pnpm exec vitest run src/features/bank-connections/components/casso-flow-account-picker.spec.tsx
```

Expected: FAIL because the account number has no `truncate`/`title` and the holder name has no `break-words` class.

- [ ] **Step 3: Add the minimal account-row markup classes**

Keep the existing `min-w-0` account content wrapper and split compact account numbers from names:

```tsx
              <span className="min-w-0 text-sm">
                <span className="block break-words font-medium">
                  {account.bankName}
                </span>
                <span
                  className="block min-w-0 truncate"
                  title={account.accountNumber}
                >
                  {account.accountNumber}
                </span>
                <span className="block break-words text-muted-foreground">
                  {account.accountHolderName} · {statusMessage(account)}
                </span>
              </span>
```

Add `break-words` to the missing-account informational paragraph so a long comma-separated list cannot widen the form:

```tsx
        <p role="status" className="break-words text-sm text-muted-foreground">
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
cd apps/frontend && pnpm exec vitest run src/features/bank-connections/components/casso-flow-account-picker.spec.tsx
```

Expected: PASS, including the existing selection/confirmation tests.

- [ ] **Step 5: Commit the account-picker layout slice**

```bash
git add apps/frontend/src/features/bank-connections/components/casso-flow-account-picker.tsx apps/frontend/src/features/bank-connections/components/casso-flow-account-picker.spec.tsx
git commit -m "fix: contain long Casso Flow account values"
```

### Task 6: Run the complete verification set

**Files:**
- No source files; this task validates Tasks 1–5.

**Interfaces:**
- Consumes: all source and test changes from Tasks 1–5.
- Produces: verified frontend behavior and a clean repository-level validation result.

- [ ] **Step 1: Run every affected component/page test together**

Run:

```bash
cd apps/frontend && pnpm exec vitest run src/features/copilot/components/copilot-message-bubble.spec.tsx src/features/copilot/pages/copilot-page.spec.tsx src/features/exceptions/components/split-match-dialog.spec.tsx src/features/receivables/components/receivable-timeline.spec.tsx src/features/settings/components/template-preview-dialog.spec.tsx src/features/bank-connections/components/casso-flow-account-picker.spec.tsx
```

Expected: PASS with six targeted files green.

- [ ] **Step 2: Run the complete frontend test suite**

Run:

```bash
cd apps/frontend && pnpm test
```

Expected: PASS with no test failures.

- [ ] **Step 3: Run the frontend type-check and build**

Run:

```bash
cd apps/frontend && pnpm type-check && pnpm build
```

Expected: TypeScript exits successfully and Vite produces the frontend build.

- [ ] **Step 4: Run repository verification**

Run from the worktree root:

```bash
pnpm verify
```

Expected: PASS for the repository verification command.

- [ ] **Step 5: Run the required domain check**

Run the repository's domain-check skill command from the worktree:

```bash
/domain-check
```

Expected: no domain-layer violations. This frontend-only change should not alter domain files.

- [ ] **Step 6: Inspect the final diff and worktree status**

Run:

```bash
git diff --check
git status --short
git log -5 --oneline
```

Expected: no whitespace errors; only the issue #294 source/spec/plan files are changed; task commits are present.

---

## Self-review checklist

- [x] Copilot chat content is never truncated.
- [x] Transfer content and timeline descriptions wrap complete values.
- [x] Compact IDs/numbers/headings truncate only in compact slots and retain native full-value access.
- [x] Mobile split-match actions stack vertically.
- [x] Empty transfer content keeps its existing fallback; no API contract changes are introduced.
- [x] All six issue areas have a regression test path.
- [x] No new dependency, abstraction, backend change, or unrelated refactor is planned.
