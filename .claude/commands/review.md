Review the current git diff for issues.

```bash
git diff --staged
```

Check for:
1. Hardcoded secrets or credentials (API keys, passwords, tokens)
2. `console.log` statements left in (use structured logging instead)
3. Missing error handling (throw errors, not return { success: false })
4. Type safety issues (`any` in production code)
5. Business rule violations (money as float, missing tenant isolation)
6. Performance issues (N+1 queries, `SELECT *`, missing pagination)
7. Forbidden packages (lodash, moment, axios, uuid)
8. Missing `node:` protocol for Node.js builtins
9. Domain layer importing NestJS/TypeORM

Report findings per file.
