Check domain rules compliance in the codebase.

Search for:
1. `float` or `number` used for money amounts (should be integer đồng)
2. Missing `organizationId` in queries (tenant isolation)
3. Domain imports from NestJS/TypeORM (should be clean)
4. Missing transaction wrappers for write operations

Report violations per file.
