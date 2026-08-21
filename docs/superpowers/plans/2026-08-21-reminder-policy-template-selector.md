# Reminder Policy Template Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text `emailTemplateId` UUID input in the Reminder Policy dialog with a `Select` populated from the organization's real email templates, without changing the wire contract.

**Architecture:** Move the existing `fetchEmailTemplates`/`useEmailTemplates` data layer (currently private to the `settings` feature) into `apps/frontend/src/lib/`, so both `settings` and `reminders` features share one query. Build a small controlled `EmailTemplateSelect` component in the `reminders` feature on top of that shared hook, and swap it into `PolicyDialog` in place of the raw `<Input>`.

**Tech Stack:** React 19, TanStack Query (`@tanstack/react-query`), shadcn/ui `Select` (Radix), react-router-dom `Link`, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-21-reminder-policy-template-selector-design.md`

## Global Constraints

- No backend/database changes — `GET /api/v1/email-templates` already exists and every role with `REMINDER_POLICY_WRITE` also has `EMAIL_TEMPLATE_READ` (spec §2).
- `ReminderRuleInput.emailTemplateId` stays `string` (a UUID) end to end — only the input widget changes (spec §5).
- No stage-based filtering of options — display only (spec §7).
- All new UI copy is Vietnamese, matching the rest of `policy-dialog.tsx`.
- Biome: single quotes, semicolons, 2-space indent, no trailing commas (`CLAUDE.local.md`).
- `import type` for pure types; value imports for anything used in JSX/constructor position.

---

### Task 1: Move `EmailTemplate` data layer into `lib/use-email-templates.ts`

This is a pure relocation (no behavior change) of code already covered by `apps/frontend/src/features/settings/components/email-templates-tab.spec.tsx`. Per TDD's REFACTOR step, the existing test is the regression guard here — no new test is written for this task; the deliverable is that test staying green after the move.

**Files:**
- Create: `apps/frontend/src/lib/use-email-templates.ts`
- Modify: `apps/frontend/src/features/settings/types.ts:1-14`
- Modify: `apps/frontend/src/features/settings/api/settings-api.ts:1-11,68-73`
- Modify: `apps/frontend/src/features/settings/api/use-settings.ts:1-39`
- Modify: `apps/frontend/src/features/settings/components/email-templates-tab.tsx:1-27`
- Modify: `apps/frontend/src/features/settings/components/template-preview-dialog.tsx:10`
- Modify: `apps/frontend/src/features/settings/components/template-dialog.tsx:16`

**Interfaces:**
- Produces (for Task 2/3 to consume): `EmailTemplate` interface, `emailTemplatesKey: readonly ['email-templates']`, `fetchEmailTemplates(): Promise<EmailTemplate[]>`, `useEmailTemplates(enabled = true)` — all exported from `@/lib/use-email-templates`.

- [ ] **Step 1: Create the shared module**

```typescript
// apps/frontend/src/lib/use-email-templates.ts
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from './api-client';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  reminderStage: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export const emailTemplatesKey = ['email-templates'] as const;

export function fetchEmailTemplates(): Promise<EmailTemplate[]> {
  return apiRequest<EmailTemplate[]>({
    url: '/api/v1/email-templates',
    method: 'GET',
  });
}

export function useEmailTemplates(enabled = true) {
  return useQuery({
    queryKey: emailTemplatesKey,
    queryFn: fetchEmailTemplates,
    enabled,
  });
}
```

- [ ] **Step 2: Remove `EmailTemplate` from settings types**

In `apps/frontend/src/features/settings/types.ts`, delete lines 5-14 (the `EmailTemplate` interface). The file now starts:

```typescript
import type { MembershipStatus, Role } from '@casso-ledger/shared-types';

export type { MembershipStatus };

export interface EmailTemplateInput {
  name: string;
  subject: string;
  bodyHtml: string;
}

export interface EmailTemplatePreview {
  subject: string;
  bodyHtml: string;
}
// ... rest of the file (SmtpConfig, OrganizationMember, etc.) unchanged
```

- [ ] **Step 3: Update `settings-api.ts`**

Change the top import (line 1-11) to pull `EmailTemplate` from the new shared module:

```typescript
import { apiRequest, postWithIdempotency } from '@/lib/api-client';
import type { EmailTemplate } from '@/lib/use-email-templates';
import type {
  EmailTemplateInput,
  EmailTemplatePreview,
  MemberStatusResponse,
  OrganizationInviteList,
  OrganizationMemberList,
  SmtpConfig,
  SmtpConfigInput,
} from '../types';
```

Delete the `fetchEmailTemplates` function (lines 68-73). `createEmailTemplate`, `updateEmailTemplate`, `deleteEmailTemplate`, `previewEmailTemplate` (lines 75-109) stay as-is — they still reference `EmailTemplate`/`EmailTemplateInput`/`EmailTemplatePreview`, now resolved from the two import statements above.

- [ ] **Step 4: Update `use-settings.ts`**

Replace the `const templatesKey = ['email-templates'];` line (line 30) and the `fetchEmailTemplates` import with a shared-key import, and delete the `useEmailTemplates` hook (lines 33-39):

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { emailTemplatesKey } from '@/lib/use-email-templates';
import type {
  EmailTemplateInput,
  OrganizationMemberList,
  SmtpConfigInput,
} from '../types';
import {
  blockMember,
  changeMemberRole,
  createEmailTemplate,
  deleteEmailTemplate,
  deleteSmtpConfig,
  fetchOrganizationInvites,
  fetchOrganizationMembers,
  fetchSmtpConfig,
  getResponseErrorMessage,
  initiatePlanUpgrade,
  inviteOrganizationMember,
  previewEmailTemplate,
  removeMember,
  resendInvite,
  revokeInvite,
  saveSmtpConfig,
  unblockMember,
  updateEmailTemplate,
} from './settings-api';

const smtpConfigKey = ['smtp-config'];

export function useSmtpConfig(enabled = true) {
  return useQuery({
    queryKey: smtpConfigKey,
    queryFn: fetchSmtpConfig,
    enabled,
  });
}
```

Every remaining use of `templatesKey` in this file (in `useCreateTemplate`, `useUpdateTemplate`, `useDeleteTemplate` — the `invalidateQueries({ queryKey: templatesKey })` calls) becomes `invalidateQueries({ queryKey: emailTemplatesKey })`.

- [ ] **Step 5: Update the three settings components' imports**

`apps/frontend/src/features/settings/components/email-templates-tab.tsx` line 26-27:

```typescript
import { useDeleteTemplate } from '../api/use-settings';
import { useEmailTemplates } from '@/lib/use-email-templates';
import type { EmailTemplate } from '@/lib/use-email-templates';
```

(keep the rest of the file's imports/body unchanged — `useEmailTemplates(canRead)` at line 41 still works, same signature)

`apps/frontend/src/features/settings/components/template-preview-dialog.tsx` line 10:

```typescript
import type { EmailTemplate } from '@/lib/use-email-templates';
```

`apps/frontend/src/features/settings/components/template-dialog.tsx` line 16:

```typescript
import type { EmailTemplate } from '@/lib/use-email-templates';
```

- [ ] **Step 6: Verify the existing regression test still passes**

Run: `npx vitest run apps/frontend/src/features/settings/components/email-templates-tab.spec.tsx`
Expected: PASS (2 tests, unchanged assertions — `email-templates-tab.spec.tsx` mocks `@/lib/api-client`, not the relocated files, so it is unaffected by the move)

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (confirms every updated import resolves)

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/lib/use-email-templates.ts apps/frontend/src/features/settings/types.ts apps/frontend/src/features/settings/api/settings-api.ts apps/frontend/src/features/settings/api/use-settings.ts apps/frontend/src/features/settings/components/email-templates-tab.tsx apps/frontend/src/features/settings/components/template-preview-dialog.tsx apps/frontend/src/features/settings/components/template-dialog.tsx
git commit -m "refactor: move email template query into shared lib hook"
```

---

### Task 2: `EmailTemplateSelect` component

**Files:**
- Create: `apps/frontend/src/features/reminders/components/email-template-select.tsx`
- Test: `apps/frontend/src/features/reminders/components/email-template-select.spec.tsx`

**Interfaces:**
- Consumes: `useEmailTemplates(): UseQueryResult<EmailTemplate[]>` and `EmailTemplate` from `@/lib/use-email-templates` (Task 1).
- Produces: `EmailTemplateSelect({ value, onChange, id, ariaLabel }: EmailTemplateSelectProps)` — a controlled component; `value: string`, `onChange: (templateId: string) => void`, `id?: string`, `ariaLabel?: string`. Consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/frontend/src/features/reminders/components/email-template-select.spec.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { EmailTemplateSelect } from './email-template-select';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const template1 = {
  id: 't1',
  name: 'Nhắc trước hạn',
  subject: 'Sub',
  bodyHtml: '<p/>',
  reminderStage: 'DAY_3_BEFORE',
  isDefault: true,
  createdAt: '2026-08-01',
  updatedAt: '2026-08-01',
};
const template2 = {
  id: 't2',
  name: 'Nhắc quá hạn',
  subject: 'Sub2',
  bodyHtml: '<p/>',
  reminderStage: null,
  isDefault: true,
  createdAt: '2026-08-01',
  updatedAt: '2026-08-01',
};

function renderSelect(value: string, onChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <EmailTemplateSelect
          value={value}
          onChange={onChange}
          ariaLabel="Email template 1"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onChange };
}

describe('EmailTemplateSelect', () => {
  it('disables the trigger while loading', () => {
    apiRequest.mockReturnValue(new Promise(() => {}));
    renderSelect('');
    expect(
      screen.getByRole('combobox', { name: 'Email template 1' }),
    ).toBeDisabled();
  });

  it('shows a retry button on fetch error', async () => {
    apiRequest.mockRejectedValue(new Error('network'));
    renderSelect('');
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Email template 1' }),
      ).toBeDisabled(),
    );
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });

  it('disables the trigger and links to settings when there are no templates', async () => {
    apiRequest.mockResolvedValue([]);
    renderSelect('');
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Email template 1' }),
      ).toBeDisabled(),
    );
    expect(
      screen.getByRole('link', { name: /Tạo email template/i }),
    ).toHaveAttribute('href', '/settings?tab=templates');
  });

  it('renders template name with stage, and name only when stage is null', async () => {
    apiRequest.mockResolvedValue([template1, template2]);
    renderSelect('');
    fireEvent.click(
      await screen.findByRole('combobox', { name: 'Email template 1' }),
    );
    expect(
      screen.getByRole('option', { name: 'Nhắc trước hạn — DAY_3_BEFORE' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('option', { name: 'Nhắc quá hạn' }),
    ).toBeTruthy();
  });

  it('calls onChange with the selected template id', async () => {
    apiRequest.mockResolvedValue([template1, template2]);
    const { onChange } = renderSelect('');
    fireEvent.click(
      await screen.findByRole('combobox', { name: 'Email template 1' }),
    );
    fireEvent.click(screen.getByRole('option', { name: 'Nhắc quá hạn' }));
    expect(onChange).toHaveBeenCalledWith('t2');
  });

  it('keeps an orphaned value visible as a disabled option', async () => {
    apiRequest.mockResolvedValue([template1]);
    renderSelect('missing-id');
    fireEvent.click(
      await screen.findByRole('combobox', { name: 'Email template 1' }),
    );
    const orphanOption = screen.getByRole('option', {
      name: 'Template không tồn tại (id: missing-id)',
    });
    expect(orphanOption).toHaveAttribute('aria-disabled', 'true');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/frontend/src/features/reminders/components/email-template-select.spec.tsx`
Expected: FAIL — `Cannot find module './email-template-select'` (the component doesn't exist yet)

- [ ] **Step 3: Write the implementation**

```tsx
// apps/frontend/src/features/reminders/components/email-template-select.tsx
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEmailTemplates } from '@/lib/use-email-templates';

interface EmailTemplateSelectProps {
  value: string;
  onChange: (templateId: string) => void;
  id?: string;
  ariaLabel?: string;
}

function templateLabel(template: { name: string; reminderStage: string | null }): string {
  return template.reminderStage
    ? `${template.name} — ${template.reminderStage}`
    : template.name;
}

export function EmailTemplateSelect({
  value,
  onChange,
  id,
  ariaLabel,
}: EmailTemplateSelectProps) {
  const { data: templates, isLoading, isError, refetch } = useEmailTemplates();

  if (isLoading) {
    return (
      <Select disabled>
        <SelectTrigger id={id} aria-label={ariaLabel} className="w-full">
          <SelectValue placeholder="Đang tải template…" />
        </SelectTrigger>
        <SelectContent />
      </Select>
    );
  }

  if (isError) {
    return (
      <div className="space-y-1">
        <Select disabled>
          <SelectTrigger id={id} aria-label={ariaLabel} className="w-full">
            <SelectValue placeholder="Không tải được danh sách template." />
          </SelectTrigger>
          <SelectContent />
        </Select>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0"
          onClick={() => refetch()}
        >
          Thử lại
        </Button>
      </div>
    );
  }

  const list = templates ?? [];

  if (list.length === 0) {
    return (
      <div className="space-y-1">
        <Select disabled>
          <SelectTrigger id={id} aria-label={ariaLabel} className="w-full">
            <SelectValue placeholder="Chưa có email template." />
          </SelectTrigger>
          <SelectContent />
        </Select>
        <Link
          to="/settings?tab=templates"
          className="text-xs text-primary underline"
        >
          Tạo email template trong Cài đặt
        </Link>
      </div>
    );
  }

  const hasOrphanedValue = value !== '' && !list.some((t) => t.id === value);

  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label={ariaLabel} className="w-full">
        <SelectValue placeholder="Chọn email template" />
      </SelectTrigger>
      <SelectContent>
        {hasOrphanedValue && (
          <SelectItem value={value} disabled>
            {`Template không tồn tại (id: ${value})`}
          </SelectItem>
        )}
        {list.map((template) => (
          <SelectItem key={template.id} value={template.id}>
            {templateLabel(template)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/frontend/src/features/reminders/components/email-template-select.spec.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/reminders/components/email-template-select.tsx apps/frontend/src/features/reminders/components/email-template-select.spec.tsx
git commit -m "feat: add EmailTemplateSelect for reminder rules"
```

---

### Task 3: Wire `EmailTemplateSelect` into `PolicyDialog`

**Files:**
- Modify: `apps/frontend/src/features/reminders/components/policy-dialog.tsx:1-33,233-245`
- Test: `apps/frontend/src/features/reminders/components/policy-dialog.spec.tsx` (new)

**Interfaces:**
- Consumes: `EmailTemplateSelect` from Task 2 (same directory, `./email-template-select`).

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/frontend/src/features/reminders/components/policy-dialog.spec.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PolicyDialog } from './policy-dialog';

const apiRequest = vi.fn();
const useAuth = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth }));

const template = {
  id: 't1',
  name: 'Nhắc trước hạn',
  subject: 'Sub',
  bodyHtml: '<p/>',
  reminderStage: 'DAY_3_BEFORE',
  isDefault: true,
  createdAt: '2026-08-01',
  updatedAt: '2026-08-01',
};

function renderDialog() {
  useAuth.mockReturnValue({ user: { role: 'OWNER' } });
  apiRequest.mockImplementation((config: { url: string; method: string }) => {
    if (config.url === '/api/v1/email-templates') {
      return Promise.resolve([template]);
    }
    return Promise.resolve({ id: 'p1' });
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PolicyDialog policy={null} open onOpenChange={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PolicyDialog', () => {
  it('blocks submit with a toast when no template is selected for a rule', async () => {
    renderDialog();
    await screen.findByRole('combobox', { name: /Email template 1/i });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu chính sách' }));

    expect(apiRequest).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('submits the selected template UUID as emailTemplateId', async () => {
    renderDialog();
    fireEvent.click(
      await screen.findByRole('combobox', { name: /Email template 1/i }),
    );
    fireEvent.click(screen.getByRole('option', { name: /Nhắc trước hạn/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Lưu chính sách' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/api/v1/reminder-policies',
          data: expect.objectContaining({
            rules: [expect.objectContaining({ emailTemplateId: 't1' })],
          }),
        }),
      ),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/frontend/src/features/reminders/components/policy-dialog.spec.tsx`
Expected: FAIL — no accessible element with the role "combobox" and name "Email template 1" (the field is still a plain `<Input>`)

- [ ] **Step 3: Replace the free-text input with the selector**

In `apps/frontend/src/features/reminders/components/policy-dialog.tsx`, add the import (near the other local imports, after line 27):

```typescript
import { EmailTemplateSelect } from './email-template-select';
```

Replace lines 233-245 (the `<Label>` wrapping the `emailTemplateId` `<Input>`):

```tsx
<Label className="space-y-1">
  <span className="text-xs">Email template</span>
  <EmailTemplateSelect
    id={`emailTemplateId-${index}`}
    ariaLabel={`Email template ${index + 1}`}
    value={rule.emailTemplateId}
    onChange={(templateId) =>
      setRule(index, 'emailTemplateId', templateId)
    }
  />
</Label>
```

No other change is needed: `setRule(index, field, value: string)` (line 86-101) already accepts a plain string for `field === 'emailTemplateId'`, and the `rule.emailTemplateId.trim()` check in `submit()` (line 108) still rejects an empty selection with the existing Vietnamese toast.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/frontend/src/features/reminders/components/policy-dialog.spec.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full reminders feature test suite**

Run: `npx vitest run apps/frontend/src/features/reminders`
Expected: PASS (includes `policy-table.spec.tsx`, `reminders-page.spec.tsx`, and the two new spec files — confirms the change didn't regress sibling components)

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/reminders/components/policy-dialog.tsx apps/frontend/src/features/reminders/components/policy-dialog.spec.tsx
git commit -m "feat: select email templates by name in reminder policy rules"
```

---

### Task 4: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full frontend test suite**

Run: `pnpm --filter @casso-ledger/frontend test` (or the workspace's equivalent `pnpm test` — confirm the exact script name in `apps/frontend/package.json` before running)
Expected: PASS, no regressions outside the files touched above

- [ ] **Step 2: Full type-check and lint**

Run: `npx tsc --noEmit` then `npx biome check .`
Expected: no errors

- [ ] **Step 3: Update the feature map**

If `docs/wayfinder/feature-map.md` has an entry tracking this fix (issue #289), update its status to `done` with the shipped date and PR reference once the PR is opened. If no entry exists for this follow-up fix, skip this step — it is a small UX fix on top of already-shipped work (spec §7 "Out of scope"), not a new plan entry.

- [ ] **Step 4: Manually verify in the running app**

Start `pnpm dev:backend` and the frontend dev server, open the Reminders page, create/edit a policy, confirm the dropdown loads seeded templates, shows name + stage, saves correctly, and that a policy with a deleted template's UUID still opens without crashing (shows the disabled "not found" option).
