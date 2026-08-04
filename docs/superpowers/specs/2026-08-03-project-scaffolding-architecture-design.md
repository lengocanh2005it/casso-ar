# Project Scaffolding & Architecture Design

> Sub-spec of [docs/overview.md](../../../docs/overview.md). Defines repository initialization, monorepo organization, BE/FE source architecture, and shared coding principles — the foundation giving every other spec (domain-core, webhook-matching-engine, reminder-automation...) a concrete place to "live" in the codebase. Uses the standard tooling structure for a pnpm/Turborepo monorepo (turbo.json, pnpm-workspace.yaml, root package.json).

## 1. Monorepo structure (Turborepo + pnpm)

```
casso-ledger/
  apps/
    backend/     -- NestJS modular monolith
    frontend/    -- React 19 + Vite
  packages/
    shared-types/   -- shared BE/FE types (status enums, DTO shapes) — internal package shared by BE/FE
  turbo.json
  pnpm-workspace.yaml
  biome.json
  package.json (root)
```

- `packageManager: "pnpm@10.x"`, `engines.node: ">=20"`.
- `turbo.json`: tasks `build`, `dev`, `lint`, `format`, `test`, `type-check`; each task uses `dependsOn: ["^build"]` when `packages/shared-types` must be built first.
- Root scripts: `dev:backend`/`dev:frontend` filter with `--filter=@casso-ledger/<name>`, while `verify` = combined lint + type-check + test (run before opening a PR and also used by CI).
- Do not create separate `packages/eslint-config` or `packages/ui` in the MVP — the two apps sharing one root `biome.json` is enough, avoiding an unnecessary package before a third app needs reuse (YAGNI).

## 2. Backend — Clean Architecture (4 layers) + Design Pattern catalog

Each business module (`receivables`, `payments`, `webhooks`, `reminders`...) is organized into 4 directories:

```
apps/backend/src/modules/receivables/
  domain/            -- pure TS entities (Receivable, state machine), value objects, domain errors
                        MUST NOT import NestJS/TypeORM/framework code
  application/        -- use cases (e.g. CreateReceivableUseCase, WriteOffReceivableUseCase),
                        defines interfaces/ports (IReceivableRepository) implemented by infrastructure
  infrastructure/      -- concrete implementations: TypeOrmReceivableRepository and Adapters
                        (EmailProviderAdapter, CasIdIntegrationAdapter) designed in other specs
  presentation/         -- controllers, request/response DTOs, NestJS module wiring (DI binding
                        from the application interface → infrastructure implementation)
```

Dependency rule: `presentation → application → domain`, `infrastructure → application` (implements ports), and `domain` depends on no outer layer — ensuring `application`/`domain` tests do not need to start NestJS or a real DB (pure unit tests following the layering in [2026-08-03-testing-strategy-design.md](2026-08-03-testing-strategy-design.md)).

**Applied design patterns** (map to patterns already used in previous specs; do not add patterns without a need):

| Pattern | Where it applies |
|---|---|
| Repository | Every `I<Entity>Repository` port in `application/`, with TypeORM implementations in `infrastructure/` |
| Adapter | `EmailProviderAdapter` (Resend), `CasIdIntegrationAdapter` (mock/real) — isolates external APIs |
| Strategy | Matching Engine: each scoring function (`referenceCodeScore`, `amountScore`...) is an independent strategy, aggregated by a shared formula |
| Observer / Event-driven | Domain event (`Receivable.status` changes, `PaymentAllocation` created) → listener records `CollectionActivity` and creates `InternalTask` — uses NestJS `EventEmitter2` |
| Use Case (Application Service) | Each business action has its own use-case class in `application/`; the controller only calls the use case and contains no business logic |

Do not use Factory/Builder/Decorator in the MVP — no entity requires sufficiently complex initialization to justify a separate pattern (YAGNI).

## 3. Frontend — Feature-based structure

```
apps/frontend/src/
  features/
    receivables/      -- components, hooks (useReceivables, useWriteOff...), api/ (TanStack Query), types
    customers/
    bank-connections/
    transactions/       -- matching/reconciliation UI
    exceptions/
    reminders/
    copilot/
    reports/
    settings/           -- billing, user, RBAC
  components/ui/        -- shared shadcn/ui primitives (copy from CLI; do not edit manually)
  components/layout/     -- Sidebar, MobileSidebarWrapper... (designed in the frontend-design-system spec)
  lib/                   -- shared API client instance and domain-utils not owned by a feature
  routes/                -- React Router 7 route definitions, mapping 1-to-1 to the agreed navItems
```

Each feature folder owns its API calls + hooks + components — promote a component to `components/` only when shared by 2+ features, avoiding early extraction when it has one consumer.

### Rules for preventing duplicated code between features

```
1. Shared types/enums (status, domain-core DTO shapes) → define them exactly once
   in packages/shared-types and import them into both BE and FE — do not redefine them
   in each feature (the most common duplication source: enum OPEN/PARTIALLY_PAID/PAID...
   used in receivables, reminders, reports, and copilot).

2. API client (base URL, auth header, error interceptor) → one shared instance in lib/api-client.ts;
   each feature/api/ exports only the endpoint-specific functions using that shared instance,
   and does not create its own client.

3. A hook/component used by EXACTLY 1 feature → keep it in that feature; do not extract early.
   "Rule of two": accept a copy the first time; move it to components/ or lib/ only when a
   SECOND feature actually needs reuse (not merely "might need it").

4. Computed business rules (e.g. the isOverdue formula, VND currency formatting) → one pure
   shared function in lib/domain-utils.ts; do not rewrite calculation logic across
   individual feature components.
```

## 4. Coding principles

**Tooling (shared at the root; no separate package per app):**
```
Biome (biome.json root)  -- format + lint in one tool, replacing ESLint/Prettier
Husky + lint-staged       -- pre-commit: biome check + type-check on staged files
TypeScript strict mode    -- enabled in both apps
```

**Naming convention:** files use kebab-case (`create-receivable.usecase.ts`), classes PascalCase, variables/functions camelCase, and enums UPPER_SNAKE_CASE (matching status values used throughout the specs, e.g. `PARTIALLY_PAID`).

**Domain-specific rules (must be reviewed in code review, not suggestions):**
- Money: integer amounts in VND (do not use `float`/arbitrary decimals) — avoid cumulative rounding errors when calculating `paidAmount`/`remainingAmount`.
- Every write that changes money/status (allocation, write-off, undo) must be in one DB transaction — defined in section 4.6 of [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md); this spec repeats it only as a code-review checklist and does not redefine it.
- `paidAmount` on `Receivable` and `allocatedAmount` on `Payment` are persisted rollups so reporting does not aggregate every allocation. They may be updated only in an allocation/undo transaction with a row lock and DB check constraint; no service may update them independently.
- `remainingAmount`, `unallocatedAmount`, `isDisputed`, and `isOverdue` are derived fields calculated from persisted data at query/domain-method time.

## 5. API conventions (apply to every BE module)

- **Versioning:** one fixed `/api/v1` prefix for the entire business API (agreed in section 13 of [IMPLEMENTATION-ORDER.md](../IMPLEMENTATION-ORDER.md)). The MVP does not support multiple parallel versions; for a breaking change, add `/api/v2` only for that endpoint rather than bumping the entire prefix.
- **Idempotency-Key:** every `POST` endpoint that creates a resource or changes money/status from an FE user action (`POST /receivables`, `POST /payments/:id/allocate`, `POST /invoices/import`, `POST /bank-connections/cas-id/sessions/:id/exchange`...) accepts an `Idempotency-Key` header (the client generates the UUID). BE stores the key by `(organizationId, endpoint, key)` in the shared `idempotency_keys` table (TTL 24h, unique constraint) — a duplicate-key request returns the stored response without rerunning the use case. This does not apply to webhooks (which already have their own `WebhookInbox.providerTransactionId`) or `GET` requests. FE generates a new key each time the user submits (do not reuse a key after editing the form and submitting again).
- **Error envelope:** every error (4xx/5xx) returns JSON `{ statusCode, errorCode, message, details? }`. `errorCode` is a stable `UPPER_SNAKE_CASE` string for FE switching (e.g. `VALIDATION_ERROR`, `PERMISSION_DENIED`, `TENANT_MISMATCH`, `PLAN_LIMIT_EXCEEDED`, `ALLOCATION_EXCEEDS_REMAINING`, `OPTIMISTIC_LOCK_CONFLICT`); `message` is displayable text, not for FE parsing. The `errorCode` list is defined incrementally in each business spec as domain-specific errors arise — this spec fixes only the shared shape and naming convention, preventing each module from inventing its own format.

## 6. GitHub repo setup

```
Create a new GitHub repository (owner: user), with `main` as the default branch.
Protect `main`: require PR review + passing CI (`turbo run verify`) before merging.
.gitignore: node_modules, dist, .env, .turbo
```

## 7. Out of scope

- Detailed CI/CD pipeline (specific GitHub Actions workflow YAML) — only require `turbo run verify` to pass; this spec does not write the workflow file.
- Internal component library beyond shadcn/ui, or separate `eslint-config`/`ui` packages — add when a third app needs reuse (see section 1).
- Docker Compose/deployment details — covered in [2026-08-03-deployment-observability-design.md](2026-08-03-deployment-observability-design.md); this spec defines source-code structure and does not repeat deployment.

## 8. Open questions (do not block implementation)

- Should `packages/shared-types` build `.d.ts` through a separate `tsc` run, or use project references (`tsconfig.json` `references`) so BE/FE always see the latest types during development without a manual rebuild?
- Do we need a convention for PR/branch names (e.g. `feat/`, `fix/` prefixes), or should naming remain flexible because the team is small?
