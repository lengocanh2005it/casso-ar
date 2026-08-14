# Casso Admin Platform — Frontend Design

## Summary

Frontend design for the 4 admin pages scoped in `2026-08-14-casso-admin-platform-design.md` (BE spec). Supersedes that spec's "Frontend" section and PR #177's plan Tasks 11-14 — this is the concrete visual/UX design for those same pages, produced via the `frontend-design` skill.

## Design Brief

**Subject:** an internal control console for Casso's own staff — locking organizations and watching cross-org AI usage. **Audience:** 1-2 Casso operators, high trust, infrequent but high-stakes use (locking a paying customer's account). **Job of the page:** fast orientation ("what's the state of the platform right now") + confident, unambiguous action ("did I actually just lock that org").

This is not a new product — it's a section of Casso Ledger. The design reuses the app's existing token system (same palette, same body font) and spends its one deliberate risk on a single signature element, rather than inventing a parallel brand identity.

## Token System

**Color:** no new hex values. Reuse `apps/frontend/src/index.css`'s existing tokens as-is — `--primary` (green) for normal/active state, `--destructive` (red) for `LOCKED`/danger, `--muted`/`--border` for the status rail chrome. Locking an org is already a "destructive" action in the app's existing vocabulary; reusing `--destructive` keeps that meaning consistent instead of introducing a new "warning amber" the rest of the app doesn't have.

**Type:** body face stays `Be Vietnam Pro` (already the app-wide `--font-sans`). Add one utility face for data: `JetBrains Mono`, used only for organization IDs, request counts, and token counts — the numbers an operator reads precisely, not prose. This is the one typographic departure from the customer app, and it is scoped narrowly (numerals/IDs only, never headings or body copy).

**Layout:** a persistent **status rail** at the top of every `/admin/*` page (part of the admin layout shell, not per-page) — always-visible platform state, control-room style: `● N organizations   ⚠ M locked   Casso Admin`. `/admin/login` does not have the rail (no session yet).

```
┌─────────────────────────────────────────────┐
│ ● 12 organizations   ⚠ 2 locked   Casso Admin│  ← status rail (mono numerals)
├─────────────────────────────────────────────┤
│  [page content: dashboard / organizations /  │
│   ai-usage]                                  │
└─────────────────────────────────────────────┘
```

**Signature:** the Lock/Unlock control on the Organizations page is a **breaker switch**, not a text button — a toggle styled like a physical circuit breaker (`role="switch"`, flip animation, red glow when tripped/`LOCKED`). It is the one memorable element of the surface: locking an organization is the single most consequential action an Operator can take, and giving it physical weight (a switch you flip, not a button you click) matches that stakes — instead of a generic `outline` button indistinguishable from every other secondary action in the app.

## Components

### `AdminLayout` (new)

`apps/frontend/src/components/layout/admin-layout.tsx` — wraps `admin/dashboard`, `admin/organizations`, `admin/ai-usage` (not `admin/login`) via `<Outlet />`, same pattern as `AppLayout`. Renders `AdminStatusRail` + page content. No sidebar (only 3 destinations — a top nav strip inside the rail is enough, not a full sidebar).

```typescript
// apps/frontend/src/components/layout/admin-layout.tsx
import { NavLink, Outlet } from 'react-router-dom';
import { AdminStatusRail } from '@/features/admin/components/admin-status-rail';

export function AdminLayout() {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      <AdminStatusRail />
      <nav className="flex gap-4 border-b border-border px-4 py-2 text-sm">
        <NavLink to="/admin/dashboard" className={({ isActive }) => isActive ? 'font-medium text-primary' : 'text-muted-foreground'}>
          Dashboard
        </NavLink>
        <NavLink to="/admin/organizations" className={({ isActive }) => isActive ? 'font-medium text-primary' : 'text-muted-foreground'}>
          Organizations
        </NavLink>
        <NavLink to="/admin/ai-usage" className={({ isActive }) => isActive ? 'font-medium text-primary' : 'text-muted-foreground'}>
          AI Usage
        </NavLink>
      </nav>
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
```

### `AdminStatusRail` (new)

`apps/frontend/src/features/admin/components/admin-status-rail.tsx` — fetches org count/locked count once (via `listOrganizations(1, 100)`, same call the dashboard already makes — no new endpoint) and renders the rail. `font-mono` on the numerals only.

```typescript
// apps/frontend/src/features/admin/components/admin-status-rail.tsx
import { useEffect, useState } from 'react';
import { listOrganizations } from '../api/admin-api';

export function AdminStatusRail() {
  const [total, setTotal] = useState<number | null>(null);
  const [locked, setLocked] = useState<number | null>(null);

  useEffect(() => {
    void listOrganizations(1, 100).then((result) => {
      setTotal(result.total);
      setLocked(result.items.filter((org) => org.status === 'LOCKED').length);
    });
  }, []);

  return (
    <div className="flex items-center gap-4 border-b border-border bg-muted/40 px-4 py-2 text-sm">
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-primary" aria-hidden />
        <span className="font-mono tabular-nums">{total ?? '–'}</span> organizations
      </span>
      {locked !== null && locked > 0 && (
        <span className="flex items-center gap-1.5 text-destructive">
          <span aria-hidden>⚠</span>
          <span className="font-mono tabular-nums">{locked}</span> locked
        </span>
      )}
      <span className="ml-auto font-medium text-muted-foreground">Casso Admin</span>
    </div>
  );
}
```

### `BreakerSwitch` (new, signature element)

`apps/frontend/src/features/admin/components/breaker-switch.tsx` — a custom `role="switch"` button (no new Radix dependency; a styled native button is sufficient for one control). Flip animation via CSS transform on the internal thumb; red glow (`shadow-[0_0_12px]` with `--destructive`) applied only when `checked` (i.e. `LOCKED`).

```typescript
// apps/frontend/src/features/admin/components/breaker-switch.tsx
import { cn } from '@/lib/utils';

interface BreakerSwitchProps {
  checked: boolean; // true = LOCKED (tripped)
  onCheckedChange: () => void;
  label: string; // accessible name, e.g. "Lock Acme"
}

export function BreakerSwitch({ checked, onCheckedChange, label }: BreakerSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onCheckedChange}
      className={cn(
        'relative h-8 w-14 rounded-full border-2 transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        checked
          ? 'border-destructive bg-destructive/20 shadow-[0_0_10px] shadow-destructive/60'
          : 'border-border bg-muted',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 size-6 rounded-full bg-background shadow transition-transform duration-200',
          checked ? 'translate-x-6 bg-destructive' : 'translate-x-0.5 bg-primary',
        )}
      />
    </button>
  );
}
```

### Pages (structure carried over from the BE spec's Frontend section, restyled)

- **`AdminLoginPage`** — unchanged from the BE spec (no rail, standalone form).
- **`AdminDashboardPage`** — cards (org count / locked count, reusing the rail's numbers — or the rail alone may make the cards redundant; keep only the 2 charts as cards, drop the count cards since the rail already shows them) + bar chart (top orgs) + line chart (daily trend), both via `recharts`, using `var(--chart-1)`/`var(--chart-2)` (existing tokens, not new ones).
- **`AdminOrganizationsPage`** — table with a `BreakerSwitch` per row instead of a text button.
- **`AdminAiUsagePage`** — required date-range inputs + breakdown table; `requestCount`/`totalTokens`/`errorCount` cells get `font-mono tabular-nums`.

## Accessibility & Motion

- `BreakerSwitch` uses `role="switch"`/`aria-checked`/`aria-label` — screen-reader equivalent to a native toggle.
- Flip animation is a 200ms transform (matches the app's existing `--animate-fade-up` timing) — respects `prefers-reduced-motion` via Tailwind's `motion-reduce:transition-none` utility, added to both `BreakerSwitch` classNames.
- Keyboard focus: `focus-visible:ring-[3px] focus-visible:ring-ring/50` matches the existing `Sidebar` toggle button's focus style.

## Out of Scope

- A full internal design-token file/new Tailwind theme — this reuses `index.css` as-is.
- Any new dependency (no new Radix primitive, no icon-set change — `lucide-react` already in use for the ⚠ if preferred over the emoji character; emoji chosen here for simplicity, swap to `<AlertTriangle />` from `lucide-react` if the emoji renders inconsistently across platforms during implementation).
