# Skill: domain-check

Check domain rules compliance across the codebase.

## When to use

User says: "check domain rules", "check domain", "domain compliance"

## Rules to check

1. **Money as integer**: Search for `float`, `decimal` used for money amounts
   - Should be `integer` or `bigint` in TypeORM
   - Never use `parseFloat` or decimal for money

2. **Tenant isolation**: Every query/write must scope by `organizationId`
   - Check repositories for missing `organizationId` in where clauses
   - Check use cases for missing tenant context

3. **Clean architecture**: Domain layer must NOT import NestJS/TypeORM
   - Check `*/domain/*.ts` for forbidden imports

4. **Transaction wrapping**: Write operations changing money/status must be in transaction
   - Check use cases for `dataSource.transaction()` or `EntityManager`

5. **Persisted rollup**: `paidAmount` and `allocatedAmount` only updated in transaction with lock
   - Check for direct updates outside transactions

6. **No `any` in production code**: Search for `: any` or `as any` in non-test files

7. **Derived fields not stored**: `remainingAmount`, `isOverdue`, `isDisputed` computed at query time

8. **`@VersionColumn()`**: Present on entities with concurrent writes

## Output

Report violations per file with line numbers.
