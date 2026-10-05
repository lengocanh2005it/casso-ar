# Billing payment history — issue #464 write design

Date: 2026-10-05

Status: Accepted design. Product decisions are resolved; the implementation uses the verified singleton-transaction identity boundary below. See [ADR-0032](../../adr/0032-plan-payment-receipts-and-entitlement.md) and the parent [history design for #463](2026-10-05-billing-payment-history-design.md).

## Write contract

- Freeze the integer-VND quote in both `PlanUpgradeOrder` and `PeriodCharge` when their PayOS payment links are created. This includes links initiated by the renewal reminder cron through the period-charge use case.
- The webhook guard authenticates `data`. Treat only authenticated `data.code === '00'` as provider success; ignore the unsigned outer `code`. Accept a received amount for automatic processing only when it is a positive safe integer in VND. Do not coerce decimal, string, unsafe or non-positive values.
- Resolve the payment source by its known PayOS order code before deriving its `organizationId`. Public webhooks have no tenant context. Every subsequent source, subscription and receipt read/write is scoped to that explicit organization.
- Keep the two source types and their initiation/confirmation use cases separate. Share the immutable history concept without merging upgrade and period-charge eligibility rules.

## Receipt versus plan access

Represent a receipt's immutable initial outcome separately from the source-order status and from any later operational review. Add terminal `REVIEW_REQUIRED` to both source status types; only `PAID` grants or renews plan access. An unknown legacy quote, mismatched amount, invalid/unrepresentable amount, uncertain transfer identity, additional transfer, or no-longer-eligible checkout requires review and cannot change the subscription. Preserve authenticated evidence when entitlement is rejected; for an amount that cannot be safely represented, leave the numeric amount unknown and retain only minimum evidence needed for review.

Eligibility is checked under the same per-organization advisory subscription lock used by subscription plan changes. At confirmation, an upgrade must still move to a strictly higher tier. A period charge must still match the subscription's current tier and exact billing period. This serializes receipt acceptance with downgrade/change operations. A stale checkout records review-required evidence without modifying the plan.

For an accepted receipt, commit its history row, the source `PAID` status, subscription change and audit record in one transaction. For a review-required receipt, commit its history row and review outcome (and source `REVIEW_REQUIRED` when this is the source's first confirmation) without changing entitlement. Do not return early merely because a source is terminal: a later distinct transfer may need a review row. A verified retry is a no-op. A failed callback with no money receipt may change only a still-pending source to `FAILED`.

## Identity, replay and evidence

Use provider transfer identity for receipt uniqueness only after verifying its scope and retry stability from authoritative PayOS material or behavior. The current payment-link transaction shape exposes no immutable transaction ID, and documentation does not establish that `reference` or a tuple of transaction fields is unique or retry-stable. The implementation may use the PayOS payment-link ID as the transfer identity only when the authoritative snapshot contains exactly one transaction and that transaction matches the signed callback; the unique singleton scopes that transfer to one stable payment-link ID. If the snapshot contains multiple transactions, retain the receipt as review-required with no transfer identity. Never use the order code or a delivery fingerprint as a transfer identity. A hash of the verified signature deduplicates repeat deliveries with the same signed data; it cannot distinguish those from two real transfers with identical signed data. Different signed deliveries without a provider transfer ID may create multiple review-only rows even when they are retries. The fallback therefore guarantees delivery-level deduplication only, not exactly-once transfer history; ambiguous receipts never grant entitlement and require reconciliation against PayOS. Do not store full webhook bodies, account numbers or unrelated fields.

A signed registration sample is not proof of a real transfer. Unknown source codes and callbacks identifiable as samples are acknowledged without a receipt. A valid signature alone is insufficient. A later callback for a migrated `PAID` row, whose earlier payment has no transfer identity, cannot be assumed to be an additional payment; preserve any qualifying new evidence for review without granting access again.

## One-time legacy backfill and rollout

In one atomic migration, copy each existing `PAID` `PlanUpgradeOrder` and `PeriodCharge` into history with its explicit `organizationId`, source kind, external PayOS order code, local `updatedAt` confirmation time and legacy provenance. Received amount, frozen quote and transfer identity are unknown and remain null. Deduplicate these rows by legacy source identity; keep that key separate from verified runtime transfer identity so one order may have multiple receipt rows.

Cut over without old and new webhook writers overlapping: stop link creation, drain old writers, run the migration, deploy the new writer everywhere, then resume callbacks. Callbacks during the pause must remain retryable or be durably buffered. Verify PayOS retry behavior before rollout; do not acknowledge and discard money notifications during the pause.

## Verification scope for implementation

Use TDD and cover both creation paths; inner signed success versus outer code; safe VND validation; quote mismatch or absence; verified retry and uncertain identity; additional transfers after terminal source status; stale upgrade and stale period; accepted versus review-required atomic writes; failed callbacks without receipts; tenant scoping; signed samples/unknown order codes; legacy backfill and duplicate migration safety; and cutover delivery behavior. Run unit and real-Postgres integration tests, `pnpm verify`, and backend `domain-check` before claiming implementation complete.

The existing defect where a newer pending period charge can hide an older paid charge remains separate follow-up work; do not bundle it into this receipt-history change.
