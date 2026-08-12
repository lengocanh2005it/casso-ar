# 6. Bring-your-own-SMTP instead of Resend-managed custom domain for org-branded reminder emails

Date: 2026-08-11

## Status

Accepted

## Context

Issue #43 (child of #17) researched letting an organization send reminder emails `from: noreply@congtya.com` instead of Casso's own verified domain, for trust/deliverability reasons. The original design used Resend's domain API: the org enters a domain, Resend returns DNS records (SPF `TXT`, DKIM `CNAME`), the org adds them at their own DNS provider, and Casso polls/webhooks for verification — with DNS propagation taking minutes to hours and a stale-verification fallback to handle later.

A grilling session considered an alternative modeled on Supabase's "custom SMTP" project setting: the org supplies its own SMTP server credentials (host, port, username, password, from-address) and Casso relays through that server instead of managing domain verification itself.

## Decision

Replace the Resend-domain-verification design entirely with bring-your-own-SMTP, gated to BUSINESS and ENTERPRISE tiers (`Subscription.canUseCustomSmtp`, a flat boolean field — see #90 for the general plan-catalog that later wired up `createBusiness()`/`createEnterprise()` to set it).

- `OrganizationSmtpConfig` lives in its own module (mirroring `email-templates`), consumed by `notifications` only through an application-layer port — never a direct import of the config module's internals.
- A new `SmtpEmailAdapter` implements the existing `IEmailProviderAdapter` port alongside `ResendEmailAdapter`; an `EmailProviderResolver` in the application layer picks the adapter per send by looking up the org's config, keeping "which provider" out of any single adapter.
- Verification is a synchronous "send a test email" action on save — no DNS propagation delay exists in this model, so no polling/webhook/pending state is needed. A config is only ever persisted once a real test send has succeeded (`status: CONNECTED`); a failed test never creates a record.
- Failure detection is reactive: a real send failure (after exhausting the existing BullMQ `attempts: 3` exponential-backoff retry) flips `status: FAILED` and requeues the same reminder through `ResendEmailAdapter` so it still goes out — no dedicated health-check cron.
- `status: FAILED` triggers one warning email to the org OWNER, sent via Resend (the org's own channel is the thing that's broken), only on the `CONNECTED → FAILED` transition — not on every failed send.
- Scoped to `notifications` (org-branded reminder emails) only; `auth` emails (invites, password reset) keep using Casso's own Resend domain unconditionally.
- The separately-proposed display-name-only customization (`From: "Công ty ABC (qua Casso)" <noreply@casso.vn>`, all tiers, no DNS/SMTP) is unaffected and still applies as the display identity even when a send falls back to Resend.

## Consequences

- No DNS records, no propagation delay, no domain-verification webhook endpoint, no stale-verification detection to build — the model that made #43's original scope heavy is gone.
- Deliverability and support burden for the org's own SMTP server (rate limits, misconfiguration, outages) now sits with the organization, not Casso — Casso's job is limited to relaying, detecting failure, and falling back safely.
- Casso now stores third-party SMTP credentials at rest (reusing the existing AES-256-GCM `encryptToken`/`decryptToken` helper from bank-connection token storage) — a new class of secret this codebase custodies beyond its own integrations.
- A config can only exist in `CONNECTED` or `FAILED` state; there is no `PENDING`/`unverified` state and no org-facing enable/disable toggle. Re-enabling after a failure requires the org to fix their server and pass the test-send again — accepted as simpler than modeling a third state for a rare scenario.
