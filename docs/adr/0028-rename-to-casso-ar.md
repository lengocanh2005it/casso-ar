# Rename project from Casso Ledger to Casso AR

**Status:** accepted

The project was originally named "Casso Ledger" during initial scaffolding and early domain development. As the domain matured around accounts receivable lifecycle management, automated bank reconciliation, reminder orchestration, and dispute handling, "Casso AR" became the canonical and accurate name for the product, differentiating it from generic general ledger software (issue #362).

## Settled Decisions

1. **Full mechanical rename across codebase:**
   - Monorepo package scope updated from `@casso-ledger/*` (`@casso-ledger/backend`, `@casso-ledger/frontend`, `@casso-ledger/shared-types`) to `@casso-ar/*` (`@casso-ar/backend`, `@casso-ar/frontend`, `@casso-ar/shared-types`).
   - Root `package.json` name updated to `casso-ar` and `pnpm-lock.yaml` regenerated.
   - Database default name renamed from `casso_ledger` to `casso_ar` across `docker-compose.yml`, `apps/backend/.env.example`, `typeorm.config.ts`, and local environment configurations.
   - Branding text, email templates, system prompts (Copilot), OpenAPI documentation title, UI logos, and living docs updated from "Casso Ledger" to "Casso AR".

2. **Repository and directory stability:**
   - The GitHub repository name remains `lengocanh2005it/casso-ledger` to prevent broken remote references, issue links, and CI URLs.
   - Local directory structures remain unchanged.

3. **Historical documentation preservation:**
   - Historical implementation plans under `docs/superpowers/plans/**` and specifications under `docs/superpowers/specs/**` are intentionally preserved as immutable historical artifacts.
   - Prior ADR `docs/adr/0021-casso-flow-not-cas-id-for-bank-integration.md` is kept untouched to preserve the context of the bank integration decision at the time it was authored.

4. **Cutover & data state:**
   - The database environment contains only development seed data and automated test datasets; renaming the database identifier is a straightforward configuration change without requiring live production data migration.

## Considered Options

- **Keep `@casso-ledger/*` package scopes and rename only UI labels:** rejected because having divergent package scopes, database names, and brand names creates confusion across developers and subagents.
- **Rename GitHub repository `lengocanh2005it/casso-ledger`:** rejected to preserve external URLs, issue tracker references, and git remote URLs.
- **Rewrite historical plans and specs:** rejected to keep previous execution transcripts and specifications verifiable against their original records.
