import { Permission } from '@casso-ar/shared-types';
import { Bell } from 'lucide-react';
import { EmptyState } from '@/components/layout/empty-state';
import { InitialsAvatar } from '@/components/shared/initials-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/contexts/auth-context';
import { formatDateTime } from '@/lib/format';
import { hasPermission } from '@/lib/rbac';
import { useUpdateReminderPolicy } from '../api/use-reminders';
import type { ReminderPolicy } from '../types';

const CUSTOMER_GROUP_LABELS: Record<string, string> = {
  VIP: 'Khách hàng VIP',
  REGULAR: 'Thông thường',
};

function customerGroupLabel(customerGroup: string): string {
  return CUSTOMER_GROUP_LABELS[customerGroup] ?? 'Nhóm khách hàng khác';
}

// Below md each row becomes a 3-column card (group | status | action) so the
// queue matches the receivables and exceptions tables instead of scrolling a
// 6-column grid sideways on a phone. "Số quy tắc", "Ngưỡng leo thang" and
// "Ngày tạo" fold into the details column as secondary lines.
const MOBILE_ROW =
  'max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-center max-md:gap-x-3 max-md:gap-y-1.5 max-md:px-1 max-md:py-3';

export function PolicyTable({
  policies,
  onEdit,
}: {
  policies: ReminderPolicy[];
  onEdit?: (policy: ReminderPolicy) => void;
}) {
  const { user } = useAuth();
  const canWrite = hasPermission(
    user?.role ?? null,
    Permission.REMINDER_POLICY_WRITE,
  );
  const update = useUpdateReminderPolicy();

  if (policies.length === 0) {
    return (
      <EmptyState
        icon={Bell}
        title="Chưa có chính sách nhắc"
        description="Tạo chính sách để tự động gửi email nhắc thanh toán."
        density="compact"
      />
    );
  }

  return (
    <Table>
      <TableHeader className="max-md:hidden">
        <TableRow>
          <TableHead>Nhóm khách hàng</TableHead>
          <TableHead>Trạng thái</TableHead>
          <TableHead>Số quy tắc</TableHead>
          <TableHead>Ngưỡng leo thang</TableHead>
          <TableHead>Ngày tạo</TableHead>
          {canWrite && <TableHead>Thao tác</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {policies.map((policy) => (
          <TableRow key={policy.id} className={MOBILE_ROW}>
            <TableCell className="max-w-64 font-medium max-md:col-start-1 max-md:max-w-none max-md:p-0">
              <div className="flex items-center gap-2">
                <InitialsAvatar
                  name={customerGroupLabel(policy.customerGroup)}
                  size="sm"
                  className="max-md:hidden"
                />
                <div className="min-w-0 space-y-1">
                  <p className="min-w-0 font-medium">
                    {customerGroupLabel(policy.customerGroup)}
                  </p>
                  {/* Folded in from columns that do not fit a phone: counts and
                      the escalation window are what tell two otherwise
                      identical "4 rules / 30 days" rows apart. */}
                  <p className="text-xs text-muted-foreground max-md:whitespace-nowrap">
                    {policy.rules.length} quy tắc · leo thang{' '}
                    {policy.escalationThresholdDays === null
                      ? '—'
                      : `${policy.escalationThresholdDays} ngày`}
                  </p>
                  <p className="hidden text-xs text-muted-foreground max-md:block max-md:whitespace-nowrap">
                    Tạo {formatDateTime(policy.createdAt)}
                  </p>
                </div>
              </div>
            </TableCell>
            <TableCell className="max-md:col-start-2 max-md:row-start-1 max-md:justify-self-end max-md:p-0">
              {canWrite ? (
                // The switch is the state; the text beside it just names it.
                <div className="flex items-center gap-2 max-md:flex-col-reverse max-md:items-end">
                  <Switch
                    aria-label={`Bật chính sách ${customerGroupLabel(policy.customerGroup)}`}
                    checked={policy.isActive}
                    disabled={update.isPending}
                    onCheckedChange={() =>
                      update.mutate({
                        id: policy.id,
                        input: {
                          customerGroup: policy.customerGroup,
                          isActive: !policy.isActive,
                          escalationThresholdDays:
                            policy.escalationThresholdDays ?? undefined,
                          rules: policy.rules,
                        },
                      })
                    }
                  />
                  <span
                    className={
                      policy.isActive
                        ? 'text-sm font-medium whitespace-nowrap text-success'
                        : 'text-sm whitespace-nowrap text-muted-foreground'
                    }
                  >
                    {policy.isActive ? 'Đang hoạt động' : 'Đã tắt'}
                  </span>
                </div>
              ) : (
                <Badge
                  className={
                    policy.isActive
                      ? 'bg-success/10 text-success'
                      : 'bg-muted text-muted-foreground'
                  }
                >
                  {policy.isActive ? 'Đang hoạt động' : 'Đã tắt'}
                </Badge>
              )}
            </TableCell>
            <TableCell className="max-md:hidden">
              {policy.rules.length}
            </TableCell>
            <TableCell className="max-md:hidden">
              {policy.escalationThresholdDays === null
                ? '—'
                : `${policy.escalationThresholdDays} ngày`}
            </TableCell>
            <TableCell className="max-md:hidden">
              {formatDateTime(policy.createdAt)}
            </TableCell>
            {canWrite && (
              <TableCell className="max-md:col-start-2 max-md:row-start-2 max-md:justify-self-end max-md:p-0">
                {onEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(policy)}
                    className="max-md:h-auto max-md:px-0"
                  >
                    Sửa
                  </Button>
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
