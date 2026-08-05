---
paths:
  - "apps/frontend/src/**"
---

# Frontend Rules

## File Structure

```
apps/frontend/src/
  features/<feature>/
    pages/           Page components
    components/      Feature-specific components
    hooks/           Data fetching, business logic
    api/             API call functions
    index.ts         Barrel export
  components/
    ui/              shadcn/ui primitives (copy from CLI, don't modify)
    layout/          Sidebar, MobileSidebarWrapper
  lib/
    api-client.ts    API client singleton
    domain-utils.ts  formatVND, shared utilities
  routes/            React Router definitions
```

## Rules

- Feature folder contains its own API, hooks, components
- Only move to `components/` when shared by 2+ features (Rule of Two)
- All API calls use `/api/v1` prefix via `lib/api-client.ts`
- RBAC: `hasPermission(role, permission)` — hide button, never disable
- Money: `formatVND()` utility, integer VND units, never float
- Types from `@casso-ledger/shared-types`
- No `any` in production code
- Use `node:` protocol for Node.js builtins
