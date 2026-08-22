import { Permission } from '@casso-ledger/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListTodo } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/layout/empty-state';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/auth-context';
import { formatDate } from '@/lib/format';
import { hasPermission } from '@/lib/rbac';
import {
  createTask,
  dismissTask,
  fetchTasks,
  resolveTask,
} from '../api/receivables-api';
import type { InternalTaskStatus } from '../types';

const TASK_STATUS_LABELS: Record<InternalTaskStatus, string> = {
  OPEN: 'Đang mở',
  DONE: 'Hoàn thành',
  DISMISSED: 'Đã bỏ qua',
};

export function ReceivableTasks({ receivableId }: { receivableId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const { data, isPending, isError } = useQuery({
    queryKey: ['receivable-tasks', receivableId],
    queryFn: () => fetchTasks(receivableId),
  });
  const createMutation = useMutation({
    mutationFn: () => createTask(receivableId, { title }),
    onSuccess: () => {
      setTitle('');
      void queryClient.invalidateQueries({
        queryKey: ['receivable-tasks', receivableId],
      });
    },
  });
  const resolveMutation = useMutation({
    mutationFn: resolveTask,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['receivable-tasks', receivableId],
      }),
  });
  const dismissMutation = useMutation({
    mutationFn: dismissTask,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['receivable-tasks', receivableId],
      }),
  });

  if (isPending)
    return (
      <p role="status" aria-live="polite">
        Đang tải…
      </p>
    );
  if (isError) {
    return (
      <p role="alert" aria-live="polite" className="text-destructive">
        Không thể tải công việc.
      </p>
    );
  }

  const canManage = hasPermission(
    user?.role ?? null,
    Permission.INTERNAL_TASK_MANAGE,
  );
  const mutationError =
    createMutation.isError ||
    resolveMutation.isError ||
    dismissMutation.isError;

  return (
    <div className="space-y-4">
      {canManage && (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim()) createMutation.mutate();
          }}
        >
          <Input
            name="title"
            autoComplete="off"
            aria-label="Tiêu đề công việc"
            placeholder="Tiêu đề công việc…"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Button
            type="submit"
            disabled={createMutation.isPending || !title.trim()}
          >
            Thêm công việc
          </Button>
        </form>
      )}
      {mutationError && (
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          Không thể cập nhật công việc.
        </p>
      )}
      {!data || data.length === 0 ? (
        <EmptyState
          density="compact"
          icon={ListTodo}
          title="Chưa có công việc"
          description="Các việc cần theo dõi khoản phải thu sẽ hiển thị tại đây."
        />
      ) : (
        <ul className="space-y-3">
          {data.map((task) => (
            <li
              key={task.id}
              className="flex items-center justify-between gap-4 rounded-lg border p-4"
            >
              <div className="min-w-0">
                <p className="break-words font-medium">{task.title}</p>
                <p className="text-sm text-muted-foreground">
                  {TASK_STATUS_LABELS[task.status]}
                  {task.dueDate ? ` · ${formatDate(task.dueDate)}` : ''}
                </p>
              </div>
              {canManage && task.status === 'OPEN' && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={resolveMutation.isPending}
                    onClick={() => resolveMutation.mutate(task.id)}
                  >
                    Hoàn thành
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={dismissMutation.isPending}
                      >
                        Bỏ qua
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Bỏ qua công việc này?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Công việc sẽ được đánh dấu là đã bỏ qua.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Hủy</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => dismissMutation.mutate(task.id)}
                        >
                          Xác nhận bỏ qua
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
