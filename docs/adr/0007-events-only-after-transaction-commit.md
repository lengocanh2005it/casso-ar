# 7. Emit domain events only after the owning transaction commits, through a port, behind failure-contained listeners

Date: 2026-08-11

## Status

Accepted

## Context

Plan #9 (disputes), Plan #10 (collection activity timeline) and Plan #13 (audit) introduced a shared eventing layer on `@nestjs/event-emitter` (EventEmitter2). The highest-value events are `payment.allocated` and `receivable.closed`, which drive the collection-activity timeline.

The first implementation emitted events from inside `AllocatePaymentUseCase.execute()` only. The bank-webhook auto-match (`process-webhook.usecase.ts`) and the exception-queue match (`match-bank-transaction.usecase.ts`) both call the shared `allocateWithinTransaction()` directly, bypassing that hook entirely — without a fix, the product's primary AR-automation path (webhook-driven payments) would never have produced timeline rows.

Two failure modes had to be designed out:

1. **Phantom events.** An event emitted before its DB transaction commits fires even if the transaction later rolls back, telling subscribers about a state change that never happened.
2. **Listener failure poisoning a committed business flow.** `EventEmitter2`'s `emitAsync` propagates listener errors back to the emitter. In the webhook path, `ProcessWebhookUseCase` wraps the whole flow — including event emission — in a catch block that marks `WebhookInbox` as `FAILED`; a post-commit listener error (e.g. a transient DB failure writing a timeline row) would flip a successfully processed webhook to `FAILED` and trigger a spurious BullMQ retry/dead-letter cycle. The timeline is a denormalized display log; it must never take down the business flow that produced it.

## Decision

1. **Emit after commit.** A business event is only emitted after the transaction that produced the state change has committed. `AllocatePaymentUseCase.execute()` emits after its `DataSource.transaction()` resolves; the extracted `emitAllocationEvents()` is called by all three producers — direct allocation, webhook auto-match, exception-queue match — each after its own transaction commits. Dispute events follow the same pattern (`resolve-dispute.usecase.ts` saves inside the transaction and emits after it).
2. **Port, not framework.** Application-layer code emits through the `IEventPublisher` port in `common/events/` (`NestEventPublisherAdapter` in infrastructure); `EventEmitter2` is never injected into application code. Use `emit` (fire-and-forget) for events the producer does not need to await (disputes), `emitAsync` where the producer intentionally awaits listeners (allocation events).
3. **Failure-contained listeners.** Listeners that write denormalized state are infrastructure-layer code and wrap every handler in a catch-all (`CollectionActivityListener.safely()`) that logs and swallows — a timeline-write failure can never propagate to the producer, never flips `WebhookInbox` to `FAILED`, never turns an allocation 2xx into a 500.
4. **Listeners re-establish tenant context.** Background/event handlers do not flow through the HTTP request's AsyncLocalStorage, so listeners re-run under `TenantContextService.run()` with an explicit system user and role, keeping every repository write tenant-scoped.

## Consequences

- No phantom events on rollback; no spurious webhook `FAILED` from post-commit listener errors (listener containment shipped in PR #61, commit `95d7ef9`).
- Timeline write failures are logged and dropped — accepted for a denormalized display log; there is no retry of the timeline row.
- `emitAsync` listeners run inline in the producer's request/job; if listener latency becomes a problem, the fix is to move listeners onto a queue — not to emit before commit.
- New business events must follow the same contract: emit after commit, through the port, with failure-contained listeners.
