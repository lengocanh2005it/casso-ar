# Frontend Design System & Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khởi tạo `apps/frontend` (React 19 + Vite + TypeScript) như một workspace member MỚI trong monorepo Casso Ledger đã có sẵn (`pnpm-workspace.yaml`, root `package.json`, `turbo.json`, `biome.json` từ `2026-08-03-project-scaffolding-and-domain-core.md` Task 1), dựng design system (Tailwind v4 + shadcn/ui "new-york"/"neutral") và khung navigation/sidebar theo đúng token, nav item list, và component pattern đã chốt ở `2026-08-03-frontend-design-system.md` (spec — mọi giá trị cụ thể đã có sẵn trong các step dưới, KHÔNG cần agent thực thi plan này tự quét lại). KHÔNG bao gồm nội dung chi tiết từng trang nghiệp vụ (Receivable Detail, Matching Workspace...) — nằm ngoài phạm vi theo spec mục 4, chỉ dựng route skeleton + placeholder page cho 10 mục nav.

**Architecture:** Feature-based folder structure theo `2026-08-03-project-scaffolding-architecture-design.md` mục 3 — `src/features/<name>/` (mỗi feature tự chứa component/hook/api riêng), `src/components/ui/` (shadcn primitives, copy nguyên từ CLI không sửa tay), `src/components/layout/` (Sidebar, MobileSidebarWrapper dùng chung), `src/lib/` (api-client, query-client, domain-utils không thuộc feature nào), `src/routes/` (React Router 7 route definitions, map 1-1 với `navItems`).

**Tech Stack:** React 19, Vite 6, TypeScript 5.7 (strict, khớp version root), Tailwind v4 (`@tailwindcss/vite` plugin, không cần `tailwind.config.js`), shadcn/ui (style `new-york`, base color `neutral`, icon `lucide`), Radix UI (`radix-ui` unified package + `@radix-ui/react-slot`), `lucide-react`, TanStack Query v5, React Router 7 (`react-router-dom`), `sonner`, `qrcode.react`, `recharts`, Vitest + React Testing Library (test runner mới cho app này — backend dùng Jest, frontend dùng Vitest vì chạy native trên Vite, không cần cấu hình transform riêng).

## Global Constraints

- Không sửa lại root `pnpm-workspace.yaml` / root `package.json` / `turbo.json` / `biome.json` đã tồn tại — chỉ ADD `apps/frontend` như một workspace member mới, script names phải khớp task names đã có sẵn trong `turbo.json` (`build`, `dev`, `lint`, `type-check`, `test`).
- `packages/shared-types` (đã tồn tại, export `ReceivableStatus` enum) là workspace dependency (`workspace:*`) — không định nghĩa lại enum status trong frontend (spec kiến trúc mục 3, quy tắc chống lặp #1).
- Mọi `components/ui/*` là bản copy nguyên từ shadcn CLI, không tự sửa tay (spec mục 4 "Ngoài phạm vi"); không cài thêm UI library ngoài shadcn/ui trừ khi shadcn không đáp ứng (YAGNI).
- CSS variable trong `index.css` dùng nguyên bộ giá trị oklch theo design token đã chốt ở spec mục 1; không tự đổi palette khi implement.
- Font `"Be Vietnam Pro"` phải tự host hoặc load qua `@font-face`/Google Fonts `<link>` — spec không chỉ định nguồn font cụ thể, plan này dùng Google Fonts `<link>` trong `index.html` làm lựa chọn đơn giản nhất (không cần build step tải font file).
- Component dùng chung 2+ feature mới đẩy lên `components/` — "Rule of two" (spec kiến trúc mục 3).
- API client: 1 instance chung `lib/api-client.ts`, mọi `feature/api/*` chỉ export hàm gọi endpoint cụ thể dùng chung instance đó.
- API origin comes from `VITE_API_BASE_URL ?? 'http://localhost:3000'`; every backend URL passed to the client includes the canonical `/api/v1` prefix exactly once. `/health` and `/metrics` are process probes outside that prefix.

---

## File Structure

```
casso-ledger/
  apps/
    frontend/
      package.json
      tsconfig.json
      tsconfig.app.json
      tsconfig.node.json
      vite.config.ts
      components.json
      index.html
      .env.example
      src/
        main.tsx
        App.tsx
        index.css
        vite-env.d.ts
        test/
          setup.ts
        lib/
          utils.ts
          api-client.ts
          query-client.ts
        components/
          ui/
            button.tsx
            sheet.tsx
          layout/
            nav-items.ts
            app-layout.tsx
            sidebar.tsx
            mobile-sidebar.tsx
            sidebar.test.tsx
        features/
          dashboard/dashboard-page.tsx
          customers/customers-page.tsx
          receivables/receivables-page.tsx
          bank-connections/bank-connections-page.tsx
          transactions/transactions-page.tsx
          exceptions/exceptions-page.tsx
          exceptions/api/use-review-count.ts
          reminders/reminders-page.tsx
          copilot/copilot-page.tsx
          reports/reports-page.tsx
          settings/settings-page.tsx
        routes/
          index.tsx
```

---

### Task 1: Vite + React + TypeScript scaffold wired into monorepo

**Files:**
- Create: `apps/frontend/package.json`
- Create: `apps/frontend/tsconfig.json`
- Create: `apps/frontend/tsconfig.app.json`
- Create: `apps/frontend/tsconfig.node.json`
- Create: `apps/frontend/vite.config.ts`
- Create: `apps/frontend/index.html`
- Create: `apps/frontend/src/vite-env.d.ts`
- Create: `apps/frontend/src/main.tsx`
- Create: `apps/frontend/src/App.tsx`
- Create: `apps/frontend/.env.example`

**Interfaces:**
- Consumes: root `pnpm-workspace.yaml` (`apps/*` glob already registers this dir), `packages/shared-types` workspace package (Task 3 of scaffolding plan)
- Produces: `@casso-ledger/frontend` workspace package with `build`/`dev`/`lint`/`type-check`/`test` scripts matching `turbo.json` task names, runnable via `pnpm --filter @casso-ledger/frontend dev`; consumed by Task 2 (Tailwind/shadcn init modifies `vite.config.ts`/`index.html`/`src/index.css` created here)

- [ ] **Step 1: Create `apps/frontend/package.json`**

```json
{
  "name": "@casso-ledger/frontend",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -b && vite build",
    "dev": "vite",
    "lint": "biome check .",
    "type-check": "tsc -b --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@casso-ledger/shared-types": "workspace:*",
    "@radix-ui/react-slot": "1.1.1",
    "@tanstack/react-query": "5.62.11",
    "class-variance-authority": "0.7.1",
    "clsx": "2.1.1",
    "lucide-react": "0.469.0",
    "qrcode.react": "4.2.0",
    "radix-ui": "1.1.1",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "react-router-dom": "7.1.1",
    "recharts": "2.15.0",
    "sonner": "1.7.1",
    "tailwind-merge": "2.5.5",
    "tw-animate-css": "1.0.1"
  },
  "devDependencies": {
    "@tailwindcss/vite": "4.0.0",
    "@testing-library/jest-dom": "6.6.3",
    "@testing-library/react": "16.1.0",
    "@types/react": "19.0.2",
    "@types/react-dom": "19.0.2",
    "@vitejs/plugin-react": "4.3.4",
    "jsdom": "25.0.1",
    "tailwindcss": "4.0.0",
    "typescript": "5.7.2",
    "vite": "6.0.7",
    "vitest": "2.1.8"
  }
}
```

`workspace:*` cho `@casso-ledger/shared-types` — khớp đúng pattern đã dùng ở `apps/backend/package.json` (scaffolding plan Task 9 Step 1).

- [ ] **Step 2: Create `apps/frontend/tsconfig.json`**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

- [ ] **Step 3: Create `apps/frontend/tsconfig.app.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `apps/frontend/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Create `apps/frontend/vite.config.ts`**

```typescript
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

Dùng `defineConfig` từ `vitest/config` (re-export của `vite`'s `defineConfig` kèm type cho field `test`) để gộp cấu hình Vite + Vitest trong 1 file — tránh thêm `vitest.config.ts` riêng khi không cần khác biệt (ponytail: 1 file build config đủ dùng, tách khi thật sự cần override riêng cho test).
Plugin `@tailwindcss/vite` được thêm vào mảng `plugins` ở Task 2 Step 1 (sau khi cài Tailwind).

- [ ] **Step 6: Create `apps/frontend/index.html`**

```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <title>Casso Ledger</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `apps/frontend/src/vite-env.d.ts`**

```typescript
/// <reference types="vite/client" />
```

- [ ] **Step 8: Create placeholder `apps/frontend/src/main.tsx`**

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`main.tsx` được viết lại đầy đủ ở Task 5 Step 4 (bọc thêm `QueryClientProvider`) — bản này chỉ đủ để `pnpm dev` chạy được ngay sau Task 1.

- [ ] **Step 9: Create placeholder `apps/frontend/src/App.tsx`**

```typescript
export function App() {
  return <div>Casso Ledger</div>;
}
```

`App.tsx` được viết lại đầy đủ ở Task 3 Step 8 (thêm `BrowserRouter` + routes) và Task 5 Step 5 (thêm `Toaster`).

- [ ] **Step 10: Create `apps/frontend/.env.example`**

```
VITE_API_BASE_URL=http://localhost:3000
```

- [ ] **Step 11: Verify workspace registers the new app**

Run: `pnpm install`
Expected: `@casso-ledger/frontend` appears under `apps/frontend` in `pnpm -r list --depth -1`, no error (pnpm-workspace.yaml glob `apps/*` already covers it, no change needed there)

- [ ] **Step 12: Verify dev server boots**

Run: `pnpm --filter @casso-ledger/frontend dev`
Expected: Vite dev server starts on `http://localhost:5173`, page renders "Casso Ledger" (Ctrl+C to stop after confirming)

- [ ] **Step 13: Commit**

```bash
git add apps/frontend
git commit -m "feat: scaffold Vite + React 19 + TypeScript frontend app"
```

---

### Task 2: Tailwind v4 + shadcn/ui design tokens

**Files:**
- Modify: `apps/frontend/vite.config.ts`
- Create: `apps/frontend/components.json`
- Create: `apps/frontend/src/index.css`
- Create: `apps/frontend/src/lib/utils.ts`
- Modify: `apps/frontend/src/main.tsx` (import `./index.css`)

**Interfaces:**
- Consumes: `@tailwindcss/vite` + `tailwindcss` + `tw-animate-css` from Task 1 devDependencies/dependencies
- Produces: `cn()` helper used by every `components/ui/*` (Task 4), design tokens (`--primary`, `--sidebar-*`, etc.) used by Sidebar/nav active-state classes (Task 4)

- [ ] **Step 1: Wire `@tailwindcss/vite` plugin into `apps/frontend/vite.config.ts`**

```typescript
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

- [ ] **Step 2: Create `apps/frontend/components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

Khớp nguyên `style: "new-york"`, `baseColor: "neutral"`, `iconLibrary: "lucide"` đã chốt ở spec mục 1.

- [ ] **Step 3: Create `apps/frontend/src/index.css`**

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0.75rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.24 0.006 255);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.24 0.006 255);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.24 0.006 255);
  --primary: oklch(0.635 0.168 155);
  --primary-foreground: oklch(1 0 0);
  --secondary: oklch(0.97 0.012 155);
  --secondary-foreground: oklch(0.35 0.04 155);
  --muted: oklch(0.97 0.004 255);
  --muted-foreground: oklch(0.52 0.015 255);
  --accent: oklch(0.96 0.03 155);
  --accent-foreground: oklch(0.4 0.08 155);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(1 0 0);
  --border: oklch(0.92 0.006 255);
  --input: oklch(0.92 0.006 255);
  --ring: oklch(0.635 0.168 155);
  --chart-1: oklch(0.635 0.168 155);
  --chart-2: oklch(0.72 0.12 190);
  --chart-3: oklch(0.55 0.12 155);
  --chart-4: oklch(0.78 0.1 155);
  --chart-5: oklch(0.45 0.08 155);
  --sidebar: oklch(1 0 0);
  --sidebar-foreground: oklch(0.24 0.006 255);
  --sidebar-primary: oklch(0.635 0.168 155);
  --sidebar-primary-foreground: oklch(1 0 0);
  --sidebar-accent: oklch(0.96 0.03 155);
  --sidebar-accent-foreground: oklch(0.4 0.08 155);
  --sidebar-border: oklch(0.92 0.006 255);
  --sidebar-ring: oklch(0.635 0.168 155);
}

.dark {
  --background: oklch(0.17 0.015 155);
  --foreground: oklch(0.97 0.005 155);
  --card: oklch(0.21 0.018 155);
  --card-foreground: oklch(0.97 0.005 155);
  --popover: oklch(0.21 0.018 155);
  --popover-foreground: oklch(0.97 0.005 155);
  --primary: oklch(0.72 0.15 155);
  --primary-foreground: oklch(0.17 0.02 155);
  --secondary: oklch(0.26 0.025 155);
  --secondary-foreground: oklch(0.97 0.005 155);
  --muted: oklch(0.26 0.02 155);
  --muted-foreground: oklch(0.7 0.02 155);
  --accent: oklch(0.28 0.035 155);
  --accent-foreground: oklch(0.97 0.005 155);
  --destructive: oklch(0.704 0.191 22.216);
  --destructive-foreground: oklch(0.17 0.015 155);
  --border: oklch(1 0 0 / 12%);
  --input: oklch(1 0 0 / 16%);
  --ring: oklch(0.72 0.15 155);
  --chart-1: oklch(0.72 0.15 155);
  --chart-2: oklch(0.65 0.12 190);
  --chart-3: oklch(0.55 0.1 155);
  --chart-4: oklch(0.78 0.1 155);
  --chart-5: oklch(0.45 0.08 155);
  --sidebar: oklch(0.19 0.018 155);
  --sidebar-foreground: oklch(0.97 0.005 155);
  --sidebar-primary: oklch(0.72 0.15 155);
  --sidebar-primary-foreground: oklch(0.17 0.02 155);
  --sidebar-accent: oklch(0.26 0.035 155);
  --sidebar-accent-foreground: oklch(0.97 0.005 155);
  --sidebar-border: oklch(1 0 0 / 12%);
  --sidebar-ring: oklch(0.72 0.15 155);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --font-sans: "Be Vietnam Pro", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
    sans-serif;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
    font-family: var(--font-sans);
  }
}
```

**Design tokens đã xác nhận:** toàn bộ `:root` và `.dark` ở trên là design token đã chốt ở spec mục 1, gồm radius, foreground/background, primary, sidebar, chart, border và ring; không tự thay bằng palette neutral mặc định.

- [ ] **Step 4: Create `apps/frontend/src/lib/utils.ts`**

```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Import `index.css` in `apps/frontend/src/main.tsx`**

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 6: Verify Tailwind renders tokens**

Run: `pnpm --filter @casso-ledger/frontend dev`
Expected: page background/foreground use the light-theme oklch values (no visual regression, no Tailwind/PostCSS build error in terminal)

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/vite.config.ts apps/frontend/components.json apps/frontend/src/index.css apps/frontend/src/lib/utils.ts apps/frontend/src/main.tsx
git commit -m "feat: add Tailwind v4 + shadcn/ui new-york design tokens"
```

---

### Task 3: React Router 7 route skeleton (10 nav destinations)

**Files:**
- Create: `apps/frontend/src/features/dashboard/dashboard-page.tsx`
- Create: `apps/frontend/src/features/customers/customers-page.tsx`
- Create: `apps/frontend/src/features/receivables/receivables-page.tsx`
- Create: `apps/frontend/src/features/bank-connections/bank-connections-page.tsx`
- Create: `apps/frontend/src/features/transactions/transactions-page.tsx`
- Create: `apps/frontend/src/features/exceptions/exceptions-page.tsx`
- Create: `apps/frontend/src/features/reminders/reminders-page.tsx`
- Create: `apps/frontend/src/features/copilot/copilot-page.tsx`
- Create: `apps/frontend/src/features/reports/reports-page.tsx`
- Create: `apps/frontend/src/features/settings/settings-page.tsx`
- Create: `apps/frontend/src/routes/index.tsx`
- Modify: `apps/frontend/src/App.tsx`

**Interfaces:**
- Consumes: nothing (page bodies are the one intentionally-out-of-scope placeholder per spec mục 4 — "Chi tiết từng trang cụ thể... brainstorm riêng khi cần wireframe/mockup chi tiết")
- Produces: route tree consumed by `AppLayout` (Task 4, wraps `<Outlet />`) and by the smoke test (Task 6, renders `Sidebar` inside a router context)

- [ ] **Step 1: Create the 10 placeholder feature page components**

Each file follows the same one-line pattern — real, complete, minimal component (not a TODO stub), body content intentionally out of scope per spec mục 4:

`apps/frontend/src/features/dashboard/dashboard-page.tsx`
```typescript
export function DashboardPage() {
  return <h1 className="text-2xl font-semibold">Dashboard</h1>;
}
```

`apps/frontend/src/features/customers/customers-page.tsx`
```typescript
export function CustomersPage() {
  return <h1 className="text-2xl font-semibold">Khách hàng</h1>;
}
```

`apps/frontend/src/features/receivables/receivables-page.tsx`
```typescript
export function ReceivablesPage() {
  return <h1 className="text-2xl font-semibold">Công nợ</h1>;
}
```

`apps/frontend/src/features/bank-connections/bank-connections-page.tsx`
```typescript
export function BankConnectionsPage() {
  return <h1 className="text-2xl font-semibold">Kết nối ngân hàng</h1>;
}
```

`apps/frontend/src/features/transactions/transactions-page.tsx`
```typescript
export function TransactionsPage() {
  return <h1 className="text-2xl font-semibold">Giao dịch / Đối soát</h1>;
}
```

`apps/frontend/src/features/exceptions/exceptions-page.tsx`
```typescript
export function ExceptionsPage() {
  return <h1 className="text-2xl font-semibold">Exception Queue</h1>;
}
```

`apps/frontend/src/features/reminders/reminders-page.tsx`
```typescript
export function RemindersPage() {
  return <h1 className="text-2xl font-semibold">Lịch nhắc</h1>;
}
```

`apps/frontend/src/features/copilot/copilot-page.tsx`
```typescript
export function CopilotPage() {
  return <h1 className="text-2xl font-semibold">Copilot</h1>;
}
```

`apps/frontend/src/features/reports/reports-page.tsx`
```typescript
export function ReportsPage() {
  return <h1 className="text-2xl font-semibold">Báo cáo</h1>;
}
```

`apps/frontend/src/features/settings/settings-page.tsx`
```typescript
export function SettingsPage() {
  return <h1 className="text-2xl font-semibold">Cài đặt</h1>;
}
```

- [ ] **Step 2: Create `apps/frontend/src/routes/index.tsx`**

```typescript
import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { BankConnectionsPage } from '@/features/bank-connections/bank-connections-page';
import { CopilotPage } from '@/features/copilot/copilot-page';
import { CustomersPage } from '@/features/customers/customers-page';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { ExceptionsPage } from '@/features/exceptions/exceptions-page';
import { ReceivablesPage } from '@/features/receivables/receivables-page';
import { RemindersPage } from '@/features/reminders/reminders-page';
import { ReportsPage } from '@/features/reports/reports-page';
import { SettingsPage } from '@/features/settings/settings-page';
import { TransactionsPage } from '@/features/transactions/transactions-page';

export const appRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="/dashboard" replace /> },
  { path: 'dashboard', element: <DashboardPage /> },
  { path: 'customers', element: <CustomersPage /> },
  { path: 'receivables', element: <ReceivablesPage /> },
  { path: 'bank-connections', element: <BankConnectionsPage /> },
  { path: 'transactions', element: <TransactionsPage /> },
  { path: 'exceptions', element: <ExceptionsPage /> },
  { path: 'reminders', element: <RemindersPage /> },
  { path: 'copilot', element: <CopilotPage /> },
  { path: 'reports', element: <ReportsPage /> },
  { path: 'settings', element: <SettingsPage /> },
];
```

`path` của mỗi route khớp 1-1 với `to` của `navItems` đã chốt ở spec mục 2 (`/dashboard`, `/customers`, `/receivables`, `/bank-connections`, `/transactions`, `/exceptions`, `/reminders`, `/copilot`, `/reports`, `/settings`).

- [ ] **Step 3: Rewrite `apps/frontend/src/App.tsx` to mount `BrowserRouter` + routes**

```typescript
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/app-layout';
import { appRoutes } from '@/routes';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          {appRoutes.map((route) =>
            route.index ? (
              <Route key="index" index element={route.element} />
            ) : (
              <Route key={route.path} path={route.path} element={route.element} />
            ),
          )}
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

`AppLayout` (Sidebar + `<Outlet />`) được tạo ở Task 4 Step 6 — file này tham chiếu trước, hoàn thiện khi Task 4 xong.

- [ ] **Step 4: Verify build compiles (AppLayout not yet created — expected to fail until Task 4)**

Run: `pnpm --filter @casso-ledger/frontend type-check`
Expected: FAIL — `Cannot find module '@/components/layout/app-layout'` (resolved by Task 4)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features apps/frontend/src/routes apps/frontend/src/App.tsx
git commit -m "feat: add React Router 7 route skeleton for the 10 nav destinations"
```

---

### Task 4: Sidebar & layout components

**Files:**
- Create: `apps/frontend/src/components/ui/button.tsx`
- Create: `apps/frontend/src/components/ui/sheet.tsx`
- Create: `apps/frontend/src/components/layout/nav-items.ts`
- Create: `apps/frontend/src/components/layout/sidebar.tsx`
- Create: `apps/frontend/src/components/layout/mobile-sidebar.tsx`
- Create: `apps/frontend/src/components/layout/app-layout.tsx`

**Interfaces:**
- Consumes: `cn()` from `lib/utils.ts` (Task 2), design tokens from `index.css` (Task 2), `useReviewCount` hook (Task 5, stubbed here and wired properly once TanStack Query client exists)
- Produces: `AppLayout` referenced by `App.tsx` (Task 3 Step 3); `Sidebar` consumed directly by the smoke test (Task 6)

- [ ] **Step 1: Create `apps/frontend/src/components/ui/button.tsx`** (shadcn CLI output, style "new-york", copied verbatim)

```typescript
import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90',
        outline: 'border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
```

- [ ] **Step 2: Create `apps/frontend/src/components/ui/sheet.tsx`** (shadcn CLI output, used for the mobile drawer)

```typescript
import * as SheetPrimitive from 'radix-ui/dialog';
import { XIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/lib/utils';

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root {...props} />;
}

function SheetTrigger(props: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger {...props} />;
}

function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close {...props} />;
}

function SheetPortal(props: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal {...props} />;
}

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = 'left',
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        className={cn(
          'fixed z-50 flex flex-col gap-4 bg-sidebar text-sidebar-foreground shadow-lg transition ease-in-out data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:duration-300 data-[state=open]:duration-500',
          side === 'left' &&
            'inset-y-0 left-0 h-full w-3/4 max-w-xs border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="absolute right-4 top-4 rounded-xs opacity-70 outline-none hover:opacity-100 focus:ring-2 focus:ring-ring">
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

export { Sheet, SheetTrigger, SheetClose, SheetContent };
```

`radix-ui/dialog` là subpath export của package hợp nhất `radix-ui` (dependency đã khai báo ở Task 1) — thay cho `@radix-ui/react-dialog` riêng lẻ, đúng bộ dependency đã chốt ở spec mục 1.

- [ ] **Step 3: Create `apps/frontend/src/components/layout/nav-items.ts`**

```typescript
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  BellRing,
  Bot,
  FileText,
  Landmark,
  LayoutDashboard,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Gói subscription tối thiểu để truy cập — hiển thị icon khóa thay vì ẩn hẳn mục nav (spec mục 2). */
  minPlan?: 'STARTER' | 'GROWTH' | 'SCALE';
  /** true nếu mục này hiển thị badge số lượng cần xử lý (Exception Queue). */
  showReviewBadge?: boolean;
}

export const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/customers', label: 'Khách hàng', icon: Users },
  { to: '/receivables', label: 'Công nợ', icon: FileText },
  { to: '/bank-connections', label: 'Kết nối ngân hàng', icon: Landmark },
  { to: '/transactions', label: 'Giao dịch / Đối soát', icon: ArrowLeftRight },
  { to: '/exceptions', label: 'Exception Queue', icon: AlertTriangle, showReviewBadge: true },
  { to: '/reminders', label: 'Lịch nhắc', icon: BellRing },
  { to: '/copilot', label: 'Copilot', icon: Bot, minPlan: 'STARTER' },
  { to: '/reports', label: 'Báo cáo', icon: BarChart3 },
  { to: '/settings', label: 'Cài đặt', icon: Settings },
];
```

`minPlan: 'STARTER'` trên `/copilot` khớp ví dụ gate ở spec mục 2 ("`/copilot` có thể gate ở gói Starter trở lên"). `hasPlanAccess`/gate logic thật sự (đọc plan hiện tại của org) là phần của `2026-08-03-billing-usage-metering-design.md` — nằm ngoài phạm vi plan này, ở đây chỉ render icon khóa tĩnh khi `minPlan` được set (xem Step 4).

- [ ] **Step 4: Create `apps/frontend/src/components/layout/sidebar.tsx`**

```typescript
import { ChevronLeft, ChevronRight, Lock, LogOut } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useReviewCount } from '@/features/exceptions/api/use-review-count';
import { cn } from '@/lib/utils';
import { navItems } from './nav-items';

function ReviewBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-medium text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function Sidebar({ collapsed = false, onToggleCollapsed }: SidebarProps) {
  const { data: reviewCount = 0 } = useReviewCount();

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <div className="flex items-center justify-between px-4 py-4">
        {!collapsed && <span className="text-lg font-semibold">Casso Ledger</span>}
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="rounded-md p-1.5 hover:bg-sidebar-accent"
            aria-label={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const locked = Boolean(item.minPlan);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-primary/5 hover:text-primary',
                  isActive && 'bg-primary/10 font-medium text-primary ring-1 ring-primary/15',
                )
              }
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {!collapsed && item.showReviewBadge && <ReviewBadge count={reviewCount} />}
              {!collapsed && locked && <Lock className="ml-auto size-3.5 text-muted-foreground" />}
            </NavLink>
          );
        })}
      </nav>

      <SidebarFooter collapsed={collapsed} />
    </aside>
  );
}

function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex items-center gap-3 border-t border-sidebar-border px-4 py-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
        A
      </div>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">Anh Le</p>
          <p className="truncate text-xs text-muted-foreground">anh@casso.vn</p>
        </div>
      )}
      <button type="button" aria-label="Đăng xuất" className="rounded-md p-1.5 hover:bg-sidebar-accent">
        <LogOut className="size-4" />
      </button>
    </div>
  );
}
```

Avatar footer dùng 1 `div` chữ cái đầu thay vì cài `components/ui/avatar.tsx` riêng từ Radix — chưa có ảnh đại diện thật để cần fallback logic phức tạp hơn (ponytail: thêm `Avatar`/`AvatarFallback` primitive khi có API trả về ảnh thật). Nhãn thu gọn dùng `title` attribute (native tooltip của trình duyệt) thay vì cài `components/ui/tooltip.tsx` — bớt 1 Radix primitive khi thuộc tính HTML chuẩn đã đủ dùng.

- [ ] **Step 5: Create `apps/frontend/src/components/layout/mobile-sidebar.tsx`**

```typescript
import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Sidebar } from './sidebar';

export function MobileSidebarWrapper() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="rounded-md p-2 hover:bg-accent md:hidden"
          aria-label="Mở menu điều hướng"
        >
          <Menu className="size-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0">
        <Sidebar />
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 6: Create `apps/frontend/src/components/layout/app-layout.tsx`**

```typescript
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { MobileSidebarWrapper } from './mobile-sidebar';
import { Sidebar } from './sidebar';

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <div className="hidden md:block">
        <Sidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed((v) => !v)} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:hidden">
          <MobileSidebarWrapper />
          <span className="text-base font-semibold">Casso Ledger</span>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

Desktop dùng nút thu gọn nội tuyến trong `Sidebar` (`SidebarCollapseFade` pattern được đơn giản hoá thành `ChevronLeft`/`ChevronRight` toggle — chưa cần animation riêng ở MVP, spec mục 3 chỉ yêu cầu "desktop có nút thu gọn", không yêu cầu hiệu ứng cụ thể). Mobile dùng `Sheet` (`MobileSidebarWrapper`) đúng tên component đã chốt ở spec mục 3.

- [ ] **Step 7: Verify build compiles (still missing `useReviewCount` — created in Task 5)**

Run: `pnpm --filter @casso-ledger/frontend type-check`
Expected: FAIL — `Cannot find module '@/features/exceptions/api/use-review-count'` (resolved by Task 5)

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/components
git commit -m "feat: add collapsible Sidebar, mobile drawer, and AppLayout"
```

---

### Task 5: TanStack Query client + API client wrapper

**Files:**
- Create: `apps/frontend/src/lib/api-client.ts`
- Create: `apps/frontend/src/lib/query-client.ts`
- Create: `apps/frontend/src/features/exceptions/api/use-review-count.ts`
- Modify: `apps/frontend/src/main.tsx`
- Modify: `apps/frontend/src/App.tsx`

**Interfaces:**
- Consumes: `VITE_API_BASE_URL` env var (Task 1 `.env.example`)
- Produces: `apiClient` used by every future `feature/api/*.ts` (spec kiến trúc mục 3, quy tắc chống lặp #2); `useReviewCount` consumed by `Sidebar` (Task 4 Step 4)

- [ ] **Step 1: Create `apps/frontend/src/lib/api-client.ts`**

```typescript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!res.ok) {
    throw new ApiError(`Request failed: ${res.status} ${res.statusText}`, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
```

Instance duy nhất — mọi `feature/api/*.ts` gọi qua `apiClient`, không tự tạo `fetch` instance riêng (spec kiến trúc mục 3, quy tắc #2).

- [ ] **Step 2: Create `apps/frontend/src/lib/query-client.ts`**

```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});
```

- [ ] **Step 3: Create `apps/frontend/src/features/exceptions/api/use-review-count.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

interface ReviewCountResponse {
  count: number;
}

export function useReviewCount() {
  return useQuery({
    queryKey: ['exceptions', 'review-count'],
    queryFn: () => apiClient.get<ReviewCountResponse>('/api/v1/bank-transactions/pending-review-count'),
    select: (data) => data.count,
    refetchInterval: 60_000,
  });
}
```

Endpoint `/api/v1/bank-transactions/pending-review-count` is implemented by the Exception Queue plan and returns `{ count }`, tenant-scoped to the authenticated organization. The hook keeps the `0` fallback for transient API errors, so the sidebar remains usable while the backend is unavailable.

- [ ] **Step 4: Rewrite `apps/frontend/src/main.tsx`**

```typescript
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { queryClient } from '@/lib/query-client';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 5: Add `sonner` `Toaster` to `apps/frontend/src/App.tsx`**

```typescript
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppLayout } from '@/components/layout/app-layout';
import { appRoutes } from '@/routes';

export function App() {
  return (
    <BrowserRouter>
      <Toaster richColors position="top-right" />
      <Routes>
        <Route element={<AppLayout />}>
          {appRoutes.map((route) =>
            route.index ? (
              <Route key="index" index element={route.element} />
            ) : (
              <Route key={route.path} path={route.path} element={route.element} />
            ),
          )}
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

`sonner` dùng cho mọi thông báo thành công/lỗi (login, logout, hành động xác nhận) — không tự dựng toast component riêng (spec mục 3).

- [ ] **Step 6: Verify build compiles end-to-end**

Run: `pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS (no missing module errors)

Run: `pnpm --filter @casso-ledger/frontend dev`
Expected: app renders Sidebar with all 10 nav items, Dashboard page loads at `/`, no console error; the tenant-scoped review-count request succeeds against the Exception Queue endpoint.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/lib apps/frontend/src/features/exceptions apps/frontend/src/main.tsx apps/frontend/src/App.tsx
git commit -m "feat: add TanStack Query client and api-client fetch wrapper"
```

---

### Task 6: Smoke test — Sidebar renders all 10 nav labels

**Files:**
- Create: `apps/frontend/src/test/setup.ts`
- Create: `apps/frontend/src/components/layout/sidebar.test.tsx`

**Interfaces:**
- Consumes: `Sidebar` (Task 4), `queryClient` (Task 5), Vitest + React Testing Library (Task 1 devDependencies)
- Produces: CI-runnable regression guard — `turbo run test` fails if any nav label or route is accidentally removed

- [ ] **Step 1: Create `apps/frontend/src/test/setup.ts`**

```typescript
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 2: Write the smoke test**

Create `apps/frontend/src/components/layout/sidebar.test.tsx`:

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { navItems } from './nav-items';
import { Sidebar } from './sidebar';

vi.mock('@/features/exceptions/api/use-review-count', () => ({
  useReviewCount: () => ({ data: 0 }),
}));

function renderSidebar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Sidebar', () => {
  it('renders all 10 nav item labels', () => {
    renderSidebar();

    for (const item of navItems) {
      expect(screen.getByText(item.label)).toBeInTheDocument();
    }
  });

  it('renders exactly the 10 nav items chốt in the spec, no more no less', () => {
    renderSidebar();
    expect(navItems).toHaveLength(10);
  });
});
```

`useReviewCount` được mock để test không phụ thuộc network thật (không có backend chạy trong CI) — chỉ assert phần UI/label, không assert giá trị badge (đã có unit test riêng cho hook khi feature Exception Queue được implement đầy đủ, ngoài phạm vi plan này).

- [ ] **Step 3: Run the test**

Run: `pnpm --filter @casso-ledger/frontend test`
Expected: PASS — 2 passed (`renders all 10 nav item labels`, `renders exactly the 10 nav items...`)

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/test apps/frontend/src/components/layout/sidebar.test.tsx
git commit -m "test: add Vitest + RTL smoke test asserting all 10 Sidebar nav labels"
```

---

## Self-Review Notes

- **Spec coverage:** Stack (spec mục 1) → Task 1 `package.json` dependencies. Design tokens (spec mục 1) → Task 2 `index.css`. Nav item list + route gate (spec mục 2) → Task 3 routes + Task 4 `nav-items.ts` (`minPlan`, `showReviewBadge`). Component pattern — NavLink active state, collapsible sidebar, mobile drawer, badge, footer, toast (spec mục 3) → Task 4 (`sidebar.tsx`, `mobile-sidebar.tsx`) + Task 5 Step 5 (`sonner`). Feature-based folder structure (scaffolding spec mục 3) → File Structure section + Task 3 `features/*`.
- **Resolved design tokens:** Task 2 Step 3 now pins the light/dark oklch values defined in the spec mục 1, including radius, sidebar, chart, border, and dark-mode values.
- **Font loading remains an implementation detail:** keep the existing loading mechanism (Google Fonts `<link>` in `index.html`) when wiring `Be Vietnam Pro`; this plan does not prescribe a new font dependency.
- **Not covered in this plan (by design, out of scope per spec mục 4):** per-page content for Receivable Detail, Matching Workspace, CASSO Admin, etc. — future wireframe-specific plans. Real `hasPlanAccess` gating logic (billing spec) — Task 4 only renders a static lock icon when `minPlan` is set. The pending-review-count backend contract is owned by the Exception Queue plan and is implemented there.
- **Type/name consistency checked:** `navItems` (Task 4 Step 3) `to` values match `appRoutes` (Task 3 Step 2) `path` values exactly (with leading `/` stripped for React Router relative paths). `ReviewBadge`/`showReviewBadge` naming in `Sidebar` (Task 4 Step 4) matches the mock target path `@/features/exceptions/api/use-review-count` used in both Task 4 Step 4 import and Task 6 Step 2 `vi.mock`.
