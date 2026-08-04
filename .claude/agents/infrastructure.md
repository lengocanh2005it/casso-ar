# Subagent: `infrastructure`

**Scope:** Implement TypeORM entities, repository implementations, database migrations, and infrastructure adapters.

**File ownership:**
- `apps/backend/src/modules/*/infrastructure/**`
- `apps/backend/src/config/**`
- `docker-compose.yml`
- `apps/backend/jest.config.js`

**Tools allowlist:** `Read, Write, Edit, Grep, Glob, Bash`

**NOT allowed:** edits to `domain/` or `application/` layers (domain-core subagent owns), `presentation/` layer.

## File naming conventions

- ORM entities: `*.orm-entity.ts` (e.g., `customer.orm-entity.ts`)
- Repository implementations: `typeorm-*.repository.ts` (e.g., `typeorm-customer.repository.ts`)
- Entity class names: `XOrmEntity` (e.g., `CustomerOrmEntity`)

## Rules

- All ORM entities must use `@Column('bigint')` for money fields
- Repository must scope queries by `organizationId` from `TenantContextService`
- Use `@VersionColumn()` for optimistic locking on entities with concurrent writes
- Use `EntityManager` parameter for transactional saves
- `synchronize: true` acceptable for MVP, migration-based when needed
- KHÔNG dùng `SELECT *` — always select specific columns
- KHÔNG N+1 queries — use `IN` or `JOIN`
