# Copilot Overdue Receivable Pagination

## Goal

Keep overdue-receivable answers readable and bounded, while letting a user ask Copilot for the next batch without repeating the search.

## Approved behavior

- Return at most 10 overdue receivables in one assistant response.
- Keep one row per receivable/invoice. A customer with multiple overdue receivables may appear in multiple rows; do not aggregate by customer.
- If more rows exist, tell the user that more results are available and invite them to send “xem tiếp”. Do not claim an exact total count.
- On “xem tiếp”, fetch the next batch using an internal continuation cursor. The cursor follows the existing stable order: due date ascending, then receivable ID ascending. Never show the cursor or internal IDs to the user.
- Keep the current organization and sales-representative scoping on every page. Preserve any customer/invoice search term when continuing.
- Limit Copilot output to 2,048 tokens per model call. The row limit, rather than the token ceiling, is the primary bound on list size.

## Implementation shape

The overdue-receivables tool accepts an optional cursor and returns up to 10 items plus `hasMore` and a `nextCursor` when applicable. The repository fetches one extra row to determine whether another page exists and uses keyset filtering over `(dueDate, id)`. The Copilot prompt instructs the model to use the most recent matching cursor when the user asks to continue, preserve the search term, and keep continuation metadata private.

No frontend pagination control or exact-count query is needed for this conversational flow.

## Tests

- Tool tests cover the 10-item maximum, `hasMore`, and the next cursor.
- Repository tests cover the due-date/ID keyset condition and existing tenant scope.
- Copilot use-case tests cover cursor forwarding for “xem tiếp” and the continuation response guidance.
- Provider/use-case tests verify the 2,048-token budget is applied to streaming and non-streaming Copilot calls while the shared provider default remains unchanged for other callers.

## Out of scope

- Grouping receivables by customer or showing aggregated customer totals.
- Fetching or displaying all results in one response.
- Returning an exact total count or adding a separate frontend results table.
