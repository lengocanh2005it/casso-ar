import { Permission } from '@casso-ledger/shared-types';
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
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Chưa có chính sách nhắc.
      </p>
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
              {policy.customerGroup}
            </TableCell>
            <TableCell>
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
              ) : (
                <span>{policy.isActive ? 'Có' : 'Không'}</span>
              )}
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
