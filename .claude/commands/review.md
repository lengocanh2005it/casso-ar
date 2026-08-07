Review the current PR or local diff for issues. Use the `code-review` skill. For backend changes, also use `.claude/skills/clean-architecture-review.md`; it supplies the Clean Architecture checks while `code-review` covers standards and spec compliance. If the review is for a completed feature or PR, also use `verification-before-completion` and distinguish verified findings from assumptions.

Resolve the committed PR range from its GitHub base SHA, falling back to `git merge-base origin/main HEAD`:

```bash
BASE_SHA="$(gh pr view --json baseRefOid --jq .baseRefOid 2>/dev/null || true)"
BASE_SHA="${BASE_SHA:-$(git merge-base origin/main HEAD)}"
git diff "$BASE_SHA...HEAD"
```

When there is no committed PR range, also review both local change sets:

```bash
git diff --staged
git diff
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
10. Missing test-first evidence for new behavior or bug fixes (failing test before production change)

Report findings per file.
