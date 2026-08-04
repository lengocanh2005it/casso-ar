Lint and format frontend code.

```bash
cd apps/frontend && npx biome check --write .
cd apps/frontend && npx eslint . --fix
```

Or from root:
```bash
pnpm lint
pnpm format
```

Report: any lint errors or formatting changes.
