# 13. Alert domain concept lives in its own `alerts` module, separate from `notifications` (email queue)

Date: 2026-08-13

## Status

Accepted

## Context

Issue #137 asked for an in-app notification surface: owner-facing events (bank connection needs reauth/errored, SMTP config FAILED, reminder scan summary) currently only reach the owner by email, via the `notifications` module — which is a BullMQ email queue (`email.service.ts`, `email-queue.processor.ts`, Resend/SMTP adapters), not a general notification concept.

A grilling session considered naming the new persisted, in-app, read/unread concept "Notification" (the issue's own suggestion was `AppNotification`, purely to avoid colliding with the existing module name) or "Alert". The existing code already calls this concept "alert" in practice — `BankConnectionStatusListener.enqueueOwnerAlert()`, log message "Owner alert could not be enqueued" — before this ADR existed to name it.

## Decision

The domain concept is named **Alert**, not Notification, and lives in a new module `apps/backend/src/modules/alerts/` (full Clean Architecture: domain/application/infrastructure/presentation) — never inside or renamed from `notifications/`.

- `notifications/` keeps its current meaning: the email delivery queue (Resend/SMTP). It is not renamed and does not gain new responsibilities.
- `Alert` is a new, separate persisted entity (`organizationId`, `userId`, `type`, `entityType`/`entityId`, `readAt`, `createdAt`) with its own API (`GET /alerts`, `PATCH /alerts/:id/read`, `PATCH /alerts/read-all`, `DELETE /alerts/:id`, `DELETE /alerts`, `GET /alerts/stream` for SSE).
- Event sources (bank connection status change, SMTP FAILED, reminder scan summary) are each consumed by a listener in `alerts/infrastructure/`, separate from the existing email listeners in `notifications/infrastructure/` — the two modules react to the same domain events independently, each in its own delivery channel.
- "Notification" is deliberately left unused/reserved — if a future feature needs a broader, non-actionable notification concept (e.g. "invoice created"), that is free to claim the word "Notification" without colliding with Alert's narrower "owner needs to act" meaning.

## Consequences

- Two independently-evolving delivery channels for the same underlying events (email via `notifications/`, in-app via `alerts/`) — a developer adding a new owner-facing event must remember to wire both, there's no shared "emit an owner alert" abstraction across the two.
- No renaming churn on the existing, working `notifications/` module.
