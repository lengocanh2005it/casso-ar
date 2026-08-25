# AR Ledger is an event-sourced movement log, not a double-entry general ledger

**Status:** proposed

Issue #264 asked whether Casso AR should have something living up to its name as a
"ledger." We're adding an **AR Ledger**: an append-only `LedgerEvent` stream, scoped to AR
only (`Receivable` balance movements and `Payment` credit-balance movements), written in
the same transaction as the triggering use case, dual-write alongside the existing
persisted rollups and `ReceivableBalanceHistory` (neither changes). We are **not**
building a double-entry general ledger — no `Account`, no chart of accounts, no
debit=credit invariant.

## Considered Options

- **Full double-entry GL** (accounts, balanced postings, chart of accounts): rejected for
  now. No tenant, integration, or reporting requirement in `docs/overview.md` or
  `docs/mvp-feature-checklist.md` currently needs financial-statement output or external
  accounting-software export — the only thing that would justify the cost. It is also a
  cross-cutting rewrite of every AR write path and a different accounting subject problem
  than what motivated this issue (a unified query surface, not GAAP compliance). Revisit
  only if such a requirement appears.
- **Generalize `ReceivableBalanceHistory` itself** into the org-scoped ledger: rejected.
  `ReceivableBalanceHistory` already carries `organizationId` per row, so
  "total outstanding across the org" is already answerable from it — generalizing it would
  only rename an existing capability. It also directly contradicts ADR-0018's decision
  that balance history is a snapshot log, not an event-sourced ledger; reversing that
  decision was out of scope for this issue. `ReceivableBalanceHistory` stays as-is; the AR
  Ledger is an additive, separate stream.
- **Event-sourced movement log covering only `Receivable`** (mirroring
  `ReceivableBalanceHistory`'s scope exactly): rejected as not worth building — it would
  add a second table with no new capability over the first option above. The actual gap is
  the `Payment` credit balance (`unallocatedAmount`), which today has no history at all.
  Including it is what gives the AR Ledger a reason to exist.

## Consequences

- One `allocate`/`undo` action now writes two `LedgerEvent` rows (`Receivable` subject +
  `Payment` subject) instead of one `ReceivableBalanceHistory` row — this falls out of
  allocation being inherently two-sided, not an imposed double-entry rule.
- Existing data needs a `*_ROLLOUT_BASELINE` opening-event migration per subject, same
  precedent as `20260822000000-add-receivable-balance-history-rollout-baseline.ts`.
- Every AR write path (allocate, undo, cancel, write-off, create) gains a second append
  inside its existing transaction — the domain-modeling pass and eventual plan must confirm
  this stays inside `AGENTS.md`'s "keep transactions as short as possible" constraint
  rather than growing lock scope.
- Two dual-written sources (rollups vs. ledger) can drift if a write path misses the append
  — the same risk ADR-0002 already accepted for rollups vs. `PaymentAllocation`, now
  doubled. A reconciliation check is needed before this is trusted as a real source of
  truth, not just an unverified second copy.
