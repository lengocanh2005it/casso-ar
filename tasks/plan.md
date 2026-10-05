# Implementation Plan: Plan Payment History Writes (#464)

Design is accepted in [ADR-0032](../docs/adr/0032-plan-payment-receipts-and-entitlement.md) and the [write design](../docs/superpowers/specs/2026-10-05-billing-payment-history-write-design.md). Task checklist is tracked on [GitHub issue #464](https://github.com/lengocanh2005it/casso-ledger/issues/464); this file records implementation order and verification.

## Architecture decisions

- Keep upgrade orders and period charges as separate write-side concepts; both create immutable rows in the shared plan-payment-history table.
- Persist checkout quotes before calling PayOS, and retain only minimal signed transaction evidence.
- Use one database transaction for source status, receipt, subscription change and audit; serialize eligibility with the existing per-organization subscription advisory lock.
- Backfill existing PAID source rows in one atomic migration. Keep legacy-source uniqueness independent of runtime transfer identity.

## Ordered implementation

1. Add and test frozen quote plus PayOS payment-link identity persistence in both checkout creation paths.
2. Add domain/ORM history receipt and terminal review-required source statuses; migration creates the table/columns and atomically backfills old PAID orders with unknown amounts.
3. Extend the authenticated webhook boundary with inner success code, safe amount handling and minimal identity/evidence fields; write failing tests for untrusted outer status and unsafe amounts first.
4. Replace the old confirmation path with one processor that reads the PayOS payment link outside transactions, then records the receipt and applies any eligible entitlement atomically. Keep stale, mismatched or unverified transfers in review.
5. Cover accepted upgrade/period payments, amount review, stale eligibility, replay and legacy-backfill SQL; run the relevant PostgreSQL e2e tests, `pnpm verify`, and backend `domain-check`.

## Risks and constraints

- The current PayOS payment-link transaction shape has no immutable transaction ID. Use a payment-link ID as transfer identity only when the authoritative snapshot contains exactly one transaction matching the signed callback; multi-transfer links stay review-required with null transfer identity. Order code and delivery fingerprint are never transfer identity.
- Existing PAID source rows have no quote or transfer identity; migration must preserve that uncertainty rather than infer current prices.
- Cutover must prevent overlap with old webhook writers, and paused callbacks must be retryable or durably buffered.
