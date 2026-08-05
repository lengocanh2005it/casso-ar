# Skill: new-endpoint

Create a new API endpoint with controller, DTO, and validation.

## When to use

User says: "create endpoint", "new API", "add route"

## Steps

1. Create request DTO with class-validator:
```typescript
export class Create<X>Dto {
  @IsUUID()
  entityId: string;

  @IsInt()
  @IsPositive()
  amount: number;
}
```

2. Create response DTO (never leak organizationId/version):
```typescript
export type <X>ResponseDto = Omit<Entity, 'organizationId'>;
```

3. Add controller method:
```typescript
@Post()
@RequirePermission(Permission.<X>_WRITE)
async create(@Body() dto: Create<X>Dto) {
  const result = await this.useCase.execute(dto);
  return to<X>Response(result);
}
```

4. Register controller in module if new

5. Update tests

6. Test endpoint manually or with integration test

7. Commit: `feat: add POST /<endpoint>`
