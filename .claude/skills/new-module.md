# Skill: new-module

Scaffold a new NestJS module with Clean Architecture 4 layers.

## When to use

User says: "create a new module", "scaffold module", "new module for X"

## File naming conventions

- Domain entity: `<entity>.ts` (interface or class)
- Domain test: `<entity>.spec.ts`
- Repository port: `<entity>-repository.port.ts`
- ORM entity: `<entity>.orm-entity.ts`
- Repository impl: `typeorm-<entity>.repository.ts`
- Use case: `<action>.usecase.ts`
- DTO: `<entity>.dto.ts`
- DI token: `export const <ENTITY>_REPOSITORY = Symbol('<ENTITY>_REPOSITORY')`

## Steps

1. Define the first externally observable behavior and write its domain/use-case test. Run it and verify RED.

2. Create directory structure:
```
apps/backend/src/modules/<name>/
  domain/           -- entity, value objects
  application/      -- use cases, repository ports
  infrastructure/   -- TypeORM entities, repository implementations
  presentation/     -- controllers, DTOs
  <name>.module.ts
```

3. Create domain entity as interface (no behavior) or class (has behavior)

4. Create repository port in application layer

5. Create TypeORM entity in infrastructure:
- Use `@Column('bigint')` for money fields
- Use `@VersionColumn()` for optimistic locking if needed

6. Create repository implementation:
- Inject TenantContextService for organizationId scoping
- Use EntityManager for transactional saves

7. Create module file with DI wiring

8. Register in app.module.ts

9. Add one test/implementation slice at a time; do not defer all tests until the module is complete

10. Run focused tests after each RED and GREEN step: `npx jest --testPathPattern <name>`

11. Refactor only after green, then commit with message: `feat: add <name> module`
