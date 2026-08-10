import { Permission } from '@casso-ledger/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
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

  if (isPending) return <p>Loading…</p>;
  if (isError) {
    return <p className="text-destructive">Unable to load tasks.</p>;
  }

  const canManage = hasPermission(
    user?.role ?? null,
    Permission.INTERNAL_TASK_MANAGE,
  );

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
            aria-label="Task title"
            placeholder="Task title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Button
            type="submit"
            disabled={createMutation.isPending || !title.trim()}
          >
            Add task
          </Button>
        </form>
      )}
      {!data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks.</p>
      ) : (
        <ul className="space-y-3">
          {data.map((task) => (
            <li
              key={task.id}
              className="flex items-center justify-between gap-4 rounded-lg border p-4"
            >
              <div>
                <p className="font-medium">{task.title}</p>
                <p className="text-sm text-muted-foreground">
                  {task.status}
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
                    Complete
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={dismissMutation.isPending}
                    onClick={() => dismissMutation.mutate(task.id)}
                  >
                    Dismiss
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
