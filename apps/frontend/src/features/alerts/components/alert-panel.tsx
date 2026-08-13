import { BellOff, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
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
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useAlerts,
  useDeleteAlert,
  useDeleteAllAlerts,
  useMarkAlertRead,
  useMarkAllAlertsRead,
} from '../api/use-alerts';
import { alertMessage } from '../lib/alert-message';
import { alertRoute } from '../lib/alert-route';
import { formatRelativeTime } from '../lib/format-relative-time';
import type { AlertDto } from '../types';

function AlertRow({ alert }: { alert: AlertDto }) {
  const navigate = useNavigate();
  const markRead = useMarkAlertRead();
  const deleteAlert = useDeleteAlert();

  function handleRowClick() {
    if (!alert.isRead) markRead.mutate(alert.id);
    const route = alertRoute(alert.entityType);
    if (route) {
      navigate(route);
    } else {
      toast.error('Không tìm thấy trang cho thông báo này.');
    }
  }

  return (
    <div className="flex items-start gap-1">
      <button
        type="button"
        onClick={handleRowClick}
        className={cn(
          'flex min-w-0 flex-1 animate-banner-in items-start gap-2 rounded-md p-3 text-left text-sm hover:bg-accent',
          !alert.isRead && 'bg-primary/5',
        )}
      >
        {!alert.isRead && (
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
        )}
        <span className={cn('min-w-0 flex-1', alert.isRead && 'ml-4')}>
          <span
            className={cn(
              'block',
              !alert.isRead ? 'font-medium' : 'text-muted-foreground',
            )}
          >
            {alertMessage(alert.type)}
          </span>
          <span className="block text-xs text-muted-foreground">
            {formatRelativeTime(alert.createdAt)}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label="Xoá thông báo"
        onClick={(event) => {
          event.stopPropagation();
          deleteAlert.mutate(alert.id);
        }}
        className="mt-2 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function AlertPanel() {
  const [page] = useState(1);
  const { data, isLoading } = useAlerts(page, false);
  const markAllRead = useMarkAllAlertsRead();
  const deleteAllAlerts = useDeleteAllAlerts();

  const unreadCount = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  return (
    <div className="flex max-h-[28rem] flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">Thông báo</span>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            className="text-xs font-medium text-primary hover:underline"
          >
            Đánh dấu đã đọc tất cả
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-1">
        {isLoading ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <BellOff className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Không có thông báo mới.
            </p>
          </div>
        ) : (
          items.map((alert) => <AlertRow key={alert.id} alert={alert} />)
        )}
      </div>

      {items.length > 0 && (
        <div className="border-t border-border p-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="w-full rounded-md p-1.5 text-center text-xs font-medium text-destructive hover:bg-destructive/10"
              >
                Xoá tất cả
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Xoá tất cả thông báo?</AlertDialogTitle>
                <AlertDialogDescription>
                  Hành động này không thể hoàn tác. Toàn bộ thông báo sẽ bị xoá
                  vĩnh viễn.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Huỷ</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteAllAlerts.mutate()}>
                  Xoá tất cả
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
