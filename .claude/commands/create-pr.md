Create a PR for the current branch.

**Prerequisites (from AGENTS.md workflow):**
- Must be on a worktree branch (not `main`)
- Tests must pass: `cd apps/backend && npx jest --silent`
- Type-check must pass: `cd apps/backend && npx tsc --noEmit`
- New behavior and bug fixes must include TDD evidence: a relevant test failed before the production change, then passed after it
- Run `verification-before-completion` immediately before creating the PR and use its fresh evidence in the test plan
- Use `requesting-code-review` before opening the PR; wait for user review before merging

**Steps:**
1. Check current branch: `git branch --show-current`
2. Check commits: `git log main..HEAD --oneline`
3. Check diff stats: `git diff main..HEAD --stat`
4. Create PR:
```bash
gh pr create \
  --title "feat: <mô tả>" \
  --body "## Changes

- <list changes>

## Test plan
- [ ] Unit tests pass
- [ ] TDD RED → GREEN evidence recorded, or a documented exception applies
- [ ] Type-check passes
- [ ] Manual testing completed

Closes #<issue>"
```

Use conventional commit format for PR title.
