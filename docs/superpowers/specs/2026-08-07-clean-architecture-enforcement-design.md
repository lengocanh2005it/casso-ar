# Clean Architecture Enforcement Design

## Goal

Make Clean Architecture boundaries a deterministic `arch-check` gate while adding a small local PR-review skill for semantic checks that import graphs cannot prove.

## Scope

### Deterministic checks

Enforce these production-source dependency rules with severity `error`:

- `domain/` must not depend on `application/`, `infrastructure/`, or `presentation/`.
- `application/` must not depend on `infrastructure/` or `presentation/`.
- `presentation/` must not depend on `infrastructure/`.
- A module must not import another module's `infrastructure/` directly.

Composition-root module files may wire their own module's infrastructure. Test files are excluded from production layer rules because the repository keeps unit tests beside source files.

Use dependency-cruiser for fixed layer edges. Use a small Node script for the relational cross-module infrastructure rule, because that rule must compare the source and target module names.

### Required refactors before enabling the rules

- Move webhook queue ownership behind an application port and infrastructure adapter; the use case must not inject BullMQ directly.
- Remove the invoice repository's direct read of `ReceivableOrmEntity`; expose the required lookup through a receivables application port/repository.
- Move the auth-specific email sender adapter into auth infrastructure while consuming notifications only through its application port/token.

### Local review skill

Add `.claude/skills/clean-architecture-review.md`. It will review the PR diff from the merge-base, run fresh deterministic checks, trace changed flows from controller to persistence, and report only evidence-backed findings with severity, file/line, impact, and fix. It will not modify code unless explicitly requested.

Update `/review` to use the PR diff rather than only the staging area and to invoke this repository-specific review alongside the generic code review.

## Non-goals

- Do not enforce domain business rules that already belong to `domain-check`.
- Do not refactor every existing cross-module application dependency.
- Do not add a new dependency or a separate architecture framework.
- Do not combine this work with feature PRs.

## Verification

The final gate is `pnpm --filter @casso-ledger/backend arch-check`, plus the backend type-check and focused tests for changed adapters/use cases. The architecture checker must pass on the cleaned production source and fail when each forbidden edge is deliberately introduced during validation.
