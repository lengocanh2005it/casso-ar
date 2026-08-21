import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { InitialsAvatar } from '@/components/shared/initials-avatar';
import { useAuth } from '@/contexts/auth-context';
import { ProfileDialog } from './profile-dialog';

export function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  if (!user) return null;

  if (collapsed) {
    return (
      <>
        <div className="flex flex-col items-center gap-2 border-t border-sidebar-border px-2 py-3">
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="flex w-full items-center justify-center rounded-md p-1.5 transition-[background-color] duration-150 ease-out motion-reduce:transition-none pointer-hover:hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            aria-label="Xem thông tin tài khoản"
          >
            <InitialsAvatar
              name={user.name}
              avatarUrl={user.avatarUrl}
              size="sm"
            />
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex w-full items-center justify-center rounded-md p-1.5 transition-[background-color,color] duration-150 ease-out motion-reduce:transition-none pointer-hover:hover:bg-destructive/5 pointer-hover:hover:text-destructive focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            aria-label="Đăng xuất"
          >
            <LogOut className="size-4" />
          </button>
        </div>
        <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
      </>
    );
  }

  return (
    <>
      <div className="space-y-2 border-t border-sidebar-border px-4 py-3">
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="flex w-full items-center gap-3 rounded-md text-left transition-[background-color] duration-150 ease-out motion-reduce:transition-none pointer-hover:hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label="Xem thông tin tài khoản"
        >
          <InitialsAvatar
            name={user.name}
            avatarUrl={user.avatarUrl}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {user.email}
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => void logout()}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-[background-color,color] duration-150 ease-out motion-reduce:transition-none pointer-hover:hover:bg-destructive/5 pointer-hover:hover:text-destructive focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <LogOut className="size-4" />
          Đăng xuất
        </button>
      </div>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}
