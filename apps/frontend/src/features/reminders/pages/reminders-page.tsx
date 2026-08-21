import { Permission } from '@casso-ledger/shared-types';
import { Bell, History } from 'lucide-react';
import { useState } from 'react';
import { PageHeading } from '@/components/layout/page-heading';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/auth-context';
import { hasPermission } from '@/lib/rbac';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import {
  useReminderExecutions,
  useReminderPolicies,
} from '../api/use-reminders';
import { ExecutionsTable } from '../components/executions-table';
import { PolicyDialog } from '../components/policy-dialog';
import { PolicyTable } from '../components/policy-table';
import type { ReminderPolicy } from '../types';

export function RemindersPage() {
  const { user } = useAuth();
  const { searchParams, setParam } = useUrlQueryParams();
  const receivableId = searchParams.get('receivableId') ?? '';
  const [editingPolicy, setEditingPolicy] = useState<ReminderPolicy | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const {
    data: policies,
    isPending: policiesPending,
    isError: policiesError,
  } = useReminderPolicies();
  const executionsQuery = useReminderExecutions({
    receivableId: receivableId.trim() || undefined,
    page: 1,
    limit: 20,
  });
  const canWrite = hasPermission(
    user?.role ?? null,
    Permission.REMINDER_POLICY_WRITE,
  );

  function openCreate() {
    setEditingPolicy(null);
    setDialogOpen(true);
  }

  function openEdit(policy: ReminderPolicy) {
    setEditingPolicy(policy);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="TỰ ĐỘNG HÓA"
        title="Lịch nhắc"
        description="Quản lý chính sách và theo dõi các email nhắc thanh toán."
        icon={Bell}
        actions={
          canWrite ? (
            <Button onClick={openCreate}>Tạo chính sách</Button>
          ) : undefined
        }
      />

      <Card className="animate-fade-up motion-reduce:animate-none">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="size-4 text-primary" />
            <CardTitle>Chính sách nhắc</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {policiesPending && (
            <p role="status" aria-live="polite">
              Đang tải chính sách…
            </p>
          )}
          {policiesError && (
            <p role="alert" aria-live="polite" className="text-destructive">
              Không thể tải chính sách nhắc.
            </p>
          )}
          {policies && <PolicyTable policies={policies} onEdit={openEdit} />}
        </CardContent>
      </Card>

      <Card className="animate-fade-up motion-reduce:animate-none [animation-delay:40ms]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <History className="size-4 text-primary" />
            <CardTitle>Lịch sử thực thi</CardTitle>
          </div>
          <CardDescription>
            Tra cứu các lần gửi hoặc bỏ qua email nhắc.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            name="receivableId"
            autoComplete="off"
            aria-label="Lọc theo mã khoản phải thu"
            placeholder="Lọc theo mã khoản phải thu…"
            value={receivableId}
            onChange={(event) =>
              setParam('receivableId', event.target.value, { replace: true })
            }
            className="max-w-sm"
          />
          {executionsQuery.isPending && (
            <p role="status" aria-live="polite">
              Đang tải lịch sử thực thi…
            </p>
          )}
          {executionsQuery.isError && (
            <p role="alert" aria-live="polite" className="text-destructive">
              Không thể tải lịch sử thực thi.
            </p>
          )}
          {executionsQuery.data && (
            <ExecutionsTable executions={executionsQuery.data.items} />
          )}
        </CardContent>
      </Card>

      <PolicyDialog
        policy={editingPolicy}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
