# Signup abuse hardening: escalating rate limits over CAPTCHA, structured logs over a new audit table

**Status:** proposed

Issue #337 asks for an "anti-automation challenge or equivalent risk control" against tax-code lookup/signup abuse, and for signup/verification events to be "auditable." We chose two deliberately lighter-weight mechanisms over the heavier defaults a reader might expect.

**Anti-automation: escalating per-dimension rate limits, not CAPTCHA.** The issue's own wording ("or equivalent risk control") explicitly allows this. A third-party CAPTCHA (hCaptcha, Cloudflare Turnstile) would add an external dependency, a secret key to manage, and a frontend widget across two apps, for a public pre-auth form that already gets independent IP/email/tax-code throttling (rule 18). Instead, repeated `429`s from the same IP escalate that IP to a much stricter, longer cooldown across every signup/lookup route — server-side only, testable without mocking a third party. Revisit CAPTCHA if escalating throttling proves insufficient against real abuse.

**Auditability: structured `info` logs, not a new persisted audit table.** `PendingSignup` (ADR-0026) exists before any `Organization`, and tenant `AuditLog` requires a non-null `organizationId` — the identical reason `OperatorAuditLog` already exists as a separate table from tenant `AuditLog` (see its `CONTEXT.md` entry). Adding a third audit-table shape (`AuditLog`, `OperatorAuditLog`, and now a pre-tenant one) before any consumer needs to query pre-tenant signup history is speculative; the codebase's own logging rules already call for exactly this class of event ("info: Business events") through the structured logger. Promote to a persisted table if an actual admin-facing need to browse/query pre-tenant signup activity shows up later.

## Considered Options

- **CAPTCHA (Cloudflare Turnstile)** — rejected for now per the above; the issue permits the lighter alternative and this codebase has no existing CAPTCHA port/adapter to build on.
- **Email step-up challenge** (confirm a link before the real signup POST) — rejected: doesn't cover the tax-code lookup endpoint at all (no email involved there), and adds signup friction for the common case to stop abuse a rate limit already addresses.
- **New pre-tenant audit table** (mirroring `OperatorAuditLog`) — rejected for now per the above; revisit if an admin UI need to query pre-tenant signup history appears.
