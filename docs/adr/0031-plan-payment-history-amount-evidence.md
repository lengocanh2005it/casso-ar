# 31. Plan payment history preserves received amounts and legacy unknowns

Date: 2026-10-05

Status: Accepted design; not yet implemented. All eleven interview decisions were accepted by the user.

Plan payments currently retain neither their checkout quote nor their received amount. A catalog price can change between checkout creation and confirmation, so the price at confirmation cannot establish the amount collected. History will record the amount from an authenticated successful PayOS notification and retain the checkout quote separately for comparison; changing catalog prices will never rewrite completed history.

Older completed payments will be backfilled once, atomically, into the same history source with an explicitly unknown amount rather than being omitted or assigned today's price. Recovering exact legacy amounts requires separate reconciliation against reliable payment evidence; it is outside the initial release. This preserves completeness at the cost of nullable legacy amounts. Confirmation time means the platform's receipt-confirmation time, not the provider's transfer time.

Money received must remain durably recorded even when the amount differs from the frozen quote or the intended upgrade is no longer applicable. Such receipts require manual review and do not automatically grant or renew plan access; a business-rule rejection must not roll back the evidence of money received. Automatic partial-payment aggregation, refunds and conversion to renewal or credit are outside the initial release.

Old pending links without a frozen quote also require review; today's catalog cannot supply the missing quote. History records one distinguishable received transfer per row, not one row per order, and deduplicates authenticated transfer identities. Additional transfers or evidence without a reliable identity never automatically grant additional plan access. Their evidence is retained for manual review rather than silently dropped by an order's terminal status.

The first release records and displays the immutable initial confirmation outcome; operational review happens outside the application. A tool for resolving review cases and tracking their current state is a separate follow-up, not an update to receipt history. See the [accepted design](../superpowers/specs/2026-10-05-billing-payment-history-design.md).
