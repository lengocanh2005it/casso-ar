import { Permission } from '@casso-ar/shared-types';
import { Bell, History } from 'lucide-react';
import { useState } from 'react';
import { PageHeading } from '@/components/layout/page-heading';
import { SectionCard } from '@/components/layout/section-card';
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

      <SectionCard
        icon={Bell}
        title="Chính sách nhắc"
        description="Tự động gửi email theo nhóm khách hàng và thời hạn thanh toán."
        className="border-success/30"
      >
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
      </SectionCard>

      <SectionCard
        icon={History}
        title="Lịch sử thực thi"
        description="Tra cứu các lần gửi hoặc bỏ qua email nhắc."
        className="border-info/30 [animation-delay:40ms]"
      >
        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/20 p-3">
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
          </div>
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
        </div>
      </SectionCard>

      <PolicyDialog
        policy={editingPolicy}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
