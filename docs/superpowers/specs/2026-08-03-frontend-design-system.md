# Frontend Design System & Navigation

> Spec con của [docs/overview.md](../../../docs/overview.md). Định nghĩa stack, design token và cấu trúc navigation cho FE theo palette và component pattern chung của hệ sinh thái Casso/payOS.

## 1. Stack & design tokens

Tái sử dụng nguyên bộ, không tự chọn stack khác — đồng bộ với hệ sinh thái CASSO và tiết kiệm thời gian dựng UI component từ đầu:

```
React 19 + Vite + TypeScript
Tailwind v4 + shadcn/ui (style "new-york", base color "neutral")
Radix UI (@radix-ui/react-slot, radix-ui) + lucide-react (icons)
TanStack Query (data fetching/cache)
React Router 7 (routing)
sonner (toast)
qrcode.react (hiển thị QR kết nối Cas ID — trực tiếp tái dùng cho luồng ở
  2026-08-03-cas-id-bank-connection-design.md mục 1)
recharts (aging chart, dashboard — dùng cho Aging Dashboard, tài liệu gốc mục 7.11/18)
```

Font: `"Be Vietnam Pro"`, fallback `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.

Primary color: `oklch(0.635 0.168 155)` ≈ `#16AB64` (xanh lá CASSO/payOS). Dùng bộ CSS variable shadcn/ui theo design token chốt dưới đây — bao gồm `--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--sidebar-*`, `--chart-1..5` — cho cả `:root` (light) và `.dark`. Giữ nguyên toàn bộ giá trị oklch, không tự chỉnh sửa, để đảm bảo tính nhất quán thị giác với các sản phẩm khác trong hệ sinh thái Casso.

## 2. Sidebar & navigation

```
navItems (theo thứ tự đã chốt):
  { to: '/dashboard',        label: 'Dashboard',            icon: LayoutDashboard }
  { to: '/customers',        label: 'Khách hàng',           icon: Users }
  { to: '/receivables',      label: 'Công nợ',              icon: FileText }
  { to: '/bank-connections', label: 'Kết nối ngân hàng',    icon: Landmark }
  { to: '/transactions',     label: 'Giao dịch / Đối soát', icon: ArrowLeftRight }
  { to: '/exceptions',       label: 'Exception Queue',      icon: AlertTriangle, badgeCount: <PENDING_REVIEW count> }
  { to: '/reminders',        label: 'Lịch nhắc',            icon: BellRing }
  { to: '/copilot',          label: 'Copilot',              icon: Bot }
  { to: '/reports',          label: 'Báo cáo',               icon: BarChart3 }
  { to: '/settings',         label: 'Cài đặt',              icon: Settings }   // gồm subscription/billing, user, RBAC
```

`badgeCount` của Exception Queue: `COUNT(BankTransaction WHERE organizationId=? AND status='PENDING_REVIEW')`, tái dùng đúng pattern `useReviewCount` (React Query hook, poll định kỳ hoặc invalidate khi có giao dịch mới).

Route gate theo gói subscription (`minPlan`) áp dụng pattern `hasPlanAccess` — ví dụ `/copilot` có thể gate ở gói Starter trở lên (xem [2026-08-03-billing-usage-metering-design.md](2026-08-03-billing-usage-metering-design.md)), hiển thị icon khóa thay vì ẩn hẳn mục nav.

## 3. Component pattern

- **NavLink active state**: `bg-primary/10 font-medium text-primary ring-1 ring-primary/15`; hover: `hover:bg-primary/5 hover:text-primary`.
- **Sidebar collapsible**: desktop có nút thu gọn (`SidebarCollapseFade`), mobile dùng drawer/sheet riêng (`MobileSidebarWrapper`).
- **Badge số lượng cần xử lý**: hình tròn đỏ (`bg-red-500`), hiển thị `99+` khi vượt 99.
- **Footer sidebar**: avatar + tên + email người dùng, nút đăng xuất riêng.
- **Toast**: dùng `sonner` cho mọi thông báo thành công/lỗi (login, logout, hành động xác nhận), không tự dựng toast component riêng.

## 4. Ngoài phạm vi

- Chi tiết từng trang cụ thể (Receivable Detail, Matching Workspace, CASSO Admin) — đã mô tả ở tài liệu gốc mục 18, brainstorm riêng khi cần wireframe/mockup chi tiết.
- Component library nội bộ ngoài shadcn/ui mặc định (chỉ thêm khi shadcn không đáp ứng, theo nguyên tắc ponytail — không cài thêm thư viện khi vài dòng code đã đủ).

## 5. Câu hỏi mở (không chặn implementation)

- Có nên publish shared component (type/UI package riêng) dùng chung được không, hay Casso Ledger cần copy thủ công `src/components/ui` từ shadcn CLI?
- Cần đồng bộ chính xác breakpoint/spacing scale với các sản phẩm cùng hệ sinh thái hay chỉ cần đồng bộ màu sắc/font là đủ cho mục tiêu "cùng hệ sinh thái"?
