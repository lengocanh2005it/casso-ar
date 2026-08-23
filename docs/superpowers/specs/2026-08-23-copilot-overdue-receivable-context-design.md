# Copilot Overdue Receivable Context

Date: 2026-08-23
Status: Design approved after grilling and domain modeling

## Problem

Collection Copilot can summarize receivables only when the model already has a
`customerId`. Its current summary is aggregate data, so a generic request such
as “Soạn email nhắc thanh toán cho hoá đơn quá hạn” cannot discover the
organization's overdue receivables, present human-readable choices, or resolve
one receivable for a reminder draft.

The existing `draftReminderEmail` tool correctly requires a `receivableId`,
checks tenant ownership, and derives the recipient email from the customer. The
missing piece is the read-side discovery and selection flow before that tool is
called.

## Goals

- Let a user make a generic overdue-invoice reminder request without knowing an
  internal customer or receivable UUID.
- Return at most 20 human-readable reminder candidates from the current
  organization.
- Filter by customer name or invoice number when the user's request contains a
  search term.
- Let the user choose among multiple candidates through the existing chat
  conversation.
- Create a draft automatically when exactly one candidate remains; never send
  it without the existing confirmation flow.
- Preserve tenant isolation, SALES_REP assignment scope, reminder permission
  gates, and existing Copilot draft/send behavior.

## Non-goals

- No new HTTP endpoint, database table, migration, or persisted selection state.
- No new frontend selection cards or changes to the existing generic quick
  suggestions.
- No changes to `getReceivableSummary` for existing customer-specific queries.
- No changes to reminder sending, confirmation, cancellation, or pending-action
  semantics.
- No general-purpose Copilot search engine or pagination UI.

## Domain language

The domain model does not gain a new entity or state:

- An **overdue receivable** is an `OPEN` or `PARTIALLY_PAID` receivable whose
  due date has passed and whose remaining balance is positive. Overdue is a
  computed condition, not a persisted status.
- A **reminder candidate** is an overdue receivable presented for collection
  follow-up and draft selection. It is not a separate receivable type or
  persisted entity.

These terms are recorded in the repository glossary in `CONTEXT.md`.

## Chosen approach

Add a dedicated read-only Copilot tool, `findOverdueReceivables`, and register
it alongside the existing Copilot tools. The tool stays in the application
layer and depends only on repository ports and tenant context. It resolves
customer/invoice display data in batches and returns a structured candidate
list to the model.

The receivable repository gets the narrowest query-port extension needed for
overdue candidates. Existing callers of `findOverdueByThreshold` and the
general receivable list flow remain unchanged. The tool does not expose a new
HTTP contract.

### Why this approach

- It keeps the change inside the Copilot use-case boundary.
- It avoids adding Copilot-specific semantics to the general receivables list
  endpoint.
- It uses existing customer and invoice repository ports for enrichment.
- It needs no new persistence or frontend state.

## Tool contract

### Input

```ts
{
  search?: string;
  limit?: number; // default 20, maximum 20
}
```

`search` is an optional, case-insensitive partial search over customer name and
invoice number. Amount and due date are display/disambiguation fields, not
search predicates.

### Output

```ts
{
  items: Array<{
    receivableId: string;
    customerName: string;
    invoiceNumber: string | null;
    remainingAmount: number;
    dueDate: string;
  }>;
}
```

`receivableId` is available only to the model/tool loop so a subsequent
`draftReminderEmail` call can identify the selected record. It is not included
in the public Copilot message DTO or displayed in the assistant's human-facing
list.

## Query rules

The tool must:

1. Read the current `organizationId`, `userId`, and `role` from tenant context.
2. Select only `OPEN` and `PARTIALLY_PAID` receivables.
3. Select only receivables whose due date is before the reference time.
4. Exclude zero or negative remaining balances.
5. Apply `organizationId` to every receivable, customer, and invoice lookup.
6. For `SALES_REP`, additionally restrict to `salesRepresentativeId = userId`.
7. Resolve optional search matches through customer name or invoice number.
8. Enrich candidates with customer name and invoice number using batched reads.
9. Sort by oldest due date first, with a deterministic tie-breaker.
10. Return no more than 20 candidates.

If no invoice is linked, `invoiceNumber` remains null and the assistant displays
`Chưa có số hóa đơn`.

## Conversation flow

### Generic request

The model calls `findOverdueReceivables` without `search`.

- Zero candidates: respond in Vietnamese that no matching overdue receivable was
  found; do not call `draftReminderEmail`.
- One candidate: use the tool's amount and due date as authoritative data and
  call `draftReminderEmail`.
- Multiple candidates: show a numbered list containing customer name, invoice
  number, remaining amount, and due date; wait for the user's selection.

### Search or selection

When a user names a customer or invoice, or replies to a numbered list, the
model calls `findOverdueReceivables` again using the human-readable customer or
invoice value. This fresh lookup avoids depending on a UUID or persisted
selection state from an earlier turn.

- If the fresh lookup returns one candidate, create the draft.
- If it returns multiple candidates, show the narrowed list again.
- If it returns none, explain that the selected overdue receivable is no longer
  available and do not create a draft.

If 20 candidates are returned, the model treats the result as ambiguous and
asks the user to narrow by customer name or invoice number; it never guesses a
candidate.

The system prompt must recognize `findOverdueReceivables` as an authoritative
source for the real remaining amount and due date, in addition to the existing
`getReceivableSummary` tool.

## Security and error handling

- The read tool is available to users who can use Copilot; it does not require
  `REMINDER_SEND_MANUAL`.
- `draftReminderEmail` remains permission-gated by the existing tool registry.
- Cross-tenant records must be invisible to the lookup and draft flow.
- Internal UUIDs must not be included in user-facing option text.
- Invalid `search` or `limit` values return the standard validation error.
- A zero-result lookup is a normal empty result, not a server error.
- Existing draft, pending-action, confirmation, cancellation, and send errors
  remain unchanged.

The lookup performs no writes and does not need a database transaction. Draft
creation and all existing reminder writes retain their current transaction and
permission behavior.

## Testing strategy

Follow RED → GREEN → REFACTOR for the new behavior.

### Unit coverage

- Generic lookup returns multiple candidates.
- Search by customer name returns the matching candidate set.
- Search by invoice number returns the matching candidate set.
- No search match returns an empty list.
- Only overdue, open/partially-paid, positive-balance records are returned.
- Oldest due date ordering and the 20-item cap are deterministic.
- Missing invoice number is represented as null.
- SALES_REP sees only assigned receivables.
- Cross-organization records are excluded.

### Integration coverage

Extend the existing Copilot chat integration coverage for:

- Generic request → human-readable multiple options.
- User selection → fresh lookup → draft with the real amount, due date, and
  recipient email.
- No matching overdue receivable → Vietnamese response and no draft.
- Permission-gated draft behavior remains intact.
- Tenant isolation remains intact.

The existing frontend quick-suggestion test remains the regression guard for
the already-generic suggestion text; no frontend implementation change is
needed.

## Rejected alternatives

### Extend `ListReceivablesUseCase`

This would reuse some enrichment code but would make the general receivable
list contract carry Copilot-specific overdue semantics and role/search behavior.
The dedicated tool keeps the change bounded.

### Keep using `getReceivableSummary`

This still requires a customer UUID and returns aggregate data rather than
selectable receivable candidates, so it cannot satisfy the issue.
