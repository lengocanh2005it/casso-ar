import { Building2, Clock, Lock, ShieldCheck } from 'lucide-react';
import { MetricCard } from '@/components/metric-card';
import type { OrganizationListItem } from '../api/admin-api';
import { useAdminOrganizationStatus } from '../api/use-admin';

const numberFormatter = new Intl.NumberFormat('vi-VN');

type OrganizationStatus = OrganizationListItem['status'];

export function AdminOrganizationSummaryCards() {
  const organizationQuery = useAdminOrganizationStatus();
  const total = organizationQuery.data?.total ?? null;
  const organizations = organizationQuery.data?.items ?? null;
  const countByStatus = (status: OrganizationStatus) =>
    organizations
      ? organizations.filter((org) => org.status === status).length
      : null;
  const locked = countByStatus('LOCKED');
  const pending = countByStatus('PENDING_REVIEW');
  const active = countByStatus('ACTIVE');

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
