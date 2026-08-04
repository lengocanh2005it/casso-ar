# Skill: migration

Create or run TypeORM migrations.

## When to use

User says: "tạo migration", "run migration", "update schema"

## Create migration

1. Check current entity changes:
```bash
cd apps/backend && npx typeorm migration:show
```

2. Generate migration:
```bash
cd apps/backend && npx typeorm migration:generate -d src/config/typeorm.config.ts src/migrations/<Name>
```

3. Review generated SQL

4. Run migration:
```bash
cd apps/backend && npx typeorm migration:run -d src/config/typeorm.config.ts
```

## Rollback

```bash
cd apps/backend && npx typeorm migration:revert -d src/config/typeorm.config.ts
```

## Notes

- Currently using `synchronize: true` for MVP
- Switch to migration-based when:
  - Multiple developers modifying schema
  - Preparing for production
  - Need to rollback changes
