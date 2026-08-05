# Skill: new-endpoint

Create a new API endpoint with controller, DTO, and validation.

## When to use

User says: "create endpoint", "new API", "add route"

## Steps

1. Write the first endpoint behavior test and run it to verify RED. Test through the HTTP boundary when validation, permissions, or response mapping are part of the behavior.

2. Create request DTO with class-validator:
```typescript
export class Create<X>Dto {
  @IsUUID()
  entityId: string;

  @IsInt()
  @IsPositive()
  amount: number;
}
```

3. Create response DTO (never leak organizationId/version):
```typescript
export type <X>ResponseDto = Omit<Entity, 'organizationId'>;
```

4. Add the smallest controller/DTO change that makes the test pass:
```typescript
@Post()
@RequirePermission(Permission.<X>_WRITE)
async create(@Body() dto: Create<X>Dto) {
  const result = await this.useCase.execute(dto);
  return to<X>Response(result);
}
```

5. Register controller in module if new

6. Add one test for each next behavior, verifying RED before implementation and GREEN after it

7. Test endpoint manually only as a supplement; automated tests remain the source of regression coverage

8. Refactor only after green, then commit: `feat: add POST /<endpoint>`
