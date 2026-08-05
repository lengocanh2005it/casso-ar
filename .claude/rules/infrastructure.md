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
- KHÔNG import infrastructure/ của module khác trực tiếp — muốn dùng dữ liệu module khác, đi qua port ở application/
- Query tra bằng token/hash bí mật (email-verification, refresh-token, password-reset) KHÔNG cần scope organizationId — token tự nó là khóa tra cứu trước khi biết tenant. Đây là exception có chủ đích, không phải bug.
