import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { AlertBell } from '@/features/alerts/components/alert-bell';
import { ThemeToggle } from './theme-toggle';

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function getPlanLabel(plan: string): string {
  return plan.charAt(0) + plan.slice(1).toLowerCase();
}

export function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    toast.success('Đã đăng xuất.');
    navigate('/login');
  }

  if (!user) return null;

  const logoutButton = (
    <button
      type="button"
      aria-label="Đăng xuất"
      onClick={() => void handleLogout()}
      className="shrink-0 rounded-md p-1.5 transition-[background-color,transform] duration-150 ease-out motion-reduce:transition-none motion-reduce:active:scale-100 pointer-hover:hover:bg-sidebar-accent active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <LogOut aria-hidden="true" className="size-4" />
    </button>
  );

  if (collapsed) {
    return (
      <div className="flex items-center gap-3 border-t border-sidebar-border px-4 py-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
          {getInitials(user.name)}
        </div>
        <AlertBell />
        <ThemeToggle />
        {logoutButton}
      </div>
    );
  }

  return (
    <div className="space-y-2 border-t border-sidebar-border px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
          {getInitials(user.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {user.organizationName} · {getPlanLabel(user.subscriptionPlan)} ·{' '}
          {user.role}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <AlertBell />
          <ThemeToggle />
          {logoutButton}
        </div>
      </div>
    </div>
  );
}
