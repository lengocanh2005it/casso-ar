Check if the project is ready for deployment.

1. Lint: `cd apps/backend && npx biome check .`
2. Type-check: `cd packages/shared-types && npx tsc --noEmit && cd ../../apps/backend && npx tsc --noEmit`
3. Unit tests: `cd apps/backend && npx jest --silent`
4. Git status: `git status --short`
5. Docker compose: `docker compose config`

Report: pass/fail for each check.
