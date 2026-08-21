# Frontend long-content layout hardening

Status: approved for planning
Date: 2026-08-21
Related issue: [#294](https://github.com/lengocanh2005it/casso-ledger/issues/294)

## Goal

Keep the frontend readable and free of horizontal overflow when API values contain long text or strings without whitespace, including URLs, UUIDs, provider transaction IDs, receivable IDs, account numbers, account-holder names, template names, subjects, and Copilot content.

## Current problem

Several flex children currently keep their automatic minimum width, and several text nodes have no wrapping or truncation policy. A single long token can therefore widen a chat column, card, dialog, or account row beyond its available viewport. The affected components already use Tailwind utilities and have local Vitest coverage; the fix should stay at those boundaries.

## Scope

Modify only these issue areas:

- `apps/frontend/src/features/copilot/components/copilot-message-bubble.tsx`
- `apps/frontend/src/features/copilot/pages/copilot-page.tsx`
- `apps/frontend/src/features/exceptions/components/split-match-dialog.tsx`
- `apps/frontend/src/features/receivables/components/receivable-timeline.tsx`
- `apps/frontend/src/features/settings/components/template-preview-dialog.tsx`
- `apps/frontend/src/features/bank-connections/components/casso-flow-account-picker.tsx`

Update the five existing component/page specs for the affected areas and add `template-preview-dialog.spec.tsx`. No backend, API, schema, dependency, or shared design-system changes are included.

## Display policy

| Surface | Long-value policy | Full value access |
| --- | --- | --- |
| Copilot user and assistant messages | Keep the complete message; use `min-w-0` on the flex path and `break-words` on the bubble text | Complete text remains in the DOM |
| Copilot chat column | Add `min-w-0` to the shrinkable flex child | N/A |
| Transfer content and timeline descriptions | Keep complete prose; use `break-words` | Complete text remains visible |
| Provider transaction ID, receivable ID, account number | Use one-line `truncate` in compact rows/title slots | Keep the full text node and add `title` with the original value |
| Template name and preview subject | Use one-line `truncate` in the dialog's compact heading slots | Keep the full text node and add `title` with the original value |
| Bank name and account-holder name | Keep complete names and use `break-words` | Complete text remains visible |
| Split-match action buttons | Stack vertically on narrow screens and use a horizontal row from `sm` upward | All actions remain visible and keyboard reachable |

`break-all` is reserved for machine-generated tokens when wrapping is preferable to truncation. This issue uses truncation for compact identifiers and wrapping for prose/names, so it does not introduce a new helper or CSS abstraction.

## Empty values

- Keep the existing `Không có nội dung` fallback for blank transfer content.
- Use `—` for a missing compact metadata value where the component can receive one without changing its TypeScript/API contract.
- Do not add frontend coercion or alter API payloads solely to manufacture values that the current types declare as required.

## Accessibility and responsive behavior

- Do not hide the full value from the DOM when applying `truncate`.
- Native `title` attributes provide the full value for sighted users without introducing a tooltip dependency or component state.
- Preserve existing semantic elements, labels, checkbox names, dialog semantics, and keyboard behavior.
- The chat message itself is never truncated.
- Existing spacing, colors, typography, and shadcn components remain unchanged.

## Testing

Use the existing Vitest + Testing Library setup. Add one representative long-data regression per affected surface:

- Copilot message bubble and page: wrapping and shrinkable chat-column classes.
- Split-match dialog: compact ID truncation/title and mobile action stack.
- Receivable timeline: long description wrapping.
- Template preview dialog: long name/subject truncation/title.
- Casso Flow account picker: account-number truncation/title and holder-name wrapping.

Tests assert observable DOM classes/attributes and rendered content; they do not measure pixels or depend on a browser viewport matrix.

## Non-goals

- Backend, API, database, or payload changes.
- New tooltip, truncation, or design-system abstractions.
- Broad refactoring of unrelated components that already handle long values.
- Truncating Copilot messages, transfer content, or timeline descriptions.
