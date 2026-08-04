Check domain rules compliance in the codebase.

Search for:
1. `float` or `decimal` used for money amounts (should be integer đồng)
2. Missing `organizationId` in queries (tenant isolation)
3. Domain imports from NestJS/TypeORM (should be clean)
4. Missing transaction wrappers for write operations
5. `console.log` in production code (should use structured logging)
6. `any` type in production code (should be specific types)
7. Missing `@VersionColumn()` on concurrent-write entities
8. `SELECT *` in queries (should select specific columns)

Report violations per file.
