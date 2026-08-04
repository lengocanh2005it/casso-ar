# Frontend Design System & Navigation

> Sub-spec of [docs/overview.md](../../../docs/overview.md). Defines the stack, design tokens, and FE navigation structure following the shared palette and component patterns of the Casso/payOS ecosystem.

## 1. Stack & design tokens

Reuse the entire stack; do not choose a different one — this keeps the implementation aligned with the CASSO ecosystem and saves time building UI components from scratch:

```
React 19 + Vite + TypeScript
Tailwind v4 + shadcn/ui (style "new-york", base color "neutral")
Radix UI (@radix-ui/react-slot, radix-ui) + lucide-react (icons)
TanStack Query (data fetching/cache)
React Router 7 (routing)
sonner (toast)
qrcode.react (display the QR code for the Cas ID connection — directly reused for the flow in
  section 1 of 2026-08-03-cas-id-bank-connection-design.md)
recharts (aging chart, dashboard — used for the Aging Dashboard, sections 7.11/18 of the source document)
```

Font: `"Be Vietnam Pro"`, fallback `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.

Primary color: `oklch(0.635 0.168 155)` ≈ `#16AB64` (CASSO/payOS green). Use the shadcn/ui CSS variable set defined by the design tokens below — including `--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--sidebar-*`, `--chart-1..5` — for both `:root` (light) and `.dark`. Keep all oklch values unchanged to ensure visual consistency with the other products in the Casso ecosystem.

## 2. Sidebar & navigation

```
navItems (in the agreed order):
  { to: '/dashboard',        label: 'Dashboard',            icon: LayoutDashboard }
  { to: '/customers',        label: 'Customers',             icon: Users }
  { to: '/receivables',      label: 'Receivables',            icon: FileText }
  { to: '/bank-connections', label: 'Bank connections',      icon: Landmark }
  { to: '/transactions',     label: 'Transactions / Reconciliation', icon: ArrowLeftRight }
  { to: '/exceptions',       label: 'Exception Queue',      icon: AlertTriangle, badgeCount: <PENDING_REVIEW count> }
  { to: '/reminders',        label: 'Reminders',              icon: BellRing }
  { to: '/copilot',          label: 'Copilot',              icon: Bot }
  { to: '/reports',          label: 'Reports',                 icon: BarChart3 }
  { to: '/settings',         label: 'Settings',                icon: Settings }   // includes subscription/billing, user, RBAC
```

`badgeCount` for Exception Queue: `COUNT(BankTransaction WHERE organizationId=? AND status='PENDING_REVIEW')`, reusing the `useReviewCount` pattern (React Query hook, periodic polling, or invalidation when a new transaction arrives).

Route gating by subscription plan (`minPlan`) uses the `hasPlanAccess` pattern — for example, `/copilot` can be gated to Starter or higher (see [2026-08-03-billing-usage-metering-design.md](2026-08-03-billing-usage-metering-design.md)), showing a lock icon instead of hiding the nav item entirely.

## 3. Component pattern

- **NavLink active state**: `bg-primary/10 font-medium text-primary ring-1 ring-primary/15`; hover: `hover:bg-primary/5 hover:text-primary`.
- **Sidebar collapsible**: desktop has a collapse button (`SidebarCollapseFade`); mobile uses a separate drawer/sheet (`MobileSidebarWrapper`).
- **Pending-work badge**: red circle (`bg-red-500`), showing `99+` when above 99.
- **Sidebar footer**: user avatar + name + email, with a separate logout button.
- **Toast**: use `sonner` for all success/error notifications (login, logout, confirmation actions); do not build a separate toast component.

## 4. Out of scope

- Details for individual pages (Receivable Detail, Matching Workspace, CASSO Admin) — described in section 18 of the source document; brainstorm separately when detailed wireframes/mockups are needed.
- An internal component library beyond default shadcn/ui (add only when shadcn is insufficient, following the ponytail principle — do not install a library when a few lines of code are enough).

## 5. Open questions (do not block implementation)

- Should we publish shared components in a reusable type/UI package, or should Casso Ledger manually copy `src/components/ui` from the shadcn CLI?
- Do breakpoints/spacing scales need to match the other ecosystem products exactly, or is matching colors/fonts enough for the "same ecosystem" goal?
