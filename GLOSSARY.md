# Casso Ledger AR

This glossary names the business concepts used to track receivables and incoming payments.

## Payments and matching

**Payment allocation**:
Assignment of an amount from a received payment to a receivable. One payment can fund multiple receivables, and one receivable can receive allocations from multiple payments.

**Allocation undo**:
Reversal of an active payment allocation that restores the receivable balance while preserving the original allocation as history. A separate collection activity records the undone amount, actor, and reason.

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

## Collections

**Collection activity**:
An immutable timeline entry about collection work or a receivable change. It explains the receivable's history; the underlying payment and receivable records remain the financial source of truth.

## Billing plans

**Plan catalog**:
The set of subscription plans and the prices and usage limits that define each plan.

**Plan upgrade payment**:
A one-off payment to move an organization's subscription to a strictly higher plan tier.
_Avoid_: Renewal

**Period charge**:
A payment for a billing period that keeps an organization's subscription on its current paid tier. Renewal means paying this charge, not an automatic debit.
_Avoid_: Auto-renewal

**Plan payment history**:
An organization's record of plan payment receipts and older completed plan payments, including evidence requiring review before plan access can be granted. Unpaid attempts are outside this history; older completed payments can have an unknown amount.
_Avoid_: Customer payment history, checkout attempt history

**Plan payment receipt**:
Evidence of one distinct incoming transfer for a plan upgrade payment or period charge. One payment order can receive several transfers; another delivery of the same receipt is not another transfer.
_Avoid_: Payment order, checkout attempt

**Plan payment under review**:
Evidence of a plan payment receipt whose transfer identity, received amount or current eligibility cannot be accepted automatically. Receipt of the money does not itself grant or renew plan access.
_Avoid_: Failed payment, unpaid attempt

**Received amount**:
The integer VND reported for a plan payment transfer in authenticated PayOS transaction data. It is distinct from the checkout quote and from the total amount received across an order.
_Avoid_: Plan price, checkout quote

**Initial payment confirmation outcome**:
The result of checking a plan payment receipt when it is first confirmed. It records whether the receipt was accepted automatically or required review at that moment, rather than the current progress of a review task.
_Avoid_: Current reconciliation status

**Checkout quote**:
The amount an organization is asked to pay for a plan payment, fixed when its payment link is created.
_Avoid_: Current catalog price, amount received

**Payment confirmation time**:
The moment the platform confirms receipt of money for a plan payment. It is distinct from the payer's transfer time and from granting plan access.
_Avoid_: Transfer time

## Bank notifications

**Webhook inbox**:
The record of one bank transaction notification received from Casso Flow, tracked from `RECEIVED` to `PROCESSED` or `FAILED`. `FAILED` can be retried; `PROCESSED` is terminal and never reverts, even if the job is redelivered.
_Avoid_: Webhook log, webhook event

**Webhook inbox recovery**:
Getting a persisted `RECEIVED` webhook inbox back onto the queue after its enqueue failed, so it is never left scheduled for nothing. Three paths, all rescheduling under the same deterministic `tx-<providerTransactionId>` job id so a still-pending job is deduplicated: the receive path logs and rethrows so the provider retries, a duplicate provider delivery re-enqueues an inbox still in `RECEIVED`, and a periodic sweep re-enqueues inboxes left `RECEIVED` past the stale window when the provider never retries.
_Avoid_: Webhook replay, retry

## AR ledger and reconciliation

**AR reconciliation finding**:
A finding that identifies one failed comparison of a receivable or payment balance against its supporting records.
_Avoid_: Reconciliation status
