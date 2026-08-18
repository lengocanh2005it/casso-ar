import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { ProfileDialog } from './profile-dialog';

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  if (!user) return null;

  if (collapsed) {
    return (
      <>
        <div className="border-t border-sidebar-border px-2 py-3">
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="flex w-full items-center justify-center rounded-md p-1.5 transition-[background-color] duration-150 ease-out motion-reduce:transition-none pointer-hover:hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            aria-label="Xem thông tin tài khoản"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
              {getInitials(user.name)}
            </div>
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
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
            {getInitials(user.name)}
          </div>
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
