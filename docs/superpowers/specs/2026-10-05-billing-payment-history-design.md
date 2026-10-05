# Billing payment history — issue #463

Date: 2026-10-05

Status: Accepted design. The user accepted all eleven recommendations across three rounds; the design frontier is empty. This document completes the requested design interview, not the feature implementation.

## Scope and existing facts

- Parent: [#463](https://github.com/lengocanh2005it/casso-ledger/issues/463).
- [#464](https://github.com/lengocanh2005it/casso-ledger/issues/464) records history, [#466](https://github.com/lengocanh2005it/casso-ledger/issues/466) exposes its read API, and [#465](https://github.com/lengocanh2005it/casso-ledger/issues/465) displays it below the Billing plan cards.
- [#467](https://github.com/lengocanh2005it/casso-ledger/issues/467) is closed. The current Billing tab reads prices and quotas through `usePlans`; that work is already present in the base checkout.
- `PlanUpgradeOrder` and `PeriodCharge` retain no amount. Their initiation use cases price the payment link from the catalog. `PayosWebhookDataDto.amount` exists, but the controller does not pass it to either confirmation use case.
- The webhook guard signs `data`; the controller currently uses the outer `code` for its success decision. The implementation must determine success from authenticated provider data and validate money as integer VND at the boundary.
- Official PayOS documentation [signs the inner data](https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/). Its [webhook example](https://payos.vn/docs/du-lieu-tra-ve/webhook/) contains transaction-level amount/reference/time, while the [payment-link API](https://payos.vn/docs/api/) exposes order-level `amountPaid`, `amountRemaining` and transactions separately. Payment-link API documentation also says registration sends a signed sample bank transaction; a valid signature alone does not prove that money was received. The documentation does not establish that one webhook amount always equals the fully settled order total or that `reference` is unique and retry-stable. The accepted initial-release boundary routes partial, excess, additional and insufficiently identified transfers to review without automatic aggregation or additional entitlement. A signed sample that cannot be tied to a verified real payment is acknowledged/ignored as money evidence.
- Both OWNER and FINANCE_MANAGER already have `SUBSCRIPTION_MANAGE`. Preserve this gate on both the read API and UI, and derive the organization only from tenant context.
- There are two production payment-link creation paths, the two initiation use cases. The renewal reminder cron delegates to the period-charge initiation use case, so quote persistence there covers scheduled links too.
- A successful receipt can precede an invalid upgrade: confirmation changes the subscription before marking the order paid. Paying an old or competing upgrade link after another upgrade can throw and roll back the current transaction. The receipt-versus-entitlement policy must cover this scenario, not just amount mismatches.
- The payment dialog already polls `refreshUser()` every five seconds and closes when the plan changes. It does not refresh history; Settings does not consume the checkout-return `status`. The reminder cron currently returns to `/billing`, while the Settings flow returns to `/settings?tab=billing`; align the actual Billing destination when handling returns.
- No operator billing-reconciliation/refund/credit or manual entitlement endpoint exists. `ChangeSubscriptionPlanUseCase` is internal, and the PayOS adapter only creates links. Q10 explicitly limits the first release to evidence, display and warnings, with operational review outside the application.
- The webhook DTO makes `reference` optional. Current confirmation deduplicates through terminal order status, not a received-transfer identity. That guard cannot establish whether a later webhook is a retry or another distinct transfer for the same order. Q11 chooses transfer-level history and review for insufficient identity.

## Accepted decisions — round 1

1. History contains received plan payments, covering both plan upgrades and period charges. Pending or failed attempts without received money do not become history rows. Round 2 explicitly adds receipts requiring review, separating receipt of money from granting plan access.
2. The received amount comes from authenticated successful webhook data, not a catalog lookup at confirmation or read time. Persist the quote at payment-link creation separately to support comparison, across all checkout creation paths. Money remains integer VND in `bigint` columns.
3. Older completed payments remain visible. Their amount is unknown and is rendered as `Không có dữ liệu`; do not substitute zero or today's price. Distinguish these rows from records with complete payment evidence. Exact-amount reconciliation is outside the first release.
4. The displayed time is the backend receipt-confirmation time, labeled `Thời gian xác nhận`. For existing terminal PAID rows, `updatedAt` records the local PAID transition; it is not evidence of the payer's transfer time. Round 2 chooses a one-time backfill into the unified history.

## Accepted decisions — round 2

5. A signed receipt whose amount differs from the frozen checkout quote is persisted and shown as `Cần đối soát`. Do not automatically grant or renew plan access. Manual review is the initial-release boundary; automatic aggregation of several transfers and refunds are excluded.
6. An atomic one-time migration copies old PAID orders/charges into the same history source with a null amount, the existing local confirmation time and explicit legacy provenance. Do not merge the old order tables into the history on every request; the backfill must prevent duplicate source records and carry each row's organization explicitly.
7. Refresh history on checkout return and during the existing checkout polling session, with a 60-second wait limit. If confirmation is still absent, display `Chưa nhận được xác nhận thanh toán` with `Làm mới`. An untrusted `status=success` URL parameter never establishes payment success. Both upgrade and renewal returns target the actual Settings Billing route.
8. If an authenticated receipt arrives for an upgrade that is no longer applicable (for example, a second paid checkout for an already-upgraded plan), preserve the money-received evidence and show `Cần đối soát`. Do not change the plan or automatically convert the money into renewal or credit.

## Accepted decisions — round 3

9. An old pending order paid after rollout has no reliable frozen quote. Preserve its authenticated received amount, leave the quote explicitly unknown, show `Cần đối soát` and do not automatically grant or renew plan access. Neither today's catalog nor an assumed historical price repairs the missing evidence.
10. The first release durably records, displays and warns about review-required evidence; operational review against PayOS happens outside the application. In-app case resolution, refunds, manual entitlement adjustments and durable current review-state tracking belong to a separate follow-up. History keeps the initial confirmation outcome, not an editable claim that a case is currently unresolved or resolved.
11. Each distinguishable received transfer has one history row; the same order code can appear on multiple rows. Deduplicate only when authenticated provider data supplies a reliable transfer identity whose scope and retry stability are verified; documentation does not establish that PayOS `reference` alone guarantees this. A retry of a verified transfer does not add a row or grant access again. Additional distinct transfers are retained for review without extra entitlement. When identity is insufficient, preserve authenticated evidence with explicit uncertain provenance for review without treating it as proof of another payment; do not invent a transfer identity from the order code or a payload fingerprint. A signed sample or unknown source code must not create money evidence.

For accepted receipts, record new history in the same transaction as the payment transition and any associated plan change. For review-required receipts, commit the evidence and its initial review outcome without an automatic entitlement change; business rejection must not erase received-money evidence. Replay must not duplicate history; entries are append-only, tenant-owned snapshots. Preserve the two payment concepts rather than merging their write-side business rules. See [ADR-0031](../../adr/0031-plan-payment-history-amount-evidence.md).

Legacy backfill deduplicates historical completed source orders; new runtime receipts deduplicate verified transfer identities. These are different keys: a unique source-order constraint covering all runtime receipts would discard an additional transfer. A callback for a migrated PAID order must not be assumed to prove an additional payment when its identity cannot be reconciled with the legacy snapshot; retain that ambiguity for review without automatic entitlement. Never use the request tenant context on the public PayOS webhook: derive `organizationId` only after locating a known source order by its verified PayOS order code, then scope every write to that source row's organization. A valid signature for an unknown source order does not establish a tenant or payment and remains acknowledged without recording money.

## API, UI and validation contract

- `GET /api/v1/payos/payment-history`, authenticated and tenant-scoped, newest first.
- Shared pagination: page 1, limit 20, maximum 100; standard pagination envelope and a stable tie-breaker for equal timestamps.
- Class response/query DTOs in `.dto.ts` files, documented Swagger operation/responses/errors, no internal tenant/version fields.
- Rows expose plan, kind, amount, confirmation time, order code and the initial confirmation outcome, including `Cần đối soát`. Legacy unknown amounts require an explicit nullable contract and legacy provenance. The write-side order/charge status and the history's initial receipt outcome must remain distinct so review-required money does not accidentally count as paid entitlement.
- The initial confirmation outcome is an immutable historical assessment. Display and documentation must distinguish it from current reconciliation-case status, which is outside this release. Preserve domain-facing PayOS order codes, including the renewal offset, rather than exposing raw sequence values.
- UI below the plan cards, using existing table, money/date formatting and URL pagination conventions; loading, empty and error states.
- Focused TDD slices, unit suites, real-Postgres e2e for writes/replay/pagination/isolation, migration validation, `pnpm verify` and backend `domain-check` before any implementation completion claim.
- Cover quote changes between checkout and webhook, invalid or unsafe money values, mismatched amounts, stale upgrades, old pending links without quotes, additional transfers, insufficient receipt identity, terminal-order replay, legacy null amounts and checkout timeout. Test initial receipt outcome separately from entitlement; a review-required receipt must never be counted as an accepted renewal.

## Resolved design tree

| Decision | Prerequisite | Current state |
| --- | --- | --- |
| Received money only, including review-required receipts | Scope | Accepted |
| Received amount and frozen quote | Amount provenance | Accepted |
| Preserve older completed payments with unknown amount | Legacy visibility | Accepted |
| Local confirmation time | Time semantics | Accepted |
| Amount differs from quote | Amount provenance | Accepted: durable receipt, manual review, no automatic entitlement |
| Old pending link has no frozen quote | Discrepancy policy | Accepted Q9: unknown quote, durable evidence, review, no automatic entitlement |
| Materialize old PAID rows or merge at read time | Legacy visibility | Accepted: atomic one-time backfill |
| Refresh after returning from checkout | Received-money scope | Accepted: refresh and bounded checkout polling |
| Receipt succeeded but upgrade is no longer applicable | Received amount versus entitlement | Accepted: durable receipt, manual review, no plan change |
| Exception resolution and immutable history | Exception policy | Accepted Q10: operational handling outside the app; history retains initial outcome |
| Receipt granularity and replay identity | Review-required partial/multiple receipts | Accepted Q11: transfer-level rows, reliable-identity deduplication, uncertain identity retained for review |

Frontier: empty. All product decisions raised in this interview are resolved. Exact storage/DTO names and provider identifier-validation details are implementation planning work; insufficient evidence has the explicit review outcome above.

## Agreed changes to ticket wording

- #464: replace catalog-at-payment-time pricing with authenticated received amounts and frozen quotes; add the agreed backfill and durable review-required receipt policy. A rejected plan change must not roll back evidence of received money. Replace one-entry-per-order/replay-by-terminal assumptions with transfer-level evidence and reliable identity; old unquoted pending links require review.
- #466: document unknown legacy amounts, initial confirmation outcomes and potentially repeated order codes; use confirmation-time naming rather than implying provider transfer time.
- #465: render unknown amounts and review-required outcomes explicitly, label confirmation time accurately, and add the accepted bounded checkout refresh behavior.
- #463: reconcile received-money history wording (including review-required evidence) and record that #467 is already closed. In-app case resolution is outside the release.

GitHub issues have not been edited. These agreed amendments are recorded here for the implementation handoff; no production code has been changed, committed or published by this design interview.

## Follow-up scope

- In-app reconciliation case resolution and current-state tracking, with separate audit/resolution records so receipt snapshots remain immutable.
- Reliable exact-amount recovery for legacy completed payments, if required.
- Automatic partial-payment aggregation, refunds and conversion into renewal/credit, if required.

## Adjacent defect found during tracing

Renewal eligibility currently queries the latest charge of a period rather than any paid charge, so a newer pending attempt can hide an earlier paid one. This predates payment history and is outside this design's initial scope; retain it as a follow-up finding instead of silently changing billing eligibility while adding the read model.
