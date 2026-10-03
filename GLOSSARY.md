# Casso Ledger AR

This glossary names the business concepts used to track receivables and incoming payments.

## Payments and matching

**Near-match overpayment**:
An incoming bank transfer that exceeds a candidate receivable's remaining balance but still appears to be a plausible payment for it.

**Auto-match**:
Allocating an incoming bank transfer to a receivable without human input. Allowed only when the top candidate scores at least 90 and leads the runner-up by at least 10 points.
_Avoid_: Auto-allocation

**Ambiguous match**:
An incoming bank transfer whose top receivable candidate does not lead the runner-up by at least 10 points, whether the competing receivables belong to the same customer or different ones. It always needs a human to choose, even when the top score is 90 or more.
_Avoid_: Tie, Conflict

**Exact invoice reference**:
A bank transfer's content contains an open receivable's complete invoice number, ignoring case and separators and not as part of a longer number. Such a receivable is always considered for matching, however many other open receivables exist.
_Avoid_: Invoice code match

**Customer credit**:
Received money that has not been allocated to a receivable and is held for an accountant to allocate intentionally later.

## Billing plans

**Plan catalog**:
The set of subscription plans and the prices and usage limits that define each plan.

## Bank notifications

**Webhook inbox**:
The record of one bank transaction notification received from Casso Flow, tracked from `RECEIVED` to `PROCESSED` or `FAILED`. `FAILED` can be retried; `PROCESSED` is terminal and never reverts, even if the job is redelivered.
_Avoid_: Webhook log, webhook event
