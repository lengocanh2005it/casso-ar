# GET /organizations/:id/members

## Summary

Add endpoint to list members of an organization with pagination, user details, and strict tenant isolation.

## Endpoint

```
GET /api/v1/organizations/:id/members?page=1&limit=20
```

## Authorization

- **Guard**: `JwtAuthGuard`, `PermissionGuard`
- **Permission**: `ORGANIZATION_READ` (new)
- **Tenant isolation**: `:id` must match `TenantContextService.getOrganizationId()`, else `FORBIDDEN`

## Response

```typescript
{
  items: MemberResponseDto[],
  total: number,
  page: number,
  limit: number
}
```

### MemberResponseDto

```typescript
{
  id: string;        // membership id
  userId: string;
  email: string;     // from users table
  name: string;      // from users table
  role: Role;
  joinedAt: Date | null;
}
```

## Data Flow

```
OrganizationsController.listMembers()
  → validate :id matches tenant org
  → ListMembersUseCase.execute({ organizationId, page, limit })
    → MembershipRepository.findPageByOrganization() + countByOrganization()
      → JOIN users table for email/name
    → toMemberResponse() mapper
  → { items, total, page, limit }
```

## Files

| File | Action |
|------|--------|
| `common/rbac/permission.enum.ts` | Add `ORGANIZATION_READ` |
| `organizations/application/membership-repository.port.ts` | Add `findPageByOrganization`, `countByOrganization` |
| `organizations/infrastructure/typeorm-membership.repository.ts` | Implement with LEFT JOIN users |
| `organizations/presentation/dto/member-response.dto.ts` | New DTO |
| `organizations/presentation/organizations.controller.ts` | New controller |
| `organizations/organizations.module.ts` | Wire controller, import UserOrmEntity |

## Edge Cases

- `:id` ≠ tenant org → `FORBIDDEN`
- No members → `{ items: [], total: 0, page, limit }`
- Orphaned membership (user deleted) → exclude from results

## Testing

- Unit test: `ListMembersUseCase` with mocked repository
- Integration test: Full endpoint with testcontainers
