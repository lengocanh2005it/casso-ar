---
paths:
  - "apps/backend/src/**/infrastructure/**"
---

# Infrastructure Layer Rules

- Repository must scope queries by organizationId from TenantContextService
- Use @Column('bigint') for all money fields
- Use @VersionColumn() for optimistic locking on concurrent-write entities
- EntityManager parameter required for transactional saves
