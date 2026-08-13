# 14. Alert SSE stream is backed by in-process EventEmitter2, with no cross-instance relay

Date: 2026-08-13

## Status

Accepted

## Context

Issue #137 needed a real-time delivery mechanism for the new `Alert` bell/dropdown (see ADR-0013). Polling, SSE, and WebSocket were considered. A grilling session picked SSE: the event sources (bank connection status change, SMTP FAILED, reminder scan summary) are all low-frequency, so true bidirectional push (WebSocket) was more infrastructure than the problem needs, but the badge should still update without a manual refresh.

`docker-compose.yml` runs a single `backend` service — no `deploy.replicas`, no horizontal scaling configured today. The codebase already has an `IEventPublisher` port backed by `EventEmitter2` (`common/events/`), used in-process by every existing domain-event listener (bank-connections, reminders, collection-activity).

## Decision

`GET /alerts/stream` is implemented as a per-user SSE endpoint backed directly by the existing in-process `EventEmitter2` — the `alerts` module's listeners `emit()` a new event on the same in-process bus when an `Alert` row is created, and the SSE controller subscribes to that bus filtered by the connected user's ID. No message broker (Redis pub/sub, etc.) sits between them.

- Auth: this codebase's access token is a Bearer JWT (`JwtStrategy` uses `ExtractJwt.fromAuthHeaderAsBearerToken()`), not a cookie — only the refresh token is an httpOnly cookie (`auth.controller.ts`). Native `EventSource` cannot send a custom `Authorization` header, so `GET /alerts/stream` accepts the same short-lived (15-minute) access token as a `?token=` query parameter, validated by the same `JwtStrategy`. This is a deliberate, narrow exception to "tokens never go in a URL": it's the existing 15-minute access token (not the long-lived refresh token), sent only over HTTPS to same-origin, and its exposure surface (server access logs, browser history) is judged acceptable for the alert stream given the short TTL — do not reuse this query-token path for any other endpoint.
- Explicitly rejected: relaying alert-created events through Redis (already in the stack for BullMQ) to support multiple backend instances. There is no current requirement for horizontal scaling, and adding a pub/sub hop for a single-instance deployment is complexity with no present payoff.

## Consequences

- **This breaks silently under horizontal scaling.** If the `backend` service is ever run as more than one instance behind a load balancer, a user's SSE connection lands on one instance's process; an event emitted by a different instance (e.g. the instance that processed the reminder-scan cron) never reaches that `EventEmitter2` bus and the client never receives it. No error occurs — the alert is simply persisted (visible on next `GET /alerts` poll/reload) but never pushed live. Anyone adding a second `backend` replica must first replace this in-process emit with a shared relay (Redis pub/sub is the natural fit, since it's already a stack dependency) — this ADR is the pointer to why the bell "sometimes doesn't update live" in that world.
- Keeps the SSE implementation to a controller + the port that's already used everywhere else in the codebase — no new dependency, no new infrastructure to operate for the current single-instance deployment.
