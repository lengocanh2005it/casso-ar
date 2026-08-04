# Skill: new-module

Scaffold a new NestJS module with Clean Architecture 4 layers.

## When to use

User says: "tạo module mới", "scaffold module", "new module for X"

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

1. Create directory structure:
```
apps/backend/src/modules/<name>/
  domain/           -- entity, value objects
  application/      -- use cases, repository ports
  infrastructure/   -- TypeORM entities, repository implementations
  presentation/     -- controllers, DTOs
  <name>.module.ts
```

2. Create domain entity as interface (no behavior) or class (has behavior)

3. Create repository port in application layer

4. Create TypeORM entity in infrastructure:
- Use `@Column('bigint')` for money fields
- Use `@VersionColumn()` for optimistic locking if needed

5. Create repository implementation:
- Inject TenantContextService for organizationId scoping
- Use EntityManager for transactional saves

6. Create module file with DI wiring

7. Register in app.module.ts

8. Create domain test (*.spec.ts)

9. Run tests: `npx jest --testPathPattern <name>`

10. Commit with message: `feat: add <name> module`
