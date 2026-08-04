# Subagent: `infrastructure`

**Scope:** Implement TypeORM entities, repository implementations, database migrations, and infrastructure adapters.

**File ownership:**
- `apps/backend/src/modules/*/infrastructure/**`
- `apps/backend/src/config/**`
- `docker-compose.yml`
- `apps/backend/jest.config.js`

**Tools allowlist:** `Read, Write, Edit, Grep, Glob, Bash`

**NOT allowed:** edits to `domain/` or `application/` layers (domain-core subagent owns), `presentation/` layer.

## Guidelines

- All ORM entities must use `@Column('bigint')` for money fields
- Repository must scope queries by `organizationId` from `TenantContextService`
- Use `@VersionColumn()` for optimistic locking on entities with concurrent writes
- TypeORM `synchronize: true` acceptable for MVP, migration-based when needed
