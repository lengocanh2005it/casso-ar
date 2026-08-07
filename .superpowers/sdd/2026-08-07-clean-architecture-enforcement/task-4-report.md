# Task 4 Report: Auth email adapter ownership

## Scope completed

- Moved `ResendAuthEmailSenderAdapter` and its existing behavior spec from `notifications/infrastructure` to `auth/infrastructure`.
- Updated `AuthModule` to use the local auth infrastructure adapter.
- Kept the adapter dependent on notifications' application-level `EMAIL_PROVIDER_ADAPTER` / `IEmailProviderAdapter` port; no auth-to-notifications infrastructure import remains.

## Behavior preserved

- Verification, password-reset, and invite subjects, HTML, and `emailType` metadata are unchanged.
- Provider failures are still logged and swallowed so auth flows do not fail after persistence succeeds.
- No new behavior or dependencies were added.

## Verification

| Command | Result |
| --- | --- |
| `pnpm --filter @casso-ledger/backend test -- --runInBand src/modules/auth` | 10 suites passed, 19 tests passed |
| `pnpm --filter @casso-ledger/backend type-check` | passed |
| `pnpm --filter @casso-ledger/backend arch-check` | passed: dependency, application-boundary, and cross-module-infrastructure checks |

## Notes

- The existing adapter spec was relocated with the adapter; no speculative test was added.
- No unrelated files were changed.
