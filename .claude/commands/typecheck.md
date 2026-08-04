Run type-check for all packages.

```bash
cd packages/shared-types && npx tsc --noEmit
cd ../../apps/backend && npx tsc --noEmit
```

Report: any type errors found.
