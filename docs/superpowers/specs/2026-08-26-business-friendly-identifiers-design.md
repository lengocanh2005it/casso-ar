# Business-Friendly Identifier Display Design

## Goal

Make tenant-facing workflows readable for Vietnamese business users by showing
business labels (customer name, invoice number, payer, and bank reference)
instead of raw UUIDs as the primary visible values.

## Scope

- Replace manual `customerId` entry in receivable creation with the existing
  customer search pattern; submit the selected UUID internally.
- Add display metadata to receivable details, payment allocations, matching
  candidates, reminder executions, and Copilot pending actions.
- Keep raw IDs available as secondary copyable technical references.
- Replace technical/English labels found in these workflows with Vietnamese
  business copy and stable fallback labels.
- Improve reminder and balance-history filters so their visible wording names
  invoice/customer concepts rather than internal IDs where the API supports it.

## Out of scope

- Admin/operator identifiers, webhook raw payloads, and audit payload integrity.
  These remain technical surfaces; IDs may be shown as explicit technical
  metadata there.
- A new design system, component library, or dependency.
- Reworking landing-page visuals, authentication pages, or the remaining broad
  UI-audit issues.

## Presentation rules

1. A business label is the primary value: customer name, invoice number,
   payer name, or provider transaction reference depending on the workflow.
2. A raw UUID is never the only visible label in a tenant-facing business
   action. It may appear in a low-emphasis copyable secondary control.
3. Missing business metadata uses a stable Vietnamese fallback such as
   `Chưa có tên khách hàng`, `Khoản phải thu`, or `Khoản thanh toán`; it does not
   fall back directly to a UUID.
4. Enum values are mapped to Vietnamese labels. Unknown future values use a
   safe generic label rather than exposing an internal code.
5. Existing `useCustomers`, `getReceivableDisplayName`, `TruncatedCopyId`, and
   formatting helpers are reused.

## Backend data flow

- `ReceivableDetailResponseDto` includes the current customer display name.
- `PaymentAllocationResponseDto` includes the payer/provider reference data
  needed by the detail table, resolved with a bounded read query.
- `MatchingCandidateResponseDto` includes invoice number, customer name, and
  remaining amount for the candidate row.
- `ReminderExecutionResponseDto` includes invoice number and customer name.
- `CopilotPendingActionDto` includes a presentation label while retaining the
  action payload IDs for authorization and execution.

Read-side joins/projections must remain organization-scoped and must not alter
transactional rollups or immutable audit snapshots. If a referenced row is
missing, the response returns null display metadata and the frontend applies
the fallback rule.

## Frontend behavior

- Receivable creation renders a searchable customer selector and stores the
  selected ID, matching the existing exception-queue customer search.
- Receivable lists/details, payment allocations, exception split-match rows,
  reminder executions, and Copilot confirmation cards render the new display
  metadata first.
- Technical references use the existing copy/truncation affordance and are
  secondary to the business label.
- Copilot confirmation text and reminder/policy/template labels are Vietnamese.

## Testing

- Add component tests for customer selection, missing-metadata fallbacks, and
  Vietnamese labels on each changed tenant-facing component.
- Add application/presentation tests for the new response metadata and
  organization-scoped lookups.
- Run focused frontend/backend tests after each vertical slice, then the full
  relevant suites, type checks, `domain-check`, `pnpm verify`, and a two-axis
  code review before completion.
