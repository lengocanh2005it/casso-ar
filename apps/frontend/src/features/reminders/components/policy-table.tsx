import { Permission } from '@casso-ledger/shared-types';
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
import { formatDate } from '@/lib/format';
import { hasPermission } from '@/lib/rbac';
import { useUpdateReminderPolicy } from '../api/use-reminders';
import type { ReminderPolicy } from '../types';

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
      <TableHeader>
        <TableRow>
          <TableHead>Nhóm khách hàng</TableHead>
          <TableHead>Đang bật</TableHead>
          <TableHead>Số quy tắc</TableHead>
          <TableHead>Ngưỡng leo thang</TableHead>
          <TableHead>Ngày tạo</TableHead>
          {canWrite && <TableHead>Thao tác</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {policies.map((policy) => (
          <TableRow key={policy.id}>
            <TableCell className="font-medium">
              <div className="flex items-center gap-2">
                <InitialsAvatar name={policy.customerGroup} size="sm" />
                {policy.customerGroup}
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={policy.isActive ? 'default' : 'secondary'}
                  className={
                    policy.isActive
                      ? 'bg-success text-success-foreground'
                      : undefined
                  }
                >
                  {policy.isActive ? 'Đang hoạt động' : 'Đã tắt'}
                </Badge>
                {canWrite ? (
                  <Switch
                    aria-label={`Bật chính sách ${policy.customerGroup}`}
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
                ) : null}
              </div>
            </TableCell>
            <TableCell>{policy.rules.length}</TableCell>
            <TableCell>
              {policy.escalationThresholdDays === null
                ? '—'
                : `${policy.escalationThresholdDays} ngày`}
            </TableCell>
            <TableCell>{formatDate(policy.createdAt)}</TableCell>
            {canWrite && (
              <TableCell>
                {onEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(policy)}
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
