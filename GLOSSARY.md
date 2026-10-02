# Casso Ledger AR

This glossary names the business concepts used to track receivables and incoming payments.

## Payments and matching

**Near-match overpayment**:
An incoming bank transfer that exceeds a candidate receivable's remaining balance but still appears to be a plausible payment for it.

**Customer credit**:
Received money that has not been allocated to a receivable and is held for an accountant to allocate intentionally later.

## Bank notifications

**Webhook inbox**:
The record of one bank transaction notification received from Casso Flow, tracked from `RECEIVED` to `PROCESSED` or `FAILED`. `FAILED` can be retried; `PROCESSED` is terminal and never reverts, even if the job is redelivered.
_Avoid_: Webhook log, webhook event