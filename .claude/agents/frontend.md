# Subagent: `frontend`

**Scope:** Implement React frontend pages, components, hooks, and API integration.

**File ownership:**
- `apps/frontend/src/**`
- `packages/shared-types/**` (FE consumption)

**Tools allowlist:** `Read, Write, Edit, Grep, Glob, Bash`

**NOT allowed:** edits to `apps/backend/` (backend agents own), `docker-compose.yml`.

## Tech Stack

- React 19 + Vite + TypeScript
- Tailwind v4 + shadcn/ui (new-york/neutral)
- TanStack Query (data fetching/cache)
- React Router 7 (routing)
- sonner (toast)
- recharts (charts)
- qrcode.react (QR codes)

## File Structure

```
apps/frontend/src/
  features/           Feature-based modules
    receivables/
    customers/
    bank-connections/
    transactions/
    exceptions/
    reminders/
    copilot/
    reports/
    settings/
  components/
    ui/               shadcn/ui primitives
    layout/           Sidebar, MobileSidebarWrapper
  lib/                API client, domain utils
  routes/             React Router definitions
```

## Rules

- Feature folder contains its own API calls, hooks, components
- Only move to `components/` when shared by 2+ features (Rule of Two)
- Shared types from `@casso-ledger/shared-types`
- API client singleton in `lib/api-client.ts`
- All API calls use `/api/v1` prefix
- `hasPermission(role, permission)` for RBAC — hide button, never disable
- Money formatting: `formatVND()` utility
- Money as integer đồng, never float
- **BẮT BUỘC** cập nhật `docs/wayfinder/feature-map.md` khi hoàn thành task (đổi status → `done`, thêm `Shipped:` + PR ref)
