# 1. Shared-schema multi-tenancy instead of schema-per-tenant

Date: 2026-08-03

## Status

Accepted

## Context

Every business entity (`Customer`, `Invoice`, `Receivable`, `Payment`, `BankConnection`, `WebhookInbox`, ...) needs data isolation between `Organization` records. There are two common database-level models for this:

- **Schema-per-tenant** (or database-per-tenant): each organization has its own schema/DB, providing strong physical isolation, but migration/backup/cross-tenant queries (e.g. admin dashboard, billing) become more complex as the number of tenants grows.
- **Shared schema**: one database, with an `organizationId` column on every business table; isolation is enforced at the application layer.

At the current scale (internship project, early SaaS stage, and no customers requiring physical-isolation compliance), the operational cost of maintaining N schemas is not proportional to the benefit.

## Decision

Use **shared schema**: one Postgres database, with an `organizationId NOT NULL` column plus `FOREIGN KEY` and index on every business data table. Shared identity tables such as `User` are deliberate exceptions; a User's tenant access goes through `Membership`.

For requests with an existing tenant context, every business `Repository` must extend `BaseRepository`, which automatically adds `WHERE organizationId = :ctx.organizationId` to every query; service code must not write manual filters. Ingestion/worker paths that run before a JWT exists (`BankConnection.findByIdUnscoped`, `WebhookInbox`, `BankTransaction`) are controlled exceptions: they may use only the tenant resolved from `BankConnection` or trusted job data, must not use `organizationId` from the payload to choose the tenant, and must retain an explicit `organizationId` filter in the repository.

For webhooks/workers without a JWT: **do not** accept `organizationId` from the request/payload to determine the tenant. Resolve `BankConnection` by `bankConnectionId`, then use `connection.organizationId` as the source of truth; reject the request if the payload includes a different `organizationId`.

Do not use Postgres Row-Level Security (RLS) in the MVP — NestJS-layer enforcement through `BaseRepository` is considered sufficient for request-scoped queries; ingestion/worker paths use an explicit `organizationId` filter under the exceptions above.

## Consequences

- Migration, backup, and cross-tenant queries (admin, billing) are as simple as in a normal single-tenant application.
- Tenant-isolation safety depends entirely on code discipline: every request-serving Repository with tenant context must extend `BaseRepository`; exceptional ingestion/worker repositories must receive the resolved tenant and must not use the payload as the source of truth. Every manual query (raw SQL, standalone query builder) remains a potential cross-organization data-leak point. There is no second defense layer at the DB level (RLS) until one is deliberately added.
- If a large customer later requires physical isolation (compliance), migrating from shared schema to schema-per-tenant will be a major project (data migration, connection routing changes, migration pipeline changes) — this decision accepts that trade-off in exchange for simpler operations at the current stage.
- RLS can later be added as a second protection layer without changing the current model.
