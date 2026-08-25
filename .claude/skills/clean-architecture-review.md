# Skill: clean-architecture-review

Review backend PRs for Clean Architecture compliance only. Do not modify code unless the user explicitly requests fixes.

## Diff and context

1. Read `AGENTS.md` and the relevant `.claude/rules/{domain,application,infrastructure,api}.md` files for changed backend layers. For changed backend module files, read `.claude/rules/module-wiring.md` before reviewing module composition roots.
2. Resolve the committed review range:

   ```bash
   BASE_SHA="$(gh pr view --json baseRefOid --jq .baseRefOid 2>/dev/null || true)"
   BASE_SHA="${BASE_SHA:-$(git merge-base origin/main HEAD)}"
   git diff "$BASE_SHA...HEAD"
   ```

   When no PR range exists, also inspect `git diff --staged` and `git diff` for local staged and unstaged changes.
3. State the resolved base SHA and whether each reviewed change is committed, staged, or unstaged.

## Fresh checks

For changed backend code, run:

```bash
pnpm --filter @casso-ar/backend arch-check
pnpm --filter @casso-ar/backend type-check
pnpm --filter @casso-ar/backend test -- <changed-test-files> --runInBand
git diff --check "$BASE_SHA...HEAD"
git diff --check --staged
git diff --check
```

Run `/domain-check` when the diff touches domain rules. If a required test environment is unavailable, report that as unavailable rather than inferring a pass or failure.

## Review

- Trace each changed backend flow: `presentation → application → port → infrastructure → persistence`.
- Check domain purity; application ports and absence of concrete SDK/infrastructure imports; infrastructure mappers, tenant scope, and query ownership; thin presentation; module composition roots; and direct cross-module infrastructure imports.
- Let `arch-check` prove static boundaries. Do not repeat the full `/domain-check` checklist.

## Output

Report only evidence-backed findings. For each finding include severity, `file:line`, violated rule, impact, and minimal fix. Label command output as **Verified**; label missing context or unavailable infrastructure as **Unavailable** or **Assumption**. If no evidence-backed findings exist, state **PASS** explicitly.
