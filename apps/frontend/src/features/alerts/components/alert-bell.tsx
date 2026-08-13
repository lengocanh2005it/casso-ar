import { Bell } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useAuth } from '@/contexts/auth-context';
import { useAlerts } from '../api/use-alerts';
import { AlertPanel } from './alert-panel';

export function AlertBell() {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const { data } = useAlerts(1, false, isOwner);
  const unreadCount = data?.unreadCount ?? 0;

  if (!isOwner) return null;

  const ariaLabel = `Thông báo${
    unreadCount > 0 ? `, ${unreadCount} chưa đọc` : ''
  }`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className="relative rounded-md p-1.5 hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <AlertPanel />
      </PopoverContent>
    </Popover>
  );
}
