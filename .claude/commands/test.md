Run all unit tests for the backend.

For implementation work, follow RED → GREEN → REFACTOR: run the focused test after writing it to verify RED, implement the minimum change, then run it again for GREEN before refactoring.

```bash
cd apps/backend && npx jest --verbose
```

For specific test:
```bash
cd apps/backend && npx jest --testPathPattern <name>
```

Report: number of test suites, tests passed/failed, any errors, and (when applicable) whether the RED/GREEN checks were observed.
