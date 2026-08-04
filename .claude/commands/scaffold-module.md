Scaffold a new NestJS module with Clean Architecture layers.

Usage: `/scaffold-module <module-name>`

Creates:
```
apps/backend/src/modules/<module-name>/
  domain/           -- entity, value objects
  application/      -- use cases, repository ports
  infrastructure/   -- TypeORM entities, repository implementations
  presentation/     -- controllers, DTOs
  <module-name>.module.ts
```

Also registers the module in `app.module.ts`.
