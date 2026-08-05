---
paths:
  - "apps/backend/src/modules/*/*.module.ts"
---

# Module Wiring (`*.module.ts`) Rules

- Keep the order in `@Module({...})` consistent across the repository — preserve it when adding a new module or modifying an existing one:
  1. `imports`: `TypeOrmModule.forFeature([...])` first, followed by dependent modules (`XModule`)
  2. `providers`: DI token bindings (`{ provide: X_REPOSITORY, useClass: TypeOrmXRepository }`) first, followed by use cases (`XUseCase`)
  3. `controllers`
  4. `exports`: export the DI token + use case for other modules (do not export domain/infrastructure internals)
- Always bind DI tokens with `{ provide: SYMBOL, useClass: Concrete }`; DO NOT use `useValue`/`useFactory` unless dynamic initialization is genuinely needed (for example, reading `process.env` — see `JwtModule.register` in `auth.module.ts`).
- When a module depends on another module, import the entire `XModule` (do not import individual providers) — see `receivables.module.ts` importing `CustomersModule`/`BillingModule`.
- If a module needs a port/entity from `common/` (for example, `AUDIT_LOG_REPOSITORY`), bind it directly in that module's `providers` — see `payments.module.ts`.
