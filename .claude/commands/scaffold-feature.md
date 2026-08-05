Scaffold a new frontend feature folder with standard structure.

For a real UI feature, use `frontend-design` before implementation and TDD for interactive behavior. This command only scaffolds structure; do not treat scaffolding as feature completion.

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
