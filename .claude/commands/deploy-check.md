Check if the project is ready for deployment.

1. Run tests: `cd apps/backend && npx jest --silent`
2. Run type-check: `cd apps/backend && npx tsc --noEmit`
3. Check for uncommitted changes: `git status`
4. Check Docker compose: `docker compose config`

Report: pass/fail for each check.
