import { BellOff, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
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
  const markRead = useMarkAlertRead();
  const deleteAlert = useDeleteAlert();
  const route = alertRoute(alert.entityType);

  function handleRowClick() {
    if (!alert.isRead) markRead.mutate(alert.id);
    if (!route) {
      toast.error('Không tìm thấy trang cho thông báo này.');
    }
  }

  const rowClassName = cn(
    'flex min-w-0 flex-1 motion-safe:animate-banner-in items-start gap-2 rounded-md p-3 text-left text-sm transition-[background-color,transform] duration-150 ease-out pointer-hover:hover:bg-accent active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    !alert.isRead && 'bg-primary/5',
  );
  const rowContent = (
    <>
      {!alert.isRead && (
        <span
          aria-hidden="true"
          className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
        />
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
    </>
  );

  return (
    <div className="flex items-start gap-1">
      {route ? (
        <Link to={route} onClick={handleRowClick} className={rowClassName}>
          {rowContent}
        </Link>
      ) : (
        <button type="button" onClick={handleRowClick} className={rowClassName}>
          {rowContent}
        </button>
      )}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            type="button"
            aria-label={`Xoá thông báo: ${alertMessage(alert.type)}`}
            onClick={(event) => event.stopPropagation()}
            className="mt-2 shrink-0 rounded-md p-1 text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out pointer-hover:hover:bg-muted pointer-hover:hover:text-foreground active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá thông báo này?</AlertDialogTitle>
            <AlertDialogDescription>
              {alertMessage(alert.type)}. Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteAlert.mutate(alert.id)}>
              Xoá thông báo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
            className="rounded-sm text-xs font-medium text-primary transition-[color,transform] duration-150 ease-out pointer-hover:hover:underline active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            <BellOff
              aria-hidden="true"
              className="size-8 text-muted-foreground"
            />
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
                className="w-full rounded-md p-1.5 text-center text-xs font-medium text-destructive transition-[background-color,transform] duration-150 ease-out pointer-hover:hover:bg-destructive/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
