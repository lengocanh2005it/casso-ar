import { Building2, Clock, Lock, ShieldCheck } from 'lucide-react';
import { MetricCard } from '@/components/metric-card';
import { useAdminOrganizationStatus } from '../api/use-admin';

const numberFormatter = new Intl.NumberFormat('vi-VN');

export function AdminOrganizationSummaryCards() {
  const organizationQuery = useAdminOrganizationStatus();
  const total = organizationQuery.data?.total ?? null;
  // Server-aggregated, not counted from `items`: the response carries one page
  // (max 100 rows), so filtering it under-reported every figure once an
  // installation outgrew that page while `total` kept counting everything.
  const statusCounts = organizationQuery.data?.statusCounts ?? null;
  const locked = statusCounts?.LOCKED ?? null;
  const pending = statusCounts?.PENDING_REVIEW ?? null;
  const active = statusCounts?.ACTIVE ?? null;

  if (organizationQuery.isError) {
    return (
      <p role="status" aria-live="polite" className="text-sm text-destructive">
        Không thể tải trạng thái tổ chức. Vui lòng tải lại trang.
      </p>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="admin-summary-grid"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <MetricCard
        label="Tổng số tổ chức"
        description="Tất cả tổ chức đã đăng ký"
        value={total === null ? '–' : numberFormatter.format(total)}
        icon={Building2}
        variant="default"
      />
      <MetricCard
        label="Tổ chức đang bị khóa"
        description="Không thể truy cập hệ thống"
        value={locked === null ? '–' : numberFormatter.format(locked)}
        icon={Lock}
        variant={locked && locked > 0 ? 'danger' : 'default'}
      />
      <MetricCard
        label="Tổ chức đang hoạt động"
        description="Đã duyệt và đang truy cập được"
        value={active === null ? '–' : numberFormatter.format(active)}
        icon={ShieldCheck}
        variant="success"
      />
      <MetricCard
        label="Tổ chức chờ duyệt"
        description="Chờ phê duyệt"
        value={pending === null ? '–' : numberFormatter.format(pending)}
        icon={Clock}
        variant={pending && pending > 0 ? 'warning' : 'default'}
      />
    </div>
  );
}
