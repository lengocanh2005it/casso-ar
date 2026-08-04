Scaffold a new NestJS module with Clean Architecture layers.

Usage: `/scaffold-module <module-name>`

Creates:
```
apps/backend/src/modules/<module-name>/
  domain/              -- entity (interface or class), value objects
  application/         -- use cases, repository ports (I<Entity>Repository)
  infrastructure/      -- <Entity>OrmEntity, typeorm-<entity>.repository.ts
  presentation/        -- controller, DTOs
  <module-name>.module.ts
```

File naming:
- Domain: `<entity>.ts` or `<entity>.spec.ts`
- Infrastructure: `<entity>.orm-entity.ts`, `typeorm-<entity>.repository.ts`
- Application: `<entity>-repository.port.ts`, `<action>.usecase.ts`
- DI token: `export const <ENTITY>_REPOSITORY = Symbol('<ENTITY>_REPOSITORY')`

Also registers the module in `app.module.ts`.
