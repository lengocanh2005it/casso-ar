# Reminder Policy Template Selector Design

> Fixes [issue #289](https://github.com/lengocanh2005it/casso-ledger/issues/289). Touches `apps/frontend/src/features/reminders/` and `apps/frontend/src/features/settings/`.

## 1. Problem

`PolicyDialog` (`apps/frontend/src/features/reminders/components/policy-dialog.tsx`) renders `emailTemplateId` as a free-text `<Input>` per rule (lines 233-244). Users must know/copy the seeded template's UUID by hand. The Email Templates settings page already lists templates by name but the two features don't share data.

## 2. Data layer

Move `fetchEmailTemplates()` out of `apps/frontend/src/features/settings/api/settings-api.ts` into a new shared hook:

```
apps/frontend/src/lib/use-email-templates.ts

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

export function fetchEmailTemplates(): Promise<EmailTemplate[]>   // GET /api/v1/email-templates via apiRequest
export function useEmailTemplates()                                // useQuery wrapper
```

This mirrors the existing cross-feature hook convention in `lib/` (`use-bulk-selection.ts`, `use-csv-export.ts`, `use-debounced-value.ts` — see `.claude/rules/frontend.md`, "Only move to `components/`/`lib/` when shared by 2+ features").

`apps/frontend/src/features/settings/api/settings-api.ts` and any component calling `fetchEmailTemplates` there switch to importing from `lib/use-email-templates.ts`; the old copy is deleted, not kept as a re-export.

No backend change. `GET /api/v1/email-templates` already exists (`RequirePermission(Permission.EMAIL_TEMPLATE_READ)`), and every role with `REMINDER_POLICY_WRITE` also has `EMAIL_TEMPLATE_READ` (`packages/shared-types/src/role-permissions.ts`), so no permission gap.

## 3. UI component

New file `apps/frontend/src/features/reminders/components/email-template-select.tsx`:

```tsx
interface EmailTemplateSelectProps {
  value: string;
  onChange: (templateId: string) => void;
  id?: string;
  ariaLabel?: string;
}
```

Renders a shadcn `Select` (same primitives already used for `customerGroup` in `policy-dialog.tsx:160-177`), backed by `useEmailTemplates()`:

- **Loading:** `SelectTrigger` disabled, placeholder text `"Đang tải template…"`.
- **Error:** `SelectTrigger` disabled, inline text `"Không tải được danh sách template."` + a retry button that calls the query's `refetch()`.
- **Empty** (`data.length === 0`): `SelectTrigger` disabled, inline text `"Chưa có email template."` with a link to `/settings` (Email Templates tab) to create one.
- **Options:** one `SelectItem` per template, value = `template.id`, label = `${template.name}` + (`" — " + template.reminderStage` if `reminderStage` is non-null, else nothing).
- **Orphaned value:** if `value` is non-empty and does not match any `template.id` in the loaded list (and the list finished loading without error), prepend one extra `SelectItem` with `value={value}`, `disabled`, label `` `Template không tồn tại (id: ${value})` ``. This keeps the field's current value selected/visible instead of silently blanking it.

The component is a controlled input: `policy-dialog.tsx` keeps owning `rule.emailTemplateId` in its `rules` state and passes `value`/`onChange` through, same as it does for the existing `Input` fields — no new state management library.

## 4. `policy-dialog.tsx` changes

Replace the `<Input name={`emailTemplateId-${index}`} ...>` block (lines 233-245) with:

```tsx
<Label className="space-y-1">
  <span className="text-xs">Email template</span>
  <EmailTemplateSelect
    id={`emailTemplateId-${index}`}
    ariaLabel={`Email template ${index + 1}`}
    value={rule.emailTemplateId}
    onChange={(templateId) => setRule(index, 'emailTemplateId', templateId)}
  />
</Label>
```

`setRule` already accepts `(index, field, value: string)` — no signature change needed. The `rule.emailTemplateId.trim()` required check in `submit()` (line 108) stays as-is: it still fails validation if no template was ever selected.

## 5. Types unchanged

`ReminderRuleInput.emailTemplateId: string` (`apps/frontend/src/features/reminders/types.ts:3-8`) and the request/response contract to the backend (`POST`/`PATCH /reminder-policies`) are unchanged — the frontend still sends a plain UUID string.

## 6. Testing

- `apps/frontend/src/features/reminders/components/email-template-select.spec.tsx` (new): loading state, empty state (with settings link), error state (with retry), renders options with name + stage, calls `onChange` with the template id on selection, renders a disabled "not found" option for an orphaned value and leaves `value` unchanged.
- `apps/frontend/src/features/reminders/components/policy-dialog.spec.tsx` (new — none exists today): submitting with no template selected still shows the existing Vietnamese validation toast; selecting a template from the dropdown flows through to the create/update mutation payload.
- Mock pattern: follow `apps/frontend/src/features/settings/components/email-templates-tab.spec.tsx` — `vi.mock('@/lib/api-client', ...)` with a hoisted `apiRequest` mock, wrap in `QueryClientProvider`.

## 7. Out of scope

- No backend/database changes (no migration, no `template-code` column — matches the issue's stated scope).
- No stage-based auto-filtering of the options list (issue only asks to *display* stage, not filter by it).
- No change to `settings` feature's own UI/behavior beyond swapping its import source for `fetchEmailTemplates`.

## 8. Open questions (do not block implementation)

- None — all judgment calls were resolved during design review (grilling): shared hook in `lib/`, plain `Select` (not searchable combobox), disabled placeholder for orphaned UUIDs, disabled selector + settings link for the empty-template case.
