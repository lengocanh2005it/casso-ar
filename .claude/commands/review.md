Review the current git diff for issues.

```bash
git diff --staged
```

Check for:
1. Hardcoded secrets or credentials
2. Console.log statements left in
3. Missing error handling
4. Type safety issues
5. Business rule violations (money as float, missing tenant isolation)

Report findings per file.
