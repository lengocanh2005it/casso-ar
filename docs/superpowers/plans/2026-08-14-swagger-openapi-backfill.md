# Swagger/OpenAPI Backfill Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backfill `@ApiOperation`, response decorators, `@ApiErrorResponse`, and `@ApiHeader('idempotency-key')` (where wrapped) onto every remaining controller, and convert HTTP-facing response DTOs from `interface` to `class`, so `GET /api/docs-json` shows every endpoint with error responses.

**Spec:** GitHub issue #168 (lengocanh2005it/casso-ledger) — "docs: backfill OpenAPI annotations for remaining modules (template: #139)".

**Template:** `apps/backend/src/modules/receivables/presentation/receivables.controller.ts` (shipped in #139, plan at `docs/superpowers/plans/2026-08-13-swagger-openapi-docs.md`). Deviations recorded there are binding:
- File-download endpoints use `@ApiOkResponse({ content: { '<mime>': { schema: { type: 'string', format: 'binary' } } } })` — NEVER `@ApiProduces`.
- Query DTOs with `@Type(() => Number)` render `$ref: Object` — add explicit `@ApiProperty({ type: Number, ... })`.
- e2e (`@swc/jest`) never sees plugin metadata — assert runtime decorators only; property schemas verified via the docs-json sweep at the end.

## Locked Decisions (grilling 2026-08-14)

1. **Scope:** all 21 modules from the issue, INCLUDING finishing partial annotations on `reports` (2/5 done) and `copilot` (2/8 done).
2. **Delivery:** one worktree `feat/swagger-openapi-backfill`, one PR, one commit per module (`docs: annotate <module> module for OpenAPI`).
3. **Regression net:** extend `test/swagger-docs.e2e-spec.ts` to walk ALL `/api/v1` paths and assert every operation has a `summary` and ≥1 error response with the `{ statusCode, errorCode, message }` envelope (exempt `/api/v1/health`).
4. **`.query.ts` → `.dto.ts`:** rename `list-audit-logs.query.ts`, `list-reminder-executions.query.ts`, `list-webhook-inbox.query.ts` (plugin only documents `.dto.ts`/`.entity.ts`).
5. **Uniform coverage:** public/webhook/pre-auth endpoints get full annotations too; inline `@ApiOkResponse` schemas where no DTO class exists (payments-template style).
6. **Error-code completeness:** every `ErrorCode` thrown by an annotated use case MUST have an entry in `STATUS_BY_ERROR_CODE` (+ its spec) and the AGENTS.md table — add missing ones.
7. **Query DTOs:** apply `@ApiProperty({ type: Number })` wherever `@Type(() => Number)` appears.
8. **Cadence:** per module `npx tsc --noEmit` + focused unit tests + lint; ONE server boot at the end for the docs-json sweep + extended e2e.
9. **Order:** `audit-logs` → `billing` → `customer-credits` first (validate pattern), then issue order.
10. **Plan doc:** this file — lean, decisions + checklist.

## Module Checklist (commit per module)

- [ ] audit-logs (1 endpoint; `list-audit-logs.query.ts` → `.dto.ts`)
- [ ] billing (1 endpoint; `SubscriptionResponseDto` interface → class)
- [ ] customer-credits (1 endpoint)
- [ ] auth (9 endpoints incl. `@Public()`) + auth-invites (6 endpoints; `InviteResponseDto` → class)
- [ ] webhooks (1 public endpoint) + webhooks-inbox (2 endpoints; `.query.ts` → `.dto.ts`)
- [ ] payos (3 endpoints; 2 response DTO interfaces → class)
- [ ] email-templates (5 endpoints; `EmailTemplateResponseDto` → class)
- [ ] bank-connections (4 endpoints; `BankConnectionResponseDto` already class)
- [ ] customer-bank-accounts (4 endpoints)
- [ ] alerts (5 endpoints; `AlertResponseDto`/`AlertsPageResponseDto` → class)
- [ ] disputes (2 endpoints; `DisputeResponseDto` → class)
- [ ] exception-queue (9 endpoints; 5 response DTO interfaces → class; `ExceptionQueuePaginationDto` Number fix)
- [ ] invoice-import (1 endpoint)
- [ ] customers (2 endpoints; `CustomerResponseDto` → class; `ListCustomersQueryDto` Number fix)
- [ ] smtp-config (3 endpoints; `SmtpConfigResponseDto` → class)
- [ ] internal-tasks (4 endpoints; `InternalTaskResponseDto` → class)
- [ ] collection-activity (4 endpoints; `CollectionActivityResponseDto` → class)
- [ ] organizations (2 endpoints; `MemberResponseDto` → class)
- [ ] reports (finish 3/5; CSV export uses `content:` form; query DTOs Number fix)
- [ ] reminders (4 endpoints; `list-reminder-executions.query.ts` → `.dto.ts`)
- [ ] copilot (finish 6/8; 5 response DTO interfaces → class; `CopilotDraftsQueryDto` Number fix)

## Final Gate

- [ ] `pnpm verify` green (lint, tsc, unit tests, arch-check)
- [ ] Extended `swagger-docs.e2e-spec.ts` passes (all paths covered)
- [ ] Docs-json sweep: boot server, walk every `/api/v1` path — schemas present, error envelope correct
- [ ] AGENTS.md notes: `.dto.ts` suffix rule + `@ApiProperty({ type: Number })` pattern
- [ ] Push + `gh pr create` (wait for user review)

## Exceptions to TDD

Per AGENTS.md, additive metadata decorators + config-only changes are exceptions — the regression net is the extended e2e (runtime decorators) and the docs-json sweep (plugin output), both written/tested as part of this ticket.
