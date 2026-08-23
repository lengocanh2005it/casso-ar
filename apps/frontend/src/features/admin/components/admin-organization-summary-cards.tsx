import { Building2, Lock } from 'lucide-react';
import { MetricCard } from '@/components/metric-card';
import { useAdminOrganizationStatus } from '../api/use-admin';

const numberFormatter = new Intl.NumberFormat('vi-VN');

export function AdminOrganizationSummaryCards() {
  const organizationQuery = useAdminOrganizationStatus();
  const total = organizationQuery.data?.total ?? null;
  const locked = organizationQuery.data
    ? organizationQuery.data.items.filter((org) => org.status === 'LOCKED')
        .length
    : null;

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
      className="grid gap-4 sm:grid-cols-2"
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
    </div>
  );
}
