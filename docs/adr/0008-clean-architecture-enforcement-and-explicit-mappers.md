# 8. Enforce Clean Architecture layers with `arch-check` and explicit domain↔ORM mappers

Date: 2026-08-11

## Status

Accepted

## Context

The project scaffolding (Plan #1) declared four-layer modules (`domain/`, `application/`, `infrastructure/`, `presentation/`), but nothing enforced the boundaries — they drifted over time. Whole-repo review passes found the same three drift classes recurring:

1. **Type-only import erasure.** `import type` on classes used in NestJS constructor params/decorators erases them to `Function`/`Object` at runtime (`emitDecoratorMetadata`), silently breaking DI — several real boot failures were caught only by running the app.
2. **Domain↔ORM casts.** `as`/`as unknown as` casts let shape drift between a domain entity and its ORM entity compile silently; one such cast handed TypeORM a live class instance instead of a plain row (PR #38, `typeorm-invoice.repository.ts`).
3. **Layer violations.** `HttpException` and concrete SDK imports (`@nestjs/jwt`, `resend`) leaked into application-layer use cases (9 findings in the 2026-08-06 whole-repo review); the `version` field of `@VersionColumn()` ORM entities was repeatedly missing on their domain counterparts.

## Decision

1. **Static enforcement.** `arch-check` runs inside `pnpm verify`: dependency-cruiser over `src/` (forbids wrong-layer imports) plus `scripts/check-application-exceptions.mjs` and `scripts/check-cross-module-infrastructure.mjs` (cross-module import rules).
2. **Layer rules**, recorded in `.claude/rules/` (`application.md`, `infrastructure.md`, `typescript.md`, `domain.md`, `api.md`, `module-wiring.md`) and `AGENTS.md`:
   - `domain/` never imports NestJS/TypeORM.
   - `application/` never imports concrete SDK/integration libraries and never throws `HttpException` — `AppError` + `ErrorCode` is the only exception type; `HttpExceptionFilter` is the single place that translates it to an HTTP response.
3. **Explicit mappers.** Domain↔ORM translation goes through explicit `toOrm()`/`fromOrm()` methods in each repository; casting (`as any`, `as unknown as`) is forbidden in production `src/` (verified repo-wide by grep — zero casts). A drift between the two shapes must fail the compiler, not be cast away.
4. **Optimistic-lock convention.** ORM entities carry `@VersionColumn()`, and the domain entity carries a matching `version` field wired through the mappers (`Receivable`, `Subscription`, `ReminderExecution`, `BankTransaction`, …).
5. **Value imports for DI.** Classes used in constructor params or decorators must be value-imported, never `import type`; Biome's `useImportType` rule is disabled repo-wide for this reason.

## Consequences

- The three recurring bug classes now fail `pnpm verify` instead of surfacing at runtime in production.
- An explicit mapper per aggregate is added boilerplate — accepted in exchange for compiler-checked contracts.
- New modules must adopt the same structure; because CI runs `pnpm verify` (Plan #22), drift is caught in CI rather than by ad-hoc reviews.
