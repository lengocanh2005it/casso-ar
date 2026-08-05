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
- Repository CRUD theo `organizationId` PHẢI extend `BaseRepository` (`common/tenancy/base.repository.ts`) và dùng `scopedFindOne`/`scopedSaveWithManager` — KHÔNG tự viết tay logic scope giống hệt (xem `typeorm-customer.repository.ts`/`typeorm-receivable.repository.ts` làm ví dụ). Ngoại lệ: repository tra bằng token/hash (dòng trên) hoặc entity không có `organizationId` trực tiếp (User, Organization, Membership) không bắt buộc extend.
