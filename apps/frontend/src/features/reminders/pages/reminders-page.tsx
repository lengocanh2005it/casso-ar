import { Permission } from '@casso-ledger/shared-types';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">TỰ ĐỘNG HÓA</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Lịch nhắc
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quản lý chính sách và theo dõi các email nhắc thanh toán.
          </p>
        </div>
        {canWrite && <Button onClick={openCreate}>Tạo chính sách</Button>}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Chính sách nhắc</h2>
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
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Lịch sử thực thi</h2>
          <p className="text-sm text-muted-foreground">
            Tra cứu các lần gửi hoặc bỏ qua email nhắc.
          </p>
        </div>
        <Input
          name="receivableId"
          autoComplete="off"
          aria-label="Lọc theo mã khoản phải thu"
          placeholder="Lọc theo mã khoản phải thu…"
          value={receivableId}
          onChange={(event) => setParam('receivableId', event.target.value)}
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
      </section>

      <PolicyDialog
        policy={editingPolicy}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
