# Skill: tenancy

Set up or modify tenant isolation for a module.

## When to use

User says: "thêm tenant isolation", "setup tenancy", "multi-tenant"

## Current setup

- TenantContextService uses AsyncLocalStorage
- TenantMiddleware extracts x-organization-id from request headers
- Every repository must scope queries by organizationId

## Steps to add tenancy to a module

1. Inject TenantContextService in repository:
```typescript
constructor(
  private readonly tenantContext: TenantContextService,
) {}
```

2. Add organizationId to all queries:
```typescript
async findById(id: string): Promise<Entity | null> {
  return this.repo.findOne({
    where: { id, organizationId: this.tenantContext.getOrganizationId() },
  });
}
```

3. Add organizationId to saves:
```typescript
async save(entity: Entity): Promise<void> {
  await this.repo.save({
    ...entity,
    organizationId: this.tenantContext.getOrganizationId(),
  } as OrmEntity);
}
```

4. Test with multiple organization IDs

## Common mistakes

- Forgetting organizationId in WHERE clause
- Using default organizationId instead of throwing
- Not scoping findByIdForUpdate queries
