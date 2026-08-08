# 5. Emit a distinctly-named event per audience when a Receivable closes, instead of widening the existing one

Date: 2026-08-08

## Status

Accepted

## Context

`AllocatePaymentUseCase`, `WriteOffReceivableUseCase`, and `CancelReceivableUseCase` are the three places `Receivable.status` can transition to a terminal state (`PAID`, `WRITTEN_OFF`, `CANCELLED` respectively). `2026-08-03-collection-activity-timeline-design.md` already defines `receivable.closed`, emitted only from the `PAID` path, matching its own spec's narrow rule ("`Receivable.status` → `PAID`") for the collection timeline's "closed" entry.

Internal Task & Escalation (`2026-08-03-internal-task-escalation-design.md`) needs to auto-dismiss any `OPEN` `InternalTask` when its `Receivable` closes for *any* of the three terminal reasons, not just `PAID` — a write-off or a cancellation ends the follow-up just as much as being paid does. The obvious-looking option is to widen `receivable.closed` to also fire from the write-off/cancel paths and let the new listener subscribe to it.

## Decision

Do not widen `receivable.closed`. Emit a second, distinctly-named event, `receivable.status-closed`, from all three call sites (side by side with `receivable.closed` in the `PAID` case). Internal Task & Escalation's listener subscribes only to `receivable.status-closed`; Collection Activity Timeline's listener keeps subscribing only to `receivable.closed`.

An event name describes what happened in the domain, not who currently listens for it. `receivable.closed` is contractually PAID-only per Collection Activity Timeline's own spec — widening it to also mean "or written off, or cancelled" would silently change that contract for its existing listener, which was built and tested against the PAID-only meaning. A second listener needing a broader trigger is a reason to define a second, correctly-scoped event, not to redefine an existing one out from under its owner.

## Consequences

- The `PAID` path (`AllocatePaymentUseCase`) emits two events from the same `if (becameClosed)` block: `receivable.closed` (Collection Activity Timeline's audience) and `receivable.status-closed` (Internal Task & Escalation's audience). This is intentional duplication of the trigger, not the payload — each event still carries only what its own listener needs.
- Adding a third feature that needs "receivable closed for any reason" means subscribing to the existing `receivable.status-closed`, not inventing a third event — this ADR's naming rule generalizes.
- A reader who only knows one of the two features will see just one `emitAsync` call per closure path in that feature's code and may not realize a second, differently-scoped event fires alongside it from the same use case; the "Naming note" cross-references in both specs exist to prevent that surprise.
