---
paths:
  - "apps/backend/src/**/infrastructure/**"
---

# Infrastructure Layer Rules

- Repository must scope queries by `organizationId` from TenantContextService
- Use `@Column('bigint')` for all money fields
- Use `@VersionColumn()` for optimistic locking on concurrent-write entities
- Use `EntityManager` parameter for transactional saves
- Entity class names: `XOrmEntity` (e.g., `CustomerOrmEntity`)
- File naming: `*.orm-entity.ts`, `typeorm-*.repository.ts`
- KHÔNG dùng `SELECT *` — always select specific columns
