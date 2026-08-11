# 9. All email sending goes through the BullMQ email queue — never synchronous provider calls

Date: 2026-08-11

## Status

Accepted

## Context

Email is the product's primary customer touchpoint: payment reminders go to real customers, and auth emails (signup verification, invites, password resets) are part of onboarding. The provider is Resend (Plan #7), later joined by org-owned SMTP (ADR-0006).

If a use case called the provider synchronously, the provider's latency would be added to the request, and a provider outage or misconfiguration would turn a committed business write into an HTTP 500 — or force callers to swallow failures silently. The original auth-email path did exactly this: failures were caught and logged with no retry.

## Decision

1. **Provider port.** `IEmailProviderAdapter` (`send(to, subject, html, metadata, replyTo?) → { providerMessageId }`) is the only contract use cases know; `ResendEmailAdapter` and `SmtpEmailAdapter` implement it, and `IEmailProviderResolver` picks the adapter per send (org SMTP config when `CONNECTED`, else Resend; a `forceProvider` override exists for the failure fallback).
2. **Queue-only sending.** `EmailQueueProcessor` (a BullMQ worker) is the only component that calls a provider. Use cases enqueue through `IEmailQueue` (`BullMqEmailQueue`): `send-reminder-email` and `send-auth-email` job types.
3. **Retries.** `attempts: 3` with exponential backoff (`delay: 5000`) for both job types. `SENT` is recorded only after the provider returns `providerMessageId`; `FAILED` after the final attempt.
4. **No double-send on retry.** Before sending, the processor re-reads the `ReminderExecution` status and skips if it is no longer `PENDING` — a DB write failure after a successful send must not cause the retry to email the customer twice.
5. **Auth emails are queued too.** Signup verification, invites and password resets enqueue `send-auth-email` jobs — a signup must never become an HTTP 500 because the email provider failed after the DB transaction committed.
6. **SMTP failure fallback (ADR-0006).** When an org-SMTP send exhausts its retries, the processor flips the config to `FAILED` (version-guarded CAS), warns the org OWNER once via Resend, and requeues the same reminder with `forceProvider: RESEND` so it still goes out.

## Consequences

- Sending is asynchronous: API success does not guarantee delivery — best-effort with queue retries; visibility comes from BullMQ metrics and `onFailed` dead-letter logging (Plan #23).
- Redis + BullMQ is a hard runtime dependency for both auth and reminder emails.
- A failed auth email is logged and dropped after retries (no requeue through another channel) — accepted for auth; reminder emails get the Resend fallback instead.
