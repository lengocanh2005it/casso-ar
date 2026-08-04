Scaffold a new frontend feature folder with standard structure.

Usage: `/scaffold-feature <feature-name>`

Creates:
```
apps/frontend/src/features/<feature-name>/
  pages/           -- page components
  components/      -- feature-specific components
  hooks/           -- data fetching, business logic
  api/             -- API call functions
  index.ts         -- barrel export
```

Also adds route placeholder in `routes/index.tsx`.
